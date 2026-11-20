import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { exportJWK, generateKeyPair, SignJWT, type JWK, type JWTPayload } from 'jose';
import { closeSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { Decimal } from 'decimal.js';
import { create_app, EXPECTED_ANSWERS, type CreateAppOptions } from '../src/web_app.js';
import { AuthSettings, TokenValidator, type Environment } from '../src/web_auth.js';
import { canonical_json, STATIC_ROOT, StorageConflict, WebStorage } from '../src/web_storage.js';
import { acquire_writer_lock, prepare_databases } from '../src/cloud_web.js';
import { SAMPLE_RATE, write_wav } from '../src/dsp.js';
import { load_inputs, render_brief } from '../src/render.js';
import { AzureLyricBackend, CloudFailure, type LyricBackend } from '../src/lyric_cloud.js';
import { LyricRequest, LyricResult, WORD } from '../src/lyrics.js';
import { CompositionUnavailable, MelodyService } from '../src/melody_service.js';
import { ArrangementScore, compile_score, score_lyric_timing } from '../src/score_dsl.js';
import { score_prompt } from '../src/score_cloud.js';

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
const test_score = ArrangementScore.parse({
  schema_version: 1, style: 'retro-synth', tempo_bpm: 120, time_signature: '4/4',
  key_root: 0, mode: 'major', bars: 8, progression: [0, 4, 5, 3], hook_motif: [0, 4, 2, 6, 3, 5, 1],
  tracks: [
    { instrument: 'pad', events: [{ step: 0, degree: 0, duration_steps: 8 }] },
    { instrument: 'bass', events: [{ step: 0, degree: 0, duration_steps: 2 }, { step: 4, degree: 3, duration_steps: 2 }] },
    { instrument: 'lead', events: [
      { step: 0, degree: 0, duration_steps: 1 }, { step: 2, degree: 4, duration_steps: 1 },
      { step: 4, degree: 2, duration_steps: 1 }, { step: 6, degree: 6, duration_steps: 1 },
    ] },
  ],
});

/** Persists an accepted lyric option using the same screened fixture contract as the API tests. */
async function save_accepted_lyric_option(store: WebStorage, owner = 'user-a') {
  const sample = load_inputs()[0]!;
  const cta = sample[1].split(/(?<=[.!?])\s+/).at(-1)!;
  const hook = `${sample[0].name}, a tune up for your ride`;
  const draft = {
    hook, lyrics: `${hook}\n${cta}`, syllables_per_line: [12, 16],
    rhyme_scheme: '--', brand_count: 2, cta,
  };
  const lyric_request = LyricRequest.parse({ brief: sample[0], cta, product_path: 'spoken' });
  const result = LyricResult.parse({ status: 'accepted', attempts: 1, output: draft });
  return store.save_lyric_option(owner, lyric_request, result);
}

describe('same-origin Express API', () => {
  it('exposes own budgets and restricts persistent budget administration to enabled administrators', async () => {
    const { app, store, access_token } = await fixture({ environ: lyric_limits });
    const auth = { type: 'bearer' as const };
    expect((await request(app).get('/api/budget')).status).toBe(401);
    const other = await token('user-b');
    expect((await request(app).get('/api/budget').auth(other, auth)).body).toEqual({
      limit_usd: '5', charged_usd: '0', remaining_usd: '5', lyric_reserved_usd: '0', lyric_actual_usd: '0',
    });
    expect((await request(app).get('/api/admin/budgets').auth(other, auth)).status).toBe(403);
    expect((await request(app).put('/api/admin/budgets').auth(other, auth).send({ scope: 'text', limit_usd: '10' })).status).toBe(403);
    expect((await request(app).get('/api/budget').auth(await token('disabled'), auth)).status).toBe(403);
    for (const body of [
      { scope: 'text', limit_usd: 10 }, { scope: 'speech', limit_usd: '-1' },
      { scope: 'speech', limit_usd: '1e2' },
      { scope: 'user', limit_usd: '10' }, { scope: 'text', limit_usd: 'Infinity' },
      { scope: 'text', limit_usd: '1', owner: 'user-b' }, { scope: 'user', owner: ' user-b', limit_usd: '1' },
    ]) expect((await request(app).put('/api/admin/budgets').auth(access_token, auth).send(body)).status).toBe(422);
    expect((await request(app).put('/api/admin/budgets').auth(access_token, auth).send({ scope: 'user', owner: 'missing', limit_usd: '10' })).status).toBe(404);
    expect((await request(app).put('/api/admin/budgets').auth(access_token, auth).send({ scope: 'user', owner: 'user-b', limit_usd: '0' })).status).toBe(200);
    expect((await request(app).get('/api/budget').auth(other, auth)).body.remaining_usd).toBe('0');
    const overview = await request(app).get('/api/admin/budgets').auth(access_token, auth);
    expect(overview.status).toBe(200);
    expect(overview.body.text.limit_usd).toBe('5');
    expect(overview.body.speech.limit_usd).toBeNull();
    expect(overview.body.users.find((user: { subject: string }) => user.subject === 'user-b').limit_usd).toBe('0');
    await store.set_user(issuer, 'user-a', { enabled: true, admin: false, paid_speech: true });
    expect((await request(app).put('/api/admin/budgets').auth(access_token, auth).send({ scope: 'text', limit_usd: '10' })).status).toBe(403);
  });

  it('restricts lyric settlement actions to admins and preserves correction and reopen history', async () => {
    const { app, store, access_token } = await fixture({ environ: lyric_limits });
    await store.reserve_lyric_action('write', new Decimal('0.62'), new Decimal(1), new Decimal(5), 'user-a');
    const auth = { type: 'bearer' as const };
    const overview = await request(app).get('/api/admin/budgets').auth(access_token, auth);
    expect(overview.status).toBe(200);
    const reservation_id = overview.body.lyric_reservations[0].reservation_id as string;
    const path = `/api/admin/lyric-reservations/${reservation_id}`;
    const settlement = {
      actual_cost_usd: '0.05', evidence_reference: 'TEST-ONLY verified billing record',
      reason: 'Verified lyric-call charge',
    };
    const other = await token('user-b');
    expect((await request(app).post(`${path}/settle`).auth(other, auth).send(settlement)).status).toBe(403);
    expect((await request(app).post(`${path}/correct`).auth(other, auth).send(settlement)).status).toBe(403);
    expect((await request(app).post(`${path}/reopen`).auth(other, auth).send({ reason: 'Recheck evidence' })).status).toBe(403);
    expect((await request(app).post(`${path}/settle`).auth(access_token, auth)
      .send({ ...settlement, actual_cost_usd: '-0.01' })).status).toBe(422);
    expect((await request(app).post(`${path}/settle`).auth(access_token, auth)
      .send({ actual_cost_usd: '0.05', reason: settlement.reason })).status).toBe(422);
    expect((await request(app).post(`${path}/settle`).auth(access_token, auth)
      .send({ actual_cost_usd: '0.05', evidence_reference: settlement.evidence_reference })).status).toBe(422);
    expect((await request(app).post(`/api/admin/lyric-reservations/missing/settle`)
      .auth(access_token, auth).send(settlement)).status).toBe(404);

    const settled = await request(app).post(`${path}/settle`).auth(access_token, auth).send(settlement);
    expect(settled.status).toBe(200);
    expect(settled.body.reservation).toMatchObject({
      settlement_status: 'settled', reserved_usd: '0.62', actual_cost_usd: '0.05',
      events: [expect.objectContaining({ reason: settlement.reason, actor_subject: 'user-a' })],
    });
    expect((await request(app).post(`${path}/settle`).auth(access_token, auth).send(settlement)).status).toBe(409);

    const correction = await request(app).post(`${path}/correct`).auth(access_token, auth).send({
      actual_cost_usd: '0.03', evidence_reference: 'TEST-ONLY corrected billing record', reason: 'Corrected after verification',
    });
    expect(correction.status).toBe(200);
    expect(correction.body.reservation.events).toHaveLength(2);
    const reopened = await request(app).post(`${path}/reopen`).auth(access_token, auth)
      .send({ reason: 'Evidence needs another review' });
    expect(reopened.status).toBe(200);
    expect(reopened.body.reservation).toMatchObject({
      settlement_status: 'pending', actual_cost_usd: null, events: [
        expect.objectContaining({ event_type: 'settled' }),
        expect.objectContaining({ event_type: 'corrected', previous_actual_usd: '0.05' }),
        expect.objectContaining({ event_type: 'reopened', previous_actual_usd: '0.03' }),
      ],
    });
    const refreshed = await request(app).get('/api/admin/budgets').auth(access_token, auth);
    expect(refreshed.body.text).toMatchObject({ charged_usd: '0.62', lyric_reserved_usd: '0.62', lyric_actual_usd: '0' });
  });

  it.each([['1e2', '100'], ['.5', '0.5']])('normalizes existing Speech budget default %s for administration', async (value, expected) => {
    const { app, access_token } = await fixture({ environ: { ...lyric_limits, SPEECH_TOTAL_BUDGET_USD: value } });
    const response = await request(app).get('/api/admin/budgets').auth(access_token, { type: 'bearer' });
    expect(response.status).toBe(200);
    expect(response.body.speech).toEqual({ limit_usd: expected, charged_usd: '0', remaining_usd: expected });
  });

  it('reports malformed Speech budget defaults as configuration failures', async () => {
    const { app, access_token } = await fixture({ environ: { ...lyric_limits, SPEECH_TOTAL_BUDGET_USD: 'Infinity' } });
    const response = await request(app).get('/api/admin/budgets').auth(access_token, { type: 'bearer' });
    expect(response.status).toBe(503);
    expect(response.body.detail).toBe('Budget configuration is invalid');
  });

  it('rejects a jingle above its lifetime allowance before any paid text call', async () => {
    const root = root_dir();
    const generate = vi.fn<LyricBackend['generate']>();
    const { app, store, access_token } = await fixture({ data_dir: root,
      environ: { ...speech_environment(root, { SPEECH_TOTAL_BUDGET_USD: '100' }), ...lyric_limits, LYRIC_ENABLED: 'true' },
      lyric_backend: { generate, preflight: async () => ({ english: true, risky_claims: false, artist_imitation: false }),
        assess: async () => ({ english: true, grounded: true, risky_claims: false }),
        screen: async () => ({ moderation_passed: true, protected_material_detected: false }) },
      jingle_direction: vi.fn(), score_composer: { compose: vi.fn() },
    });
    await store.set_budget_as_admin(issuer, 'user-a', 'user', 'user-a', '0');
    const response = await request(app).post('/api/jingles').auth(access_token, { type: 'bearer' }).send({ description: 'A bike shop jingle' });
    expect(response.status).toBe(409);
    expect(response.body.detail).toContain('lifetime budget');
    expect(generate).not.toHaveBeenCalled();
    expect((await store.get_user_budget('user-a')).charged_usd).toBe('0');
  });

  const custom_details = {
    name: 'Bright Bike', offer: 'Bike tune ups', location: 'Lakeview',
    contact_details: { email: 'shop@example.com', phone: '+1-202-555-0101' },
    tone: 'Friendly and practical', approved_claims: ['Bike tune ups are available'],
    cta: 'Call Bright Bike to plan your next ride',
  };

  it('rejects new arrangements at the durable quota before composing or publishing outputs', async () => {
    const { app, store, access_token } = await fixture();
    const db = new DatabaseSync(store.database_path);
    try {
      const insert = db.prepare("INSERT INTO preview_reservations VALUES (?, ?, ?, ?, 0, 0, ?)");
      for (let index = 0; index < 20; index++) insert.run(
        `prior-${index}`, 'user-a', JSON.stringify([`guided-v3-${createHash('sha256').update(String(index)).digest('hex')}`]),
        12 * 1024 * 1024, new Date().toISOString(),
      );
    } finally { db.close(); }
    const submit = vi.spyOn(MelodyService.prototype, 'submit');
    const result = await request(app).post('/api/arrangements').auth(access_token, { type: 'bearer' }).send({ brief_ids: ['brief-001'] });
    expect(result.status).toBe(429);
    expect(result.body.detail).toContain('20 new requests');
    expect(submit).not.toHaveBeenCalled();
    expect(await store.list_runs('user-a')).toEqual([]);
  });

  it('recovers partially published pre-upgrade previews without double-charging later cache hits', async () => {
    const { app, store, access_token } = await fixture();
    const post = () => request(app).post('/api/arrangements').auth(access_token, { type: 'bearer' }).send({ brief_ids: ['brief-001'] });
    const original = await post();
    expect(original.status).toBe(200);
    const missing = await store.get_output(original.body.arrangements[2].output.output_id, 'user-a');
    const db = new DatabaseSync(store.database_path);
    try {
      db.exec('DELETE FROM preview_reservations');
      db.prepare('DELETE FROM outputs WHERE output_id = ?').run(missing!.output_id);
    } finally { db.close(); }
    unlinkSync(join(store.audio_dir, missing!.audio_filename));
    const recovered = await post();
    expect(recovered.status).toBe(200);
    expect(recovered.body.arrangements.map((item: { job_id: string }) => item.job_id))
      .toEqual(original.body.arrangements.map((item: { job_id: string }) => item.job_id));
    expect((await post()).body).toEqual(recovered.body);
    const ledger = new DatabaseSync(store.database_path);
    try { expect(ledger.prepare('SELECT count(*) AS n FROM preview_reservations').get()?.n).toBe(1); } finally { ledger.close(); }
  });

  it('resumes lyric-free previews and fits screened rhymes to the exact selected custom arrangement', async () => {
    const root = root_dir();
    const hook = 'Bright Bike can help you plan a tune up right';
    const second = 'Plan a tune up for your next ride tonight';
    const cta = custom_details.cta;
    const generate = vi.fn<LyricBackend['generate']>(async () => JSON.stringify({
      hook, lyrics: `${hook}\n${second}\nA tune up for your bike may be your guide\n${cta}`,
      syllables_per_line: [10, 10, 10, 8], rhyme_scheme: 'AABB', brand_count: 2, cta,
    })).mockResolvedValueOnce(JSON.stringify({
      hook, lyrics: `${hook}\n${second}\nA tune up for your bike may be your goal\n${cta}`,
      syllables_per_line: [10, 10, 10, 8], rhyme_scheme: 'AABB', brand_count: 2, cta,
    })).mockResolvedValueOnce(JSON.stringify({
      hook, lyrics: `${hook}\n${second}\nA tune up for your bike may be your own guide\n${cta}`,
      syllables_per_line: [10, 10, 11, 8], rhyme_scheme: 'AABB', brand_count: 2, cta,
    }));
    const lyric_backend: LyricBackend = {
      preflight: async () => ({ english: true, artist_imitation: false, risky_claims: false }),
      generate,
      assess: async () => ({ english: true, grounded: true, risky_claims: false }),
      screen: async () => ({ moderation_passed: true, protected_material_detected: false }),
    };
    const synthesize = vi.fn(async (text: string) => {
      const words = [...text.matchAll(WORD)].map((match, index) => ({
        text: match[0], text_offset: match.index, offset: index / 8, duration: 0.125,
      }));
      return { result_id: 'TEST', audio: new Float64Array(words.length * SAMPLE_RATE / 8).fill(0.1), words };
    });
    const renderer = vi.fn(render_brief);
    const options = {
      data_dir: root, environ: { ...speech_environment(root, { SPEECH_TOTAL_BUDGET_USD: '2' }), ...lyric_limits, LYRIC_ENABLED: 'true' },
      lyric_backend, render: renderer, speech_factory: () => ({ synthesize }),
    };
    const { app, store, access_token } = await fixture(options);
    const post = (path: string, value: object, bearer = access_token, server = app) =>
      request(server).post(path).auth(bearer, { type: 'bearer' }).send(value);
    const { source: _source, cta: saved_cta, ...brief } = (await post('/api/briefs/validate', custom_details)).body;
    const selection = { brief_ids: [brief.brief_id], custom_briefs: [{ brief, cta: saved_cta }] };
    const previews = await post('/api/arrangements', selection);
    expect(previews.status, JSON.stringify(previews.body)).toBe(200);
    const { arrangements } = previews.body;
    expect(arrangements).toHaveLength(3);
    expect(new Set(arrangements.map((item: { job_id: string }) => item.job_id)).size).toBe(3);
    const { job_id, output } = arrangements[0];
    expect(output).toMatchObject({ variant: 'instrumental', lyric_source: null, composition_source: { job_id } });
    const audio = async (url: string, bearer = access_token) => request(app).get(url).auth(bearer, { type: 'bearer' });
    const wavs = await Promise.all(arrangements.map((item: typeof arrangements[0]) => audio(item.output.audio_url)));
    expect(wavs.every(wav => wav.status === 200 && Buffer.from(wav.body).subarray(0, 4).toString() === 'RIFF')).toBe(true);
    for (const [index, wav] of wavs.entries()) {
      const duration = arrangements[index].output.duration_seconds;
      expect(duration).toBeGreaterThanOrEqual(14);
      expect(duration).toBeLessThanOrEqual(20);
      expect((Buffer.from(wav.body).length - 44) / (2 * SAMPLE_RATE)).toBe(duration);
    }
    expect(new Set(wavs.map(wav => createHash('sha256').update(wav.body).digest('hex'))).size).toBe(3);
    expect((await audio(output.audio_url, await token('user-b'))).status).toBe(404);
    expect(generate).not.toHaveBeenCalled();
    expect(synthesize).not.toHaveBeenCalled();

    await store.set_user(issuer, 'user-b', { enabled: true, admin: false, paid_speech: true });
    const lyric_body = { ...selection, arrangement_job_id: job_id, confirm_paid_generation: true };
    expect((await post('/api/lyrics/options', lyric_body, await token('user-b'))).status).toBe(404);
    expect((await post('/api/lyrics/options', { ...lyric_body, brief_ids: ['brief-001'], custom_briefs: [] })).status).toBe(404);
    expect(generate).not.toHaveBeenCalled();
    const generated = await post('/api/lyrics/options', lyric_body);
    expect(generated.status, JSON.stringify(generated.body)).toBe(200);
    const [option] = generated.body.options;
    expect(option).toMatchObject({ status: 'accepted', arrangement_job_id: job_id, attempts: 3, output: { rhyme_scheme: 'AABB' } });
    expect(generate.mock.calls[1][1]).toEqual(['rhyme']);
    expect(generate.mock.calls[2][1]).toEqual(['arrangement_meter']);
    const resumed = await fixture(options, false);
    expect((await post('/api/arrangements', selection, resumed.access_token, resumed.app)).body).toEqual(previews.body);
    const legacy = new DatabaseSync(store.database_path);
    try { legacy.exec('DELETE FROM preview_reservations'); } finally { legacy.close(); }
    expect((await post('/api/arrangements', selection, resumed.access_token, resumed.app)).body).toEqual(previews.body);
    const adopted = new DatabaseSync(store.database_path);
    try { expect(adopted.prepare('SELECT count(*) AS n FROM preview_reservations').get()?.n).toBe(1); } finally { adopted.close(); }
    expect((await request(resumed.app).get('/api/lyrics/options').auth(resumed.access_token, { type: 'bearer' })).body.options).toContainEqual(option);

    const body = { ...selection, lyric_selections: [{ brief_id: brief.brief_id, option_id: option.option_id }] };
    const chosen = { ...body, composition_selections: [{ brief_id: brief.brief_id, job_id }] };
    const estimate_path = '/api/renders/estimate';
    expect((await post(estimate_path, body)).status).toBe(409);
    expect((await post(estimate_path, { ...chosen, composition_selections: [{ brief_id: brief.brief_id, job_id: arrangements[1].job_id }] })).status).toBe(409);
    const preview_run = (await store.get_run(job_id, 'user-a'))!;
    const tampered = vi.spyOn(store, 'get_run').mockResolvedValueOnce({
      ...preview_run, outputs: preview_run.outputs.map(item => ({ ...item, manifest: {
        ...item.manifest, composition_source: { ...output.composition_source, timing_sha256: '0'.repeat(64) },
      } })),
    });
    expect((await post(estimate_path, chosen)).status).toBe(409);
    tampered.mockRestore();
    const estimate = await post(estimate_path, chosen);
    expect(estimate.status, JSON.stringify(estimate.body)).toBe(200);
    expect(estimate.body.input_fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect((await post('/api/renders', { ...chosen, mode: 'azure', confirmation: { ...estimate.body, input_fingerprint: '0'.repeat(64) } })).status).toBe(409);
    expect(synthesize).not.toHaveBeenCalled();
    const rendered = await post('/api/renders', { ...chosen, mode: 'azure', confirmation: estimate.body });
    expect(rendered.status, JSON.stringify(rendered.body)).toBe(200);
    expect(synthesize).toHaveBeenCalledExactlyOnceWith(option.output.lyrics);
    const selected = renderer.mock.calls[0][6]?.composition;
    expect(selected?.backing).toEqual(Buffer.from(wavs[0].body));
    const preview = await new MelodyService(join(root, 'melody')).get_job(job_id);
    expect(selected?.result.syllable_timing.map(event => ({ ...event, syllable: '' }))).toEqual(preview.syllable_timing);
    expect(preview.syllable_timing[0].start_seconds).toBe(3);
    const last = preview.syllable_timing.at(-1)!;
    expect(last.start_seconds + last.duration_seconds).toBeLessThanOrEqual(output.duration_seconds - 2);
    expect(rendered.body.outputs.map((item: typeof output) => item.variant).sort()).toEqual(['spoken', 'vocoded']);
    expect(rendered.body.outputs.map((item: typeof output) => item.duration_seconds)).toEqual([output.duration_seconds, output.duration_seconds]);
  }, 20_000);

  it('creates three offline arrangements for every fixture brief', async () => {
    const { app, access_token, speech_factory } = await fixture();
    for (const [brief] of load_inputs()) {
      const result = await request(app).post('/api/arrangements').auth(access_token, { type: 'bearer' })
        .send({ brief_ids: [brief.brief_id], custom_briefs: [] });
      expect(result.status, `${brief.brief_id}: ${JSON.stringify(result.body)}`).toBe(200);
      expect(result.body.arrangements).toHaveLength(3);
      for (const item of result.body.arrangements) {
        expect(item.output.duration_seconds).toBeGreaterThanOrEqual(14);
        expect(item.output.duration_seconds).toBeLessThanOrEqual(20);
      }
    }
    expect(speech_factory).not.toHaveBeenCalled();
  }, 20_000);

  it('keeps instrumental previews available when a custom pronunciation or final rhyme cannot be verified', async () => {
    const generate = vi.fn<LyricBackend['generate']>();
    const { app, store, access_token } = await fixture({
      environ: { ...lyric_limits, LYRIC_ENABLED: 'true' },
      lyric_backend: {
        generate,
        preflight: async () => ({ english: true, risky_claims: false, artist_imitation: false }),
        assess: async () => ({ english: true, grounded: true, risky_claims: false }),
        screen: async () => ({ moderation_passed: true, protected_material_detected: false }),
      },
    });
    const reserve = vi.spyOn(store, 'reserve_lyric_action');
    const post = (path: string, value: object) => request(app).post(path).auth(access_token, { type: 'bearer' }).send(value);
    for (const [changes, reason] of [
      [{ name: 'Qwzj Bike', cta: 'Call Qwzj Bike to plan your next ride' }, /pronunciation/],
      [{ cta: 'Call Bright Bike and ask for orange' }, /No distinct English rhyme fits/],
    ] as const) {
      const { source: _source, cta, ...brief } = (await post('/api/briefs/validate', { ...custom_details, ...changes })).body;
      const selection = { brief_ids: [brief.brief_id], custom_briefs: [{ brief, cta }] };
      const preview = await post('/api/arrangements', selection);
      expect(preview.status, JSON.stringify(preview.body)).toBe(200);
      expect(preview.body.arrangements).toHaveLength(3);
      const response = await post('/api/lyrics/options', {
        ...selection, arrangement_job_id: preview.body.arrangements[0].job_id, confirm_paid_generation: true,
      });
      expect(response.status).toBe(422);
      expect(response.body.detail).toMatch(reason);
    }
    expect(reserve).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  }, 20_000);

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

  it('lets an unapproved signed-in identity check and submit its own request without a body', async () => {
    const { app } = await fixture();
    const bearer = await token('new-user');
    expect((await request(app).get('/api/access-requests').auth(bearer, { type: 'bearer' })).body)
      .toEqual({ status: 'none' });
    expect((await request(app).post('/api/access-requests').auth(bearer, { type: 'bearer' })).body)
      .toEqual({ status: 'pending' });
    expect((await request(app).get('/api/access-requests').auth(bearer, { type: 'bearer' })).body)
      .toEqual({ status: 'pending' });
    await request(app).post('/api/access-requests').auth(await token('user-b'), { type: 'bearer' })
      .expect(200, { status: 'already_enabled' });
  });

  it('keeps pending requests idempotent and allows a denied identity to submit again', async () => {
    const { app, access_token } = await fixture();
    const bearer = await token('applicant');
    await request(app).post('/api/access-requests').auth(bearer, { type: 'bearer' }).expect(200, { status: 'pending' });
    await request(app).post('/api/access-requests').auth(bearer, { type: 'bearer' }).expect(200, { status: 'pending' });
    const queued = await request(app).get('/api/admin/access-requests').auth(access_token, { type: 'bearer' });
    expect(queued.body.requests).toHaveLength(1);
    const firstId = queued.body.requests[0].request_id as string;
    await request(app).post(`/api/admin/access-requests/${firstId}/decision`).auth(access_token, { type: 'bearer' })
      .send({ decision: 'denied' }).expect(200, { status: 'denied' });
    await request(app).get('/api/access-requests').auth(bearer, { type: 'bearer' }).expect(200, { status: 'denied' });
    await request(app).post('/api/access-requests').auth(bearer, { type: 'bearer' }).expect(200, { status: 'pending' });
    const retried = await request(app).get('/api/admin/access-requests').auth(access_token, { type: 'bearer' });
    expect(retried.body.requests).toHaveLength(1);
    expect(retried.body.requests[0].request_id).not.toBe(firstId);
  });

  it('lists only pending requests to enabled admins with the admin read scope', async () => {
    const { app } = await fixture();
    await request(app).post('/api/access-requests').auth(await token('applicant'), { type: 'bearer' });
    expect((await request(app).get('/api/admin/access-requests').auth(await token('user-b'), { type: 'bearer' })).status).toBe(403);
    expect((await request(app).get('/api/admin/access-requests').auth(
      await token('user-a', { scp: 'briefs.read' }), { type: 'bearer' },
    )).status).toBe(403);
    const adminList = await request(app).get('/api/admin/access-requests').auth(await token(), { type: 'bearer' });
    expect(adminList.status).toBe(200);
    expect(adminList.body.requests).toEqual([
      expect.objectContaining({ subject: 'applicant', email: null, created_at: expect.any(String), request_id: expect.any(String) }),
    ]);
    expect(adminList.text).not.toContain(issuer);
    const id = adminList.body.requests[0].request_id as string;
    expect((await request(app).post(`/api/admin/access-requests/${id}/decision`).auth(
      await token('user-a', { scp: 'renders.read' }), { type: 'bearer' },
    ).send({ decision: 'denied' })).status).toBe(403);
  });
  it.each([
    [{ email: ' applicant@example.test ' }, 'applicant@example.test'],
    [{ emails: [null, 42, 'not-an-email', 'alternate@example.test'] }, 'alternate@example.test'],
    [{ email: 42, emails: 'not-an-array', preferred_username: 'not-an-email' }, null],
  ])('lists only email metadata from verified claims: %j', async (claims, email) => {
    const { app, store, access_token } = await fixture();
    const bearer = await token('applicant', claims);
    await request(app).post('/api/access-requests').auth(bearer, { type: 'bearer' }).expect(200);
    const queued = await request(app).get('/api/admin/access-requests').auth(access_token, { type: 'bearer' });
    expect(queued.body.requests).toEqual([
      expect.objectContaining({ subject: 'applicant', email }),
    ]);
    expect(await store.get_user(issuer, 'applicant')).toBeNull();
    await request(app).post('/api/access-requests').auth(bearer, { type: 'bearer' })
      .send({ email: 'spoofed@example.test', subject: 'someone-else' }).expect(422);
  });

  it('grants baseline access to new and previously disabled identities', async () => {
    const { app, store, access_token } = await fixture();
    const newUser = await token('new-user');
    await request(app).post('/api/access-requests').auth(newUser, { type: 'bearer' });
    let queued = await request(app).get('/api/admin/access-requests').auth(access_token, { type: 'bearer' });
    let id = queued.body.requests[0].request_id as string;
    await request(app).post(`/api/admin/access-requests/${id}/decision`).auth(access_token, { type: 'bearer' })
      .send({ decision: 'approved' }).expect(200, { status: 'approved' });
    expect(await store.get_user(issuer, 'new-user')).toMatchObject({ enabled: 1, admin: 0, paid_speech: 0 });

    await store.set_user(issuer, 'disabled', { enabled: false, admin: true, paid_speech: true });
    await request(app).post('/api/access-requests').auth(await token('disabled'), { type: 'bearer' });
    queued = await request(app).get('/api/admin/access-requests').auth(access_token, { type: 'bearer' });
    id = queued.body.requests[0].request_id as string;
    await request(app).post(`/api/admin/access-requests/${id}/decision`).auth(access_token, { type: 'bearer' })
      .send({ decision: 'approved' }).expect(200, { status: 'approved' });
    expect(await store.get_user(issuer, 'disabled')).toMatchObject({ enabled: 1, admin: 0, paid_speech: 0 });
  });

  it('denies a request without enabling or creating an application user', async () => {
    const { app, store, access_token } = await fixture();
    await request(app).post('/api/access-requests').auth(await token('applicant'), { type: 'bearer' });
    const id = (await request(app).get('/api/admin/access-requests').auth(access_token, { type: 'bearer' })).body.requests[0].request_id as string;
    await request(app).post(`/api/admin/access-requests/${id}/decision`).auth(access_token, { type: 'bearer' })
      .send({ decision: 'denied' }).expect(200, { status: 'denied' });
    expect(await store.get_user(issuer, 'applicant')).toBeNull();
    expect((await store.get_access_request(issuer, 'applicant'))?.status).toBe('denied');
  });

  it('returns 404 for unknown IDs and 409 for decided requests without mutating user state', async () => {
    const { app, store, access_token } = await fixture();
    await request(app).post('/api/admin/access-requests/missing/decision').auth(access_token, { type: 'bearer' })
      .send({ decision: 'approved' }).expect(404);
    await request(app).post('/api/access-requests').auth(await token('applicant'), { type: 'bearer' });
    const id = (await request(app).get('/api/admin/access-requests').auth(access_token, { type: 'bearer' })).body.requests[0].request_id as string;
    await request(app).post(`/api/admin/access-requests/${id}/decision`).auth(access_token, { type: 'bearer' })
      .send({ decision: 'denied' }).expect(200);
    await request(app).post(`/api/admin/access-requests/${id}/decision`).auth(access_token, { type: 'bearer' })
      .send({ decision: 'approved' }).expect(409);
    expect(await store.get_user(issuer, 'applicant')).toBeNull();
    expect((await store.get_access_request(issuer, 'applicant'))?.status).toBe('denied');
  });

  it('requires a valid bearer token and briefs.read for requester operations', async () => {
    const { app, store } = await fixture();
    expect((await request(app).get('/api/access-requests')).status).toBe(401);
    expect((await request(app).post('/api/access-requests').auth(
      await token('applicant', { scp: 'renders.read' }), { type: 'bearer' },
    )).status).toBe(403);
    expect(await store.get_access_request(issuer, 'applicant')).toBeNull();
  });

  it('rechecks admin authorization for queue decisions and leaves the request pending after revocation', async () => {
    const { app, store } = await fixture();
    await request(app).post('/api/access-requests').auth(await token('applicant'), { type: 'bearer' });
    const id = (await request(app).get('/api/admin/access-requests').auth(await token(), { type: 'bearer' })).body.requests[0].request_id as string;
    await store.set_user(issuer, 'user-a', { enabled: true, admin: false, paid_speech: true });
    expect((await request(app).get('/api/admin/access-requests').auth(await token(), { type: 'bearer' })).status).toBe(403);
    expect((await request(app).post(`/api/admin/access-requests/${id}/decision`).auth(await token(), { type: 'bearer' })
      .send({ decision: 'approved' })).status).toBe(403);
    expect((await store.get_access_request(issuer, 'applicant'))?.status).toBe('pending');
    expect(await store.get_user(issuer, 'applicant')).toBeNull();
  });

  it('rejects caller-supplied requester identities and tokens from another issuer', async () => {
    const { app, store } = await fixture();
    expect((await request(app).post('/api/access-requests').auth(await token('applicant'), { type: 'bearer' })
      .send({ issuer, subject: 'somebody-else' })).status).toBe(422);
    expect((await request(app).post('/api/access-requests').auth(
      await token('applicant', { iss: 'https://other.example.test/tenant/v2.0' }), { type: 'bearer' },
    )).status).toBe(401);
    expect(await store.get_access_request(issuer, 'applicant')).toBeNull();
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

describe('one-page AI jingles', () => {
  it('quotes without provider calls, renders the generated score with voice for an enabled user, and records verified charges', async () => {
    const root = root_dir();
    const [brief, script] = load_inputs()[0]!;
    const cta = script.split(/(?<=[.!?])\s+/).at(-1)!;
    const hook = `${brief.name}, a tune up for your ride`;
    const lyrics = `${hook}\n${cta}`;
    const direction = vi.fn(async () => ({ name: brief.name, offer: 'tune ups', cta, tone: 'upbeat' }));
    const backend: LyricBackend = {
      preflight: vi.fn(async () => ({ english: true, risky_claims: false, artist_imitation: false })),
      generate: vi.fn(async () => JSON.stringify({ hook, lyrics, syllables_per_line: [12, 15], rhyme_scheme: '--', brand_count: 2, cta })),
      assess: vi.fn(async () => ({ english: true, grounded: true, risky_claims: false })),
      screen: vi.fn(async () => ({ moderation_passed: true, protected_material_detected: false })),
    };
    const compose = vi.fn(async () => test_score);
    const synthesize = vi.fn(async (text: string) => {
      const words = [...text.matchAll(WORD)].map((match, index) => ({
        text: match[0], text_offset: match.index, offset: index / 8, duration: 1 / 8,
      }));
      return { result_id: 'TEST', audio: new Float64Array(words.length * SAMPLE_RATE / 8).fill(0.1), words };
    });
    const renderer = vi.fn(render_brief);
    const { app, store, access_token } = await fixture({
      data_dir: root,
      environ: { ...speech_environment(root, { SPEECH_TOTAL_BUDGET_USD: '2' }), ...lyric_limits, LYRIC_ENABLED: 'true' },
      jingle_direction: direction, lyric_backend: backend, score_composer: { compose },
      render: renderer, speech_factory: () => ({ synthesize }),
    });
    const user = await token('user-b');
    const description = `An upbeat ad for ${brief.name}, with tune ups. End with "${cta}"`;
    const quote = await request(app).get('/api/jingles').auth(user, { type: 'bearer' });
    expect(quote.status).toBe(200);
    expect(quote.body).toEqual({ estimate: { model_and_safety_max_usd: '0.112', speech_max_usd: '0.4', total_max_usd: '0.512' }, unavailable_reason: null, runs: [] });
    expect(direction).not.toHaveBeenCalled();
    const generate = () => request(app).post('/api/jingles').auth(user, { type: 'bearer' }).send({ description });
    const run = await generate();
    expect(run.status, JSON.stringify(run.body)).toBe(200);
    expect(backend.generate).toHaveBeenCalledTimes(1);
    expect(backend.assess).toHaveBeenCalledExactlyOnceWith(
      expect.anything(), expect.objectContaining({ lyrics, syllables_per_line: [12, 16] }),
    );
    expect(backend.screen).toHaveBeenCalledExactlyOnceWith(lyrics);
    expect(compose).toHaveBeenCalledTimes(1);
    expect(synthesize).toHaveBeenCalledExactlyOnceWith(lyrics);
    expect(renderer.mock.calls[0]?.[6]?.composition?.result.tempo_bpm).toBe(test_score.tempo_bpm);
    expect(run.body.outputs.map((output: { variant: string }) => output.variant).sort()).toEqual(['spoken', 'vocoded']);
    expect(run.body.attempt).toMatchObject({
      status: 'awaiting_reconciliation', actual_cost_usd: null, jingle_ai_actual_cost_usd: null, jingle_estimate: quote.body.estimate,
    });
    const pending = await request(app).get('/api/jingles').auth(user, { type: 'bearer' });
    expect(pending.body.estimate).toEqual(quote.body.estimate);
    const other_owner = await request(app).get('/api/jingles').auth(access_token, { type: 'bearer' });
    expect(other_owner.body.runs).toEqual([]);
    const billed = await request(app).post(`/api/attempts/${run.body.attempt.attempt_id}/reconcile`)
      .auth(user, { type: 'bearer' }).send({ actual_cost_usd: '0.0004', ai_actual_cost_usd: '0.003', evidence_reference: 'verified Azure billing' });
    expect(billed.status).toBe(200);
    const history = await request(app).get('/api/jingles').auth(user, { type: 'bearer' });
    expect(history.body.runs).toHaveLength(1);
    expect(history.body.runs[0].attempt).toMatchObject({
      actual_cost_usd: '0.0004', jingle_ai_actual_cost_usd: '0.003',
    });
  });

  it.each(['exhausted', 'refused', 'unknown', 'screened'] as const)('correlates jingle diagnostics for a %s request without retaining content', async scenario => {
    const root = root_dir();
    const [brief, script] = load_inputs()[0]!;
    const cta = script.split(/(?<=[.!?])\s+/).at(-1)!;
    const hook = `${brief.name}, a tune up for your ride`;
    const marker = 'private-test-marker';
    const draft = { hook, lyrics: `${hook}\n${cta}`, syllables_per_line: [12, 16], rhyme_scheme: '--', brand_count: 2, cta };
    const completion = (content: string) => Response.json({ choices: [{ finish_reason: 'stop', message: { content } }] });
    let attempts = 0;
    const send = vi.fn(async (url: string, init: RequestInit) => {
      if (url.includes(':analyze')) return Response.json({
        categoriesAnalysis: ['Hate', 'SelfHarm', 'Sexual', 'Violence'].map(category => ({ category, severity: category === 'Hate' ? 2 : 0 })),
      });
      if (url.includes(':detectProtectedMaterial')) return Response.json({ protectedMaterialAnalysis: { detected: false } });
      const { response_format } = JSON.parse(String(init.body));
      if (response_format.json_schema.name === 'Preflight') {
        return completion(JSON.stringify({ english: true, risky_claims: false, artist_imitation: false }));
      }
      if (response_format.json_schema.name === 'Assessment') {
        return completion(JSON.stringify({ english: true, grounded: true, risky_claims: false }));
      }
      attempts++;
      if (scenario === 'refused') return Response.json({ error: { code: 'content_filter', message: marker } }, { status: 400 });
      if (scenario === 'screened') return completion(JSON.stringify({ ...draft, syllables_per_line: [12, 15] }));
      if (attempts === 1) return Response.json({ error: marker }, { status: 429 });
      if (attempts === 2) return completion(marker);
      return completion(JSON.stringify({ ...draft, cta: marker }));
    });
    const lyric_backend = new AzureLyricBackend({
      foundry_endpoint: 'https://foundry.example.test', safety_endpoint: 'https://safety.example.test', deployment: 'test',
    }, { getToken: async () => ({ token: marker, expiresOnTimestamp: Date.now() + 60000 }) }, send);
    const score = vi.fn();
    const logs = vi.spyOn(console, 'info').mockImplementation(() => {});
    const { app, store, access_token } = await fixture({
      data_dir: root,
      environ: { ...speech_environment(root, { SPEECH_TOTAL_BUDGET_USD: '2' }), ...lyric_limits, LYRIC_ENABLED: 'true' },
      jingle_direction: async () => {
        if (scenario === 'unknown') throw new CloudFailure(marker);
        return { name: brief.name, offer: 'tune ups', cta, tone: 'upbeat' };
      },
      lyric_backend, score_composer: { compose: score },
    });
    const body = { description: `Write a jingle for ${brief.name}, with tune ups. End with "${cta}" ${marker}` };
    const unauthenticated = await request(app).post('/api/jingles').send(body);
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.headers['x-earwyrm-diagnostic-id']).toBeUndefined();
    expect(logs).not.toHaveBeenCalled();

    const result = await request(app).post('/api/jingles').auth(access_token, { type: 'bearer' }).send(body);
    const id = result.headers['x-earwyrm-diagnostic-id'];
    expect(id).toMatch(/^[a-f0-9-]{36}$/);
    expect(result.status).toBe(scenario === 'unknown' ? 503 : 422);
    expect(result.body).toEqual({ detail: scenario === 'unknown'
      ? 'AI generation could not complete. No fallback audio was generated.'
      : 'The lyrics did not pass screening or fit the jingle. Try a short, pronounceable business name and leave the call to action open.' });
    expect(score).not.toHaveBeenCalled();
    const lines = logs.mock.calls.map(([line]) => String(line));
    expect(lines.join('\n')).not.toContain(marker);
    expect(lines.join('\n')).not.toContain(brief.name);
    const events = lines.map(line => JSON.parse(line));
    expect(events.every(event => event.diagnostic_id === id)).toBe(true);
    expect(events.at(-1)).toMatchObject({ event: 'request_finished', http_status: result.status,
      stage: scenario === 'unknown' ? 'brief' : scenario === 'screened' ? 'safety' : 'lyrics' });
    const budget = await request(app).get('/api/admin/budgets').auth(access_token, { type: 'bearer' });
    expect(budget.body.lyric_reservations.length).toBeGreaterThan(0);
    expect(budget.body.lyric_reservations.every((row: { settlement_status: string }) => row.settlement_status === 'pending')).toBe(true);
    expect(budget.body.text.charged_usd).toBe(budget.body.text.lyric_reserved_usd);
    expect(budget.body.text.lyric_actual_usd).toBe('0');
    expect((await store.get_user_budget('user-a')).lyric_reserved_usd).toBe(budget.body.text.lyric_reserved_usd);
    if (scenario === 'unknown') {
      expect(events[0]).toMatchObject({ event: 'request_failed', reason: 'unknown_reason' });
      expect(send).not.toHaveBeenCalled();
    } else if (scenario === 'screened') {
      expect(attempts).toBe(1);
      expect(events).toContainEqual(expect.objectContaining({ event: 'lyric_outcome', step: 'screen', outcome: 'rejected', reasons: ['moderation_rejected'] }));
      expect(events.filter(event => event.stage === 'safety' && event.event === 'provider_http').map(event => event.operation))
        .toEqual(['moderation', 'protected_material']);
    } else if (scenario === 'refused') {
      expect(attempts).toBe(1);
      expect(events).toContainEqual(expect.objectContaining({ event: 'lyric_outcome', outcome: 'rejected', reasons: ['model_refusal'] }));
      expect(events).toContainEqual(expect.objectContaining({ event: 'provider_http', operation: 'generate', http_status: 400, duration_ms: expect.any(Number) }));
    } else {
      expect(attempts).toBe(4);
      expect(events.filter(event => event.event === 'lyric_attempt_failed').map(event => [event.attempt, event.reason]))
        .toEqual([[1, 'cloud_temporarily_unavailable'], [2, 'malformed_lyric_output'], [3, 'cta_placement'], [4, 'cta_placement']]);
      expect(events).toContainEqual(expect.objectContaining({ event: 'lyric_outcome', outcome: 'retry_exhausted', attempts: 4 }));
      expect(events).toContainEqual(expect.objectContaining({ event: 'provider_http', operation: 'generate', http_status: 429, duration_ms: expect.any(Number) }));
    }
  });

  it('does not render a fallback when a score provider fails', async () => {
    const root = root_dir();
    const [brief, script] = load_inputs()[0]!;
    const cta = script.split(/(?<=[.!?])\s+/).at(-1)!;
    const hook = `${brief.name}, a tune up for your ride`;
    const render = vi.fn(fake_render);
    let mark_entered!: () => void;
    let release!: () => void;
    const entered = new Promise<void>(resolve => { mark_entered = resolve; });
    const released = new Promise<void>(resolve => { release = resolve; });
    const { app, access_token, speech_factory } = await fixture({
      data_dir: root,
      environ: { ...speech_environment(root, { SPEECH_TOTAL_BUDGET_USD: '2' }), ...lyric_limits, LYRIC_ENABLED: 'true' },
      jingle_direction: async () => ({ name: brief.name, offer: 'tune ups', cta, tone: 'upbeat' }),
      lyric_backend: {
        preflight: async () => ({ english: true, risky_claims: false, artist_imitation: false }),
        generate: async () => JSON.stringify({ hook, lyrics: `${hook}\n${cta}`, syllables_per_line: [12, 16], rhyme_scheme: '--', brand_count: 2, cta }),
        assess: async () => ({ english: true, grounded: true, risky_claims: false }),
        screen: async () => ({ moderation_passed: true, protected_material_detected: false }),
      },
      score_composer: { compose: async () => {
        mark_entered();
        await released;
        throw new Error('test provider failed');
      } },
      render,
    });
    const id = 'a08940a6-6b20-42b0-98ab-66b98b51e013';
    const progress = `/api/jingles/${id}/progress`;
    const generation = request(app).post('/api/jingles').auth(access_token, { type: 'bearer' })
      .send({ description: `Write an upbeat jingle for ${brief.name}, with tune ups. End with "${cta}"`, progress_id: id })
      .then(response => response);
    try {
      await Promise.race([entered, generation.then(res => { throw new Error(`Score was not reached: ${res.status}`); })]);
      expect((await request(app).get(progress).auth(access_token, { type: 'bearer' })).body).toEqual({ stage: 'score' });
      expect((await request(app).get(progress).auth(await token('user-b'), { type: 'bearer' })).body).toEqual({ stage: null });
      expect((await request(app).get(progress)).status).toBe(401);
    } finally { release(); }
    const result = await generation;
    expect((await request(app).get(progress).auth(access_token, { type: 'bearer' })).body).toEqual({ stage: null });
    expect(result.status).toBe(503);
    expect(render).not.toHaveBeenCalled();
    expect(speech_factory).not.toHaveBeenCalled();
    const history = await request(app).get('/api/jingles').auth(access_token, { type: 'bearer' });
    expect(history.body.runs).toEqual([]);
  });
});

describe('guarded paid score composition', () => {
  const lyric_backend: LyricBackend = {
    preflight: vi.fn(async () => ({ english: true, risky_claims: false, artist_imitation: false })),
    generate: vi.fn(async () => ''),
    assess: vi.fn(async () => ({ english: true, grounded: true, risky_claims: false })),
    screen: vi.fn(async () => ({ moderation_passed: true, protected_material_detected: false })),
  };
  const body_for = (option_id: string) => ({
    brief_ids: ['brief-001'], option_id, confirm_paid_generation: true,
  });

  it('requires consent, an accepted matching option, and shared budget before the provider call', async () => {
    const root = root_dir();
    const score_composer = { compose: vi.fn(async (_input: unknown) => test_score) };
    const environ = { ...lyric_limits, LYRIC_ENABLED: 'true', LYRIC_TOTAL_BUDGET_USD: '0.01' };
    const { app, store, access_token } = await fixture({ data_dir: root, environ, lyric_backend, score_composer });
    const accepted = await save_accepted_lyric_option(store);
    const held = await store.save_lyric_option('user-a', accepted.request, LyricResult.parse({
      status: 'human_review_required', attempts: 1, output: accepted.result.output,
      reasons: ['risky_claims_require_human_review'],
    }));
    const post = (body: object, access = access_token) =>
      request(app).post('/api/score/compose').auth(access, { type: 'bearer' }).send(body);

    expect((await post({ ...body_for(accepted.option_id), confirm_paid_generation: undefined })).status).toBe(422);
    expect((await post(body_for(held.option_id))).status).toBe(409);
    expect((await post({ ...body_for(accepted.option_id), brief_ids: ['brief-002'] })).status).toBe(404);
    expect((await post(body_for(accepted.option_id), await token('user-b'))).status).toBe(409);
    expect(score_composer.compose).not.toHaveBeenCalled();

    const db = new DatabaseSync(store.database_path);
    try {
      db.prepare('INSERT INTO lyric_reservations (reservation_id, action, reserved_usd, created_at) VALUES (?, ?, ?, ?)').run('prior', 'write', '0.01', new Date().toISOString());
    } finally { db.close(); }
    const exhausted = await post(body_for(accepted.option_id));
    expect(exhausted.status).toBe(409);
    expect(exhausted.body.detail).toContain('shared chat, lyrics, and compose budget');
    expect(score_composer.compose).not.toHaveBeenCalled();
    const verify = new DatabaseSync(store.database_path);
    try { expect(verify.prepare('SELECT count(*) AS count FROM score_reservations').get()?.count).toBe(0); }
    finally { verify.close(); }
  });

  it('commits one score, replays the committed result, and charges later text actions to the shared budget', async () => {
    const root = root_dir();
    const score_composer = { compose: vi.fn(async (_input: unknown) => test_score) };
    const chat_advisor = { suggest: vi.fn(async () => ({ reply: 'unused', creative_direction: 'unused' })) };
    const environ = { ...lyric_limits, LYRIC_ENABLED: 'true', LYRIC_TOTAL_BUDGET_USD: '0.01' };
    const { app, store, access_token } = await fixture({ data_dir: root, environ, lyric_backend, score_composer, chat_advisor });
    const option = await save_accepted_lyric_option(store);
    const post = () => request(app).post('/api/score/compose').auth(access_token, { type: 'bearer' }).send(body_for(option.option_id));

    const availability = await request(app).get('/api/lyrics/options').auth(access_token, { type: 'bearer' });
    expect(availability.body).toMatchObject({ available: true, score_compose_max_usd: '0.01' });
    const first = await post();
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body).toMatchObject({ tool: 'compose_score', status: 'committed', score: test_score });
    expect(first.body.run).toMatchObject({ run_id: first.body.job_id, status: 'completed', outputs: [{
      variant: 'instrumental', composition_source: { job_id: first.body.job_id, option_id: option.option_id },
    }] });
    const audio_url = first.body.run.outputs[0].audio_url;
    expect((await request(app).get(audio_url).auth(access_token, { type: 'bearer' })).status).toBe(200);
    expect((await request(app).get(audio_url).auth(await token('user-b'), { type: 'bearer' })).status).toBe(404);
    const retry = await post();
    expect(retry.status).toBe(200);
    expect(retry.body).toEqual(first.body);
    expect(score_composer.compose).toHaveBeenCalledTimes(1);
    expect(score_composer.compose.mock.calls[0]?.[0]).not.toHaveProperty('brief.contact_details');

    const db = new DatabaseSync(store.database_path);
    try {
      expect(db.prepare('SELECT owner, action, logical_job_id, reserved_usd, status FROM score_reservations').get())
        .toMatchObject({ owner: 'user-a', action: 'compose', reserved_usd: '0.01', status: 'committed' });
      expect(db.prepare('SELECT count(*) AS count FROM score_reservations').get()?.count).toBe(1);
    } finally { db.close(); }
    const later_chat = await request(app).post('/api/chat').auth(access_token, { type: 'bearer' }).send({
      action: 'discuss', brief_ids: ['brief-001'], confirm_paid_generation: true,
      messages: [{ role: 'user', content: 'Make it bright' }],
    });
    expect(later_chat.status).toBe(409);
    expect(chat_advisor.suggest).not.toHaveBeenCalled();
  });

  it('blocks concurrent and uncertain retries from resubmitting the provider action', async () => {
    const root = root_dir();
    let release_provider = () => {};
    let mark_started = () => {};
    const provider_gate = new Promise<void>(resolve => { release_provider = resolve; });
    const provider_started = new Promise<void>(resolve => { mark_started = resolve; });
    const score_composer = { compose: vi.fn(async () => {
      mark_started();
      await provider_gate;
      return test_score;
    }) };
    const environ = { ...lyric_limits, LYRIC_ENABLED: 'true' };
    const first = await fixture({ data_dir: root, environ, lyric_backend, score_composer });
    const second = await fixture({ data_dir: root, environ, lyric_backend, score_composer }, false);
    const option = await save_accepted_lyric_option(first.store);
    const send = (target: typeof first) =>
      request(target.app).post('/api/score/compose').auth(target.access_token, { type: 'bearer' }).send(body_for(option.option_id));

    const pending = send(first).then(response => response);
    await provider_started;
    const concurrent = await send(second);
    expect(concurrent.status).toBe(409);
    release_provider();
    const completed = await pending;
    expect(completed.status, JSON.stringify(completed.body)).toBe(200);
    expect((await send(second)).status).toBe(200);
    expect(score_composer.compose).toHaveBeenCalledTimes(1);

    const failing_composer = { compose: vi.fn(async () => { throw new CloudFailure('cloud_transport_failed'); }) };
    const uncertain = await fixture({
      environ, lyric_backend, score_composer: failing_composer,
    });
    const uncertain_option = await save_accepted_lyric_option(uncertain.store);
    const send_uncertain = () => request(uncertain.app).post('/api/score/compose')
      .auth(uncertain.access_token, { type: 'bearer' }).send(body_for(uncertain_option.option_id));
    expect((await send_uncertain()).status).toBe(503);
    const blocked = await send_uncertain();
    expect(blocked.status).toBe(503);
    expect(blocked.body).toMatchObject({ code: 'provider_outcome_unknown', logical_job_id: expect.any(String), retryable: false });
    expect(failing_composer.compose).toHaveBeenCalledTimes(1);
    const uncertain_db = new DatabaseSync(uncertain.store.database_path);
    try {
      expect(uncertain_db.prepare('SELECT status, score_json FROM score_reservations').get())
        .toEqual({ status: 'outcome_unknown', score_json: null });
    } finally { uncertain_db.close(); }
  });

    it.each([{ tempo_bpm: 137, bars: 9 }, { tempo_bpm: 140, bars: 12 }])('uses a fractional-tempo paid preview for exact backing and MIDI continuity through both vocal variants: %j', async parameters => {
      const root = root_dir();
      const score = ArrangementScore.parse({ ...test_score, ...parameters });
      const score_composer = { compose: vi.fn(async () => score) };
      const synthesize = vi.fn(async (text: string) => {
        const words = [...text.matchAll(WORD)].map((match, index) => ({
          text: match[0], text_offset: match.index, offset: index / 8, duration: 1 / 8,
        }));
        return { result_id: 'TEST', audio: new Float64Array(words.length * SAMPLE_RATE / 8).fill(0.1), words };
      });
      const renderer = vi.fn(render_brief);
      const { app, store, access_token } = await fixture({
        data_dir: root,
        environ: { ...speech_environment(root, { SPEECH_TOTAL_BUDGET_USD: '2' }), ...lyric_limits, LYRIC_ENABLED: 'true' },
        lyric_backend, score_composer, render: renderer, speech_factory: () => ({ synthesize }),
      });
      const option = await save_accepted_lyric_option(store);
      const post = (path: string, body: object) =>
        request(app).post(path).auth(access_token, { type: 'bearer' }).send(body);
      const composed = await post('/api/score/compose', body_for(option.option_id));
      expect(composed.status, JSON.stringify(composed.body)).toBe(200);
      const selection = {
        brief_ids: ['brief-001'],
        lyric_selections: [{ brief_id: 'brief-001', option_id: option.option_id }],
        composition_selections: [{ brief_id: 'brief-001', job_id: composed.body.job_id }],
      };
      const estimate = await post('/api/renders/estimate', selection);
      expect(estimate.status, JSON.stringify(estimate.body)).toBe(200);
      const rendered = await post('/api/renders', { ...selection, mode: 'azure', confirmation: estimate.body });
      expect(rendered.status, JSON.stringify(rendered.body)).toBe(200);
      expect(synthesize).toHaveBeenCalledExactlyOnceWith(option.result.output!.lyrics);
      const committed = renderer.mock.calls[0]![6]!.composition!;
      expect(committed.result.tempo_bpm).toBe(parameters.tempo_bpm);
      const melody = new MelodyService(join(root, 'melody'));
      expect(committed.midi).toEqual(await melody.read_artifact(composed.body.job_id, 'score.mid'));
      expect(committed.backing).toEqual(await melody.read_artifact(composed.body.job_id, 'backing.wav'));
      const outputs = await store.list_outputs('user-a');
      const vocals = outputs.filter(row => row.variant === 'spoken' || row.variant === 'vocoded');
      expect(vocals.map(row => row.variant).sort()).toEqual(['spoken', 'vocoded']);
      for (const row of vocals) {
        const wav = readFileSync(await store.audio_path(row));
        expect(wav.readUInt32LE(40)).toBe(Math.round(score.bars * 240 / score.tempo_bpm * SAMPLE_RATE) * 2);
        expect(row.manifest.numeric_gates).toBe('Pass');
        expect(row.manifest.composition_source).toMatchObject({
          job_id: composed.body.job_id, backing_sha256: committed.result.artifacts['backing.wav']!.sha256,
        });
      }
      expect((await post('/api/score/compose', body_for(option.option_id))).body.job_id).toBe(composed.body.job_id);
      expect(score_composer.compose).toHaveBeenCalledTimes(1);
    });

    it('recovers interrupted submitted claims only after stop attestation and fences late result writes', async () => {
      const root = root_dir();
      const score_composer = { compose: vi.fn(async () => test_score) };
      const options = { data_dir: root, environ: { ...lyric_limits, LYRIC_ENABLED: 'true' }, lyric_backend, score_composer };
      const original = await fixture(options);
      const option = await save_accepted_lyric_option(original.store);
      const logical_job_id = `score-${createHash('sha256')
        .update(canonical_json([issuer, 'user-a', option.option_id, 'compose'])).digest('hex')}`;
      const request_sha256 = createHash('sha256')
        .update(canonical_json(score_prompt(option.request, option.result))).digest('hex');
      const reservation = { owner: 'user-a', logical_job_id, request_sha256, cost: '0.01', cap: '1', total: '5' };
      expect((await original.store.claim_score_compose(reservation)).claimed).toBe(true);
      const restarted = await fixture(options, false);
      const post = (path: string, body: object) =>
        request(restarted.app).post(path).auth(restarted.access_token, { type: 'bearer' }).send(body);
      expect((await post('/api/score/compose', body_for(option.option_id))).status).toBe(409);
      const reconciliation = {
        owner: 'user-a', logical_job_id, confirmed_not_accepted: true, evidence_reference: 'TEST-ONLY stopped worker and provider evidence',
      };
      expect((await post('/api/admin/score-reservations/reconcile', reconciliation)).status).toBe(409);
      expect((await post('/api/admin/score-reservations/reconcile', {
        ...reconciliation, confirmed_submission_stopped: true,
      })).status).toBe(200);
      const next = await restarted.store.claim_score_compose(reservation);
      expect(next).toMatchObject({ claimed: true, attempt_count: 2 });
      await expect(original.store.commit_score_compose('user-a', logical_job_id, request_sha256, test_score))
        .rejects.toBeInstanceOf(StorageConflict);
      await expect(original.store.finish_score_compose('user-a', logical_job_id, request_sha256, 'outcome_unknown'))
        .rejects.toBeInstanceOf(StorageConflict);
      await restarted.store.commit_score_compose('user-a', logical_job_id, request_sha256, test_score, { provider: 'injected', deployment: null }, 2);
      expect((await post('/api/score/compose', body_for(option.option_id))).status).toBe(200);
      expect(score_composer.compose).not.toHaveBeenCalled();
    });

    it('covers repriced reconciled attempts without reducing reservations or exceeding the current shared total', async () => {
      const store = new WebStorage(root_dir());
      const reservation = { owner: 'owner', logical_job_id: 'score-price', request_sha256: 'a'.repeat(64), cost: '0.01', cap: '1', total: '1' };
      await store.claim_score_compose(reservation);
      await store.finish_score_compose('owner', reservation.logical_job_id, reservation.request_sha256, 'outcome_unknown');
      await store.reconcile_score_compose('owner', reservation.logical_job_id, 'TEST-ONLY non-acceptance');
      await expect(store.claim_score_compose({ ...reservation, cost: '0.02', total: '0.01' })).rejects.toBeInstanceOf(StorageConflict);
      expect((await store.claim_score_compose({ ...reservation, cost: '0.02', total: '0.02' })).attempt_count).toBe(2);
      await store.finish_score_compose('owner', reservation.logical_job_id, reservation.request_sha256, 'outcome_unknown', 2);
      await store.reconcile_score_compose('owner', reservation.logical_job_id, 'TEST-ONLY second non-acceptance');
      await expect(store.claim_score_compose({ ...reservation, total: '0.019' })).rejects.toBeInstanceOf(StorageConflict);
      expect((await store.claim_score_compose({ ...reservation, cost: '0.005', total: '0.02' })).attempt_count).toBe(3);
      const db = new DatabaseSync(store.database_path);
      try {
        expect(db.prepare('SELECT reserved_usd, attempt_count FROM score_reservations').all())
          .toEqual([{ reserved_usd: '0.02', attempt_count: 3 }]);
      } finally { db.close(); }
    });
  it('replays a committed score after rendering fails without another provider call', async () => {
    const root = root_dir();
    const score_composer = { compose: vi.fn(async () => test_score) };
    const { app, store, access_token } = await fixture({
      data_dir: root, environ: { ...lyric_limits, LYRIC_ENABLED: 'true' }, lyric_backend, score_composer,
    });
    const option = await save_accepted_lyric_option(store);
    const post = () => request(app).post('/api/score/compose')
      .auth(access_token, { type: 'bearer' }).send(body_for(option.option_id));
    const render = vi.spyOn(MelodyService.prototype, 'submit_score')
      .mockRejectedValueOnce(new CompositionUnavailable('test render failure'));

    const failed = await post();
    expect(failed.status).toBe(503);
    expect(failed.body).toMatchObject({ code: 'score_render_unavailable', retryable: true });
    const db = new DatabaseSync(store.database_path);
    try { expect(db.prepare('SELECT status, attempt_count FROM score_reservations').get()).toEqual({ status: 'committed', attempt_count: 1 }); }
    finally { db.close(); }

    vi.spyOn(store, 'save_output').mockRejectedValueOnce(Object.assign(new Error('test publication failure'), { code: 'SQLITE_BUSY' }));
    expect((await post()).status).toBe(503);
    const retried = await Promise.all([post(), post()]);
    expect(retried.map(response => response.status)).toEqual([200, 200]);
    expect(retried[0]!.body.logical_job_id).toBe(failed.body.logical_job_id);
    expect(await store.list_outputs('user-a')).toHaveLength(1);
    expect(score_composer.compose).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledTimes(4);
  });

  it('requires an administrator to reconcile an unknown outcome before retrying', async () => {
    const root = root_dir();
    let attempts = 0;
    const score_composer = { compose: vi.fn(async () => {
      if (attempts++ === 0) throw new CloudFailure('cloud_transport_failed');
      return test_score;
    }) };
    const { app, store, access_token } = await fixture({
      data_dir: root, environ: { ...lyric_limits, LYRIC_ENABLED: 'true' }, lyric_backend, score_composer,
    });
    const option = await save_accepted_lyric_option(store);
    const post = () => request(app).post('/api/score/compose')
      .auth(access_token, { type: 'bearer' }).send(body_for(option.option_id));
    const uncertain = await post();
    expect(uncertain.status).toBe(503);
    const reconciliation = {
      owner: 'user-a', logical_job_id: uncertain.body.logical_job_id,
      confirmed_not_accepted: true, evidence_reference: 'TEST-ONLY provider and billing evidence',
    };
    expect((await request(app).post('/api/admin/score-reservations/reconcile')
      .auth(await token('user-b'), { type: 'bearer' }).send(reconciliation)).status).toBe(403);
    const confirmed = await request(app).post('/api/admin/score-reservations/reconcile')
      .auth(access_token, { type: 'bearer' }).send(reconciliation);
    expect(confirmed.status).toBe(200);
    expect(confirmed.body).toMatchObject({ logical_job_id: uncertain.body.logical_job_id, status: 'confirmed_not_accepted', retryable: true });

    const retried = await post();
    expect(retried.status).toBe(200);
    expect(score_composer.compose).toHaveBeenCalledTimes(2);
    const db = new DatabaseSync(store.database_path);
    try {
      expect(db.prepare('SELECT status, attempt_count FROM score_reservations').get()).toEqual({ status: 'committed', attempt_count: 2 });
      expect(db.prepare('SELECT attempt_number, evidence_reference FROM score_reconciliations').get())
        .toEqual({ attempt_number: 1, evidence_reference: 'TEST-ONLY provider and billing evidence' });
    } finally { db.close(); }
  });

  it('keeps a screened-out committed score from making another provider call', async () => {
    const root = root_dir();
    const score_composer = { compose: vi.fn(async () => test_score) };
    const { app, store, access_token } = await fixture({
      data_dir: root, environ: { ...lyric_limits, LYRIC_ENABLED: 'true' }, lyric_backend, score_composer,
    });
    const option = await save_accepted_lyric_option(store);
    if (!option.result.output) throw new Error('Accepted fixture lyrics are missing');
    const timing = score_lyric_timing(test_score, option.result.output.lyrics.split('\n'), option.request.pronunciations);
    const melodies = compile_score(test_score, timing).melodies;
    const melody = new MelodyService(join(root, 'melody'));
    await melody.init();
    const db = new DatabaseSync(melody.database_path);
    try { db.prepare('INSERT INTO local_outputs VALUES (?, ?)').run('prior-score', JSON.stringify(melodies)); }
    finally { db.close(); }
    const post = () => request(app).post('/api/score/compose')
      .auth(access_token, { type: 'bearer' }).send(body_for(option.option_id));

    const rejected = await post();
    expect(rejected.status).toBe(409);
    expect(rejected.body.detail).toContain('similarity screening');
    expect((await post()).status).toBe(409);
    expect(score_composer.compose).toHaveBeenCalledTimes(1);
    const verify = new DatabaseSync(store.database_path);
    try { expect(verify.prepare('SELECT status, score_json FROM score_reservations').get()?.status).toBe('committed'); }
    finally { verify.close(); }
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
