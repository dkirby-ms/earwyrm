import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { exportJWK, generateKeyPair, SignJWT, type JWK, type JWTPayload } from 'jose';
import { closeSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { create_app, EXPECTED_ANSWERS, type CreateAppOptions } from '../src/web_app.js';
import { AuthSettings, TokenValidator, type Environment } from '../src/web_auth.js';
import { STATIC_ROOT, WebStorage } from '../src/web_storage.js';
import { acquire_writer_lock, prepare_databases } from '../src/cloud_web.js';
import { write_wav } from '../src/dsp.js';
import { load_inputs, render_brief } from '../src/render.js';
import { CloudFailure, type LyricBackend } from '../src/lyric_cloud.js';
import { LyricRequest, LyricResult } from '../src/lyrics.js';

const issuer = 'https://tenant.example.test/tenant/v2.0';
const authority = 'https://tenant.example.test/tenant';
const audience = 'api://test-api';
const auth_environment: Environment = {
  ENTRA_CLIENT_ID: 'test-spa', ENTRA_AUTHORITY: authority, ENTRA_EXPECTED_ISSUER: issuer,
  ENTRA_METADATA_URL: `${issuer}/metadata`, ENTRA_AUDIENCE: audience, ENTRA_API_SCOPE_PREFIX: audience,
};
let keys: Awaited<ReturnType<typeof generateKeyPair>>;
let jwk: JWK;
const roots: string[] = [];
beforeAll(async () => {
  keys = await generateKeyPair('RS256');
  jwk = { ...await exportJWK(keys.publicKey), alg: 'RS256', use: 'sig', kid: 'local-only' };
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function root_dir() {
  const directory = mkdtempSync(join(process.cwd(), '.web-test-'));
  roots.push(directory);
  return directory;
}
async function token(subject = 'user-a', claims: JWTPayload = {}) {
  return new SignJWT({
    iss: issuer, aud: audience, sub: subject, exp: Math.floor(Date.now() / 1000) + 60,
    scp: 'briefs.read renders.read renders.write outputs.read evaluations.write', ...claims,
  }).setProtectedHeader({ alg: 'RS256', kid: 'local-only' }).sign(keys.privateKey);
}
const fake_render: typeof render_brief = async (directory, brief, text, _index, provider) => {
  if (provider) await provider.synthesize(text);
  mkdirSync(directory);
  const file = 'fixture.wav';
  write_wav(join(directory, file), new Float64Array(480));
  return [{
    output_id: 'renderer-id', brief_id: brief.brief_id, variant: 'instrumental', file, sha256: 'a'.repeat(64),
    duration_seconds: 30, render_seconds: 0.1, numeric_gates: 'Pass', status: 'Pending',
    components: [{ component: 'instrumental', status: 'Pending' }],
    azure_usage: {
      attempt_id: null, request_cost_usd: provider ? '0.1' : '0', allocated_cost_usd: provider ? '0.05' : '0',
      submitted_characters: provider ? text.length : 0, billing_reconciled: !provider,
    },
  }];
};
async function fixture(options: CreateAppOptions = {}, enroll = true) {
  const root = options.data_dir ?? root_dir();
  const store = new WebStorage(root);
  if (enroll) {
    await store.bootstrap_owner(issuer, 'user-a');
    await store.set_user(issuer, 'user-b', { enabled: true, admin: false, paid_speech: false });
    await store.set_user(issuer, 'disabled', { enabled: false, admin: false, paid_speech: true });
  }
  const environ = { ...auth_environment, ...options.environ };
  const validator = new TokenValidator(AuthSettings.from_environment(environ)!, {
    metadata_fetcher: () => ({ issuer, jwks_uri: `${authority}/keys`, id_token_signing_alg_values_supported: ['RS256'] }),
    jwks_fetcher: () => ({ keys: [jwk] }),
  });
  const speech_factory = vi.fn(() => { throw new Error('Speech must not be constructed by default'); });
  const app = create_app({ environ, storage: store, validator, render: fake_render, speech_factory, ...options });
  return { app, store, root, speech_factory, access_token: await token() };
}
function speech_environment(root: string, overrides: Record<string, string> = {}) {
  const evidence = join(root, 'speech-evidence.json');
  writeFileSync(evidence, JSON.stringify({
    tier: 'S0', region: 'test-region', resource_reference: 'local-fictional-resource',
    usd_per_million_characters: '1000', rate_source: 'TEST-ONLY-NOT-A-QUOTE',
    rate_checked_on: new Date().toISOString().slice(0, 10), commercial_use_basis: null,
    provider_secret: 'evidence-secret-sentinel',
  }));
  return {
    ...auth_environment, SPEECH_ENABLED: 'true', SPEECH_KEY: 'credential-sentinel', SPEECH_REGION: 'test-region',
    SPEECH_EVIDENCE_PATH: evidence, SPEECH_PER_RUN_CAP_USD: '1', SPEECH_TOTAL_BUDGET_USD: '0.2', ...overrides,
  };
}
const lyric_limits = {
  LYRIC_MODEL_CALL_MAX_USD: '0.01', LYRIC_SAFETY_CALL_MAX_USD: '0.001',
  LYRIC_PER_ACTION_CAP_USD: '1', LYRIC_TOTAL_BUDGET_USD: '5',
};

describe('same-origin Express API', () => {
  const custom_details = {
    name: 'Bright Bike', offer: 'Bike tune ups', location: 'Lakeview',
    contact_details: { email: 'shop@example.com', phone: '+1-202-555-0101' },
    tone: 'Friendly and practical', approved_claims: ['Bike tune ups are available'],
    cta: 'Call Bright Bike to plan your next ride',
  };

  it('uses real MCP chat, recovers one owned preview and binds paid vocals to its exact artifacts', async () => {
    const root = root_dir();
    const cta = custom_details.cta, hook = 'Bright Bike, a tune up for your ride';
    const backend: LyricBackend = {
      preflight: async () => ({ english: true, artist_imitation: false, risky_claims: false }),
      generate: async () => JSON.stringify({ hook, lyrics: `${hook}\n${cta}`, syllables_per_line: [8, 8], rhyme_scheme: '--', brand_count: 2, cta }),
      assess: async () => ({ english: true, grounded: true, risky_claims: false }),
      screen: async () => ({ moderation_passed: true, protected_material_detected: false }),
    };
    const suggest = vi.fn(async () => ({ reply: 'Try a warm hook. Shall we write a draft?', creative_direction: 'Warm, rhythmic and original' }));
    const renderer = vi.fn(fake_render);
    const synthesize = vi.fn(async () => ({ audio: new Float64Array(1), words: [], result_id: 'TEST' }));
    const { app, store, access_token } = await fixture({
      data_dir: root, environ: { ...speech_environment(root, { SPEECH_TOTAL_BUDGET_USD: '2' }), ...lyric_limits, LYRIC_ENABLED: 'true' },
      lyric_backend: backend, chat_advisor: { suggest }, render: renderer, speech_factory: () => ({ synthesize }),
    });
    const post = (body: object, access = access_token) => request(app).post('/api/chat').auth(access, { type: 'bearer' }).send(body);
    expect((await request(app).get('/api/chat')).status).toBe(401);
    const added = (await request(app).post('/api/briefs/validate').auth(access_token, { type: 'bearer' }).send(custom_details)).body;
    const { source: _source, cta: loaded_cta, ...brief } = added;
    const selected = { brief_ids: [brief.brief_id], custom_briefs: [{ brief, cta: loaded_cta }] };
    const discussion = { ...selected, action: 'discuss', messages: [{ role: 'user', content: 'Make it warm' }] };
    expect((await post(discussion)).status).toBe(422);
    expect(suggest).not.toHaveBeenCalled();
    expect((await post({ ...discussion, confirm_paid_generation: true }, await token('user-b'))).status).toBe(409);
    expect((await post({ ...discussion, confirm_paid_generation: true })).body).toMatchObject({ tool: 'suggest_jingle', creative_direction: 'Warm, rhythmic and original' });
    const written = await post({ ...selected, action: 'write', creative_direction: 'Warm and rhythmic', product_path: 'spoken', confirm_paid_generation: true });
    expect(written.status).toBe(200);
    expect(written.body.option.status).toBe('accepted');
    const option_id: string = written.body.option.option_id;
    expect((await store.get_lyric_option(option_id, 'user-a'))?.request.creative_direction).toBe('Warm and rhythmic');
    const build = { ...selected, action: 'compose', option_id };
    expect((await post(build, await token('user-b'))).status).toBe(404);
    const held = await store.save_lyric_option('user-a', LyricRequest.parse({ brief, cta, product_path: 'spoken' }),
      LyricResult.parse({ status: 'human_review_required', attempts: 1, output: written.body.option.output, reasons: ['human_review'] }));
    expect((await post({ ...build, option_id: held.option_id })).status).toBe(409);
    const publish = vi.spyOn(store, 'save_output').mockRejectedValueOnce(new Error('Simulated interrupted preview publication'));
    expect((await post(build)).status).toBe(500);
    publish.mockRestore();
    const preview = await post(build);
    expect(preview.status).toBe(200);
    const job_id: string = preview.body.job_id;
    const output = preview.body.run.outputs[0];
    expect(output.composition_source).toMatchObject({ job_id, option_id });
    const audio = await request(app).get(output.audio_url).auth(access_token, { type: 'bearer' });
    expect(audio.status).toBe(200);
    expect(Buffer.from(audio.body).subarray(0, 4).toString()).toBe('RIFF');
    expect((await request(app).get(output.audio_url).auth(await token('user-b'), { type: 'bearer' })).status).toBe(404);
    await store.set_run_status(job_id, 'rendering');
    const retry = await post(build);
    expect(retry.body.job_id).toBe(job_id);
    expect(retry.body.run).toMatchObject({ status: 'completed', outputs: [{ output_id: output.output_id }] });
    const selection = { ...selected, lyric_selections: [{ brief_id: brief.brief_id, option_id }], composition_selections: [{ brief_id: brief.brief_id, job_id }] };
    const estimate = await request(app).post('/api/renders/estimate').auth(access_token, { type: 'bearer' }).send(selection);
    expect(estimate.status).toBe(200);
    const { composition_selections: _compositions, ...without_composition } = selection;
    expect((await request(app).post('/api/renders').auth(access_token, { type: 'bearer' })
      .send({ ...without_composition, mode: 'azure', confirmation: estimate.body })).status).toBe(409);
    expect(synthesize).not.toHaveBeenCalled();
    const missing = vi.spyOn(store, 'get_run').mockResolvedValueOnce(null);
    expect((await request(app).post('/api/renders').auth(access_token, { type: 'bearer' }).send({ ...selection, mode: 'azure', confirmation: estimate.body })).status).toBe(404);
    missing.mockRestore();
    expect(synthesize).not.toHaveBeenCalled();
    const original_preview = (await store.get_run(job_id, 'user-a'))!;
    const changed = vi.spyOn(store, 'get_run').mockResolvedValueOnce({
      ...original_preview,
      outputs: original_preview.outputs.map(row => ({ ...row, manifest: {
        ...row.manifest, composition_source: { job_id, option_id, backing_sha256: '0'.repeat(64) },
      } })),
    });
    expect((await request(app).post('/api/renders').auth(access_token, { type: 'bearer' }).send({ ...selection, mode: 'azure', confirmation: estimate.body })).status).toBe(409);
    changed.mockRestore();
    expect(synthesize).not.toHaveBeenCalled();
    const rendered = await request(app).post('/api/renders').auth(access_token, { type: 'bearer' }).send({ ...selection, mode: 'azure', confirmation: estimate.body });
    expect(rendered.status).toBe(200);
    expect(renderer.mock.calls[0]?.[6]?.composition?.backing).toEqual(Buffer.from(audio.body));
    expect(renderer.mock.calls[0]?.[6]?.composition?.result.job_id).toBe(job_id);
    expect(synthesize).toHaveBeenCalledTimes(1);
  });

  it('validates custom input and rejects changed identities, invalid text and fixture overrides', async () => {
    const render = vi.fn(fake_render);
    const { app, access_token } = await fixture({ render });
    const validate = () => request(app).post('/api/briefs/validate').auth(access_token, { type: 'bearer' });
    const loaded = await validate().send(custom_details);
    expect(loaded.status).toBe(200);
    expect(loaded.body.brief_id).toMatch(/^custom-[a-f0-9]{32}$/);
    expect((await validate().send(custom_details)).body.brief_id).toBe(loaded.body.brief_id);
    for (const bad of [
      { ...custom_details, name: ' ' }, { ...custom_details, cta: 'Call 24/7' },
      { ...custom_details, approved_claims: [] }, { ...custom_details, offer: 'a'.repeat(400) },
    ]) expect((await validate().send(bad)).status).toBe(422);
    const { source: _source, cta, ...brief } = loaded.body;
    for (const changed of [{ ...brief, offer: 'Changed facts' }, { ...brief, brief_id: 'brief-001' }]) {
      expect((await request(app).post('/api/renders').auth(access_token, { type: 'bearer' }).send({
        mode: 'instrumental', brief_ids: [changed.brief_id], custom_briefs: [{ brief: changed, cta }],
      })).status).toBe(422);
    }
    expect((await request(app).post('/api/briefs/validate').auth(await token('disabled'), { type: 'bearer' }).send(custom_details)).status).toBe(403);
    expect(render).not.toHaveBeenCalled();
  });

  it('renders mixed custom/sample selections and recovers immutable custom facts and evaluations by owner', async () => {
    const renderer = vi.fn(fake_render);
    const { app, store, access_token } = await fixture({ render: renderer });
    const loaded = (await request(app).post('/api/briefs/validate').auth(access_token, { type: 'bearer' }).send(custom_details)).body;
    const { source: _source, cta, ...brief } = loaded;
    const rendered = await request(app).post('/api/renders').auth(access_token, { type: 'bearer' }).send({
      mode: 'instrumental', brief_ids: [brief.brief_id, 'brief-002'], custom_briefs: [{ brief, cta }],
    });
    expect(rendered.status).toBe(200);
    expect(renderer.mock.calls.map(call => call[1].brief_id)).toEqual(['brief-002', brief.brief_id]);
    expect(renderer.mock.calls[1]?.[2]).toBe(`${brief.name}. ${brief.offer}. ${cta}`);
    const output = rendered.body.outputs.find((item: { brief_id: string }) => item.brief_id === brief.brief_id);
    expect((await store.get_output(output.output_id, 'user-a'))?.manifest.workspace_brief).toEqual({ brief, cta });
    expect((await request(app).get('/api/briefs').auth(access_token, { type: 'bearer' })).body).toContainEqual(loaded);
    expect((await request(app).get('/api/briefs').auth(await token('user-b'), { type: 'bearer' })).body).toHaveLength(3);
    const evaluated = await request(app).post(`/api/outputs/${output.output_id}/evaluation`).auth(access_token, { type: 'bearer' }).send({
      brand_transcription: brief.name, cta_transcription: cta, self_rating: 'usable with minor edits',
    });
    expect(evaluated.status).toBe(200);
    expect(evaluated.body).toMatchObject({ brand_match: true, cta_match: true, status: 'Pending' });
    expect((await request(app).get('/api/poc/status').auth(access_token, { type: 'bearer' })).body.briefs)
      .toContainEqual(expect.objectContaining({ brief_id: brief.brief_id, status: 'Pending' }));
  });

  it('requires a content-bound paid confirmation for custom briefs before constructing Speech', async () => {
    const root = root_dir();
    const { app, access_token, speech_factory } = await fixture({
      data_dir: root, environ: speech_environment(root, { SPEECH_TOTAL_BUDGET_USD: '2' }),
    });
    const loaded = (await request(app).post('/api/briefs/validate').auth(access_token, { type: 'bearer' }).send(custom_details)).body;
    const { source: _source, cta, ...brief } = loaded;
    const selection = { brief_ids: [brief.brief_id], custom_briefs: [{ brief, cta }] };
    const estimate = (await request(app).post('/api/renders/estimate').auth(access_token, { type: 'bearer' }).send(selection)).body;
    expect(estimate.input_fingerprint).toMatch(/^[a-f0-9]{64}$/);
    const { input_fingerprint: _fingerprint, ...old_confirmation } = estimate;
    for (const confirmation of [old_confirmation, { ...estimate, input_fingerprint: '0'.repeat(64) }]) {
      expect((await request(app).post('/api/renders').auth(access_token, { type: 'bearer' }).send({
        ...selection, mode: 'azure', confirmation,
      })).status).toBe(409);
    }
    expect(speech_factory).not.toHaveBeenCalled();
  });

  it('gates lyric options on consent, enablement and entitlement and preserves screened duplicate outcomes', async () => {
    const backend: LyricBackend = {
      preflight: vi.fn(async () => ({ english: true, artist_imitation: false, risky_claims: false })),
      generate: vi.fn(async () => JSON.stringify({
        hook: 'Bright Bike, a tune up for your ride',
        lyrics: `Bright Bike, a tune up for your ride\n${custom_details.cta}`,
        syllables_per_line: [8, 8], rhyme_scheme: '--', brand_count: 2, cta: custom_details.cta,
      })),
      assess: vi.fn(async () => ({ english: true, grounded: true, risky_claims: false })),
      screen: vi.fn(async () => ({ moderation_passed: true, protected_material_detected: false })),
    };
    const { app, access_token } = await fixture({ environ: { ...auth_environment, ...lyric_limits, LYRIC_ENABLED: 'true' }, lyric_backend: backend });
    const loaded = (await request(app).post('/api/briefs/validate').auth(access_token, { type: 'bearer' }).send(custom_details)).body;
    const { source: _source, cta, ...brief } = loaded;
    const payload = { brief_ids: [brief.brief_id], custom_briefs: [{ brief, cta }], confirm_paid_generation: true };
    expect((await request(app).post('/api/lyrics/options').auth(access_token, { type: 'bearer' }).send({ ...payload, confirm_paid_generation: false })).status).toBe(422);
    expect((await request(app).post('/api/lyrics/options').auth(await token('user-b'), { type: 'bearer' }).send(payload)).status).toBe(409);
    expect(backend.generate).not.toHaveBeenCalled();
    const generated = await request(app).post('/api/lyrics/options').auth(access_token, { type: 'bearer' }).send(payload);
    expect(generated.status).toBe(200);
    expect(generated.body.options.map((item: { status: string }) => item.status)).toEqual(['accepted', 'unavailable', 'unavailable']);
    expect(generated.body.options[0]).toMatchObject({ ai_generated: true, broadcast_approval_required: true });
    expect(generated.body.options[1]).toMatchObject({ output: null, reasons: ['duplicate_option'] });
    expect(backend.generate).toHaveBeenCalledTimes(3);
    const disabled = await fixture({ lyric_backend: backend });
    expect((await request(disabled.app).post('/api/lyrics/options').auth(disabled.access_token, { type: 'bearer' }).send(payload)).status).toBe(409);
    expect(backend.generate).toHaveBeenCalledTimes(3);
  });

  it('preserves API method errors and trailing-slash redirect statuses', async () => {
    const app = create_app({ environ: {} });
    const method = await request(app).post('/healthz');
    expect(method.status).toBe(405);
    expect(method.body).toEqual({ detail: 'Method Not Allowed' });
    expect(method.headers.allow).toBe('GET');
    expect((await request(app).head('/healthz')).status).toBe(405);
    const redirect = await request(app).get('/api/config/?query=value');
    expect(redirect.status).toBe(307);
    expect(redirect.headers.location).toBe('/api/config?query=value');
  });

  it.each(['custom', 'sample'] as const)('renders only the owned accepted %s draft and binds estimates and saved audio to its exact identity', async source => {
    const root = root_dir();
    const sample = load_inputs()[0]!;
    const selectedCta = source === 'custom' ? custom_details.cta : sample[1].split(/(?<=[.!?])\s+/).at(-1)!;
    const hook = `${source === 'custom' ? 'Bright Bike' : sample[0].name}, a tune up for your ride`;
    const draft = { hook, lyrics: `${hook}\n${selectedCta}`, syllables_per_line: source === 'custom' ? [8, 8] : [12, 16], rhyme_scheme: '--', brand_count: 2, cta: selectedCta };
    const backend: LyricBackend = {
      preflight: async () => ({ english: true, artist_imitation: false, risky_claims: false }),
      generate: async () => JSON.stringify(draft),
      assess: async () => ({ english: true, grounded: true, risky_claims: false }),
      screen: async () => ({ moderation_passed: true, protected_material_detected: false }),
    };
    const synthesize = vi.fn(async () => ({ audio: new Float64Array(480), words: [], result_id: 'test-only' }));
    const speech_factory = vi.fn(() => ({ synthesize }));
    const renderer = vi.fn(fake_render);
    const { app, store, access_token } = await fixture({
      data_dir: root, environ: { ...speech_environment(root, { SPEECH_TOTAL_BUDGET_USD: '2' }), ...lyric_limits, LYRIC_ENABLED: 'true' },
      lyric_backend: backend, speech_factory, render: renderer,
    });

    const loaded = source === 'custom'
      ? (await request(app).post('/api/briefs/validate').auth(access_token, { type: 'bearer' }).send(custom_details)).body
      : { ...sample[0], source: 'sample', cta: selectedCta };
    const { source: _source, cta, ...brief } = loaded;
    const selection = { brief_ids: [brief.brief_id], ...(source === 'custom' ? { custom_briefs: [{ brief, cta }] } : {}) };
    const generated = await request(app).post('/api/lyrics/options').auth(access_token, { type: 'bearer' })
      .send({ ...selection, confirm_paid_generation: true });
    const option = generated.body.options[0];
    expect(option.status).toBe('accepted');
    const selected = { ...selection, lyric_selections: [{ brief_id: brief.brief_id, option_id: option.option_id }] };
    const estimateResponse = await request(app).post('/api/renders/estimate').auth(access_token, { type: 'bearer' }).send(selected);
    expect(estimateResponse.status).toBe(200);
    const estimate = estimateResponse.body;
    expect(estimate.estimated_cost_usd).toBe(String(draft.lyrics.length / 1000));
    expect(estimate.lyric_selections).toEqual(selected.lyric_selections);

    const lyricRequest = LyricRequest.parse({ brief, cta, product_path: 'spoken' });
    const secondHook = hook.replace('ride', 'trip');
    const alternate = await store.save_lyric_option('user-a', lyricRequest, LyricResult.parse({
      status: 'accepted', attempts: 1, output: { ...draft, hook: secondHook, lyrics: `${secondHook}\n${cta}` },
    }));
    const held = await store.save_lyric_option('user-a', lyricRequest, LyricResult.parse({
      status: 'human_review_required', attempts: 1, output: draft, reasons: ['risky_claims_require_human_review'],
    }));
    for (const [option_id, expectedStatus, owner] of [
      [alternate.option_id, 409, 'user-a'],
      [held.option_id, 409, 'user-a'],
      [option.option_id, 404, 'user-b'],
    ] as const) {
      const rejected = await request(app).post('/api/renders').auth(await token(owner), { type: 'bearer' }).send({
        ...selected, lyric_selections: [{ brief_id: brief.brief_id, option_id }], mode: 'azure', confirmation: estimate,
      });
      expect(rejected.status).toBe(expectedStatus);
    }
    expect((await request(app).post('/api/renders/estimate').auth(access_token, { type: 'bearer' }).send({
      brief_ids: ['brief-002'], lyric_selections: [{ brief_id: 'brief-002', option_id: option.option_id }],
    })).status).toBe(404);
    expect((await request(app).post('/api/renders').auth(access_token, { type: 'bearer' })
      .send({ ...selected, mode: 'instrumental' })).status).toBe(422);
    expect(speech_factory).not.toHaveBeenCalled();
    expect(renderer).not.toHaveBeenCalled();

    const rendered = await request(app).post('/api/renders').auth(access_token, { type: 'bearer' }).send({
      ...selected, mode: 'azure', confirmation: estimate,
      lyrics: 'Browser text must never replace the server-owned draft',
    });
    expect(rendered.status).toBe(200);
    expect(synthesize).toHaveBeenCalledExactlyOnceWith(draft.lyrics);
    expect(renderer.mock.calls[0]?.[2]).toBe(draft.lyrics);
    const saved = (await store.list_outputs('user-a'))[0]!;
    expect(saved.manifest.lyric_source).toMatchObject({ option_id: option.option_id, lyrics: draft.lyrics, broadcast_approval_required: true });
    expect(saved.manifest.script_source).toBe('Selected server-screened lyric draft');
    expect(rendered.body.outputs[0].lyric_source).toMatchObject({ option_id: option.option_id, lyrics: draft.lyrics });
    expect((await request(app).get('/api/lyrics/options').auth(access_token, { type: 'bearer' })).body.options)
      .toContainEqual(expect.objectContaining({ option_id: option.option_id }));
    expect((await request(app).get('/api/lyrics/options').auth(await token('user-b'), { type: 'bearer' })).body.options).toEqual([]);
    const reopened = new WebStorage(root);
    expect((await reopened.get_lyric_option(option.option_id, 'user-a'))?.result.output?.lyrics).toBe(draft.lyrics);
  });

  it('keeps discovery available to unknown identities while denying disabled and unenrolled users', async () => {
    const { app, access_token } = await fixture();
    const briefs = await request(app).get('/api/briefs').auth(access_token, { type: 'bearer' });
    expect(briefs.status).toBe(200);
    expect(briefs.body).toHaveLength(3);
    expect(briefs.text).not.toContain('expected_brand');
    expect(briefs.text).not.toContain('"script"');
    for (const subject of ['unknown', 'disabled']) {
      const signed = await token(subject);
      expect((await request(app).get('/api/identity').auth(signed, { type: 'bearer' })).body).toEqual({ issuer, subject });
      expect((await request(app).get('/api/briefs').auth(signed, { type: 'bearer' })).status).toBe(403);
    }
    expect((await request(app).get('/api/access').auth(access_token, { type: 'bearer' })).body).toEqual({
      issuer, subject: 'user-a', admin: true, paid_speech: true,
    });
  });

  it('enforces scope, exact issuer and live application admin checks for user management', async () => {
    const { app, access_token } = await fixture();
    const member = await token('user-b');
    const payload = { issuer, subject: 'user-b', enabled: true, admin: true, paid_speech: true };
    expect((await request(app).get('/api/admin/users').auth(member, { type: 'bearer' })).status).toBe(403);
    expect((await request(app).put('/api/admin/users').auth(member, { type: 'bearer' }).send(payload)).status).toBe(403);
    expect((await request(app).put('/api/admin/users').auth(access_token, { type: 'bearer' }).send({ ...payload, enabled: 1 })).status).toBe(422);
    expect((await request(app).put('/api/admin/users').auth(access_token, { type: 'bearer' }).send(payload)).status).toBe(200);
    expect((await request(app).get('/api/admin/users').auth(member, { type: 'bearer' })).status).toBe(200);
    expect((await request(app).put('/api/admin/users').auth(access_token, { type: 'bearer' }).send({ ...payload, admin: false })).status).toBe(200);
    expect((await request(app).get('/api/admin/users').auth(member, { type: 'bearer' })).status).toBe(403);
    expect((await request(app).put('/api/admin/users').auth(access_token, { type: 'bearer' }).send({ ...payload, issuer: 'https://other.example.test' })).status).toBe(403);
    expect((await request(app).get('/api/admin/users').auth(await token('user-a', { scp: 'briefs.read' }), { type: 'bearer' })).status).toBe(403);
  });

  it('preserves canonical subset indexes, private audio and owner-scoped run/evidence/status routes', async () => {
    const renderer = vi.fn(fake_render);
    const { app, root, access_token, speech_factory } = await fixture({ render: renderer });
    const response = await request(app).post('/api/renders').auth(access_token, { type: 'bearer' }).send({ mode: 'instrumental', brief_ids: ['brief-003'] });
    expect(response.status).toBe(200);
    expect(renderer.mock.calls[0]?.[3]).toBe(2);
    expect(speech_factory).not.toHaveBeenCalled();
    expect(response.body.status).toBe('completed');
    expect(response.body.outputs).toHaveLength(1);
    const output = response.body.outputs[0];
    expect(output.status).toBe('Pending');
    expect(output.file).toBeUndefined();
    const download = await request(app).get(output.audio_url).auth(access_token, { type: 'bearer' });
    expect(download.status).toBe(200);
    expect(download.body.subarray(0, 4).toString()).toBe('RIFF');
    expect(download.headers['cache-control']).toBe('private, no-store');
    expect(statSync(join(root, 'audio', `${output.output_id}.wav`)).mode & 0o777).toBe(0o600);
    const other = await token('user-b');
    expect((await request(app).get('/api/outputs').auth(other, { type: 'bearer' })).body).toEqual({ outputs: [] });
    expect((await request(app).get('/api/renders').auth(other, { type: 'bearer' })).body).toEqual({ runs: [] });
    for (const endpoint of [output.audio_url, output.evidence_url, `/api/renders/${response.body.run_id}`]) {
      expect((await request(app).get(endpoint).auth(other, { type: 'bearer' })).status).toBe(404);
    }
    expect((await request(app).get('/api/renders').auth(access_token, { type: 'bearer' })).body.runs[0].run_id).toBe(response.body.run_id);
    expect((await request(app).get(`/api/renders/${response.body.run_id}`).auth(access_token, { type: 'bearer' })).body.status).toBe('completed');
    expect((await request(app).get('/api/poc/status').auth(access_token, { type: 'bearer' })).body.briefs.map((brief: { brief_id: string }) => brief.brief_id))
      .toEqual(['brief-001', 'brief-002', 'brief-003']);
  });

  it('delivers real offline rendering through protected audio, evidence and evaluation with real private storage', async () => {
    const { app, store, root, access_token, speech_factory } = await fixture({ render: render_brief });
    const rendered = await request(app).post('/api/renders').auth(access_token, { type: 'bearer' })
      .send({ mode: 'instrumental', brief_ids: ['brief-001'] });
    expect(rendered.status).toBe(200);
    expect(rendered.body.status).toBe('completed');
    expect(rendered.body.outputs).toHaveLength(1);
    const output = rendered.body.outputs[0];
    expect(output.variant).toBe('instrumental');
    expect(output.numeric_gates).toBe('Pass');
    expect(output.status).toBe('Pending');
    expect(speech_factory).not.toHaveBeenCalled();
    expect(existsSync(join(root, 'melody', 'melody.sqlite3'))).toBe(true);

    expect((await request(app).get(output.audio_url)).status).toBe(401);
    expect((await request(app).get(output.audio_url).auth(await token('user-b'), { type: 'bearer' })).status).toBe(404);
    const downloaded = await request(app).get(output.audio_url).auth(access_token, { type: 'bearer' });
    expect(downloaded.status).toBe(200);
    expect(downloaded.headers['cache-control']).toBe('private, no-store');
    const audio: Buffer = downloaded.body;
    expect(audio.subarray(0, 4).toString()).toBe('RIFF');
    expect(audio.subarray(8, 12).toString()).toBe('WAVE');
    expect(audio.readUInt32LE(4) + 8).toBe(audio.length);
    expect(audio.readUInt16LE(22)).toBe(1);
    expect(audio.readUInt16LE(34)).toBe(16);
    const duration = audio.readUInt32LE(40) / (audio.readUInt32LE(24) * 2);
    expect(duration).toBe(output.duration_seconds);
    expect(duration).toBeGreaterThanOrEqual(14);
    expect(duration).toBeLessThanOrEqual(20);
    const persisted = await store.get_output(output.output_id, 'user-a');
    expect(persisted?.manifest.sha256).toBe(createHash('sha256').update(audio).digest('hex'));
    expect(statSync(join(root, 'audio', `${output.output_id}.wav`)).mode & 0o777).toBe(0o600);

    const answer = JSON.parse(readFileSync(EXPECTED_ANSWERS, 'utf8'))[0] as { expected_brand: string; expected_cta: string };
    const evaluated = await request(app).post(`/api/outputs/${output.output_id}/evaluation`)
      .auth(access_token, { type: 'bearer' }).send({
        brand_transcription: answer.expected_brand, cta_transcription: answer.expected_cta, self_rating: 'usable with minor edits',
      });
    expect(evaluated.status).toBe(200);
    expect(evaluated.body).toEqual({
      output_id: output.output_id, brand_match: true, cta_match: true,
      self_rating: 'usable with minor edits', status: 'Pending',
    });
    const evidence = await request(app).get(output.evidence_url).auth(access_token, { type: 'bearer' });
    expect(evidence.status).toBe(200);
    expect(evidence.body.evaluation.brand_match).toBe(true);
    expect(evidence.body.manifest.azure_usage.submitted_characters).toBe(0);
    expect(evidence.body.manifest.numeric_gates).toBe('Pass');
    expect(evidence.body.manifest.components.some((component: { status: string }) => component.status === 'Pending')).toBe(true);
    expect(evidence.body.attempt).toBeNull();
    expect(readdirSync(join(root, 'work'))).toEqual([]);
  });

  it('rejects invalid selections and paid confirmations without rendering', async () => {
    const render = vi.fn(fake_render);
    const { app, access_token, speech_factory } = await fixture({ render });
    for (const payload of [
      { brief_ids: [], mode: 'instrumental' }, { brief_ids: ['unknown'], mode: 'instrumental' },
      { brief_ids: ['brief-001', 'brief-001'], mode: 'instrumental' },
      { brief_ids: ['brief-001'], mode: 'instrumental', confirmation: { brief_ids: ['brief-001'], estimated_cost_usd: '1' } },
      { brief_ids: ['brief-001'], mode: 'not-a-mode' },
    ]) expect((await request(app).post('/api/renders').auth(access_token, { type: 'bearer' }).send(payload)).status).toBe(422);
    expect((await request(app).get('/api/render-options').auth(access_token, { type: 'bearer' })).body).toEqual({ instrumental_available: true, speech_status: 'disabled' });
    expect((await request(app).post('/api/renders').auth(access_token, { type: 'bearer' }).send({ brief_ids: ['brief-001'], mode: 'azure' })).status).toBe(409);
    expect(render).not.toHaveBeenCalled();
    expect(speech_factory).not.toHaveBeenCalled();
  });

  it('keeps evaluations immutable, answer keys private and the rollup conservative', async () => {
    const { app, access_token } = await fixture();
    const rendered = await request(app).post('/api/renders').auth(access_token, { type: 'bearer' }).send({ brief_ids: ['brief-001'], mode: 'instrumental' });
    const output = rendered.body.outputs[0];
    const answer = JSON.parse(readFileSync(EXPECTED_ANSWERS, 'utf8'))[0] as { expected_brand: string; expected_cta: string };
    const body = { brand_transcription: ` ${answer.expected_brand.toUpperCase()} `, cta_transcription: answer.expected_cta, self_rating: 'usable with minor edits' };
    const endpoint = `/api/outputs/${output.output_id}/evaluation`;
    expect((await request(app).post(endpoint).auth(access_token, { type: 'bearer' }).send({ ...body, self_rating: 'excellent' })).status).toBe(422);
    const evaluated = await request(app).post(endpoint).auth(access_token, { type: 'bearer' }).send(body);
    expect(evaluated.body).toEqual({ output_id: output.output_id, brand_match: true, cta_match: true, self_rating: body.self_rating, status: 'Pending' });
    expect(evaluated.text).not.toContain(answer.expected_brand);
    expect(evaluated.text).not.toContain(answer.expected_cta);
    expect((await request(app).post(endpoint).auth(access_token, { type: 'bearer' }).send(body)).status).toBe(409);
    const evidence = await request(app).get(output.evidence_url).auth(access_token, { type: 'bearer' });
    expect(evidence.body.evaluation.brand_match).toBe(true);
    expect(evidence.body.manifest.expected_brand).toBeUndefined();
    const second = await request(app).post('/api/renders').auth(access_token, { type: 'bearer' }).send({ brief_ids: ['brief-002'], mode: 'instrumental' });
    const failed = await request(app).post(`/api/outputs/${second.body.outputs[0].output_id}/evaluation`).auth(access_token, { type: 'bearer' })
      .send({ brand_transcription: 'wrong', cta_transcription: 'wrong', self_rating: body.self_rating });
    expect(failed.body.status).toBe('Fail');
    expect((await request(app).get('/api/poc/status').auth(access_token, { type: 'bearer' })).body.status).toBe('Fail');
  });

  it('serializes offline rendering and always releases the guard after failure', async () => {
    let enter!: () => void;
    let release!: () => void;
    const entered = new Promise<void>(resolve => { enter = resolve; });
    const blocked = new Promise<void>(resolve => { release = resolve; });
    let calls = 0;
    const renderer: typeof render_brief = async (...args) => {
      calls++;
      if (calls === 1) { enter(); await blocked; throw new Error('provider-secret-sentinel'); }
      return fake_render(...args);
    };
    const { app, access_token, root } = await fixture({ render: renderer });
    const payload = { mode: 'instrumental', brief_ids: ['brief-001'] };
    const first = request(app).post('/api/renders').auth(access_token, { type: 'bearer' }).send(payload).then(response => response);
    await entered;
    expect((await request(app).post('/api/renders').auth(access_token, { type: 'bearer' }).send(payload)).status).toBe(409);
    release();
    const failure = await first;
    expect(failure.status).toBe(500);
    expect(failure.text).not.toContain('provider-secret');
    expect((await request(app).post('/api/renders').auth(access_token, { type: 'bearer' }).send(payload)).status).toBe(200);
    expect(readdirSync(join(root, 'work'))).toEqual([]);
  });

  it('returns a safe storage-unavailable error after database loss without recreating it', async () => {
    const { app, root, access_token } = await fixture();
    const path = join(root, 'earwyrm.sqlite3');
    unlinkSync(path);
    const response = await request(app).get('/api/outputs').auth(access_token, { type: 'bearer' });
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ detail: 'Persistent storage is unavailable' });
    expect(existsSync(path)).toBe(false);
  });

  it('never exposes private files, traversal, or symlinked static targets', async () => {
    const { app, root } = await fixture();
    writeFileSync(join(root, 'private.txt'), 'private-sentinel');
    for (const path of ['/src/web_app.ts', '/.env', '/docs/audio-poc/expected-brand-cta.json', '/%2e%2e/%2e%2e/.env', '/api/outputs/..%2f..%2f.env/audio']) {
      const response = await request(app).get(path);
      expect(response.status).not.toBe(200);
      expect(response.text).not.toContain('private-sentinel');
    }
    if (existsSync(STATIC_ROOT)) {
      const name = `.private-test-${process.pid}`;
      const symlink = join(STATIC_ROOT, name);
      symlinkSync(join(root, 'private.txt'), symlink);
      try { expect((await request(app).get(`/${name}`)).status).toBe(404); }
      finally { unlinkSync(symlink); }
    }
    expect(() => new WebStorage(join(STATIC_ROOT, 'private'))).toThrow(/outside the frontend static root/);
  });
});

describe('guarded paid text ledger', () => {
  it('reserves atomically and keeps failed attempts charged across app instances', async () => {
    const preflight = vi.fn(async () => { throw new CloudFailure('cloud_transport_failed'); });
    const backend: LyricBackend = { preflight, generate: vi.fn(), assess: vi.fn(), screen: vi.fn() };
    const environ = { ...auth_environment, ...lyric_limits, LYRIC_ENABLED: 'true', LYRIC_TOTAL_BUDGET_USD: '0.022', LYRIC_PER_ACTION_CAP_USD: '0.1' };
    const chat_advisor = { suggest: vi.fn() };
    const first = await fixture({ environ, lyric_backend: backend, chat_advisor });
    const second = await fixture({ data_dir: first.root, environ, lyric_backend: backend, chat_advisor }, false);
    const selection = { brief_ids: ['brief-001'], confirm_paid_generation: true };
    const chat = { ...selection, action: 'discuss', messages: [{ role: 'user', content: 'Make it upbeat' }] };
    const oversized = await request(first.app).post('/api/lyrics/options').auth(first.access_token, { type: 'bearer' }).send(selection);
    expect(oversized.status).toBe(409);
    expect(oversized.body.detail).toContain('per-action');
    expect(preflight).not.toHaveBeenCalled();
    const send = (target: typeof first) => request(target.app).post('/api/chat').auth(target.access_token, { type: 'bearer' }).send(chat);
    const responses = await Promise.all([send(first), send(second)]);
    expect(responses.map(res => res.status).sort()).toEqual([409, 503]);
    expect(responses.find(res => res.status === 409)?.body.detail).toContain('budget is exhausted');
    expect(preflight).toHaveBeenCalledTimes(1);
    expect((await send(second)).status).toBe(409);
  });
});

describe('guarded paid Speech ledger with fictional local provider', () => {
  it.each(['file', 'deployment'])('requires %s Speech rate evidence to match the Foundry account', async (mode) => {
    const root = root_dir();
    const resourceId = '/subscriptions/test/resourceGroups/test/providers/Microsoft.CognitiveServices/accounts/earwyrm-test';
    const environ = speech_environment(root, {
      SPEECH_KEY: '',
      SPEECH_ENDPOINT: 'https://earwyrm-test.cognitiveservices.azure.com',
      SPEECH_MANAGED_IDENTITY_CLIENT_ID: '11111111-2222-3333-4444-555555555555',
      SPEECH_RESOURCE_ID: resourceId,
    });
    const evidence = JSON.parse(readFileSync(environ.SPEECH_EVIDENCE_PATH, 'utf8'));
    const config: Record<string, string> = { ...environ };
    if (mode === 'deployment') {
      config.SPEECH_RATE_EVIDENCE = JSON.stringify(evidence);
      config.SPEECH_EVIDENCE_PATH = join(root, 'absent-evidence.json');
    }
    const { app, access_token, speech_factory } = await fixture({ data_dir: root, environ: config });
    const estimate = () => request(app).post('/api/renders/estimate').auth(access_token, { type: 'bearer' }).send({ brief_ids: ['brief-001'] });
    expect((await estimate()).status).toBe(503);
    const matching = JSON.stringify({ ...evidence, resource_reference: resourceId });
    if (mode === 'deployment') config.SPEECH_RATE_EVIDENCE = matching;
    else writeFileSync(config.SPEECH_EVIDENCE_PATH, matching);
    const ready = await fixture({ data_dir: root, environ: config }, false);
    expect((await request(ready.app).post('/api/renders/estimate').auth(ready.access_token, { type: 'bearer' }).send({ brief_ids: ['brief-001'] })).status).toBe(200);
    expect(speech_factory).not.toHaveBeenCalled();
    expect(ready.speech_factory).not.toHaveBeenCalled();
  });

  it.each([
    ['missing-key', 503], ['placeholder-resource', 503], ['invalid-rate', 503],
    ['region-mismatch', 503], ['not-entitled', 403], ['per-run-cap', 409], ['invalid-enable', 503],
  ])('refuses %s before provider construction', async (scenario, status) => {
    const root = root_dir();
    const environ = speech_environment(root);
    if (scenario === 'missing-key') environ.SPEECH_KEY = '';
    if (scenario === 'region-mismatch') environ.SPEECH_REGION = 'elsewhere';
    if (scenario === 'per-run-cap') environ.SPEECH_PER_RUN_CAP_USD = '0.000000001';
    if (scenario === 'invalid-enable') environ.SPEECH_ENABLED = 'yes';
    if (scenario === 'placeholder-resource' || scenario === 'invalid-rate') {
      const file = environ.SPEECH_EVIDENCE_PATH;
      const evidence = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
      evidence[scenario === 'invalid-rate' ? 'usd_per_million_characters' : 'resource_reference'] = scenario === 'invalid-rate' ? 'NaN' : 'your placeholder resource';
      writeFileSync(file, JSON.stringify(evidence));
    }
    const { app, access_token, speech_factory, store } = await fixture({ data_dir: root, environ });
    if (scenario === 'not-entitled') await store.set_user(issuer, 'user-a', { enabled: true, admin: true, paid_speech: false });
    const result = await request(app).post('/api/renders/estimate').auth(access_token, { type: 'bearer' }).send({ brief_ids: ['brief-001'] });
    expect(result.status).toBe(status);
    expect(result.text).not.toContain('credential-sentinel');
    expect(speech_factory).not.toHaveBeenCalled();
  });

  it('requires exact confirmation, persists usage, blocks retries and requires actual billing evidence', async () => {
    const root = root_dir();
    const speech_factory = vi.fn(() => ({ synthesize: vi.fn(async () => ({ audio: new Float64Array(480), words: [], result_id: 'test-only' })) }));
    const { app, access_token, store } = await fixture({ data_dir: root, environ: speech_environment(root), speech_factory });
    expect(speech_factory).not.toHaveBeenCalled();
    const selection = { brief_ids: ['brief-001'] };
    const estimate = (await request(app).post('/api/renders/estimate').auth(access_token, { type: 'bearer' }).send(selection)).body;
    for (const confirmation of [null, { ...estimate, brief_ids: ['brief-002'] }, { ...estimate, estimated_cost_usd: '0.000001' }]) {
      expect((await request(app).post('/api/renders').auth(access_token, { type: 'bearer' }).send({ ...selection, mode: 'azure', confirmation })).status).toBe(409);
    }
    expect(speech_factory).not.toHaveBeenCalled();
    const payload = { ...selection, mode: 'azure', confirmation: estimate };
    const run = await request(app).post('/api/renders').auth(access_token, { type: 'bearer' }).send(payload);
    expect(run.status).toBe(200);
    expect(run.body.attempt.status).toBe('awaiting_reconciliation');
    expect(speech_factory).toHaveBeenCalledTimes(1);
    expect((await request(app).post('/api/renders').auth(access_token, { type: 'bearer' }).send(payload)).status).toBe(409);
    expect((await request(app).get('/api/render-options').auth(access_token, { type: 'bearer' })).body.speech_status).toBe('busy');
    const attempt_id = run.body.attempt.attempt_id;
    expect((await request(app).post(`/api/attempts/${attempt_id}/reconcile`).auth(await token('user-b'), { type: 'bearer' })
      .send({ actual_cost_usd: '0', evidence_reference: 'test evidence' })).status).toBe(404);
    for (const actual_cost_usd of ['NaN', '-1', 'Infinity', '0x1']) {
      expect((await request(app).post(`/api/attempts/${attempt_id}/reconcile`).auth(access_token, { type: 'bearer' })
        .send({ actual_cost_usd, evidence_reference: 'test evidence' })).status).toBe(422);
    }
    const reconciled = await request(app).post(`/api/attempts/${attempt_id}/reconcile`).auth(access_token, { type: 'bearer' })
      .send({ actual_cost_usd: '0.6', evidence_reference: 'TEST-ONLY billing export reference' });
    expect(reconciled.body.status).toBe('reconciled');
    expect((await request(app).post('/api/renders').auth(access_token, { type: 'bearer' }).send(payload)).status).toBe(409);
    const evidence = await request(app).get(run.body.outputs[0].evidence_url).auth(access_token, { type: 'bearer' });
    expect(evidence.body.manifest.azure_usage.billing_reconciled).toBe(true);
    expect(evidence.body.status).toBe('Fail');
    for (const response of [run, evidence]) {
      expect(response.text).not.toContain('credential-sentinel');
      expect(response.text).not.toContain('evidence-secret-sentinel');
    }
    expect((await store.get_attempt(attempt_id, 'user-a'))?.evidence.provider_secret).toBeUndefined();
  });

  it('preserves failed/unknown paid usage without provider diagnostics and releases the guard after reservation errors', async () => {
    const root = root_dir();
    const speech_factory = vi.fn(() => ({ synthesize: async () => { throw new Error('credential-sentinel provider diagnostic'); } }));
    const { app, access_token, store } = await fixture({ data_dir: root, environ: speech_environment(root), speech_factory });
    const estimate = (await request(app).post('/api/renders/estimate').auth(access_token, { type: 'bearer' }).send({ brief_ids: ['brief-001'] })).body;
    const payload = { ...estimate, mode: 'azure', confirmation: estimate };
    const reserve = vi.spyOn(store, 'reserve_paid_run').mockRejectedValueOnce(Object.assign(new Error('database diagnostic'), { code: 'SQLITE_ERROR' }));
    expect((await request(app).post('/api/renders').auth(access_token, { type: 'bearer' }).send(payload)).status).toBe(503);
    reserve.mockRestore();
    expect(speech_factory).not.toHaveBeenCalled();
    const logging = vi.spyOn(console, 'error');
    const failed = await request(app).post('/api/renders').auth(access_token, { type: 'bearer' }).send(payload);
    expect(failed.status).toBe(502);
    expect(failed.body.detail.status).toBe('failed_or_unknown');
    expect(failed.text).not.toContain('credential-sentinel');
    expect(logging).not.toHaveBeenCalled();
    expect((await request(app).post('/api/renders').auth(access_token, { type: 'bearer' }).send(payload)).status).toBe(409);
    const reconcile = await request(app).post(`/api/attempts/${failed.body.detail.attempt_id}/reconcile`).auth(access_token, { type: 'bearer' })
      .send({ actual_cost_usd: '0', evidence_reference: 'TEST-ONLY failed request billing' });
    expect(reconcile.status).toBe(200);
    expect(speech_factory).toHaveBeenCalledTimes(1);
  });
});

describe('single-worker cloud startup', () => {
  it('refuses relative paths and directories that are not actual mounts', () => {
    expect(() => acquire_writer_lock('relative')).toThrow(/absolute mount path/);
    expect(() => acquire_writer_lock(root_dir())).toThrow(/not a mounted volume/);
  });
  it('uses a real inherited flock rather than stale PID state and refuses symlink lock files', () => {
    const root = root_dir();
    const options = { is_mounted: () => true };
    const descriptor = acquire_writer_lock(root, options);
    try { expect(() => acquire_writer_lock(root, options)).toThrow(/active writer/); }
    finally { closeSync(descriptor); }
    closeSync(acquire_writer_lock(root, options));
    const lock = join(root, '.earwyrm-writer.lock');
    unlinkSync(lock);
    const target = join(root, 'target');
    writeFileSync(target, 'untouched');
    symlinkSync(target, lock);
    expect(() => acquire_writer_lock(root, options)).toThrow();
    expect(readFileSync(target, 'utf8')).toBe('untouched');
  });
  it('keeps the flock in an inherited Node worker after the supervisor closes its descriptor', async () => {
    const root = root_dir();
    const options = { is_mounted: () => true };
    const descriptor = acquire_writer_lock(root, options);
    const child = spawn(process.execPath, ['-e', "process.stdout.write('ready');setInterval(()=>{},1000)"], {
      stdio: ['ignore', 'pipe', 'pipe', descriptor],
    });
    const exited = once(child, 'exit');
    let closed = false;
    try {
      await once(child.stdout!, 'data');
      closeSync(descriptor);
      closed = true;
      expect(() => acquire_writer_lock(root, options)).toThrow(/active writer/);
    } finally {
      child.kill('SIGTERM');
      await exited;
      if (!closed) closeSync(descriptor);
    }
    closeSync(acquire_writer_lock(root, options));
  });
  it.each(['.earwyrm-initialized', 'earwyrm.sqlite3', 'melody'])('rejects symlinked %s before touching target contents', async name => {
    const root = root_dir();
    const target = join(root, 'target');
    writeFileSync(target, 'untouched');
    symlinkSync(target, join(root, name));
    await expect(prepare_databases(root)).rejects.toThrow(/regular files|symlink/);
    expect(readFileSync(target, 'utf8')).toBe('untouched');
  });
  it('initializes both databases and rejects a missing database after the store marker exists', async () => {
    const root = root_dir();
    await prepare_databases(root);
    expect(existsSync(join(root, '.earwyrm-initialized'))).toBe(true);
    unlinkSync(join(root, 'earwyrm.sqlite3'));
    await expect(prepare_databases(root)).rejects.toThrow(/missing a database/);
    expect(existsSync(join(root, 'earwyrm.sqlite3'))).toBe(false);
  });
  it.each(['earwyrm.sqlite3', 'melody/melody.sqlite3'])('rejects WAL journal mode in %s', async path => {
    const root = root_dir();
    await prepare_databases(root);
    const database = new DatabaseSync(join(root, path));
    database.prepare('PRAGMA journal_mode=WAL').get();
    database.close();
    await expect(prepare_databases(root)).rejects.toThrow(/Unsupported SQLite journal mode: wal/);
  });
});
