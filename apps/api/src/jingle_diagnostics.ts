import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import { z } from 'zod';

/** Pipeline stages included in content-free jingle diagnostics. */
export type JingleStage = 'brief' | 'lyrics' | 'safety' | 'score' | 'backing' | 'voice' | 'mix';
type Stage = JingleStage;
const ProviderOperation = z.enum(['extract_direction', 'preflight', 'generate', 'assess', 'suggest', 'moderation', 'protected_material', 'compose_score']);
type ProviderOperation = z.infer<typeof ProviderOperation>;
const ProviderCode = z.enum(['content_filter', 'ResponsibleAIPolicyViolation', 'invalid_request_error', 'invalid_parameter', 'unsupported_parameter', 'unknown_parameter', 'invalid_value', 'model_not_found', 'DeploymentNotFound', 'BadRequest', 'InvalidRequest', 'InvalidArgument', 'rate_limit_exceeded', 'context_length_exceeded']);
const ProviderParameter = z.enum(['model', 'messages', 'response_format', 'max_completion_tokens', 'text', 'categories', 'outputType']);

const CapturedText = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('captured'), text: z.string().refine(value => Buffer.byteLength(value, 'utf8') <= 65536) }),
  z.strictObject({ status: z.enum(['too_large', 'unreadable']), text: z.null() }),
]);
/** Bounded model request and response bodies; these may contain customer content. */
export const ModelExchange = z.strictObject({ request: CapturedText, response: CapturedText });

/** Provider metadata and, for model calls, optional administrator-only content. */
export const ProviderDiagnostic = z.strictObject({
  stage: z.enum(['brief', 'lyrics', 'safety', 'score', 'backing', 'voice', 'mix']),
  operation: ProviderOperation,
  http_status: z.number().int().min(100).max(599).nullable(),
  error_code: ProviderCode.nullable(),
  parameter: ProviderParameter.nullable(),
  request_id: z.uuid().nullable(),
  model_exchange: ModelExchange.optional(),
});
export type ProviderDiagnostic = z.infer<typeof ProviderDiagnostic>;
/** Durable request lifecycle fields, independent of provider messages or user content. */
export const JingleDiagnostic = z.strictObject({
  diagnostic_id: z.uuid(),
  stage: ProviderDiagnostic.shape.stage,
  status: z.enum(['running', 'completed', 'failed']),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
});

/** A diagnostic write failed after the request may have incurred costs. */
export class DiagnosticPersistenceFailure extends Error {}

type DiagnosticEvent =
  | { event: 'request_finished'; http_status: number; duration_ms: number }
  | { event: 'request_failed'; reason: string }
  | { event: 'score_failed'; logical_job_id: string; reason: string }
  | { event: 'lyric_attempt_failed'; step: 'generate' | 'assess'; attempt: number; reason: string }
  | { event: 'lyric_outcome'; step: 'preflight' | 'generate' | 'assess' | 'screen'; attempts: number; outcome: 'accepted' | 'rejected' | 'retry_exhausted' | 'unavailable' | 'human_review_required'; reasons: string[] }
  | { event: 'provider_http'; operation: ProviderOperation; duration_ms: number; http_status?: number };

const active = new AsyncLocalStorage<{
  diagnostic_id: string; stage: Stage;
  record_provider?: (entry: ProviderDiagnostic) => Promise<void>;
}>();
const safe_reasons = new Set([
  'artist_imitation', 'unsupported_language', 'unsupported_output_language', 'unsupported_claims',
  'moderation_rejected', 'protected_material', 'risky_claims_require_human_review', 'model_refusal',
  'malformed_lyric_output', 'line_format', 'cta_placement', 'hook_placement', 'use_pronounceable_words',
  'unknown_pronunciation', 'syllable_labels', 'unstressed_rhyme', 'arrangement_meter', 'meter',
  'fixed_pronunciation_required', 'fixed_lyric_format', 'cta_meter', 'cta_brand_count', 'invalid_pronunciation_hint',
  'syllable_metadata', 'rhyme_metadata', 'rhyme', 'brand_count',
  'cloud_authentication_failed', 'cloud_transport_failed', 'cloud_temporarily_unavailable',
  'cloud_request_failed', 'malformed_cloud_response', 'malformed_model_envelope', 'incomplete_model_output',
  'missing_model_output', 'malformed_assessment', 'malformed_safety_response', 'incomplete_safety_response',
  'invalid_cloud_endpoint', 'invalid_model_deployment', 'missing_lyric_cloud_configuration',
  'invalid_lyric_budget', 'lyric_call_limit', 'lyric_request_too_large', 'missing_jingle_direction_adapter',
  'score_request_too_large', 'score_output_too_large', 'invalid_score_output', 'malformed_score_output',
  'provider_outcome_unknown', 'score_render_unavailable',
  'unexpected_error',
]);

/** Return an allowlisted reason code without exposing provider-supplied text. */
export function safe_jingle_reason(code: string): string {
  return safe_reasons.has(code) ? code : 'unknown_reason';
}

/** Validates bounded, allowlisted failure reasons read from diagnostic storage. */
export const JingleFailureReasons = z.array(z.string().refine(reason => safe_jingle_reason(reason) === reason)).max(8);

/** Emits allowlisted, content-free fields only inside a browser jingle request. */
export function jingle_diagnostic(entry: DiagnosticEvent): void {
  const context = active.getStore();
  if (!context) return;
  const fields = 'reason' in entry ? { ...entry, reason: safe_jingle_reason(entry.reason) }
    : 'reasons' in entry ? { ...entry, reasons: entry.reasons.map(safe_jingle_reason) } : entry;
  console.info(JSON.stringify({ timestamp: new Date().toISOString(), scope: 'earwyrm.jingle', ...context, ...fields }));
}

/** Assigns an opaque correlation ID independently of browser progress polling. */
export function trace_jingle<T>(response: Response, run: (diagnostic_id: string) => T): T {
  const context = { diagnostic_id: randomUUID(), stage: 'brief' as Stage };
  const started = performance.now();
  response.setHeader('X-Earwyrm-Diagnostic-Id', context.diagnostic_id);
  response.once('finish', () => active.run(context, () => jingle_diagnostic({
    event: 'request_finished', http_status: response.statusCode, duration_ms: Math.round(performance.now() - started),
  })));
  return active.run(context, () => run(context.diagnostic_id));
}

/** Updates the diagnostic stage even when the browser did not request progress polling. */
export function set_jingle_diagnostic_stage(stage: Stage): void {
  const context = active.getStore();
  if (context) context.stage = stage;
}

/** Attaches a durable writer to the active request; it must reject when evidence cannot be saved. */
export function set_jingle_provider_recorder(record: (entry: ProviderDiagnostic) => Promise<void>): void {
  const context = active.getStore();
  if (!context) throw new Error('No active jingle diagnostic');
  context.record_provider = record;
}

async function bounded_error_body(response: globalThis.Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 65536) {
        void reader.cancel().catch(() => console.error('ERROR: Provider response cancellation failed'));
        return null;
      }
      chunks.push(value);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown; }
    catch (error) { if (error instanceof SyntaxError) return null; throw error; }
  } catch (error) {
    if (error instanceof TypeError || error instanceof DOMException) return null;
    throw error;
  } finally { reader.releaseLock(); }
}

async function capture_body(response: globalThis.Response): Promise<z.infer<typeof CapturedText>> {
  const reader = response.body?.getReader();
  if (!reader) return { status: 'captured', text: '' };
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return { status: 'captured', text: new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)) };
      bytes += value.byteLength;
      if (bytes > 65536) {
        void reader.cancel().catch(() => console.error('ERROR: Provider response cancellation failed'));
        return { status: 'too_large', text: null };
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof TypeError || error instanceof DOMException) return { status: 'unreadable', text: null };
    throw error;
  } finally { reader.releaseLock(); }
}

/** Records metadata and optional bounded model bodies, never transport headers or URLs. */
export async function trace_jingle_provider(operation: ProviderOperation, send: () => Promise<globalThis.Response>, model_payload?: string): Promise<globalThis.Response> {
  const context = active.getStore();
  if (!context) return send();
  const started = performance.now();
  let http_status: number | undefined;
  try {
    const response = await send();
    http_status = response.status;
    if (context.record_provider) {
      const model_response = model_payload === undefined ? undefined : await capture_body(response.clone());
      let raw: unknown = null;
      if (!response.ok && model_response === undefined) raw = await bounded_error_body(response.clone());
      else if (!response.ok && model_response?.status === 'captured') {
        try { raw = JSON.parse(model_response.text); }
        catch (error) { if (!(error instanceof SyntaxError)) throw error; }
      }
      const body = z.object({ error: z.object({ code: z.unknown().optional(), param: z.unknown().optional() }).optional() }).safeParse(raw);
      const code = ProviderCode.safeParse(body.success ? body.data.error?.code : undefined);
      const parameter = ProviderParameter.safeParse(body.success ? body.data.error?.param : undefined);
      const request_id = ['x-request-id', 'apim-request-id', 'x-ms-request-id']
        .map(name => z.uuid().safeParse(response.headers.get(name)))
        .find(result => result.success);
      await context.record_provider({
        stage: context.stage, operation,
        http_status: response.status >= 100 && response.status <= 599 ? response.status : null,
        error_code: code.success ? code.data : null,
        parameter: parameter.success ? parameter.data : null,
        request_id: request_id?.data ?? null,
        ...(model_payload === undefined || model_response === undefined ? {} : { model_exchange: {
          request: Buffer.byteLength(model_payload, 'utf8') <= 65536
            ? { status: 'captured' as const, text: model_payload }
            : { status: 'too_large' as const, text: null },
          response: model_response,
        } }),
      });
    }
    return response;
  } finally {
    jingle_diagnostic({ event: 'provider_http', operation, duration_ms: Math.round(performance.now() - started),
      ...(http_status === undefined ? {} : { http_status }) });
  }
}
