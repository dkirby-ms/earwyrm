import { decodeProtectedHeader, importJWK, jwtVerify, errors, type JWK, type JWTPayload } from 'jose';
import type { RequestHandler } from 'express';

export const ALGORITHM = 'RS256';
export const REQUIRED_SCOPE_SUFFIXES = [
  'briefs.read', 'renders.read', 'renders.write', 'evaluations.write', 'outputs.read',
] as const;
export const CACHE_SECONDS = 300;

/** Identity configuration or trusted discovery cannot currently be used. */
export class AuthConfigurationError extends Error {}
/** The supplied token does not meet the API access-token contract. */
export class InvalidAccessToken extends Error {}
/** Non-secret settings; authority and discovery must share an HTTPS origin. */
export interface AuthSettingsValues {
  client_id: string;
  authority: string;
  metadata_url: string;
  expected_issuer: string;
  audience: string;
  scope_prefix: string;
}
/** Environment variables are injectable so tests never inherit provider credentials. */
export type Environment = Readonly<Record<string, string | undefined>>;
/** Trusted JSON-document fetchers must reject failures rather than supply stale metadata. */
export type JsonFetcher = (url: string) => Record<string, unknown> | Promise<Record<string, unknown>>;
/** Access-token claims are returned only after signature and required-claim verification. */
export type Claims = JWTPayload;

function https_origin(value: string, field: string): string {
  let url: URL;
  try { url = new URL(value); }
  catch (error) {
    if (!(error instanceof TypeError)) throw error;
    throw new AuthConfigurationError(`${field} is not a valid HTTPS URL`);
  }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.search || url.hash) {
    throw new AuthConfigurationError(`${field} must be an HTTPS URL without user info`);
  }
  return url.origin;
}

/** Reads settings without network access; absent configuration returns null, partial configuration rejects. */
export class AuthSettings implements AuthSettingsValues {
  readonly client_id: string;
  readonly authority: string;
  readonly metadata_url: string;
  readonly expected_issuer: string;
  readonly audience: string;
  readonly scope_prefix: string;

  constructor(values: AuthSettingsValues) {
    this.client_id = values.client_id;
    this.authority = values.authority;
    this.metadata_url = values.metadata_url;
    this.expected_issuer = values.expected_issuer;
    this.audience = values.audience;
    this.scope_prefix = values.scope_prefix;
    if (Object.values(values).some(value => !value.trim())) {
      throw new AuthConfigurationError('External ID configuration is incomplete');
    }
    if (https_origin(this.authority, 'ENTRA_AUTHORITY') !== https_origin(this.metadata_url, 'ENTRA_METADATA_URL')) {
      throw new AuthConfigurationError('External ID authority and metadata origins must match');
    }
    https_origin(this.expected_issuer, 'ENTRA_EXPECTED_ISSUER');
    if (this.scope_prefix.endsWith('/')) throw new AuthConfigurationError('ENTRA_API_SCOPE_PREFIX must not end with a slash');
  }

  /** Does not contact discovery, Azure, or storage. */
  static from_environment(source: Environment = process.env): AuthSettings | null {
    const names = ['ENTRA_CLIENT_ID', 'ENTRA_AUTHORITY', 'ENTRA_METADATA_URL', 'ENTRA_EXPECTED_ISSUER', 'ENTRA_AUDIENCE', 'ENTRA_API_SCOPE_PREFIX'];
    const values = names.map(name => (source[name] ?? '').trim());
    if (!values.some(Boolean)) return null;
    return new AuthSettings({
      client_id: values[0]!, authority: values[1]!, metadata_url: values[2]!,
      expected_issuer: values[3]!, audience: values[4]!, scope_prefix: values[5]!,
    });
  }

  /** Full delegated scopes for the browser; JWT scp claims use their suffixes. */
  get scopes(): Record<string, string> {
    return Object.fromEntries(REQUIRED_SCOPE_SUFFIXES.map(scope => [scope, `${this.scope_prefix}/${scope}`]));
  }
}

function is_record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function fetch_json(url: string): Promise<Record<string, unknown>> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000), redirect: 'manual' });
    if (!response.ok) throw new AuthConfigurationError('External ID metadata is unavailable');
    const payload: unknown = await response.json();
    if (!is_record(payload)) throw new AuthConfigurationError('External ID metadata must be a JSON object');
    return payload;
  } catch (error) {
    if (error instanceof AuthConfigurationError) throw error;
    if (error instanceof TypeError || error instanceof SyntaxError || error instanceof DOMException) {
      throw new AuthConfigurationError('External ID metadata is unavailable');
    }
    throw error;
  }
}

async function signing_key(jwk: JWK): Promise<CryptoKey | null> {
  if (jwk.kty !== 'RSA' || (jwk.alg !== undefined && jwk.alg !== ALGORITHM) ||
      (jwk.use !== undefined && jwk.use !== 'sig') ||
      (jwk.key_ops !== undefined && (!Array.isArray(jwk.key_ops) || !jwk.key_ops.includes('verify'))) ||
      typeof jwk.n !== 'string' || typeof jwk.e !== 'string' || jwk.d !== undefined) return null;
  try {
    const key = await importJWK(jwk, ALGORITHM);
    return key instanceof Uint8Array ? null : key;
  } catch (error) {
    if (error instanceof errors.JOSEError || error instanceof TypeError || error instanceof DOMException) return null;
    throw error;
  }
}

/** Injectable authentication boundary; methods must fail closed and never log token contents. */
export interface AccessTokenValidator {
  preflight(): Promise<void>;
  allowed_identity_origins(): Promise<Set<string>>;
  verify(token: string): Promise<Claims>;
}
/** Fetchers remain lazy; now is monotonic milliseconds and only intended for deterministic cache tests. */
export interface TokenValidatorOptions {
  metadata_fetcher?: JsonFetcher;
  jwks_fetcher?: JsonFetcher;
  now?: () => number;
}

/** Validates tenant-bound RS256 access tokens with five-minute caches and unknown-kid refresh. */
export class TokenValidator implements AccessTokenValidator {
  private metadata_cache?: { at: number; value: Record<string, unknown> };
  private jwks_cache?: { at: number; uri: string; value: JWK[] };
  private metadata_pending?: Promise<Record<string, unknown>>;
  private jwks_pending?: { metadata: Record<string, unknown>; promise: Promise<JWK[]> };
  private readonly metadata_fetcher: JsonFetcher;
  private readonly jwks_fetcher: JsonFetcher;
  private readonly now: () => number;
  constructor(readonly settings: AuthSettings, options: TokenValidatorOptions = {}) {
    this.metadata_fetcher = options.metadata_fetcher ?? fetch_json;
    this.jwks_fetcher = options.jwks_fetcher ?? fetch_json;
    this.now = options.now ?? (() => performance.now());
  }

  /** Fetches and checks discovery and at least one usable public RSA key; rejects unavailable configuration. */
  async preflight(): Promise<void> {
    const keys = await this.load_jwks(await this.load_metadata());
    for (const key of keys) if (await signing_key(key)) return;
    throw new AuthConfigurationError('External ID JWKS has no compatible RSA signing key');
  }

  /** Returns only validated HTTPS discovery origins, suitable for CSP connect/frame allowlists. */
  async allowed_identity_origins(): Promise<Set<string>> {
    const metadata = await this.load_metadata();
    const origins = new Set([https_origin(this.settings.authority, 'ENTRA_AUTHORITY')]);
    for (const field of ['authorization_endpoint', 'token_endpoint', 'end_session_endpoint']) {
      if (typeof metadata[field] === 'string') origins.add(https_origin(metadata[field], field));
    }
    return origins;
  }

  /** Rejects wrong algorithms, ambiguous keys, invalid claims and non-user token kinds; never returns unverified claims. */
  async verify(token: string): Promise<Claims> {
    const metadata = await this.load_metadata();
    let header;
    try { header = decodeProtectedHeader(token); }
    catch (error) {
      if (!(error instanceof errors.JOSEError || error instanceof TypeError)) throw error;
      throw new InvalidAccessToken('Invalid access token');
    }
    if (header.alg !== ALGORITHM || typeof header.kid !== 'string' ||
        (header.typ !== undefined && !['JWT', 'at+jwt'].includes(header.typ))) {
      throw new InvalidAccessToken('Unsupported access-token header');
    }
    let matching = (await this.load_jwks(metadata)).filter(key => key.kid === header.kid);
    if (!matching.length) matching = (await this.load_jwks(metadata, true)).filter(key => key.kid === header.kid);
    if (!matching.length) throw new InvalidAccessToken('Signing key was not found');
    if (matching.length !== 1) throw new AuthConfigurationError('External ID JWKS contains duplicate key IDs');
    const key = await signing_key(matching[0]!);
    if (!key) throw new AuthConfigurationError('External ID signing key is incompatible');
    let claims: Claims;
    try {
      claims = (await jwtVerify(token, key, {
        algorithms: [ALGORITHM], issuer: this.settings.expected_issuer,
        audience: this.settings.audience, requiredClaims: ['iss', 'aud', 'exp', 'sub'],
      })).payload;
    } catch (error) {
      if (!(error instanceof errors.JOSEError || error instanceof TypeError)) throw error;
      throw new InvalidAccessToken('Invalid access token');
    }
    if (typeof claims.sub !== 'string' || !claims.sub || claims.sub !== claims.sub.trim() ||
        claims.sub.length > 1024 || claims.idtyp === 'app') throw new InvalidAccessToken('Invalid access token');
    if (claims.iat !== undefined && (typeof claims.iat !== 'number' || !Number.isFinite(claims.iat) ||
        claims.iat > Date.now() / 1000)) throw new InvalidAccessToken('Invalid access token');
    return claims;
  }

  private async load_metadata(): Promise<Record<string, unknown>> {
    if (this.metadata_cache && this.now() - this.metadata_cache.at < CACHE_SECONDS * 1000) return this.metadata_cache.value;
    if (this.metadata_pending) return this.metadata_pending;
    this.metadata_pending = (async () => {
      const payload = await this.metadata_fetcher(this.settings.metadata_url);
      if (payload.issuer !== this.settings.expected_issuer) throw new AuthConfigurationError('External ID metadata issuer mismatch');
      if (typeof payload.jwks_uri !== 'string') throw new AuthConfigurationError('External ID metadata has no JWKS URI');
      if (https_origin(payload.jwks_uri, 'jwks_uri') !== https_origin(this.settings.authority, 'ENTRA_AUTHORITY')) {
        throw new AuthConfigurationError('External ID JWKS origin mismatch');
      }
      if (!Array.isArray(payload.id_token_signing_alg_values_supported) || !payload.id_token_signing_alg_values_supported.includes(ALGORITHM)) {
        throw new AuthConfigurationError('External ID metadata does not support the configured algorithm');
      }
      for (const field of ['authorization_endpoint', 'token_endpoint', 'end_session_endpoint']) {
        if (payload[field] === undefined || payload[field] === null) continue;
        if (typeof payload[field] !== 'string') throw new AuthConfigurationError(`External ID metadata has an invalid ${field}`);
        https_origin(payload[field], field);
      }
      this.metadata_cache = { at: this.now(), value: { ...payload } };
      this.jwks_cache = undefined;
      return this.metadata_cache.value;
    })();
    try { return await this.metadata_pending; } finally { this.metadata_pending = undefined; }
  }

  private async load_jwks(metadata: Record<string, unknown>, force = false): Promise<JWK[]> {
    const uri = String(metadata.jwks_uri);
    if (!force && this.jwks_cache && this.jwks_cache.uri === uri && this.now() - this.jwks_cache.at < CACHE_SECONDS * 1000) return this.jwks_cache.value;
    if (this.jwks_pending?.metadata === metadata) return this.jwks_pending.promise;
    const pending = { metadata, promise: (async () => {
      const payload = await this.jwks_fetcher(uri);
      if (!Array.isArray(payload.keys) || !payload.keys.every(is_record)) throw new AuthConfigurationError('External ID JWKS has an invalid shape');
      const value: JWK[] = payload.keys.map(key => ({ ...key }));
      if (this.metadata_cache?.value === metadata) this.jwks_cache = { at: this.now(), uri, value };
      return value;
    })() };
    this.jwks_pending = pending;
    try { return await pending.promise; }
    finally { if (this.jwks_pending === pending) this.jwks_pending = undefined; }
  }
}

/** Express delegated-scope guard; verified claims are placed in response.locals.claims. */
export function require_scope(scope_suffix: string): RequestHandler {
  if (!REQUIRED_SCOPE_SUFFIXES.some(scope => scope === scope_suffix)) throw new RangeError(`Unknown API scope: ${scope_suffix}`);
  return async (request, response, next) => {
    const validator: AccessTokenValidator | null = request.app.locals.token_validator;
    if (!validator) { response.status(503).json({ detail: 'External ID authentication is not configured' }); return; }
    const authorization = request.get('authorization') ?? '';
    const separator = authorization.indexOf(' ');
    const scheme = separator < 0 ? authorization : authorization.slice(0, separator);
    const token = separator < 0 ? '' : authorization.slice(separator + 1);
    if (scheme.toLowerCase() !== 'bearer' || !token) {
      response.set('WWW-Authenticate', 'Bearer').status(401).json({ detail: 'Bearer access token required' }); return;
    }
    try {
      const claims = await validator.verify(token);
      if (typeof claims.scp !== 'string' || !claims.scp.split(/\s+/).includes(scope_suffix)) {
        response.status(403).json({ detail: 'Insufficient permissions' }); return;
      }
      response.locals.claims = claims;
      next();
    } catch (error) {
      if (error instanceof AuthConfigurationError) response.status(503).json({ detail: 'External ID authentication is unavailable' });
      else if (error instanceof InvalidAccessToken) response.set('WWW-Authenticate', 'Bearer').status(401).json({ detail: 'Invalid access token' });
      else next(error);
    }
  };
}
