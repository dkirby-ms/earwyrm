import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Decimal } from "decimal.js";
import { afterEach, describe, expect, it } from "vitest";
import { StorageAccessDenied, StorageConflict, WebStorage } from "../src/web_storage.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
async function fixture() {
  const root = mkdtempSync(join(process.cwd(), ".budget-test-")); roots.push(root);
  const store = new WebStorage(root);
  await store.bootstrap_owner("issuer", "admin");
  await store.set_user("issuer", "user", { enabled: true, admin: false, paid_speech: true });
  return store;
}
const d = (value: string | number) => new Decimal(value);
const defaults = { text: "100", speech: "100" };
const reserve = (store: WebStorage, cost: string, owner = "user") =>
  store.reserve_lyric_action("write", d(cost), d(100), d(100), owner);

describe("persistent lifetime and shared budgets", () => {
  it("defaults to $5, combines feature reservations, and serializes concurrent calls", async () => {
    const store = await fixture();
    expect(await store.get_user_budget("user")).toEqual({
      limit_usd: "5", charged_usd: "0", remaining_usd: "5", lyric_reserved_usd: "0", lyric_actual_usd: "0",
    });
    await reserve(store, "4.8");
    await store.claim_score_compose({ owner: "user", logical_job_id: "job", request_sha256: "a".repeat(64), cost: "0.1", cap: "1", total: "100" });
    const outcomes = await Promise.allSettled([reserve(store, "0.1"), reserve(new WebStorage(store.root), "0.1")]);
    expect(outcomes.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(await store.get_user_budget("user")).toEqual({
      limit_usd: "5", charged_usd: "5", remaining_usd: "0", lyric_reserved_usd: "4.9", lyric_actual_usd: "0",
    });
    await reserve(store, "0.2", "admin");
    await expect(reserve(store, "0.000000000001")).rejects.toThrow("lifetime budget");
    const replay = await store.claim_score_compose({ owner: "user", logical_job_id: "job", request_sha256: "a".repeat(64), cost: "0.1", cap: "1", total: "100" });
    expect(replay.claimed).toBe(false);
  });

  it("combines Speech and text, keeps confirmed actuals separate, and never resets spend on limit edits", async () => {
    const store = await fixture();
    await reserve(store, "4.9");
    await store.reserve_paid_run({ run_id: "run", attempt_id: "attempt", owner: "user", brief_ids: [],
      per_brief_estimates: {}, estimated_cost_usd: "0.1", submitted_characters: 1, total_budget_usd: "100", evidence: {} });
    await expect(reserve(store, "0.01")).rejects.toThrow("lifetime budget");
    await store.reconcile_attempt({ attempt_id: "attempt", owner: "user", actual_cost_usd: "0.05", evidence_reference: "test-meter" });
    await store.set_budget_as_admin("issuer", "admin", "user", "user", "0");
    expect(await store.get_user_budget("user")).toEqual({
      limit_usd: "0", charged_usd: "4.95", remaining_usd: "0", lyric_reserved_usd: "4.9", lyric_actual_usd: "0",
    });
    await store.set_budget_as_admin("issuer", "admin", "user", "user", "6");
    await reserve(store, "0.05");
    const summary = await store.budgets_as_admin("issuer", "admin", defaults);
    expect(summary.actuals).toEqual({ speech_usd: "0.05", ai_usd: "0", unreconciled_speech_attempts: 0 });
    expect(summary.text.charged_usd).toBe("4.95");
    expect((await new WebStorage(store.root).get_user_budget("user")).limit_usd).toBe("6");
  });

  it("honors shared overrides in reservations and preflight without weakening per-action caps", async () => {
    const store = await fixture();
    await store.set_budget_as_admin("issuer", "admin", "text", "", "0");
    await expect(reserve(store, "0.1")).rejects.toThrow("shared");
    await expect(store.check_jingle_text_budget(d("0.1"), d(100))).rejects.toThrow("shared");
    await store.set_budget_as_admin("issuer", "admin", "text", "", "2");
    await store.reserve_lyric_action("write", d("0.2"), d(1), d("0.1"), "user");
    await expect(store.reserve_lyric_action("write", d(2), d(1), d(100), "user")).rejects.toThrow("per-action");
    await store.set_budget_as_admin("issuer", "admin", "speech", "", "0");
    await expect(store.check_jingle_speech_budget(d("0.1"), d(100))).rejects.toThrow("Speech budget");
    await expect(store.check_user_jingle_budget("user", d("4.81"))).rejects.toThrow("lifetime budget");
  });

  it("rejects nonadmins, revoked admins, unknown users and malformed limits", async () => {
    const store = await fixture();
    await expect(store.budgets_as_admin("issuer", "user", defaults)).rejects.toBeInstanceOf(StorageAccessDenied);
    await expect(store.set_budget_as_admin("issuer", "user", "text", "", "1")).rejects.toBeInstanceOf(StorageAccessDenied);
    await expect(store.set_budget_as_admin("issuer", "admin", "user", "absent", "1")).rejects.toThrow("not found");
    for (const value of ["-1", "NaN", "Infinity", "1e2", "100000000", "0.0000000000001", " 1"]) {
      await expect(store.set_budget_as_admin("issuer", "admin", "text", "", value)).rejects.toThrow("Invalid budget");
    }
    await store.set_user("issuer", "admin", { enabled: false, admin: true, paid_speech: true });
    await expect(store.set_budget_as_admin("issuer", "admin", "text", "", "1")).rejects.toBeInstanceOf(StorageAccessDenied);
  });

  it("adds nullable ownership to historical lyrics and preserves global usage on reinitialization", async () => {
    const store = await fixture();
    const db = new DatabaseSync(store.database_path);
    db.exec("ALTER TABLE lyric_reservations DROP COLUMN owner");
    db.prepare("INSERT INTO lyric_reservations (reservation_id, action, reserved_usd, created_at) VALUES (?, 'write', '1.23', 'old')")
      .run(randomUUID());
    db.close();
    const upgraded = new WebStorage(store.root);
    await upgraded.init();
    const summary = await upgraded.budgets_as_admin("issuer", "admin", defaults);
    expect(summary.unattributed_text_usd).toBe("1.23");
    expect(summary.text.charged_usd).toBe("1.23");
    const reservation = summary.lyric_reservations[0]!;
    await upgraded.settle_lyric_reservation_as_admin(
      "issuer", "admin", reservation.reservation_id, "0.02", "legacy-meter", "Verified legacy reservation cost",
    );
    const settled = await upgraded.budgets_as_admin("issuer", "admin", defaults);
    expect(settled.unattributed_text_usd).toBe("0.02");
    expect(settled.text).toMatchObject({ charged_usd: "0.02", lyric_reserved_usd: "0", lyric_actual_usd: "0.02" });
    expect((await upgraded.get_user_budget("user")).charged_usd).toBe("0");
    await reserve(upgraded, "0.1");
    expect((await upgraded.get_user_budget("user")).charged_usd).toBe("0.1");
  });

  it("releases only the verified difference and keeps corrections and reopenings auditable", async () => {
    const store = await fixture();
    await reserve(store, "0.62");
    const pending = (await store.budgets_as_admin("issuer", "admin", defaults)).lyric_reservations[0];
    expect(pending.settlement_status).toBe("pending");
    expect((await store.get_user_budget("user")).lyric_reserved_usd).toBe("0.62");

    const settled = await store.settle_lyric_reservation_as_admin(
      "issuer", "admin", pending.reservation_id, "0.05", "azure-meter-42", "Verified cost from Azure meter",
    );
    expect(settled.events).toHaveLength(1);
    expect((await store.get_user_budget("user")).charged_usd).toBe("0.05");
    expect((await store.get_user_budget("user")).lyric_actual_usd).toBe("0.05");

    const corrected = await store.correct_lyric_reservation_as_admin(
      "issuer", "admin", pending.reservation_id, "0.03", "azure-meter-43", "Verified cost was lower",
    );
    expect(corrected.actual_cost_usd).toBe("0.03");
    expect(corrected.events[1]).toMatchObject({
      event_type: "corrected", previous_actual_usd: "0.05", new_actual_usd: "0.03",
      actor_issuer: "issuer", actor_subject: "admin", evidence_reference: "azure-meter-43",
      reason: "Verified cost was lower",
    });
    expect((await store.get_user_budget("user")).charged_usd).toBe("0.03");

    const reopened = await store.reopen_lyric_reservation_as_admin(
      "issuer", "admin", pending.reservation_id, "Billing evidence needs re-verification",
    );
    expect(reopened).toMatchObject({ settlement_status: "pending", actual_cost_usd: null, evidence_reference: null });
    expect(reopened.events[2]).toMatchObject({
      event_type: "reopened", previous_status: "settled", new_status: "pending",
      previous_actual_usd: "0.03", new_actual_usd: null, reason: "Billing evidence needs re-verification",
    });
    expect((await store.get_user_budget("user")).charged_usd).toBe("0.62");
  });

  it("accepts verified zero-dollar settlements without retaining the hold", async () => {
    const store = await fixture();
    await reserve(store, "0.62");
    const reservation = (await store.budgets_as_admin("issuer", "admin", defaults)).lyric_reservations[0];
    const settled = await store.settle_lyric_reservation_as_admin(
      "issuer", "admin", reservation.reservation_id, "0", "azure-meter-zero", "Verified no charge",
    );
    expect(settled).toMatchObject({ settlement_status: "settled", actual_cost_usd: "0" });
    expect(await store.get_user_budget("user")).toMatchObject({
      charged_usd: "0", lyric_reserved_usd: "0", lyric_actual_usd: "0",
    });
  });

  it("counts a verified actual above the original reservation in full", async () => {
    const store = await fixture();
    await reserve(store, "0.62");
    const reservation = (await store.budgets_as_admin("issuer", "admin", defaults)).lyric_reservations[0];
    const settled = await store.settle_lyric_reservation_as_admin(
      "issuer", "admin", reservation.reservation_id, "0.70", "azure-meter-over-reserve", "Verified overage",
    );
    expect(settled).toMatchObject({ reserved_usd: "0.62", actual_cost_usd: "0.7" });
    expect((await store.get_user_budget("user")).charged_usd).toBe("0.7");
  });

  it("allows only one concurrent settlement of a reservation", async () => {
    const store = await fixture();
    await reserve(store, "0.62");
    const reservation = (await store.budgets_as_admin("issuer", "admin", defaults)).lyric_reservations[0];
    const outcomes = await Promise.allSettled([
      store.settle_lyric_reservation_as_admin(
        "issuer", "admin", reservation.reservation_id, "0.04", "meter-a", "Verified amount A",
      ),
      new WebStorage(store.root).settle_lyric_reservation_as_admin(
        "issuer", "admin", reservation.reservation_id, "0.05", "meter-b", "Verified amount B",
      ),
    ]);
    expect(outcomes.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find(result => result.status === "rejected");
    expect(rejected).toMatchObject({ status: "rejected", reason: expect.any(StorageConflict) });
    expect((await store.budgets_as_admin("issuer", "admin", defaults)).lyric_reservations[0].events).toHaveLength(1);
  });
});
