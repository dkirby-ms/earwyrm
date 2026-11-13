"""Compose MIDI and render code-generated instruments and a filter-bank vocoder."""

from __future__ import annotations

import struct
import wave
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from numpy.typing import NDArray
from scipy import signal

Audio = NDArray[np.float64]
SAMPLE_RATE = 24000
DURATION = 30
FRAMES = SAMPLE_RATE * DURATION
BEAT = 0.5


@dataclass(frozen=True)
class Note:
    """A MIDI pitch with start/duration in seconds and a rendering instrument."""

    start: float
    duration: float
    pitch: int
    instrument: str
    gain: float = 0.15


def tone(pitch: int, duration: float, *, bright: bool = True) -> Audio:
    """Synthesize a band-limited harmonic oscillator with click-free edges."""
    count = round(duration * SAMPLE_RATE)
    t = np.arange(count) / SAMPLE_RATE
    frequency = 440 * 2 ** ((pitch - 69) / 12)
    harmonics = range(1, min(30, int(11000 / frequency)) + 1) if bright else [1, 2, 3]
    samples = sum(np.sin(2 * np.pi * frequency * h * t) / h for h in harmonics)
    fade = min(round(0.012 * SAMPLE_RATE), count // 2)
    envelope = np.ones(count)
    if fade:
        envelope[:fade] = np.linspace(0, 1, fade)
        envelope[-fade:] = np.linspace(1, 0, fade)
    return np.asarray(samples * envelope, dtype=np.float64)


def compose(index: int) -> list[Note]:
    """Compose a 120 BPM, 15-bar bed with a brief-specific original motif."""
    root = [48, 50, 45][index]
    progression = [0, 5, 9, 7]
    motif = [0, 7, 12, 4, 9, 7, 4, 2]
    notes = []
    for bar in range(15):
        base = root + progression[bar % 4]
        start = bar * 2.0
        for interval in (0, 4, 7):
            notes.append(Note(start, 1.9, base + interval, "pad", 0.045))
        for beat in range(4):
            notes.append(Note(start + beat * BEAT, 0.38, base - 12, "bass", 0.15))
            notes.append(Note(start + beat * BEAT, 0.16, 36, "kick", 0.21))
            notes.append(Note(start + beat * BEAT + 0.25, 0.055, 42, "hat", 0.028))
        for step in range(8):
            pitch = root + 12 + motif[(step + index * 2 + bar % 2) % len(motif)]
            notes.append(Note(start + step * 0.25, 0.21, pitch, "lead", 0.045))
    return notes


def synthesize(notes: list[Note], *, seed: int) -> Audio:
    """Render notes into a mono bed using oscillators and seeded noise only."""
    output = np.zeros(FRAMES)
    rng = np.random.default_rng(seed)
    for note in notes:
        count = round(note.duration * SAMPLE_RATE)
        t = np.arange(count) / SAMPLE_RATE
        if note.instrument == "kick":
            phase = 2 * np.pi * (48 * t + 7 * (1 - np.exp(-35 * t)))
            audio = np.sin(phase) * np.exp(-25 * t)
        elif note.instrument == "hat":
            noise = rng.normal(0, 1, count)
            audio = np.diff(noise, prepend=0) * np.exp(-65 * t)
        else:
            audio = tone(note.pitch, note.duration, bright=note.instrument == "lead")
            if note.instrument == "lead":
                audio *= np.exp(-5 * t)
        start = round(note.start * SAMPLE_RATE)
        stop = min(FRAMES, start + count)
        output[start:stop] += note.gain * audio[: stop - start]
    return output


def normalize(audio: Audio) -> Audio:
    """Apply a short final fade and peak-normalize a finite, non-silent demo."""
    if len(audio) != FRAMES or not np.isfinite(audio).all():
        raise ValueError("Audio must contain exactly 30 seconds of finite samples")
    peak = float(np.max(np.abs(audio)))
    if peak < 1e-8:
        raise ValueError("Refusing to export silent audio")
    result = audio.copy()
    fade = round(0.03 * SAMPLE_RATE)
    result[:fade] *= np.linspace(0, 1, fade)
    result[-fade:] *= np.linspace(1, 0, fade)
    return result * (10 ** (-1 / 20) / max(peak, float(np.max(np.abs(result)))))


def mix(bed: Audio, vocal: Audio) -> Audio:
    """Duck the bed during vocal activity, preserving consonants in the mix."""
    peak = float(np.max(np.abs(vocal)))
    if peak < 1e-8:
        raise ValueError("Vocal is silent")
    vocal = vocal / peak
    envelope = signal.sosfilt(
        signal.butter(2, 12, fs=SAMPLE_RATE, output="sos"), np.abs(vocal)
    )
    duck = np.clip(envelope * 12, 0, 1)
    return normalize(bed * (0.55 - 0.35 * duck) + vocal * 0.7)


def vocode(modulator: Audio, carrier: Audio) -> Audio:
    """Transfer 18 speech-band envelopes to a harmonic note carrier."""
    if len(modulator) != len(carrier):
        raise ValueError("Vocoder inputs must have equal lengths")
    edges = np.geomspace(90, 10500, 19)
    envelope_filter = signal.butter(2, 35, fs=SAMPLE_RATE, output="sos")
    output = np.zeros_like(modulator)
    for low, high in zip(edges[:-1], edges[1:], strict=True):
        band = signal.butter(
            2, [low, high], btype="bandpass", fs=SAMPLE_RATE, output="sos"
        )
        speech_band = signal.sosfilt(band, modulator)
        envelope = signal.sosfilt(envelope_filter, np.abs(speech_band))
        carrier_band = signal.sosfilt(band, carrier)
        rms = float(np.sqrt(np.mean(carrier_band**2)))
        if rms > 1e-8:
            output += envelope * carrier_band / rms
    # Unvoiced consonants retain intelligibility without importing a voice asset.
    output += 0.3 * signal.sosfilt(
        signal.butter(2, 3000, btype="highpass", fs=SAMPLE_RATE, output="sos"),
        modulator,
    )
    return output


def write_wav(path: Path, audio: Audio) -> None:
    """Write mono PCM16 without clipping; callers choose whether to normalize."""
    if not np.isfinite(audio).all() or np.max(np.abs(audio)) > 1:
        raise ValueError("PCM samples must be finite and within [-1, 1]")
    pcm = np.round(audio * 32767).astype("<i2")
    with wave.open(str(path), "wb") as stream:
        stream.setnchannels(1)
        stream.setsampwidth(2)
        stream.setframerate(SAMPLE_RATE)
        stream.writeframes(pcm.tobytes())


def _variable_length(value: int) -> bytes:
    result = [value & 0x7F]
    while value >> 7:
        value >>= 7
        result.insert(0, (value & 0x7F) | 0x80)
    return bytes(result)


def write_midi(path: Path, notes: list[Note]) -> None:
    """Export a standard type-0 MIDI score with 480 PPQ and 120 BPM tempo."""
    channels = {"pad": 0, "bass": 1, "lead": 2, "vocal": 3, "kick": 9, "hat": 9}
    events = [(0, b"\xff\x51\x03\x07\xa1\x20")]
    for note in notes:
        channel = channels[note.instrument]
        start = round(note.start / BEAT * 480)
        end = round((note.start + note.duration) / BEAT * 480)
        velocity = max(1, min(127, round(note.gain * 300)))
        events.extend(
            [
                (start, bytes([0x90 | channel, note.pitch, velocity])),
                (end, bytes([0x80 | channel, note.pitch, 0])),
            ]
        )
    track = bytearray()
    previous = 0
    for tick, message in sorted(events, key=lambda event: (event[0], event[1])):
        track.extend(_variable_length(tick - previous) + message)
        previous = tick
    track.extend(_variable_length(max(0, 60 * 480 - previous)) + b"\xff\x2f\x00")
    path.write_bytes(
        b"MThd"
        + struct.pack(">IHHH", 6, 0, 1, 480)
        + b"MTrk"
        + struct.pack(">I", len(track))
        + track
    )
