import { z } from "zod";
import { ScoreDuration, Seed, chord_degree, compose, jingle_duration, musical_form, musical_plan, seeded_random, vocal_pitch, type Note } from "./dsp.js";

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

/** A server-created preview commits four vocal phrases before any words are written. */
export const PreviewCompositionRequest = z.strictObject({
  ...CompositionRequest.shape,
}).omit({ lyrics: true, lines: true }).extend({
  syllables_per_line: z.array(z.number().int().min(1).max(44)).length(4),
}).refine(value => value.syllables_per_line.every(count => count * 0.125 <= preview_phrase_width(value.duration_seconds)), {
  message: "Preview syllables must fit their phrase",
});
export type PreviewCompositionRequest = z.infer<typeof PreviewCompositionRequest>;

function preview_phrase_width(duration_seconds: number): number {
  // Four phrases start at second 3 and leave the final bar for the cadence.
  return Math.floor(Math.min(22, duration_seconds - 5) * 2) / 8;
}

/** Choose a short whole-bar form from a stable brief key, extending for verified lyric slots. */
export function preview_duration(key: Seed, syllables_per_line: readonly number[]): number {
  const longest = Math.max(...syllables_per_line);
  return jingle_duration(key, Math.max(5 + longest * 0.5, Math.min(20, 5 + longest * 0.8)));
}

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
  return arrange_lines(CompositionRequest.parse(request), seed);
}

/** Render an instrumental guide with the same pitches and onsets the later voice will use. */
export function arrange_preview(request: PreviewCompositionRequest, seed: Seed): Arrangement {
  const { duration_seconds, syllables_per_line } = request;
  const width = preview_phrase_width(duration_seconds) * 8;
  const plan = musical_plan(seed), form = musical_form(duration_seconds), random = seeded_random(seed);
  const cadence = form.cadence_start_seconds;
  // Speech alignment caps committed vocal windows at 25 seconds, even for longer scores.
  const cta_end = Math.min(25, cadence);
  const backing = compose(seed, duration_seconds).filter(note => note.instrument !== "lead" ||
    note.start + note.duration <= 3 || note.start >= cadence);
  const vocal: Note[] = [], timing: SyllableNote[] = [];
  const [opening, , recall] = syllables_per_line;
  const hook_size = Math.min(3, opening, recall);
  const hook_rhythm = plan.rhythm[0] > plan.rhythm[1] ? [3, 1, 4] : [2, 1, 5];
  const phrase_ticks = (count: number) => Math.min(width, count * 3);
  let hook_slack = Math.min(phrase_ticks(opening) - opening, phrase_ticks(recall) - recall);
  const hook_slots = hook_rhythm.slice(0, hook_size).map(length => {
    const extra = Math.min(length - 1, hook_slack);
    hook_slack -= extra;
    return 1 + extra;
  });

  syllables_per_line.forEach((count, line_index) => {
    const returning = line_index === 0 || line_index === 2;
    const cta = line_index === 3;
    const slots = guided_phrase_slots(count, phrase_ticks(count), returning ? hook_slots : [], line_index);
    const length = slots.reduce((sum, slot) => sum + slot, 0);
    let tick = cta ? cta_end * 8 - length : 24 + line_index * width;
    let degree = 0;
    let leap = 0;
    slots.forEach((slot, syllable_index) => {
      const start = tick / 8, duration = slot / 8;
      const chord = chord_degree(plan, Math.floor(start / 2), form);
      if (returning && syllable_index < hook_size) {
        degree = plan.motif[syllable_index];
      } else if (cta && syllable_index === count - 1) {
        degree = 4;
      } else if (syllable_index === 0 || syllable_index === count - 1) {
        const tones = [chord - 7, chord - 5, chord - 3, chord, chord + 2, chord + 4];
        const target = syllable_index === 0 ? (cta ? 4 : -1) : degree;
        degree = tones.reduce((nearest, tone) => Math.abs(tone - target) < Math.abs(nearest - target) ? tone : nearest);
      } else {
        const [low, high] = line_index === 1 ? [-4, 4] : [-2, 8];
        // A wide interval is answered by a step in the opposite direction.
        const steps = leap >= 4 ? [-2, -1] : leap <= -4 ? [1, 2] : [-5, -4, -2, -1, 0, 1, 2, 4, 5];
        const choices = steps.map(step => degree + step).filter(next => next >= low && next <= high);
        const previous = degree;
        degree = choices[Math.floor(random() * choices.length)];
        leap = degree - previous;
      }
      const pitch = plan.pitch(degree + 7);
      vocal.push({ start, duration, pitch, instrument: "vocal", gain: 0.25 });
      timing.push({ line_index, syllable_index, syllable: "", start_seconds: start, duration_seconds: duration, midi_note: pitch });
      backing.push({ start, duration, pitch, instrument: "lead", gain: slot >= 4 ? 0.085 : 0.06 });
      tick += slot;
    });
  });

  return { seed, backing, vocal, chords: arrangement_chords(plan, form, backing), timing };
}

/** Allocate eighth-second ticks; protect the recurring hook and spend slack on accents and the ending. */
function guided_phrase_slots(count: number, budget: number, hook: readonly number[], line_index: number): number[] {
  const slots = Array.from({ length: count }, (_, index) => hook[index] ?? 1);
  const pulse = line_index === 1 ? [1, 2, 1, 3] : [3, 1, 2, 1];
  const weights = slots.map((_, index) => index === count - 1 ? 6 : pulse[index % pulse.length]);
  let slack = budget - slots.reduce((sum, slot) => sum + slot, 0);
  while (slack > 0) {
    let next = -1;
    for (let index = hook.length; index < count; index++) {
      if (slots[index] < 8 && (next < 0 || weights[index] / slots[index] > weights[next] / slots[next])) next = index;
    }
    if (next < 0) break;
    slots[next]++;
    slack--;
  }
  return slots;
}

function arrange_lines(request: { duration_seconds: number; lines: Omit<LyricLine, "text">[] }, seed: Seed): Arrangement {
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
  const chords = arrangement_chords(musical_plan(seed), musical_form(request.duration_seconds), backing);
  return { seed, backing, vocal, chords, timing };
}

function arrangement_chords(plan: ReturnType<typeof musical_plan>, form: ReturnType<typeof musical_form>, backing: readonly Note[]): Chord[] {
  return Array.from({ length: form.duration_seconds / 2 }, (_, bar) => ({
    start_seconds: bar * 2, duration_seconds: 2,
    root_midi: plan.pitch(chord_degree(plan, bar, form)),
    pitches: backing.filter(note => note.instrument === "pad" && note.start === bar * 2).map(note => note.pitch),
  }));
}
