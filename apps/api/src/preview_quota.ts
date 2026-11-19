import { lstatSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { Connection } from "./persistence.js";
import type { MelodyService } from "./melody_service.js";

export const PREVIEW_REQUEST_BYTES = 12 * 1024 * 1024;
export const PREVIEW_OWNER_BYTES = 1024 ** 3;
export const PREVIEW_GLOBAL_BYTES = 20 * 1024 ** 3;
const DAY = 24 * 60 * 60 * 1000;

/** A durable preview limit was reached; retrying cached work remains permitted. */
export class PreviewQuotaExceeded extends Error {}

/** Counts orphaned media too; missing files count as zero for interrupted-cleanup recovery, unsafe entries fail closed. */
export function media_bytes(path: string): number {
  let entry;
  try { entry = lstatSync(path); }
  catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
    return 0;
  }
  if (entry.isSymbolicLink()) throw new TypeError("Preview storage must not contain symlinks");
  if (entry.isFile()) return entry.size;
  if (!entry.isDirectory()) throw new TypeError("Preview storage contains an unsupported entry");
  return readdirSync(path).reduce((total, name) => total + media_bytes(join(path, name)), 0);
}

/** Additive ledger shared by SQLite initialization and PostgreSQL upgrade. */
export async function create_preview_schema(c: Connection): Promise<void> {
  await c.execute(`CREATE TABLE IF NOT EXISTS preview_reservations (
    request_key TEXT PRIMARY KEY, owner TEXT NOT NULL, logical_ids_json TEXT NOT NULL,
    reserved_bytes INTEGER NOT NULL CHECK (reserved_bytes >= 0),
    completed INTEGER NOT NULL CHECK (completed IN (0, 1)),
    pinned INTEGER NOT NULL CHECK (pinned IN (0, 1)), created_at TEXT NOT NULL)`);
  await c.execute("CREATE INDEX IF NOT EXISTS preview_owner_created ON preview_reservations(owner, created_at)");
}

const LogicalIds = z.array(z.string().regex(/^guided-v3-[a-f0-9]{64}$/)).min(1).max(3);

function reference(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || !("job_id" in value) || typeof value.job_id !== "string") return;
  return value.job_id;
}

/** Removes expired web records under the web lock; melody rows remain until that transaction commits. */
export async function prune_previews(c: Connection, root: string, melody: MelodyService): Promise<string[]> {
  const now = Date.now();
  const removed: string[] = [];
  const jobs = await melody.preview_jobs();
  const rows = (await c.execute("SELECT * FROM preview_reservations")).rows;
  const tracked = new Set(rows.flatMap(row => LogicalIds.parse(JSON.parse(String(row.logical_ids_json)))));
  // Adopt pre-upgrade jobs, including committed melodies whose output publication failed.
  for (const job of jobs) {
    if (tracked.has(job.logical_job_id)) continue;
    const run = (await c.execute("SELECT owner FROM runs WHERE run_id = ?", [job.job_id])).rows[0];
    let bytes = job.bytes;
    for (const output of (await c.execute("SELECT audio_filename FROM outputs WHERE run_id = ?", [job.job_id])).rows) {
      bytes += media_bytes(audio_path(root, String(output.audio_filename)));
    }
    await c.execute("INSERT INTO preview_reservations VALUES (?, ?, ?, ?, 1, 0, ?)",
      [`legacy-${job.job_id}`, run ? String(run.owner) : "", JSON.stringify([job.logical_job_id]), bytes, job.created_at]);
  }
  const references = new Set<string>();
  for (const row of (await c.execute("SELECT request_json FROM lyric_options")).rows) {
    const request = JSON.parse(String(row.request_json)) as Record<string, unknown>;
    const id = reference(request.arrangement);
    if (id) references.add(id);
  }
  for (const row of (await c.execute("SELECT run_id, manifest_json FROM outputs")).rows) {
    const manifest = JSON.parse(String(row.manifest_json)) as Record<string, unknown>;
    const id = reference(manifest.composition_source);
    if (id && id !== row.run_id) references.add(id);
  }
  for (const row of (await c.execute("SELECT DISTINCT o.run_id FROM outputs o JOIN evaluations e ON e.output_id = o.output_id")).rows) {
    references.add(String(row.run_id));
  }
  for (const row of (await c.execute("SELECT * FROM preview_reservations WHERE created_at <= ? AND pinned = 0",
    [new Date(now - 7 * DAY).toISOString()])).rows) {
    const ids = LogicalIds.parse(JSON.parse(String(row.logical_ids_json)));
    const expired = jobs.filter(job => ids.includes(job.logical_job_id));
    if (expired.some(job => references.has(job.job_id))) continue;
    for (const job of expired) {
      const outputs = (await c.execute("SELECT output_id, audio_filename FROM outputs WHERE run_id = ?", [job.job_id])).rows;
      if ((await c.execute("SELECT 1 FROM paid_attempts WHERE run_id = ?", [job.job_id])).rows.length) {
        throw new Error("Preview cleanup encountered a paid render");
      }
      // Files go first. A failed cleanup leaves its durable reservation charged for retry.
      for (const output of outputs) {
        const path = audio_path(root, String(output.audio_filename));
        media_bytes(path);
        rmSync(path, { force: true });
      }
      await melody.expire_preview(job.job_id, false);
      await c.execute("DELETE FROM outputs WHERE run_id = ?", [job.job_id]);
      await c.execute("DELETE FROM runs WHERE run_id = ?", [job.job_id]);
      removed.push(job.job_id);
    }
    await c.execute("DELETE FROM preview_reservations WHERE request_key = ?", [row.request_key!]);
  }
  return removed;
}

/** Atomically charges capacity before creating any job; cache hits retain their original admission. */
export async function reserve_preview(
  c: Connection, root: string, melody: MelodyService, owner: string, request_key: string, logical_ids: string[],
): Promise<void> {
  LogicalIds.parse(logical_ids);
  const now = Date.now();
  const jobs = await melody.preview_jobs();
  let existing = (await c.execute("SELECT owner, logical_ids_json, completed FROM preview_reservations WHERE request_key = ?", [request_key])).rows[0];
  // Recover complete pre-upgrade caches without charging a new request or duplicating their bytes.
  const legacy = (await c.execute("SELECT * FROM preview_reservations WHERE owner = ?", [owner])).rows
    .filter(row => String(row.request_key).startsWith("legacy-") &&
      LogicalIds.parse(JSON.parse(String(row.logical_ids_json))).every(id => logical_ids.includes(id)));
  const cached_jobs = jobs.filter(job => logical_ids.includes(job.logical_job_id));
  let published = cached_jobs.length === 3;
  for (const job of cached_jobs) {
    if ((await c.execute("SELECT 1 FROM outputs WHERE run_id = ? AND owner = ?", [job.job_id, owner])).rows.length !== 1) published = false;
  }
  if (!existing && legacy.length === 3 && legacy.every(row => row.completed) && published) {
    for (const row of legacy) await c.execute("DELETE FROM preview_reservations WHERE request_key = ?", [row.request_key!]);
    await c.execute("INSERT INTO preview_reservations VALUES (?, ?, ?, ?, 1, ?, ?)", [
      request_key, owner, JSON.stringify(logical_ids),
      legacy.reduce((sum, row) => sum + Number(row.reserved_bytes), 0),
      Number(legacy.some(row => Boolean(row.pinned))), legacy.map(row => String(row.created_at)).sort()[0]!,
    ]);
    existing = (await c.execute("SELECT owner, logical_ids_json, completed FROM preview_reservations WHERE request_key = ?", [request_key])).rows[0];
  }
  if (existing) {
    if (existing.owner !== owner || existing.logical_ids_json !== JSON.stringify(logical_ids)) throw new Error("Preview reservation identity mismatch");
    if (existing.completed) return;
  }
  const active = (await c.execute("SELECT * FROM preview_reservations")).rows;
  const own = active.filter(row => row.owner === owner);
  if (!existing && own.filter(row => String(row.created_at) > new Date(now - DAY).toISOString()).length >= 20) {
    throw new PreviewQuotaExceeded("Arrangement limit reached: 20 new requests per rolling 24 hours.");
  }
  if (!existing && own.reduce((sum, row) => sum + Number(row.reserved_bytes), 0) + PREVIEW_REQUEST_BYTES > PREVIEW_OWNER_BYTES) {
    throw new PreviewQuotaExceeded("Arrangement preview storage limit reached for this account (1 GiB).");
  }
  const files = media_bytes(join(root, "audio")) + media_bytes(join(root, "melody", "artifacts"));
  let pending = 0;
  for (const row of active.filter(row => !row.completed)) {
    const ids = LogicalIds.parse(JSON.parse(String(row.logical_ids_json)));
    let written = 0;
    for (const job of jobs.filter(job => ids.includes(job.logical_job_id))) {
      written += job.bytes;
      for (const output of (await c.execute("SELECT audio_filename FROM outputs WHERE run_id = ?", [job.job_id])).rows) {
        written += media_bytes(audio_path(root, String(output.audio_filename)));
      }
    }
    pending += Math.max(0, Number(row.reserved_bytes) - written);
  }
  if (files + pending + (existing ? 0 : PREVIEW_REQUEST_BYTES) > PREVIEW_GLOBAL_BYTES) {
    throw new PreviewQuotaExceeded("Arrangement preview storage is full; contact the operator.");
  }
  if (existing) return;
  await c.execute("INSERT INTO preview_reservations VALUES (?, ?, ?, ?, 0, 0, ?)",
    [request_key, owner, JSON.stringify(logical_ids), PREVIEW_REQUEST_BYTES, new Date(now).toISOString()]);
}

function audio_path(root: string, name: string): string {
  if (!z.uuid().safeParse(name.slice(0, -4)).success || !name.endsWith(".wav")) throw new TypeError("Invalid preview audio filename");
  return join(root, "audio", name);
}

/** Replaces the worst-case reservation with measured artifacts and output audio after full publication. */
export async function complete_preview(c: Connection, root: string, melody: MelodyService, request_key: string): Promise<void> {
  const row = (await c.execute("SELECT owner, pinned, logical_ids_json FROM preview_reservations WHERE request_key = ?", [request_key])).rows[0];
  if (!row) throw new Error("Preview reservation was not found");
  const ids = LogicalIds.parse(JSON.parse(String(row.logical_ids_json)));
  const jobs = (await melody.preview_jobs()).filter(job => ids.includes(job.logical_job_id));
  if (jobs.length !== ids.length) throw new Error("Preview batch is incomplete");
  let bytes = 0;
  for (const job of jobs) {
    bytes += job.bytes;
    const outputs = (await c.execute("SELECT audio_filename FROM outputs WHERE run_id = ?", [job.job_id])).rows;
    if (outputs.length !== 1) throw new Error("Preview output is incomplete");
    bytes += media_bytes(audio_path(root, String(outputs[0]!.audio_filename)));
  }
  if (bytes > PREVIEW_REQUEST_BYTES) throw new Error("Preview exceeded its storage reservation");
  let pinned = Boolean(row.pinned);
  for (const legacy of (await c.execute("SELECT request_key, pinned, logical_ids_json FROM preview_reservations WHERE owner = ?", [row.owner!])).rows) {
    if (String(legacy.request_key).startsWith("legacy-") &&
        LogicalIds.parse(JSON.parse(String(legacy.logical_ids_json))).every(id => ids.includes(id))) {
      pinned ||= Boolean(legacy.pinned);
      await c.execute("DELETE FROM preview_reservations WHERE request_key = ?", [legacy.request_key!]);
    }
  }
  await c.execute("UPDATE preview_reservations SET completed = 1, pinned = ?, reserved_bytes = ? WHERE request_key = ?", [Number(pinned), bytes, request_key]);
}

/** Pins the whole batch before reading it for lyric generation or rendering, preventing expiry races. */
export async function pin_preview(c: Connection, root: string, melody: MelodyService, job_id: string, owner: string): Promise<boolean> {
  if (!(await c.execute("SELECT 1 FROM runs WHERE run_id = ? AND owner = ?", [job_id, owner])).rows.length) return false;
  const job = (await melody.preview_jobs()).find(job => job.job_id === job_id);
  if (!job) return false;
  for (const row of (await c.execute("SELECT request_key, logical_ids_json FROM preview_reservations")).rows) {
    if (LogicalIds.parse(JSON.parse(String(row.logical_ids_json))).includes(job.logical_job_id)) {
      await c.execute("UPDATE preview_reservations SET pinned = 1 WHERE request_key = ?", [row.request_key!]);
      return true;
    }
  }
  let bytes = job.bytes;
  for (const output of (await c.execute("SELECT audio_filename FROM outputs WHERE run_id = ?", [job_id])).rows) {
    bytes += media_bytes(audio_path(root, String(output.audio_filename)));
  }
  await c.execute("INSERT INTO preview_reservations VALUES (?, ?, ?, ?, 1, 1, ?)",
    [`legacy-${job_id}`, owner, JSON.stringify([job.logical_job_id]), bytes, job.created_at]);
  return true;
}
