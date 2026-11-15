import { createHash } from "node:crypto";
import { closeSync, constants, lstatSync, openSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, basename } from "node:path";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { ARTIFACT_TYPES, CompositionResult, MelodyService } from "./melody_service.js";
import { database_url_from_environment, is_storage_error, parse_seed_json, PostgresConnection, REQUIRED_TABLES, SqliteConnection, transaction, validate_postgres_store, type Connection } from "./persistence.js";
import { StorageAccessDenied, StorageConflict, WebStorage } from "./web_storage.js";

export const WEB_TABLE_COLUMNS: Record<string, readonly string[]> = {
  runs: ["run_id", "owner", "mode", "brief_ids_json", "status", "created_at"],
  paid_attempts: ["attempt_id", "run_id", "owner", "brief_ids_json", "per_brief_estimates_json", "estimated_cost_usd", "submitted_characters", "status", "evidence_json", "created_at", "actual_cost_usd", "reconciliation_reference", "reconciled_at"],
  outputs: ["output_id", "run_id", "owner", "brief_id", "variant", "audio_filename", "manifest_json", "created_at"],
  evaluations: ["output_id", "owner", "brand_transcription", "cta_transcription", "self_rating", "brand_match", "cta_match", "created_at"],
  application_identity: ["singleton", "issuer"],
  application_users: ["issuer", "subject", "enabled", "admin", "paid_speech", "created_at"],
};
export const MELODY_TABLE_COLUMNS: Record<string, readonly string[]> = {
  render_jobs: ["job_id", "logical_job_id", "request_json", "result_json", "melodies_json", "status", "created_at"],
  local_outputs: ["output_id", "melodies_json"],
};
export const WEB_IMPORT_ORDER = Object.keys(WEB_TABLE_COLUMNS);
export const MELODY_IMPORT_ORDER = Object.keys(MELODY_TABLE_COLUMNS);
export const JSON_COLUMN_TYPES: [string, string, "array" | "object"][] = [
  ["runs", "brief_ids_json", "array"], ["paid_attempts", "brief_ids_json", "array"],
  ["paid_attempts", "per_brief_estimates_json", "object"], ["paid_attempts", "evidence_json", "object"],
  ["outputs", "manifest_json", "object"], ["render_jobs", "request_json", "object"],
  ["render_jobs", "result_json", "object"], ["render_jobs", "melodies_json", "object"], ["local_outputs", "melodies_json", "object"],
];
/** The caller owns the returned release function; the lock interoperates with Python flock writers. */
export function acquire_writer_lock(root: string): () => void {
  const descriptor = openSync(join(root, ".earwyrm-writer.lock"), constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW, 0o600);
  const result = spawnSync("flock", ["-xn", "3"], { stdio: ["ignore", "pipe", "pipe", descriptor] });
  if (result.error || result.status !== 0) {
    closeSync(descriptor);
    if (result.error) throw result.error;
    throw Object.assign(new Error("Persistent storage already has an active writer"), { code: "EWOULDBLOCK" });
  }
  let released = false;
  return () => { if (!released) { released = true; closeSync(descriptor); } };
}
function require_root(root: string): string {
  if (!isAbsolute(root)) throw new TypeError("An existing absolute data directory is required");
  try {
    if (!statSync(root).isDirectory()) throw new TypeError("An existing absolute data directory is required");
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
    throw new TypeError("An existing absolute data directory is required");
  }
  return realpathSync(root);
}
async function require_empty_target(c: Connection): Promise<void> {
  const rows = (await c.execute(`SELECT 1 FROM pg_catalog.pg_class WHERE relnamespace = current_schema()::regnamespace
    UNION ALL SELECT 1 FROM pg_catalog.pg_proc WHERE pronamespace = current_schema()::regnamespace
    UNION ALL SELECT 1 FROM pg_catalog.pg_type WHERE typnamespace = current_schema()::regnamespace LIMIT 1`)).rows;
  if (rows.length) throw new TypeError("PostgreSQL import requires an empty target schema");
}
async function write_marker(c: Connection): Promise<void> {
  await c.execute("CREATE TABLE earwyrm_store_metadata (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), schema_version INTEGER NOT NULL)");
  await c.execute("INSERT INTO earwyrm_store_metadata VALUES (1, 1)");
}
/** Explicitly creates both PostgreSQL schemas and writes their marker last, or rolls everything back. */
export async function initialize_fresh(directory: string, database_url: string): Promise<void> {
  const root = require_root(directory), release = acquire_writer_lock(root);
  try {
    if (readdirSync(root).some(name => name !== ".earwyrm-writer.lock")) throw new TypeError("Fresh initialization requires an empty data directory");
    await transaction(new PostgresConnection(database_url, 0x4557524d01), async c => {
      try { await require_empty_target(c); }
      catch (error) {
        if (!(error instanceof TypeError)) throw error;
        throw new TypeError("Fresh initialization requires an empty target schema", { cause: error });
      }
      await WebStorage._create_schema(c);
      await MelodyService._create_schema(c);
      const count = (await c.execute(`SELECT count(*) AS table_count FROM pg_catalog.pg_class
        WHERE relnamespace = current_schema()::regnamespace AND relkind IN ('r', 'p')
        AND relname IN (${REQUIRED_TABLES.map(() => "?").join(",")})`, REQUIRED_TABLES)).rows[0];
      if (Number(count?.table_count) !== 8) throw new Error("New PostgreSQL store schema is incomplete");
      await write_marker(c);
    });
  } finally { release(); }
  await validate_postgres_store(database_url);
}
async function validate_source(c: Connection, columns: Record<string, readonly string[]>, optional = new Set<string>()): Promise<Set<string>> {
  const integrity = (await c.execute("PRAGMA integrity_check")).rows;
  if (integrity.length !== 1 || Object.values(integrity[0]!)[0] !== "ok") throw new TypeError("SQLite source failed its integrity check");
  if ((await c.execute("PRAGMA foreign_key_check")).rows.length) throw new TypeError("SQLite source has broken foreign-key relationships");
  const journal = (await c.execute("PRAGMA journal_mode")).rows[0];
  if (!["delete", "truncate", "persist"].includes(String(journal && Object.values(journal)[0]))) throw new TypeError("SQLite source uses an unsupported journal mode");
  const names = new Set((await c.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")).rows.map(r => String(r.name)));
  if (Object.keys(columns).some(name => !optional.has(name) && !names.has(name))) throw new TypeError("SQLite source is missing a required table");
  const optionalCount = [...optional].filter(name => names.has(name)).length;
  if (optionalCount && optionalCount !== optional.size) throw new TypeError("SQLite source has an incomplete authorization schema");
  if ([...names].some(name => !Object.hasOwn(columns, name))) throw new TypeError("SQLite source contains unsupported tables");
  for (const table of names) {
    const actual = (await c.execute(`PRAGMA table_info(${table})`)).rows.map(r => r.name);
    if (JSON.stringify(actual) !== JSON.stringify(columns[table])) throw new TypeError("SQLite source has an unsupported table schema");
  }
  for (const [table, column, kind] of JSON_COLUMN_TYPES) {
    if (!names.has(table)) continue;
    for (const row of (await c.execute(`SELECT ${column} FROM ${table}`)).rows) {
      let value: unknown;
      try { value = JSON.parse(String(row[column])); }
      catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        throw new TypeError("SQLite source contains invalid JSON data", { cause: error });
      }
      if (kind === "array" ? !Array.isArray(value) : value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError("SQLite source contains JSON with an invalid shape");
    }
  }
  return names;
}
function safe_file(path: string, ancestors: readonly string[]): void {
  if (ancestors.some(parent => lstatSync(parent).isSymbolicLink()) || lstatSync(path).isSymbolicLink() || !lstatSync(path).isFile()) throw new TypeError("SQLite source references missing or unsafe media");
}
async function validate_web(c: Connection, root: string, tables: Set<string>): Promise<void> {
  if ((await c.execute(`SELECT 1 FROM paid_attempts AS attempt JOIN runs ON runs.run_id = attempt.run_id WHERE runs.owner != attempt.owner
    UNION ALL SELECT 1 FROM outputs JOIN runs ON runs.run_id = outputs.run_id WHERE runs.owner != outputs.owner
    UNION ALL SELECT 1 FROM evaluations JOIN outputs ON outputs.output_id = evaluations.output_id WHERE outputs.owner != evaluations.owner LIMIT 1`)).rows.length) throw new TypeError("SQLite source contains inconsistent record ownership");
  for (const row of (await c.execute("SELECT output_id, brief_id, variant, audio_filename, manifest_json FROM outputs")).rows) {
    const filename = row.audio_filename;
    if (typeof filename !== "string" || basename(filename) !== filename || /[/\\]/.test(filename) || !filename.endsWith(".wav")) throw new TypeError("SQLite output references an invalid audio filename");
    const manifest = JSON.parse(String(row.manifest_json)) as Record<string, unknown>;
    if (manifest.output_id !== row.output_id || manifest.file !== filename || manifest.brief_id !== row.brief_id || manifest.variant !== row.variant) throw new TypeError("SQLite output manifest does not match its record");
    safe_file(join(root, "audio", filename), [join(root, "audio")]);
  }
  if (tables.has("application_identity")) {
    const identity = (await c.execute("SELECT singleton, issuer FROM application_identity")).rows;
    if (identity.some(row => row.singleton !== 1 || !row.issuer)) throw new TypeError("SQLite source contains an invalid application identity");
    const users = (await c.execute("SELECT enabled, admin, paid_speech FROM application_users")).rows;
    if (users.some(row => Object.values(row).some(value => value !== 0 && value !== 1))) throw new TypeError("SQLite source contains invalid user permissions");
    if (!identity.length && users.length) throw new TypeError("SQLite users have no application identity");
  }
}
async function validate_melody(c: Connection, root: string): Promise<void> {
  for (const row of (await c.execute("SELECT job_id, logical_job_id, request_json, result_json FROM render_jobs")).rows) {
    if (!z.uuid().safeParse(row.job_id).success) throw new TypeError("SQLite melody job has an invalid ID");
    const job_id = String(row.job_id).toLowerCase();
    const request = parse_seed_json(String(row.request_json)) as Record<string, unknown>;
    const rawResult = parse_seed_json(String(row.result_json)) as Record<string, unknown>;
    const parsed = CompositionResult.safeParse(rawResult);
    if (!parsed.success) throw new TypeError("SQLite melody job has an invalid result", { cause: parsed.error });
    const result = parsed.data;
    if (request.logical_job_id !== row.logical_job_id || result.job_id !== job_id || result.logical_job_id !== row.logical_job_id || Object.keys(result.artifacts).sort().join() !== Object.keys(ARTIFACT_TYPES).sort().join()) throw new TypeError("SQLite melody job has inconsistent result metadata");
    const melody = join(root, "melody"), artifacts = join(melody, "artifacts"), directory = join(artifacts, job_id);
    for (const name of Object.keys(ARTIFACT_TYPES)) {
      const artifact = result.artifacts[name]!, path = join(directory, name);
      safe_file(path, [melody, artifacts, directory]);
      if (artifact.uri !== `earwyrm://jobs/${job_id}/${name}` || createHash("sha256").update(readFileSync(path)).digest("hex") !== artifact.sha256) throw new TypeError("SQLite melody job references missing or invalid media");
    }
  }
}
/** Copies a validated table using explicit columns; the caller owns the target transaction. */
export async function _copy_sqlite_table(source: Connection, target: Connection, table: string, columns: readonly string[]): Promise<number> {
  const supported = WEB_TABLE_COLUMNS[table] ?? MELODY_TABLE_COLUMNS[table];
  if (!supported || JSON.stringify(columns) !== JSON.stringify(supported)) throw new TypeError("Unsupported import table");
  const names = columns.join(", "), sql = `INSERT INTO ${table} (${names}) VALUES (${columns.map(() => "?").join(", ")})`;
  let count = 0;
  // Iterate SQLite statements directly to avoid retaining an entire historical table.
  if (!(source instanceof SqliteConnection)) throw new TypeError("Import source must be SQLite");
  for (const row of source.database.prepare(`SELECT ${names} FROM ${table}`).iterate()) {
    await target.execute(sql, columns.map(column => row[column]!));
    count++;
  }
  return count;
}
/** Imports only validated SQLite records into an empty PostgreSQL schema, preserving every source byte. */
export async function import_sqlite(directory: string, database_url: string): Promise<Record<string, number>> {
  const root = require_root(directory);
  const marker = join(root, ".earwyrm-initialized");
  safe_file(marker, []);
  const webPath = join(root, "earwyrm.sqlite3"), melodyPath = join(root, "melody", "melody.sqlite3");
  safe_file(webPath, []);
  safe_file(melodyPath, [join(root, "melody")]);
  const release = acquire_writer_lock(root);
  let web: SqliteConnection | undefined, melody: SqliteConnection | undefined;
  try {
    web = new SqliteConnection(webPath, true);
    melody = new SqliteConnection(melodyPath, true);
    const webTables = await validate_source(web, WEB_TABLE_COLUMNS, new Set(["application_identity", "application_users"]));
    await validate_source(melody, MELODY_TABLE_COLUMNS);
    await validate_web(web, root, webTables);
    await validate_melody(melody, root);
    const counts: Record<string, number> = {};
    const sources = [[web, WEB_TABLE_COLUMNS, webTables], [melody, MELODY_TABLE_COLUMNS, new Set(MELODY_IMPORT_ORDER)]] as const;
    await transaction(new PostgresConnection(database_url, 0x4557524d01), async target => {
      await require_empty_target(target);
      await WebStorage._create_schema(target);
      await MelodyService._create_schema(target);
      for (const [source, columns, tables] of sources) for (const table of Object.keys(columns)) {
        if (tables.has(table)) counts[table] = await _copy_sqlite_table(source, target, table, columns[table]!);
      }
      for (const [table, count] of Object.entries(counts)) {
        if (Number((await target.execute(`SELECT count(*) AS row_count FROM ${table}`)).rows[0]?.row_count) !== count) throw new Error("PostgreSQL import row count verification failed");
      }
      await write_marker(target);
    });
    await validate_postgres_store(database_url);
    return counts;
  } finally {
    try { await web?.close(); } finally { try { await melody?.close(); } finally { release(); } }
  }
}
/** Parses the original operator commands without executing any database operation. */
export function create_parser(args: string[] = process.argv.slice(2)): ReturnType<typeof parseArgs> {
  return parseArgs({ args, allowPositionals: true, strict: true, options: {
    help: { type: "boolean", short: "h" },
    "data-dir": { type: "string" }, issuer: { type: "string" }, subject: { type: "string" },
    enabled: { type: "string" }, admin: { type: "string" }, "paid-speech": { type: "string" },
  } });
}
/** Runs an explicit operator command; returns 0 success, 2 invalid access/configuration, or 1 storage failure. */
export async function main(args: string[] = process.argv.slice(2), environment: Readonly<Record<string, string | undefined>> = process.env): Promise<number> {
  try {
    const parsed = create_parser(args);
    const command = parsed.positionals[0], values = parsed.values;
    if (values.help) {
      console.log("Usage: database [--data-dir DATA_DIR] {initialize-fresh,import-sqlite,bootstrap-owner,set-user,list-users}\nbootstrap-owner: --issuer ISSUER --subject SUBJECT\nset-user: --issuer ISSUER --subject SUBJECT --enabled {yes,no} --admin {yes,no} --paid-speech {yes,no}");
      return 0;
    }
    if (parsed.positionals.length !== 1 || !["initialize-fresh", "import-sqlite", "bootstrap-owner", "set-user", "list-users"].includes(command ?? "")) throw new TypeError("A valid operator command is required");
    const value = (key: string): string | undefined => typeof values[key] === "string" ? values[key] as string : undefined;
    const identity_command = command === "bootstrap-owner" || command === "set-user";
    const permitted = new Set(["data-dir", ...(identity_command ? ["issuer", "subject"] : []), ...(command === "set-user" ? ["enabled", "admin", "paid-speech"] : [])]);
    if (Object.keys(values).some(key => !permitted.has(key))) throw new TypeError("Unrecognized arguments for this operator command");
    if (identity_command && (!value("issuer") || !value("subject"))) throw new TypeError("Issuer and subject are required");
    if (command === "set-user" && ["enabled", "admin", "paid-speech"].some(key => !["yes", "no"].includes(value(key) ?? ""))) throw new TypeError("enabled, admin and paid-speech must each be yes or no");
    const selectedRoot = value("data-dir") ?? environment.EARWYRM_DATA_DIR;
    if (!selectedRoot) throw new TypeError("An existing absolute data directory is required");
    const root = require_root(selectedRoot);
    const database_url = database_url_from_environment(environment);
    if (command === "initialize-fresh" || command === "import-sqlite") {
      if (!database_url) throw new TypeError(command === "initialize-fresh" ? "Fresh initialization requires PostgreSQL" : "SQLite import requires PostgreSQL");
      if (command === "initialize-fresh") { await initialize_fresh(root, database_url); console.log("PostgreSQL store initialized"); }
      else console.log(`SQLite records imported to PostgreSQL: ${JSON.stringify(await import_sqlite(root, database_url))}`);
      return 0;
    }
    if (database_url) await validate_postgres_store(database_url);
    else safe_file(join(root, "earwyrm.sqlite3"), []);
    const store = new WebStorage(root, { database_url });
    if (command === "list-users") { console.log(JSON.stringify(await store.list_users())); return 0; }
    const issuer = value("issuer"), subject = value("subject");
    const expected = environment.ENTRA_EXPECTED_ISSUER?.trim();
    if (!issuer || !subject) throw new TypeError("Issuer and subject are required");
    if (!expected || issuer !== expected) throw new TypeError("Issuer must match the configured External ID issuer");
    if (command === "bootstrap-owner") await store.bootstrap_owner(issuer, subject);
    else {
      const yes = (key: string): boolean => {
        const selected = value(key);
        if (selected !== "yes" && selected !== "no") throw new TypeError(`${key} must be yes or no`);
        return selected === "yes";
      };
      await store.set_user(issuer, subject, { enabled: yes("enabled"), admin: yes("admin"), paid_speech: yes("paid-speech") });
    }
    console.log("Application access updated");
    return 0;
  } catch (error) {
    if (error instanceof TypeError || error instanceof StorageConflict || error instanceof StorageAccessDenied || (error instanceof Error && "code" in error && typeof error.code === "string" && error.code.startsWith("ERR_PARSE_ARGS"))) {
      console.error(`Authorization operation failed: ${(error as Error).message}`);
      return 2;
    }
    if (!is_storage_error(error) && !(error instanceof Error && (error.constructor === Error || error.name === "StoreNotInitialized"))) throw error;
    console.error("Authorization operation failed: persistent storage is unavailable");
    return 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main();
