import { createHash } from 'node:crypto';
import { z } from 'zod';
import { LyricRuleError, lyric_syllables, type AdvertiserBrief, type LyricDraft, type LyricRequest } from './lyrics.js';
import type { SyllableNote } from './melody.js';
import { canonical_json } from './web_storage.js';

const Sha256 = z.string().regex(/^[a-f0-9]{64}$/);

/** Request-independent checksums pin the authorized preview and all musical artifacts. */
export const GuidedPreview = z.strictObject({
  kind: z.literal('guided-preview'),
  job_id: z.uuid(),
  label: z.string(),
  brief_sha256: Sha256,
  backing_sha256: Sha256,
  timing_sha256: Sha256,
  score_sha256: Sha256,
  midi_sha256: Sha256,
});
export type GuidedPreview = z.infer<typeof GuidedPreview>;

/** Hash canonical JSON in the same format as the melody store's artifact writer. */
export function digest(value: unknown): string {
  return createHash('sha256').update(canonical_json(value)).digest('hex');
}

/** Fixture-specific missing brand pronunciation; other words use the standard dictionary. */
export function guided_pronunciations(brief: AdvertiserBrief): LyricRequest['pronunciations'] {
  return brief.brief_id === 'brief-002' ? { mosslight: ['M', 'AO1', 'S', 'L', 'AY2', 'T'] } : {};
}

/** Instrumental previews may use a neutral cadence where a dictionary count cannot be verified. */
export function known_meter(text: string, overrides: LyricRequest['pronunciations']): number | undefined {
  try { return lyric_syllables(text, overrides).length || undefined; }
  catch (error) {
    if (!(error instanceof LyricRuleError)) throw error;
    return undefined;
  }
}

/** Count the server-committed blank slots from each phrase, not model-supplied metadata. */
export function phrase_counts(timing: readonly SyllableNote[]): number[] {
  return [0, 1, 2, 3].map(line => timing.filter(event => event.line_index === line).length);
}

/** Fill committed slots with verified lyric labels without changing a note or any musical artifact. */
export function bind_timing(request: LyricRequest, draft: LyricDraft, timing: readonly SyllableNote[]): SyllableNote[] {
  const lines = draft.lyrics.split('\n').map(line => lyric_syllables(line, request.pronunciations));
  return timing.map(event => ({ ...event, syllable: lines[event.line_index][event.syllable_index] }));
}
