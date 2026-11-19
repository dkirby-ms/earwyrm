import { chmodSync, mkdirSync, realpathSync, writeFileSync, rmSync, lstatSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { Decimal } from "decimal.js";
import { PostgresConnection, SqliteConnection, serialized, transaction, type Connection, type Row } from "./persistence.js";
import { prepare_database_file } from "./sqlite_files.js";
import { STATIC_ROOT } from "./paths.js";
import type { LyricRequest, LyricResult } from "./lyrics.js";
import type { PaidLyricAction } from "./lyric_budget.js";
import type { MelodyService } from "./melody_service.js";
import { complete_preview, create_preview_schema, pin_preview, prune_previews, reserve_preview } from "./preview_quota.js";

const Money = Decimal.clone({ precision: 28 });
export { STATIC_ROOT };
/** A durable reservation or immutable record prevents this operation. */
export class StorageConflict extends Error {}
/** No record belongs to the supplied owner. */
export class StorageNotFound extends Error {}
/** The exact issuer and subject lack the required application permission. */
export class StorageAccessDenied extends Error {}
/** Explicit PostgreSQL selection; omission retains SQLite without fallback. */
export interface StorageOptions { database_url?: string | null }
/** Operator-managed application permissions, not identity-provider accounts. */
export interface UserPermissions { enabled: boolean; admin: boolean; paid_speech: boolean }
/** The persisted authorization row uses integer flags for schema compatibility. */
export interface UserRecord extends Row {
  issuer: string; subject: string; enabled: number; admin: number; paid_speech: number; created_at: string;
}
/** A single current access request; resubmission rotates its ID and refreshes its timestamps. */
export interface AccessRequestRecord extends Row {
  request_id: string; issuer: string; subject: string; status: "pending" | "approved" | "denied";
  created_at: string; updated_at: string; email: string | null;
}
/** Request submission never grants permissions; enabled users are not queued. */
export type AccessRequestSubmission =
  | { status: "already_enabled" }
  | { status: "pending"; request: AccessRequestRecord };
/** Render evidence is preserved without imposing a new manifest schema. */
export interface Manifest {
  brief_id: string; variant: string; output_id?: string; file?: string;
  azure_usage?: Record<string, unknown>;
  [key: string]: unknown;
}
/** Private output metadata; callers must retain owner checks before reading audio. */
export interface OutputRecord {
  output_id: string; run_id: string; brief_id: string; variant: string; audio_filename: string;
  manifest: Manifest; evaluation: Record<string, unknown> | null; attempt: AttemptRecord | null;
}
/** Paid-attempt evidence, including immutable reconciliation when available. */
export interface AttemptRecord {
  attempt_id: string; run_id?: string; owner?: string; brief_ids: string[];
  per_brief_estimates: Record<string, string>; estimated_cost_usd: string; submitted_characters: number;
  status: string; evidence: Record<string, unknown>; actual_cost_usd: string | null; reconciliation_reference: string | null;
}
/** Recoverable render status and its owner-filtered outputs. */
export interface RunRecord {
  run_id: string; mode: string; brief_ids: string[]; status: string; created_at: string;
  outputs: OutputRecord[]; attempt?: { attempt_id: string; status: string; estimated_cost_usd: string; actual_cost_usd: string | null; reconciliation_reference: string | null };
}
/** All monetary values are USD decimals; reservation serializes globally across owners. */
export interface PaidRunOptions {
  run_id: string; attempt_id: string; owner: string; brief_ids: string[];
  per_brief_estimates: Record<string, string>; estimated_cost_usd: Decimal.Value; submitted_characters: number;
  total_budget_usd: Decimal.Value; evidence: Record<string, unknown>; issuer?: string | null;
}
/** First-submission-only human evaluation evidence. */
export interface EvaluationOptions {
  output_id: string; owner: string; brand_transcription: string; cta_transcription: string;
  self_rating: string; brand_match: boolean; cta_match: boolean;
}
/** Server-owned screening outcome; only accepted results can be selected for rendering. */
export interface StoredLyricOption {
  option_id: string; brief_id: string; request: LyricRequest; result: LyricResult;
}

/** Stable JSON for idempotent requests; rejects non-finite numbers instead of replacing them with null. */
export function canonical_json(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (typeof item === "number" && !Number.isFinite(item)) throw new TypeError("JSON numbers must be finite");
    if (Array.isArray(item)) return item.map(normalize);
    if (item !== null && typeof item === "object") return Object.fromEntries(Object.keys(item).sort().map(key => [key, normalize((item as Record<string, unknown>)[key])]));
    return item;
  };
  const result = JSON.stringify(normalize(value));
  if (result === undefined) throw new TypeError("Value is not JSON serializable");
  return result;
}
/** Resolve a private root, including existing symlink ancestors, before containment checks. */
export function private_root(root: string): string {
  let path = resolve(root === "~" ? homedir() : root.startsWith("~/") ? join(homedir(), root.slice(2)) : root);
  const suffix: string[] = [];
  while (true) {
    try { return join(realpathSync(path), ...suffix); }
    catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
      suffix.unshift(basename(path)); path = dirname(path);
    }
  }
}
/** Creates owner-scoped records and private media; every operation awaits initialization. */
export class WebStorage {
  readonly root: string;
  readonly audio_dir: string;
  readonly work_dir: string;
  readonly database_path: string;
  readonly database_url: string | null;
  private ready: Promise<void> | undefined;
  constructor(root: string, options: StorageOptions = {}) {
    this.root = private_root(root);
    const static_root = private_root(STATIC_ROOT);
    const child = relative(static_root, this.root);
    if (!child || (!child.startsWith(`..${sep}`) && child !== ".." && !child.startsWith(sep))) throw new TypeError("Private data directory must be outside the frontend static root");
    this.audio_dir = join(this.root, "audio");
    this.work_dir = join(this.root, "work");
    this.database_path = join(this.root, "earwyrm.sqlite3");
    this.database_url = options.database_url ?? null;
    for (const path of [this.root, this.audio_dir, this.work_dir]) {
      mkdirSync(path, { recursive: true, mode: 0o700 });
      if (lstatSync(path).isSymbolicLink()) throw new TypeError("Private data directories must not be symlinks");
      chmodSync(path, 0o700);
    }
    if (this.database_url === null) prepare_database_file(this.database_path, join(this.root, ".earwyrm-initialized"));
  }
  private async initialized(): Promise<void> {
    this.ready ??= this.database_url === null ? this._initialize() : Promise.resolve();
    await this.ready;
  }
  /** Awaits local schema readiness; PostgreSQL schemas are never initialized on startup. */
  async init(): Promise<void> { await this.initialized(); }
  /** Opens an existing database; this never creates a missing SQLite file. */
  async _connect(): Promise<Connection> {
    return this.database_url !== null ? new PostgresConnection(this.database_url, 0x4557524d01) : new SqliteConnection(this.database_path);
  }
  /** Explicit schema creation for bootstrap; PostgreSQL startup must validate, not call this. */
  async _initialize(): Promise<void> {
    await serialized(this.database_path, async () => transaction(await this._connect(), WebStorage._create_schema));
  }
  /** Creates base web tables and additive access/lyric tables inside the caller's transaction. */
  static async _create_schema(connection: Connection): Promise<void> {
    await connection.executescript(`
      CREATE TABLE IF NOT EXISTS runs (
        run_id TEXT PRIMARY KEY, owner TEXT NOT NULL,
        mode TEXT NOT NULL CHECK (mode IN ('instrumental', 'azure')),
        brief_ids_json TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS runs_owner_created ON runs(owner, created_at);
      CREATE TABLE IF NOT EXISTS paid_attempts (
        attempt_id TEXT PRIMARY KEY, run_id TEXT NOT NULL UNIQUE REFERENCES runs(run_id),
        owner TEXT NOT NULL, brief_ids_json TEXT NOT NULL, per_brief_estimates_json TEXT NOT NULL,
        estimated_cost_usd TEXT NOT NULL, submitted_characters INTEGER NOT NULL,
        status TEXT NOT NULL, evidence_json TEXT NOT NULL, created_at TEXT NOT NULL,
        actual_cost_usd TEXT, reconciliation_reference TEXT, reconciled_at TEXT);
      CREATE TABLE IF NOT EXISTS outputs (
        output_id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(run_id),
        owner TEXT NOT NULL, brief_id TEXT NOT NULL, variant TEXT NOT NULL,
        audio_filename TEXT NOT NULL UNIQUE, manifest_json TEXT NOT NULL, created_at TEXT NOT NULL,
        UNIQUE(run_id, brief_id, variant));
      CREATE INDEX IF NOT EXISTS outputs_owner_created ON outputs(owner, created_at);
      CREATE TABLE IF NOT EXISTS evaluations (
        output_id TEXT PRIMARY KEY REFERENCES outputs(output_id), owner TEXT NOT NULL,
        brand_transcription TEXT NOT NULL, cta_transcription TEXT NOT NULL,
        self_rating TEXT NOT NULL, brand_match INTEGER NOT NULL, cta_match INTEGER NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS application_identity (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1), issuer TEXT NOT NULL UNIQUE);
      CREATE TABLE IF NOT EXISTS application_users (
        issuer TEXT NOT NULL REFERENCES application_identity(issuer), subject TEXT NOT NULL,
        enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)), admin INTEGER NOT NULL CHECK (admin IN (0, 1)),
        paid_speech INTEGER NOT NULL CHECK (paid_speech IN (0, 1)), created_at TEXT NOT NULL,
        PRIMARY KEY (issuer, subject));
    `);
    await WebStorage._create_access_request_schema(connection);
    await WebStorage._create_lyric_schema(connection);
    await WebStorage._create_lyric_budget_schema(connection);
    await create_preview_schema(connection);
  }

  /** Adds the current access-request record without changing existing permissions. */
  static async _create_access_request_schema(connection: Connection): Promise<void> {
    await connection.executescript(`
      CREATE TABLE IF NOT EXISTS access_requests (
        request_id TEXT PRIMARY KEY,
        issuer TEXT NOT NULL REFERENCES application_identity(issuer), subject TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'denied')),
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        UNIQUE (issuer, subject));
      CREATE INDEX IF NOT EXISTS access_requests_status_created ON access_requests(status, created_at, request_id);
    `);
    const columns = connection instanceof SqliteConnection
      ? (await connection.execute("PRAGMA table_info(access_requests)")).rows.map(row => row.name)
      : (await connection.execute(
        "SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'access_requests'",
      )).rows.map(row => row.column_name);
    if (!columns.includes("email")) await connection.execute("ALTER TABLE access_requests ADD COLUMN email TEXT");
  }

  /** Adds content-free, cumulative reservations without resetting existing spend. */
  static async _create_lyric_budget_schema(connection: Connection): Promise<void> {
    await connection.execute(`CREATE TABLE IF NOT EXISTS lyric_reservations (
      reservation_id TEXT PRIMARY KEY, action TEXT NOT NULL CHECK (action IN ('discuss','write','options')),
      reserved_usd TEXT NOT NULL, created_at TEXT NOT NULL)`);
  }

  /** Confirms the explicit PostgreSQL upgrade without running DDL from the web app. */
  async has_lyric_budget(): Promise<boolean> {
    if (this.database_url === null) return true;
    return this.read(async c => Boolean((await c.execute("SELECT to_regclass('lyric_reservations') AS name")).rows[0]?.name));
  }

  /** Commits the full upper bound before provider calls; no attempt is automatically refunded. */
  async reserve_lyric_action(action: PaidLyricAction, cost: Decimal, cap: Decimal, total: Decimal): Promise<void> {
    if (cost.gt(cap)) throw new StorageConflict('This text action exceeds the per-action spending limit.');
    await this.write(async c => {
      let projected = new Money(cost);
      for (const row of (await c.execute('SELECT reserved_usd FROM lyric_reservations')).rows) {
        const amount = new Money(String(row.reserved_usd));
        if (!amount.isFinite() || amount.lte(0)) throw new Error('Invalid text budget reservation');
        projected = projected.plus(amount);
        if (projected.gt(total)) break;
      }
      if (projected.gt(total)) throw new StorageConflict('The chat and lyrics spending budget is exhausted.');
      await c.execute('INSERT INTO lyric_reservations VALUES (?, ?, ?, ?)',
        [randomUUID(), action, cost.toFixed(), new Date().toISOString()]);
    });
  }
  /** Additive schema used by SQLite initialization and the explicit PostgreSQL upgrade. */
  static async _create_lyric_schema(connection: Connection): Promise<void> {
    await connection.executescript(`
      CREATE TABLE IF NOT EXISTS lyric_options (
        option_id TEXT PRIMARY KEY, owner TEXT NOT NULL, brief_id TEXT NOT NULL,
        request_json TEXT NOT NULL, result_json TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS lyric_options_owner_brief ON lyric_options(owner, brief_id);
    `);
  }
  /** Persists the screened request/result without accepting a browser-supplied status or text. */
  async save_lyric_option(owner: string, request: LyricRequest, result: LyricResult): Promise<StoredLyricOption> {
    const option_id = randomUUID(), brief_id = request.brief.brief_id;
    await this.write(async c => {
      await c.execute("INSERT INTO lyric_options VALUES (?, ?, ?, ?, ?, ?)",
        [option_id, owner, brief_id, canonical_json(request), canonical_json(result), new Date().toISOString()]);
    });
    return { option_id, brief_id, request, result };
  }
  /** Returns only this owner's generated drafts, oldest first, including held outcomes. */
  async list_lyric_options(owner: string): Promise<StoredLyricOption[]> {
    return this.read(async c => (await c.execute(
      "SELECT option_id, brief_id, request_json, result_json FROM lyric_options WHERE owner = ? ORDER BY created_at, option_id", [owner],
    )).rows.map(row => ({
      option_id: String(row.option_id), brief_id: String(row.brief_id),
      request: JSON.parse(String(row.request_json)) as LyricRequest,
      result: JSON.parse(String(row.result_json)) as LyricResult,
    })));
  }
  /** Other owners' IDs are indistinguishable from absent IDs. */
  async get_lyric_option(option_id: string, owner: string): Promise<StoredLyricOption | null> {
    return this.read(async c => {
      const row = (await c.execute(
        "SELECT brief_id, request_json, result_json FROM lyric_options WHERE option_id = ? AND owner = ?", [option_id, owner],
      )).rows[0];
      return row ? {
        option_id, brief_id: String(row.brief_id), request: JSON.parse(String(row.request_json)) as LyricRequest,
        result: JSON.parse(String(row.result_json)) as LyricResult,
      } : null;
    });
  }
  private async read<T>(operation: (connection: Connection) => Promise<T>): Promise<T> {
    await this.initialized();
    const connection = await this._connect();
    try { return await operation(connection); } finally { await connection.close(); }
  }
  private async write<T>(operation: (connection: Connection) => Promise<T>): Promise<T> {
    await this.initialized();
    return serialized(this.database_path, async () => transaction(await this._connect(), operation));
  }
  /** Reserves all three previews before generation; failed/incomplete batches remain charged. */
  async reserve_previews(melody: MelodyService, owner: string, key: string, logical_ids: string[]): Promise<void> {
    const expired = await this.write(c => prune_previews(c, this.root, melody));
    for (const job_id of expired) await melody.expire_preview(job_id);
    await this.write(c => reserve_preview(c, this.root, melody, owner, key, logical_ids));
  }
  /** Settles a fully published batch to its measured durable media bytes. */
  async complete_previews(melody: MelodyService, key: string): Promise<void> {
    await this.write(c => complete_preview(c, this.root, melody, key));
  }
  /** Protects a selected batch from expiry before any downstream artifact reads. */
  async pin_preview(melody: MelodyService, job_id: string, owner: string): Promise<boolean> {
    return this.write(c => pin_preview(c, this.root, melody, job_id, owner));
  }
  private static validate_identity(issuer: string, subject: string): void {
    if ([issuer, subject].some(v => !v || v !== v.trim() || [...v].length > 1024)) throw new TypeError("Issuer and subject must be nonempty exact values");
  }
  /** Adds the sole enabled administrator inside a caller-owned transaction. */
  static async _bootstrap_owner(connection: Connection, issuer: string, subject: string): Promise<void> {
    WebStorage.validate_identity(issuer, subject);
    if ((await connection.execute("SELECT 1 FROM application_identity")).rows.length) throw new StorageConflict("Application identity is already initialized");
    if ((await connection.execute("SELECT 1 FROM application_users LIMIT 1")).rows.length) throw new StorageConflict("Application users are not empty");
    await connection.execute("INSERT INTO application_identity VALUES (1, ?)", [issuer]);
    await connection.execute("INSERT INTO application_users VALUES (?, ?, 1, 1, 1, ?)", [issuer, subject, new Date().toISOString()]);
  }
  /** Creates the sole initial admin once; revocation never enables bootstrap replay. */
  async bootstrap_owner(issuer: string, subject: string): Promise<void> {
    WebStorage.validate_identity(issuer, subject);
    await this.write(c => WebStorage._bootstrap_owner(c, issuer, subject));
  }
  /** Exact issuer-and-subject lookup; null never grants access. */
  async get_user(issuer: string, subject: string): Promise<UserRecord | null> {
    WebStorage.validate_identity(issuer, subject);
    return this.read(async c => (await c.execute("SELECT * FROM application_users WHERE issuer = ? AND subject = ?", [issuer, subject])).rows[0] as UserRecord ?? null);
  }
  /** Operator-only listing in issuer/subject order; HTTP callers must use the admin variant. */
  async list_users(): Promise<UserRecord[]> {
    return this.read(async c => (await c.execute("SELECT * FROM application_users ORDER BY issuer, subject")).rows as UserRecord[]);
  }
  private async require_admin(c: Connection, issuer: string, subject: string): Promise<void> {
    const row = (await c.execute("SELECT enabled, admin FROM application_users WHERE issuer = ? AND subject = ?", [issuer, subject])).rows[0];
    if (!row?.enabled || !row.admin) throw new StorageAccessDenied("Administrator access is required");
  }
  /** Atomically rechecks admin access before disclosing the user list. */
  async list_users_as_admin(issuer: string, subject: string): Promise<UserRecord[]> {
    WebStorage.validate_identity(issuer, subject);
    return this.write(async c => {
      await this.require_admin(c, issuer, subject);
      return (await c.execute("SELECT * FROM application_users ORDER BY issuer, subject")).rows as UserRecord[];
    });
  }
  /** Returns the current request status, or null when the identity has never requested access. */
  async get_access_request(issuer: string, subject: string): Promise<AccessRequestRecord | null> {
    WebStorage.validate_identity(issuer, subject);
    return this.read(async c => (await c.execute(
      "SELECT * FROM access_requests WHERE issuer = ? AND subject = ?", [issuer, subject],
    )).rows[0] as AccessRequestRecord ?? null);
  }
  /**
   * Queues an exact identity once, returning `already_enabled` without creating a request for enabled users.
   *
   * Email is display-only token metadata. Pending submissions refresh available email without changing queue order.
   * @returns The current pending record, or a new pending record after a decision.
   */
  async request_access(issuer: string, subject: string, email: string | null = null): Promise<AccessRequestSubmission> {
    WebStorage.validate_identity(issuer, subject);
    return this.write(async c => {
      const user = (await c.execute(
        "SELECT enabled FROM application_users WHERE issuer = ? AND subject = ?", [issuer, subject],
      )).rows[0];
      if (user?.enabled) return { status: "already_enabled" };

      const existing = (await c.execute(
        "SELECT * FROM access_requests WHERE issuer = ? AND subject = ?", [issuer, subject],
      )).rows[0] as AccessRequestRecord | undefined;
      if (existing?.status === "pending") {
        if (email !== null && email !== existing.email) {
          await c.execute("UPDATE access_requests SET email = ? WHERE request_id = ?", [email, existing.request_id]);
          existing.email = email;
        }
        return { status: "pending", request: existing };
      }

      const request_id = randomUUID(), now = new Date().toISOString();
      if (existing) {
        await c.execute(
          "UPDATE access_requests SET request_id = ?, status = 'pending', created_at = ?, updated_at = ?, email = ? WHERE issuer = ? AND subject = ?",
          [request_id, now, now, email, issuer, subject],
        );
      } else {
        await c.execute(
          "INSERT INTO access_requests (request_id, issuer, subject, status, created_at, updated_at, email) VALUES (?, ?, ?, 'pending', ?, ?, ?)",
          [request_id, issuer, subject, now, now, email],
        );
      }
      return {
        status: "pending",
        request: { request_id, issuer, subject, status: "pending", created_at: now, updated_at: now, email },
      };
    });
  }
  /**
   * Lists pending requests in creation order after rechecking the actor's current admin permission.
   *
   * @returns Pending requests, or an empty array when the queue is empty.
   */
  async list_access_requests_as_admin(issuer: string, subject: string): Promise<AccessRequestRecord[]> {
    WebStorage.validate_identity(issuer, subject);
    return this.write(async c => {
      await this.require_admin(c, issuer, subject);
      return (await c.execute(
        "SELECT * FROM access_requests WHERE status = 'pending' ORDER BY created_at, request_id",
      )).rows as AccessRequestRecord[];
    });
  }
  /**
   * Atomically records a pending decision and grants baseline permissions only on approval.
   *
   * @throws `StorageNotFound` when `request_id` is unknown.
   * @throws `StorageConflict` when the request is no longer pending.
   * @throws `StorageAccessDenied` when the actor is not a current administrator.
   */
  async decide_access_request_as_admin(
    actor_issuer: string, actor_subject: string, request_id: string, decision: "approved" | "denied",
  ): Promise<AccessRequestRecord> {
    WebStorage.validate_identity(actor_issuer, actor_subject);
    if (!request_id || request_id !== request_id.trim()) throw new TypeError("Request ID must be a nonempty exact value");
    return this.write(async c => {
      await this.require_admin(c, actor_issuer, actor_subject);
      const row = (await c.execute(
        "SELECT * FROM access_requests WHERE request_id = ?", [request_id],
      )).rows[0] as AccessRequestRecord | undefined;
      if (!row) throw new StorageNotFound("Access request was not found");
      if (row.status !== "pending") throw new StorageConflict("Access request is no longer pending");

      const updated_at = new Date().toISOString();
      const result = await c.execute(
        "UPDATE access_requests SET status = ?, updated_at = ? WHERE request_id = ? AND status = 'pending'",
        [decision, updated_at, request_id],
      );
      if (result.rowcount !== 1) throw new StorageConflict("Access request is no longer pending");
      if (decision === "approved") {
        await this.set_locked(c, row.issuer, row.subject, { enabled: true, admin: false, paid_speech: false });
      }
      return { ...row, status: decision, updated_at };
    });
  }
  private async set_locked(c: Connection, issuer: string, subject: string, options: UserPermissions): Promise<void> {
    const row = (await c.execute("SELECT issuer FROM application_identity WHERE singleton = 1")).rows[0];
    if (row?.issuer !== issuer) throw new StorageAccessDenied("Issuer does not match the bootstrapped store");
    await c.execute(`INSERT INTO application_users (issuer, subject, enabled, admin, paid_speech, created_at)
      VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (issuer, subject) DO UPDATE SET enabled = excluded.enabled,
      admin = excluded.admin, paid_speech = excluded.paid_speech`,
    [issuer, subject, Number(options.enabled), Number(options.admin), Number(options.paid_speech), new Date().toISOString()]);
  }
  /** Operator-only upsert bound to the bootstrapped issuer. */
  async set_user(issuer: string, subject: string, options: UserPermissions): Promise<void> {
    WebStorage.validate_identity(issuer, subject);
    await this.write(c => this.set_locked(c, issuer, subject, options));
  }
  /** Rechecks the acting administrator under the same lock as the update. */
  async set_user_as_admin(actor_issuer: string, actor_subject: string, issuer: string, subject: string, options: UserPermissions): Promise<void> {
    WebStorage.validate_identity(actor_issuer, actor_subject); WebStorage.validate_identity(issuer, subject);
    await this.write(async c => { await this.require_admin(c, actor_issuer, actor_subject); await this.set_locked(c, issuer, subject, options); });
  }
  /** Starts an instrumental run without making a paid reservation. */
  async create_run(run_id: string, owner: string, mode: string, brief_ids: string[]): Promise<void> {
    await this.write(async c => { await c.execute("INSERT INTO runs VALUES (?, ?, ?, ?, ?, ?)", [run_id, owner, mode, canonical_json(brief_ids), "rendering", new Date().toISOString()]); });
  }
  /** Indicates whether any owner's reservation blocks further paid work. */
  async has_unreconciled_paid_attempt(): Promise<boolean> {
    return this.read(async c => (await c.execute("SELECT 1 FROM paid_attempts WHERE status != 'reconciled' LIMIT 1")).rows.length !== 0);
  }
  /** Atomically reserves the cumulative budget before any provider submission. */
  async reserve_paid_run(options: PaidRunOptions): Promise<void> {
    const o = options;
    const estimate = new Money(o.estimated_cost_usd);
    const budget = new Money(o.total_budget_usd);
    if (!estimate.isFinite() || estimate.isNegative() || !budget.isFinite() || budget.isNegative()) throw new TypeError("Costs must be finite nonnegative USD amounts");
    await this.write(async c => {
      if (o.issuer != null && !(await c.execute("SELECT 1 FROM application_users WHERE issuer = ? AND subject = ? AND enabled = 1 AND paid_speech = 1", [o.issuer, o.owner])).rows.length) throw new StorageAccessDenied("Paid Speech access is not enabled");
      if ((await c.execute("SELECT 1 FROM paid_attempts WHERE status != 'reconciled' LIMIT 1")).rows.length) throw new StorageConflict("A prior paid attempt needs reconciliation");
      let spent = new Money(0);
      for (const row of (await c.execute("SELECT status, estimated_cost_usd, actual_cost_usd FROM paid_attempts")).rows) {
        const cost = new Money(String(row.status === "reconciled" ? row.actual_cost_usd : row.estimated_cost_usd));
        if (!cost.isFinite() || cost.isNegative()) throw new StorageConflict("Paid ledger contains an invalid cost");
        spent = spent.plus(cost);
      }
      if (spent.plus(estimate).gt(budget)) throw new StorageConflict("Cumulative Speech budget would be exceeded");
      const now = new Date().toISOString();
      await c.execute("INSERT INTO runs VALUES (?, ?, ?, ?, ?, ?)", [o.run_id, o.owner, "azure", canonical_json(o.brief_ids), "rendering", now]);
      await c.execute(`INSERT INTO paid_attempts (attempt_id, run_id, owner, brief_ids_json, per_brief_estimates_json, estimated_cost_usd, submitted_characters, status, evidence_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [o.attempt_id, o.run_id, o.owner, canonical_json(o.brief_ids), canonical_json(o.per_brief_estimates), estimate.toString(), o.submitted_characters, "reserved", canonical_json(o.evidence), now]);
    });
  }
  private async update_attempt(attempt_id: string, status: string): Promise<void> {
    await this.write(async c => {
      if ((await c.execute("UPDATE paid_attempts SET status = ? WHERE attempt_id = ? AND status != 'reconciled'", [status, attempt_id])).rowcount !== 1) {
        if ((await c.execute("SELECT 1 FROM paid_attempts WHERE attempt_id = ?", [attempt_id])).rows.length) throw new StorageConflict("Paid attempt is already reconciled");
        throw new StorageNotFound("Paid attempt was not found");
      }
    });
  }
  /** Records provider submission without releasing its reservation. */
  async mark_attempt_submitted(attempt_id: string): Promise<void> { await this.update_attempt(attempt_id, "submitted"); }
  /** Failure and completion both require later reconciliation before retry. */
  async finish_attempt(attempt_id: string, status: string): Promise<void> {
    if (!["awaiting_reconciliation", "failed_or_unknown"].includes(status)) throw new TypeError("Invalid paid-attempt status");
    await this.update_attempt(attempt_id, status);
  }
  /** Updates an internal render identity; throws if it does not exist. */
  async set_run_status(run_id: string, status: string): Promise<void> {
    await this.write(async c => { if ((await c.execute("UPDATE runs SET status = ? WHERE run_id = ?", [status, run_id])).rowcount !== 1) throw new StorageNotFound("Render run was not found"); });
  }
  /** Writes private media and removes it if insertion fails; mutates the manifest with its opaque ID. */
  async save_output(options: { run_id: string; owner: string; manifest: Manifest; audio: Uint8Array; attempt_id?: string | null }): Promise<Manifest & { output_id: string; file: string }> {
    const { run_id, owner, manifest, audio, attempt_id } = options;
    if (typeof manifest.composition_source === "object" && manifest.composition_source !== null &&
        "kind" in manifest.composition_source && manifest.composition_source.kind === "guided-preview" &&
        audio.byteLength > 1.5 * 1024 * 1024) throw new RangeError("Preview audio exceeds its storage reservation");
    const output_id = randomUUID(), filename = `${output_id}.wav`, path = join(this.audio_dir, filename);
    const result = Object.assign(manifest, { output_id, file: filename });
    if (attempt_id != null) {
      if (!manifest.azure_usage) throw new TypeError("Paid output requires azure_usage");
      manifest.azure_usage.attempt_id = attempt_id;
    }
    let committed = false;
    try {
      await this.write(async c => {
        const run = (await c.execute("SELECT 1 FROM runs WHERE run_id = ? AND owner = ?", [run_id, owner])).rows[0];
        if (!run) throw new StorageNotFound("Render run was not found");
        if (attempt_id != null && !(await c.execute("SELECT 1 FROM paid_attempts WHERE attempt_id = ? AND run_id = ? AND owner = ?", [attempt_id, run_id, owner])).rows.length) throw new StorageNotFound("Paid attempt was not found");
        writeFileSync(path, audio, { mode: 0o600, flag: "wx" });
        await c.execute("INSERT INTO outputs (output_id, run_id, owner, brief_id, variant, audio_filename, manifest_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [output_id, run_id, owner, manifest.brief_id, manifest.variant, filename, canonical_json(manifest), new Date().toISOString()]);
      });
      committed = true;
      return result;
    } finally { if (!committed) rmSync(path, { force: true }); }
  }
  private output_select(): string {
    return `SELECT o.*, e.brand_transcription, e.cta_transcription, e.self_rating, e.brand_match, e.cta_match,
      e.created_at AS evaluation_created_at, a.attempt_id, a.status AS attempt_status,
      a.brief_ids_json AS attempt_brief_ids_json, a.per_brief_estimates_json, a.estimated_cost_usd,
      a.submitted_characters, a.evidence_json AS attempt_evidence_json, a.actual_cost_usd, a.reconciliation_reference
      FROM outputs o LEFT JOIN evaluations e ON e.output_id = o.output_id LEFT JOIN paid_attempts a ON a.run_id = o.run_id`;
  }
  private output(row: Row): OutputRecord {
    return {
      output_id: String(row.output_id), run_id: String(row.run_id), brief_id: String(row.brief_id), variant: String(row.variant), audio_filename: String(row.audio_filename),
      manifest: JSON.parse(String(row.manifest_json)) as Manifest,
      evaluation: row.evaluation_created_at === null ? null : { brand_transcription: row.brand_transcription, cta_transcription: row.cta_transcription, self_rating: row.self_rating, brand_match: Boolean(row.brand_match), cta_match: Boolean(row.cta_match), created_at: row.evaluation_created_at },
      attempt: row.attempt_id === null ? null : this.attempt({ ...row, status: row.attempt_status!, brief_ids_json: row.attempt_brief_ids_json!, evidence_json: row.attempt_evidence_json! }, false),
    };
  }
  /** Returns null for absent records and other owners alike. */
  async get_output(output_id: string, owner: string): Promise<OutputRecord | null> {
    return this.read(async c => { const row = (await c.execute(this.output_select() + " WHERE o.output_id = ? AND o.owner = ?", [output_id, owner])).rows[0]; return row ? this.output(row) : null; });
  }
  /** Lists only this owner's outputs in stable creation/ID order. */
  async list_outputs(owner: string): Promise<OutputRecord[]> {
    return this.read(async c => (await c.execute(this.output_select() + " WHERE o.owner = ? ORDER BY o.created_at, o.output_id", [owner])).rows.map(r => this.output(r)));
  }
  /** Resolves a previously authorized output's safe filename; does not itself authorize a caller. */
  async audio_path(output: Pick<OutputRecord, "audio_filename">): Promise<string> {
    const filename = output.audio_filename;
    if (!filename || basename(filename) !== filename || /[/\\]/.test(filename) || !filename.endsWith(".wav")) throw new TypeError("Stored audio filename is invalid");
    const path = join(this.audio_dir, filename);
    if (lstatSync(this.audio_dir).isSymbolicLink() || lstatSync(path).isSymbolicLink()) throw new TypeError("Stored audio path is unsafe");
    return path;
  }
  /** Recovers one owner's run, including outputs and any paid attempt. */
  async get_run(run_id: string, owner: string): Promise<RunRecord | null> {
    const pair = await this.read(async c => {
      const row = (await c.execute("SELECT * FROM runs WHERE run_id = ? AND owner = ?", [run_id, owner])).rows[0];
      if (!row) return null;
      const attempt = (await c.execute("SELECT * FROM paid_attempts WHERE run_id = ? AND owner = ?", [run_id, owner])).rows[0];
      return { row, attempt };
    });
    if (!pair) return null;
    const { row, attempt } = pair;
    return { run_id: String(row.run_id), mode: String(row.mode), brief_ids: JSON.parse(String(row.brief_ids_json)) as string[], status: String(row.status), created_at: String(row.created_at), outputs: (await this.list_outputs(owner)).filter(o => o.run_id === run_id),
      ...(attempt ? { attempt: { attempt_id: String(attempt.attempt_id), status: String(attempt.status), estimated_cost_usd: String(attempt.estimated_cost_usd), actual_cost_usd: attempt.actual_cost_usd as string | null, reconciliation_reference: attempt.reconciliation_reference as string | null } } : {}) };
  }
  /** Lists recoverable runs newest first without exposing other owners. */
  async list_runs(owner: string): Promise<RunRecord[]> {
    const rows = await this.read(async c => (await c.execute("SELECT run_id FROM runs WHERE owner = ? ORDER BY created_at DESC", [owner])).rows);
    const results = await Promise.all(rows.map(row => this.get_run(String(row.run_id), owner)));
    return results.filter((r): r is RunRecord => r !== null);
  }
  /** Saves the first evaluation atomically; repeats return false without overwriting evidence. */
  async save_evaluation(o: EvaluationOptions): Promise<boolean> {
    return this.write(async c => {
      if (!(await c.execute("SELECT 1 FROM outputs WHERE output_id = ? AND owner = ?", [o.output_id, o.owner])).rows.length) throw new StorageNotFound("Output was not found");
      if ((await c.execute("SELECT 1 FROM evaluations WHERE output_id = ?", [o.output_id])).rows.length) return false;
      await c.execute("INSERT INTO evaluations (output_id, owner, brand_transcription, cta_transcription, self_rating, brand_match, cta_match, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [o.output_id, o.owner, o.brand_transcription, o.cta_transcription, o.self_rating, Number(o.brand_match), Number(o.cta_match), new Date().toISOString()]);
      return true;
    });
  }
  /** Reconciles once and allocates actual batch USD across paired outputs in the same transaction. */
  async reconcile_attempt(o: { attempt_id: string; owner: string; actual_cost_usd: Decimal.Value; evidence_reference: string }): Promise<AttemptRecord> {
    const actual = new Money(o.actual_cost_usd);
    if (!actual.isFinite() || actual.isNegative()) throw new TypeError("Actual cost must be finite and nonnegative");
    await this.write(async c => {
      const row = (await c.execute("SELECT * FROM paid_attempts WHERE attempt_id = ? AND owner = ?", [o.attempt_id, o.owner])).rows[0];
      if (!row) throw new StorageNotFound("Paid attempt was not found");
      if (!["reserved", "submitted", "awaiting_reconciliation", "failed_or_unknown"].includes(String(row.status))) throw new StorageConflict("Paid attempt is not ready for reconciliation");
      await c.execute("UPDATE paid_attempts SET status = 'reconciled', actual_cost_usd = ?, reconciliation_reference = ?, reconciled_at = ? WHERE attempt_id = ?", [actual.toString(), o.evidence_reference, new Date().toISOString(), o.attempt_id]);
      const estimates = JSON.parse(String(row.per_brief_estimates_json)) as Record<string, string>;
      for (const output of (await c.execute("SELECT output_id, brief_id, manifest_json FROM outputs WHERE run_id = ?", [row.run_id!])).rows) {
        const manifest = JSON.parse(String(output.manifest_json)) as Manifest;
        if (!manifest.azure_usage) throw new TypeError("Paid output requires azure_usage");
        const allocated = actual.mul(estimates[String(output.brief_id)]!).div(String(row.estimated_cost_usd)).div(2);
        if (!allocated.isFinite()) throw new TypeError("Cannot allocate a zero estimated cost");
        Object.assign(manifest.azure_usage, { billing_reconciled: true, actual_allocated_cost_usd: allocated.toString(), reconciliation_reference: o.evidence_reference, reconciliation_basis: "Actual batch meter allocated by estimated brief cost, then 50/50 across paired outputs" });
        await c.execute("UPDATE outputs SET manifest_json = ? WHERE output_id = ?", [canonical_json(manifest), output.output_id!]);
      }
    });
    const result = await this.get_attempt(o.attempt_id, o.owner);
    if (!result) throw new StorageNotFound("Paid attempt was not found");
    return result;
  }
  private attempt(row: Row, include_identity = true): AttemptRecord {
    return { attempt_id: String(row.attempt_id), ...(include_identity && row.run_id !== undefined ? { run_id: String(row.run_id) } : {}), ...(include_identity && row.owner !== undefined ? { owner: String(row.owner) } : {}),
      brief_ids: JSON.parse(String(row.brief_ids_json)) as string[], per_brief_estimates: JSON.parse(String(row.per_brief_estimates_json)) as Record<string, string>,
      estimated_cost_usd: String(row.estimated_cost_usd), submitted_characters: Number(row.submitted_characters), status: String(row.status),
      evidence: JSON.parse(String(row.evidence_json)) as Record<string, unknown>, actual_cost_usd: row.actual_cost_usd as string | null, reconciliation_reference: row.reconciliation_reference as string | null };
  }
  /** Returns owned usage evidence, or null without revealing another owner's attempt. */
  async get_attempt(attempt_id: string, owner: string): Promise<AttemptRecord | null> {
    return this.read(async c => { const row = (await c.execute("SELECT * FROM paid_attempts WHERE attempt_id = ? AND owner = ?", [attempt_id, owner])).rows[0]; return row ? this.attempt(row) : null; });
  }
}
