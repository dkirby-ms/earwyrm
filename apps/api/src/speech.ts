import * as sdk from "microsoft-cognitiveservices-speech-sdk";
import { DURATION, SAMPLE_RATE, ScoreDuration, musical_form, musical_plan, tone, vocal_pitch, type Audio, type MusicalForm, type Note, type Seed } from "./dsp.js";
import { SyllableNote } from "./melody.js";

export const VOICE = "en-US-JennyNeural";

/** Source word interval in seconds and zero-based plain-text UTF-16 position. */
export interface Word { text: string; offset: number; duration: number; text_offset: number }
/** Mono speech plus complete source boundary events and provider result identifier. */
export interface Utterance { audio: Audio; words: Word[]; result_id: string }
/** Explicit single-request synthesis; implementations must not silently retry. */
export interface SpeechProvider {
  /** Resolve complete speech and timings, or reject without exposing provider diagnostics. */
  synthesize(text: string): Promise<Utterance>;
}
/** Word-to-note timing evidence; offsets and durations are seconds. */
export interface WordAlignment {
  word: string; source_offset_seconds: number; source_duration_seconds: number; text_offset: number;
  target_offset_seconds: number; target_duration_seconds: number; midi_note: number;
}

/** First hook word after the last sentence boundary; unsplit text uses its second half. */
export function hook_word_index(utterance: Utterance, text: string): number {
  const boundary = [...text.matchAll(/[.!?]\s+(?=[A-Za-z])/g)].at(-1);
  const index = boundary ? utterance.words.findIndex(word => word.text_offset >= boundary.index + boundary[0].length) : -1;
  return index > 0 ? index : Math.max(1, Math.floor(utterance.words.length / 2));
}

/** Explicit stock Azure voice adapter, with no audio device or hidden retries. */
export class AzureSpeech implements SpeechProvider {
  constructor() {
    if (!process.env.SPEECH_KEY || !process.env.SPEECH_REGION) throw new Error("Set SPEECH_KEY and SPEECH_REGION locally; never paste keys into chat");
  }

  /** Synthesize once, close the SDK instance on every outcome and reject after 60 seconds. */
  async synthesize(text: string): Promise<Utterance> {
    const config = sdk.SpeechConfig.fromSubscription(process.env.SPEECH_KEY!, process.env.SPEECH_REGION!);
    config.speechSynthesisVoiceName = VOICE;
    config.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Riff24Khz16BitMonoPcm;
    const synthesizer = new sdk.SpeechSynthesizer(config, null);
    const words: Word[] = [];
    synthesizer.wordBoundary = (_sender, event) => {
      if (event.boundaryType === sdk.SpeechSynthesisBoundaryType.Word) words.push({ text: event.text, offset: event.audioOffset / 10_000_000, duration: event.duration / 10_000_000, text_offset: event.textOffset });
    };
    const result = await new Promise<sdk.SpeechSynthesisResult>((resolve, reject) => {
      let completed = false;
      const finish = (value: sdk.SpeechSynthesisResult | Error): void => {
        if (completed) return;
        completed = true;
        clearTimeout(timeout);
        synthesizer.close();
        if (value instanceof Error) reject(value); else resolve(value);
      };
      const timeout = setTimeout(() => finish(new Error("Azure Speech timed out after 60s; usage remains unknown")), 60000);
      synthesizer.speakTextAsync(text, value => finish(value), () => finish(new Error("Azure Speech SDK request failed; inspect resource diagnostics")));
    });
    if (result.reason !== sdk.ResultReason.SynthesizingAudioCompleted) throw new Error("Azure Speech did not complete; usage remains unknown; inspect resource diagnostics");
    const utterance = { audio: decode_pcm(Buffer.from(result.audioData)), words: words.sort((a, b) => a.offset - b.offset), result_id: result.resultId };
    validate_utterance(utterance, text);
    return utterance;
  }
}

/** Parse RIFF chunks instead of assuming a fixed WAV header from the provider. */
export function decode_pcm(buffer: Buffer): Audio {
  const invalid = (): never => { throw new RangeError("Unexpected mono PCM format"); };
  if (buffer.length < 12 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") return invalid();
  let valid_format = false, data: Buffer | undefined;
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const name = buffer.toString("ascii", offset, offset + 4), size = buffer.readUInt32LE(offset + 4), start = offset + 8;
    if (start + size > buffer.length) return invalid();
    if (name === "fmt ") {
      if (size < 16 || buffer.readUInt16LE(start) !== 1 || buffer.readUInt16LE(start + 2) !== 1 || buffer.readUInt32LE(start + 4) !== SAMPLE_RATE || buffer.readUInt16LE(start + 14) !== 16 || buffer.readUInt16LE(start + 12) !== 2) return invalid();
      valid_format = true;
    } else if (name === "data") data = buffer.subarray(start, start + size);
    offset = start + size + size % 2;
  }
  if (!valid_format || !data || data.length % 2) return invalid();
  const audio = new Float64Array(data.length / 2);
  for (let i = 0; i < audio.length; i++) audio[i] = data.readInt16LE(i * 2) / 32768;
  return audio;
}

const letters = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]/g, "");

function fit_interval(audio: Audio, offset: number, duration: number, target_duration: number): Audio {
  const source = audio.subarray(Math.round(offset * SAMPLE_RATE), Math.round((offset + duration) * SAMPLE_RATE));
  if (source.length < 2) throw new RangeError("Source vocal interval is too short");
  const count = Math.round(target_duration * SAMPLE_RATE), fitted = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    const position = i * (source.length - 1) / (count - 1), left = Math.floor(position), fraction = position - left;
    fitted[i] = source[left] * (1 - fraction) + source[Math.min(left + 1, source.length - 1)] * fraction;
  }
  const fade = Math.min(Math.round(0.005 * SAMPLE_RATE), Math.floor(count / 2));
  for (let i = 0; i < fade; i++) { const weight = i / (fade - 1); fitted[i] *= weight; fitted[count - i - 1] *= weight; }
  return fitted;
}

function align_committed(utterance: Utterance, timing: readonly SyllableNote[], duration_seconds: number): [Audio, Audio, Note[], WordAlignment[]] {
  ScoreDuration.parse(duration_seconds);
  const modulator = new Float64Array(duration_seconds * SAMPLE_RATE), carrier = new Float64Array(modulator.length);
  const notes: Note[] = [], alignment: WordAlignment[] = [];
  let index = 0, previous_end = 0;
  for (const word of utterance.words) {
    const expected = letters(word.text);
    let covered = '';
    while (covered.length < expected.length) {
      const event = SyllableNote.parse(timing[index++]);
      const label = letters(event.syllable);
      if (!label || !expected.startsWith(covered + label) || event.start_seconds < previous_end ||
          event.start_seconds + event.duration_seconds > Math.min(25, duration_seconds - 1)) {
        throw new RangeError("Committed vocal timing does not cover the complete words in order");
      }
      const offset = word.offset + word.duration * covered.length / expected.length;
      const source_duration = word.duration * label.length / expected.length;
      const start = Math.round(event.start_seconds * SAMPLE_RATE);
      modulator.set(fit_interval(utterance.audio, offset, source_duration, event.duration_seconds), start);
      carrier.set(tone(event.midi_note, event.duration_seconds), start);
      notes.push({ start: event.start_seconds, duration: event.duration_seconds, pitch: event.midi_note, instrument: 'vocal', gain: 0.25 });
      alignment.push({
        word: word.text, source_offset_seconds: offset, source_duration_seconds: source_duration,
        text_offset: word.text_offset, target_offset_seconds: event.start_seconds,
        target_duration_seconds: event.duration_seconds, midi_note: event.midi_note,
      });
      covered += label;
      previous_end = event.start_seconds + event.duration_seconds;
    }
  }
  if (index !== timing.length) throw new RangeError("Committed vocal timing has unmatched notes");
  return [modulator, carrier, notes, alignment];
}

/** Reject missing, overlapping, nonfinite or mismatched word events without dropping text. */
export function validate_utterance(utterance: Utterance, text: string): void {
  const audio = utterance.audio;
  let peak = 0;
  for (const sample of audio) {
    if (!Number.isFinite(sample)) throw new RangeError("Speech must be finite, non-silent mono audio");
    peak = Math.max(peak, Math.abs(sample));
  }
  if (!(audio instanceof Float64Array) || !audio.length || peak < 1e-8) throw new RangeError("Speech must be finite, non-silent mono audio");
  if (!utterance.words.length || letters(utterance.words.map(word => word.text).join("")) !== letters(text)) throw new RangeError("Word boundary events do not cover the complete script");
  let previous_end = 0, previous_text_end = 0;
  for (const word of utterance.words) {
    if (![word.offset, word.duration].every(Number.isFinite) || word.offset < 0 || word.duration <= 0 || word.offset < previous_end - 1 / SAMPLE_RATE || word.offset + word.duration > audio.length / SAMPLE_RATE + 1 / SAMPLE_RATE || !Number.isInteger(word.text_offset) || word.text_offset < previous_text_end || !word.text.length || text.slice(word.text_offset, word.text_offset + word.text.length) !== word.text) throw new RangeError("Invalid source word timing or text position");
    previous_end = word.offset + word.duration;
    previous_text_end = word.text_offset + word.text.length;
  }
}

/** Fit complete words to quarter-second notes, optionally separating verse and hook.
 * @remarks Without a form, retains the legacy seconds 3-25 window and 30-second buffers.
 * @returns Owned speech modulator, harmonic carrier, notes and source-to-target mapping.
 */
export function align(utterance: Utterance, text: string, root: number, { melody_seed = null, form, timing }: { melody_seed?: Seed | null; form?: MusicalForm; timing?: readonly SyllableNote[] } = {}): [Audio, Audio, Note[], WordAlignment[]] {
  validate_utterance(utterance, text);
  if (timing) return align_committed(utterance, timing, form?.duration_seconds ?? DURATION);
  if (utterance.words.length > 88) throw new RangeError("Script has too many words for the bounded vocal window");
  if (form) {
    const expected = musical_form(form.duration_seconds);
    if (form.hook_start_seconds !== expected.hook_start_seconds || form.cadence_start_seconds !== expected.cadence_start_seconds) throw new RangeError("Invalid musical form");
  }
  const slots = utterance.words.map(word => Math.max(1, Math.round(word.duration / 0.25)));
  let sum = slots.reduce((a, b) => a + b, 0);
  while (sum > 88) {
    const maximum = Math.max(...slots), index = slots.indexOf(maximum);
    slots[index]--; sum--;
  }
  const frames = (form?.duration_seconds ?? DURATION) * SAMPLE_RATE;
  const modulator = new Float64Array(frames), carrier = new Float64Array(frames), notes: Note[] = [], alignment: WordAlignment[] = [];
  const starts: number[] = [];
  const split = form ? hook_word_index(utterance, text) : utterance.words.length;
  if (form) {
    const rhythm = musical_plan(melody_seed ?? root).rhythm;
    for (const [first, last, start, end] of [[0, split, 0.5, form.hook_start_seconds - 0.25],
      [split, utterance.words.length, form.hook_start_seconds, form.cadence_start_seconds - 0.25]]) {
      if (first === last) continue;
      const capacity = Math.floor((end - start) * 4);
      if (capacity < last - first) throw new RangeError("Complete verse or hook cannot fit the musical form; shorten the script");
      for (let i = first; i < last; i++) slots[i] = 1;
      const rests = capacity >= (last - first) * 2 ? Math.floor((last - first - 1) / 4) : 0;
      let remaining = capacity - (last - first) - rests;
      while (remaining > 0) {
        const eligible = Array.from({ length: last - first }, (_, i) => first + i).filter(i => slots[i] < 4);
        if (!eligible.length) break;
        const index = eligible.reduce((best, i) => slots[i] / (utterance.words[i].duration * 4 + rhythm[(i - first) % 8]) <
          slots[best] / (utterance.words[best].duration * 4 + rhythm[(best - first) % 8]) ? i : best);
        slots[index]++; remaining--;
      }
      let cursor = start;
      for (let i = first; i < last; i++) {
        starts[i] = cursor;
        cursor += slots[i] * 0.25;
        if (rests && (i - first + 1) % 4 === 0 && i < last - 1) cursor += 0.25;
      }
    }
  } else {
    let cursor = 3;
    for (let i = 0; i < slots.length; i++) { starts[i] = cursor; cursor += slots[i] * 0.25; }
  }
  const seed = melody_seed ?? root, transpose = root - musical_plan(seed).root;
  utterance.words.forEach((word, index) => {
    const start = starts[index], duration = slots[index] * 0.25;
    const fitted = fit_interval(utterance.audio, word.offset, word.duration, duration);
    const phrase_index = index >= split ? index - split : index;
    const pitch = (form && index === utterance.words.length - 1 ? musical_plan(seed).pitch(7) :
      vocal_pitch(seed, phrase_index, start, form?.duration_seconds)) + transpose;
    if (!Number.isInteger(pitch) || pitch < 0 || pitch > 127) throw new RangeError("Aligned MIDI pitch is out of range");
    const destination = Math.round(start * SAMPLE_RATE);
    modulator.set(fitted, destination); carrier.set(tone(pitch, duration), destination);
    notes.push({ start, duration, pitch, instrument: "vocal", gain: 0.25 });
    alignment.push({ word: word.text, source_offset_seconds: word.offset, source_duration_seconds: word.duration, text_offset: word.text_offset, target_offset_seconds: start, target_duration_seconds: duration, midi_note: pitch });
  });
  return [modulator, carrier, notes, alignment];
}

/** Place complete unmodified speech near the end, retaining one second of final silence. */
export function place_spoken(utterance: Utterance, duration_seconds = DURATION): Audio {
  ScoreDuration.parse(duration_seconds);
  if (utterance.audio.length > Math.min(25, duration_seconds - 2) * SAMPLE_RATE) throw new RangeError("Natural speech exceeds the bounded 25-second maximum window; shorten the script");
  if (!utterance.audio.length || !utterance.audio.every(Number.isFinite)) throw new RangeError("Speech must be finite nonempty audio");
  const output = new Float64Array(duration_seconds * SAMPLE_RATE);
  output.set(utterance.audio, output.length - SAMPLE_RATE - utterance.audio.length);
  return output;
}
