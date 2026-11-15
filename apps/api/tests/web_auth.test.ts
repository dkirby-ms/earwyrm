import { beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { exportJWK, generateKeyPair, SignJWT, type JWK, type JWTPayload } from 'jose';
import {
  AuthConfigurationError, AuthSettings, InvalidAccessToken, TokenValidator, type Environment,
} from '../src/web_auth.js';
import { create_app } from '../src/web_app.js';

const authority = 'https://tenant.example.test/tenant';
const issuer = `${authority}/v2.0`;
const audience = 'api://audio-api';
const environment: Environment = {
  ENTRA_CLIENT_ID: 'test-spa', ENTRA_AUTHORITY: authority, ENTRA_EXPECTED_ISSUER: issuer,
  ENTRA_METADATA_URL: `${issuer}/.well-known/openid-configuration`,
  ENTRA_AUDIENCE: audience, ENTRA_API_SCOPE_PREFIX: audience,
};
const metadata = {
  issuer, jwks_uri: `${authority}/keys`, id_token_signing_alg_values_supported: ['RS256'],
  authorization_endpoint: 'https://login.example.test/authorize',
  token_endpoint: 'https://login.example.test/token',
};
let keys: Awaited<ReturnType<typeof generateKeyPair>>;
let attacker: Awaited<ReturnType<typeof generateKeyPair>>;
let jwk: JWK;
beforeAll(async () => {
  keys = await generateKeyPair('RS256');
  attacker = await generateKeyPair('RS256');
  jwk = { ...await exportJWK(keys.publicKey), kid: 'test-key', alg: 'RS256', use: 'sig' };
});

function validator(options: { metadata?: Record<string, unknown>; keys?: JWK[]; now?: () => number } = {}) {
  const settings = AuthSettings.from_environment(environment)!;
  return new TokenValidator(settings, {
    metadata_fetcher: () => options.metadata ?? metadata,
    jwks_fetcher: () => ({ keys: options.keys ?? [jwk] }), now: options.now,
  });
}
async function token(overrides: JWTPayload = {}, key?: CryptoKey, header: { alg: string; kid?: string; typ?: string } = { alg: 'RS256', kid: 'test-key' }) {
  return new SignJWT({
    iss: issuer, aud: audience, sub: 'user-a', exp: Math.floor(Date.now() / 1000) + 60,
    scp: 'briefs.read renders.read renders.write outputs.read evaluations.write', ...overrides,
  }).setProtectedHeader(header).sign(key ?? keys.privateKey);
}

describe('External ID trust boundary', () => {
  it('is network-free and setup-needed until fully configured', async () => {
    const app = create_app({ environ: {} });
    expect((await request(app).get('/healthz')).body).toEqual({ status: 'ok' });
    expect((await request(app).get('/api/config')).body).toEqual({
      client_id: null, authority: null, scope_prefix: null, setup_status: 'setup-needed',
    });
    expect((await request(app).get('/api/briefs')).status).toBe(503);
    expect((await request(create_app({ environ: { ENTRA_CLIENT_ID: 'partial' } })).get('/api/config')).body.setup_status).toBe('unavailable');
  });

  it.each([
    ['ENTRA_EXPECTED_ISSUER', 'http://issuer.example.test'],
    ['ENTRA_METADATA_URL', 'https://other.example.test/discovery'],
    ['ENTRA_AUTHORITY', 'https://user:password@tenant.example.test'],
    ['ENTRA_API_SCOPE_PREFIX', `${audience}/`],
  ])('rejects invalid %s without contacting metadata', (name, value) => {
    expect(() => AuthSettings.from_environment({ ...environment, [name]: value })).toThrow(AuthConfigurationError);
  });

  it('validates real RSA tokens and separates identity enrollment from application authorization', async () => {
    const app = create_app({ environ: environment, validator: validator() });
    const access_token = await token();
    const identity = await request(app).get('/api/identity').auth(access_token, { type: 'bearer' });
    expect(identity.status).toBe(200);
    expect(identity.body).toEqual({ issuer, subject: 'user-a' });
    expect((await request(app).get('/api/config')).body.setup_status).toBe('ready');
    const missing = await request(app).get('/api/identity');
    expect(missing.status).toBe(401);
    expect(missing.headers['www-authenticate']).toBe('Bearer');
    expect((await request(app).get('/api/identity').set('Authorization', 'Basic opaque')).status).toBe(401);
  });

  it.each([
    { iss: 'https://attacker.example.test' }, { aud: 'wrong-audience' },
    { exp: Math.floor(Date.now() / 1000) - 1 }, { nbf: Math.floor(Date.now() / 1000) + 300 },
    { iat: Math.floor(Date.now() / 1000) + 300 },
    { sub: '' }, { sub: ' user-a' }, { sub: 'x'.repeat(1025) }, { idtyp: 'app' },
  ])('rejects invalid verified claims %#', async overrides => {
    await expect(validator().verify(await token(overrides))).rejects.toBeInstanceOf(InvalidAccessToken);
  });

  it('requires expiry, issuer, audience and subject, and rejects signatures from a different RSA key', async () => {
    for (const field of ['exp', 'iss', 'aud', 'sub']) {
      const claims: JWTPayload = { iss: issuer, aud: audience, sub: 'user-a', exp: Math.floor(Date.now() / 1000) + 60 };
      delete claims[field];
      const signed = await new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).sign(keys.privateKey);
      await expect(validator().verify(signed)).rejects.toBeInstanceOf(InvalidAccessToken);
    }
    await expect(validator().verify(await token({}, attacker.privateKey))).rejects.toBeInstanceOf(InvalidAccessToken);
    const symmetric = await new SignJWT({}).setProtectedHeader({ alg: 'HS256', kid: 'test-key' }).sign(new TextEncoder().encode('test-only-secret-not-real-credential'));
    await expect(validator().verify(symmetric)).rejects.toBeInstanceOf(InvalidAccessToken);
    await expect(validator().verify(await token({}, undefined, { alg: 'RS256' }))).rejects.toBeInstanceOf(InvalidAccessToken);
    await expect(validator().verify('not.a.token')).rejects.toBeInstanceOf(InvalidAccessToken);
  });

  it('rejects ID-token claims and full scope URLs as delegated API permission', async () => {
    const app = create_app({ environ: environment, validator: validator() });
    for (const scp of [undefined, 'renders.read', `${audience}/briefs.read`]) {
      expect((await request(app).get('/api/identity').auth(await token({ scp }), { type: 'bearer' })).status).toBe(403);
    }
    expect((await request(app).get('/api/identity').auth(
      await token({}, undefined, { alg: 'RS256', kid: 'test-key', typ: 'id+jwt' }), { type: 'bearer' },
    )).status).toBe(401);
  });

  it.each([
    { ...metadata, issuer: 'https://attacker.example.test' },
    { ...metadata, jwks_uri: 'http://tenant.example.test/keys' },
    { ...metadata, jwks_uri: 'https://attacker.example.test/keys' },
    { ...metadata, id_token_signing_alg_values_supported: ['ES256'] },
    { ...metadata, authorization_endpoint: 'http://login.example.test' },
    { ...metadata, token_endpoint: 2 },
  ])('fails closed on unusable discovery %#', async discovery => {
    const auth = validator({ metadata: discovery });
    const app = create_app({ environ: environment, validator: auth });
    expect((await request(app).get('/api/config')).body.setup_status).toBe('unavailable');
    expect((await request(app).get('/api/identity').auth(await token(), { type: 'bearer' })).status).toBe(503);
  });

  it('allows a separately configured HTTPS issuer but not an implicit issuer origin substitution', async () => {
    const expected_issuer = 'https://issuer.example.test/tenant/v2.0';
    const settings = new AuthSettings({ ...AuthSettings.from_environment(environment)!, expected_issuer });
    const auth = new TokenValidator(settings, { metadata_fetcher: () => ({ ...metadata, issuer: expected_issuer }), jwks_fetcher: () => ({ keys: [jwk] }) });
    expect((await auth.verify(await token({ iss: expected_issuer }))).iss).toBe(expected_issuer);
    await expect(auth.verify(await token())).rejects.toBeInstanceOf(InvalidAccessToken);
  });

  it('caches metadata and keys, refreshes unknown kids, and never falls back to expired keys after failure', async () => {
    let time = 0;
    let current_keys = [jwk];
    let unavailable = false;
    const fetch_metadata = vi.fn(() => metadata);
    const fetch_jwks = vi.fn(() => {
      if (unavailable) throw new AuthConfigurationError('Metadata unavailable');
      return { keys: current_keys };
    });
    const auth = new TokenValidator(AuthSettings.from_environment(environment)!, {
      metadata_fetcher: fetch_metadata, jwks_fetcher: fetch_jwks, now: () => time,
    });
    await Promise.all([auth.preflight(), auth.preflight()]);
    await auth.verify(await token());
    expect(fetch_metadata).toHaveBeenCalledTimes(1);
    expect(fetch_jwks).toHaveBeenCalledTimes(1);
    current_keys = [{ ...await exportJWK(attacker.publicKey), kid: 'rotated', use: 'sig', alg: 'RS256' }];
    const rotated = await token({}, attacker.privateKey, { alg: 'RS256', kid: 'rotated' });
    await auth.verify(rotated);
    expect(fetch_jwks).toHaveBeenCalledTimes(2);
    await expect(auth.verify(await token({}, undefined, { alg: 'RS256', kid: 'missing' }))).rejects.toBeInstanceOf(InvalidAccessToken);
    time = 300_001;
    unavailable = true;
    await expect(auth.verify(rotated)).rejects.toBeInstanceOf(AuthConfigurationError);
    expect(fetch_metadata).toHaveBeenCalledTimes(2);
  });

  it('does not repopulate a refreshed metadata generation with an older in-flight JWKS response', async () => {
    let time = 0;
    let release!: (value: Record<string, unknown>) => void;
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const old_response = new Promise<Record<string, unknown>>(resolve => { release = resolve; });
    const rotated = { ...await exportJWK(attacker.publicKey), alg: 'RS256', use: 'sig', kid: 'rotated' };
    const jwks_fetcher = vi.fn()
      .mockImplementationOnce(() => { entered(); return old_response; })
      .mockResolvedValue({ keys: [rotated] });
    const auth = new TokenValidator(AuthSettings.from_environment(environment)!, {
      metadata_fetcher: () => metadata, jwks_fetcher, now: () => time,
    });
    const old_preflight = auth.preflight();
    await started;
    time = 300_001;
    const new_preflight = auth.preflight();
    try {
      await new Promise<void>(resolve => setImmediate(resolve));
      expect(jwks_fetcher).toHaveBeenCalledTimes(2);
    } finally { release({ keys: [jwk] }); }
    await Promise.all([old_preflight, new_preflight]);
    await auth.verify(await token({}, attacker.privateKey, { alg: 'RS256', kid: 'rotated' }));
    expect(jwks_fetcher).toHaveBeenCalledTimes(2);
  });

  it('refuses ambiguous key IDs, encryption keys, malformed RSA and keysets without a compatible signer', async () => {
    await expect(validator({ keys: [jwk, jwk] }).verify(await token())).rejects.toBeInstanceOf(AuthConfigurationError);
    for (const unusable of [[], [{ ...jwk, use: 'enc' }], [{ ...jwk, alg: 'RS512' }], [{ ...jwk, key_ops: ['encrypt'] }], [{ kid: 'test-key', kty: 'RSA' }]]) {
      await expect(validator({ keys: unusable }).preflight()).rejects.toBeInstanceOf(AuthConfigurationError);
    }
    const auth = new TokenValidator(AuthSettings.from_environment(environment)!, { metadata_fetcher: () => metadata, jwks_fetcher: () => ({ keys: 'invalid' }) });
    await expect(auth.preflight()).rejects.toBeInstanceOf(AuthConfigurationError);
  });

  it('uses a five-second timeout and refuses discovery redirects', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 302, headers: { Location: 'https://attacker.example.test' } }));
    try {
      const auth = new TokenValidator(AuthSettings.from_environment(environment)!);
      await expect(auth.preflight()).rejects.toBeInstanceOf(AuthConfigurationError);
      expect(fetcher).toHaveBeenCalledWith(environment.ENTRA_METADATA_URL, { redirect: 'manual', signal: expect.any(AbortSignal) });
      fetcher.mockRejectedValue(new DOMException('timeout', 'TimeoutError'));
      await expect(auth.preflight()).rejects.toBeInstanceOf(AuthConfigurationError);
    } finally { fetcher.mockRestore(); }
  });

  it('keeps CSP origin-scoped and cache-disabled for protected JSON and auth callback', async () => {
    const app = create_app({ environ: environment, validator: validator() });
    const config = await request(app).get('/api/config');
    expect(config.headers['cache-control']).toBe('private, no-store');
    expect(config.headers['content-security-policy']).toContain("connect-src 'self' https://login.example.test https://tenant.example.test");
    expect(config.headers['content-security-policy']).toContain("media-src 'self' blob:");
    expect(config.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    const callback = await request(app).get('/auth-callback.html');
    expect(callback.headers['cache-control']).toBe('private, no-store');
    expect(callback.headers['content-security-policy']).toContain("frame-ancestors 'self'");
    expect(callback.headers['cross-origin-opener-policy']).toBeUndefined();
  });
});
