import { z } from 'zod';
import { Text } from './lyrics.js';

/** Free-text creation request; the same bound applies server-side and in the composer. */
export const JingleDescription = z.string().trim().min(1, 'Describe the jingle you want.').max(400);

/** Maximum submitted voice characters, matching the validated lyric draft limit. */
export const JINGLE_VOICE_MAX_CHARACTERS = 400;

/** Source phrases extracted from the description, with creative mood kept separate from facts. */
export const JingleDirection = z.strictObject({
  name: Text.nullable(),
  offer: Text.nullable(),
  cta: Text.nullable(),
  tone: Text,
});
export type JingleDirection = z.infer<typeof JingleDirection>;

/** Worst-case provider reservation for one generation, in USD; excludes hosting. */
export interface JingleEstimate {
  model_and_safety_max_usd: string;
  speech_max_usd: string;
  total_max_usd: string;
}
