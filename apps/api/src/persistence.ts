import { lstatSync, readFileSync } from "node:fs";
import { isIP } from "node:net";
import { pathToFileURL } from "node:url";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import pg, { type ClientConfig } from "pg";

export const DATABASE_FIELDS = ["EARWYRM_DATABASE_HOST", "EARWYRM_DATABASE_NAME", "EARWYRM_DATABASE_USER", "EARWYRM_DATABASE_PASSWORD"] as const;
export const SYSTEM_CA_BUNDLE = "/etc/ssl/certs/ca-certificates.crt";
/** A missing marker or required table prevents PostgreSQL startup. */
export class StoreNotInitialized extends Error {}
/** Scalar store columns; JSON and money remain text for compatibility with Python records. */
export type Row = Record<string, string | number | null>;
/** Rows for reads and affected-row count for writes. */
export interface QueryResult { rows: Row[]; rowcount: number }
/** A caller-owned connection; transaction helpers always close it after commit or rollback. */
export interface Connection {
  execute(statement: string, parameters?: readonly SQLInputValue[]): Promise<QueryResult>;
  executescript(statements: string): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  close(): Promise<void>;
}

/**
 * Parses persisted JSON without rounding historical seed identities.
 *
 * Only numeric `seed` fields are normalized: safe integers remain numbers and
 * larger signed-63-bit nonnegative integers become canonical decimal strings.
 * Node 24's reviver source token is authoritative; rounded numeric values are
 * never converted back to strings. Other fields retain ordinary JSON semantics.
 */
export function parse_seed_json(text: string): unknown {
  return JSON.parse(text, (key: string, value: unknown, context?: { source?: string }): unknown => {
    if (key !== "seed" || typeof value !== "number") return value;
    const source = context?.source;
    if (source === undefined) throw new Error("Lossless seed parsing requires Node 24 JSON source context");
    if (!/^(?:0|[1-9]\d*)$/.test(source)) throw new TypeError("Persisted numeric seeds must use nonnegative integer tokens");
    const exact = BigInt(source);
    if (exact > 9223372036854775807n) throw new RangeError("Persisted seed exceeds the signed 63-bit range");
    return exact <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(exact) : exact.toString();
  }) as unknown;
}

function parse_conninfo(value: string): Record<string, string> {
  const options: Record<string, string> = {};
  if (/^postgres(?:ql)?:\/\//.test(value)) {
    const url = new URL(value);
    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") throw new Error("Invalid protocol");
    if (url.hostname) options.host = decodeURIComponent(url.hostname).replace(/^\[|\]$/g, "");
    if (url.port) options.port = url.port;
    if (url.username) options.user = decodeURIComponent(url.username);
    if (url.password) options.password = decodeURIComponent(url.password);
    if (url.pathname.length > 1) options.dbname = decodeURIComponent(url.pathname.slice(1));
    for (const [key, val] of url.searchParams) options[key] = val;
    return options;
  }
  let rest = value.trim();
  while (rest) {
    const key = /^([a-zA-Z_][a-zA-Z_0-9]*)\s*=\s*/.exec(rest);
    if (!key) throw new Error("Invalid conninfo");
    rest = rest.slice(key[0].length);
    let result = "";
    if (rest.startsWith("'")) {
      rest = rest.slice(1);
      let closed = false;
      while (rest.length) {
        const char = rest[0]!;
        rest = rest.slice(1);
        if (char === "'") { closed = true; break; }
        if (char === "\\") {
          if (!rest) throw new Error("Invalid conninfo escape");
          result += rest[0]; rest = rest.slice(1);
        } else result += char;
      }
      if (!closed || (rest && !/^\s/.test(rest))) throw new Error("Invalid conninfo quote");
    } else {
      while (rest && !/^\s/.test(rest)) {
        const char = rest[0]!;
        rest = rest.slice(1);
        if (char === "\\") {
          if (!rest) throw new Error("Invalid conninfo escape");
          result += rest[0]; rest = rest.slice(1);
        } else result += char;
      }
    }
    options[key[1]!] = result;
    rest = rest.trimStart();
  }
  if (!Object.keys(options).length) throw new Error("Invalid conninfo");
  return options;
}

function loopback(host: string): boolean {
  return (isIP(host) === 4 && host.split(".")[0] === "127") || (isIP(host) === 6 && /^(?:::1|0:0:0:0:0:0:0:1)$/i.test(host));
}
function local_target(options: Record<string, string>): boolean {
  const hosts = options.host?.split(",") ?? [];
  const addresses = options.hostaddr?.split(",") ?? [];
  if (!hosts.length && !addresses.length) return false;
  if (hosts.some(h => !h || !(h.startsWith("/") || h.replace(/\.+$/, "").toLowerCase() === "localhost" || loopback(h)))) return false;
  if (addresses.some(a => !loopback(a))) return false;
  if (!hosts.length || !addresses.length) return true;
  return hosts.length === addresses.length && hosts.every((h, i) =>
    !h.startsWith("/") && (h.replace(/\.+$/, "").toLowerCase() === "localhost" || h === addresses[i]));
}
function conninfo(options: Record<string, string>): string {
  return Object.entries(options).map(([k, v]) => `${k}='${v.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`).join(" ");
}

/** Resolves explicit configuration; every nonlocal target requires hostname-verified TLS and a trusted CA. */
export function database_url_from_environment(source: Readonly<Record<string, string | undefined>>): string | null {
  if (source.EARWYRM_DATABASE_URL !== undefined) {
    if (DATABASE_FIELDS.some(k => source[k] !== undefined)) throw new TypeError("Configure either EARWYRM_DATABASE_URL or database fields");
    const value = source.EARWYRM_DATABASE_URL.trim();
    if (!value) throw new TypeError("EARWYRM_DATABASE_URL must not be empty");
    let options: Record<string, string>;
    try { options = parse_conninfo(value); }
    catch (error) {
      if (!(error instanceof Error)) throw error;
      throw new TypeError("EARWYRM_DATABASE_URL is invalid");
    }
    if (local_target(options)) return value;
    if (options.sslmode !== "verify-full") throw new TypeError("Non-local PostgreSQL URLs require sslmode=verify-full");
    if (options.sslrootcert !== undefined && !options.sslrootcert.trim()) throw new TypeError("Non-local PostgreSQL URLs require a trusted CA");
    if (options.sslrootcert === undefined) return conninfo({ ...options, sslrootcert: SYSTEM_CA_BUNDLE });
    return value;
  }
  if (!DATABASE_FIELDS.some(k => source[k] !== undefined)) return null;
  const missing = DATABASE_FIELDS.filter(k => source[k] === undefined);
  if (missing.length) throw new TypeError(`PostgreSQL connection configuration is incomplete: ${missing.join(", ")}`);
  const values = DATABASE_FIELDS.map(k => source[k]!);
  values.forEach((v, i) => { if (!v.trim()) throw new TypeError(`${DATABASE_FIELDS[i]} must not be empty`); });
  return conninfo({ host: values[0]!.trim(), dbname: values[1]!.trim(), user: values[2]!.trim(), password: values[3]!, sslmode: "verify-full", sslrootcert: SYSTEM_CA_BUNDLE });
}

/** Builds pg options without its sslmode downgrade behavior; rejects unsupported libpq options rather than ignoring them. */
export function postgres_connection_options(database_url: string): ClientConfig {
  const safe = database_url_from_environment({ EARWYRM_DATABASE_URL: database_url })!;
  const options = parse_conninfo(safe);
  const allowed = new Set(["host", "hostaddr", "port", "dbname", "user", "password", "sslmode", "sslrootcert", "sslcert", "sslkey", "options", "application_name", "connect_timeout", "channel_binding"]);
  for (const key of Object.keys(options)) if (!allowed.has(key)) throw new TypeError(`Unsupported PostgreSQL connection option: ${key}`);
  if (options.host?.includes(",") || options.hostaddr?.includes(",")) throw new TypeError("Multiple PostgreSQL hosts are not supported");
  const config: ClientConfig = {};
  if (options.hostaddr ?? options.host) config.host = options.hostaddr ?? options.host;
  if (options.port) {
    const port = Number(options.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new TypeError("Invalid PostgreSQL port");
    config.port = port;
  }
  if (options.dbname !== undefined) config.database = options.dbname;
  if (options.user !== undefined) config.user = options.user;
  if (options.password !== undefined) config.password = options.password;
  if (options.options !== undefined) config.options = options.options;
  if (options.application_name !== undefined) config.application_name = options.application_name;
  if (options.connect_timeout !== undefined) {
    const seconds = Number(options.connect_timeout);
    if (!Number.isFinite(seconds) || seconds < 0) throw new TypeError("Invalid PostgreSQL connection timeout");
    config.connectionTimeoutMillis = seconds * 1000;
  }
  if (options.channel_binding !== undefined) {
    if (options.channel_binding !== "prefer" && options.channel_binding !== "disable") throw new TypeError("Unsupported channel_binding mode");
    config.enableChannelBinding = options.channel_binding === "prefer";
  }
  if (options.sslmode === "verify-full") {
    config.ssl = {
      rejectUnauthorized: true,
      ca: readFileSync(options.sslrootcert ?? SYSTEM_CA_BUNDLE, "utf8"),
      ...(options.host && !options.host.startsWith("/") && !isIP(options.host) ? { servername: options.host } : {}),
      ...(options.sslcert ? { cert: readFileSync(options.sslcert, "utf8") } : {}),
      ...(options.sslkey ? { key: readFileSync(options.sslkey, "utf8") } : {}),
    };
  } else {
    if (options.sslmode && options.sslmode !== "disable") throw new TypeError("Local PostgreSQL supports sslmode=disable or verify-full");
    config.ssl = false;
  }
  // Store JSON columns are TEXT. Preserve the same raw-text contract if a query
  // returns JSON/JSONB, so pg's default JSON.parse cannot round seeds first.
  config.types = {
    getTypeParser: (oid, format) => (format !== "binary" && (oid === 114 || oid === 3802))
      ? (text: string): string => text
      : pg.types.getTypeParser(oid, format),
  };
  return config;
}

/** Adapts fixed qmark SQL and BEGIN IMMEDIATE to PostgreSQL transaction advisory locks; callers must close it. */
export class PostgresConnection implements Connection {
  private readonly client: pg.Client;
  private ready: Promise<pg.Client> | undefined;
  constructor(database_url: string, private readonly lock_id: number) {
    this.client = new pg.Client(postgres_connection_options(database_url));
  }
  /** Executes trusted static SQL; question marks must occur only as parameter placeholders. */
  async execute(statement: string, parameters: readonly SQLInputValue[] = []): Promise<QueryResult> {
    this.ready ??= this.client.connect();
    await this.ready;
    if (statement === "BEGIN IMMEDIATE") {
      await this.client.query("BEGIN");
      const result = await this.client.query<Row>("SELECT pg_advisory_xact_lock($1)", [this.lock_id]);
      return { rows: result.rows, rowcount: result.rowCount ?? 0 };
    }
    let index = 0;
    const sql = parameters.length ? statement.replace(/\?/g, () => `$${++index}`) : statement;
    const result = await this.client.query<Row>(sql, [...parameters]);
    return { rows: result.rows, rowcount: result.rowCount ?? 0 };
  }
  async executescript(statements: string): Promise<void> { await this.execute(statements); }
  async commit(): Promise<void> { await this.execute("COMMIT"); }
  async rollback(): Promise<void> { if (this.ready) await this.execute("ROLLBACK"); }
  async close(): Promise<void> { await this.client.end(); }
}

/** Opens an existing SQLite file without CREATE; callers must close it. */
export class SqliteConnection implements Connection {
  readonly database: DatabaseSync;
  constructor(path: string, readonly read_only = false) {
    const file = lstatSync(path);
    if (file.isSymbolicLink() || !file.isFile()) throw Object.assign(new Error("Persistent database file is unavailable"), { code: "ERR_SQLITE_ERROR" });
    // sqlite's default opens with CREATE. Existing stores must never be recreated.
    const url = pathToFileURL(path);
    url.searchParams.set("mode", read_only ? "ro" : "rw");
    this.database = new DatabaseSync(url, { readOnly: read_only, enableForeignKeyConstraints: true });
    this.database.exec("PRAGMA busy_timeout = 60000");
  }
  async execute(statement: string, parameters: readonly SQLInputValue[] = []): Promise<QueryResult> {
    const prepared = this.database.prepare(statement);
    if (prepared.columns().length) return { rows: prepared.all(...parameters) as Row[], rowcount: 0 };
    return { rows: [], rowcount: Number(prepared.run(...parameters).changes) };
  }
  async executescript(statements: string): Promise<void> { this.database.exec(statements); }
  async commit(): Promise<void> { this.database.exec("COMMIT"); }
  async rollback(): Promise<void> { if (this.database.isTransaction) this.database.exec("ROLLBACK"); }
  async close(): Promise<void> { this.database.close(); }
}

const locks = new Map<string, Promise<void>>();
/** Serializes same-process writers before synchronous SQLite lock acquisition to avoid event-loop deadlock. */
export async function serialized<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const prior = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>(resolve => { release = resolve; });
  const tail = prior.then(() => current);
  locks.set(key, tail);
  await prior;
  try { return await operation(); }
  finally { release(); if (locks.get(key) === tail) locks.delete(key); }
}
/** Owns and closes the connection, committing only a resolved operation and rolling back rejected operations. */
export async function transaction<T>(connection: Connection, operation: (connection: Connection) => Promise<T>): Promise<T> {
  try {
    await connection.execute("BEGIN IMMEDIATE");
    const result = await operation(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { await connection.close(); }
}
export const REQUIRED_TABLES = ["runs", "paid_attempts", "outputs", "evaluations", "render_jobs", "local_outputs", "application_identity", "application_users", "access_requests", "lyric_options", "budget_limits", "jingle_diagnostics", "jingle_provider_events"] as const;
/** Requires the version-one marker and both schemas without initializing, importing, or falling back to SQLite. */
export async function validate_postgres_store(database_url: string): Promise<void> {
  const connection = new PostgresConnection(database_url, 0x4557524d01);
  try {
    const marker = (await connection.execute("SELECT to_regclass('earwyrm_store_metadata') AS name")).rows[0];
    if (!marker?.name) throw new StoreNotInitialized("PostgreSQL store has not been initialized");
    const metadata = (await connection.execute("SELECT schema_version FROM earwyrm_store_metadata WHERE singleton = 1")).rows;
    if (metadata.length !== 1 || metadata[0]!.schema_version !== 1) throw new StoreNotInitialized("PostgreSQL store initialization marker is invalid");
    for (const name of REQUIRED_TABLES) {
      if (!(await connection.execute("SELECT to_regclass(?) AS name", [name])).rows[0]?.name) throw new StoreNotInitialized("PostgreSQL store is missing a required table; run the explicit database upgrade command");
    }
    const columns = (await connection.execute(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'jingle_diagnostics'",
    )).rows;
    if (!columns.some(column => column.column_name === "failure_reasons")) throw new StoreNotInitialized("PostgreSQL store is missing diagnostic columns; run the explicit database upgrade command");
  } finally { await connection.close(); }
}

/** Recognizes database/network/filesystem failures without masking validation or programmer errors. */
export function is_storage_error(error: unknown): error is Error {
  if (error instanceof pg.DatabaseError) return true;
  if (!(error instanceof Error) || !("code" in error) || typeof error.code !== "string") return false;
  return /^(ERR_SQLITE|SQLITE_|EACCES|EPERM|ENOENT|ENOTDIR|EISDIR|ENOSPC|EIO|EROFS|ECONN|ETIMEDOUT|ENOTFOUND|EPIPE|EWOULDBLOCK)/.test(error.code);
}
