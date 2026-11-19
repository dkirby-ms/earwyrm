import { createHash, randomUUID } from "node:crypto";
import { chmodSync, lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { normalize, Seed, write_midi, write_wav } from "./dsp.js";
import { render_backing } from "./backing.js";
import { arrange, arrange_preview, Chord, CompositionRequest, PreviewCompositionRequest, ProductPath, SyllableNote } from "./melody.js";
import { is_storage_error, parse_seed_json, PostgresConnection, serialized, SqliteConnection, transaction, type Connection } from "./persistence.js";
import { screen, select_screened, SimilarityReport } from "./similarity.js";
import { prepare_database_file } from "./sqlite_files.js";
import { canonical_json, private_root, type StorageOptions } from "./web_storage.js";
import { media_bytes } from "./preview_quota.js";

export const ARTIFACT_TYPES = {
  "score.mid": "audio/midi", "score.json": "application/json", "timing.json": "application/json",
  "backing.wav": "audio/wav", "provenance.json": "application/json",
} as const;
/** Reusing a logical identity with a different normalized request is forbidden. */
export class JobConflict extends Error {}
/** No committed job or allowlisted artifact exists for this identity. */
export class JobNotFound extends Error {}
/** Persistence or integrity failure; no successful delivery may be claimed. */
export class CompositionUnavailable extends Error {}
/** Opaque resource identity and the SHA-256 digest of its bytes. */
export const Artifact = z.strictObject({ uri: z.string(), media_type: z.string(), sha256: z.string() });
export type Artifact = z.infer<typeof Artifact>;
/** Source evidence is not an assertion of legal ownership or clearance. */
export const Component = z.strictObject({
  component: z.string(), origin: z.string(), evidence: z.string(),
  commercial_use_basis: z.string().nullable().default(null), status: z.string().default("Pending human rights review"),
});
export type Component = z.infer<typeof Component>;
/** A screened arrangement and exactly one durable queue identity, with private resource references. */
export const CompositionResult = z.strictObject({
  schema_version: z.number().int().default(1), job_id: z.string(), logical_job_id: z.string(),
  status: z.string().default("queued"), queue_owner: z.string().default("melody-arrangement"),
  queue_backend: z.string().default("sqlite-local"), product_path: ProductPath,
  /** Safe seeds stay numeric; larger historical 63-bit identities use canonical decimal strings. */
  seed: Seed,
  duration_seconds: z.number().int().default(30), style: z.string().default("retro-synth"),
  midi: Artifact, backing_tracks: z.array(Artifact), artifacts: z.record(z.string(), Artifact),
  chords: z.array(Chord), syllable_timing: z.array(SyllableNote), similarity: SimilarityReport,
  components: z.array(Component), ai_generated: z.boolean().default(true),
});
export type CompositionResult = z.infer<typeof CompositionResult>;
type Melodies = Record<string, number[]>;

/** Normalizes legacy seed tokens in memory without rewriting stored JSON or digest-protected artifacts. */
function stored_result(text: string, status: unknown): CompositionResult {
  const value = parse_seed_json(text) as Record<string, unknown>;
  return CompositionResult.parse({ ...value, status });
}

/** Serializes screening/history and durable queue insertion; never starts a cloud render. */
export class MelodyService {
  readonly root: string;
  readonly artifact_dir: string;
  readonly database_path: string;
  readonly database_url: string | null;
  private ready: Promise<void> | undefined;
  constructor(root: string, options: StorageOptions = {}) {
    this.root = private_root(root);
    this.artifact_dir = join(this.root, "artifacts");
    this.database_path = join(this.root, "melody.sqlite3");
    this.database_url = options.database_url ?? null;
    for (const path of [this.root, this.artifact_dir]) {
      mkdirSync(path, { recursive: true, mode: 0o700 });
      if (lstatSync(path).isSymbolicLink()) throw new TypeError("Private artifact directories must not be symlinks");
      chmodSync(path, 0o700);
    }
    if (this.database_url === null) prepare_database_file(this.database_path, join(this.root, "..", ".earwyrm-initialized"));
  }
  private async initialized(): Promise<void> {
    this.ready ??= this.database_url === null ? this._initialize() : Promise.resolve();
    await this.ready;
  }
  /** Awaits local schema readiness; PostgreSQL schemas must already exist. */
  async init(): Promise<void> { await this.initialized(); }
  /** Opens an existing store; does not initialize PostgreSQL or recreate a lost SQLite file. */
  async _connect(): Promise<Connection> {
    return this.database_url !== null ? new PostgresConnection(this.database_url, 0x4557524d02) : new SqliteConnection(this.database_path);
  }
  /** Explicit schema creation, used by operator bootstrap inside its larger transaction. */
  async _initialize(): Promise<void> {
    await serialized(this.database_path, async () => transaction(await this._connect(), MelodyService._create_schema));
  }
  /** Creates the unchanged version-one queue/history tables. */
  static async _create_schema(connection: Connection): Promise<void> {
    await connection.executescript(`
      CREATE TABLE IF NOT EXISTS render_jobs (
        job_id TEXT PRIMARY KEY, logical_job_id TEXT NOT NULL UNIQUE,
        request_json TEXT NOT NULL, result_json TEXT NOT NULL, melodies_json TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
        created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS local_outputs (output_id TEXT PRIMARY KEY, melodies_json TEXT NOT NULL);
    `);
  }
  private async history(c: Connection): Promise<Melodies> {
    const history: Melodies = {};
    for (const row of (await c.execute("SELECT job_id AS identity, melodies_json FROM render_jobs UNION ALL SELECT output_id AS identity, melodies_json FROM local_outputs")).rows) {
      const melodies = JSON.parse(String(row.melodies_json)) as Melodies;
      for (const [part, pitches] of Object.entries(melodies)) history[`earwyrm:${row.identity}:${part}`] = pitches;
    }
    return history;
  }
  /** Retries return the original seed and identity; changed requests require a new logical ID. */
  async submit(input: CompositionRequest | PreviewCompositionRequest): Promise<CompositionResult> {
    const request = "syllables_per_line" in input ? PreviewCompositionRequest.parse(input) : CompositionRequest.parse(input);
    try {
      await this.initialized();
      return await serialized(this.database_path, async () => {
        let directory: string | undefined;
        let committed = false;
        try {
          const result = await transaction(await this._connect(), async c => {
            const canonical = canonical_json(request);
            const existing = (await c.execute("SELECT request_json, result_json, status FROM render_jobs WHERE logical_job_id = ?", [request.logical_job_id])).rows[0];
            if (existing) {
              // Older Python JSON escapes non-ASCII; compare normalized values rather than byte spelling.
              if (canonical !== canonical_json(parse_seed_json(String(existing.request_json)))) throw new JobConflict("Logical job ID already belongs to a different request");
              return stored_result(String(existing.result_json), existing.status);
            }
            const [seed, arrangement, melodies, report] = select_screened(seed => {
              const guided = "syllables_per_line" in request;
              const arrangement = guided ? arrange_preview(request, seed) : arrange(request, seed);
              const melodies: Melodies = { vocal: arrangement.vocal.map(note => note.pitch) };
              if (!guided) melodies.lead = arrangement.backing.filter(note => note.instrument === "lead").map(note => note.pitch);
              return [arrangement, melodies];
            }, { seed: request.seed, history: await this.history(c) });
            const job_id = randomUUID();
            directory = join(this.artifact_dir, job_id);
            mkdirSync(directory, { mode: 0o700 });
            const { audio, ...instrumentation } = await render_backing(arrangement.backing, seed, request.duration_seconds);
            const components = [
              Component.parse({ component: "melody_and_chords", origin: "Seeded phrase composer in src/dsp.ts and src/melody.ts", evidence: "score.json, score.mid, timing.json and recorded seed" }),
              Component.parse({ component: "instruments", origin: instrumentation.soundfont ? `FluidSynth backing with ${instrumentation.soundfont}` : "Harmonic oscillators, synthesized kick and seeded noise in src/dsp.ts", evidence: "backing.wav, score.mid and provenance.json" }),
              ...("lyrics" in request ? [
                Component.parse({ component: "lyrics", origin: "Caller-supplied lyric/timing contract", evidence: "Retained request; upstream moderation and rights review required" }),
              ] : []),
            ];
            const notes = [...arrangement.backing, ...arrangement.vocal];
            write_midi(join(directory, "score.mid"), notes, request.duration_seconds, instrumentation.palette);
            writeFileSync(join(directory, "score.json"), canonical_json(notes), { mode: 0o600 });
            writeFileSync(join(directory, "timing.json"), canonical_json(arrangement.timing), { mode: 0o600 });
            write_wav(join(directory, "backing.wav"), normalize(audio));
            writeFileSync(join(directory, "provenance.json"), canonical_json({ ai_generated: true, seed, generator_version: "syllables_per_line" in request ? "earwyrm-guided-hook-v3" : "earwyrm-phrase-v2", duration_seconds: request.duration_seconds, instrumentation, components, similarity: report }), { mode: 0o600 });
            if ("syllables_per_line" in request && media_bytes(directory) > 2.5 * 1024 * 1024) {
              throw new CompositionUnavailable("Preview artifacts exceed their storage reservation");
            }
            const artifacts: Record<string, Artifact> = {};
            for (const [name, media_type] of Object.entries(ARTIFACT_TYPES)) {
              chmodSync(join(directory, name), 0o600);
              artifacts[name] = { uri: `earwyrm://jobs/${job_id}/${name}`, media_type, sha256: createHash("sha256").update(readFileSync(join(directory, name))).digest("hex") };
            }
            const result = CompositionResult.parse({
              job_id, logical_job_id: request.logical_job_id, product_path: request.product_path, seed,
              duration_seconds: request.duration_seconds,
              midi: artifacts["score.mid"], backing_tracks: [artifacts["backing.wav"]], artifacts,
              chords: arrangement.chords, syllable_timing: arrangement.timing, similarity: report, components,
              queue_backend: this.database_url === null ? "sqlite-local" : "postgresql",
            });
            await c.execute("INSERT INTO render_jobs VALUES (?, ?, ?, ?, ?, 'queued', ?)", [job_id, request.logical_job_id, canonical, canonical_json(result), canonical_json(melodies), new Date().toISOString()]);
            return result;
          });
          committed = true;
          return result;
        } finally {
          if (!committed && directory !== undefined) rmSync(directory, { recursive: true, force: true });
        }
      });
    } catch (error) {
      if (!is_storage_error(error)) throw error;
      throw new CompositionUnavailable("Composition storage is unavailable; retry the same logical job ID", { cause: error });
    }
  }
  /** Lists guided-preview identities and media sizes, including incomplete publications. */
  async preview_jobs(): Promise<{ job_id: string; logical_job_id: string; created_at: string; bytes: number }[]> {
    await this.initialized();
    const c = await this._connect();
    try {
      return (await c.execute("SELECT job_id, logical_job_id, created_at FROM render_jobs WHERE logical_job_id LIKE 'guided-v3-%'")).rows.map(row => {
        const job_id = z.uuid().parse(row.job_id);
        const logical_job_id = z.string().regex(/^guided-v3-[a-f0-9]{64}$/).parse(row.logical_job_id);
        return { job_id, logical_job_id, created_at: String(row.created_at), bytes: media_bytes(join(this.artifact_dir, job_id)) };
      });
    } finally { await c.close(); }
  }
  /**
   * Removes only guided-preview artifacts, tolerating missing files for interrupted-cleanup recovery.
   * Set delete_record=false until the web-store deletion commits, so a rollback can retry cleanup.
   */
  async expire_preview(job_id: string, delete_record = true): Promise<void> {
    z.uuid().parse(job_id);
    await this.initialized();
    await serialized(this.database_path, async () => transaction(await this._connect(), async c => {
      const row = (await c.execute("SELECT logical_job_id FROM render_jobs WHERE job_id = ?", [job_id])).rows[0];
      if (!row) return;
      if (!/^guided-v3-[a-f0-9]{64}$/.test(String(row.logical_job_id))) throw new TypeError("Only guided previews can expire");
      const path = join(this.artifact_dir, job_id);
      media_bytes(path);
      rmSync(path, { recursive: true, force: true });
      if (delete_record) await c.execute("DELETE FROM render_jobs WHERE job_id = ?", [job_id]);
    }));
  }
  /** Screens and archives a local output atomically without enqueuing a second job. */
  async record_local_output(output_id: string, melodies: Melodies): Promise<SimilarityReport> {
    try {
      await this.initialized();
      return await serialized(this.database_path, async () => transaction(await this._connect(), async c => {
        const report = screen(melodies, await this.history(c));
        await c.execute("INSERT INTO local_outputs VALUES (?, ?)", [output_id, canonical_json(melodies)]);
        return report;
      }));
    } catch (error) {
      if (!is_storage_error(error)) throw error;
      throw new CompositionUnavailable("Melody history is unavailable", { cause: error });
    }
  }
  /** Preflight history only; publication must atomically screen again. */
  async history_snapshot(): Promise<Melodies> {
    try {
      await this.initialized();
      const c = await this._connect();
      try { return await this.history(c); } finally { await c.close(); }
    } catch (error) {
      if (!is_storage_error(error)) throw error;
      throw new CompositionUnavailable("Melody history is unavailable", { cause: error });
    }
  }
  /** Reads a committed UUID job; unknown IDs reveal no filesystem paths. */
  async get_job(job_id: string): Promise<CompositionResult> {
    if (!z.uuid().safeParse(job_id).success) throw new JobNotFound("Composition job was not found");
    await this.initialized();
    const c = await this._connect();
    try {
      const row = (await c.execute("SELECT result_json, status FROM render_jobs WHERE job_id = ?", [job_id])).rows[0];
      if (!row) throw new JobNotFound("Composition job was not found");
      return stored_result(String(row.result_json), row.status);
    } finally { await c.close(); }
  }
  /** Delivers only committed, allowlisted, integrity-checked bytes; symlinks fail closed. */
  async read_artifact(job_id: string, name: string): Promise<Buffer> {
    if (!Object.hasOwn(ARTIFACT_TYPES, name)) throw new JobNotFound("Composition artifact was not found");
    const result = await this.get_job(job_id);
    let content: Buffer;
    try {
      const path = join(this.artifact_dir, job_id, name);
      for (const item of [this.artifact_dir, join(this.artifact_dir, job_id), path]) if (lstatSync(item).isSymbolicLink()) throw new CompositionUnavailable("Composition artifact is unavailable");
      content = readFileSync(path);
    } catch (error) {
      if (!is_storage_error(error)) throw error;
      throw new CompositionUnavailable("Composition artifact is unavailable", { cause: error });
    }
    if (createHash("sha256").update(content).digest("hex") !== result.artifacts[name]?.sha256) throw new CompositionUnavailable("Composition artifact integrity check failed");
    return content;
  }
}
