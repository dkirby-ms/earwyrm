import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { FRAMES, SAMPLE_RATE, Seed, compose, instrument_palette, jingle_duration, mix, musical_form, musical_plan, normalize, parse_seed, seeded_random, synthesize, tone, vocode, write_midi, write_wav } from "../src/dsp.js";
import { render_backing } from "../src/backing.js";
import { CompositionRequest, PreviewCompositionRequest, arrange, arrange_preview, preview_duration } from "../src/melody.js";
import { KNOWN_TUNES, SimilarityError, screen, select_screened, similarity } from "../src/similarity.js";
import { ArrangementScore, compile_score, score_lyric_timing } from "../src/score_dsl.js";
import { JobConflict, MelodyService } from "../src/melody_service.js";
import { align, decode_pcm, place_spoken, speech_settings, validate_utterance, type Utterance } from "../src/speech.js";
import { JingleTools } from "../src/jingle_tools.js";
import { load_inputs, render_brief } from "../src/render.js";

const paths: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const path of paths.splice(0)) rmSync(path, { recursive: true, force: true });
});
const request_data = () => ({
  logical_job_id: "test-version-1", product_path: "vocoded", lyrics: "Cedar Loop brings bright sound to your day", seed: 42,
  lines: [{ text: "Cedar Loop brings bright sound to your day", syllables: ["Ce", "dar", "Loop", "brings", "bright", "sound", "to", "your", "day"], start_seconds: 3, end_seconds: 7 }],
});
const score_data = () => ({
  schema_version: 1, style: "retro-synth", tempo_bpm: 120, time_signature: "4/4",
  key_root: 2, mode: "major", bars: 8, progression: [0, 5, 3, 4], hook_motif: [0, 2, 4, 2],
  tracks: [
    { instrument: "pad", events: [{ step: 0, degree: 0, duration_steps: 8 }] },
    { instrument: "bass", events: [{ step: 0, degree: 0, duration_steps: 2 }, { step: 5, degree: 2, duration_steps: 1 }] },
    { instrument: "lead", events: [{ step: 3, degree: 2, duration_steps: 1 }] },
    { instrument: "kick", events: [{ step: 0, duration_steps: 1 }] },
    { instrument: "hat", events: [{ step: 2, duration_steps: 1 }] },
  ],
});

function speech(): Utterance {
  const audio = new Float64Array(Math.round(0.7 * SAMPLE_RATE));
  const words = [{ text: "Cedar", offset: 0, duration: 0.24, text_offset: 0 }, { text: "Loop", offset: 0.3, duration: 0.24, text_offset: 6 }];
  for (const word of words) audio.set(tone(60, word.duration, { bright: false }).map(value => value * 0.2), Math.round(word.offset * SAMPLE_RATE));
  return { audio, words, result_id: "TEST-ONLY-NOT-AZURE" };
}

describe("Speech authentication settings", () => {
  it("uses a secure WebSocket endpoint for the approved managed-identity account", () => {
    const env = {
      SPEECH_REGION: "test-region",
      SPEECH_ENDPOINT: "https://earwyrm-test.cognitiveservices.azure.com",
      SPEECH_MANAGED_IDENTITY_CLIENT_ID: "11111111-2222-3333-4444-555555555555",
      SPEECH_RESOURCE_ID: "/subscriptions/test/resourceGroups/test/providers/Microsoft.CognitiveServices/accounts/earwyrm-test",
    };
    expect(speech_settings(env)).toMatchObject({ endpoint: new URL("wss://earwyrm-test.cognitiveservices.azure.com/") });
    expect(() => speech_settings({ ...env, SPEECH_ENDPOINT: "https://other.cognitiveservices.azure.com" })).toThrow(TypeError);
    expect(() => speech_settings({ SPEECH_REGION: env.SPEECH_REGION, SPEECH_KEY: "local", SPEECH_ENDPOINT: env.SPEECH_ENDPOINT })).toThrow(TypeError);
    expect(speech_settings({ SPEECH_REGION: env.SPEECH_REGION, SPEECH_KEY: "local" })).toEqual({ region: "test-region", key: "local" });
  });
});

describe("creative score contracts", () => {
  it("renders vocals over exact MCP bytes, MIDI and syllable notes without recomposition", async () => {
    const directory = join(process.cwd(), `.creative-audio-${randomUUID()}`);
    mkdirSync(directory); paths.push(directory);
    const tools = new JingleTools(join(directory, 'melody'));
    const input = CompositionRequest.parse(request_data());
    const result = await tools.compose(input), committed = await tools.artifacts(result);
    await expect(tools.artifacts({ ...result, duration_seconds: result.duration_seconds - 2 }))
      .rejects.toThrow('Composition score exceeds its duration');
    const matches = [...input.lyrics.matchAll(/[A-Za-z]+/g)];
    const audio = new Float64Array(matches.length * 0.2 * SAMPLE_RATE);
    const words = matches.map((match, index) => {
      audio.set(tone(60, 0.15).map(value => value * 0.2), Math.round(index * 0.2 * SAMPLE_RATE));
      return { text: match[0], offset: index * 0.2, duration: 0.15, text_offset: match.index };
    });
    const provider = { synthesize: async () => ({ audio, words, result_id: 'TEST-NOT-AZURE' }) };
    vi.stubEnv('EARWYRM_SOUNDFONT', '/missing-bank-must-not-be-used.sf2');
    const output_dir = join(directory, 'mix');
    const rows = await render_brief(output_dir, load_inputs()[0]![0], input.lyrics, 0, provider, {
      tier: 'S0', region: 'test', resource_reference: 'fictional', rate_source: 'test',
      rate_checked_on: '2026-11-18', usd_per_million_characters: '1',
    }, { composition: committed, history_dir: join(directory, 'melody') });
    expect(rows.map(row => row.variant)).toEqual(['vocoded', 'spoken']);
    expect(rows.every(row => row.duration_seconds === result.duration_seconds)).toBe(true);
    expect(readFileSync(join(output_dir, 'score.mid'))).toEqual(committed.midi);
    expect(JSON.parse(readFileSync(join(output_dir, 'score.json'), 'utf8'))).toEqual(committed.score);
    const alignment = JSON.parse(readFileSync(join(output_dir, 'alignment.json'), 'utf8')) as Array<{ target_offset_seconds: number; target_duration_seconds: number; midi_note: number }>;
    expect(alignment.map(row => [row.target_offset_seconds, row.target_duration_seconds, row.midi_note]))
      .toEqual(result.syllable_timing.map(row => [row.start_seconds, row.duration_seconds, row.midi_note]));
    expect(rows[0]?.composition_source).toMatchObject({ job_id: result.job_id, backing_sha256: result.artifacts['backing.wav']!.sha256 });
    const aligned = decode_pcm(readFileSync(join(output_dir, 'aligned-speech.wav')));
    const spoken = decode_pcm(readFileSync(join(output_dir, 'spoken.wav')));
    const { mix } = await import('../src/dsp.js');
    const expected = mix(decode_pcm(committed.backing), aligned);
    expect(spoken.every((sample, index) => Math.abs(sample - expected[index]!) < 0.0002)).toBe(true);
    const bad = result.syllable_timing.map(row => ({ ...row }));
    bad[0]!.syllable = 'Wrong';
    expect(() => align({ audio, words, result_id: 'TEST' }, input.lyrics, 60, { timing: bad })).toThrow();
    expect((await tools.get(result.job_id)).job_id).toBe(result.job_id);
  });
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
    [0, [0.3588899802416563, 0.10590326134115458, 0.675290479324758, 0.9179345588199794, 0.10157715040259063]],
    [42, [0.4813160905614495, 0.9852536325342953, 0.7379171899519861, 0.6130663156509399, 0.7036195879336447]],
    [Number.MAX_SAFE_INTEGER, [0.8929874321911484, 0.7592886493075639, 0.10753158875741065, 0.515314215561375, 0.7355424631386995]],
  ] as const)("preserves the existing safe-seed stream and repeats the new score for %s", (seed, stream) => {
    const random = seeded_random(seed);
    expect(Array.from({ length: stream.length }, () => random())).toEqual(stream);
    expect(compose(seed)).toEqual(compose(seed));
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
  it("returns a recognizable hook, answers it and resolves with sectional contrast", () => {
    for (const seed of [0, 1, 42, "9223372036854775807"]) for (const duration of [12, jingle_duration(seed)]) {
      const form = musical_form(duration), score = compose(seed, duration);
      const lead = score.filter(note => note.instrument === "lead");
      const first = lead.filter(note => note.start >= form.hook_start_seconds && note.start < form.hook_start_seconds + 4);
      const answer = lead.filter(note => note.start >= form.hook_start_seconds + 4 && note.start < form.cadence_start_seconds);
      expect(first).toHaveLength(8); expect(answer).toHaveLength(8);
      expect(first.slice(0, 3).map(note => note.pitch)).toEqual(answer.slice(0, 3).map(note => note.pitch));
      expect(first.map(note => note.pitch)).not.toEqual(answer.map(note => note.pitch));
      expect(first.map(note => note.start - form.hook_start_seconds)).toEqual(answer.map(note => note.start - form.hook_start_seconds - 4));
      expect(lead.at(-1)!.pitch).toBe(musical_plan(seed).pitch(7));
      const density = (start: number, end: number) => score.filter(note => note.start >= start && note.start < end).length / (end - start);
      expect(density(form.hook_start_seconds, form.cadence_start_seconds)).toBeGreaterThan(density(0, form.hook_start_seconds));
      expect(score.some(note => note.instrument === "snare" && note.start < form.hook_start_seconds)).toBe(false);
    }
  });
  it("extends a guided preview for a long CTA without clipping the guide or cadence", () => {
    const syllables_per_line = [10, 11, 10, 44];
    const duration_seconds = preview_duration(42, syllables_per_line);
    const preview = arrange_preview(PreviewCompositionRequest.parse({
      logical_job_id: "long-cta", product_path: "vocoded", duration_seconds, syllables_per_line,
    }), 42);
    const cadence = duration_seconds - 2;
    expect(duration_seconds).toBeGreaterThan(20);
    const final_phrase = preview.timing.filter(note => note.line_index === 3);
    expect(final_phrase).toHaveLength(44);
    expect(final_phrase.at(-1)!.start_seconds + final_phrase.at(-1)!.duration_seconds).toBe(Math.min(25, cadence));
    expect(preview.backing.some(note => note.instrument === "lead" && note.start === cadence)).toBe(true);
  });
  it("recalls the opening hook across different phrase lengths and closes a short CTA against the tonic tag", () => {
    const seed = 42, duration_seconds = 18, syllables_per_line = [10, 12, 9, 2];
    const request = PreviewCompositionRequest.parse({
      logical_job_id: "recurring-hook", product_path: "vocoded", duration_seconds, syllables_per_line,
    });
    const preview = arrange_preview(request, seed);
    const phrase = (line: number) => preview.timing.filter(note => note.line_index === line);
    const head = (line: number) => phrase(line).slice(0, 3).map(note => [
      note.midi_note, note.start_seconds - phrase(line)[0].start_seconds, note.duration_seconds,
    ]);
    expect(arrange_preview(request, seed)).toEqual(preview);
    expect(head(0)).toEqual(head(2));
    expect(head(1)).not.toEqual(head(0));
    const cadence = duration_seconds - 2, last = preview.timing.at(-1)!;
    const lead = preview.backing.filter(note => note.instrument === "lead");
    expect(last.start_seconds + last.duration_seconds).toBe(cadence);
    expect(lead.find(note => note.start === cadence)!.pitch).toBe(last.midi_note - 7);
    expect(lead.filter(note => note.start >= 3 && note.start < cadence).map(({ start, duration, pitch }) => [start, duration, pitch]))
      .toEqual(preview.timing.map(note => [note.start_seconds, note.duration_seconds, note.midi_note]));
  });
  it.each([[12, 14, 10], [30, 44, 25]])("retains every slot in a %i-second score with full phrase windows", (duration_seconds, count, end) => {
    const request = PreviewCompositionRequest.parse({
      logical_job_id: "full-windows", product_path: "vocoded", duration_seconds, syllables_per_line: Array(4).fill(count),
    });
    const { timing } = arrange_preview(request, 42);
    expect(timing).toHaveLength(count * 4);
    expect(timing.every(note => note.duration_seconds === 0.125)).toBe(true);
    expect(timing.every((note, index) => !index ||
      note.start_seconds >= timing[index - 1].start_seconds + timing[index - 1].duration_seconds)).toBe(true);
    expect(timing.at(-1)!.start_seconds + timing.at(-1)!.duration_seconds).toBe(end);
  });
  it("rejects unfit durations and lyric windows without truncating events", () => {
    const data = request_data();
    for (const duration_seconds of [8, 10]) {
      expect(CompositionRequest.safeParse({ ...data, duration_seconds }).success).toBe(false);
      expect(() => compose(42, duration_seconds)).toThrow();
    }
    expect(CompositionRequest.safeParse({ ...data, duration_seconds: 12 }).success).toBe(true);
    expect(CompositionRequest.safeParse({ ...data, duration_seconds: 12, lines: [{ ...data.lines[0], end_seconds: 12 }] }).success).toBe(false);
    expect(() => compose(42, 15)).toThrow();
    expect(() => jingle_duration(42, 31)).toThrow();
    expect(() => synthesize(compose(42), { seed: 42, duration_seconds: 16 })).toThrow("Invalid note");
    expect(() => mix(new Float64Array(16 * SAMPLE_RATE), new Float64Array(18 * SAMPLE_RATE))).toThrow("equal");
  });
});

describe("arrangement score DSL", () => {
  it("expands versioned patterns deterministically and aligns vocal pitches to accepted lyric timing", () => {
    const request = CompositionRequest.parse(request_data());
    const timing = arrange(request, 42).timing;
    const score = ArrangementScore.parse(score_data());
    const compiled = compile_score(score, timing);
    expect(compiled).toEqual(compile_score(score, timing));
    expect(compiled.duration_seconds).toBe(16);
    expect(compiled.backing).toHaveLength(8 * 6);
    expect(compiled.backing.find(note => note.instrument === "pad")).toMatchObject({
      start: 0, duration: 2, pitch: 50, instrument: "pad", gain: 0.04,
    });
    expect(compiled.chords[0]).toMatchObject({ root_midi: 50, pitches: [50, 54, 57] });
    expect(compile_score({ ...score_data(), mode: "minor" }, timing).chords[0]).toMatchObject({ pitches: [50, 53, 57] });
    expect(compiled.vocal.map(note => [note.start, note.duration, note.pitch]))
      .toEqual(compiled.timing.map(row => [row.start_seconds, row.duration_seconds, row.midi_note]));
    expect(compiled.similarity.passed).toBe(true);
    expect(compiled.melodies).toEqual({
      lead: [78, 86, 83, 85, 78, 86, 83, 85],
      vocal: compiled.vocal.map(note => note.pitch),
    });
    expect(compiled.backing.every(note => note.start + note.duration <= compiled.duration_seconds)).toBe(true);
    expect(() => compile_score(score, timing, { "test:prior-score": compiled.melodies.lead })).toThrow(SimilarityError);
  });
  it("rejects unsupported score bounds, duplicate roles, bar-crossing events, and invalid lyric timing", () => {
    const score = score_data();
    expect(ArrangementScore.safeParse({ ...score, tempo_bpm: 100, bars: 8 }).success).toBe(true);
    expect(ArrangementScore.safeParse({ ...score, tempo_bpm: 140, bars: 12 }).success).toBe(true);
    expect(ArrangementScore.safeParse({ ...score, tempo_bpm: 141 }).success).toBe(false);
    expect(ArrangementScore.safeParse({ ...score, unknown: true }).success).toBe(false);
    expect(ArrangementScore.safeParse({ ...score, tracks: [...score.tracks, score.tracks[0]] }).success).toBe(false);
    const unsupported = score.tracks.map(track => track.instrument === "hat" ? { ...track, instrument: "harp" } : track);
    expect(ArrangementScore.safeParse({ ...score, tracks: unsupported }).success).toBe(false);
    const crossing = score.tracks.map(track => track.instrument === "lead"
      ? { ...track, events: [{ step: 7, degree: 0, duration_steps: 2 }] }
      : track);
    expect(ArrangementScore.safeParse({ ...score, tracks: crossing }).success).toBe(false);
    const timing = arrange(CompositionRequest.parse(request_data()), 42).timing.map(row => ({ ...row }));
    expect(() => compile_score(score, timing.slice(0, 7))).toThrow();
    timing[1] = { ...timing[1]!, start_seconds: timing[0]!.start_seconds };
    expect(() => compile_score(score, timing)).toThrow("ordered");
  });
});

describe("tempo-aware score rendering", () => {
  it("uses the declared MIDI tempo and keeps fractional audio and speech buffers sample-aligned", async () => {
    vi.stubEnv("EARWYRM_SOUNDFONT", undefined);
    const request = CompositionRequest.parse(request_data());
    const score = { ...score_data(), tempo_bpm: 140, bars: 12 };
    const compiled = compile_score(score, arrange(request, 42).timing);
    const notes = [...compiled.backing, ...compiled.vocal];
    const frames = Math.round(compiled.duration_seconds * SAMPLE_RATE);
    const rendered = await render_backing(notes, 42, compiled.duration_seconds, score.tempo_bpm);
    expect(rendered.audio).toHaveLength(frames);
    expect(normalize(rendered.audio, score.tempo_bpm)).toHaveLength(frames);
    expect(mix(rendered.audio, new Float64Array(frames).fill(0.01), score.tempo_bpm)).toHaveLength(frames);
    const directory = join(process.cwd(), `.creative-audio-${randomUUID()}`);
    mkdirSync(directory); paths.push(directory);
    expect(place_spoken({
      audio: new Float64Array(SAMPLE_RATE).fill(0.01), words: [], result_id: "TEST-ONLY",
    }, compiled.duration_seconds, score.tempo_bpm)).toHaveLength(frames);
    expect(() => place_spoken({
      audio: new Float64Array(SAMPLE_RATE).fill(0.01), words: [], result_id: "TEST-ONLY",
    }, compiled.duration_seconds)).toThrow("whole bars");
    const timing = [
      { line_index: 0, syllable_index: 0, syllable: "Cedar", start_seconds: 3, duration_seconds: 0.5, midi_note: 60 },
      { line_index: 0, syllable_index: 1, syllable: "Loop", start_seconds: 4, duration_seconds: 0.5, midi_note: 62 },
    ];
    const form = { duration_seconds: compiled.duration_seconds, hook_start_seconds: 8, cadence_start_seconds: compiled.duration_seconds - 2 };
    const [modulator, carrier, vocal_notes] = align(speech(), "Cedar Loop", 60, { timing, form, tempo_bpm: score.tempo_bpm });
    expect(modulator).toHaveLength(frames);
    expect(carrier).toHaveLength(frames);
    expect(vocal_notes.map(note => [note.start, note.duration, note.pitch]))
      .toEqual(timing.map(row => [row.start_seconds, row.duration_seconds, row.midi_note]));
    expect(() => align(speech(), "Cedar Loop", 60, { timing, form })).toThrow();
    expect(() => normalize(rendered.audio)).toThrow("whole bars");
    expect(() => write_midi(join(directory, "invalid.mid"), notes, compiled.duration_seconds)).toThrow("whole bars");
    expect(CompositionRequest.safeParse({ ...request_data(), duration_seconds: 16.5 }).success).toBe(false);

    const midi_path = join(directory, "tempo.mid");
    write_midi(midi_path, notes, compiled.duration_seconds, instrument_palette(42), score.tempo_bpm);
    const midi = readFileSync(midi_path);
    expect(midi.subarray(22, 26)).toEqual(Buffer.from([0, 255, 81, 3]));
    let offset = 22, ticks = 0, tempo = 0, end_tick = 0;
    while (offset < midi.length) {
      let delta = 0, byte: number;
      do { byte = midi[offset++]!; delta = delta * 128 + (byte & 127); } while (byte & 128);
      ticks += delta;
      const status = midi[offset++]!;
      if (status === 255) {
        const type = midi[offset++]!, length = midi[offset++]!;
        if (type === 81) tempo = midi[offset]! * 65536 + midi[offset + 1]! * 256 + midi[offset + 2]!;
        offset += length;
        if (type === 47) { end_tick = ticks; break; }
      } else if ((status & 240) === 192) offset++;
      else offset += 2;
    }
    expect(tempo).toBe(Math.round(60_000_000 / score.tempo_bpm));
    expect(end_tick).toBe(score.bars * 1920);
  });
});

describe("durable score render jobs", () => {
  const request = () => {
    const score = ArrangementScore.parse(score_data());
    const timing = score_lyric_timing(score, ["Cedar Loop brings bright sound to your day"], {});
    return {
      schema_version: 1 as const, logical_job_id: "score-job", request_sha256: "a".repeat(64), product_path: "vocoded" as const,
      score, timing, provider: { provider: "injected" as const, deployment: null },
    };
  };
  function root() {
    const directory = join(process.cwd(), `.score-render-test-${randomUUID()}`);
    mkdirSync(directory);
    paths.push(directory);
    return directory;
  }

  it("recovers committed artifacts, rejects changed requests, and detects digest mismatches", async () => {
    const service = new MelodyService(join(root(), "melody")), input = request();
    const committed = await service.submit_score(input);
    expect(await service.submit_score(input)).toEqual(committed);
    expect(JSON.parse((await service.read_artifact(committed.job_id, "provenance.json")).toString()))
      .toMatchObject({ score_schema_version: 1, provider: input.provider });

    const changed = {
      ...input,
      score: ArrangementScore.parse({ ...score_data(), tempo_bpm: 121 }),
    };
    await expect(service.submit_score(changed)).rejects.toBeInstanceOf(JobConflict);
    writeFileSync(join(service.artifact_dir, committed.job_id, "score.mid"), "tampered");
    await expect(service.read_artifact(committed.job_id, "score.mid")).rejects.toThrow("integrity check failed");
  });

  it("cleans up a failed render so the committed score can render on retry", async () => {
    const directory = join(root(), "melody"), input = request();
    const failing = new MelodyService(directory, {
      render_backing: async () => { throw new Error("test renderer failure"); },
    });
    await expect(failing.submit_score(input)).rejects.toThrow("test renderer failure");
    expect(readdirSync(failing.artifact_dir)).toEqual([]);
    const retry = new MelodyService(directory);
    const committed = await retry.submit_score(input);
    expect(committed.logical_job_id).toBe(input.logical_job_id);
    expect(await retry.read_artifact(committed.job_id, "backing.wav")).toBeInstanceOf(Buffer);
  });

  it.each(["legacy", "score"] as const)("cleans up %s INSERT and COMMIT failures while preserving recovered jobs", async kind => {
    const service = new MelodyService(join(root(), "melody"), {
      render_backing: async (_notes, seed, duration) => ({
        audio: new Float64Array(duration * SAMPLE_RATE).fill(0.1), palette: instrument_palette(seed), renderer: "oscillator", soundfont: null,
      }),
    });
    await service.init();
    const submit = () => kind === "legacy"
      ? service.submit(CompositionRequest.parse(request_data()))
      : service.submit_score(request());
    const connect = vi.spyOn(service, "_connect");
    try {
      for (const phase of ["INSERT", "COMMIT"]) {
        const connection = await service._connect();
        const failure = new Error(`injected ${phase} failure`);
        if (phase === "COMMIT") connection.commit = async () => { throw failure; };
        else {
          const execute = connection.execute.bind(connection);
          connection.execute = async (sql, params) => {
            if (sql.startsWith("INSERT INTO render_jobs")) throw failure;
            return execute(sql, params);
          };
        }
        connect.mockResolvedValueOnce(connection);
        await expect(submit()).rejects.toThrow(failure.message);
        expect(readdirSync(service.artifact_dir)).toEqual([]);
        const check = await service._connect();
        try { expect((await check.execute("SELECT job_id FROM render_jobs")).rows).toEqual([]); }
        finally { await check.close(); }
      }
      const committed = await submit();
      const backing = await service.read_artifact(committed.job_id, "backing.wav");
      const connection = await service._connect();
      connection.commit = async () => { throw new Error("injected recovery COMMIT failure"); };
      connect.mockResolvedValueOnce(connection);
      await expect(submit()).rejects.toThrow("injected recovery COMMIT failure");
      expect(await submit()).toEqual(committed);
      expect(readdirSync(service.artifact_dir)).toEqual([committed.job_id]);
      expect(await service.read_artifact(committed.job_id, "backing.wav")).toEqual(backing);
      const check = await service._connect();
      try { expect((await check.execute("SELECT job_id FROM render_jobs")).rows).toEqual([{ job_id: committed.job_id }]); }
      finally { await check.close(); }
    } finally { connect.mockRestore(); }
  });
});

describe("DSP artifacts", () => {
  it("uses three stable curated palettes and rejects a configured missing bank", async () => {
    expect(new Set(Array.from({ length: 24 }, (_, seed) => instrument_palette(seed).name)).size).toBe(3);
    const notes = compose(42, 12);
    vi.stubEnv("EARWYRM_SOUNDFONT", undefined);
    const rendered = await render_backing(notes, 42, 12);
    expect(rendered).toMatchObject({ palette: instrument_palette(42), renderer: "oscillator", soundfont: null });
    expect(rendered.audio).toHaveLength(12 * SAMPLE_RATE);
    vi.stubEnv("EARWYRM_SOUNDFONT", join(process.cwd(), `${randomUUID()}.sf2`));
    await expect(render_backing(notes, 42, 12)).rejects.toThrow("SoundFont render failed");
  });
  it.each([12, 14, 18, 30])("renders deterministic finite %s-second PCM and matching MIDI", duration_seconds => {
    const frames = duration_seconds * SAMPLE_RATE;
    const notes = compose(42, duration_seconds), first = synthesize(notes, { seed: 42, duration_seconds }), second = synthesize(notes, { seed: 42, duration_seconds });
    expect(Buffer.from(first.buffer).equals(Buffer.from(second.buffer))).toBe(true);
    expect(first).toHaveLength(frames);
    expect(first.every(Number.isFinite)).toBe(true);
    const normalized = normalize(first);
    const directory = join(process.cwd(), `.creative-audio-${randomUUID()}`);
    mkdirSync(directory); paths.push(directory);
    write_wav(join(directory, "score.wav"), normalized);
    const palette = instrument_palette(42);
    write_midi(join(directory, "first.mid"), notes, duration_seconds, palette);
    write_midi(join(directory, "second.mid"), compose(42, duration_seconds), duration_seconds, palette);
    const wav = readFileSync(join(directory, "score.wav")), midi = readFileSync(join(directory, "first.mid"));
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt32LE(24)).toBe(24000);
    expect(wav.readUInt16LE(34)).toBe(16);
    expect(wav.readUInt32LE(40)).toBe(frames * 2);
    let pcm_peak = 0, square = 0;
    for (let i = 44; i < wav.length; i += 2) { const sample = wav.readInt16LE(i); pcm_peak = Math.max(pcm_peak, Math.abs(sample)); square += sample * sample; }
    expect(pcm_peak).toBeGreaterThan(100); expect(pcm_peak).toBeLessThanOrEqual(29205);
    expect(Math.sqrt(square / frames)).toBeGreaterThan(100);
    expect(midi.equals(readFileSync(join(directory, "second.mid")))).toBe(true);
    expect(midi.toString("ascii", 0, 4)).toBe("MThd");
    expect(midi.readUInt16BE(8)).toBe(0);
    expect(midi.readUInt16BE(12)).toBe(480);
    expect(midi.readUInt32BE(18)).toBe(midi.length - 22);
    let offset = 22, ticks = 0, on = 0, off = 0;
    const programs = new Map<number, number>();
    while (offset < midi.length) {
      let delta = 0, byte;
      do { byte = midi[offset++]; delta = delta * 128 + (byte & 127); } while (byte & 128);
      ticks += delta;
      const status = midi[offset++];
      if (status === 255) { offset++; const length = midi[offset++]; offset += length; }
      else if ((status & 240) === 192) {
        expect(ticks).toBe(0);
        expect(on).toBe(0);
        programs.set(status & 15, midi[offset++]);
      } else {
        if ((status & 240) === 144) {
          if ((status & 15) !== 9) expect(programs.has(status & 15)).toBe(true);
          on++;
        }
        if ((status & 240) === 128) off++;
        offset += 2;
      }
    }
    expect([...programs]).toEqual([[0, palette.pad], [1, palette.bass], [2, palette.lead]]);
    expect(ticks).toBe(duration_seconds * 960); expect(on).toBe(notes.length); expect(off).toBe(notes.length);
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
  it("preserves complete words in separate verse/hook windows with breathing room", () => {
    const text = "Cedar Loop brings bright sound today. Call Cedar Loop to book today.";
    const tokens = [...text.matchAll(/[A-Za-z]+/g)];
    const utterance: Utterance = {
      audio: tone(60, tokens.length * 0.25, { bright: false }), result_id: "TEST-ONLY-NOT-AZURE",
      words: tokens.map((token, i) => ({ text: token[0], text_offset: token.index, offset: i * 0.25, duration: 0.24 })),
    };
    const form = musical_form(16);
    const [modulator, carrier, notes, map] = align(utterance, text, musical_plan(42).root, { melody_seed: 42, form });
    expect(map.map(row => row.word)).toEqual(tokens.map(token => token[0]));
    expect(map[0].target_offset_seconds).toBe(0.5);
    expect(map[6].target_offset_seconds).toBe(form.hook_start_seconds);
    expect(map.at(-1)!.target_offset_seconds + map.at(-1)!.target_duration_seconds).toBeLessThan(form.cadence_start_seconds);
    expect(map.some((row, i) => i > 0 && row.target_offset_seconds > map[i - 1].target_offset_seconds + map[i - 1].target_duration_seconds)).toBe(true);
    expect(notes.at(-1)!.pitch).toBe(musical_plan(42).pitch(7));
    expect(modulator).toHaveLength(16 * SAMPLE_RATE); expect(carrier).toHaveLength(modulator.length);
    expect(() => align(utterance, text, 48, { form: musical_form(12) })).toThrow("cannot fit");
    expect(() => place_spoken({ ...utterance, audio: tone(60, 15) }, 16)).toThrow("shorten");
  });
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
