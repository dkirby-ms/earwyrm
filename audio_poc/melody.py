"""Versioned lyric-window contract and inspectable 30-second composition."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal, Self

import numpy as np
from pydantic import BaseModel, ConfigDict, Field, model_validator

from audio_poc.dsp import Note, compose, musical_plan, vocal_pitch

ProductPath = Literal["vocoded", "spoken"]


def _letters(text: str) -> str:
    return re.sub(r"[^a-z0-9]", "", text.lower())


class Contract(BaseModel):
    """Reject extra fields and nonfinite timing rather than dropping input."""

    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class LyricLine(Contract):
    """Ordered syllables in an explicit vocal window, measured in seconds."""

    text: str = Field(min_length=1, max_length=400)
    syllables: list[str] = Field(min_length=1, max_length=88)
    start_seconds: float = Field(ge=3, lt=25)
    end_seconds: float = Field(gt=3, le=25)

    @model_validator(mode="after")
    def validate_fit(self) -> Self:
        if not _letters(self.text) or any(
            not _letters(value) or len(value) > 80 for value in self.syllables
        ):
            raise ValueError("Syllables and line text must contain pronounceable text")
        if _letters("".join(self.syllables)) != _letters(self.text):
            raise ValueError("Syllables must cover the complete line in order")
        if any(
            value * 8 != round(value * 8)
            for value in (self.start_seconds, self.end_seconds)
        ):
            raise ValueError("Vocal windows must lie on the 0.125-second grid")
        duration = self.end_seconds - self.start_seconds
        if not len(self.syllables) * 0.125 <= duration <= len(self.syllables):
            raise ValueError("Syllables cannot fit: each needs 0.125 to 1 second")
        return self


class CompositionRequest(Contract):
    """Version-one input; logical_job_id identifies one immutable candidate."""

    schema_version: Literal[1] = 1
    logical_job_id: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$")
    product_path: ProductPath
    lyrics: str = Field(min_length=1, max_length=400)
    lines: list[LyricLine] = Field(min_length=1, max_length=8)
    seed: int | None = Field(default=None, ge=0, le=2**63 - 1, strict=True)
    duration_seconds: Literal[30] = 30
    style: Literal["retro-synth"] = "retro-synth"

    @model_validator(mode="after")
    def validate_lines(self) -> Self:
        if not self.lyrics.isascii():
            raise ValueError("The v1 lyric contract supports ASCII lyrics only")
        if _letters("".join(line.text for line in self.lines)) != _letters(self.lyrics):
            raise ValueError("Lines must cover the complete lyrics in order")
        previous = 0.0
        for line in self.lines:
            if line.start_seconds < previous:
                raise ValueError("Vocal windows must be ordered and non-overlapping")
            previous = line.end_seconds
        if not 8 <= sum(len(line.syllables) for line in self.lines) <= 176:
            raise ValueError(
                "Supply 8 to 176 syllables for timing and similarity screening"
            )
        return self


class SyllableNote(Contract):
    """One zero-based lyric position mapped to an exact MIDI note interval."""

    line_index: int
    syllable_index: int
    syllable: str
    start_seconds: float
    duration_seconds: float
    midi_note: int


class Chord(Contract):
    """One bar's actual pad voicing, not an inferred chord label."""

    start_seconds: float
    duration_seconds: float
    root_midi: int
    pitches: list[int]


@dataclass(frozen=True)
class Arrangement:
    """Code-generated score, harmony and vocal map sharing one musical identity."""

    seed: int
    backing: list[Note]
    vocal: list[Note]
    chords: list[Chord]
    timing: list[SyllableNote]


def arrange(request: CompositionRequest, seed: int) -> Arrangement:
    """Fit every supplied syllable into its window without omission or overflow."""
    rng = np.random.default_rng(seed)
    backing = compose(seed)
    vocal, timing = [], []
    index = 0
    for line_index, line in enumerate(request.lines):
        slots = [1] * len(line.syllables)
        remaining = round((line.end_seconds - line.start_seconds) * 8) - len(slots)
        while remaining:
            eligible = [i for i, value in enumerate(slots) if value < 8]
            chosen = int(rng.choice(eligible))
            slots[chosen] += 1
            remaining -= 1
        start = line.start_seconds
        for syllable_index, (syllable, slot) in enumerate(
            zip(line.syllables, slots, strict=True)
        ):
            duration = slot / 8
            pitch = vocal_pitch(seed, index, start)
            vocal.append(Note(start, duration, pitch, "vocal", 0.25))
            timing.append(
                SyllableNote(
                    line_index=line_index,
                    syllable_index=syllable_index,
                    syllable=syllable,
                    start_seconds=start,
                    duration_seconds=duration,
                    midi_note=pitch,
                )
            )
            index += 1
            start += duration
    plan = musical_plan(seed)
    chords = [
        Chord(
            start_seconds=bar * 2,
            duration_seconds=2,
            root_midi=plan.pitch(plan.progression[bar % 4] if bar < 14 else 0),
            pitches=[
                note.pitch
                for note in backing
                if note.instrument == "pad" and note.start == bar * 2
            ],
        )
        for bar in range(15)
    ]
    return Arrangement(seed, backing, vocal, chords, timing)
