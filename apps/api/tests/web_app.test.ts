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
import { render_brief } from '../src/render.js';

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

describe('same-origin Express API', () => {
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
    expect(duration).toBeGreaterThanOrEqual(29.5);
    expect(duration).toBeLessThanOrEqual(30);
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

describe('guarded paid Speech ledger with fictional local provider', () => {
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
