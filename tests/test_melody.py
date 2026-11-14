"""Prove actual musical variation, exact syllable fit and screening boundaries."""

from __future__ import annotations

import numpy as np
import pytest
from pydantic import ValidationError

from audio_poc.dsp import FRAMES, compose, musical_plan, synthesize
from audio_poc.melody import CompositionRequest, arrange
from audio_poc.similarity import (
    KNOWN_TUNES,
    SimilarityError,
    screen,
    select_screened,
    similarity,
)


@pytest.fixture
def request_data() -> dict:
    return {
        "logical_job_id": "test-version-1",
        "product_path": "vocoded",
        "lyrics": "Cedar Loop brings bright sound to your day",
        "lines": [
            {
                "text": "Cedar Loop brings bright sound to your day",
                "syllables": [
                    "Ce",
                    "dar",
                    "Loop",
                    "brings",
                    "bright",
                    "sound",
                    "to",
                    "your",
                    "day",
                ],
                "start_seconds": 3,
                "end_seconds": 7,
            }
        ],
        "seed": 42,
    }


def test_given_many_seeds_when_composed_then_intervals_rhythm_and_harmony_vary() -> (
    None
):
    # Arrange & Act
    scores = [compose(seed) for seed in range(24)]
    leads = [[note for note in score if note.instrument == "lead"] for score in scores]
    contours = {
        tuple(b.pitch - a.pitch for a, b in zip(lead, lead[1:])) for lead in leads
    }
    rhythms = {tuple(note.start for note in lead) for lead in leads}
    harmonies = {musical_plan(seed).progression for seed in range(24)}

    # Assert
    assert len(contours) >= 20
    assert len(rhythms) >= 20
    assert len(harmonies) >= 3
    assert compose(42) == compose(42)
    assert all(
        0 <= note.start < note.start + note.duration <= 30
        for score in scores
        for note in score
    )
    assert all(0 <= note.pitch <= 127 for score in scores for note in score)


def test_given_syllable_windows_when_arranged_then_no_text_or_time_is_lost(
    request_data: dict,
) -> None:
    # Arrange
    request = CompositionRequest.model_validate(request_data)

    # Act
    result = arrange(request, 42)
    audio = synthesize(result.backing, seed=result.seed)

    # Assert
    assert [row.syllable for row in result.timing] == request.lines[0].syllables
    assert result.timing[0].start_seconds == 3
    assert result.timing[-1].start_seconds + result.timing[-1].duration_seconds == 7
    assert all(0.125 <= note.duration <= 1 for note in result.vocal)
    assert [(n.start, n.duration, n.pitch) for n in result.vocal] == [
        (row.start_seconds, row.duration_seconds, row.midi_note)
        for row in result.timing
    ]
    assert len(result.chords) == 15
    assert (
        len(audio) == FRAMES and np.isfinite(audio).all() and np.max(np.abs(audio)) > 0
    )


@pytest.mark.parametrize(
    "change",
    ["coverage", "dense", "sparse", "overlap", "nan", "grid", "short", "path", "extra"],
)
def test_given_invalid_lyrics_when_validated_then_explicit_error(
    request_data: dict, change: str
) -> None:
    # Arrange
    line = request_data["lines"][0]
    if change == "coverage":
        line["syllables"] = line["syllables"][:-1]
    elif change == "dense":
        line["end_seconds"] = 3.5
    elif change == "sparse":
        line["end_seconds"] = 25
    elif change == "overlap":
        request_data["lyrics"] *= 2
        request_data["lines"].append(dict(line))
    elif change == "nan":
        line["end_seconds"] = float("nan")
    elif change == "grid":
        line["start_seconds"] = 3.01
    elif change == "short":
        line["syllables"] = [line["text"]]
    elif change == "path":
        request_data["product_path"] = "sing-like-an-artist"
    else:
        request_data["unknown"] = True

    # Act & Assert
    with pytest.raises(ValidationError):
        CompositionRequest.model_validate(request_data)


@pytest.mark.parametrize("transpose", [0, 5, 12])
def test_given_known_or_prior_tune_when_transposed_then_delivery_is_blocked(
    transpose: int,
) -> None:
    # Arrange
    original = KNOWN_TUNES["traditional:twinkle-twinkle"]
    pitches = [pitch + transpose for pitch in original]

    # Act & Assert
    with pytest.raises(SimilarityError) as failure:
        screen({"vocal": pitches})
    assert failure.value.report.maximum_similarity == 1
    with pytest.raises(SimilarityError):
        screen({"lead": pitches}, {"prior-job": original})


def test_given_near_copy_when_screened_then_threshold_blocks_one_changed_interval() -> (
    None
):
    # Arrange
    reference = [60, 62, 65, 61, 68, 66, 75, 74]
    near = reference[:-1] + [reference[-1] + 1]

    # Act & Assert
    assert similarity(reference, near) == pytest.approx(6 / 7)
    with pytest.raises(SimilarityError):
        screen({"vocal": near}, {"prior-job": reference})


def test_given_distinct_phrase_when_screened_then_pass_does_not_claim_clearance() -> (
    None
):
    # Arrange
    pitches = [60, 63, 61, 66, 62, 68, 67, 71]

    # Act
    report = screen({"vocal": pitches})

    # Assert
    assert report.passed
    assert "not commercial-catalog or legal clearance" in report.limitation


def test_given_rejected_candidate_when_random_generation_then_next_candidate_is_screened(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    seeds = iter([1, 2])
    monkeypatch.setattr(
        "audio_poc.similarity.secrets.randbits", lambda _bits: next(seeds)
    )

    def candidate(seed: int) -> tuple[str, dict[str, list[int]]]:
        melody = (
            KNOWN_TUNES["traditional:twinkle-twinkle"]
            if seed == 1
            else [60, 63, 61, 66, 62, 68, 67, 71]
        )
        return f"candidate-{seed}", {"lead": melody}

    # Act
    seed, chosen, _melodies, report = select_screened(candidate, seed=None)

    # Assert
    assert (seed, chosen) == (2, "candidate-2") and report.passed
    with pytest.raises(SimilarityError):
        select_screened(candidate, seed=1)


def test_given_only_rejected_candidates_when_selecting_then_bounded_explicit_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    attempts = []
    monkeypatch.setattr("audio_poc.similarity.secrets.randbits", lambda _bits: 1)

    def candidate(seed: int) -> tuple[None, dict[str, list[int]]]:
        attempts.append(seed)
        return None, {"lead": KNOWN_TUNES["traditional:twinkle-twinkle"]}

    # Act & Assert
    with pytest.raises(SimilarityError):
        select_screened(candidate, seed=None)
    assert len(attempts) == 8
