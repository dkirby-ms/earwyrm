import { z } from "zod";
import { dictionary } from "cmu-pronouncing-dictionary";
import { ProductPath } from "./melody.js";

/** Generation-facing text, bounded to 400 characters without coercion. */
export const Text = z.string().min(1).max(400);
export type Text = z.infer<typeof Text>;
export const WORD = /[A-Za-z]+(?:'[A-Za-z]+)?/g;
export const SPOKEN_TEXT = /^[A-Za-z' ,.!?;:\-\n]+$/;
export const VOWELS = new Set(["AA", "AE", "AH", "AO", "AW", "AY", "EH", "ER", "EY", "IH", "IY", "OW", "OY", "UH", "UW"]);
export const CONSONANTS = new Set(["B", "CH", "D", "DH", "F", "G", "HH", "JH", "K", "L", "M", "N", "NG", "P", "R", "S", "SH", "T", "TH", "V", "W", "Y", "Z", "ZH"]);
export const PHONEMES = new Set([...CONSONANTS, ...[...VOWELS].flatMap(vowel => ["0", "1", "2"].map(stress => vowel + stress))]);
/** Fixed English prosody policy; these rules are recomputed, never trusted from a model. */
export const POLICIES = {
  spoken: { lines: 2, min_syllables: 8, max_syllables: 20, rhyme_scheme: "--" },
  vocoded: { lines: 4, min_syllables: 8, max_syllables: 12, rhyme_scheme: "AABB" },
} as const;
/** Base strict lyric JSON contract; concrete objects reject extra properties. */
export const LyricContract = z.strictObject({});
export type LyricContract = z.infer<typeof LyricContract>;
/** Contact facts are data only; never spoken as symbolic notation. */
export const ContactDetails = z.strictObject({ email: Text, phone: Text });
export type ContactDetails = z.infer<typeof ContactDetails>;
/** Generation-facing advertiser facts with fixture or immutable custom identities. */
export const AdvertiserBrief = z.strictObject({
  brief_id: z.string().regex(/^(?:brief-[0-9]{3}|custom-[a-f0-9]{32})$/),
  name: Text, offer: Text, location: Text, contact_details: ContactDetails, tone: Text,
  approved_claims: z.array(Text).min(1).max(20),
});
export type AdvertiserBrief = z.infer<typeof AdvertiserBrief>;

function pronounceable(text: string): boolean {
  return SPOKEN_TEXT.test(text) && !/[A-Za-z]\.[A-Za-z]/.test(text);
}

/** Fixed English advertising request with explicit stressed ARPABET overrides. */
export const LyricRequest = z.strictObject({
  schema_version: z.literal(1).default(1), brief: AdvertiserBrief, product_path: ProductPath, cta: Text,
  language: z.literal("en").default("en"), duration_seconds: z.literal(30).default(30),
  style: z.literal("retro-synth").default("retro-synth"),
  pronunciations: z.record(z.string(), z.array(z.string())).default({}),
  creative_direction: Text.optional(),
  arrangement: z.strictObject({
    job_id: z.uuid(),
    timing_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    syllables_per_line: z.array(z.number().int().min(1).max(44)).length(4),
  }).optional(),
}).superRefine((request, ctx) => {
  const { brief } = request;
  const values = [brief.name, brief.offer, brief.location, brief.tone, brief.contact_details.email, brief.contact_details.phone, request.cta, ...brief.approved_claims];
  if (values.some(value => !value.trim() || !/^[\x20-\x7e]+$/.test(value))) ctx.addIssue({ code: "custom", message: "Brief and CTA must contain single-line printable ASCII text" });
  if (!words(brief.name).length) ctx.addIssue({ code: "custom", message: "Brand must contain English words" });
  if (!pronounceable(brief.name) || !pronounceable(request.cta)) ctx.addIssue({ code: "custom", message: "Brand and CTA must spell out numbers and symbols" });
  if (request.arrangement && request.product_path !== "vocoded") ctx.addIssue({ code: "custom", message: "Guided lyrics require rhymed delivery" });
  if (Object.keys(request.pronunciations).length > 40) ctx.addIssue({ code: "custom", message: "Supply at most 40 pronunciation overrides" });
  for (const [word, phones] of Object.entries(request.pronunciations)) {
    if (!/^[a-z]+(?:'[a-z]+)?$/.test(word) || phones.length < 1 || phones.length > 40 || phones.some(phone => !PHONEMES.has(phone)) || !phones.some(phone => /[012]$/.test(phone))) ctx.addIssue({ code: "custom", message: "Pronunciations require lowercase words and valid stressed ARPABET" });
  }
});
export type LyricRequest = z.infer<typeof LyricRequest>;
/** Saved lyric fields; prosody and brand metadata must be independently recomputed. */
export const LyricDraft = z.strictObject({
  hook: Text, lyrics: z.string().min(1).max(400), syllables_per_line: z.array(z.number().int()).min(2).max(4),
  rhyme_scheme: z.enum(["--", "AABB"]), brand_count: z.number().int().min(0).max(20), cta: Text,
});
export type LyricDraft = z.infer<typeof LyricDraft>;
/** Guided model responses omit the hook; the writer takes it from the first line. */
export const GuidedLyricCandidate = LyricDraft.omit({ hook: true });
/** Only technically accepted or human-held results may contain screened text. */
export const LyricResult = z.strictObject({
  schema_version: z.literal(1).default(1),
  status: z.enum(["accepted", "human_review_required", "rejected", "retry_exhausted", "unavailable"]),
  attempts: z.number().int().min(0).max(4), output: LyricDraft.nullable().default(null),
  reasons: z.array(z.string()).default([]), ai_generated: z.literal(true).default(true),
  broadcast_approval_required: z.literal(true).default(true),
}).superRefine((result, ctx) => {
  if ((result.output !== null) !== ["accepted", "human_review_required"].includes(result.status)) ctx.addIssue({ code: "custom", message: "Only validated or human-held outcomes can carry lyrics" });
  if (result.status !== "accepted" && !result.reasons.length) ctx.addIssue({ code: "custom", message: "Non-accepted outcomes require an explicit reason" });
});
export type LyricResult = z.infer<typeof LyricResult>;

/** Content-free retryable rule code with an optional one-based lyric line. */
export class LyricRuleError extends Error {
  constructor(code: string, readonly line?: number) { super(code); this.name = "LyricRuleError"; }
}

/** Normalize English words for dictionary lookup and full-token brand matching. */
export function words(text: string): string[] {
  return text.toLowerCase().match(WORD) ?? [];
}

function pronunciation(word: string, overrides: Record<string, string[]>, line?: number): string[] {
  if (Object.hasOwn(overrides, word)) return overrides[word];
  const phones = Object.hasOwn(dictionary, word) ? dictionary[word] : undefined;
  if (!phones) throw new LyricRuleError("unknown_pronunciation", line);
  return phones.split(" ");
}

/** Count or divide words using the same pronunciations used in draft validation and speech alignment. */
export function lyric_syllables(text: string, overrides: Record<string, string[]>): string[] {
  return (text.match(WORD) ?? []).flatMap(word => {
    const count = pronunciation(word.toLowerCase(), overrides).filter(phone => /[012]$/.test(phone)).length;
    if (!count || count > word.length) throw new LyricRuleError("syllable_labels");
    return Array.from({ length: count }, (_, i) =>
      word.slice(Math.floor(i * word.length / count), Math.floor((i + 1) * word.length / count)));
  });
}

function rhyme(phones: string[]): string {
  for (let i = phones.length - 1; i >= 0; i--) {
    if (/[12]$/.test(phones[i])) return phones.slice(i).map(phone => phone.replace(/[012]/g, "")).join(" ");
  }
  throw new LyricRuleError("unstressed_rhyme");
}

/** Detect impossible final-line rhymes before reserving a guided generation budget. */
export function has_cta_rhyme(cta: string, overrides: Record<string, string[]>, max_syllables: number): boolean {
  const word = words(cta).at(-1);
  if (!word) return false;
  const tail = rhyme(pronunciation(word, overrides));
  const matches = (phones: string[]): boolean =>
    phones.some(phone => /[12]$/.test(phone)) &&
    phones.filter(phone => /[012]$/.test(phone)).length <= max_syllables && rhyme(phones) === tail;
  for (const [candidate, phones] of Object.entries(overrides)) {
    if (candidate !== word && matches(phones)) return true;
  }
  for (const [candidate, phones] of Object.entries(dictionary)) {
    if (candidate !== word && /^[a-z]+(?:'[a-z]+)?$/.test(candidate) && !Object.hasOwn(overrides, candidate) &&
        matches(phones.split(" "))) return true;
  }
  return false;
}

/** Recompute meter, phonetic rhyme, brand occurrences and fixed CTA/hook placement.
 * By default, require the submitted syllable counts to match. In derive mode, return the computed counts instead.
 * @throws LyricRuleError with a safe code for a failed lexical or prosody rule.
 */
export function validate_draft(request: LyricRequest, draft: LyricDraft, syllable_counts: "verify" | "derive" = "verify"): LyricDraft {
  const policy = POLICIES[request.product_path], lines = draft.lyrics.split("\n");
  if (lines.length !== policy.lines || !/^[\x00-\x7f]*$/.test(draft.lyrics) || lines.some(line => !line.trim() || line !== line.trim()) || /[\x00-\x09\x0b-\x1f\x7f]/.test(draft.lyrics)) throw new LyricRuleError("line_format");
  if (draft.cta !== request.cta || lines.at(-1) !== request.cta || lines.filter(line => line === request.cta).length !== 1) throw new LyricRuleError("cta_placement");
  if (!lines.slice(0, -1).includes(draft.hook)) throw new LyricRuleError("hook_placement");
  const token_lines = lines.map(words);
  if (token_lines.some(tokens => !tokens.length) || !pronounceable(draft.lyrics)) throw new LyricRuleError("use_pronounceable_words");
  const phones = token_lines.map((tokens, index) => tokens.map(word => pronunciation(word, request.pronunciations, index + 1)));
  const counts = phones.map(row => row.flat().filter(phone => /[012]$/.test(phone)).length);
  if (request.arrangement) {
    if (counts.some((count, index) => count !== request.arrangement!.syllables_per_line[index])) throw new LyricRuleError("arrangement_meter");
    for (const line of lines) lyric_syllables(line, request.pronunciations);
  } else if (counts.some(count => count < policy.min_syllables || count > policy.max_syllables)) throw new LyricRuleError("meter");
  if (syllable_counts === "verify" && JSON.stringify(counts) !== JSON.stringify(draft.syllables_per_line)) throw new LyricRuleError("syllable_metadata");
  if (draft.rhyme_scheme !== policy.rhyme_scheme) throw new LyricRuleError("rhyme_metadata");
  if (request.product_path === "vocoded") {
    const tails = phones.map(row => rhyme(row.at(-1)!));
    if (tails[0] !== tails[1] || tails[2] !== tails[3] || tails[0] === tails[2] || token_lines[0].at(-1) === token_lines[1].at(-1) || token_lines[2].at(-1) === token_lines[3].at(-1)) throw new LyricRuleError("rhyme");
  }
  const brand = words(request.brief.name);
  let brand_count = 0;
  for (const tokens of token_lines) for (let i = 0; i <= tokens.length - brand.length; i++) {
    if (brand.every((word, j) => tokens[i + j] === word)) brand_count++;
  }
  if (brand_count !== 2 || draft.brand_count !== brand_count) throw new LyricRuleError("brand_count");
  return syllable_counts === "derive" ? { ...draft, syllables_per_line: counts } : draft;
}
