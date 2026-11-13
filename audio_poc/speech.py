"""Explicit stock Azure Speech synthesis and word-to-note alignment.

Credentials are read from the environment, never from evidence files or logs.
"""

from __future__ import annotations

import io
import os
import queue
import re
import threading
import wave
from dataclasses import dataclass
from typing import Protocol

import numpy as np

from audio_poc.dsp import FRAMES, SAMPLE_RATE, Audio, Note, tone

VOICE = "en-US-JennyNeural"


@dataclass(frozen=True)
class Word:
    """Source word position and duration, in seconds and plain-text characters."""

    text: str
    offset: float
    duration: float
    text_offset: int


@dataclass(frozen=True)
class Utterance:
    """Mono float speech plus the provider's source word events and result ID."""

    audio: Audio
    words: list[Word]
    result_id: str


class SpeechProvider(Protocol):
    """One explicit synthesis request; implementations must not retry silently."""

    def synthesize(self, text: str) -> Utterance: ...


class AzureSpeech:
    """Use one stock voice; enforce a bounded wait without audio-device access."""

    def __init__(self) -> None:
        if not os.environ.get("SPEECH_KEY") or not os.environ.get("SPEECH_REGION"):
            raise ValueError(
                "Set SPEECH_KEY and SPEECH_REGION locally; never paste keys into chat"
            )

    def synthesize(self, text: str) -> Utterance:
        import azure.cognitiveservices.speech as sdk

        config = sdk.SpeechConfig(
            subscription=os.environ["SPEECH_KEY"], region=os.environ["SPEECH_REGION"]
        )
        config.speech_synthesis_voice_name = VOICE
        config.set_speech_synthesis_output_format(
            sdk.SpeechSynthesisOutputFormat.Riff24Khz16BitMonoPcm
        )
        synthesizer = sdk.SpeechSynthesizer(speech_config=config, audio_config=None)
        words: list[Word] = []

        def capture(event: sdk.SpeechSynthesisWordBoundaryEventArgs) -> None:
            if event.boundary_type == sdk.SpeechSynthesisBoundaryType.Word:
                words.append(
                    Word(
                        event.text,
                        event.audio_offset / 10_000_000,
                        event.duration.total_seconds(),
                        event.text_offset,
                    )
                )

        synthesizer.synthesis_word_boundary.connect(capture)
        results: queue.Queue = queue.Queue(maxsize=1)

        def request() -> None:
            try:
                results.put(synthesizer.speak_text_async(text).get())
            except Exception:
                # Native/provider exceptions can contain endpoints and credentials.
                results.put(
                    RuntimeError(
                        "Azure Speech SDK request failed; inspect resource diagnostics"
                    )
                )

        threading.Thread(target=request, daemon=True).start()
        try:
            result = results.get(timeout=60)
        except queue.Empty:
            synthesizer.stop_speaking_async()
            raise RuntimeError(
                "Azure Speech timed out after 60s; usage remains unknown"
            ) from None
        if isinstance(result, Exception):
            raise result
        if result.reason != sdk.ResultReason.SynthesizingAudioCompleted:
            raise RuntimeError(
                "Azure Speech did not complete; usage remains unknown; inspect resource diagnostics"
            )
        with wave.open(io.BytesIO(result.audio_data), "rb") as stream:
            if (
                stream.getnchannels(),
                stream.getsampwidth(),
                stream.getframerate(),
            ) != (1, 2, SAMPLE_RATE):
                raise ValueError("Azure returned an unexpected PCM format")
            audio = (
                np.frombuffer(
                    stream.readframes(stream.getnframes()), dtype="<i2"
                ).astype(np.float64)
                / 32768
            )
        utterance = Utterance(
            audio, sorted(words, key=lambda word: word.offset), result.result_id
        )
        validate_utterance(utterance, text)
        return utterance


def _letters(text: str) -> str:
    return re.sub(r"[^a-z0-9]", "", text.lower())


def validate_utterance(utterance: Utterance, text: str) -> None:
    """Reject missing, overlapping or mismatched events rather than losing words."""
    audio = utterance.audio
    if (
        audio.ndim != 1
        or not len(audio)
        or not np.isfinite(audio).all()
        or np.max(np.abs(audio)) < 1e-8
    ):
        raise ValueError("Speech must be finite, non-silent mono audio")
    if not utterance.words or _letters(
        "".join(word.text for word in utterance.words)
    ) != _letters(text):
        raise ValueError("Word boundary events do not cover the complete script")
    previous_end = 0.0
    previous_text_end = 0
    for word in utterance.words:
        if (
            not np.isfinite([word.offset, word.duration]).all()
            or word.offset < 0
            or word.duration <= 0
            or word.offset < previous_end - 1 / SAMPLE_RATE
            or word.offset + word.duration > len(audio) / SAMPLE_RATE + 1 / SAMPLE_RATE
            or word.text_offset < previous_text_end
            or text[word.text_offset : word.text_offset + len(word.text)] != word.text
        ):
            raise ValueError("Invalid source word timing or text position")
        previous_end = word.offset + word.duration
        previous_text_end = word.text_offset + len(word.text)


def align(
    utterance: Utterance, text: str, root: int
) -> tuple[Audio, Audio, list[Note], list[dict]]:
    """Fit complete word intervals into half-beat slots between seconds 3 and 25.

    Resampling changes the modulator's pitch; the vocoder uses only its envelopes.
    This is deliberately not a natural-singing or phoneme-alignment claim.
    """
    validate_utterance(utterance, text)
    if len(utterance.words) > 88:
        raise ValueError("Script has too many words for the bounded vocal window")
    slots = [max(1, round(word.duration / 0.25)) for word in utterance.words]
    while sum(slots) > 88:
        index = max(range(len(slots)), key=slots.__getitem__)
        slots[index] -= 1
    modulator, carrier = np.zeros(FRAMES), np.zeros(FRAMES)
    notes, alignment = [], []
    start = 3.0
    motif = [0, 4, 7, 9, 7, 4, 2, 0]
    for index, (word, beats) in enumerate(zip(utterance.words, slots, strict=True)):
        duration = beats * 0.25
        source = utterance.audio[
            round(word.offset * SAMPLE_RATE) : round(
                (word.offset + word.duration) * SAMPLE_RATE
            )
        ]
        if len(source) < 2:
            raise ValueError("Source word interval is too short")
        count = round(duration * SAMPLE_RATE)
        fitted = np.interp(
            np.linspace(0, len(source) - 1, count), np.arange(len(source)), source
        )
        fade = min(round(0.005 * SAMPLE_RATE), count // 2)
        fitted[:fade] *= np.linspace(0, 1, fade)
        fitted[-fade:] *= np.linspace(1, 0, fade)
        pitch = root + 12 + motif[index % len(motif)]
        destination = round(start * SAMPLE_RATE)
        modulator[destination : destination + count] = fitted
        carrier[destination : destination + count] = tone(pitch, duration)
        notes.append(Note(start, duration, pitch, "vocal", 0.25))
        alignment.append(
            {
                "word": word.text,
                "source_offset_seconds": word.offset,
                "source_duration_seconds": word.duration,
                "text_offset": word.text_offset,
                "target_offset_seconds": start,
                "target_duration_seconds": duration,
                "midi_note": pitch,
            }
        )
        start += duration
    return modulator, carrier, notes, alignment


def place_spoken(utterance: Utterance) -> Audio:
    """Place unmodified speech near the end, preserving the complete script."""
    if len(utterance.audio) > 25 * SAMPLE_RATE:
        raise ValueError(
            "Natural speech exceeds the 25-second window; shorten the script"
        )
    output = np.zeros(FRAMES)
    start = FRAMES - SAMPLE_RATE - len(utterance.audio)
    output[start : start + len(utterance.audio)] = utterance.audio
    return output
