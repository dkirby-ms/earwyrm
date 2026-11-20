import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { Response } from 'express';

type Stage = 'brief' | 'lyrics' | 'safety' | 'score' | 'backing' | 'voice' | 'mix';
type ProviderOperation = 'extract_direction' | 'preflight' | 'generate' | 'assess' | 'suggest' | 'moderation' | 'protected_material' | 'compose_score';

type DiagnosticEvent =
  | { event: 'request_finished'; http_status: number; duration_ms: number }
  | { event: 'request_failed' | 'score_failed'; reason: string }
  | { event: 'lyric_attempt_failed'; step: 'generate' | 'assess'; attempt: number; reason: string }
  | { event: 'lyric_outcome'; step: 'preflight' | 'generate' | 'assess' | 'screen'; attempts: number; outcome: 'accepted' | 'rejected' | 'retry_exhausted' | 'unavailable' | 'human_review_required'; reasons: string[] }
  | { event: 'provider_http'; operation: ProviderOperation; duration_ms: number; http_status?: number };

const active = new AsyncLocalStorage<{ diagnostic_id: string; stage: Stage }>();
const safe_reasons = new Set([
  'artist_imitation', 'unsupported_language', 'unsupported_output_language', 'unsupported_claims',
  'moderation_rejected', 'protected_material', 'risky_claims_require_human_review', 'model_refusal',
  'malformed_lyric_output', 'line_format', 'cta_placement', 'hook_placement', 'use_pronounceable_words',
  'unknown_pronunciation', 'syllable_labels', 'unstressed_rhyme', 'arrangement_meter', 'meter',
  'syllable_metadata', 'rhyme_metadata', 'rhyme', 'brand_count',
  'cloud_authentication_failed', 'cloud_transport_failed', 'cloud_temporarily_unavailable',
  'cloud_request_failed', 'malformed_cloud_response', 'malformed_model_envelope', 'incomplete_model_output',
  'missing_model_output', 'malformed_assessment', 'malformed_safety_response', 'incomplete_safety_response',
  'invalid_cloud_endpoint', 'invalid_model_deployment', 'missing_lyric_cloud_configuration',
  'invalid_lyric_budget', 'lyric_call_limit', 'lyric_request_too_large', 'missing_jingle_direction_adapter',
  'score_request_too_large', 'score_output_too_large', 'invalid_score_output', 'malformed_score_output',
  'unexpected_error',
]);

function safe_reason(code: string): string {
  return safe_reasons.has(code) ? code : 'unknown_reason';
}

/** Emits allowlisted, content-free fields only inside a browser jingle request. */
export function jingle_diagnostic(entry: DiagnosticEvent): void {
  const context = active.getStore();
  if (!context) return;
  const fields = 'reason' in entry ? { ...entry, reason: safe_reason(entry.reason) }
    : 'reasons' in entry ? { ...entry, reasons: entry.reasons.map(safe_reason) } : entry;
  console.info(JSON.stringify({ timestamp: new Date().toISOString(), scope: 'earwyrm.jingle', ...context, ...fields }));
}

/** Assigns an opaque correlation ID independently of browser progress polling. */
export function trace_jingle<T>(response: Response, run: () => T): T {
  const context = { diagnostic_id: randomUUID(), stage: 'brief' as Stage };
  const started = performance.now();
  response.setHeader('X-Earwyrm-Diagnostic-Id', context.diagnostic_id);
  response.once('finish', () => active.run(context, () => jingle_diagnostic({
    event: 'request_finished', http_status: response.statusCode, duration_ms: Math.round(performance.now() - started),
  })));
  return active.run(context, run);
}

/** Updates the diagnostic stage even when the browser did not request progress polling. */
export function set_jingle_diagnostic_stage(stage: Stage): void {
  const context = active.getStore();
  if (context) context.stage = stage;
}

/** Measures an HTTP exchange without capturing its URL, headers, or body. */
export async function trace_jingle_provider(operation: ProviderOperation, send: () => Promise<globalThis.Response>): Promise<globalThis.Response> {
  if (!active.getStore()) return send();
  const started = performance.now();
  let http_status: number | undefined;
  try {
    const response = await send();
    http_status = response.status;
    return response;
  } finally {
    jingle_diagnostic({ event: 'provider_http', operation, duration_ms: Math.round(performance.now() - started),
      ...(http_status === undefined ? {} : { http_status }) });
  }
}
