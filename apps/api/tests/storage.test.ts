import { randomUUID, createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompositionRequest, PreviewCompositionRequest } from "../src/melody.js";
import { CompositionResult, CompositionUnavailable, JobConflict, JobNotFound, MelodyService } from "../src/melody_service.js";
import { SimilarityError } from "../src/similarity.js";
import { parse_seed_json } from "../src/persistence.js";
import { canonical_json, STATIC_ROOT, StorageAccessDenied, StorageConflict, StorageNotFound, WebStorage, type PaidRunOptions } from "../src/web_storage.js";
import { main } from "../src/bootstrap_database.js";
import { media_bytes, PREVIEW_GLOBAL_BYTES, PREVIEW_OWNER_BYTES, PREVIEW_REQUEST_BYTES, PreviewQuotaExceeded } from "../src/preview_quota.js";

const directories: string[] = [];
function directory(): string {
  const root = join(process.cwd(), `.storage-test-${randomUUID()}`);
  mkdirSync(root, { mode: 0o700 }); directories.push(root); return root;
}
afterEach(() => { vi.restoreAllMocks(); for (const root of directories.splice(0)) rmSync(root, { recursive: true, force: true }); });
const issuer = "https://identity.example.test/tenant";
const permissions = { enabled: true, admin: true, paid_speech: true };
function reservation(suffix: string): PaidRunOptions {
  return { run_id: `run-${suffix}`, attempt_id: `attempt-${suffix}`, owner: "owner", brief_ids: ["brief"],
    per_brief_estimates: { brief: "0.01" }, estimated_cost_usd: "0.01", submitted_characters: 100, total_budget_usd: "1", evidence: { region: "test" } };
}
function composition(): CompositionRequest {
  return CompositionRequest.parse({ logical_job_id: "campaign-v1", product_path: "vocoded", seed: 42,
    lyrics: "Cedar Loop brings bright sound to your day", lines: [{ text: "Cedar Loop brings bright sound to your day",
      syllables: ["Ce", "dar", "Loop", "brings", "bright", "sound", "to", "your", "day"], start_seconds: 3, end_seconds: 7 }] });
}
async function output(store: WebStorage) {
  await store.create_run("run", "owner", "instrumental", ["brief"]);
  return store.save_output({ run_id: "run", owner: "owner", manifest: { brief_id: "brief", variant: "instrumental" }, audio: Buffer.from("private audio") });
}
/** Starts two independent runtimes at a shared barrier, exercising actual SQLite locking rather than the JS mutex. */
async function concurrent_processes(root: string, mode: "paid" | "evaluation" | "job" | "preview", output_id = ""): Promise<unknown[]> {
  const script = `
    import {WebStorage,StorageConflict} from "./src/web_storage.ts";
    import {MelodyService} from "./src/melody_service.ts";
    import {PreviewQuotaExceeded} from "./src/preview_quota.ts";
    const [root,mode,output_id,suffix,request]=JSON.parse(process.env.EARWYRM_CONCURRENCY_INPUT);
    const store=new WebStorage(root),melody=new MelodyService(root+"/melody");
    await store.init();await melody.init();
    console.log("READY");await new Promise(resolve=>process.stdin.once("data",resolve));
    let result;
    if(mode==="paid"){
      try{await store.reserve_paid_run({run_id:suffix,attempt_id:suffix,owner:"owner",brief_ids:["brief"],per_brief_estimates:{brief:"0.01"},estimated_cost_usd:"0.01",submitted_characters:1,total_budget_usd:"1",evidence:{}});result="reserved";}
      catch(error){if(!(error instanceof StorageConflict))throw error;result="blocked";}
    }else if(mode==="preview"){
      try{await store.reserve_previews(melody,"owner",suffix,["guided-v3-"+(suffix==="a"?"a":"b").repeat(64)]);result="reserved";}
      catch(error){if(!(error instanceof PreviewQuotaExceeded))throw error;result="blocked";}
    }else if(mode==="evaluation"){
      result=await store.save_evaluation({output_id,owner:"owner",brand_transcription:suffix,cta_transcription:"cta",self_rating:"usable",brand_match:true,cta_match:true});
    }else{result=(await melody.submit(request)).job_id;}
    console.log("RESULT:"+JSON.stringify(result));`;
  const children: ChildProcessWithoutNullStreams[] = [];
  let ready = 0;
  const results = ["a", "b"].map(suffix => new Promise<unknown>((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
      cwd: process.cwd(), env: { ...process.env, EARWYRM_CONCURRENCY_INPUT: JSON.stringify([root, mode, output_id, suffix, composition()]) },
    });
    children.push(child);
    let stdout = "", stderr = "", signaled = false;
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
      if (!signaled && stdout.includes("READY\n")) {
        signaled = true;
        if (++ready === 2) for (const worker of children) worker.stdin.end("go\n");
      }
    });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", code => {
      if (code !== 0) { reject(new Error(stderr)); return; }
      const line = stdout.split("\n").find(line => line.startsWith("RESULT:"));
      if (!line) { reject(new Error("Worker returned no result")); return; }
      resolve(JSON.parse(line.slice(7)) as unknown);
    });
  }));
  try { return await Promise.all(results); }
  finally { for (const child of children) if (child.exitCode === null) child.kill("SIGTERM"); }
}

describe("durable arrangement preview quotas", () => {
  const logical_id = (key: string) => `guided-v3-${createHash("sha256").update(key).digest("hex")}`;

  /** Publishes one real guided job so retention checks cover both stores and media trees. */
  async function saved_preview(store: WebStorage, melody: MelodyService) {
    const logical = logical_id("retention");
    await store.reserve_previews(melody, "owner", "retention", [logical]);
    const job = await melody.submit(PreviewCompositionRequest.parse({
      logical_job_id: logical, product_path: "vocoded", duration_seconds: 20,
      syllables_per_line: [10, 10, 10, 8], seed: 42,
    }));
    await store.create_run(job.job_id, "owner", "instrumental", ["brief"]);
    const output = await store.save_output({
      run_id: job.job_id, owner: "owner", audio: await melody.read_artifact(job.job_id, "backing.wav"),
      manifest: { brief_id: "brief", variant: "instrumental", composition_source: { kind: "guided-preview", job_id: job.job_id } },
    });
    await store.complete_previews(melody, "retention");
    return { job, output };
  }

  it("persists the rolling request cap, permits cache retries, and arbitrates independent processes", async () => {
    const root = directory(), store = new WebStorage(root), melody = new MelodyService(join(root, "melody"));
    for (let index = 0; index < 19; index++) await store.reserve_previews(melody, "owner", String(index), [logical_id(String(index))]);
    expect((await concurrent_processes(root, "preview")).sort()).toEqual(["blocked", "reserved"]);
    const reopened = new WebStorage(root);
    await expect(reopened.reserve_previews(melody, "owner", "21", [logical_id("21")])).rejects.toBeInstanceOf(PreviewQuotaExceeded);
    await reopened.reserve_previews(melody, "owner", "0", [logical_id("0")]);
    await reopened.reserve_previews(melody, "other", "other", [logical_id("other")]);
    const db = new DatabaseSync(store.database_path);
    try {
      expect(db.prepare("SELECT count(*) AS n FROM preview_reservations WHERE owner = 'owner'").get()?.n).toBe(20);
      db.prepare("UPDATE preview_reservations SET created_at = ? WHERE request_key = '0'")
        .run(new Date(Date.now() - 24 * 60 * 60 * 1000 - 1000).toISOString());
    } finally { db.close(); }
    await reopened.reserve_previews(melody, "owner", "next-day", [logical_id("next-day")]);
    expect(await melody.preview_jobs()).toEqual([]);
  });

  it("reserves the exact owner-storage boundary before allowing any job creation", async () => {
    const root = directory(), store = new WebStorage(root), melody = new MelodyService(join(root, "melody"));
    await store.reserve_previews(melody, "owner", "existing", [logical_id("existing")]);
    const db = new DatabaseSync(store.database_path);
    try {
      db.prepare("UPDATE preview_reservations SET reserved_bytes = ?").run(PREVIEW_OWNER_BYTES - PREVIEW_REQUEST_BYTES);
    } finally { db.close(); }
    await store.reserve_previews(melody, "owner", "at-limit", [logical_id("at-limit")]);
    await expect(store.reserve_previews(melody, "owner", "over-limit", [logical_id("over-limit")])).rejects.toThrow("1 GiB");
    await store.reserve_previews(melody, "other", "other", [logical_id("other")]);
    expect(await melody.preview_jobs()).toEqual([]);
  });

  it("counts orphaned media and outstanding reservations at the exact global boundary", async () => {
    const root = directory(), store = new WebStorage(root), melody = new MelodyService(join(root, "melody"));
    await store.init();
    const orphan = join(store.audio_dir, "orphan.wav");
    writeFileSync(orphan, "");
    truncateSync(orphan, PREVIEW_GLOBAL_BYTES - PREVIEW_REQUEST_BYTES);
    await store.reserve_previews(melody, "owner", "last", [logical_id("last")]);
    await expect(store.reserve_previews(melody, "other", "full", [logical_id("full")])).rejects.toThrow("storage is full");
    await new WebStorage(root).reserve_previews(melody, "owner", "last", [logical_id("last")]);
    expect(await melody.preview_jobs()).toEqual([]);
    expect(statSync(orphan).size).toBe(PREVIEW_GLOBAL_BYTES - PREVIEW_REQUEST_BYTES);
    truncateSync(orphan, PREVIEW_GLOBAL_BYTES);
    await expect(store.reserve_previews(melody, "owner", "last", [logical_id("last")])).rejects.toThrow("storage is full");
  });

  it.each(["none", "lyrics", "render", "evaluation", "pin"] as const)(
    "expires old artifacts and output rows only without saved references (%s)", async protection => {
      const root = directory(), store = new WebStorage(root), melody = new MelodyService(join(root, "melody"));
      const { job, output } = await saved_preview(store, melody);
      if (protection === "pin") expect(await store.pin_preview(melody, job.job_id, "owner")).toBe(true);
      expect(await store.pin_preview(melody, job.job_id, "other")).toBe(false);
      if (protection === "render") {
        await store.create_run("render", "owner", "instrumental", ["brief"]);
        await store.save_output({ run_id: "render", owner: "owner", audio: Buffer.from("render"),
          manifest: { brief_id: "brief", variant: "instrumental", composition_source: { job_id: job.job_id } } });
      }
      if (protection === "evaluation") {
        await store.save_evaluation({ output_id: output.output_id, owner: "owner", brand_transcription: "brand",
          cta_transcription: "cta", self_rating: "usable", brand_match: true, cta_match: true });
      }
      const db = new DatabaseSync(store.database_path);
      try {
        const row = db.prepare("SELECT reserved_bytes FROM preview_reservations").get()!;
        expect(row.reserved_bytes).toBe(media_bytes(melody.artifact_dir) + media_bytes(store.audio_dir) - (protection === "render" ? 6 : 0));
        expect(Number(row.reserved_bytes)).toBeLessThan(PREVIEW_REQUEST_BYTES);
        db.prepare("UPDATE preview_reservations SET created_at = ?").run(new Date(Date.now() - 8 * 86400000).toISOString());
        if (protection === "lyrics") db.prepare("INSERT INTO lyric_options VALUES (?, ?, ?, ?, ?, ?)")
          .run(randomUUID(), "owner", "brief", JSON.stringify({ arrangement: { job_id: job.job_id } }), "{}", new Date().toISOString());
      } finally { db.close(); }
      await new WebStorage(root).reserve_previews(melody, "owner", "new", [logical_id("new")]);
      if (protection === "none") {
        expect(await store.get_run(job.job_id, "owner")).toBeNull();
        await expect(melody.get_job(job.job_id)).rejects.toBeInstanceOf(JobNotFound);
        expect(existsSync(join(melody.artifact_dir, job.job_id))).toBe(false);
        expect(existsSync(join(store.audio_dir, output.file))).toBe(false);
      } else {
        expect(await store.get_output(output.output_id, "owner")).not.toBeNull();
        expect(await melody.read_artifact(job.job_id, "backing.wav")).toEqual(readFileSync(join(store.audio_dir, output.file)));
      }
    },
  );

  it("keeps failed cleanup charged and recovers after files were partially removed", async () => {
    const root = directory(), store = new WebStorage(root), melody = new MelodyService(join(root, "melody"));
    const { job, output } = await saved_preview(store, melody);
    const db = new DatabaseSync(store.database_path);
    try { db.prepare("UPDATE preview_reservations SET created_at = ?").run(new Date(Date.now() - 8 * 86400000).toISOString()); }
    finally { db.close(); }
    const failure = new Error("storage deletion failed");
    vi.spyOn(melody, "expire_preview").mockRejectedValueOnce(failure);
    await expect(store.reserve_previews(melody, "owner", "new", [logical_id("new")])).rejects.toBe(failure);
    expect(await store.get_output(output.output_id, "owner")).not.toBeNull();
    await store.reserve_previews(melody, "owner", "new", [logical_id("new")]);
    expect(await store.get_run(job.job_id, "owner")).toBeNull();
    expect(await melody.preview_jobs()).toEqual([]);
  });

  it("commits expiry even when admission subsequently fails its request limit", async () => {
    const root = directory(), store = new WebStorage(root), melody = new MelodyService(join(root, "melody"));
    const { job } = await saved_preview(store, melody);
    const db = new DatabaseSync(store.database_path);
    try {
      db.prepare("UPDATE preview_reservations SET created_at = ?").run(new Date(Date.now() - 8 * 86400000).toISOString());
      const insert = db.prepare("INSERT INTO preview_reservations VALUES (?, 'limited', ?, ?, 0, 0, ?)");
      for (let index = 0; index < 20; index++) insert.run(String(index), JSON.stringify([logical_id(String(index))]), PREVIEW_REQUEST_BYTES, new Date().toISOString());
    } finally { db.close(); }
    await expect(store.reserve_previews(melody, "limited", "new", [logical_id("new")])).rejects.toBeInstanceOf(PreviewQuotaExceeded);
    expect(await store.get_run(job.job_id, "owner")).toBeNull();
    expect(await melody.preview_jobs()).toEqual([]);
  });

  it("adopts and pins a pre-upgrade preview before downstream artifact reads", async () => {
    const root = directory(), store = new WebStorage(root), melody = new MelodyService(join(root, "melody"));
    const { job, output } = await saved_preview(store, melody);
    const db = new DatabaseSync(store.database_path);
    try { db.exec("DELETE FROM preview_reservations"); } finally { db.close(); }
    expect(await store.pin_preview(melody, job.job_id, "owner")).toBe(true);
    const reopened = new DatabaseSync(store.database_path);
    try {
      expect(reopened.prepare("SELECT owner, pinned, reserved_bytes FROM preview_reservations").get()).toMatchObject({
        owner: "owner", pinned: 1, reserved_bytes: media_bytes(melody.artifact_dir) + media_bytes(store.audio_dir),
      });
      reopened.prepare("UPDATE preview_reservations SET created_at = ?").run(new Date(Date.now() - 8 * 86400000).toISOString());
    } finally { reopened.close(); }
    await store.reserve_previews(melody, "owner", "new", [logical_id("new")]);
    expect(await store.get_output(output.output_id, "owner")).not.toBeNull();
    expect((await melody.get_job(job.job_id)).job_id).toBe(job.job_id);
  });
});

describe("SQLite authorization and paid ledger", () => {
  it("arbitrates competing bootstraps and binds exact issuer plus subject", async () => {
    const root = directory(), first = new WebStorage(root), second = new WebStorage(root);
    const results = await Promise.allSettled([first.bootstrap_owner(issuer, "one"), second.bootstrap_owner(issuer, "two")]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const [user] = await first.list_users();
    expect(user).toMatchObject({ enabled: 1, admin: 1, paid_speech: 1 });
    expect(await first.get_user(issuer.toUpperCase(), user!.subject)).toBeNull();
    expect(await first.get_user(issuer, user!.subject.toUpperCase())).toBeNull();
    await expect(first.get_user(` ${issuer}`, user!.subject)).rejects.toThrow("exact");
    await first.set_user(issuer, user!.subject, { enabled: false, admin: false, paid_speech: false });
    await expect(second.bootstrap_owner(issuer, user!.subject)).rejects.toBeInstanceOf(StorageConflict);
    await expect(first.set_user("other", "other", permissions)).rejects.toBeInstanceOf(StorageAccessDenied);
  });
  it("queues, denies, resubmits and grants baseline access without redundant enabled-user requests", async () => {
    const store = new WebStorage(directory());
    await store.bootstrap_owner(issuer, "owner");
    expect(await store.get_access_request(issuer, "requester")).toBeNull();

    const first = await store.request_access(issuer, "requester");
    expect(first.status).toBe("pending");
    if (first.status !== "pending") throw new Error("Expected a pending request");
    expect(await store.request_access(issuer, "requester")).toEqual(first);
    expect(await store.list_access_requests_as_admin(issuer, "owner")).toEqual([first.request]);

    const denied = await store.decide_access_request_as_admin(issuer, "owner", first.request.request_id, "denied");
    expect(denied.status).toBe("denied");
    const retry = await store.request_access(issuer, "requester");
    expect(retry.status).toBe("pending");
    if (retry.status !== "pending") throw new Error("Expected a pending request");
    expect(retry.request.request_id).not.toBe(first.request.request_id);

    await store.set_user(issuer, "requester", { enabled: false, admin: true, paid_speech: true });
    const approved = await store.decide_access_request_as_admin(issuer, "owner", retry.request.request_id, "approved");
    expect(approved.status).toBe("approved");
    expect(await store.get_user(issuer, "requester")).toMatchObject({
      enabled: 1, admin: 0, paid_speech: 0,
    });
    expect((await store.get_access_request(issuer, "requester"))?.status).toBe("approved");

    expect(await store.request_access(issuer, "owner")).toEqual({ status: "already_enabled" });
    expect(await store.get_access_request(issuer, "owner")).toBeNull();
  });
  it("rechecks revoked administrator and paid permissions within the write lock", async () => {
    const store = new WebStorage(directory());
    await store.bootstrap_owner(issuer, "owner");
    const queued = await store.request_access(issuer, "applicant");
    if (queued.status !== "pending") throw new Error("Expected a pending request");
    await store.set_user(issuer, "delegate", permissions);
    await store.set_user(issuer, "delegate", { ...permissions, admin: false });
    await expect(store.set_user_as_admin(issuer, "delegate", issuer, "owner", { enabled: false, admin: false, paid_speech: false })).rejects.toBeInstanceOf(StorageAccessDenied);
    await expect(store.list_users_as_admin(issuer, "delegate")).rejects.toBeInstanceOf(StorageAccessDenied);
    await expect(store.list_access_requests_as_admin(issuer, "delegate")).rejects.toBeInstanceOf(StorageAccessDenied);
    await expect(store.decide_access_request_as_admin(issuer, "delegate", queued.request.request_id, "approved")).rejects.toBeInstanceOf(StorageAccessDenied);
    expect((await store.get_access_request(issuer, "applicant"))?.status).toBe("pending");
    expect(await store.get_user(issuer, "applicant")).toBeNull();
    await store.set_user(issuer, "owner", { ...permissions, paid_speech: false });
    await expect(store.reserve_paid_run({ ...reservation("revoked"), issuer })).rejects.toBeInstanceOf(StorageAccessDenied);
    expect(await store.get_run("run-revoked", "owner")).toBeNull();
    expect(await store.has_unreconciled_paid_attempt()).toBe(false);
  });
  it("preserves pending request identity while refreshing email and retains it across restarts", async () => {
    const root = directory(), store = new WebStorage(root);
    await store.bootstrap_owner(issuer, "owner");
    const first = await store.request_access(issuer, "requester");
    if (first.status !== "pending") throw new Error("Expected a pending request");
    expect(first.request.email).toBeNull();
    const refreshed = await store.request_access(issuer, "requester", "requester@example.test");
    expect(refreshed).toEqual({ status: "pending", request: { ...first.request, email: "requester@example.test" } });
    expect(await store.request_access(issuer, "requester")).toEqual(refreshed);
    const reopened = new WebStorage(root);
    expect(await reopened.list_access_requests_as_admin(issuer, "owner")).toEqual([
      { ...first.request, email: "requester@example.test" },
    ]);
    await reopened.decide_access_request_as_admin(issuer, "owner", first.request.request_id, "denied");
    const retry = await reopened.request_access(issuer, "requester", "updated@example.test");
    expect(retry).toMatchObject({ status: "pending", request: { email: "updated@example.test" } });
  });
  it("adds nullable email to an existing SQLite queue without losing requests or permissions", async () => {
    const root = directory(), store = new WebStorage(root);
    await store.bootstrap_owner(issuer, "owner");
    const queued = await store.request_access(issuer, "requester");
    const db = new DatabaseSync(store.database_path);
    db.exec("ALTER TABLE access_requests DROP COLUMN email");
    db.close();
    const upgraded = new WebStorage(root);
    await upgraded.init();
    expect(await upgraded.get_access_request(issuer, "requester")).toEqual(
      queued.status === "pending" ? queued.request : null,
    );
    expect(await upgraded.get_user(issuer, "owner")).toMatchObject({ enabled: 1, admin: 1 });
    await new WebStorage(root).init();
  });
  it("permits one concurrent reservation, reconciles once, and enforces exact cumulative decimal budgets", async () => {
    const root = directory(), first = new WebStorage(root), second = new WebStorage(root);
    const results = await Promise.allSettled([first.reserve_paid_run(reservation("a")), second.reserve_paid_run(reservation("b"))]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find(r => r.status === "rejected")).toMatchObject({ reason: expect.any(StorageConflict) });
    const winner = results[0]!.status === "fulfilled" ? "a" : "b";
    expect(await first.get_attempt(`attempt-${winner}`, "other-owner")).toBeNull();
    expect(await first.get_run(`run-${winner}`, "other-owner")).toBeNull();
    await first.mark_attempt_submitted(`attempt-${winner}`);
    await first.finish_attempt(`attempt-${winner}`, "failed_or_unknown");
    const paired = await Promise.all(["a", "b"].map(variant => first.save_output({
      run_id: `run-${winner}`, owner: "owner", attempt_id: `attempt-${winner}`,
      manifest: { brief_id: "brief", variant, azure_usage: {} }, audio: Buffer.from(variant),
    })));
    await first.reconcile_attempt({ attempt_id: `attempt-${winner}`, owner: "owner", actual_cost_usd: "0.99", evidence_reference: "meter" });
    expect((await first.get_output(paired[0]!.output_id, "owner"))!.manifest.azure_usage).toMatchObject({ actual_allocated_cost_usd: "0.495", billing_reconciled: true });
    await expect(first.reconcile_attempt({ attempt_id: `attempt-${winner}`, owner: "owner", actual_cost_usd: "0", evidence_reference: "replay" })).rejects.toBeInstanceOf(StorageConflict);
    await expect(first.mark_attempt_submitted(`attempt-${winner}`)).rejects.toBeInstanceOf(StorageConflict);
    await expect(first.reserve_paid_run({ ...reservation("over"), estimated_cost_usd: "0.010000000000000000001" })).rejects.toThrow("budget");
    expect(await first.get_run("run-over", "owner")).toBeNull();
    await first.reserve_paid_run(reservation("exact"));
  });
  it("fails closed on nonfinite historical billed costs rather than treating them as available budget", async () => {
    const store = new WebStorage(directory());
    await store.reserve_paid_run(reservation("a"));
    const db = new DatabaseSync(store.database_path);
    db.exec("UPDATE paid_attempts SET status='reconciled',actual_cost_usd='NaN'"); db.close();
    await expect(store.reserve_paid_run(reservation("b"))).rejects.toThrow("invalid cost");
    expect(await store.get_run("run-b", "owner")).toBeNull();
  });
  it("serializes paid attempts, evaluations and logical jobs across separate Node processes", async () => {
    const root = directory(), store = new WebStorage(root), saved = await output(store);
    expect((await concurrent_processes(root, "paid")).sort()).toEqual(["blocked", "reserved"]);
    expect((await concurrent_processes(root, "evaluation", saved.output_id)).sort()).toEqual([false, true]);
    const ids = await concurrent_processes(root, "job");
    expect(ids[0]).toBe(ids[1]);
    expect(readdirSync(join(root, "melody", "artifacts"))).toHaveLength(1);
  });
});

describe("private SQLite outputs", () => {
  it("retains pre-existing Python schemas and records with unchanged column ordering", async () => {
    const root = directory(), db = new DatabaseSync(join(root, "earwyrm.sqlite3"));
    db.exec(`CREATE TABLE runs (run_id TEXT PRIMARY KEY, owner TEXT NOT NULL, mode TEXT NOT NULL CHECK (mode IN ('instrumental','azure')), brief_ids_json TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL);
      INSERT INTO runs VALUES ('legacy','owner','instrumental','["brief"]','completed','2026-01-01T00:00:00+00:00');`);
    db.close();
    const store = new WebStorage(root);
    expect(await store.get_run("legacy", "owner")).toMatchObject({ run_id: "legacy", status: "completed", brief_ids: ["brief"] });
    await store.bootstrap_owner(issuer, "owner");
    const reopened = new DatabaseSync(store.database_path);
    expect(reopened.prepare("PRAGMA table_info(runs)").all().map(row => row.name)).toEqual(["run_id", "owner", "mode", "brief_ids_json", "status", "created_at"]);
    reopened.close();
  });
  it("keeps media private, hides other owners and freezes the first concurrent evaluation", async () => {
    const store = new WebStorage(directory()), saved = await output(store), second = new WebStorage(store.root);
    const options = { output_id: saved.output_id, owner: "owner", brand_transcription: "brand", cta_transcription: "cta", self_rating: "usable", brand_match: true, cta_match: false };
    expect((await Promise.all([store.save_evaluation(options), second.save_evaluation({ ...options, self_rating: "other" })])).sort()).toEqual([false, true]);
    expect((await store.get_output(saved.output_id, "owner"))!.evaluation).toMatchObject({ self_rating: "usable" });
    expect(await store.get_output(saved.output_id, "other")).toBeNull();
    expect(await store.list_outputs("other")).toEqual([]);
    await expect(store.save_evaluation({ ...options, owner: "other" })).rejects.toBeInstanceOf(StorageNotFound);
    await expect(store.save_output({ run_id: "run", owner: "other", manifest: { brief_id: "brief", variant: "a" }, audio: Buffer.from("bad") })).rejects.toBeInstanceOf(StorageNotFound);
    const file = await store.audio_path((await store.get_output(saved.output_id, "owner"))!);
    expect(readFileSync(file).toString()).toBe("private audio");
    for (const path of [store.root, store.audio_dir, store.work_dir]) expect(statSync(path).mode & 0o777).toBe(0o700);
    for (const path of [store.database_path, file]) expect(statSync(path).mode & 0o777).toBe(0o600);
    await expect(store.audio_path({ audio_filename: "../private.wav" })).rejects.toThrow("invalid");
    await expect(store.audio_path({ audio_filename: "..\\private.wav" })).rejects.toThrow("invalid");
    const other = join(store.root, "other.wav"); writeFileSync(other, "unrelated");
    rmSync(file); symlinkSync(other, file);
    await expect(store.audio_path({ audio_filename: saved.file })).rejects.toThrow("unsafe");
  });
  it("fails closed after database loss, both cached and restarted, and removes failed media", async () => {
    const store = new WebStorage(directory());
    await output(store);
    const before = readdirSync(store.audio_dir);
    const db = new DatabaseSync(store.database_path); db.exec("DROP TABLE outputs"); db.close();
    await expect(store.save_output({ run_id: "run", owner: "owner", manifest: { brief_id: "brief", variant: "missing" }, audio: Buffer.from("bad") })).rejects.toThrow();
    expect(readdirSync(store.audio_dir)).toEqual(before);
    writeFileSync(join(store.root, ".earwyrm-initialized"), "");
    rmSync(store.database_path);
    await expect(store.list_runs("owner")).rejects.toThrow();
    expect(() => new WebStorage(store.root)).toThrow();
    expect(existsSync(store.database_path)).toBe(false);
  });
  it("rejects static-root containment including a symlink ancestor", () => {
    expect(() => new WebStorage(STATIC_ROOT)).toThrow("outside");
    expect(() => new WebStorage(join(STATIC_ROOT, "private"))).toThrow("outside");
    const root = directory(), staticDir = join(root, "static");
    mkdirSync(staticDir);
    const alias = join(root, "alias"); symlinkSync(staticDir, alias);
    // Existing aliases are resolved before paths are selected.
    const store = new WebStorage(join(alias, "private"));
    expect(store.root).toBe(join(staticDir, "private"));
  });
  it("preserves operator bootstrap semantics without CLI side effects on import", async () => {
    const root = directory(), store = new WebStorage(root);
    await store.init();
    const env = { ENTRA_EXPECTED_ISSUER: issuer };
    const args = ["--data-dir", root, "bootstrap-owner", "--issuer", issuer, "--subject", "owner"];
    expect(await main(args, env)).toBe(0);
    await store.set_user(issuer, "owner", { enabled: false, admin: false, paid_speech: false });
    expect(await main(args, env)).toBe(2);
    expect((await store.get_user(issuer, "owner"))!.enabled).toBe(0);
    expect(await main(["--data-dir", root, "set-user", "--issuer", issuer, "--subject", "second", "--enabled", "yes", "--admin", "no", "--paid-speech", "yes"], env)).toBe(0);
    expect((await store.get_user(issuer, "second"))!.paid_speech).toBe(1);
    expect(await main(["--data-dir", root, "list-users"], env)).toBe(0);
  });
});

describe("durable SQLite composition jobs", () => {
  it("writes complete real artifacts and returns one identity across concurrent retries and restarts", async () => {
    const root = directory(), first = new MelodyService(root), second = new MelodyService(root), request = composition();
    const [a, b] = await Promise.all([first.submit(request), second.submit(request)]);
    expect(a).toEqual(b);
    expect(await new MelodyService(root).submit(request)).toEqual(a);
    expect(readdirSync(first.artifact_dir)).toEqual([a.job_id]);
    expect(a.chords).toHaveLength(15); expect(a.syllable_timing).toHaveLength(9);
    expect((await first.read_artifact(a.job_id, "score.mid")).subarray(0, 4).toString()).toBe("MThd");
    const wav = await first.read_artifact(a.job_id, "backing.wav");
    expect(wav.subarray(0, 4).toString()).toBe("RIFF");
    expect(wav.readUInt32LE(24)).toBe(24000);
    expect(wav.readUInt32LE(40)).toBe(30 * 24000 * 2);
    for (const component of a.components) expect(component.status).toContain("Pending");
    const db = new DatabaseSync(first.database_path);
    db.exec("UPDATE render_jobs SET status = 'running'"); db.close();
    expect((await second.submit(request)).status).toBe("running");
    await expect(first.submit({ ...request, product_path: "spoken" })).rejects.toBeInstanceOf(JobConflict);
    await expect(first.submit({ ...request, logical_job_id: "different" })).rejects.toBeInstanceOf(SimilarityError);
    await expect(first.read_artifact(a.job_id, "../score.mid")).rejects.toBeInstanceOf(JobNotFound);
    writeFileSync(join(first.artifact_dir, a.job_id, "backing.wav"), "corrupted");
    await expect(first.read_artifact(a.job_id, "backing.wav")).rejects.toThrow("integrity");
  });
  it("reads legacy Python request JSON and committed resource digests without regenerating music", async () => {
    const root = directory(), service = new MelodyService(root), request = composition();
    await service.init();
    const job_id = randomUUID(), artifactDir = join(service.artifact_dir, job_id);
    mkdirSync(artifactDir);
    const bytes = Buffer.from("legacy bytes"), digest = createHash("sha256").update(bytes).digest("hex");
    const artifact = { uri: `earwyrm://jobs/${job_id}/score.mid`, media_type: "audio/midi", sha256: digest };
    writeFileSync(join(artifactDir, "score.mid"), bytes);
    const result = CompositionResult.parse({ job_id, logical_job_id: request.logical_job_id, product_path: request.product_path, seed: 42, midi: artifact, backing_tracks: [], artifacts: { "score.mid": artifact }, chords: [], syllable_timing: [], components: [],
      similarity: { maximum_similarity: 0, closest_reference: "", references_checked: 1, passed: true } });
    const db = new DatabaseSync(service.database_path);
    db.prepare("INSERT INTO render_jobs VALUES (?,?,?,?,?,'queued',?)").run(job_id, request.logical_job_id, JSON.stringify(request, null, 2), JSON.stringify(result), "{}", "old");
    db.close();
    expect(await service.submit(request)).toEqual(result);
    expect(await service.read_artifact(job_id, "score.mid")).toEqual(bytes);
    expect(canonical_json(request)).not.toBe(JSON.stringify(request, null, 2));
    const seed = "9223372036854775807", legacy = new DatabaseSync(service.database_path);
    const request_json = JSON.stringify(request).replace('"seed":42', `"seed":${seed}`);
    const result_json = JSON.stringify(result).replace('"seed":42', `"seed":${seed}`);
    legacy.prepare("UPDATE render_jobs SET request_json=?,result_json=? WHERE job_id=?").run(request_json, result_json, job_id); legacy.close();
    const database_before = readFileSync(service.database_path);
    expect(await service.get_job(job_id)).toEqual({ ...result, seed });
    expect(await service.submit({ ...request, seed })).toEqual({ ...result, seed });
    expect(await service.read_artifact(job_id, "score.mid")).toEqual(bytes);
    expect(readFileSync(service.database_path)).toEqual(database_before);
    expect(readdirSync(service.artifact_dir)).toEqual([job_id]);
  });

  describe("lossless historical seed JSON", () => {
    it.each(["9007199254740992", "9007199254740993", "4611686018427387903", "9223372036854775807"])("preserves exact historical digits %s from source, never the rounded number", seed => {
      const text = `{"seed":${seed},"nested":{"seed":${seed}},"ordinary":${seed},"text":"seed: ${seed}"}`;
      expect(parse_seed_json(text)).toEqual({ seed, nested: { seed }, ordinary: Number(seed), text: `seed: ${seed}` });
    });
    it("retains safe seed numbers and existing canonical decimal-string seeds", () => {
      expect(parse_seed_json('{"seed":9007199254740991,"nested":{"seed":0}}')).toEqual({ seed: Number.MAX_SAFE_INTEGER, nested: { seed: 0 } });
      expect(parse_seed_json('{"seed":"9007199254740993"}')).toEqual({ seed: "9007199254740993" });
      expect(CompositionResult.shape.seed.parse("9223372036854775807")).toBe("9223372036854775807");
      expect(() => CompositionResult.shape.seed.parse(Number("9007199254740993"))).toThrow();
    });
    it.each(["9223372036854775808", "-1", "9007199254740991.1", "9.007199254740993e15"])("refuses invalid/out-of-range seed token %s rather than rounding it", token => {
      expect(() => parse_seed_json(`{"seed":${token}}`)).toThrow();
    });
  });
  it("blocks repeated local history, rolls back artifact failure, and never recreates a missing database", async () => {
    const root = directory(), service = new MelodyService(root);
    await service.init();
    rmSync(service.artifact_dir, { recursive: true }); writeFileSync(service.artifact_dir, "not a directory");
    await expect(service.submit(composition())).rejects.toBeInstanceOf(CompositionUnavailable);
    const db = new DatabaseSync(service.database_path);
    expect(db.prepare("SELECT count(*) AS n FROM render_jobs").get()!.n).toBe(0); db.close();
    rmSync(service.artifact_dir); mkdirSync(service.artifact_dir);
    const result = await service.submit(composition());
    expect(result.status).toBe("queued");
    expect(Object.keys(await service.history_snapshot())).toHaveLength(2);
    rmSync(service.database_path);
    await expect(service.history_snapshot()).rejects.toBeInstanceOf(CompositionUnavailable);
    expect(existsSync(service.database_path)).toBe(false);
  });
});
