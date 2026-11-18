import { z } from 'zod';
import { AdvertiserBrief, LyricRequest, validate_draft, WORD, type LyricDraft } from './lyrics.js';
import { CompositionRequest } from './melody.js';
import { dictionary } from 'cmu-pronouncing-dictionary';

/** Untrusted conversational context, never tool instructions or advertiser facts. */
export const ChatMessage = z.strictObject({
  role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(2000),
});
/** Bounded stateless history; transcripts remain in the browser page, not model roles with authority. */
export const JingleDiscussion = z.strictObject({
  request: LyricRequest,
  messages: z.array(ChatMessage).min(1).max(12),
}).refine(value => value.messages.at(-1)?.role === 'user', 'The last message must be from the user');
export type JingleDiscussion = z.infer<typeof JingleDiscussion>;
/** Creative advice is not a screened lyric draft or permission to spend. */
export const JingleSuggestion = z.strictObject({
  reply: z.string().trim().min(1).max(2000),
  creative_direction: z.string().trim().min(1).max(400),
});
export type JingleSuggestion = z.infer<typeof JingleSuggestion>;
/** Providers propose directions only; the MCP boundary owns input/output screening. */
export interface JingleAdvisor {
  suggest(discussion: JingleDiscussion): Promise<JingleSuggestion>;
}

/** Build complete dictionary-counted timing labels, not phonetic segmentation.
 * @remarks Orthographic slices divide each word evenly by its verified syllable count.
 * Speech is fitted proportionally within each word; this does not promise natural singing.
 */
export function composition_request(
  request: LyricRequest, draft: LyricDraft, logical_job_id: string,
): CompositionRequest {
  validate_draft(request, draft);
  const lines = draft.lyrics.split('\n');
  const width = Math.floor(22 * 8 / lines.length) / 8;
  return CompositionRequest.parse({
    logical_job_id, product_path: request.product_path, lyrics: draft.lyrics,
    lines: lines.map((text, index) => {
      const syllables = (text.match(WORD) ?? []).flatMap(word => {
        const phones = request.pronunciations[word.toLowerCase()] ?? dictionary[word.toLowerCase()]?.split(' ');
        const count = phones?.filter(phone => /[012]$/.test(phone)).length ?? 0;
        if (!count || count > word.length) throw new RangeError('Lyric pronunciation cannot be timed');
        return Array.from({ length: count }, (_, i) =>
          word.slice(Math.floor(i * word.length / count), Math.floor((i + 1) * word.length / count)));
      });
      if (syllables.length !== draft.syllables_per_line[index]) throw new RangeError('Lyric timing does not match verified meter');
      const start_seconds = 3 + index * width;
      return { text, syllables, start_seconds, end_seconds: start_seconds + Math.min(width, syllables.length * 0.5) };
    }),
  });
}

/** Public chat actions select only immutable server-owned options, never browser-supplied lyrics. */
export const ChatSelection = z.strictObject({
  brief_ids: z.array(AdvertiserBrief.shape.brief_id).length(1),
  custom_briefs: z.array(z.strictObject({ brief: AdvertiserBrief, cta: z.string().min(1).max(400) })).max(1).optional(),
});
