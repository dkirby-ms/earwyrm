import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";
import { SAMPLE_RATE, instrument_palette, synthesize, write_midi, type Note, type Seed } from "./dsp.js";

const exec = promisify(execFile);

/**
 * Render matching MIDI and backing audio.
 *
 * @param tempo_bpm - Optional 100-140 BPM score tempo; omission retains legacy whole-bar rendering.
 */
export async function render_backing(notes: readonly Note[], seed: Seed, duration_seconds: number, tempo_bpm?: number) {
  const palette = instrument_palette(seed);
  const bank = process.env.EARWYRM_SOUNDFONT?.trim();
  if (!bank) return {
    audio: synthesize(notes, { seed, duration_seconds, tempo_bpm }),
    palette,
    renderer: "oscillator",
    soundfont: null,
  };

  const soundfont = resolve(bank);
  const directory = await mkdtemp(join(tmpdir(), "earwyrm-midi-"));
  try {
    await access(soundfont);
    const midi = join(directory, "backing.mid"), pcm = join(directory, "backing.raw");
    const config = join(directory, "fluidsynth.conf");
    await writeFile(config, "");
    write_midi(midi, notes, duration_seconds, palette, tempo_bpm);
    const { stderr } = await exec("fluidsynth", [
      "-niq", "-f", config, "-r", String(SAMPLE_RATE), "-T", "raw", "-O", "s16", "-E", "little",
      "-F", pcm, "--", soundfont, midi,
    ], { cwd: directory, timeout: 15_000, killSignal: "SIGKILL" });
    if (/fluidsynth:\s*error:/i.test(stderr)) throw new Error("FluidSynth reported a render error");
    const raw = await readFile(pcm);
    const frames = Math.round(duration_seconds * SAMPLE_RATE);
    if (raw.length % 4 !== 0 || raw.length < frames * 4) throw new Error("Incomplete stereo PCM");
    const audio = new Float64Array(frames);
    for (let i = 0; i < frames; i++) {
      audio[i] = (raw.readInt16LE(i * 4) + raw.readInt16LE(i * 4 + 2)) / 65536;
    }
    if (!audio.some(sample => sample !== 0)) throw new Error("Silent backing");
    return { audio, palette, renderer: "fluidsynth", soundfont: basename(soundfont) };
  } catch (cause) {
    throw new Error("SoundFont render failed; check that FluidSynth is installed and EARWYRM_SOUNDFONT points to a readable General MIDI bank", { cause });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
