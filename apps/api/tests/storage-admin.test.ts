import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import pg from "pg";
import { Decimal } from "decimal.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acquire_writer_lock, import_sqlite, initialize_fresh, main } from "../src/bootstrap_database.js";
import { prepare_databases } from "../src/cloud_web.js";
import { MelodyService } from "../src/melody_service.js";
import { CompositionRequest } from "../src/melody.js";
import { ArrangementScore } from "../src/score_dsl.js";
import { database_url_from_environment, parse_seed_json, PostgresConnection, postgres_connection_options, StoreNotInitialized, validate_postgres_store, type QueryResult, type Row } from "../src/persistence.js";
import { StorageAccessDenied, StorageConflict, WebStorage } from "../src/web_storage.js";

const directories: string[] = [], targets: DatabaseSync[] = [];
function directory(): string {
  const root = join(process.cwd(), `.storage-admin-test-${randomUUID()}`);
  mkdirSync(root, { mode: 0o700 }); directories.push(root); return root;
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const db of targets.splice(0)) db.close();
  for (const root of directories.splice(0)) rmSync(root, { recursive: true, force: true });
});
const local = "postgresql://localhost/earwyrm?sslmode=disable";
function environment(url: string) { return { EARWYRM_DATABASE_URL: url }; }

describe("safe PostgreSQL configuration", () => {
  it("preserves passwords with libpq quoting and pins remote TLS to the trusted system CA", () => {
    const url = database_url_from_environment({ EARWYRM_DATABASE_HOST: "db.example.test", EARWYRM_DATABASE_NAME: "earwyrm",
      EARWYRM_DATABASE_USER: "app-user", EARWYRM_DATABASE_PASSWORD: "p@ss 'word\\secret" });
    const config = postgres_connection_options(url!);
    expect(config).toMatchObject({ host: "db.example.test", database: "earwyrm", user: "app-user", password: "p@ss 'word\\secret" });
    expect(config.ssl).toMatchObject({ rejectUnauthorized: true, servername: "db.example.test" });
    expect(typeof config.ssl === "object" && config.ssl.ca).toBe(readFileSync("/etc/ssl/certs/ca-certificates.crt", "utf8"));
  });
  it.each([undefined, "disable", "allow", "prefer", "require", "verify-ca", "invalid"])("rejects remote TLS mode %s", mode => {
    const url = `postgresql://db.example.test/earwyrm${mode === undefined ? "" : `?sslmode=${mode}`}`;
    expect(() => database_url_from_environment(environment(url))).toThrow("sslmode=verify-full");
  });
  it.each([
    "postgresql://localhost/earwyrm?sslmode=disable",
    "postgresql://127.0.0.1/earwyrm?sslmode=disable",
    "postgresql://[::1]/earwyrm?sslmode=disable",
    "postgresql:///earwyrm?host=%2Fvar%2Frun%2Fpostgresql&sslmode=disable",
    "host=localhost dbname=earwyrm sslmode=disable",
  ])("allows only demonstrably local targets: %s", url => {
    expect(database_url_from_environment(environment(url))).toBe(url);
    expect(postgres_connection_options(url).ssl).toBe(false);
  });
  it.each([
    "postgresql://localhost/earwyrm?hostaddr=198.51.100.8",
    "postgresql://127.0.0.1/earwyrm?hostaddr=127.0.0.2",
    "postgresql:///earwyrm?host=%2Fvar%2Frun%2Fpostgresql&hostaddr=127.0.0.1",
    "postgresql://localhost,db.example.test/earwyrm",
    "postgresql:///earwyrm",
  ])("does not mistake conflicting/unknown targets for loopback: %s", url => {
    expect(() => database_url_from_environment(environment(url))).toThrow("sslmode=verify-full");
  });
  it("rejects ambiguity, incomplete fields, blank trusted CA, and credential-bearing malformed URLs", () => {
    expect(database_url_from_environment({})).toBeNull();
    expect(() => database_url_from_environment({ ...environment(local), EARWYRM_DATABASE_HOST: "host" })).toThrow("either");
    expect(() => database_url_from_environment({ EARWYRM_DATABASE_HOST: "host" })).toThrow("incomplete");
    expect(() => database_url_from_environment(environment(""))).toThrow("must not be empty");
    expect(() => database_url_from_environment(environment("invalid-url-with-secret"))).toThrow(/^EARWYRM_DATABASE_URL is invalid$/);
    expect(() => database_url_from_environment(environment("postgresql://db.example.test/a?sslmode=verify-full&sslrootcert="))).toThrow("trusted CA");
    const root = directory(), ca = join(root, "ca.pem"); writeFileSync(ca, "trusted-test-ca");
    const explicit = `postgresql://db.example.test/a?sslmode=verify-full&sslrootcert=${encodeURIComponent(ca)}`;
    expect(database_url_from_environment(environment(explicit))).toBe(explicit);
    expect(postgres_connection_options(explicit).ssl).toMatchObject({ rejectUnauthorized: true, ca: "trusted-test-ca" });
    expect(() => postgres_connection_options(`${local}&service=untrusted`)).toThrow("Unsupported");
  });
  it("leaves JSON and JSONB source text intact in each client before lossless seed parsing", () => {
    const config = postgres_connection_options(local), raw = '{"seed":9223372036854775807}';
    for (const oid of [114, 3802]) {
      const text: unknown = config.types!.getTypeParser(oid, "text")(raw);
      expect(text).toBe(raw);
      expect(parse_seed_json(String(text))).toEqual({ seed: "9223372036854775807" });
    }
  });
});

// SQL is executed by a real rollback-capable SQLite engine; only PostgreSQL catalog
// introspection is emulated. Live PostgreSQL remains explicitly opt-in below.
function postgres_target(fail_on?: string): DatabaseSync {
  const db = new DatabaseSync(":memory:"); targets.push(db);
  const execute = async (statement: string, parameters: readonly SQLInputValue[] = []): Promise<QueryResult> => {
    if (fail_on && statement.startsWith(fail_on)) throw new Error("simulated partial import");
    if (statement.includes("to_regclass")) {
      const table = parameters[0] ?? (/to_regclass\('([a-z_]+)'\)/.exec(statement)?.[1] ?? "");
      const found = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
      return { rows: [{ name: found ? String(found.name) : null }], rowcount: 0 };
    }
    if (statement.includes("pg_catalog.pg_class")) {
      if (statement.includes("table_count")) return { rows: [{ table_count: db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table'").get()!.n as number }], rowcount: 0 };
      return { rows: db.prepare("SELECT 1 FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' LIMIT 1").all() as Row[], rowcount: 0 };
    }
    if (statement.includes("information_schema.columns")) {
      const table = /table_name = '([a-z_]+)'/.exec(statement)?.[1] ?? "";
      return { rows: db.prepare(`SELECT name AS column_name FROM pragma_table_info('${table}')`).all() as Row[], rowcount: 0 };
    }
    const prepared = db.prepare(statement);
    if (prepared.columns().length) return { rows: prepared.all(...parameters) as Row[], rowcount: 0 };
    return { rows: [], rowcount: Number(prepared.run(...parameters).changes) };
  };
  vi.spyOn(PostgresConnection.prototype, "execute").mockImplementation(execute);
  vi.spyOn(PostgresConnection.prototype, "executescript").mockImplementation(async sql => { db.exec(sql); });
  vi.spyOn(PostgresConnection.prototype, "commit").mockImplementation(async () => { db.exec("COMMIT"); });
  vi.spyOn(PostgresConnection.prototype, "rollback").mockImplementation(async () => { if (db.isTransaction) db.exec("ROLLBACK"); });
  vi.spyOn(PostgresConnection.prototype, "close").mockResolvedValue();
  return db;
}
async function source(root: string, seed?: string) {
  const web = new WebStorage(root), melody = new MelodyService(join(root, "melody"));
  await web.bootstrap_owner("issuer", "owner");
  await web.create_run("run", "owner", "instrumental", ["brief"]);
  const output = await web.save_output({ run_id: "run", owner: "owner", manifest: { brief_id: "brief", variant: "instrumental" }, audio: Buffer.from("preserve private media") });
  const request = CompositionRequest.parse({ logical_job_id: "migration", product_path: "vocoded", seed: 42, lyrics: "Cedar Loop brings bright sound to your day",
    lines: [{ text: "Cedar Loop brings bright sound to your day", syllables: ["Ce", "dar", "Loop", "brings", "bright", "sound", "to", "your", "day"], start_seconds: 3, end_seconds: 7 }] });
  let job = await melody.submit(request);
  if (seed !== undefined) {
    // Model Python's original unquoted 63-bit JSON tokens and matching durable
    // provenance, without using a native Number anywhere in fixture creation.
    const provenancePath = join(melody.artifact_dir, job.job_id, "provenance.json");
    writeFileSync(provenancePath, readFileSync(provenancePath, "utf8").replace('"seed":42', `"seed":${seed}`));
    job = { ...job, seed, artifacts: { ...job.artifacts, "provenance.json": { ...job.artifacts["provenance.json"]!, sha256: createHash("sha256").update(readFileSync(provenancePath)).digest("hex") } } };
    const db = new DatabaseSync(melody.database_path);
    db.prepare("UPDATE render_jobs SET request_json=?,result_json=? WHERE job_id=?").run(
      JSON.stringify(request).replace('"seed":42', `"seed":${seed}`),
      JSON.stringify(job).replace(`"seed":"${seed}"`, `"seed":${seed}`),
      job.job_id,
    );
    db.close();
  }
  writeFileSync(join(root, ".earwyrm-initialized"), "");
  return { web, melody, output, job, request: { ...request, ...(seed === undefined ? {} : { seed }) } };
}
function user_tables(db: DatabaseSync): unknown[] {
  return db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
}

describe("jingle diagnostic storage", () => {
  it("restricts lookup to enabled admins, expires old records, and finalizes only once", async () => {
    const root = directory(), store = new WebStorage(root);
    await store.bootstrap_owner("issuer", "owner");
    await store.set_user("issuer", "user", { enabled: true, admin: false, paid_speech: false });
    const id = randomUUID();
    await store.create_jingle_diagnostic(id);
    await store.append_jingle_provider_event(id, {
      stage: "lyrics", operation: "generate", http_status: 400,
      error_code: "unsupported_parameter", parameter: "model", request_id: null,
      model_exchange: { request: { status: "captured", text: "private prompt" }, response: { status: "captured", text: "private output" } },
    });

    await expect(store.get_jingle_diagnostic_as_admin("issuer", "user", id)).rejects.toBeInstanceOf(StorageAccessDenied);
    await store.update_jingle_diagnostic(id, "lyrics", "failed");
    expect(await store.get_jingle_diagnostic_as_admin("issuer", "owner", id)).toMatchObject({
      diagnostic_id: id, stage: "lyrics", status: "failed",
      provider_events: [{ model_exchange: { request: { status: "captured", text: "private prompt" }, response: { status: "captured", text: "private output" } } }],
    });
    await expect(store.update_jingle_diagnostic(id, "score", "completed")).rejects.toBeInstanceOf(StorageConflict);
    const db = new DatabaseSync(store.database_path);
    db.prepare("UPDATE jingle_diagnostics SET created_at = ? WHERE diagnostic_id = ?")
      .run(new Date(Date.now() - 31 * 86400_000).toISOString(), id);
    db.close();
    expect(await store.get_jingle_diagnostic_as_admin("issuer", "owner", id)).toBeNull();
    await store.create_jingle_diagnostic(randomUUID());
    const check = new DatabaseSync(store.database_path);
    expect(check.prepare("SELECT COUNT(*) AS count FROM jingle_diagnostics WHERE diagnostic_id = ?").get(id)?.count).toBe(0);
    expect(check.prepare("SELECT COUNT(*) AS count FROM jingle_provider_events WHERE diagnostic_id = ?").get(id)?.count).toBe(0);
    check.close();
  });
  it("preserves safe failure reasons across a local schema upgrade and rejects arbitrary text", async () => {
    const root = directory(), original = new WebStorage(root);
    await original.bootstrap_owner("issuer", "owner");
    const id = randomUUID();
    await original.create_jingle_diagnostic(id);
    const old = new DatabaseSync(original.database_path);
    old.exec("ALTER TABLE jingle_diagnostics DROP COLUMN failure_reasons");
    old.exec("ALTER TABLE jingle_provider_events DROP COLUMN model_exchange");
    old.close();
    const upgraded = new WebStorage(root);
    await expect(upgraded.update_jingle_diagnostic(id, "lyrics", "failed", ["private-marker"])).rejects.toThrow();
    await upgraded.update_jingle_diagnostic(id, "lyrics", "failed", ["unsupported_language"]);
    expect(await upgraded.get_jingle_diagnostic_as_admin("issuer", "owner", id)).toMatchObject({
      status: "failed", failure_reasons: ["unsupported_language"],
    });
  });
});

describe("operator transactions and read-only import", () => {
  it("locks compatibly with active writers and releases after use", () => {
    const root = directory(), release = acquire_writer_lock(root);
    expect(() => acquire_writer_lock(root)).toThrow("active writer");
    release(); acquire_writer_lock(root)();
  });
  it("recreates the application tables and owner without creating local databases", async () => {
    const db = postgres_target(), root = directory();
    await initialize_fresh(root, local, { issuer: "issuer", subject: "owner" });
    expect(user_tables(db)).toHaveLength(20);
    expect(db.prepare("SELECT issuer, subject, enabled, admin, paid_speech FROM application_users").get()).toMatchObject({
      issuer: "issuer", subject: "owner", enabled: 1, admin: 1, paid_speech: 1,
    });
    await validate_postgres_store(local);
    expect(readdirSync(root)).toEqual([".earwyrm-writer.lock"]);
    db.prepare("UPDATE application_users SET enabled=0, admin=0, paid_speech=0").run();
    db.prepare("INSERT INTO application_users VALUES ('issuer', 'former-user', 0, 0, 0, 'old')").run();
    db.prepare("INSERT INTO runs VALUES ('old-run', 'owner', 'instrumental', '[]', 'complete', 'old')").run();
    await initialize_fresh(root, local, { issuer: "issuer", subject: "owner" });
    expect(user_tables(db)).toHaveLength(20);
    expect(db.prepare("SELECT count(*) AS count FROM application_users").get()!.count).toBe(1);
    expect(db.prepare("SELECT count(*) AS count FROM runs").get()!.count).toBe(0);
    expect(db.prepare("SELECT enabled, admin, paid_speech FROM application_users").get()).toEqual({
      enabled: 1, admin: 1, paid_speech: 1,
    });
    await validate_postgres_store(local);
  });
  it("rolls back all new schema when creation fails or leaves tables missing", async () => {
    const db = postgres_target(), root = directory();
    vi.spyOn(MelodyService, "_create_schema").mockRejectedValueOnce(new Error("simulated failure"));
    await expect(initialize_fresh(root, local, { issuer: "issuer", subject: "owner" })).rejects.toThrow("simulated failure");
    expect(user_tables(db)).toEqual([]);
    vi.spyOn(MelodyService, "_create_schema").mockResolvedValueOnce();
    await expect(initialize_fresh(root, local, { issuer: "issuer", subject: "owner" })).rejects.toThrow("schema is incomplete");
    expect(user_tables(db)).toEqual([]);
    await expect(validate_postgres_store(local)).rejects.toBeInstanceOf(StoreNotInitialized);
    vi.spyOn(WebStorage, "_bootstrap_owner").mockRejectedValueOnce(new Error("simulated owner failure"));
    await expect(initialize_fresh(root, local, { issuer: "issuer", subject: "owner" })).rejects.toThrow("owner failure");
    expect(user_tables(db)).toEqual([]);
  });
  it("resets known application data and refuses unknown share entries or active writers", async () => {
    const db = postgres_target(), root = directory();
    mkdirSync(join(root, "audio"));
    mkdirSync(join(root, "work"));
    mkdirSync(join(root, "melody", "artifacts"), { recursive: true });
    writeFileSync(join(root, "audio", "old.wav"), "old audio");
    writeFileSync(join(root, "work", "stale.tmp"), "stale work");
    writeFileSync(join(root, "melody", "artifacts", "old.mid"), "old melody");
    writeFileSync(join(root, "earwyrm.sqlite3"), "old database");
    writeFileSync(join(root, ".earwyrm-initialized"), "");
    await initialize_fresh(root, local, { issuer: "issuer", subject: "owner" });
    expect(readdirSync(root)).toEqual([".earwyrm-writer.lock"]);
    expect(user_tables(db)).toHaveLength(20);
    writeFileSync(join(root, "unrecognized.txt"), "preserve");
    await expect(initialize_fresh(root, local, { issuer: "issuer", subject: "owner" })).rejects.toThrow("unrecognized data directory entries");
    expect(user_tables(db)).toHaveLength(20);
    rmSync(join(root, "unrecognized.txt"));
    const release = acquire_writer_lock(root);
    await expect(initialize_fresh(root, local, { issuer: "issuer", subject: "owner" })).rejects.toThrow("active writer");
    release();
  });
  it("initializes from operator inputs only when the owner issuer matches External ID", async () => {
    const db = postgres_target(), root = directory();
    const env = {
      EARWYRM_DATA_DIR: root, EARWYRM_DATABASE_URL: local, EARWYRM_DATA_RESET_APPROVED: "true",
      ENTRA_EXPECTED_ISSUER: "issuer",
      EARWYRM_BOOTSTRAP_OWNER_ISSUER: "issuer",
      EARWYRM_BOOTSTRAP_OWNER_SUBJECT: "verified-subject",
    };
    expect(await main(["initialize-fresh"], { ...env, EARWYRM_DATA_RESET_APPROVED: undefined })).toBe(2);
    expect(user_tables(db)).toEqual([]);
    expect(await main(["initialize-fresh"], { ...env, EARWYRM_BOOTSTRAP_OWNER_ISSUER: "other-issuer" })).toBe(2);
    expect(user_tables(db)).toEqual([]);
    expect(await main(["initialize-fresh"], env)).toBe(0);
    expect(db.prepare("SELECT issuer, subject, enabled, admin, paid_speech FROM application_users").get()).toMatchObject({
      issuer: "issuer", subject: "verified-subject", enabled: 1, admin: 1, paid_speech: 1,
    });
  });
  it.each([
    [true, true, true], [true, true, false], [true, false, false], [false, true, true], [false, false, false],
  ])("imports compatible records without modifying source data (lyrics: %s, access requests: %s, email: %s)", async (hasLyrics, hasAccessRequests, hasEmail) => {
    const root = directory(), { web, melody, output, job, request } = await source(root, "9223372036854775807");
    const diagnosticId = randomUUID();
    await web.create_jingle_diagnostic(diagnosticId);
    await web.append_jingle_provider_event(diagnosticId, {
      stage: "lyrics", operation: "generate", http_status: 400,
      error_code: "unsupported_parameter", parameter: "model", request_id: null,
    });
    const hasDiagnostics = hasLyrics || hasAccessRequests;
    if (!hasDiagnostics) {
      const sourceDb = new DatabaseSync(web.database_path);
      sourceDb.exec("DROP TABLE jingle_provider_events; DROP TABLE jingle_diagnostics");
      sourceDb.close();
    } else if (!hasLyrics) {
      const sourceDb = new DatabaseSync(web.database_path);
      sourceDb.exec("ALTER TABLE jingle_diagnostics DROP COLUMN failure_reasons");
      sourceDb.exec("ALTER TABLE jingle_provider_events DROP COLUMN model_exchange");
      sourceDb.close();
    }
    if (hasAccessRequests) {
      await web.request_access("issuer", "requester", "requester@example.test");
      if (!hasEmail) {
        const sourceDb = new DatabaseSync(web.database_path);
        sourceDb.exec("ALTER TABLE access_requests DROP COLUMN email");
        sourceDb.close();
      }
    }
    if (!hasLyrics) {
      const sourceDb = new DatabaseSync(web.database_path);
      sourceDb.exec("DROP TABLE lyric_reservation_events; DROP TABLE score_reconciliations; DROP TABLE score_schema_migrations; DROP TABLE lyric_options; DROP TABLE lyric_reservations; DROP TABLE score_reservations; DROP TABLE preview_reservations");
      sourceDb.close();
    }
    if (!hasAccessRequests) {
      const sourceDb = new DatabaseSync(web.database_path);
      sourceDb.exec("DROP TABLE access_requests");
      sourceDb.close();
    }
    if (hasLyrics) {
      await web.reserve_lyric_action("discuss", new Decimal("0.001"), new Decimal(1), new Decimal(1), "owner");
      await web.set_budget_as_admin("issuer", "owner", "user", "owner", "7.5");
    }
    if (hasLyrics && !hasEmail) {
      const sourceDb = new DatabaseSync(web.database_path);
      sourceDb.exec("ALTER TABLE lyric_reservations DROP COLUMN owner");
      sourceDb.close();
    }
    const webBytes = readFileSync(web.database_path), melodyBytes = readFileSync(melody.database_path);
    const audio = readFileSync(join(web.audio_dir, output.file)), wav = readFileSync(join(melody.artifact_dir, job.job_id, "backing.wav"));
    const db = postgres_target();
    expect(await import_sqlite(root, local)).toEqual({ runs: 1, paid_attempts: 0, outputs: 1, evaluations: 0, application_identity: 1, application_users: 1, ...(hasAccessRequests ? { access_requests: 1 } : {}), ...(hasLyrics ? { lyric_options: 0, lyric_reservations: 1, lyric_reservation_events: 0, score_reservations: 0, score_reconciliations: 0, preview_reservations: 0 } : {}), budget_limits: hasLyrics ? 1 : 0, ...(hasDiagnostics ? { jingle_diagnostics: 1, jingle_provider_events: 1 } : {}), render_jobs: 1, local_outputs: 0 });
    if (hasDiagnostics) expect(db.prepare("SELECT diagnostic_id, status FROM jingle_diagnostics").get())
      .toEqual({ diagnostic_id: diagnosticId, status: "running" });
    if (hasDiagnostics) expect(db.prepare("SELECT error_code, parameter FROM jingle_provider_events").get())
      .toEqual({ error_code: "unsupported_parameter", parameter: "model" });
    if (hasAccessRequests) expect(db.prepare("SELECT subject, status, email FROM access_requests").get())
      .toEqual({ subject: "requester", status: "pending", email: hasEmail ? "requester@example.test" : null });
    if (hasLyrics) expect(db.prepare("SELECT reserved_usd FROM lyric_reservations").get()?.reserved_usd).toBe("0.001");
    if (hasLyrics) {
      const imported = new WebStorage(root, { database_url: local });
      expect(await imported.get_user_budget("owner")).toEqual({
        limit_usd: "7.5", charged_usd: hasEmail ? "0.001" : "0", remaining_usd: hasEmail ? "7.499" : "7.5",
        lyric_reserved_usd: hasEmail ? "0.001" : "0", lyric_actual_usd: "0",
      });
    }
    expect(db.prepare("SELECT job_id FROM render_jobs").get()!.job_id).toBe(job.job_id);
    const original = new DatabaseSync(melody.database_path, { readOnly: true });
    const stored = original.prepare("SELECT request_json,result_json FROM render_jobs").get()!; original.close();
    expect(db.prepare("SELECT request_json,result_json FROM render_jobs").get()).toEqual(stored);
    expect(String(stored.request_json)).toContain('"seed":9223372036854775807');
    const imported = new MelodyService(melody.root, { database_url: local });
    expect((await imported.get_job(job.job_id)).seed).toBe("9223372036854775807");
    expect(await imported.submit(request)).toEqual(job);
    expect(await imported.read_artifact(job.job_id, "score.mid")).toEqual(readFileSync(join(melody.artifact_dir, job.job_id, "score.mid")));
    expect(readFileSync(web.database_path)).toEqual(webBytes); expect(readFileSync(melody.database_path)).toEqual(melodyBytes);
    expect(readFileSync(join(web.audio_dir, output.file))).toEqual(audio);
    expect(readFileSync(join(melody.artifact_dir, job.job_id, "backing.wav"))).toEqual(wav);
    await expect(import_sqlite(root, local)).rejects.toThrow("empty target");
  });
  it("imports settled lyric actuals and their append-only history", async () => {
    const root = directory(), { web } = await source(root);
    await web.reserve_lyric_action("write", new Decimal("0.62"), new Decimal(1), new Decimal(100), "owner");
    const reservation = (await web.budgets_as_admin("issuer", "owner", { text: "100", speech: "100" })).lyric_reservations[0]!;
    await web.settle_lyric_reservation_as_admin(
      "issuer", "owner", reservation.reservation_id, "0.05", "azure-meter-import", "Verified Azure meter cost",
    );
    const db = postgres_target();
    expect(await import_sqlite(root, local)).toMatchObject({ lyric_reservations: 1, lyric_reservation_events: 1 });
    const imported = new WebStorage(root, { database_url: local });
    const summary = await imported.budgets_as_admin("issuer", "owner", { text: "100", speech: "100" });
    expect(summary.text).toMatchObject({ charged_usd: "0.05", lyric_reserved_usd: "0", lyric_actual_usd: "0.05" });
    expect(summary.lyric_reservations[0]).toMatchObject({
      reservation_id: reservation.reservation_id, settlement_status: "settled", reserved_usd: "0.62",
      actual_cost_usd: "0.05", events: [expect.objectContaining({ reason: "Verified Azure meter cost" })],
    });
    expect(db.prepare("SELECT count(*) AS count FROM lyric_reservation_events").get()?.count).toBe(1);
  });
  it("imports legacy v1 score reservations with defaults from the upgraded schema", async () => {
    const root = directory(), { web } = await source(root);
    const sourceDb = new DatabaseSync(web.database_path);
    sourceDb.exec("DROP TABLE score_reconciliations; DROP TABLE score_schema_migrations; ALTER TABLE score_reservations DROP COLUMN provider_json; ALTER TABLE score_reservations DROP COLUMN attempt_count");
    sourceDb.prepare("INSERT INTO score_reservations (reservation_id, owner, action, logical_job_id, request_sha256, reserved_usd, status, score_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run("legacy-reservation", "owner", "compose", "score-legacy", "a".repeat(64), "0.01", "outcome_unknown", null, new Date().toISOString(), new Date().toISOString());
    sourceDb.close();
    const db = postgres_target();
    expect(await import_sqlite(root, local)).toMatchObject({ score_reservations: 1 });
    expect(db.prepare("SELECT status, score_json, provider_json, attempt_count FROM score_reservations").get())
      .toEqual({ status: "outcome_unknown", score_json: null, provider_json: null, attempt_count: 1 });
  });
  it("imports current-schema SQL null score provenance without changing reservations or source bytes", async () => {
    const root = directory(), { web, melody } = await source(root);
    const sourceDb = new DatabaseSync(web.database_path);
    for (const status of ["submitted", "outcome_unknown", "failed"]) {
      sourceDb.prepare("INSERT INTO score_reservations VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(`reservation-${status}`, "owner", "compose", `score-${status}`, "a".repeat(64), "0.01", status, null, "created", "updated", null, 2);
    }
    const reservations = sourceDb.prepare("SELECT * FROM score_reservations ORDER BY reservation_id").all();
    sourceDb.close();
    const webBytes = readFileSync(web.database_path), melodyBytes = readFileSync(melody.database_path);
    const db = postgres_target();
    expect(await import_sqlite(root, local)).toMatchObject({ score_reservations: 3 });
    expect(db.prepare("SELECT * FROM score_reservations ORDER BY reservation_id").all()).toEqual(reservations);
    expect(readFileSync(web.database_path)).toEqual(webBytes);
    expect(readFileSync(melody.database_path)).toEqual(melodyBytes);
  });
  it("rejects malformed non-null score provenance before opening the import target", async () => {
    const root = directory(), { web } = await source(root);
    const sourceDb = new DatabaseSync(web.database_path);
    sourceDb.prepare("INSERT INTO score_reservations VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run("reservation", "owner", "compose", "score-invalid", "a".repeat(64), "0.01", "submitted", null, "created", "updated", null, 1);
    const db = postgres_target(), execute = vi.mocked(PostgresConnection.prototype.execute);
    try {
      for (const provider of ["{", "null", "[]", "1", "{}", '{"provider":"unsupported","deployment":null}']) {
        sourceDb.prepare("UPDATE score_reservations SET provider_json=?").run(provider);
        const before = readFileSync(web.database_path);
        await expect(import_sqlite(root, local)).rejects.toThrow(/invalid JSON|invalid shape|invalid score provider/);
        expect(execute).not.toHaveBeenCalled();
        expect(user_tables(db)).toEqual([]);
        expect(readFileSync(web.database_path)).toEqual(before);
      }
    } finally { sourceDb.close(); }
  });
  it("rolls back a partial import including schema while preserving every source byte", async () => {
    const root = directory(), { web, melody, output } = await source(root);
    const before = readFileSync(web.database_path), melodyBefore = readFileSync(melody.database_path);
    const db = postgres_target("INSERT INTO outputs");
    await expect(import_sqlite(root, local)).rejects.toThrow("partial import");
    expect(user_tables(db)).toEqual([]);
    expect(readFileSync(web.database_path)).toEqual(before); expect(readFileSync(melody.database_path)).toEqual(melodyBefore);
    expect(readFileSync(join(web.audio_dir, output.file)).toString()).toBe("preserve private media");
  });
  it("adds lyric storage to an existing PostgreSQL store idempotently without resetting identities or runs", async () => {
    const db = postgres_target(), root = directory();
    await initialize_fresh(root, local, { issuer: "issuer", subject: "owner" });
    db.exec("DROP TABLE access_requests; DROP TABLE preview_reservations; DROP TABLE jingle_provider_events; DROP TABLE jingle_diagnostics");
    const store = new WebStorage(root, { database_url: local });
    expect(await store.has_lyric_budget()).toBe(true);
    db.prepare("INSERT INTO runs VALUES ('preserved-run', 'owner', 'instrumental', '[]', 'complete', 'old')").run();
    await expect(validate_postgres_store(local)).rejects.toThrow("explicit database upgrade");
    await prepare_databases(root, { database_url: local, upgrade_postgres: false });
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'jingle_diagnostics'").get()).toBeDefined();
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'jingle_provider_events'").get()).toBeDefined();
    const diagnosticId = randomUUID();
    await store.create_jingle_diagnostic(diagnosticId);
    db.exec("ALTER TABLE jingle_diagnostics DROP COLUMN failure_reasons");
    await expect(validate_postgres_store(local)).rejects.toThrow("explicit database upgrade");
    await prepare_databases(root, { database_url: local, upgrade_postgres: false });
    await store.update_jingle_diagnostic(diagnosticId, "lyrics", "failed", ["unsupported_language"]);
    expect(await store.get_jingle_diagnostic_as_admin("issuer", "owner", diagnosticId)).toMatchObject({
      failure_reasons: ["unsupported_language"],
    });
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'access_requests'").get()).toBeDefined();
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'preview_reservations'").get()).toBeDefined();
    await store.request_access("issuer", "requester");
    db.exec("ALTER TABLE access_requests DROP COLUMN email");
    await prepare_databases(root, { database_url: local, upgrade_postgres: false });
    expect(await store.get_access_request("issuer", "requester")).toMatchObject({ subject: "requester", email: null });
    await store.request_access("issuer", "requester", "requester@example.test");
    expect(await store.list_access_requests_as_admin("issuer", "owner")).toEqual([
      expect.objectContaining({ subject: "requester", email: "requester@example.test" }),
    ]);
    await store.reserve_lyric_action("discuss", new Decimal(1), new Decimal(1), new Decimal(1));
    await store.set_budget_as_admin("issuer", "owner", "user", "owner", "8");
    db.exec("ALTER TABLE lyric_reservations DROP COLUMN owner");
    await prepare_databases(root, { database_url: local, upgrade_postgres: false });
    expect((await store.budgets_as_admin("issuer", "owner", { text: "1", speech: "1" })).unattributed_text_usd).toBe("1");
    expect((await store.get_user_budget("owner")).limit_usd).toBe("8");
    db.exec(`DROP TABLE lyric_reservation_events;
      ALTER TABLE lyric_reservations DROP COLUMN settlement_status;
      ALTER TABLE lyric_reservations DROP COLUMN actual_cost_usd;
      ALTER TABLE lyric_reservations DROP COLUMN evidence_reference;
      ALTER TABLE lyric_reservations DROP COLUMN settled_by_issuer;
      ALTER TABLE lyric_reservations DROP COLUMN settled_by_subject;
      ALTER TABLE lyric_reservations DROP COLUMN settled_at;
      DELETE FROM score_schema_migrations WHERE version = 3`);
    expect(await store.has_lyric_budget()).toBe(false);
    await prepare_databases(root, { database_url: local, upgrade_postgres: true });
    expect(await store.has_lyric_budget()).toBe(true);
    expect(db.prepare("SELECT settlement_status, actual_cost_usd FROM lyric_reservations").get()).toEqual({
      settlement_status: "pending", actual_cost_usd: null,
    });
    expect((await store.budgets_as_admin("issuer", "owner", { text: "1", speech: "1" })).unattributed_text_usd).toBe("1");
    db.exec("DROP TABLE lyric_reservation_events; DROP TABLE score_reconciliations; DROP TABLE score_schema_migrations; DROP TABLE lyric_options; DROP TABLE lyric_reservations; DROP TABLE score_reservations");
    expect(await store.has_lyric_budget()).toBe(false);
    await expect(validate_postgres_store(local)).rejects.toThrow("explicit database upgrade");
    await prepare_databases(root, { database_url: local, upgrade_postgres: true });
    expect(await store.has_lyric_budget()).toBe(true);
    const env = { EARWYRM_DATA_DIR: root, EARWYRM_DATABASE_URL: local };
    expect(await main(["upgrade"], env)).toBe(0);
    await store.reserve_lyric_action("discuss", new Decimal(1), new Decimal(1), new Decimal(1));
    await expect(store.reserve_lyric_action("discuss", new Decimal(1), new Decimal(1), new Decimal(1))).rejects.toThrow("budget is exhausted");
    expect(db.prepare("SELECT subject FROM application_users").get()!.subject).toBe("owner");
    expect(db.prepare("SELECT run_id FROM runs").get()!.run_id).toBe("preserved-run");
    await validate_postgres_store(local);
  });
  it("preserves committed score reservations across idempotent PostgreSQL upgrades", async () => {
    const db = postgres_target(), root = directory();
    await initialize_fresh(root, local, { issuer: "issuer", subject: "owner" });
    const store = new WebStorage(root, { database_url: local });
    const score = ArrangementScore.parse({
      schema_version: 1, style: "retro-synth", tempo_bpm: 120, time_signature: "4/4",
      key_root: 0, mode: "major", bars: 8, progression: [0, 4, 5, 3], hook_motif: [0, 2, 4],
      tracks: [
        { instrument: "pad", events: [{ step: 0, degree: 0, duration_steps: 8 }] },
        { instrument: "bass", events: [{ step: 0, degree: 0, duration_steps: 2 }] },
        { instrument: "lead", events: [{ step: 0, degree: 0, duration_steps: 1 }] },
      ],
    });
    const reservation = {
      owner: "owner", logical_job_id: "score-job", request_sha256: "a".repeat(64),
      cost: "0.01", cap: "1", total: "5",
    };
    expect((await store.claim_score_compose(reservation)).claimed).toBe(true);
    await store.commit_score_compose("owner", "score-job", reservation.request_sha256, score, {
      provider: "injected", deployment: null,
    });
    await expect(store.claim_score_compose({ ...reservation, request_sha256: "b".repeat(64) }))
      .rejects.toBeInstanceOf(StorageConflict);
    await prepare_databases(root, { database_url: local, upgrade_postgres: true });
    await prepare_databases(root, { database_url: local, upgrade_postgres: true });
    const recovered = await store.claim_score_compose(reservation);
    expect(recovered).toMatchObject({ status: "committed", claimed: false, attempt_count: 1 });
    expect(JSON.parse(recovered.score_json ?? "null")).toEqual(score);
    expect(JSON.parse(recovered.provider_json ?? "null")).toEqual({ provider: "injected", deployment: null });
    db.exec("DROP TABLE score_reconciliations; DROP TABLE score_schema_migrations; ALTER TABLE score_reservations DROP COLUMN provider_json; ALTER TABLE score_reservations DROP COLUMN attempt_count");
    expect(await store.has_lyric_budget()).toBe(false);
    await prepare_databases(root, { database_url: local, upgrade_postgres: true });
    const upgraded_legacy = await store.claim_score_compose(reservation);
    expect(upgraded_legacy).toMatchObject({ status: "committed", claimed: false, attempt_count: 1, provider_json: null });
    expect(JSON.parse(upgraded_legacy.score_json ?? "null")).toEqual(score);
    expect(db.prepare("SELECT count(*) AS count FROM score_reservations").get()?.count).toBe(1);
  });
  it.each(["owner", "manifest", "audio-symlink", "artifact", "json", "wal", "schema", "out-of-range-seed"])("rejects unsafe source %s before touching target", async defect => {
    const root = directory(), { web, melody, output, job } = await source(root);
    const db = new DatabaseSync(web.database_path);
    if (defect === "owner") db.exec("UPDATE outputs SET owner='other'");
    if (defect === "manifest") db.exec(`UPDATE outputs SET manifest_json='{}'`);
    if (defect === "json") db.exec(`UPDATE runs SET brief_ids_json='{}'`);
    if (defect === "schema") db.exec("CREATE TABLE unrelated (value TEXT)");
    if (defect === "wal") db.exec("PRAGMA journal_mode=WAL");
    db.close();
    if (defect === "audio-symlink") {
      const file = join(web.audio_dir, output.file); rmSync(file); symlinkSync(join(root, ".earwyrm-initialized"), file);
    }
    if (defect === "artifact") writeFileSync(join(melody.artifact_dir, job.job_id, "backing.wav"), "corruption");
    if (defect === "out-of-range-seed") {
      const sourceDb = new DatabaseSync(melody.database_path);
      sourceDb.prepare("UPDATE render_jobs SET result_json=?").run(JSON.stringify(job).replace('"seed":42', '"seed":9223372036854775808'));
      sourceDb.close();
    }
    const target = postgres_target();
    await expect(import_sqlite(root, local)).rejects.toThrow();
    expect(user_tables(target)).toEqual([]);
  });
  it("rejects missing marker or database without creating replacement files", async () => {
    const root = directory(), { web } = await source(root);
    const db = postgres_target();
    rmSync(web.database_path);
    await expect(import_sqlite(root, local)).rejects.toThrow();
    expect(existsSync(web.database_path)).toBe(false);
    expect(user_tables(db)).toEqual([]);
  });
});

it.skipIf(!process.env.EARWYRM_TEST_DATABASE_URL)("uses real PostgreSQL for bootstrap, cross-instance locks, immutable evidence, jobs and atomic import", async () => {
  const url = process.env.EARWYRM_TEST_DATABASE_URL!, prefix = `earwyrm_test_${randomUUID().replaceAll("-", "")}`;
  const schemas = [prefix, `${prefix}_import`, `${prefix}_rollback`];
  const admin = new pg.Client(postgres_connection_options(url));
  await admin.connect();
  try {
    for (const schema of schemas) await admin.query(`CREATE SCHEMA ${schema}`);
    const schema_url = (schema: string): string => /^postgres(?:ql)?:\/\//.test(url)
      ? (() => { const parsed = new URL(url); parsed.searchParams.set("options", `-csearch_path=${schema}`); return parsed.href; })()
      : `${url} options='-csearch_path=${schema}'`;
    const test_url = schema_url(schemas[0]!);
    const root = directory();
    await initialize_fresh(root, test_url, { issuer: "issuer", subject: "owner" });
    await validate_postgres_store(test_url);
    const raw = '{"seed":9223372036854775807}', wire = new PostgresConnection(test_url, 0x4557524d02);
    try {
      const row = (await wire.execute("SELECT ?::json AS json_value, ?::jsonb AS jsonb_value", [raw, raw])).rows[0]!;
      for (const key of ["json_value", "jsonb_value"]) {
        expect(typeof row[key]).toBe("string");
        expect(parse_seed_json(String(row[key]))).toEqual({ seed: "9223372036854775807" });
      }
    } finally { await wire.close(); }
    // Different local roots intentionally bypass the in-process SQLite mutex.
    const first = new WebStorage(root, { database_url: test_url }), second = new WebStorage(directory(), { database_url: test_url });
    const bootstraps = await Promise.allSettled([first.bootstrap_owner("issuer", "owner"), second.bootstrap_owner("issuer", "other")]);
    expect(bootstraps.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(await first.list_users()).toHaveLength(1);
    const reserve = (suffix: string) => first.reserve_paid_run({ run_id: suffix, attempt_id: suffix, owner: suffix, brief_ids: ["brief"], per_brief_estimates: { brief: "0.01" }, estimated_cost_usd: "0.01", total_budget_usd: "1", submitted_characters: 100, evidence: {} });
    const results = await Promise.allSettled([reserve("a"), second.reserve_paid_run({ run_id: "b", attempt_id: "b", owner: "b", brief_ids: ["brief"], per_brief_estimates: { brief: "0.01" }, estimated_cost_usd: "0.01", total_budget_usd: "1", submitted_characters: 100, evidence: {} })]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: expect.any(StorageConflict) });
    const winner = results[0]!.status === "fulfilled" ? "a" : "b";
    expect(await second.get_attempt(winner, "not-owner")).toBeNull();
    await first.reconcile_attempt({ attempt_id: winner, owner: winner, actual_cost_usd: "0.99", evidence_reference: "real-pg-meter" });
    await expect(second.reserve_paid_run({ run_id: "over", attempt_id: "over", owner: "over", brief_ids: ["brief"], per_brief_estimates: { brief: "0.010000000000000000001" }, estimated_cost_usd: "0.010000000000000000001", total_budget_usd: "1", submitted_characters: 1, evidence: {} })).rejects.toThrow("budget");
    await reserve("exact");
    await expect(second.reconcile_attempt({ attempt_id: winner, owner: winner, actual_cost_usd: "0", evidence_reference: "overwrite" })).rejects.toBeInstanceOf(StorageConflict);
    await first.create_run("output-run", "owner", "instrumental", ["brief"]);
    const saved = await first.save_output({ run_id: "output-run", owner: "owner", manifest: { brief_id: "brief", variant: "instrumental" }, audio: Buffer.from("PG media") });
    const evaluation = { output_id: saved.output_id, owner: "owner", brand_transcription: "brand", cta_transcription: "cta", self_rating: "usable", brand_match: true, cta_match: true };
    expect((await Promise.all([first.save_evaluation(evaluation), second.save_evaluation({ ...evaluation, self_rating: "replaced" })])).sort()).toEqual([false, true]);
    expect(await second.get_output(saved.output_id, "not-owner")).toBeNull();
    const compositionRoot = join(root, "melody"), composerA = new MelodyService(compositionRoot, { database_url: test_url }), composerB = new MelodyService(compositionRoot, { database_url: test_url });
    const request = CompositionRequest.parse({ logical_job_id: "pg-concurrent", product_path: "vocoded", seed: 42, lyrics: "Cedar Loop brings bright sound to your day",
      lines: [{ text: "Cedar Loop brings bright sound to your day", syllables: ["Ce", "dar", "Loop", "brings", "bright", "sound", "to", "your", "day"], start_seconds: 3, end_seconds: 7 }] });
    const [jobA, jobB] = await Promise.all([composerA.submit(request), composerB.submit(request)]);
    expect(jobA).toEqual(jobB); expect(jobA.queue_backend).toBe("postgresql");
    expect((await composerA.read_artifact(jobA.job_id, "score.mid")).subarray(0, 4).toString()).toBe("MThd");
    expect(readdirSync(composerA.artifact_dir)).toHaveLength(1);

    const sourceRoot = directory(), legacy = await source(sourceRoot, "9223372036854775807");
    const webBefore = readFileSync(legacy.web.database_path), melodyBefore = readFileSync(legacy.melody.database_path);
    expect((await legacy.melody.get_job(legacy.job.job_id)).seed).toBe("9223372036854775807");
    expect(await legacy.melody.submit(legacy.request)).toEqual(legacy.job);
    const imported_url = schema_url(schemas[1]!);
    expect(await import_sqlite(sourceRoot, imported_url)).toMatchObject({ runs: 1, outputs: 1, render_jobs: 1, application_users: 1 });
    const importedWeb = new WebStorage(sourceRoot, { database_url: imported_url }), importedMelody = new MelodyService(join(sourceRoot, "melody"), { database_url: imported_url });
    expect(await importedWeb.get_user("issuer", "owner")).toMatchObject({ admin: 1 });
    expect(await importedWeb.get_run("run", "owner")).toMatchObject({ status: "rendering" });
    expect(await importedMelody.get_job(legacy.job.job_id)).toMatchObject({ logical_job_id: "migration", seed: "9223372036854775807" });
    expect(await importedMelody.submit(legacy.request)).toEqual(legacy.job);
    const preserved = await admin.query(`SELECT request_json,result_json FROM ${schemas[1]}.render_jobs WHERE job_id=$1`, [legacy.job.job_id]);
    expect(preserved.rows[0].request_json).toContain('"seed":9223372036854775807');
    expect(preserved.rows[0].result_json).toContain('"seed":9223372036854775807');
    expect(await importedMelody.read_artifact(legacy.job.job_id, "score.mid")).toEqual(readFileSync(join(legacy.melody.artifact_dir, legacy.job.job_id, "score.mid")));
    expect(readFileSync(legacy.web.database_path)).toEqual(webBefore); expect(readFileSync(legacy.melody.database_path)).toEqual(melodyBefore);
    expect(readFileSync(join(legacy.web.audio_dir, legacy.output.file)).toString()).toBe("preserve private media");
    await expect(import_sqlite(sourceRoot, imported_url)).rejects.toThrow("empty target");

    const rollback_url = schema_url(schemas[2]!);
    const execute = PostgresConnection.prototype.execute;
    const failure = vi.spyOn(PostgresConnection.prototype, "execute").mockImplementation(async function (this: PostgresConnection, statement, parameters) {
      if (statement.startsWith("INSERT INTO outputs")) throw new Error("simulated real PostgreSQL partial import");
      return execute.call(this, statement, parameters);
    });
    await expect(import_sqlite(sourceRoot, rollback_url)).rejects.toThrow("partial import");
    failure.mockRestore();
    expect((await admin.query("SELECT to_regclass($1) AS table_name", [`${schemas[2]}.runs`])).rows[0].table_name).toBeNull();
    expect((await admin.query("SELECT to_regclass($1) AS table_name", [`${schemas[2]}.earwyrm_store_metadata`])).rows[0].table_name).toBeNull();
    expect(readFileSync(legacy.web.database_path)).toEqual(webBefore);
    const schemaFailure = vi.spyOn(MelodyService, "_create_schema").mockRejectedValueOnce(new Error("simulated schema failure"));
    await expect(initialize_fresh(directory(), rollback_url, { issuer: "issuer", subject: "owner" })).rejects.toThrow("schema failure");
    schemaFailure.mockRestore();
    await expect(validate_postgres_store(rollback_url)).rejects.toBeInstanceOf(StoreNotInitialized);

    await admin.query(`DROP TABLE ${schemas[0]}.outputs CASCADE`);
    const before = readdirSync(first.audio_dir);
    await expect(first.save_output({ run_id: "output-run", owner: "owner", manifest: { brief_id: "brief", variant: "after-drop" }, audio: Buffer.from("must remove") })).rejects.toBeInstanceOf(pg.DatabaseError);
    expect(readdirSync(first.audio_dir)).toEqual(before);
    await expect(validate_postgres_store(test_url)).rejects.toBeInstanceOf(StoreNotInitialized);
    expect(existsSync(first.database_path)).toBe(false); expect(existsSync(composerA.database_path)).toBe(false);
  } finally {
    try { for (const schema of schemas) await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); }
    finally { await admin.end(); }
  }
});
