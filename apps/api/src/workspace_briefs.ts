import { createHash } from 'node:crypto';
import { z } from 'zod';
import { AdvertiserBrief, LyricRequest, Text } from './lyrics.js';
import { canonical_json } from './web_storage.js';

/** Custom inputs use the advertiser contract plus a pronounceable, explicit CTA. */
export const BriefDetails = AdvertiserBrief.omit({ brief_id: true }).extend({ cta: Text });
export type BriefDetails = z.infer<typeof BriefDetails>;
/** An immutable custom brief; its identity is recomputed before use. */
export const CustomBrief = z.strictObject({ brief: AdvertiserBrief, cta: Text });
export type CustomBrief = z.infer<typeof CustomBrief>;

/** Validate custom facts and derive an identity from their exact contents, without saving a draft. */
export function create_custom_brief(value: unknown): CustomBrief {
  const { cta, ...details } = BriefDetails.parse(value);
  const brief_id = `custom-${createHash('sha256').update(canonical_json({ ...details, cta })).digest('hex').slice(0, 32)}`;
  const result = { brief: { brief_id, ...details }, cta };
  LyricRequest.parse({ ...result, product_path: 'spoken' });
  z.string().max(400, 'Name, offer and CTA must fit within a 400-character render script').parse(custom_script(result));
  return result;
}

/** Reject altered content under a previously assigned custom identity. */
export function validate_custom_brief(value: unknown): CustomBrief {
  const parsed = CustomBrief.parse(value);
  const { brief_id, ...details } = parsed.brief;
  const expected = create_custom_brief({ ...details, cta: parsed.cta });
  if (brief_id !== expected.brief.brief_id) throw new TypeError('Custom brief ID does not match its contents');
  return expected;
}

/** Default script for renders that do not explicitly select a screened lyric draft. */
export function custom_script(value: CustomBrief): string {
  return `${value.brief.name}. ${value.brief.offer}. ${value.cta}`;
}

/** Bind paid approval to custom contents as well as IDs and character estimates. */
export function input_fingerprint(
  values: readonly CustomBrief[],
  lyrics: readonly { brief_id: string; option_id: string; lyrics: string }[] = [],
): string {
  return createHash('sha256').update(canonical_json(lyrics.length ? { custom_briefs: values, lyrics } : values)).digest('hex');
}
