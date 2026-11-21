import { describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { CredentialUnavailableError } from "@azure/identity";
import { Assessment, AzureLyricBackend, CATEGORIES, CloudFailure, LyricCloudSettings, ModelRefusal, Preflight, Screening, type CloudTransport, type LyricBackend } from "../src/lyric_cloud.js";
import { lyric_allowance, lyric_budget } from "../src/lyric_budget.js";
import { brand_pronunciations, LyricDraft, LyricRequest, LyricResult, lyric_syllables, normalize_spoken_text, validate_draft } from "../src/lyrics.js";
import { LyricWriter } from "../src/lyric_service.js";
import { DiagnosticPersistenceFailure, set_jingle_provider_recorder, trace_jingle, type ProviderDiagnostic } from "../src/jingle_diagnostics.js";
import {
  AzureScoreComposer, score_prompt, type ScoreTelemetry, type ScoreTelemetrySpan,
} from "../src/score_cloud.js";

const request_fixture = (): LyricRequest => LyricRequest.parse({
  brief: { brief_id: "brief-001", name: "Bright Bike", offer: "Bike tune ups", location: "Lakeview", contact_details: { email: "shop@example.com", phone: "+1-202-555-0101" }, tone: "Friendly and practical", approved_claims: ["Bike tune ups are available", "Call to plan a visit"] },
  product_path: "spoken", cta: "Call Bright Bike to plan your next ride",
});
const draft_fixture = (): LyricDraft => LyricDraft.parse({
  hook: "Bright Bike, a tune up for your ride",
  lyrics: "Bright Bike, a tune up for your ride\nCall Bright Bike to plan your next ride",
  syllables_per_line: [8, 8], rhyme_scheme: "--", brand_count: 2, cta: "Call Bright Bike to plan your next ride",
});
const accepted_lyrics = () => LyricResult.parse({ status: "accepted", attempts: 1, output: draft_fixture(), reasons: [] });
const score_fixture = () => ({
  schema_version: 1, style: "retro-synth", tempo_bpm: 120, time_signature: "4/4", key_root: 0, mode: "major", bars: 8,
  progression: [0, 4, 5, 3], hook_motif: [0, 2, 4],
  tracks: [
    { instrument: "pad", events: [{ step: 0, degree: 0, duration_steps: 8 }] },
    { instrument: "bass", events: [{ step: 0, degree: 0, duration_steps: 2 }] },
    { instrument: "lead", events: [{ step: 0, degree: 0, duration_steps: 2 }] },
  ],
});
const guided_fixture = () => {
  const cta = "Call Bright Bike to plan your next day";
  const syllables_per_line = [8, 9, 9, 8];
  const lines = ["Bright Bike, a tune up for your ride", "A tune up for the bike at your side", "A tune to take along on your way", cta];
  const request = LyricRequest.parse({
    ...request_fixture(), product_path: "vocoded", cta,
    arrangement: { job_id: "00000000-0000-4000-8000-000000000001", timing_sha256: "a".repeat(64), syllables_per_line },
  });
  const candidate = { lyrics: lines.join("\n"), cta, syllables_per_line, rhyme_scheme: "AABB", brand_count: 2 };
  return { request, candidate, hook: lines[0] };
};
const backend_fixture = () => ({
  preflight: vi.fn<LyricBackend["preflight"]>().mockResolvedValue({ english: true, artist_imitation: false, risky_claims: false }),
  generate: vi.fn<LyricBackend["generate"]>().mockResolvedValue(JSON.stringify(draft_fixture())),
  assess: vi.fn<LyricBackend["assess"]>().mockResolvedValue({ english: true, grounded: true, risky_claims: false }),
  screen: vi.fn<LyricBackend["screen"]>().mockResolvedValue({ moderation_passed: true, protected_material_detected: false }),
});
const settings = new LyricCloudSettings("https://model.openai.azure.com", "test-deployment", "https://safety.cognitiveservices.azure.com");
const credential = { getToken: async () => ({ token: "TEST-ONLY", expiresOnTimestamp: 2 ** 40 }) };
const completion = (content: string, updates = {}) => ({ choices: [{ finish_reason: "stop", message: { content }, ...updates }] });
const transport = (data: unknown, status = 200) => vi.fn<CloudTransport>().mockImplementation(async () => new Response(JSON.stringify(data), { status }));

describe("deterministic lyric rules", () => {
  it("accepts short spoken CTAs only when the full jingle meets its syllable budget", () => {
    const request = request_fixture(), cta = "Call Bright Bike today";
    const hook = "Bright Bike, a tune up for your very next ride";
    request.cta = cta;
    const draft: LyricDraft = { hook, lyrics: `${hook}\n${cta}`, cta, syllables_per_line: [11, 5], rhyme_scheme: "--", brand_count: 2 };
    expect(validate_draft(request, draft)).toBe(draft);
    const short = "Bright Bike, a tune up for your next great ride";
    expect(() => validate_draft(request, { ...draft, hook: short, lyrics: `${short}\n${cta}`, syllables_per_line: [10, 5] })).toThrow("meter");
  });

  it("normalizes typographic punctuation without changing exact lyric wording", () => {
    const request = request_fixture();
    const cta = "Call Bright Bike to plan your next ride\u2026";
    const hook = "Let\u2019s ride with Bright Bike, on your next ride";
    request.cta = cta;
    expect(LyricRequest.parse(request).cta).toBe(cta);
    const draft: LyricDraft = { hook, lyrics: `${hook}\n${cta}`, cta, syllables_per_line: [9, 8], rhyme_scheme: "--", brand_count: 2 };
    expect(validate_draft(request, draft)).toBe(draft);
    expect(lyric_syllables(hook, {})).toHaveLength(9);
    expect(normalize_spoken_text("\u201cLet\u2019s\u00a0ride\u201d\u2014today\u2026")).toBe('"Let\'s ride"-today...');
    expect(() => validate_draft(request, { ...draft, cta: normalize_spoken_text(cta) })).toThrow("cta_placement");
    expect(LyricRequest.safeParse({ ...request, cta: "Call Bright Bike \u200btoday" }).success).toBe(false);
  });

  it("derives brand overrides only from explicit dictionary hints", () => {
    const overrides = brand_pronunciations("Zyvox Bike", "zyvox = zee fox");
    expect(lyric_syllables("Zyvox Bike", overrides)).toHaveLength(3);
    expect(() => lyric_syllables("Zyvox Bike", {})).toThrow("unknown_pronunciation");
    for (const hints of ["zyvox = qzx", "other = zee fox", "zyvox = zee\nzyvox = fox", "zyvox: zee fox"]) {
      expect(() => brand_pronunciations("Zyvox Bike", hints)).toThrow();
    }
  });

  it("still rejects out-of-meter lyrics when deriving syllable counts", () => {
    const request = request_fixture(), draft = draft_fixture();
    expect(() => validate_draft(request, {
      ...draft, hook: "Bright Bike", lyrics: `Bright Bike\n${request.cta}`,
    }, "derive")).toThrow("meter");
  });

  it("validates dictionary-based spoken and distinct phonetic AABB pairs", () => {
    const request = request_fixture(), draft = draft_fixture();
    expect(validate_draft(request, draft)).toBe(draft);
    request.product_path = "vocoded"; request.cta = "Call Bright Bike to plan your next day";
    const lines = ["Bright Bike, a tune up for your ride", "A tune up for the bike at your side", "A tune to take along on your way", request.cta];
    const vocoded = { ...draft, lyrics: lines.join("\n"), cta: request.cta, syllables_per_line: [8, 9, 9, 8], rhyme_scheme: "AABB" as const };
    expect(validate_draft(request, vocoded)).toBe(vocoded);
    expect(() => validate_draft(request, { ...vocoded, lyrics: vocoded.lyrics.replace("side", "shop") })).toThrow("rhyme");
  });
  it.each([
    [{ syllables_per_line: [1, 1] }, "syllable_metadata"],
    [{ brand_count: 1 }, "brand_count"],
    [{ cta: "Call today" }, "cta_placement"],
    [{ hook: "Different hook" }, "hook_placement"],
    [{ rhyme_scheme: "AABB" }, "rhyme_metadata"],
    [{ hook: "Bright Bike", lyrics: "Bright Bike\nCall Bright Bike to plan your next ride" }, "meter"],
    [{ hook: "Bright Bike, a tune up for your qzx", lyrics: "Bright Bike, a tune up for your qzx\nCall Bright Bike to plan your next ride" }, "unknown_pronunciation"],
  ] as const)("rejects independently recomputed rule failures %j", (update, code) => {
    expect(() => validate_draft(request_fixture(), { ...draft_fixture(), ...update, syllables_per_line: [...("syllables_per_line" in update ? update.syllables_per_line : [8, 8])] })).toThrow(code);
  });
  it.each(["&", "@", "+", "$", "%", "/", "24", "shop.com"])("rejects unspoken notation %s", notation => {
    const draft = draft_fixture(), hook = draft.hook.replace(",", ` ${notation},`);
    expect(() => validate_draft(request_fixture(), { ...draft, hook, lyrics: `${hook}\n${draft.cta}` })).toThrow("use_pronounceable_words");
  });
  it.each([{ Bright: ["B", "R", "AY1", "T"] }, { bright: ["INVALID"] }, { bright: ["B", "R"] }, { bright: [] }])("rejects invalid ARPABET %j", pronunciations => {
    expect(LyricRequest.safeParse({ ...request_fixture(), pronunciations }).success).toBe(false);
  });
  it("accepts explicit unknown-word pronunciations but rejects symbolic CTA and coercion", () => {
    const request = request_fixture(), draft = draft_fixture();
    request.pronunciations.qzx = ["R", "AY1", "D"];
    const hook = draft.hook.replace("ride", "qzx");
    expect(validate_draft(request, { ...draft, hook, lyrics: `${hook}\n${request.cta}` }).hook).toBe(hook);
    expect(LyricRequest.safeParse({ ...request, cta: "Call Bright Bike 24" }).success).toBe(false);
    expect(LyricDraft.safeParse({ ...draft, brand_count: "2" }).success).toBe(false);
    expect(LyricResult.safeParse({ status: "rejected", attempts: 1, output: draft, reasons: ["no"] }).success).toBe(false);
    expect(LyricResult.safeParse({ status: "unavailable", attempts: 0 }).success).toBe(false);
  });
  it.each([["spoken", 7, false], ["spoken", 8, true], ["spoken", 20, true], ["spoken", 21, false], ["vocoded", 7, false], ["vocoded", 8, true], ["vocoded", 12, true], ["vocoded", 13, false]] as const)("enforces %s meter boundary %i", (path, count, valid) => {
    const request = request_fixture(); request.product_path = path; request.cta = "Call Bright Bike to plan your next day";
    const first = `Bright Bike ${"one ".repeat(count - 3)}ride`;
    const lines = path === "spoken" ? [first, request.cta] : [first, `${"one ".repeat(7)}side`, `${"one ".repeat(7)}way`, request.cta];
    const draft: LyricDraft = { hook: first, lyrics: lines.join("\n"), syllables_per_line: path === "spoken" ? [count, 8] : [count, 8, 8, 8], rhyme_scheme: path === "spoken" ? "--" : "AABB", brand_count: 2, cta: request.cta };
    if (valid) expect(validate_draft(request, draft)).toBe(draft);
    else expect(() => validate_draft(request, draft)).toThrow("meter");
  });
});

describe("four-attempt fail-closed writer", () => {
  it.each(["leading_space", "trailing_space", "normalized_length"] as const)("rejects fixed CTA %s format before generation", async scenario => {
    const request = request_fixture(), backend = backend_fixture();
    request.cta = scenario === "leading_space" ? ` ${request.cta}` : scenario === "trailing_space"
      ? `${request.cta} ` : `${request.cta}${"\u2026".repeat(130)}`;
    const result = await new LyricWriter(backend, "browser_jingle").write(request);
    expect(result).toMatchObject({ status: "rejected", attempts: 0, reasons: ["fixed_lyric_format"], output: null });
    expect(backend.preflight).not.toHaveBeenCalled();
    expect(backend.generate).not.toHaveBeenCalled();
  });

  it.each(["overlong", "unknown_brand", "unknown_cta", "repeated_brand"] as const)("rejects fixed %s input before generation", async scenario => {
    const request = request_fixture(), backend = backend_fixture();
    if (scenario === "overlong") request.cta = `Call Bright Bike ${"one ".repeat(20)}today`;
    if (scenario === "unknown_brand") request.brief.name = "Zyvox Bike";
    if (scenario === "unknown_cta") request.cta = "Call Bright Bike to plan your qzx ride";
    if (scenario === "repeated_brand") request.cta = "Bright Bike Bright Bike Bright Bike today";
    const result = await new LyricWriter(backend, "browser_jingle").write(request);
    expect(result).toMatchObject({ status: "rejected", attempts: 0, output: null });
    expect(result.reasons).toEqual([scenario === "overlong" ? "cta_meter" : scenario === "repeated_brand" ? "cta_brand_count" : "fixed_pronunciation_required"]);
    expect(backend.preflight).not.toHaveBeenCalled();
    expect(backend.generate).not.toHaveBeenCalled();
  });

  it("accepts a browser short CTA and preserves it across opening retries", async () => {
    const request = request_fixture(), backend = backend_fixture();
    request.cta = "Call Bright Bike today";
    backend.generate.mockResolvedValueOnce(JSON.stringify({ hook: "Bright Bike, a tune up for your ride" }))
      .mockResolvedValueOnce(JSON.stringify({ hook: "Bright Bike, a tune up for your very next ride" }));
    const result = await new LyricWriter(backend, "browser_jingle").write(request);
    expect(result).toMatchObject({ status: "accepted", attempts: 2, output: { cta: request.cta, syllables_per_line: [11, 5] } });
    expect(backend.generate.mock.calls[1][1]).toEqual(["meter"]);
    expect(backend.assess).toHaveBeenCalledTimes(1);
    expect(backend.screen).toHaveBeenCalledTimes(1);
  });

  it.each(["comparison", "invitation", "contextual_imitation", "contextual_risk"] as const)("uses contextual safety for %s", async scenario => {
    const request = request_fixture(), backend = backend_fixture();
    request.creative_direction = scenario === "comparison" || scenario === "contextual_imitation"
      ? "A bell that sounds like a doorbell" : "Feel free to visit";
    if (scenario === "contextual_imitation") backend.preflight.mockResolvedValue({ english: true, artist_imitation: true, risky_claims: false });
    if (scenario === "contextual_risk") backend.assess.mockResolvedValue({ english: true, grounded: true, risky_claims: true });
    const result = await new LyricWriter(backend).write(request);
    expect(result.status).toBe(scenario === "contextual_imitation" ? "rejected" : scenario === "contextual_risk" ? "human_review_required" : "accepted");
    expect(backend.preflight).toHaveBeenCalledTimes(1);
    expect(backend.screen).toHaveBeenCalledTimes(scenario === "contextual_imitation" ? 0 : 1);
  });

  it("does not hold a safe draft just because its creative direction excludes a sale", async () => {
    const request = request_fixture(), backend = backend_fixture();
    request.creative_direction = "Do not mention a sale";
    const result = await new LyricWriter(backend).write(request);
    expect(result.status).toBe("accepted");
    expect(backend.preflight).toHaveBeenCalledWith(request);
    expect(backend.assess).toHaveBeenCalledTimes(1);
    expect(backend.screen).toHaveBeenCalledTimes(1);
  });

  it("still holds creative direction identified as risky by preflight", async () => {
    const request = request_fixture(), backend = backend_fixture();
    request.creative_direction = "Promote a sale";
    backend.preflight.mockResolvedValue({ english: true, artist_imitation: false, risky_claims: true });
    const result = await new LyricWriter(backend).write(request);
    expect(result.status).toBe("human_review_required");
    expect(backend.screen).toHaveBeenCalledTimes(1);
  });

  it("requires preflight, generation, independent assessment and screening before acceptance", async () => {
    const backend = backend_fixture(), result = await new LyricWriter(backend).write(request_fixture());
    expect(result.status).toBe("accepted"); expect(result.attempts).toBe(1); expect(result.output).toEqual(draft_fixture());
    expect(result.broadcast_approval_required).toBe(true); expect(result.ai_generated).toBe(true);
    const order = [backend.preflight, backend.generate, backend.assess, backend.screen].map(mock => mock.mock.invocationCallOrder[0]);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
  it.each(["malformed", "metadata", "ungrounded", "transient"])("allows exactly four attempts for %s", async reason => {
    const backend = backend_fixture();
    if (reason === "malformed") backend.generate.mockResolvedValue("{");
    if (reason === "metadata") backend.generate.mockResolvedValue(JSON.stringify({ ...draft_fixture(), syllables_per_line: [2, 2] }));
    if (reason === "ungrounded") backend.assess.mockResolvedValue({ english: true, grounded: false, risky_claims: false });
    if (reason === "transient") backend.generate.mockRejectedValue(new CloudFailure("cloud_temporarily_unavailable", { retryable: true }));
    const result = await new LyricWriter(backend).write(request_fixture());
    expect(result.status).toBe("retry_exhausted"); expect(result.attempts).toBe(4); expect(result.output).toBeNull();
    expect(backend.generate).toHaveBeenCalledTimes(4); expect(backend.screen).not.toHaveBeenCalled();
  });
  it("uses safe feedback and can accept the second attempt", async () => {
    const backend = backend_fixture(); backend.generate.mockResolvedValueOnce("{}");
    const result = await new LyricWriter(backend).write(request_fixture());
    expect(result.status).toBe("accepted"); expect(result.attempts).toBe(2);
    expect(backend.generate.mock.calls.map(call => call[1])).toEqual([[], ["malformed_lyric_output"]]);
  });
  it.each([undefined, "Bright Bike a tune up for your ride"])("derives the guided hook and retries an unknown pronunciation (provided hook: %s)", async supplied_hook => {
    const { request, candidate, hook } = guided_fixture();
    const backend = backend_fixture();
    backend.generate
      .mockResolvedValueOnce(JSON.stringify({ ...candidate, lyrics: candidate.lyrics.replace("your side", "your qzx") }))
      .mockResolvedValueOnce(JSON.stringify({ ...candidate, hook: supplied_hook }));
    const result = await new LyricWriter(backend).write(request);
    expect(backend.generate.mock.calls.map(([, feedback, line]) => [feedback, line]))
      .toEqual([[[], undefined], [["unknown_pronunciation"], 2]]);
    expect(result).toMatchObject({ status: "accepted", attempts: 2, output: { ...candidate, hook } });
    expect(backend.assess).toHaveBeenCalledExactlyOnceWith(request, result.output);
    expect(backend.screen).toHaveBeenCalledExactlyOnceWith(candidate.lyrics);
  });
  it("does not bypass guided meter checks when the model omits the hook", async () => {
    const { request, candidate } = guided_fixture();
    const backend = backend_fixture();
    backend.generate.mockResolvedValue(JSON.stringify({ ...candidate, lyrics: candidate.lyrics.replace("on your way", "on the long way") }));
    const result = await new LyricWriter(backend).write(request);
    expect(result).toMatchObject({ status: "retry_exhausted", attempts: 4, reasons: ["arrangement_meter"], output: null });
    expect(backend.assess).not.toHaveBeenCalled();
    expect(backend.screen).not.toHaveBeenCalled();
  });
  it.each(["preflight", "assess", "screen", "generate"] as const)("does not retry unavailable %s evidence", async stage => {
    const backend = backend_fixture();
    backend[stage].mockRejectedValue(new CloudFailure("missing_evidence", { retryable: stage === "screen" }));
    const result = await new LyricWriter(backend).write(request_fixture());
    expect(result.status).toBe("unavailable"); expect(result.output).toBeNull(); expect(result.reasons).toEqual(["missing_evidence"]);
    expect(backend.generate.mock.calls.length).toBeLessThanOrEqual(1);
  });
  it.each([[false, false, ["moderation_rejected"]], [true, true, ["protected_material"]], [false, true, ["moderation_rejected", "protected_material"]]] as const)("makes moderation=%s protected=%s terminal", async (moderation_passed, protected_material_detected, reasons) => {
    const backend = backend_fixture(); backend.screen.mockResolvedValue({ moderation_passed, protected_material_detected });
    const result = await new LyricWriter(backend).write(request_fixture());
    expect(result.status).toBe("rejected"); expect(result.output).toBeNull(); expect(result.reasons).toEqual(reasons);
    expect(backend.generate).toHaveBeenCalledTimes(1);
  });
  it.each(["preflight", "assessment", "price", "superlative", "regulated"])("holds %s risk after screening", async source => {
    const request = request_fixture(), backend = backend_fixture();
    if (source === "preflight") backend.preflight.mockResolvedValue({ english: true, artist_imitation: false, risky_claims: true });
    else if (source === "assessment") backend.assess.mockResolvedValue({ english: true, grounded: true, risky_claims: true });
    else request.brief.approved_claims.push(({ price: "Tune ups cost ten dollars", superlative: "The best tune ups", regulated: "Health clinic services" })[source]!);
    const result = await new LyricWriter(backend).write(request);
    expect(result.status).toBe("human_review_required"); expect(result.output).not.toBeNull(); expect(backend.screen).toHaveBeenCalledTimes(1);
  });
  it.each(["explicit", "preflight", "input_language", "output_language", "refusal"])("rejects %s without evasion", async source => {
    const request = request_fixture(), backend = backend_fixture();
    if (source === "explicit") request.brief.tone = "In the style of a named artist";
    else if (source === "preflight") backend.preflight.mockResolvedValue({ english: true, artist_imitation: true, risky_claims: false });
    else if (source === "input_language") backend.preflight.mockResolvedValue({ english: false, artist_imitation: false, risky_claims: false });
    else if (source === "output_language") backend.assess.mockResolvedValue({ english: false, grounded: true, risky_claims: false });
    else backend.generate.mockRejectedValue(new ModelRefusal());
    const result = await new LyricWriter(backend).write(request);
    expect(result.status).toBe("rejected"); expect(result.output).toBeNull(); expect(backend.generate.mock.calls.length).toBeLessThanOrEqual(1);
    expect(backend.screen).not.toHaveBeenCalled();
  });
  it("propagates programmer errors instead of hiding them as unavailable", async () => {
    const backend = backend_fixture(); backend.generate.mockRejectedValue(new RangeError("test bug"));
    await expect(new LyricWriter(backend).write(request_fixture())).rejects.toThrow("test bug");
  });
});

describe("Azure wire contracts without paid requests", () => {
  it("captures the exact lyric model request and successful response without transport headers", async () => {
    const app = express(), entries: ProviderDiagnostic[] = [];
    const output = completion('{"english":true,"artist_imitation":false,"risky_claims":false}');
    const client = transport(output);
    app.get("/", (_req, res) => trace_jingle(res, async () => {
      set_jingle_provider_recorder(async entry => { entries.push(entry); });
      await new AzureLyricBackend(settings, credential, client).preflight(request_fixture());
      res.sendStatus(204);
    }));
    await request(app).get("/").expect(204);
    expect(entries[0]?.model_exchange).toEqual({
      request: { status: "captured", text: client.mock.calls[0]?.[1].body },
      response: { status: "captured", text: JSON.stringify(output) },
    });
    expect(JSON.stringify(entries)).not.toContain("TEST-ONLY");
  });

  it("reports an unreadable model response without retaining invalid UTF-8", async () => {
    const app = express(), entries: ProviderDiagnostic[] = [];
    const client = vi.fn<CloudTransport>().mockResolvedValue(new Response(new Uint8Array([255])));
    app.get("/", (_req, res) => trace_jingle(res, async () => {
      set_jingle_provider_recorder(async entry => { entries.push(entry); });
      await expect(new AzureLyricBackend(settings, credential, client).preflight(request_fixture()))
        .rejects.toThrow("malformed_cloud_response");
      res.sendStatus(204);
    }));
    await request(app).get("/").expect(204);
    expect(entries[0]?.model_exchange?.response).toEqual({ status: "unreadable", text: null });
  });

  it("blocks oversized requests and extra completions before transport", async () => {
    const allowance = lyric_allowance("discuss", lyric_budget({
      LYRIC_MODEL_CALL_MAX_USD: "0.001", LYRIC_SAFETY_CALL_MAX_USD: "0.002",
      LYRIC_PER_ACTION_CAP_USD: "1", LYRIC_TOTAL_BUDGET_USD: "1",
    }));
    const client = vi.fn(async () => new Response(null, { status: 503 }));
    const backend = new AzureLyricBackend(settings, credential, client, allowance.consume);
    await expect(backend.screen("é".repeat(33000))).rejects.toThrow("lyric_request_too_large");
    for (let i = 0; i < 2; i++) await expect(backend.generate(request_fixture(), [])).rejects.toThrow("cloud_temporarily_unavailable");
    await expect(backend.generate(request_fixture(), [])).rejects.toThrow("lyric_call_limit");
    expect(client).toHaveBeenCalledTimes(2);
  });
  it("posts strict schemas, safe feedback, bearer auth and facts only", async () => {
    const client = transport(completion(JSON.stringify(draft_fixture())));
    await new AzureLyricBackend(settings, credential, client).generate(request_fixture(), ["meter"]);
    expect(client).toHaveBeenCalledTimes(1);
    const [url, init] = client.mock.calls[0];
    expect(url).toBe("https://model.openai.azure.com/openai/v1/chat/completions");
    expect(init.redirect).toBe("manual");
    expect(init.headers).toEqual({ Authorization: "Bearer TEST-ONLY", "Content-Type": "application/json" });
    const body = JSON.parse(String(init.body)), schema = body.response_format.json_schema;
    expect(schema.strict).toBe(true); expect(schema.schema.additionalProperties).toBe(false);
    expect(new Set(schema.schema.required)).toEqual(new Set(Object.keys(draft_fixture())));
    const data = JSON.parse(body.messages[1].content);
    expect(data.brief).toEqual(request_fixture().brief); expect(data.failed_rules).toEqual(["meter"]);
  });
  it("requests guided lyrics without a hook field and sends only the failed pronunciation line number", async () => {
    const { request, candidate } = guided_fixture();
    const client = transport(completion(JSON.stringify(candidate)));
    const backend = new AzureLyricBackend(settings, credential, client);
    await backend.generate(request, ["unknown_pronunciation"], 2);
    const body = JSON.parse(String(client.mock.calls.at(-1)?.[1].body));
    const schema = body.response_format.json_schema.schema;
    expect(schema.required).not.toContain("hook");
    const data = JSON.parse(body.messages[1].content);
    expect(data).toMatchObject({ failed_rules: ["unknown_pronunciation"], pronunciation_retry_line: 2 });
    expect(data).not.toHaveProperty("lyrics");
    expect(body.messages[0].content).toContain("CMU Pronouncing Dictionary");
  });
  it.each([
    [completion("", { message: { refusal: "Cannot comply" } }), "model_refusal", false],
    [completion("{}", { finish_reason: "content_filter" }), "model_refusal", false],
    [completion("{", { finish_reason: "length" }), "incomplete_model_output", true],
    [{ choices: [] }, "malformed_model_envelope", false],
    [completion("", { message: {} }), "missing_model_output", false],
  ] as const)("rejects malformed or refused completions %#", async (data, code, retryable) => {
    await expect(new AzureLyricBackend(settings, credential, transport(data)).generate(request_fixture(), [])).rejects.toMatchObject({ code, retryable });
  });
  it.each([[401, "cloud_request_failed", false], [429, "cloud_temporarily_unavailable", true], [503, "cloud_temporarily_unavailable", true]] as const)("never hides retries on HTTP %i", async (status, code, retryable) => {
    const client = transport({ error: { code: "test" } }, status);
    await expect(new AzureLyricBackend(settings, credential, client).generate(request_fixture(), [])).rejects.toMatchObject({ code, retryable });
    expect(client).toHaveBeenCalledTimes(1);
  });
  it("redacts authentication and transport diagnostics without swallowing programming errors", async () => {
    const client = transport({});
    const failed_auth = { getToken: async (): Promise<never> => { throw new CredentialUnavailableError("sensitive provider details"); } };
    await expect(new AzureLyricBackend(settings, failed_auth, client).generate(request_fixture(), [])).rejects.toMatchObject({ message: "cloud_authentication_failed", retryable: false });
    expect(client).not.toHaveBeenCalled();
    const failed_transport = vi.fn<CloudTransport>().mockRejectedValue(new TypeError("sensitive endpoint details"));
    await expect(new AzureLyricBackend(settings, credential, failed_transport).generate(request_fixture(), [])).rejects.toMatchObject({ message: "cloud_transport_failed", retryable: true });
    expect(failed_transport).toHaveBeenCalledTimes(1);
    const failed_code = vi.fn<CloudTransport>().mockRejectedValue(new RangeError("test bug"));
    await expect(new AzureLyricBackend(settings, credential, failed_code).generate(request_fixture(), [])).rejects.toThrow("test bug");
  });
  it.each(["content_filter", "ResponsibleAIPolicyViolation"])("treats HTTP policy code %s as a terminal refusal", async code => {
    const client = transport({ error: { code } }, 400);
    await expect(new AzureLyricBackend(settings, credential, client).generate(request_fixture(), [])).rejects.toBeInstanceOf(ModelRefusal);
    expect(client).toHaveBeenCalledTimes(1);
  });
  it("fails closed on malformed JSON transport envelopes", async () => {
    const client = vi.fn<CloudTransport>().mockResolvedValue(new Response("{"));
    await expect(new AzureLyricBackend(settings, credential, client).generate(request_fixture(), [])).rejects.toThrow("malformed_cloud_response");
  });
  it.each(["{}", '{"english":true,"artist_imitation":false,"risky_claims":"false"}', '{"english":true,"artist_imitation":false,"risky_claims":false,"extra":false}'])("fails closed on malformed assessments %s", async assessment => {
    await expect(new AzureLyricBackend(settings, credential, transport(completion(assessment))).preflight(request_fixture())).rejects.toThrow("malformed_assessment");
  });
  it.each([[0, false], [2, false], [0, true]] as const)("requires both safety endpoints for severity %i protected %s", async (severity, detected) => {
    const client = vi.fn<CloudTransport>().mockImplementation(async url => new Response(JSON.stringify(url.includes("detectProtectedMaterial") ? { protectedMaterialAnalysis: { detected } } : { categoriesAnalysis: [...CATEGORIES].map(category => ({ category, severity })) })));
    const report = await new AzureLyricBackend(settings, credential, client).screen("Original text");
    expect(report).toEqual({ moderation_passed: severity === 0, protected_material_detected: detected });
    expect(client).toHaveBeenCalledTimes(2);
    expect(client.mock.calls.every(([url]) => url.endsWith("api-version=2024-09-01"))).toBe(true);
  });
  it.each([[], Array(4).fill({ category: "Hate", severity: 0 }), [{ category: "Hate", severity: "0" }], [...CATEGORIES].map(category => ({ category, severity: 1 }))])("fails closed on incomplete or invalid moderation %#", async categoriesAnalysis => {
    const client = vi.fn<CloudTransport>().mockImplementation(async url => new Response(JSON.stringify(url.includes("detectProtectedMaterial") ? { protectedMaterialAnalysis: { detected: false } } : { categoriesAnalysis })));
    await expect(new AzureLyricBackend(settings, credential, client).screen("Original text")).rejects.toBeInstanceOf(CloudFailure);
  });
  it("does not accept absent protected evidence and does not use tone as facts", async () => {
    const client = transport(completion('{"english":true,"grounded":false,"risky_claims":true}'));
    const result = await new AzureLyricBackend(settings, credential, client).assess(request_fixture(), draft_fixture());
    expect(result.grounded).toBe(false);
    const body = JSON.parse(String(client.mock.calls[0][1].body)), data = JSON.parse(body.messages[1].content);
    expect(data.facts.tone).toBeUndefined(); expect(data.facts.cta).toBeUndefined(); expect(data.candidate).toEqual(draft_fixture());
    await expect(new AzureLyricBackend(settings, credential, transport({})).screen("Original text")).rejects.toThrow("malformed_safety_response");
  });
  it.each(["http://localhost", "https://user:pass@example.com", "https://example.com/?key=x", "https://example.com:444", "https://example.com/path"])("rejects unsafe resource endpoint %s", value => {
    expect(() => new LyricCloudSettings(value, "deployment", settings.safety_endpoint)).toThrow("invalid_cloud_endpoint");
  });
  it("requires configuration and preserves strict evidence types", () => {
    expect(() => LyricCloudSettings.from_env({})).toThrow("missing_lyric_cloud_configuration");
    expect(Preflight.safeParse({ english: true }).success).toBe(false);
    expect(Assessment.safeParse({ english: true, grounded: true, risky_claims: "false" }).success).toBe(false);
    expect(Screening.safeParse({ moderation_passed: true, protected_material_detected: false, extra: true }).success).toBe(false);
  });
});

describe("structured score provider without paid requests", () => {
  it("captures score-provider bodies without changing refusal behavior", async () => {
    const app = express(), entries: ProviderDiagnostic[] = [];
    const client = vi.fn<CloudTransport>().mockResolvedValue(new Response(
      JSON.stringify({ error: { code: "content_filter", param: "response_format", message: "private-marker" } }),
      { status: 400, headers: { "apim-request-id": "35675016-33ae-4c9d-b39c-23aa0d631c18" } },
    ));
    app.get("/", (_req, res) => trace_jingle(res, async () => {
      set_jingle_provider_recorder(async entry => { entries.push(entry); });
      await expect(new AzureScoreComposer(settings, credential, client).compose(score_prompt(request_fixture(), accepted_lyrics())))
        .rejects.toBeInstanceOf(ModelRefusal);
      res.sendStatus(204);
    }));
    await request(app).get("/").expect(204);
    expect(client).toHaveBeenCalledTimes(1);
    expect(entries).toMatchObject([{
      stage: "brief", operation: "compose_score", http_status: 400, error_code: "content_filter",
      parameter: "response_format", request_id: "35675016-33ae-4c9d-b39c-23aa0d631c18",
    }]);
    expect(entries[0]?.model_exchange?.response).toEqual({ status: "captured", text: expect.stringContaining("private-marker") });
    expect(entries[0]?.model_exchange?.request).toEqual({ status: "captured", text: expect.stringContaining("Compose a concise") });
    expect(JSON.stringify(entries)).not.toContain("TEST-ONLY");
  });

  it.each([false, true])("records successful score HTTP metadata or stops on evidence-write failure (%s)", async fails => {
    const app = express(), entries: ProviderDiagnostic[] = [];
    const client = vi.fn<CloudTransport>().mockResolvedValue(new Response(
      JSON.stringify(completion(JSON.stringify(score_fixture()))),
      { status: 200, headers: { "x-ms-request-id": "35675016-33ae-4c9d-b39c-23aa0d631c18" } },
    ));
    app.get("/", (_req, res) => trace_jingle(res, async () => {
      set_jingle_provider_recorder(async entry => {
        entries.push(entry);
        if (fails) throw new DiagnosticPersistenceFailure();
      });
      const call = new AzureScoreComposer(settings, credential, client).compose(score_prompt(request_fixture(), accepted_lyrics()));
      if (fails) await expect(call).rejects.toBeInstanceOf(DiagnosticPersistenceFailure);
      else await expect(call).resolves.toEqual(score_fixture());
      res.sendStatus(204);
    }));
    await request(app).get("/").expect(204);
    expect(client).toHaveBeenCalledTimes(1);
    expect(entries).toMatchObject([{
      stage: "brief", operation: "compose_score", http_status: 200, error_code: null,
      parameter: null, request_id: "35675016-33ae-4c9d-b39c-23aa0d631c18",
    }]);
    expect(entries[0]?.model_exchange?.response).toEqual({ status: "captured", text: expect.stringContaining("tempo_bpm") });
  });

  function telemetry_fixture() {
    const spans: Array<{ name: string; attributes: Record<string, unknown>; status?: unknown; ended: boolean }> = [];
    const measurements: Array<{ seconds: number; attributes: Record<string, unknown> }> = [];
    const telemetry: ScoreTelemetry = {
      startActiveSpan: async (name, attributes, callback) => {
        const state = { name, attributes: { ...attributes }, status: undefined as unknown, ended: false };
        spans.push(state);
        const span: ScoreTelemetrySpan = {
          setAttribute: (key, value) => { state.attributes[key] = value; },
          setStatus: status => { state.status = status; },
          end: () => { state.ended = true; },
        };
        return callback(span);
      },
      recordDuration: (seconds, attributes) => measurements.push({ seconds, attributes: { ...attributes } }),
    };
    return { telemetry, spans, measurements };
  }

  it("uses only validated accepted fields and posts a strict, capped score request", async () => {
    const request = request_fixture();
    const prompt = score_prompt(request, accepted_lyrics());
    expect(prompt).toEqual({
      brief: {
        name: request.brief.name, offer: request.brief.offer, location: request.brief.location,
        tone: request.brief.tone, approved_claims: request.brief.approved_claims,
      },
      cta: request.cta, lyrics: draft_fixture().lyrics, style: "retro-synth",
    });
    expect(JSON.stringify(prompt)).not.toContain(request.brief.contact_details.email);
    expect(JSON.stringify(prompt)).not.toContain(request.brief.contact_details.phone);
    expect(() => score_prompt(request, LyricResult.parse({
      status: "human_review_required", attempts: 1, output: draft_fixture(), reasons: ["human_review"],
    }))).toThrow("lyrics_not_accepted");

    const client = transport({
      ...completion(JSON.stringify(score_fixture())),
      usage: { prompt_tokens: 321, completion_tokens: 456 },
    });
    const observed = telemetry_fixture();
    const score = await new AzureScoreComposer(settings, credential, client, observed.telemetry).compose(prompt);
    expect(score).toEqual(score_fixture());
    expect(client).toHaveBeenCalledTimes(1);
    const [url, init] = client.mock.calls[0];
    expect(url).toBe("https://model.openai.azure.com/openai/v1/chat/completions");
    const body = JSON.parse(String(init.body));
    expect(body.max_completion_tokens).toBe(1200);
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.response_format.json_schema.schema.additionalProperties).toBe(false);
    const schema = body.response_format.json_schema.schema;
    expect(schema.properties.tracks.items.anyOf).toHaveLength(2);
    expect(JSON.stringify(schema)).not.toContain('"oneOf"');
    expect(JSON.parse(body.messages[1].content)).toEqual(prompt);
    expect(String(init.body)).not.toContain(request.brief.contact_details.email);
    expect(String(init.body)).not.toContain(request.brief.contact_details.phone);
    expect(observed.spans).toHaveLength(1);
    expect(observed.spans[0]).toMatchObject({
      attributes: {
        "gen_ai.operation.name": "chat",
        "gen_ai.request.max_tokens": 1200,
        "gen_ai.response.finish_reasons": ["stop"],
        "gen_ai.usage.input_tokens": 321,
        "gen_ai.usage.output_tokens": 456,
      },
      ended: true,
    });
    expect(JSON.stringify(observed.spans)).not.toContain(JSON.stringify(prompt));
    expect(observed.measurements).toHaveLength(1);
    expect(observed.measurements[0]!.seconds).toBeGreaterThanOrEqual(0);
    expect(observed.measurements[0]!.attributes).toEqual({
      "gen_ai.operation.name": "chat", "gen_ai.provider.name": "azure.ai.inference",
    });
  });

  it("omits unselected creative direction and bounds an accepted maximal request", async () => {
    const request = request_fixture();
    request.creative_direction = "Do not include this browser-supplied instruction in score generation.";
    request.brief.offer = "O".repeat(400);
    request.brief.location = "L".repeat(400);
    request.brief.tone = "T".repeat(400);
    request.brief.approved_claims = Array.from({ length: 20 }, (_, index) => `${index}${"C".repeat(398)}`);
    const prompt = score_prompt(request, accepted_lyrics());
    const client = transport(completion(JSON.stringify(score_fixture())));
    const observed = telemetry_fixture();
    await new AzureScoreComposer(settings, credential, client, observed.telemetry).compose(prompt);
    expect(observed.spans[0]!.attributes).not.toHaveProperty("gen_ai.usage.input_tokens");
    expect(observed.spans[0]!.attributes).not.toHaveProperty("gen_ai.usage.output_tokens");
    const body = String(client.mock.calls[0]![1].body);
    expect(Buffer.byteLength(body, "utf8")).toBeLessThanOrEqual(65536);
    expect(body).not.toContain(request.creative_direction);
  });

  it.each([
    [completion("", { message: { refusal: "sensitive refusal details" } }), "model_refusal"],
    [completion(JSON.stringify(score_fixture()), { finish_reason: "length" }), "incomplete_model_output"],
    [completion("{"), "malformed_score_output"],
    [completion("{}"), "invalid_score_output"],
    [completion("x".repeat(65537)), "score_output_too_large"],
    [{ ...completion(JSON.stringify(score_fixture())), usage: { prompt_tokens: -1, completion_tokens: 3 } }, "malformed_model_envelope"],
    [{ ...completion(JSON.stringify(score_fixture())), usage: { prompt_tokens: 3, completion_tokens: 1.5 } }, "malformed_model_envelope"],
  ] as const)("fails closed and emits content-free telemetry for %s", async (data, code) => {
    const client = transport(data);
    const observed = telemetry_fixture();
    const request = request_fixture();
    const prompt = score_prompt(request, accepted_lyrics());
    await expect(new AzureScoreComposer(settings, credential, client, observed.telemetry).compose(prompt))
      .rejects.toMatchObject({ code });
    expect(client).toHaveBeenCalledTimes(1);
    expect(observed.spans).toHaveLength(1);
    expect(observed.spans[0]!.attributes["error.type"]).toBe(code);
    expect(observed.spans[0]!.ended).toBe(true);
    expect(observed.measurements).toHaveLength(1);
    expect(observed.measurements[0]!.attributes["error.type"]).toBe(code);
    expect(JSON.stringify({ spans: observed.spans, measurements: observed.measurements }))
      .not.toContain("sensitive refusal details");
    expect(JSON.stringify({ spans: observed.spans, measurements: observed.measurements }))
      .not.toContain(JSON.stringify(prompt));
  });

  it("uses a bounded telemetry error type for unexpected provider failures", async () => {
    const client = vi.fn<CloudTransport>().mockRejectedValue(new CloudFailure("unbounded private failure detail"));
    const observed = telemetry_fixture();
    const prompt = score_prompt(request_fixture(), accepted_lyrics());
    await expect(new AzureScoreComposer(settings, credential, client, observed.telemetry).compose(prompt))
      .rejects.toThrow("unbounded private failure detail");
    expect(observed.spans[0]!.attributes["error.type"]).toBe("cloud_failure");
    expect(observed.measurements[0]!.attributes["error.type"]).toBe("cloud_failure");
    expect(JSON.stringify({ spans: observed.spans, measurements: observed.measurements }))
      .not.toContain("unbounded private failure detail");
  });
});
