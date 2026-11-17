import { z } from "zod";
import { ScoreDuration, Seed, chord_degree, compose, musical_form, musical_plan, seeded_random, vocal_pitch, type Note } from "./dsp.js";

/** Version-one delivery path; neither path promises natural singing. */
export const ProductPath = z.enum(["vocoded", "spoken"]);
export type ProductPath = z.infer<typeof ProductPath>;
/** Base strict JSON object contract; all concrete contracts reject extra fields. */
export const Contract = z.strictObject({});
export type Contract = z.infer<typeof Contract>;
const letters = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Ordered syllables in a nonempty 0.125-second-grid window within seconds 3–25. */
export const LyricLine = z.strictObject({
  text: z.string().min(1).max(400),
  syllables: z.array(z.string().min(1).max(80)).min(1).max(88),
  start_seconds: z.number().min(3).lt(25),
  end_seconds: z.number().gt(3).max(25),
}).superRefine((line, ctx) => {
  const duration = line.end_seconds - line.start_seconds;
  if (!letters(line.text) || line.syllables.some(value => !letters(value)) || letters(line.syllables.join("")) !== letters(line.text)) ctx.addIssue({ code: "custom", message: "Syllables must cover the complete pronounceable line in order" });
  if (![line.start_seconds, line.end_seconds].every(value => Number.isInteger(value * 8))) ctx.addIssue({ code: "custom", message: "Vocal windows must lie on the 0.125-second grid" });
  if (duration < line.syllables.length * 0.125 || duration > line.syllables.length) ctx.addIssue({ code: "custom", message: "Syllables cannot fit: each needs 0.125 to 1 second" });
});
export type LyricLine = z.infer<typeof LyricLine>;

/** Whole-bar composition request; omitted duration retains the legacy 30-second identity. */
export const CompositionRequest = z.strictObject({
  schema_version: z.literal(1).default(1),
  logical_job_id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/),
  product_path: ProductPath,
  lyrics: z.string().min(1).max(400),
  lines: z.array(LyricLine).min(1).max(8),
  seed: Seed.nullable().default(null),
  duration_seconds: ScoreDuration.default(30),
  style: z.literal("retro-synth").default("retro-synth"),
}).superRefine((request, ctx) => {
  if (!/^[\x00-\x7f]*$/.test(request.lyrics)) ctx.addIssue({ code: "custom", message: "The v1 lyric contract supports ASCII lyrics only" });
  if (letters(request.lines.map(line => line.text).join("")) !== letters(request.lyrics)) ctx.addIssue({ code: "custom", message: "Lines must cover the complete lyrics in order" });
  let previous = 0;
  for (const line of request.lines) {
    if (line.end_seconds > request.duration_seconds - 1) ctx.addIssue({ code: "custom", message: "Vocal windows must end before the final second of the requested duration" });
    if (line.start_seconds < previous) ctx.addIssue({ code: "custom", message: "Vocal windows must be ordered and non-overlapping" });
    previous = line.end_seconds;
  }
  const count = request.lines.reduce((sum, line) => sum + line.syllables.length, 0);
  if (count < 8 || count > 176) ctx.addIssue({ code: "custom", message: "Supply 8 to 176 syllables for timing and similarity screening" });
});
export type CompositionRequest = z.infer<typeof CompositionRequest>;

/** Zero-based lyric position mapped to an exact MIDI interval in seconds. */
export const SyllableNote = z.strictObject({
  line_index: z.number().int().nonnegative(), syllable_index: z.number().int().nonnegative(), syllable: z.string(),
  start_seconds: z.number().min(3).lt(25), duration_seconds: z.number().min(0.125).max(1), midi_note: z.number().int().min(0).max(127),
});
export type SyllableNote = z.infer<typeof SyllableNote>;
/** Actual pad voicing for one bar, with times in seconds. */
export const Chord = z.strictObject({
  start_seconds: z.number().min(0).lt(30), duration_seconds: z.number().positive().max(30), root_midi: z.number().int().min(0).max(127), pitches: z.array(z.number().int().min(0).max(127)),
});
export type Chord = z.infer<typeof Chord>;
/** Score, harmony and vocal map sharing one seeded musical identity. */
export interface Arrangement { seed: Seed; backing: Note[]; vocal: Note[]; chords: Chord[]; timing: SyllableNote[] }

/** Fit every syllable exactly into its validated window, without omission or overflow. */
export function arrange(request: CompositionRequest, seed: Seed): Arrangement {
  request = CompositionRequest.parse(request);
  const random = seeded_random(seed), backing = compose(seed, request.duration_seconds), vocal: Note[] = [], timing: SyllableNote[] = [];
  let index = 0;
  request.lines.forEach((line, line_index) => {
    const slots = line.syllables.map(() => 1);
    let remaining = Math.round((line.end_seconds - line.start_seconds) * 8) - slots.length;
    while (remaining > 0) {
      const eligible = slots.flatMap((value, i) => value < 8 ? [i] : []);
      slots[eligible[Math.floor(random() * eligible.length)]]++;
      remaining--;
    }
    let start = line.start_seconds;
    line.syllables.forEach((syllable, syllable_index) => {
      const duration = slots[syllable_index] / 8, pitch = vocal_pitch(seed, index++, start, request.duration_seconds);
      vocal.push({ start, duration, pitch, instrument: "vocal", gain: 0.25 });
      timing.push({ line_index, syllable_index, syllable, start_seconds: start, duration_seconds: duration, midi_note: pitch });
      start += duration;
    });
  });
  const plan = musical_plan(seed), form = musical_form(request.duration_seconds);
  const chords = Array.from({ length: request.duration_seconds / 2 }, (_, bar) => ({
    start_seconds: bar * 2, duration_seconds: 2,
    root_midi: plan.pitch(chord_degree(plan, bar, form)),
    pitches: backing.filter(note => note.instrument === "pad" && note.start === bar * 2).map(note => note.pitch),
  }));
  return { seed, backing, vocal, chords, timing };
}
