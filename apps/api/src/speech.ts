import * as sdk from "microsoft-cognitiveservices-speech-sdk";
import { FRAMES, SAMPLE_RATE, musical_plan, tone, vocal_pitch, type Audio, type Note, type Seed } from "./dsp.js";

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
function decode_pcm(buffer: Buffer): Audio {
  const invalid = (): never => { throw new RangeError("Azure returned an unexpected PCM format"); };
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

/** Fit complete word intervals into quarter-second slots between seconds 3 and 25.
 * @returns Owned speech modulator, harmonic carrier, notes and source-to-target mapping.
 */
export function align(utterance: Utterance, text: string, root: number, { melody_seed = null }: { melody_seed?: Seed | null } = {}): [Audio, Audio, Note[], WordAlignment[]] {
  validate_utterance(utterance, text);
  if (utterance.words.length > 88) throw new RangeError("Script has too many words for the bounded vocal window");
  const slots = utterance.words.map(word => Math.max(1, Math.round(word.duration / 0.25)));
  let sum = slots.reduce((a, b) => a + b, 0);
  while (sum > 88) {
    const maximum = Math.max(...slots), index = slots.indexOf(maximum);
    slots[index]--; sum--;
  }
  const modulator = new Float64Array(FRAMES), carrier = new Float64Array(FRAMES), notes: Note[] = [], alignment: WordAlignment[] = [];
  let start = 3;
  const seed = melody_seed ?? root, transpose = root - musical_plan(seed).root;
  utterance.words.forEach((word, index) => {
    const duration = slots[index] * 0.25;
    const source = utterance.audio.subarray(Math.round(word.offset * SAMPLE_RATE), Math.round((word.offset + word.duration) * SAMPLE_RATE));
    if (source.length < 2) throw new RangeError("Source word interval is too short");
    const count = Math.round(duration * SAMPLE_RATE), fitted = new Float64Array(count);
    for (let i = 0; i < count; i++) {
      const position = i * (source.length - 1) / (count - 1), left = Math.floor(position), fraction = position - left;
      fitted[i] = source[left] * (1 - fraction) + source[Math.min(left + 1, source.length - 1)] * fraction;
    }
    const fade = Math.min(Math.round(0.005 * SAMPLE_RATE), Math.floor(count / 2));
    for (let i = 0; i < fade; i++) { const weight = i / (fade - 1); fitted[i] *= weight; fitted[count - i - 1] *= weight; }
    const pitch = vocal_pitch(seed, index, start) + transpose;
    if (!Number.isInteger(pitch) || pitch < 0 || pitch > 127) throw new RangeError("Aligned MIDI pitch is out of range");
    const destination = Math.round(start * SAMPLE_RATE);
    modulator.set(fitted, destination); carrier.set(tone(pitch, duration), destination);
    notes.push({ start, duration, pitch, instrument: "vocal", gain: 0.25 });
    alignment.push({ word: word.text, source_offset_seconds: word.offset, source_duration_seconds: word.duration, text_offset: word.text_offset, target_offset_seconds: start, target_duration_seconds: duration, midi_note: pitch });
    start += duration;
  });
  return [modulator, carrier, notes, alignment];
}

/** Place complete unmodified speech near the end, retaining one second of final silence. */
export function place_spoken(utterance: Utterance): Audio {
  if (utterance.audio.length > 25 * SAMPLE_RATE) throw new RangeError("Natural speech exceeds the 25-second window; shorten the script");
  if (!utterance.audio.length || !utterance.audio.every(Number.isFinite)) throw new RangeError("Speech must be finite nonempty audio");
  const output = new Float64Array(FRAMES);
  output.set(utterance.audio, FRAMES - SAMPLE_RATE - utterance.audio.length);
  return output;
}
