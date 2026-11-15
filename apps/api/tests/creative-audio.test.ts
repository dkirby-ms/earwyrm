import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { FRAMES, SAMPLE_RATE, Seed, compose, mix, musical_plan, normalize, parse_seed, seeded_random, synthesize, tone, vocode, write_midi, write_wav } from "../src/dsp.js";
import { CompositionRequest, arrange } from "../src/melody.js";
import { KNOWN_TUNES, SimilarityError, screen, select_screened, similarity } from "../src/similarity.js";
import { align, place_spoken, validate_utterance, type Utterance } from "../src/speech.js";

const paths: string[] = [];
afterEach(() => { for (const path of paths.splice(0)) rmSync(path, { recursive: true, force: true }); });
const request_data = () => ({
  logical_job_id: "test-version-1", product_path: "vocoded", lyrics: "Cedar Loop brings bright sound to your day", seed: 42,
  lines: [{ text: "Cedar Loop brings bright sound to your day", syllables: ["Ce", "dar", "Loop", "brings", "bright", "sound", "to", "your", "day"], start_seconds: 3, end_seconds: 7 }],
});

function speech(): Utterance {
  const audio = new Float64Array(Math.round(0.7 * SAMPLE_RATE));
  const words = [{ text: "Cedar", offset: 0, duration: 0.24, text_offset: 0 }, { text: "Loop", offset: 0.3, duration: 0.24, text_offset: 6 }];
  for (const word of words) audio.set(tone(60, word.duration, { bright: false }).map(value => value * 0.2), Math.round(word.offset * SAMPLE_RATE));
  return { audio, words, result_id: "TEST-ONLY-NOT-AZURE" };
}

describe("creative score contracts", () => {
  it("fits every syllable exactly and shares chord voicings with backing", () => {
    const request = CompositionRequest.parse(request_data()), result = arrange(request, 42);
    expect(result).toEqual(arrange(request, 42));
    expect(result.timing.map(row => row.syllable)).toEqual(request.lines[0].syllables);
    expect(result.timing[0].start_seconds).toBe(3);
    expect(result.timing.at(-1)!.start_seconds + result.timing.at(-1)!.duration_seconds).toBe(7);
    expect(result.vocal.every(note => note.duration >= 0.125 && note.duration <= 1)).toBe(true);
    expect(result.vocal.map(note => [note.start, note.duration, note.pitch])).toEqual(result.timing.map(row => [row.start_seconds, row.duration_seconds, row.midi_note]));
    expect(result.chords).toHaveLength(15);
    expect(result.chords[0].pitches).toEqual(result.backing.filter(note => note.instrument === "pad" && note.start === 0).map(note => note.pitch));
  });
  it.each(["coverage", "dense", "sparse", "overlap", "nan", "grid", "short", "path", "extra", "seed"])("rejects invalid %s input", change => {
    const data = request_data();
    const line = data.lines[0];
    if (change === "coverage") line.syllables.pop();
    else if (change === "dense") line.end_seconds = 3.5;
    else if (change === "sparse") line.end_seconds = 25;
    else if (change === "overlap") { data.lyrics += data.lyrics; data.lines.push({ ...line }); }
    else if (change === "nan") line.end_seconds = NaN;
    else if (change === "grid") line.start_seconds = 3.01;
    else if (change === "short") line.syllables = [line.text];
    else if (change === "path") data.product_path = "artist-style";
    else if (change === "seed") data.seed = Number.MAX_SAFE_INTEGER + 1;
    expect(CompositionRequest.safeParse(change === "extra" ? { ...data, unknown: true } : data).success).toBe(false);
  });
  it("varies melodic intervals, rhythm and harmony beyond transposition", () => {
    const scores = Array.from({ length: 24 }, (_, seed) => compose(seed));
    const leads = scores.map(score => score.filter(note => note.instrument === "lead"));
    expect(new Set(leads.map(lead => JSON.stringify(lead.slice(1).map((note, i) => note.pitch - lead[i].pitch)))).size).toBeGreaterThanOrEqual(20);
    expect(new Set(leads.map(lead => JSON.stringify(lead.map(note => note.start)))).size).toBeGreaterThanOrEqual(20);
    expect(new Set(scores.map((_, seed) => JSON.stringify(musical_plan(seed).progression))).size).toBeGreaterThanOrEqual(3);
    expect(scores.flat().every(note => note.start >= 0 && note.duration > 0 && note.start + note.duration <= 30 && note.pitch >= 0 && note.pitch <= 127)).toBe(true);
  });
  it("rejects unsafe 63-bit JSON seeds rather than accepting rounded seed identities", () => {
    const data = request_data();
    const unsafe = JSON.parse(JSON.stringify(data).replace('"seed":42', '"seed":9223372036854775807'));
    expect(CompositionRequest.safeParse(unsafe).success).toBe(false);
    expect(CompositionRequest.parse({ ...data, seed: Number.MAX_SAFE_INTEGER }).seed).toBe(Number.MAX_SAFE_INTEGER);
    expect(() => select_screened(() => ["never-built", { lead: [60, 63, 61, 66, 62, 68, 67, 71] }], { seed: Number.MAX_SAFE_INTEGER + 1 })).toThrow("safe integer");
    const [seed] = select_screened(value => [value, { lead: [60, 63, 61, 66, 62, 68, 67, 71] }], { seed: null });
    expect(typeof seed === "number" && Number.isSafeInteger(seed) && seed >= 0).toBe(true);
  });
  it.each([
    ["0", false], ["42", false], ["9007199254740991", false], ["9007199254740992", true],
    ["9223372036854775807", true], ["9223372036854775808", false], ["09007199254740992", false],
    ["+9007199254740992", false], ["-9007199254740992", false], ["9.007199254740992e15", false],
    ["9007199254740992.0", false], [" 9007199254740992", false], ["9007199254740992\n", false],
    [9223372036854775807n, false], [Number.MAX_SAFE_INTEGER + 1, false], [NaN, false], [Infinity, false],
    [-1, false], [0.5, false], [0, true], [Number.MAX_SAFE_INTEGER, true],
  ])("enforces canonical lossless seed %s", (value, valid) => {
    expect(Seed.safeParse(value).success).toBe(valid);
    expect(CompositionRequest.safeParse({ ...request_data(), seed: value }).success).toBe(valid);
    if (valid) expect(parse_seed(value)).toBe(value);
    else expect(() => parse_seed(value)).toThrow("Seed");
  });
  it.each([
    [0, [0.3588899802416563, 0.10590326134115458, 0.675290479324758, 0.9179345588199794, 0.10157715040259063], "db866fa6c988a5d7202f2edeed257b13b7249f657805b3e48a23289f587964bd"],
    [42, [0.4813160905614495, 0.9852536325342953, 0.7379171899519861, 0.6130663156509399, 0.7036195879336447], "970fe3c7f032a0f184ce92d945ef19452b61dda48835f1d0e74fc936c9377ca7"],
    [Number.MAX_SAFE_INTEGER, [0.8929874321911484, 0.7592886493075639, 0.10753158875741065, 0.515314215561375, 0.7355424631386995], "ea35b8bf1643e8df064f89aa072051a64bade7c8c380424bfb838456f5717661"],
  ] as const)("preserves the existing safe-seed stream and score for %s", (seed, stream, score) => {
    const random = seeded_random(seed);
    expect(Array.from({ length: stream.length }, () => random())).toEqual(stream);
    expect(createHash("sha256").update(JSON.stringify(compose(seed))).digest("hex")).toBe(score);
  });
  it.each(["9007199254740992", "9223372036854775807"])("retains and renders oversized seed %s deterministically", seed => {
    const request = CompositionRequest.parse({ ...request_data(), seed }), arrangement = arrange(request, seed);
    expect(arrangement.seed).toBe(seed);
    expect(arrangement).toEqual(arrange(request, seed));
    const first = synthesize(arrangement.backing, { seed }), second = synthesize(compose(seed), { seed });
    expect(first).toHaveLength(FRAMES);
    expect(first.every(Number.isFinite) && first.some(value => value !== 0)).toBe(true);
    expect(Buffer.from(first.buffer).equals(Buffer.from(second.buffer))).toBe(true);
    const directory = join(process.cwd(), `.creative-audio-${randomUUID()}`);
    mkdirSync(directory); paths.push(directory);
    write_midi(join(directory, "first.mid"), [...arrangement.backing, ...arrangement.vocal]);
    write_midi(join(directory, "second.mid"), [...arrange(request, seed).backing, ...arrange(request, seed).vocal]);
    expect(readFileSync(join(directory, "first.mid")).equals(readFileSync(join(directory, "second.mid")))).toBe(true);
    const selected = select_screened(value => {
      const candidate = arrange(request, value);
      return [candidate, { vocal: candidate.vocal.map(note => note.pitch), lead: candidate.backing.filter(note => note.instrument === "lead").map(note => note.pitch) }];
    }, { seed });
    expect(selected[0]).toBe(seed); expect(selected[1].seed).toBe(seed); expect(selected[3].passed).toBe(true);
    const [modulator, carrier, notes] = align(speech(), "Cedar Loop", musical_plan(seed).root, { melody_seed: seed });
    expect(modulator.every(Number.isFinite) && carrier.some(value => value !== 0)).toBe(true);
    expect(notes).toHaveLength(2);
    expect(JSON.parse(JSON.stringify(arrangement)).seed).toBe(seed);
  });
  it("uses distinct deterministic streams for adjacent oversized decimal seeds", () => {
    const stream = (seed: Seed) => {
      const random = seeded_random(seed);
      return Array.from({ length: 8 }, () => random());
    };
    expect(stream("9223372036854775807")).toEqual(stream("9223372036854775807"));
    expect(stream("9223372036854775807")).not.toEqual(stream("9223372036854775806"));
    expect(stream("9007199254740992")).not.toEqual(stream("9007199254740993"));
  });
});

describe("DSP artifacts", () => {
  it("renders deterministic finite 30-second PCM and valid deterministic MIDI", () => {
    const notes = compose(42), first = synthesize(notes, { seed: 42 }), second = synthesize(notes, { seed: 42 });
    expect(Buffer.from(first.buffer).equals(Buffer.from(second.buffer))).toBe(true);
    expect(first).toHaveLength(FRAMES);
    expect(first.every(Number.isFinite)).toBe(true);
    const normalized = normalize(first);
    const directory = join(process.cwd(), `.creative-audio-${randomUUID()}`);
    mkdirSync(directory); paths.push(directory);
    write_wav(join(directory, "score.wav"), normalized);
    write_midi(join(directory, "first.mid"), notes);
    write_midi(join(directory, "second.mid"), compose(42));
    const wav = readFileSync(join(directory, "score.wav")), midi = readFileSync(join(directory, "first.mid"));
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt32LE(24)).toBe(24000);
    expect(wav.readUInt16LE(34)).toBe(16);
    expect(wav.readUInt32LE(40)).toBe(FRAMES * 2);
    let pcm_peak = 0, square = 0;
    for (let i = 44; i < wav.length; i += 2) { const sample = wav.readInt16LE(i); pcm_peak = Math.max(pcm_peak, Math.abs(sample)); square += sample * sample; }
    expect(pcm_peak).toBeGreaterThan(100); expect(pcm_peak).toBeLessThanOrEqual(29205);
    expect(Math.sqrt(square / FRAMES)).toBeGreaterThan(100);
    expect(midi.equals(readFileSync(join(directory, "second.mid")))).toBe(true);
    expect(midi.toString("ascii", 0, 4)).toBe("MThd");
    expect(midi.readUInt16BE(8)).toBe(0);
    expect(midi.readUInt16BE(12)).toBe(480);
    expect(midi.readUInt32BE(18)).toBe(midi.length - 22);
    let offset = 22, ticks = 0, on = 0, off = 0;
    while (offset < midi.length) {
      let delta = 0, byte;
      do { byte = midi[offset++]; delta = delta * 128 + (byte & 127); } while (byte & 128);
      ticks += delta;
      const status = midi[offset++];
      if (status === 255) { offset++; const length = midi[offset++]; offset += length; }
      else { if ((status & 240) === 144) on++; if ((status & 240) === 128) off++; offset += 2; }
    }
    expect(ticks).toBe(28800); expect(on).toBe(notes.length); expect(off).toBe(notes.length);
  });
  it("rejects invalid PCM, silence and negative note intervals before file output", () => {
    expect(() => normalize(new Float64Array(FRAMES))).toThrow("silent");
    expect(() => normalize(new Float64Array(2))).toThrow("30 seconds");
    expect(() => write_wav("must-not-exist.wav", new Float64Array([NaN]))).toThrow("finite");
    expect(() => write_wav("must-not-exist.wav", new Float64Array([1.01]))).toThrow("within");
    expect(() => synthesize([{ start: -1, duration: 1, pitch: 60, instrument: "lead", gain: 0.1 }], { seed: 0 })).toThrow("Invalid note");
    expect(() => synthesize([], { seed: -1 })).toThrow("Seed");
    expect(() => vocode(new Float64Array(1), new Float64Array(2))).toThrow("equal lengths");
    expect(() => mix(new Float64Array(FRAMES), new Float64Array(FRAMES))).toThrow("silent");
  });
});

describe("speech and 18-band vocoder", () => {
  it.each(["missing", "overlap", "text", "nonfinite", "audio", "overflow"])("rejects %s source events", change => {
    const utterance = speech();
    if (change === "missing") utterance.words.pop();
    else if (change === "overlap") utterance.words[1].offset = 0.1;
    else if (change === "text") utterance.words[1].text_offset = 0;
    else if (change === "nonfinite") utterance.words[0].duration = NaN;
    else if (change === "audio") utterance.audio[10] = Infinity;
    else utterance.words[1].duration = 9;
    expect(() => validate_utterance(utterance, "Cedar Loop")).toThrow();
  });
  it("preserves complete source text and bounded target timing while vocoding", () => {
    const utterance = speech();
    const [modulator, carrier, notes, mapping] = align(utterance, "Cedar Loop", 48);
    expect(modulator.subarray(0, 3 * SAMPLE_RATE).every(value => value === 0)).toBe(true);
    expect(notes.map(note => [note.start, note.duration, note.pitch])).toEqual(mapping.map(row => [row.target_offset_seconds, row.target_duration_seconds, row.midi_note]));
    expect(mapping.map(row => row.word).join(" ")).toBe("Cedar Loop");
    expect(mapping.at(-1)!.target_offset_seconds + mapping.at(-1)!.target_duration_seconds).toBeLessThanOrEqual(25);
    const vocal = vocode(modulator, carrier);
    expect(vocal.every(Number.isFinite)).toBe(true);
    expect(vocal.some(value => Math.abs(value) > 0.01)).toBe(true);
    const spoken = place_spoken(utterance);
    expect(spoken).toHaveLength(FRAMES);
    const start = FRAMES - SAMPLE_RATE - utterance.audio.length;
    expect(spoken.subarray(start, start + utterance.audio.length)).toEqual(utterance.audio);
    expect(() => place_spoken({ ...utterance, audio: new Float64Array(25 * SAMPLE_RATE + 1) })).toThrow("25-second");
    expect(() => align({ ...utterance, words: Array.from({ length: 89 }, (_, i) => ({ text: "a", offset: i * 0.001, duration: 0.001, text_offset: i })) }, "a".repeat(89), 48)).toThrow("too many words");
  });
});

describe("bounded matching-block melody screening", () => {
  it.each([0, 5, 12])("blocks known melody transposed by %i", transpose => {
    expect(() => screen({ vocal: KNOWN_TUNES["traditional:twinkle-twinkle"].map(pitch => pitch + transpose) })).toThrow(SimilarityError);
  });
  it("retains six-of-seven rejection threshold and does not substitute LCS", () => {
    const reference = [60, 62, 65, 61, 68, 66, 75, 74], near = [...reference.slice(0, -1), 75];
    expect(similarity(reference, near)).toBeCloseTo(6 / 7);
    expect(() => screen({ vocal: near }, { prior: reference })).toThrow(SimilarityError);
    // Longest-block greedy matching deliberately differs from LCS for these windows.
    const pitches = (intervals: number[]) => intervals.reduce((result, value) => [...result, result.at(-1)! + value], [60]);
    expect(similarity(pitches([0, 0, 0, 1, 0, 0, 0]), pitches([0, 1, 0, 0, 0, 0, 0]))).toBe(5 / 7);
  });
  it("bounds random attempts at eight, preserves explicit seeds and discloses limited screening", () => {
    let calls = 0;
    const build = (seed: Seed): [string, Record<string, number[]>] => { calls++; return [`candidate-${seed}`, { lead: KNOWN_TUNES["traditional:twinkle-twinkle"] }]; };
    expect(() => select_screened(build, { seed: null })).toThrow(SimilarityError);
    expect(calls).toBe(8); calls = 0;
    expect(() => select_screened(build, { seed: 1 })).toThrow(SimilarityError); expect(calls).toBe(1);
    const result = select_screened(seed => [seed, { lead: [60, 63, 61, 66, 62, 68, 67, 71] }], { seed: 42 });
    expect(result[0]).toBe(42); expect(result[1]).toBe(42); expect(result[3].passed).toBe(true);
    expect(result[3].limitation).toContain("not commercial-catalog or legal clearance");
    expect(() => similarity([1], [1])).toThrow("eight");
    expect(() => screen({})).toThrow("No melodies");
  });
});
