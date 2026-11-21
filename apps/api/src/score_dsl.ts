import { z } from "zod";
import { ScoreTempo, type Note } from "./dsp.js";
import { Chord, SyllableNote, type SyllableNote as TimedSyllable } from "./melody.js";
import { lyric_syllables } from "./lyrics.js";
import { screen, type SimilarityReport } from "./similarity.js";

const Step = z.number().int().min(0).max(7);
const ScaleDegree = z.number().int().min(-7).max(14);
const DurationSteps = z.number().int().min(1).max(8);

const MelodicEvent = z.strictObject({
  step: Step,
  degree: ScaleDegree,
  duration_steps: DurationSteps,
}).superRefine((event, ctx) => {
  if (event.step + event.duration_steps > 8) ctx.addIssue({ code: "custom", message: "Events must end within their bar" });
});

const DrumEvent = z.strictObject({
  step: Step,
  duration_steps: DurationSteps,
}).superRefine((event, ctx) => {
  if (event.step + event.duration_steps > 8) ctx.addIssue({ code: "custom", message: "Events must end within their bar" });
});

// The disjoint instrument sets allow anyOf, which Azure supports in structured outputs.
const Track = z.union([
  z.strictObject({ instrument: z.enum(["pad", "bass", "lead"]), events: z.array(MelodicEvent).min(1).max(16) }),
  z.strictObject({ instrument: z.enum(["kick", "snare", "hat"]), events: z.array(DrumEvent).min(1).max(16) }),
]);

/** Version-one structured score; patterns repeat per bar against a four-chord progression. */
export const ArrangementScore = z.strictObject({
  schema_version: z.literal(1),
  style: z.literal("retro-synth"),
  tempo_bpm: ScoreTempo,
  time_signature: z.literal("4/4"),
  key_root: z.number().int().min(0).max(11),
  mode: z.enum(["major", "minor"]),
  bars: z.number().int().min(8).max(12),
  progression: z.array(z.number().int().min(0).max(6)).length(4),
  hook_motif: z.array(ScaleDegree).min(3).max(7),
  tracks: z.array(Track).min(3).max(6),
}).superRefine((score, ctx) => {
  const instruments = score.tracks.map(track => track.instrument);
  if (new Set(instruments).size !== instruments.length) ctx.addIssue({ code: "custom", message: "Track instruments must be unique" });
  for (const required of ["pad", "bass", "lead"] as const) {
    if (!instruments.includes(required)) ctx.addIssue({ code: "custom", message: `The ${required} track is required` });
  }
});

export type ArrangementScore = z.infer<typeof ArrangementScore>;

/**
 * Places every accepted lyric syllable inside the score's vocal window.
 *
 * @param input - A version-one arrangement score.
 * @param lines - Accepted lyric lines in their displayed order.
 * @param pronunciations - The pronunciation overrides used when the lyrics were accepted.
 * @throws A `RangeError` when the lyrics cannot fit the score's bounded vocal window.
 */
export function score_lyric_timing(
  input: unknown,
  lines: readonly string[],
  pronunciations: Record<string, string[]>,
): TimedSyllable[] {
  const score = ArrangementScore.parse(input);
  const syllables = lines.map(line => lyric_syllables(line, pronunciations));
  const count = syllables.reduce((total, line) => total + line.length, 0);
  if (count < 8 || count > 176) throw new RangeError("Score timing requires 8 to 176 lyric syllables");

  const duration_seconds = score.bars * 240 / score.tempo_bpm;
  const window_end = Math.min(25, duration_seconds - 2);
  const spacing = (window_end - 3) / count;
  if (spacing < 0.125) throw new RangeError("Lyrics do not fit the score's vocal window");

  let index = 0;
  return syllables.flatMap((line, line_index) => line.map((syllable, syllable_index) => {
    const start_seconds = 3 + index++ * spacing;
    return SyllableNote.parse({
      line_index, syllable_index, syllable, start_seconds,
      duration_seconds: Math.min(1, spacing), midi_note: 60,
    });
  }));
}

/** Expanded backing, lyric-aligned guide melody, harmony, and screening inputs. */
export interface CompiledScore {
  duration_seconds: number;
  backing: Note[];
  vocal: Note[];
  chords: z.infer<typeof Chord>[];
  timing: TimedSyllable[];
  melodies: Record<string, number[]>;
  similarity: SimilarityReport;
}

const SCALE_STEPS = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
} as const;

const ROOT_PITCH = { pad: 48, bass: 36, lead: 72, vocal: 60 } as const;
const GAIN = { pad: 0.04, bass: 0.1, lead: 0.075, kick: 0.18, snare: 0.075, hat: 0.02, vocal: 0.25 } as const;
const DRUM_PITCH = { kick: 36, snare: 38, hat: 42 } as const;

function scale_pitch(score: ArrangementScore, chord_degree: number, degree: number, base: number): number {
  const total_degree = chord_degree + degree;
  const octave = Math.floor(total_degree / 7);
  const scale_index = ((total_degree % 7) + 7) % 7;
  return base + score.key_root + SCALE_STEPS[score.mode][scale_index]! + octave * 12;
}

/** Require complete, ordered lyric slots that fit before the score's final second. */
function validate_timing(timing: readonly TimedSyllable[], duration_seconds: number): TimedSyllable[] {
  const rows = z.array(SyllableNote).min(8).max(176).parse(timing);
  let line_index = 0, syllable_index = 0, previous_end = 0;
  if (rows[0]!.line_index !== 0 || rows[0]!.syllable_index !== 0) throw new RangeError("Lyric timing must start at the first line and syllable");
  for (const row of rows) {
    if (row.line_index !== line_index || row.syllable_index !== syllable_index) {
      if (row.line_index !== line_index + 1 || row.syllable_index !== 0) throw new RangeError("Lyric timing must cover ordered lines and syllables");
      line_index = row.line_index;
      syllable_index = 1;
    } else {
      syllable_index++;
    }
    if (row.start_seconds + 1e-9 < previous_end || row.start_seconds + row.duration_seconds > duration_seconds - 1 + 1e-9) {
      throw new RangeError("Lyric timing must be ordered and fit before the score ending");
    }
    previous_end = row.start_seconds + row.duration_seconds;
  }
  return rows;
}

/**
 * Expand a score into deterministic backing, harmony, and lyric-aligned guide notes.
 *
 * @param input - Score JSON validated against the version-one `ArrangementScore` contract.
 * @param lyric_timing - Ordered accepted syllables; each keeps its start and duration.
 * @param history - Previously accepted melodies to include in the similarity screen.
 * @returns Notes and chords in chronological order, with updated vocal pitches and the screening report.
 * @throws A Zod error for invalid score or timing shapes, a `RangeError` when timing is incomplete, unordered, or too late, or a `SimilarityError` when a melody is too similar.
 */
export function compile_score(
  input: unknown,
  lyric_timing: readonly TimedSyllable[],
  history: Readonly<Record<string, readonly number[]>> | null = null,
): CompiledScore {
  const score = ArrangementScore.parse(input);
  const bar_seconds = 240 / score.tempo_bpm;
  const step_seconds = bar_seconds / 8;
  const duration_seconds = score.bars * bar_seconds;
  const timing = validate_timing(lyric_timing, duration_seconds);
  const backing: Note[] = [];
  const chords: z.infer<typeof Chord>[] = [];

  for (let bar = 0; bar < score.bars; bar++) {
    const chord_degree = score.progression[bar % score.progression.length]!;
    const start_seconds = bar * bar_seconds;
    const pitches = [0, 2, 4].map(degree => scale_pitch(score, chord_degree, degree, ROOT_PITCH.pad));
    chords.push(Chord.parse({
      start_seconds,
      duration_seconds: bar_seconds,
      root_midi: pitches[0],
      pitches,
    }));

    for (const track of score.tracks) {
      if (track.instrument === "pad" || track.instrument === "bass" || track.instrument === "lead") {
        for (const event of track.events) {
          backing.push({
            start: start_seconds + event.step * step_seconds,
            duration: event.duration_steps * step_seconds,
            pitch: scale_pitch(score, chord_degree, event.degree, ROOT_PITCH[track.instrument]),
            instrument: track.instrument,
            gain: GAIN[track.instrument],
          });
        }
      } else {
        for (const event of track.events) {
          backing.push({
            start: start_seconds + event.step * step_seconds,
            duration: event.duration_steps * step_seconds,
            pitch: DRUM_PITCH[track.instrument],
            instrument: track.instrument,
            gain: GAIN[track.instrument],
          });
        }
      }
    }
  }

  const vocal: Note[] = [];
  const compiled_timing = timing.map((row, index) => {
    const bar = Math.floor(row.start_seconds / bar_seconds);
    const chord_degree = score.progression[bar % score.progression.length]!;
    const degree = score.hook_motif[index % score.hook_motif.length]!;
    const pitch = scale_pitch(score, chord_degree, degree, ROOT_PITCH.vocal);
    vocal.push({ start: row.start_seconds, duration: row.duration_seconds, pitch, instrument: "vocal", gain: GAIN.vocal });
    return { ...row, midi_note: pitch };
  });

  const by_time = (left: Note, right: Note) =>
    left.start - right.start || left.instrument.localeCompare(right.instrument) || left.pitch - right.pitch;
  backing.sort(by_time);
  vocal.sort(by_time);

  const melodies = {
    lead: backing.filter(note => note.instrument === "lead").map(note => note.pitch),
    vocal: vocal.map(note => note.pitch),
  };
  const similarity = screen(melodies, history);

  return {
    duration_seconds,
    backing,
    vocal,
    chords,
    timing: compiled_timing,
    melodies,
    similarity,
  };
}
