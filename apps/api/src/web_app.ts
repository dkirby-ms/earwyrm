import express, { type ErrorRequestHandler, type Express, type RequestHandler, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, realpath, rm, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Decimal } from 'decimal.js';
import { z } from 'zod';
import {
  FIXTURES, REPOSITORY_ROOT, cost_for, load_evidence, load_inputs, render_brief,
  type SpeechEvidence,
} from './render.js';
import { database_url_from_environment, is_storage_error, StoreNotInitialized, validate_postgres_store } from './persistence.js';
import { AzureSpeech, type SpeechProvider } from './speech.js';
import {
  AuthConfigurationError, AuthSettings, TokenValidator, require_scope,
  type AccessTokenValidator, type Claims, type Environment, type JsonFetcher,
} from './web_auth.js';
import {
  STATIC_ROOT, StorageAccessDenied, StorageConflict, StorageNotFound, WebStorage,
  type OutputRecord, type RunRecord,
} from './web_storage.js';

export { REPOSITORY_ROOT };
export const EXPECTED_ANSWERS = join(FIXTURES, 'expected-brand-cta.json');
export const ACCEPTED_RATING = 'usable with minor edits';
export const ALLOWED_RATINGS = new Set([ACCEPTED_RATING, 'usable with major edits', 'not usable']);
export const EVIDENCE_FIELDS = [
  'tier', 'region', 'resource_reference', 'usd_per_million_characters',
  'rate_source', 'rate_checked_on', 'commercial_use_basis',
] as const;

/** Bounded canonical brief IDs; duplicate and unknown IDs are rejected against the fixtures. */
export const BriefSelection = z.object({ brief_ids: z.array(z.string()).min(1).max(3) });
export type BriefSelection = z.infer<typeof BriefSelection>;
/** Must match canonical server ordering and the exact decimal estimate, not browser arithmetic. */
export const RenderConfirmation = BriefSelection.extend({ estimated_cost_usd: z.string().min(1).max(64) });
export type RenderConfirmation = z.infer<typeof RenderConfirmation>;
/** Offline renders reject paid confirmations; Azure remains disabled unless all server gates pass. */
export const RenderRequest = BriefSelection.extend({
  mode: z.enum(['instrumental', 'azure']), confirmation: RenderConfirmation.nullable().optional(),
});
export type RenderRequest = z.infer<typeof RenderRequest>;
/** First-submission-only participant evidence; expected answers are never returned. */
export const EvaluationSubmission = z.object({
  brand_transcription: z.string().max(1000), cta_transcription: z.string().max(2000),
  self_rating: z.string().min(1).max(64),
});
export type EvaluationSubmission = z.infer<typeof EvaluationSubmission>;
/** Operator billing evidence, never inferred from estimated characters. */
export const ReconciliationSubmission = z.object({
  actual_cost_usd: z.string().min(1).max(64), evidence_reference: z.string().min(1).max(500),
});
export type ReconciliationSubmission = z.infer<typeof ReconciliationSubmission>;
/** Exact issuer/subject identities and strict booleans; provider roles are not application entitlements. */
export const UserAccessSubmission = z.object({
  issuer: z.string().min(1).max(1024), subject: z.string().min(1).max(1024),
  enabled: z.boolean(), admin: z.boolean(), paid_speech: z.boolean(),
});
export type UserAccessSubmission = z.infer<typeof UserAccessSubmission>;

/** Paid calls have not been explicitly enabled. */
export class PaidRenderingDisabled extends Error {}
/** Non-secret resource, budget or credential prerequisites are unusable. */
export class PaidConfigurationError extends Error {}
/** The current application identity lacks paid-speech entitlement. */
export class PaidSubjectDenied extends Error {}

class HttpError extends Error {
  constructor(readonly status: number, readonly detail: unknown) { super(typeof detail === 'string' ? detail : 'Request failed'); }
}

function expand_path(value: string): string {
  return resolve(REPOSITORY_ROOT, value === '~' ? homedir() : value.startsWith('~/') ? join(homedir(), value.slice(2)) : value);
}

function decimal(value: string, detail = 'Invalid metered cost'): Decimal {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())) throw new HttpError(422, detail);
  const parsed = new Decimal(value.trim());
  if (!parsed.isFinite() || parsed.lt(0)) throw new HttpError(422, detail);
  return parsed;
}

function positive_decimal(source: Environment, name: string): Decimal {
  try {
    const value = decimal(source[name] ?? '');
    if (value.lte(0)) throw new PaidConfigurationError('Speech budget settings are invalid');
    return value;
  } catch (error) {
    if (error instanceof HttpError) throw new PaidConfigurationError('Speech budget settings are invalid');
    throw error;
  }
}

function paid_settings(source: Environment, entitled: boolean): [SpeechEvidence, Decimal, Decimal] {
  const enabled = (source.SPEECH_ENABLED ?? 'false').trim().toLowerCase();
  if (enabled === '' || enabled === 'false') throw new PaidRenderingDisabled('Paid Speech rendering is disabled');
  if (enabled !== 'true') throw new PaidConfigurationError('Speech enablement setting is invalid');
  if (!entitled) throw new PaidSubjectDenied('Paid Speech access is not enabled');
  if (!source.SPEECH_KEY?.trim() || !source.SPEECH_REGION?.trim()) throw new PaidConfigurationError('Speech credentials are missing');
  let evidence: SpeechEvidence;
  try {
    evidence = load_evidence(expand_path(source.SPEECH_EVIDENCE_PATH ?? 'renders/speech-evidence.json'));
  } catch (error) {
    if (error instanceof Error && (error instanceof SyntaxError || error instanceof z.ZodError ||
        error.message.startsWith('[DecimalError]') || /Rate evidence|Supply a finite/.test(error.message) ||
        is_storage_error(error))) {
      throw new PaidConfigurationError('Speech rate and resource evidence is invalid');
    }
    throw error;
  }
  const resource = evidence.resource_reference.trim().toLowerCase();
  if (/^(your |replace |<)/.test(resource) || resource.includes('placeholder') || evidence.region !== source.SPEECH_REGION.trim()) {
    throw new PaidConfigurationError('Speech resource evidence is not usable');
  }
  const sanitized = Object.fromEntries(EVIDENCE_FIELDS.map(field => [field, evidence[field] ?? null])) as SpeechEvidence;
  return [sanitized, positive_decimal(source, 'SPEECH_PER_RUN_CAP_USD'), positive_decimal(source, 'SPEECH_TOTAL_BUDGET_USD')];
}

function selected_inputs(requested_ids: string[]) {
  if (new Set(requested_ids).size !== requested_ids.length) throw new HttpError(422, 'Brief IDs must be unique');
  const selected = load_inputs().map(([brief, text], index) => ({ index, brief, text }))
    .filter(({ brief }) => requested_ids.includes(brief.brief_id));
  if (selected.length !== requested_ids.length) throw new HttpError(422, 'Unknown brief ID');
  return selected;
}

function identity(response: Response): { issuer: string; subject: string } {
  const claims: Claims = response.locals.claims;
  if (typeof claims?.iss !== 'string' || !claims.iss.trim() || typeof claims.sub !== 'string' || !claims.sub.trim()) {
    throw new HttpError(401, 'Invalid access token');
  }
  return { issuer: claims.iss, subject: claims.sub };
}

function actual_request_cost(output: OutputRecord): Decimal | null {
  const attempt = output.attempt;
  if (!attempt) return output.manifest.azure_usage?.submitted_characters === 0 ? new Decimal(0) : null;
  if (attempt.status !== 'reconciled' || attempt.actual_cost_usd === null) return null;
  const total = new Decimal(attempt.estimated_cost_usd);
  if (total.lte(0)) return null;
  return new Decimal(attempt.actual_cost_usd).mul(attempt.per_brief_estimates[output.brief_id]!).div(total);
}

function output_status(output: OutputRecord): 'Pass' | 'Pending' | 'Fail' {
  const { manifest, evaluation } = output;
  if (manifest.status === 'Fail' || manifest.numeric_gates === 'Fail') return 'Fail';
  const cost = actual_request_cost(output);
  if (cost?.gte('0.50')) return 'Fail';
  if (!evaluation) return 'Pending';
  if (!evaluation.brand_match || !evaluation.cta_match || evaluation.self_rating !== ACCEPTED_RATING) return 'Fail';
  if (manifest.numeric_gates !== 'Pass') return 'Pending';
  const components = manifest.components;
  if (!Array.isArray(components) || !components.length || components.some((item: unknown) =>
    typeof item !== 'object' || item === null || !('status' in item) || item.status !== 'Pass')) return 'Pending';
  if (!cost) return 'Pending';
  return cost.div(2).gte('0.50') ? 'Fail' : 'Pass';
}

function public_output(output: OutputRecord) {
  const manifest = output.manifest;
  return {
    output_id: output.output_id, run_id: output.run_id, brief_id: output.brief_id, variant: output.variant,
    duration_seconds: manifest.duration_seconds, render_seconds: manifest.render_seconds,
    numeric_gates: manifest.numeric_gates, components: manifest.components, azure_usage: manifest.azure_usage,
    evaluation: output.evaluation, status: output_status(output),
    audio_url: `/api/outputs/${output.output_id}/audio`, evidence_url: `/api/outputs/${output.output_id}/evidence`,
  };
}

function public_run(run: RunRecord) { return { ...run, outputs: run.outputs.map(public_output) }; }
function aggregate_status(statuses: string[]): 'Pass' | 'Fail' | 'Pending' {
  return statuses.includes('Fail') ? 'Fail' : !statuses.length || statuses.some(status => status !== 'Pass') ? 'Pending' : 'Pass';
}

const ExpectedAnswer = z.object({
  brief_id: z.string(), expected_brand: z.string(), expected_cta: z.string(), accepted_cta_variants: z.array(z.string()),
});
function expected_answers() {
  try { return z.array(ExpectedAnswer).parse(JSON.parse(readFileSync(EXPECTED_ANSWERS, 'utf8')) as unknown); }
  catch (error) {
    if (is_storage_error(error) || error instanceof SyntaxError || error instanceof z.ZodError) throw new HttpError(503, 'Evaluation data is unavailable');
    throw error;
  }
}
function normalize_answer(value: string): string { return value.trim().toLowerCase().replaceAll('ß', 'ss').replaceAll('ς', 'σ'); }

/** Async storage surface accepted by the HTTP layer; injected stores retain the same owner checks. */
export type WebAppStorage = Pick<WebStorage,
  'root' | 'work_dir' | 'database_url' | 'get_user' | 'list_users_as_admin' | 'set_user_as_admin' |
  'has_unreconciled_paid_attempt' | 'create_run' | 'reserve_paid_run' | 'mark_attempt_submitted' |
  'save_output' | 'set_run_status' | 'finish_attempt' | 'get_run' | 'list_runs' | 'list_outputs' |
  'get_output' | 'audio_path' | 'save_evaluation' | 'reconcile_attempt'>;
/** All providers, persistence and identity fetchers remain lazy until a route needs them. */
export interface CreateAppOptions {
  environ?: Environment;
  data_dir?: string;
  settings?: AuthSettings | null;
  validator?: AccessTokenValidator | null;
  storage?: WebAppStorage;
  metadata_fetcher?: JsonFetcher;
  jwks_fetcher?: JsonFetcher;
  speech_factory?: () => SpeechProvider | Promise<SpeechProvider>;
  speech_provider_factory?: () => SpeechProvider | Promise<SpeechProvider>;
  render?: typeof render_brief;
}

/** Creates the same-origin API without listening, initializing databases, constructing Speech or making paid calls. */
export function create_app(options: CreateAppOptions = {}): Express {
  const source = options.environ ?? process.env;
  let settings: AuthSettings | null = null;
  let setup_status = 'setup-needed';
  try {
    settings = options.settings === undefined ? AuthSettings.from_environment(source) : options.settings;
    setup_status = settings ? 'configured' : 'setup-needed';
  } catch (error) {
    if (!(error instanceof AuthConfigurationError)) throw error;
    setup_status = 'unavailable';
  }
  const app = express();
  app.disable('x-powered-by');
  app.disable('etag');
  app.enable('strict routing');
  app.enable('case sensitive routing');
  app.locals.token_validator = options.validator === undefined
    ? settings ? new TokenValidator(settings, options) : null : options.validator;
  app.locals.setup_status = setup_status;
  app.locals.data_dir = expand_path(options.data_dir ?? source.EARWYRM_DATA_DIR ?? '.earwyrm-data');
  app.locals.database_url = database_url_from_environment(source);
  app.locals.storage = options.storage ?? null;
  let storage_pending: Promise<WebAppStorage> | undefined;
  let render_active = false;
  const render = options.render ?? render_brief;
  const speech_factory = options.speech_factory ?? options.speech_provider_factory ?? (() => new AzureSpeech());

  async function storage(): Promise<WebAppStorage> {
    if (app.locals.storage) return app.locals.storage as WebAppStorage;
    storage_pending ??= (async () => {
      if (app.locals.database_url !== null) await validate_postgres_store(app.locals.database_url as string);
      const store = new WebStorage(app.locals.data_dir as string, { database_url: app.locals.database_url as string | null });
      await store.init();
      app.locals.storage = store;
      return store;
    })();
    try { return await storage_pending; }
    finally { storage_pending = undefined; }
  }
  const authorized = (scope: string): RequestHandler[] => [require_scope(scope), async (_request, response, next) => {
    const { issuer, subject } = identity(response);
    const user = await (await storage()).get_user(issuer, subject);
    if (!user?.enabled) throw new HttpError(403, 'Application access denied');
    next();
  }];
  async function paid_configuration(response: Response): Promise<[SpeechEvidence, Decimal, Decimal]> {
    const { issuer, subject } = identity(response);
    const user = await (await storage()).get_user(issuer, subject);
    try { return paid_settings(source, Boolean(user?.enabled && user.paid_speech)); }
    catch (error) {
      if (error instanceof PaidRenderingDisabled) throw new HttpError(409, error.message);
      if (error instanceof PaidSubjectDenied) throw new HttpError(403, error.message);
      if (error instanceof PaidConfigurationError) throw new HttpError(503, 'Paid Speech rendering is unavailable');
      throw error;
    }
  }
  const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
    const result = schema.safeParse(value);
    if (!result.success) throw new HttpError(422, result.error.issues.map(issue => ({
      type: issue.code, loc: ['body', ...issue.path], msg: issue.message,
    })));
    return result.data;
  };

  app.use(async (request, response, next) => {
    const callback = request.path === '/auth-callback.html';
    if (request.path.startsWith('/api/') || callback) response.set('Cache-Control', 'private, no-store');
    const validator: AccessTokenValidator | null = app.locals.token_validator;
    let origins = new Set<string>();
    if (validator) {
      try { origins = await validator.allowed_identity_origins(); }
      catch (error) { if (!(error instanceof AuthConfigurationError)) throw error; }
    }
    const trusted = ["'self'", ...[...origins].sort()].join(' ');
    response.set('Content-Security-Policy', [
      "default-src 'self'", "script-src 'self'", "style-src 'self'", "img-src 'self' data:",
      "media-src 'self' blob:", `connect-src ${trusted}`, `frame-src ${trusted}`, "object-src 'none'",
      "base-uri 'self'", `frame-ancestors ${callback ? "'self'" : "'none'"}`, "form-action 'self'",
    ].join('; '));
    next();
  });
  app.use(express.json({ limit: '32kb' }));
  const methods: Array<[RegExp, string[]]> = [
    [/^\/(?:healthz|api\/(?:config|identity|access|briefs|render-options|outputs|poc\/status))$/, ['GET']],
    [/^\/api\/admin\/users$/, ['GET', 'PUT']],
    [/^\/api\/renders$/, ['GET', 'POST']],
    [/^\/api\/renders\/estimate$/, ['POST']],
    [/^\/api\/renders\/[^/]+$/, ['GET']],
    [/^\/api\/outputs\/[^/]+\/(?:audio|evidence)$/, ['GET']],
    [/^\/api\/outputs\/[^/]+\/evaluation$/, ['POST']],
    [/^\/api\/attempts\/[^/]+\/reconcile$/, ['POST']],
  ];
  app.use((request, response, next) => {
    const canonical = request.path.endsWith('/') ? request.path.slice(0, -1) : request.path;
    const matching = methods.filter(([pattern]) => pattern.test(canonical));
    const allowed = matching[0]?.[1];
    if (!allowed) { next(); return; }
    if (canonical !== request.path) {
      response.redirect(307, canonical + request.url.slice(request.path.length)); return;
    }
    if (!matching.some(([, verbs]) => verbs.includes(request.method))) {
      response.set('Allow', allowed.join(', ')).status(405).json({ detail: 'Method Not Allowed' }); return;
    }
    next();
  });

  app.get('/healthz', (_request, response) => { response.json({ status: 'ok' }); });
  app.get('/api/config', async (_request, response) => {
    const validator: AccessTokenValidator | null = app.locals.token_validator;
    let status: string = app.locals.setup_status;
    if (validator) {
      try { await validator.preflight(); status = 'ready'; }
      catch (error) { if (!(error instanceof AuthConfigurationError)) throw error; status = 'unavailable'; }
    }
    response.json({
      client_id: source.ENTRA_CLIENT_ID || settings?.client_id || null,
      authority: source.ENTRA_AUTHORITY || settings?.authority || null,
      scope_prefix: source.ENTRA_API_SCOPE_PREFIX || settings?.scope_prefix || null, setup_status: status,
    });
  });
  app.get('/api/identity', require_scope('briefs.read'), (_request, response) => { response.json(identity(response)); });
  app.get('/api/access', ...authorized('briefs.read'), async (_request, response) => {
    const { issuer, subject } = identity(response);
    const user = await (await storage()).get_user(issuer, subject);
    if (!user?.enabled) throw new HttpError(403, 'Application access denied');
    response.json({ issuer: user.issuer, subject: user.subject, admin: Boolean(user.admin), paid_speech: Boolean(user.paid_speech) });
  });
  app.get('/api/admin/users', ...authorized('renders.read'), async (_request, response) => {
    const { issuer, subject } = identity(response);
    const users = await (await storage()).list_users_as_admin(issuer, subject);
    response.json({ users: users.map(user => ({
      issuer: user.issuer, subject: user.subject, enabled: Boolean(user.enabled), admin: Boolean(user.admin), paid_speech: Boolean(user.paid_speech),
    })) });
  });
  app.put('/api/admin/users', ...authorized('renders.write'), async (request, response) => {
    const payload = parse(UserAccessSubmission, request.body);
    const { issuer, subject } = identity(response);
    try { await (await storage()).set_user_as_admin(issuer, subject, payload.issuer, payload.subject, payload); }
    catch (error) { if (error instanceof TypeError || error instanceof RangeError) throw new HttpError(422, error.message); throw error; }
    response.json({ status: 'updated' });
  });
  app.get('/api/briefs', ...authorized('briefs.read'), (_request, response) => { response.json(load_inputs().map(([brief]) => brief)); });
  app.get('/api/render-options', ...authorized('renders.read'), async (_request, response) => {
    const enabled = (source.SPEECH_ENABLED ?? 'false').trim().toLowerCase();
    let speech_status = 'unavailable';
    if (!enabled || enabled === 'false') speech_status = 'disabled';
    else if (enabled === 'true') {
      try { await paid_configuration(response); speech_status = await (await storage()).has_unreconciled_paid_attempt() ? 'busy' : 'available'; }
      catch (error) { if (!(error instanceof HttpError && [403, 503].includes(error.status))) throw error; }
    }
    response.json({ instrumental_available: true, speech_status });
  });
  app.post('/api/renders/estimate', ...authorized('renders.write'), async (request, response) => {
    const selected = selected_inputs(parse(BriefSelection, request.body).brief_ids);
    const [evidence, cap] = await paid_configuration(response);
    const estimate = selected.reduce((total, { text }) => total.add(cost_for(text, evidence)), new Decimal(0));
    if (estimate.gt(cap)) throw new HttpError(409, 'Per-run Speech cap exceeded');
    response.json({ brief_ids: selected.map(({ brief }) => brief.brief_id), estimated_cost_usd: estimate.toString() });
  });
  app.post('/api/renders', ...authorized('renders.write'), async (request, response) => {
    const payload = parse(RenderRequest, request.body);
    const selected = selected_inputs(payload.brief_ids);
    const brief_ids = selected.map(({ brief }) => brief.brief_id);
    const { issuer, subject: owner } = identity(response);
    const store = await storage();
    const run_id = randomUUID();
    let attempt_id: string | null = null;
    let evidence: SpeechEvidence | null = null;
    let temporary: string | undefined;
    // The in-process guard also prevents concurrent offline composition/history mutation.
    if (render_active) throw new HttpError(409, payload.mode === 'azure' ? 'A paid render is already active' : 'A render is already active');
    if (payload.mode === 'instrumental' && payload.confirmation != null) {
      throw new HttpError(422, 'Offline rendering does not accept a paid confirmation');
    }
    let reservation: Parameters<WebStorage['reserve_paid_run']>[0] | undefined;
    if (payload.mode === 'azure') {
      const [paid_evidence, cap, budget] = await paid_configuration(response);
      evidence = paid_evidence;
      const per_brief = Object.fromEntries(selected.map(({ brief, text }) => [brief.brief_id, cost_for(text, paid_evidence).toString()]));
      const estimate = Object.values(per_brief).reduce((total, value) => total.add(value), new Decimal(0));
      if (estimate.gt(cap)) throw new HttpError(409, 'Per-run Speech cap exceeded');
      if (!payload.confirmation) throw new HttpError(409, 'Explicit Speech confirmation is required');
      if (JSON.stringify(payload.confirmation.brief_ids) !== JSON.stringify(brief_ids)) throw new HttpError(409, 'Speech confirmation does not match briefs');
      if (!decimal(payload.confirmation.estimated_cost_usd).eq(estimate)) throw new HttpError(409, 'Speech confirmation does not match the server estimate');
      reservation = {
        run_id, attempt_id: randomUUID(), owner, brief_ids, per_brief_estimates: per_brief,
        estimated_cost_usd: estimate, submitted_characters: selected.reduce((sum, { text }) => sum + text.length, 0),
        total_budget_usd: budget, evidence, issuer,
      };
    }
    // Recheck after asynchronous entitlement validation, then set before the next await.
    if (render_active) throw new HttpError(409, 'A paid render is already active');
    render_active = true;
    try {
      if (reservation) { await store.reserve_paid_run(reservation); attempt_id = reservation.attempt_id; }
      else await store.create_run(run_id, owner, 'instrumental', brief_ids);
      try {
        temporary = await mkdtemp(join(store.work_dir, 'render-'));
        let provider: SpeechProvider | null = null;
        if (attempt_id) { await store.mark_attempt_submitted(attempt_id); provider = await speech_factory(); }
        for (const { index, brief, text } of selected) {
          const directory = join(temporary, brief.brief_id);
          const rows = await render(directory, brief, text, index, provider, evidence, {
            history_dir: join(store.root, 'melody'), database_url: store.database_url,
          });
          for (const row of rows) {
            if (typeof row.file !== 'string' || isAbsolute(row.file) || row.file.includes('/') || row.file.includes('\\')) {
              throw new TypeError('Render audio filename is invalid');
            }
            await store.save_output({ run_id, owner, manifest: row, audio: await readFile(join(directory, row.file)), attempt_id });
          }
        }
        await store.set_run_status(run_id, 'completed');
        if (attempt_id) await store.finish_attempt(attempt_id, 'awaiting_reconciliation');
      } catch (error) {
        if (!(error instanceof Error)) throw error;
        // Provider diagnostics may contain credentials; only stable API errors leave this boundary.
        await store.set_run_status(run_id, 'failed_or_unknown');
        if (attempt_id) {
          await store.finish_attempt(attempt_id, 'failed_or_unknown');
          throw new HttpError(502, { message: 'Speech render failed or has unknown usage', attempt_id, status: 'failed_or_unknown' });
        }
        throw new HttpError(500, 'Offline render failed');
      }
    } finally {
      try { if (temporary) await rm(temporary, { recursive: true, force: true }); }
      finally { render_active = false; }
    }
    const result = await store.get_run(run_id, owner);
    if (!result) throw new HttpError(500, 'Render record is unavailable');
    response.json(public_run(result));
  });
  app.get('/api/renders/:run_id', ...authorized('renders.read'), async (request, response) => {
    const run = await (await storage()).get_run(String(request.params.run_id), identity(response).subject);
    if (!run) throw new HttpError(404, 'Render run was not found');
    response.json(public_run(run));
  });
  app.get('/api/renders', ...authorized('renders.read'), async (_request, response) => {
    response.json({ runs: (await (await storage()).list_runs(identity(response).subject)).map(public_run) });
  });
  app.get('/api/outputs', ...authorized('renders.read'), async (_request, response) => {
    response.json({ outputs: (await (await storage()).list_outputs(identity(response).subject)).map(public_output) });
  });
  app.get('/api/poc/status', ...authorized('renders.read'), async (_request, response) => {
    const outputs = await (await storage()).list_outputs(identity(response).subject);
    const briefs = load_inputs().map(([brief]) => {
      const rows = outputs.filter(row => row.brief_id === brief.brief_id);
      return { brief_id: brief.brief_id, status: aggregate_status(rows.map(output_status)), outputs: rows.map(public_output) };
    });
    response.json({ status: aggregate_status(briefs.map(brief => brief.status)), briefs });
  });
  app.get('/api/outputs/:output_id/audio', ...authorized('outputs.read'), async (request, response, next) => {
    const store = await storage();
    const output = await store.get_output(String(request.params.output_id), identity(response).subject);
    if (!output) throw new HttpError(404, 'Output was not found');
    const path = await store.audio_path(output);
    try { if (!(await stat(path)).isFile()) throw new HttpError(404, 'Output audio was not found'); }
    catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') throw new HttpError(404, 'Output audio was not found');
      throw error;
    }
    response.type('audio/wav').set('Content-Disposition', `attachment; filename="${output.output_id}.wav"`);
    response.sendFile(path, { cacheControl: false, dotfiles: 'allow' }, error => {
      if (!error) return;
      if ('statusCode' in error && error.statusCode === 404) next(new HttpError(404, 'Output audio was not found'));
      else next(error);
    });
  });
  app.get('/api/outputs/:output_id/evidence', ...authorized('outputs.read'), async (request, response) => {
    const output = await (await storage()).get_output(String(request.params.output_id), identity(response).subject);
    if (!output) throw new HttpError(404, 'Output was not found');
    const attempt = output.attempt;
    response.json({
      output_id: output.output_id, status: output_status(output), manifest: output.manifest, evaluation: output.evaluation,
      attempt: attempt ? {
        attempt_id: attempt.attempt_id, status: attempt.status, estimated_cost_usd: attempt.estimated_cost_usd,
        actual_cost_usd: attempt.actual_cost_usd, reconciliation_reference: attempt.reconciliation_reference, evidence: attempt.evidence,
      } : null,
    });
  });
  app.post('/api/outputs/:output_id/evaluation', ...authorized('evaluations.write'), async (request, response) => {
    const submission = parse(EvaluationSubmission, request.body);
    if (!ALLOWED_RATINGS.has(submission.self_rating)) throw new HttpError(422, 'Invalid usability rating');
    const store = await storage();
    const owner = identity(response).subject;
    const output_id = String(request.params.output_id);
    const output = await store.get_output(output_id, owner);
    if (!output) throw new HttpError(404, 'Output was not found');
    const answer = expected_answers().find(answer => answer.brief_id === output.brief_id);
    if (!answer) throw new HttpError(503, 'Evaluation data is unavailable');
    const brand_match = normalize_answer(submission.brand_transcription) === normalize_answer(answer.expected_brand);
    const cta_match = [answer.expected_cta, ...answer.accepted_cta_variants].some(value => normalize_answer(value) === normalize_answer(submission.cta_transcription));
    let saved: boolean;
    try { saved = await store.save_evaluation({ output_id, owner, ...submission, brand_match, cta_match }); }
    catch (error) { if (error instanceof StorageNotFound) throw new HttpError(404, 'Output was not found'); throw error; }
    if (!saved) throw new HttpError(409, 'Evaluation is immutable after submission');
    const evaluated = await store.get_output(output_id, owner);
    if (!evaluated) throw new HttpError(404, 'Output was not found');
    response.json({ output_id, brand_match, cta_match, self_rating: submission.self_rating, status: output_status(evaluated) });
  });
  app.post('/api/attempts/:attempt_id/reconcile', ...authorized('renders.write'), async (request, response) => {
    const submission = parse(ReconciliationSubmission, request.body);
    const actual_cost_usd = decimal(submission.actual_cost_usd);
    const evidence_reference = submission.evidence_reference.trim();
    if (!evidence_reference) throw new HttpError(422, 'Evidence reference is required');
    if (render_active) throw new HttpError(409, 'A paid render is active');
    render_active = true;
    try {
      const attempt = await (await storage()).reconcile_attempt({
        attempt_id: String(request.params.attempt_id), owner: identity(response).subject, actual_cost_usd, evidence_reference,
      });
      response.json({ attempt_id: attempt.attempt_id, status: attempt.status, actual_cost_usd: attempt.actual_cost_usd, reconciliation_reference: attempt.reconciliation_reference });
    } catch (error) {
      if (error instanceof StorageNotFound) throw new HttpError(404, 'Paid attempt was not found');
      throw error;
    } finally { render_active = false; }
  });

  // Resolve real paths before serving to match StaticFiles' symlink containment policy.
  app.use(async (request, response, next) => {
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.set('Allow', 'GET, HEAD').status(405).json({ detail: 'Method Not Allowed' }); return;
    }
    try {
      const root = await realpath(STATIC_ROOT);
      const candidate = await realpath(resolve(root, `.${decodeURIComponent(request.path)}`));
      const child = relative(root, candidate);
      if (child === '..' || child.startsWith(`..${sep}`) || isAbsolute(child)) throw new HttpError(404, 'Not Found');
      if ((await stat(candidate)).isDirectory()) {
        const index = await realpath(join(candidate, 'index.html'));
        const index_child = relative(root, index);
        if (index_child === '..' || index_child.startsWith(`..${sep}`) || isAbsolute(index_child)) throw new HttpError(404, 'Not Found');
        if (!request.path.endsWith('/')) {
          response.redirect(307, `${request.path}/${request.url.slice(request.path.length)}`); return;
        }
      }
      next();
    } catch (error) {
      if (error instanceof URIError || error instanceof Error && 'code' in error && ['ENOENT', 'ENOTDIR'].includes(String(error.code))) {
        next(new HttpError(404, 'Not Found')); return;
      }
      next(error);
    }
  });
  app.use(express.static(STATIC_ROOT, { dotfiles: 'allow', fallthrough: true, redirect: false, cacheControl: false }));
  app.use((_request, response) => { response.status(404).json({ detail: 'Not Found' }); });
  const errors: ErrorRequestHandler = (error: unknown, _request, response, next) => {
    if (response.headersSent) { next(error); return; }
    if (error instanceof HttpError) { response.status(error.status).json({ detail: error.detail }); return; }
    if (error instanceof StorageAccessDenied) { response.status(403).json({ detail: error.message }); return; }
    if (error instanceof StorageConflict) { response.status(409).json({ detail: error.message }); return; }
    if (error instanceof StoreNotInitialized || is_storage_error(error)) {
      response.status(503).json({ detail: 'Persistent storage is unavailable' }); return;
    }
    if (error instanceof SyntaxError && 'body' in error) { response.status(422).json({ detail: 'Invalid JSON body' }); return; }
    if (error instanceof Error && 'type' in error && error.type === 'entity.too.large') { response.status(413).json({ detail: 'Request body is too large' }); return; }
    // Express' default error handler prints diagnostics; unknown failures must stay non-secret.
    response.status(500).json({ detail: 'Internal Server Error' });
  };
  app.use(errors);
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT ?? '8001');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new RangeError('PORT must be a TCP port');
  create_app().listen(port, process.env.HOST ?? 'localhost');
}
