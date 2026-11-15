import { writeFileSync } from "node:fs";
import { z } from "zod";

/** Canonical seed: safe integers stay numbers; larger signed-63-bit values are decimal strings. */
export const Seed = z.union([
  z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  z.string().regex(/^[1-9][0-9]{15,18}(?![\s\S])/).refine(value =>
    /^[1-9][0-9]{15,18}(?![\s\S])/.test(value) && BigInt(value) > BigInt(Number.MAX_SAFE_INTEGER) && BigInt(value) <= 9223372036854775807n,
  { message: "String seeds must represent MAX_SAFE_INTEGER+1 through 9223372036854775807" }),
]);
export type Seed = z.infer<typeof Seed>;

/** Validate a canonical seed without coercion or precision loss; reject unsafe numeric inputs.
 * @remarks Legacy JSON numbers require source-aware decoding before calling this helper.
 */
export function parse_seed(value: unknown): Seed {
  const parsed = Seed.safeParse(value);
  if (!parsed.success) throw new RangeError("Seed must be a nonnegative safe integer or canonical oversized 63-bit decimal string");
  return parsed.data;
}

/** Mono floating-point PCM at SAMPLE_RATE; renderers return owned buffers. */
export type Audio = Float64Array;
export const SAMPLE_RATE = 24000;
export const DURATION = 30;
export const FRAMES = SAMPLE_RATE * DURATION;
/** Seconds per quarter note at 120 BPM. */
export const BEAT = 0.5;

/** MIDI pitch and instrument event; start and duration are seconds. */
export interface Note {
  start: number;
  duration: number;
  pitch: number;
  instrument: string;
  gain: number;
}

/** Seeded diatonic identity shared by backing and vocal melodies. */
export interface MusicalPlan {
  root: number;
  scale: number[];
  progression: number[];
  motif: number[];
  rhythm: number[];
  /** Map any integer scale degree, including negative degrees, to MIDI pitch. */
  pitch(degree: number): number;
}

/** Deterministic local PRNG; safe-number streams remain stable and string seeds use 64-bit mixing. */
export function seeded_random(seed: Seed): () => number {
  seed = parse_seed(seed);
  let state: number;
  if (typeof seed === "number") state = (seed ^ Math.floor(seed / 0x100000000) ^ 0x9e3779b9) >>> 0;
  else {
    let mixed = BigInt.asUintN(64, BigInt(seed) + 0x9e3779b97f4a7c15n);
    mixed = BigInt.asUintN(64, (mixed ^ (mixed >> 30n)) * 0xbf58476d1ce4e5b9n);
    mixed = BigInt.asUintN(64, (mixed ^ (mixed >> 27n)) * 0x94d049bb133111ebn);
    mixed ^= mixed >> 31n;
    state = Number((mixed ^ (mixed >> 32n)) & 0xffffffffn) >>> 0;
  }
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
  };
}

/** Synthesize harmonic PCM with click-free edges; duration is seconds. */
export function tone(pitch: number, duration: number, { bright = true }: { bright?: boolean } = {}): Audio {
  if (!Number.isFinite(pitch) || !Number.isFinite(duration) || duration < 0 || duration > DURATION) throw new RangeError("Invalid oscillator pitch or duration");
  const count = Math.round(duration * SAMPLE_RATE);
  const output = new Float64Array(count);
  const frequency = 440 * 2 ** ((pitch - 69) / 12);
  const harmonics = bright ? Math.max(0, Math.min(30, Math.floor(11000 / frequency))) : 3;
  for (let h = 1; h <= harmonics; h++) {
    for (let i = 0; i < count; i++) output[i] += Math.sin(2 * Math.PI * frequency * h * i / SAMPLE_RATE) / h;
  }
  fade_edges(output, Math.min(Math.round(0.012 * SAMPLE_RATE), Math.floor(count / 2)));
  return output;
}

function fade_edges(audio: Audio, count: number): void {
  for (let i = 0; i < count; i++) {
    const weight = count > 1 ? i / (count - 1) : 0;
    audio[i] *= weight;
    audio[audio.length - i - 1] *= weight;
  }
}

/** Choose repeatable root, mode, harmony, hook and eighth-note rhythm. */
export function musical_plan(seed: Seed): MusicalPlan {
  const random = seeded_random(seed);
  const choose = <T>(values: T[]): T => values[Math.floor(random() * values.length)];
  const root = choose([45, 47, 48, 50, 52, 53, 55]);
  const scale = random() >= 0.5 ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
  const progression = choose([[0, 5, 3, 4], [0, 3, 4, 0], [0, 5, 1, 4], [0, 4, 5, 3]]);
  let degree = choose([0, 2, 4]);
  const motif = [degree];
  for (let i = 0; i < 6; i++) {
    degree = Math.max(0, Math.min(9, degree + choose([-3, -2, -1, 1, 2, 3])));
    motif.push(degree);
  }
  motif.push(choose([0, 2, 4]));
  const rhythm = Array<number>(8).fill(1);
  for (let i = 0; i < 8; i++) rhythm[Math.floor(random() * 8)]++;
  return { root, scale, progression, motif, rhythm, pitch: degree => root + scale[((degree % 7) + 7) % 7] + Math.floor(degree / 7) * 12 };
}

/** Develop the shared hook over the chord at an onset measured in seconds. */
export function vocal_pitch(seed: Seed, index: number, start: number): number {
  const plan = musical_plan(seed);
  const chord = plan.progression[Math.min(14, Math.floor(start / 2)) % 4];
  let degree = plan.motif[index % 8];
  if (start >= 14 && start < 22) degree = 7 - degree;
  return plan.pitch(degree + chord) + 12;
}

/** Compose a 30-second 120 BPM intro, returning hook, bridge and cadence. */
export function compose(index: Seed): Note[] {
  const plan = musical_plan(index);
  const notes: Note[] = [];
  for (let bar = 0; bar < 15; bar++) {
    const chord = bar < 14 ? plan.progression[bar % 4] : 0;
    const start = bar * 2;
    const inversion = typeof index === "number" ? (bar + index) % 3 : Number((BigInt(index) + BigInt(bar)) % 3n);
    [chord, chord + 2, chord + 4].forEach((degree, voice) => notes.push({ start, duration: 1.9, pitch: plan.pitch(degree) + (voice < inversion ? 12 : 0), instrument: "pad", gain: 0.045 }));
    for (let beat = 0; beat < 4; beat++) {
      notes.push({ start: start + beat * BEAT, duration: 0.38, pitch: plan.pitch(chord + (beat === 3 && bar % 2 ? 4 : 0)) - 12, instrument: "bass", gain: 0.15 });
      notes.push({ start: start + beat * BEAT, duration: 0.16, pitch: 36, instrument: "kick", gain: 0.21 });
      if (bar !== 0 && bar !== 14) notes.push({ start: start + beat * BEAT + 0.25, duration: 0.055, pitch: 42, instrument: "hat", gain: 0.028 });
    }
    if (bar === 0) continue;
    let cursor = 0;
    plan.rhythm.forEach((length, step) => {
      const position = ((bar - 1) % 2) * 8;
      if (cursor >= position && cursor < position + 8) {
        const onset = start + (cursor - position) * 0.25;
        notes.push({ start: onset, duration: Math.min(length * 0.25 * 0.85, 30 - onset), pitch: bar === 14 ? plan.pitch(7) : vocal_pitch(index, step, onset), instrument: "lead", gain: 0.045 });
      }
      cursor += length;
    });
  }
  return notes;
}

function validate_note(note: Note): void {
  if (![note.start, note.duration, note.pitch, note.gain].every(Number.isFinite) || note.start < 0 || note.duration <= 0 || note.start + note.duration > DURATION + 1e-9 || !Number.isInteger(note.pitch) || note.pitch < 0 || note.pitch > 127 || note.gain < 0 || !["pad", "bass", "lead", "vocal", "kick", "hat"].includes(note.instrument)) throw new RangeError("Invalid note timing, pitch or instrument");
}

/** Render oscillator instruments and seeded noise into exactly FRAMES samples. */
export function synthesize(notes: readonly Note[], { seed }: { seed: Seed }): Audio {
  const output = new Float64Array(FRAMES);
  const random = seeded_random(seed);
  for (const note of notes) {
    validate_note(note);
    const count = Math.round(note.duration * SAMPLE_RATE);
    const audio = note.instrument === "kick" || note.instrument === "hat" ? new Float64Array(count) : tone(note.pitch, note.duration, { bright: note.instrument === "lead" });
    let previous = 0;
    const start = Math.round(note.start * SAMPLE_RATE);
    for (let i = 0; i < count && start + i < FRAMES; i++) {
      const t = i / SAMPLE_RATE;
      if (note.instrument === "kick") audio[i] = Math.sin(2 * Math.PI * (48 * t + 7 * (1 - Math.exp(-35 * t)))) * Math.exp(-25 * t);
      else if (note.instrument === "hat") {
        const noise = Math.sqrt(-2 * Math.log(Math.max(Number.EPSILON, random()))) * Math.cos(2 * Math.PI * random());
        audio[i] = (noise - previous) * Math.exp(-65 * t);
        previous = noise;
      } else if (note.instrument === "lead") audio[i] *= Math.exp(-5 * t);
      output[start + i] += note.gain * audio[i];
    }
  }
  return output;
}

function peak(audio: Audio): number {
  let maximum = 0;
  for (const sample of audio) {
    if (!Number.isFinite(sample)) throw new RangeError("Audio samples must be finite");
    maximum = Math.max(maximum, Math.abs(sample));
  }
  return maximum;
}

/** Return faded, -1 dB peak-normalized audio; reject silence or non-30-second input. */
export function normalize(audio: Audio): Audio {
  if (audio.length !== FRAMES) throw new RangeError("Audio must contain exactly 30 seconds of finite samples");
  const maximum = peak(audio);
  if (maximum < 1e-8) throw new RangeError("Refusing to export silent audio");
  const output = audio.slice();
  fade_edges(output, Math.round(0.03 * SAMPLE_RATE));
  const gain = 10 ** (-1 / 20) / maximum;
  for (let i = 0; i < output.length; i++) output[i] *= gain;
  return output;
}

/** Butterworth biquad, retaining state across the complete input buffer. */
function filter(audio: Audio, cutoff: number, highpass = false): Audio {
  const w = 2 * Math.PI * cutoff / SAMPLE_RATE;
  const c = Math.cos(w), alpha = Math.sin(w) / Math.SQRT2, a0 = 1 + alpha;
  const b0 = (1 + (highpass ? c : -c)) / 2 / a0;
  const b1 = (highpass ? -(1 + c) : 1 - c) / a0, b2 = b0;
  const a1 = -2 * c / a0, a2 = (1 - alpha) / a0;
  const out = new Float64Array(audio.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < audio.length; i++) {
    const x = audio[i], y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    out[i] = y; x2 = x1; x1 = x; y2 = y1; y1 = y;
  }
  return out;
}

/** Duck the bed using vocal energy and return a normalized 30-second mix. */
export function mix(bed: Audio, vocal: Audio): Audio {
  if (bed.length !== FRAMES || vocal.length !== FRAMES) throw new RangeError("Mix inputs must contain 30 seconds");
  peak(bed);
  const maximum = peak(vocal);
  if (maximum < 1e-8) throw new RangeError("Vocal is silent");
  const normalized = vocal.map(value => value / maximum);
  const envelope = filter(normalized.map(Math.abs), 12);
  return normalize(bed.map((value, i) => value * (0.55 - 0.35 * Math.max(0, Math.min(1, envelope[i] * 12))) + normalized[i] * 0.7));
}

/** Transfer 18 logarithmic speech-band envelopes plus unvoiced consonants. */
export function vocode(modulator: Audio, carrier: Audio): Audio {
  if (modulator.length !== carrier.length) throw new RangeError("Vocoder inputs must have equal lengths");
  peak(modulator); peak(carrier);
  const output = new Float64Array(modulator.length);
  for (let band = 0; band < 18; band++) {
    const low = 90 * (10500 / 90) ** (band / 18), high = 90 * (10500 / 90) ** ((band + 1) / 18);
    const speech = filter(filter(modulator, low, true), high);
    const envelope = filter(speech.map(Math.abs), 35);
    const sound = filter(filter(carrier, low, true), high);
    let square = 0;
    for (const sample of sound) square += sample * sample;
    const rms = Math.sqrt(square / Math.max(1, sound.length));
    if (rms > 1e-8) for (let i = 0; i < output.length; i++) output[i] += envelope[i] * sound[i] / rms;
  }
  const consonants = filter(modulator, 3000, true);
  for (let i = 0; i < output.length; i++) output[i] += 0.3 * consonants[i];
  return output;
}

/** Synchronously write mono PCM16; reject nonfinite or clipping samples. */
export function write_wav(path: string, audio: Audio): void {
  if (!audio.length || peak(audio) > 1) throw new RangeError("PCM samples must be nonempty, finite and within [-1, 1]");
  const buffer = Buffer.alloc(44 + audio.length * 2);
  buffer.write("RIFF", 0); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24); buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34); buffer.write("data", 36); buffer.writeUInt32LE(audio.length * 2, 40);
  audio.forEach((sample, i) => buffer.writeInt16LE(Math.round(sample * 32767), 44 + i * 2));
  writeFileSync(path, buffer);
}

function variable_length(value: number): number[] {
  const result = [value & 127];
  while ((value = Math.floor(value / 128)) > 0) result.unshift((value & 127) | 128);
  return result;
}

/** Synchronously write a type-0, 480 PPQ MIDI score ending at 30 seconds. */
export function write_midi(path: string, notes: readonly Note[]): void {
  const channels: Record<string, number> = { pad: 0, bass: 1, lead: 2, vocal: 3, kick: 9, hat: 9 };
  const events: [number, number[]][] = [[0, [255, 81, 3, 7, 161, 32]]];
  for (const note of notes) {
    validate_note(note);
    const channel = channels[note.instrument], velocity = Math.max(1, Math.min(127, Math.round(note.gain * 300)));
    events.push([Math.round(note.start / BEAT * 480), [144 | channel, note.pitch, velocity]], [Math.round((note.start + note.duration) / BEAT * 480), [128 | channel, note.pitch, 0]]);
  }
  events.sort((a, b) => a[0] - b[0] || Buffer.compare(Buffer.from(a[1]), Buffer.from(b[1])));
  const track: number[] = [];
  let previous = 0;
  for (const [tick, message] of events) { track.push(...variable_length(tick - previous), ...message); previous = tick; }
  track.push(...variable_length(Math.max(0, 60 * 480 - previous)), 255, 47, 0);
  const header = Buffer.alloc(22);
  header.write("MThd", 0); header.writeUInt32BE(6, 4); header.writeUInt16BE(0, 8); header.writeUInt16BE(1, 10); header.writeUInt16BE(480, 12); header.write("MTrk", 14); header.writeUInt32BE(track.length, 18);
  writeFileSync(path, Buffer.concat([header, Buffer.from(track)]));
}
