import { describe, expect, it, vi } from "vitest";
import { CredentialUnavailableError } from "@azure/identity";
import { Assessment, AzureLyricBackend, CATEGORIES, CloudFailure, LyricCloudSettings, ModelRefusal, Preflight, Screening, type CloudTransport, type LyricBackend } from "../src/lyric_cloud.js";
import { lyric_allowance, lyric_budget } from "../src/lyric_budget.js";
import { LyricDraft, LyricRequest, LyricResult, validate_draft } from "../src/lyrics.js";
import { LyricWriter } from "../src/lyric_service.js";

const request_fixture = (): LyricRequest => LyricRequest.parse({
  brief: { brief_id: "brief-001", name: "Bright Bike", offer: "Bike tune ups", location: "Lakeview", contact_details: { email: "shop@example.com", phone: "+1-202-555-0101" }, tone: "Friendly and practical", approved_claims: ["Bike tune ups are available", "Call to plan a visit"] },
  product_path: "spoken", cta: "Call Bright Bike to plan your next ride",
});
const draft_fixture = (): LyricDraft => LyricDraft.parse({
  hook: "Bright Bike, a tune up for your ride",
  lyrics: "Bright Bike, a tune up for your ride\nCall Bright Bike to plan your next ride",
  syllables_per_line: [8, 8], rhyme_scheme: "--", brand_count: 2, cta: "Call Bright Bike to plan your next ride",
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
