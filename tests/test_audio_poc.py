"""Verify measurable audio-proof behavior without Azure requests or music assets."""

from __future__ import annotations

import json
import re
import struct
import wave
from dataclasses import replace
from decimal import Decimal
from pathlib import Path

import numpy as np
import pytest

from audio_poc.__main__ import (
    gate,
    load_evidence,
    load_inputs,
    main,
    render_brief,
)
from audio_poc.dsp import FRAMES, SAMPLE_RATE, compose, synthesize, tone
from audio_poc.speech import Utterance, Word, align, validate_utterance

pytestmark = pytest.mark.usefixtures("composition_seeds")


class TestSpeech:
    """Test double generating tones, never pretending to be actual Azure output."""

    __test__ = False

    def synthesize(self, text: str) -> Utterance:
        words = [
            Word(match.group(), index * 0.3, 0.24, match.start())
            for index, match in enumerate(re.finditer(r"[A-Za-z0-9]+", text))
        ]
        audio = np.zeros(round((len(words) * 0.3 + 0.1) * SAMPLE_RATE))
        for word in words:
            start = round(word.offset * SAMPLE_RATE)
            samples = tone(60, word.duration, bright=False) * 0.2
            audio[start : start + len(samples)] = samples
        return Utterance(audio, words, "TEST-ONLY-NOT-AZURE")


@pytest.fixture
def evidence() -> dict:
    """Supply explicitly fictional rate evidence solely for accounting tests."""
    return {
        "tier": "S0",
        "region": "test-region",
        "resource_reference": "TEST-ONLY",
        "usd_per_million_characters": "15",
        "rate_source": "TEST-ONLY-NOT-A-QUOTE",
        "rate_checked_on": "2026-11-12",
        "commercial_use_basis": None,
    }


@pytest.mark.parametrize("index", [0, 1, 2])
def test_given_brief_when_offline_render_then_pcm_midi_and_pending_evidence(
    tmp_path: Path, index: int
) -> None:
    # Arrange
    brief, text = load_inputs()[index]
    directory = tmp_path / brief["brief_id"]

    # Act
    rows = render_brief(directory, brief, text, index, None, None)

    # Assert
    with wave.open(str(directory / "instrumental.wav"), "rb") as stream:
        assert stream.getnframes() == FRAMES
        assert stream.getframerate() == SAMPLE_RATE
        audio = np.frombuffer(stream.readframes(FRAMES), dtype="<i2")
    assert 0 < np.max(np.abs(audio.astype(float))) <= 29205
    assert np.sqrt(np.mean(audio.astype(float) ** 2)) > 100
    midi = (directory / "score.mid").read_bytes()
    assert midi[:4] == b"MThd" and midi[14:18] == b"MTrk"
    assert struct.unpack(">I", midi[18:22])[0] == len(midi) - 22
    assert rows[0]["status"] == "Pending"
    assert rows[0]["azure_usage"]["submitted_characters"] == 0
    assert not (directory / "attempt.json").exists()


@pytest.mark.parametrize("index", [0, 1, 2])
def test_given_timed_speech_when_rendering_pair_then_audio_alignment_and_cost_are_complete(
    tmp_path: Path,
    evidence: dict,
    index: int,
) -> None:
    # Arrange
    brief, text = load_inputs()[index]
    directory = tmp_path / brief["brief_id"]

    # Act
    rows = render_brief(directory, brief, text, index, TestSpeech(), evidence)

    # Assert
    assert {row["variant"] for row in rows} == {"vocoded", "spoken"}
    assert all(
        row["status"] == "Pending" and row["numeric_gates"] == "Pass" for row in rows
    )
    allocated = sum(Decimal(row["azure_usage"]["allocated_cost_usd"]) for row in rows)
    assert allocated == Decimal(len(text)) * Decimal("15") / Decimal(1_000_000)
    attempt = json.loads((directory / "attempt.json").read_text())
    assert attempt["result_id"] == "TEST-ONLY-NOT-AZURE"
    assert attempt["status"] == "synthesis_completed"
    alignment = json.loads((directory / "alignment.json").read_text())
    assert "".join(
        re.sub("[^a-z0-9]", "", row["word"].lower()) for row in alignment
    ) == re.sub("[^a-z0-9]", "", text.lower())
    assert (
        max(
            row["target_offset_seconds"] + row["target_duration_seconds"]
            for row in alignment
        )
        <= 25
    )
    for row in rows:
        with wave.open(str(directory / row["file"]), "rb") as stream:
            pcm = np.frombuffer(stream.readframes(FRAMES), dtype="<i2")
        assert len(pcm) == FRAMES and 100 < np.max(np.abs(pcm.astype(float))) <= 29205
        assert row["evaluation"]["brand_transcription"] is None
        assert all(component["status"] == "Pending" for component in row["components"])
    assert (directory / "vocoded.wav").read_bytes() != (
        directory / "spoken.wav"
    ).read_bytes()


@pytest.mark.parametrize("failure", ["missing", "overlap", "text", "nonfinite"])
def test_given_invalid_timing_when_validating_then_fail_without_losing_words(
    failure: str,
) -> None:
    # Arrange
    text = "Cedar Loop"
    utterance = TestSpeech().synthesize(text)
    if failure == "missing":
        utterance = replace(utterance, words=utterance.words[:1])
    elif failure == "overlap":
        utterance = replace(
            utterance,
            words=[utterance.words[0], replace(utterance.words[1], offset=0.1)],
        )
    elif failure == "text":
        utterance = replace(
            utterance,
            words=[utterance.words[0], replace(utterance.words[1], text_offset=0)],
        )
    else:
        utterance = replace(
            utterance,
            words=[
                replace(utterance.words[0], duration=float("nan")),
                utterance.words[1],
            ],
        )

    # Act & Assert
    with pytest.raises(ValueError):
        validate_utterance(utterance, text)


def test_given_timed_word_when_aligned_then_source_and_note_slots_match() -> None:
    # Arrange
    text = "Cedar Loop"
    utterance = TestSpeech().synthesize(text)

    # Act
    modulator, carrier, notes, mapping = align(utterance, text, 48)

    # Assert
    assert np.count_nonzero(modulator[: 3 * SAMPLE_RATE]) == 0
    for note, row in zip(notes, mapping, strict=True):
        assert note.start == row["target_offset_seconds"]
        assert note.duration == row["target_duration_seconds"]
        assert note.pitch == row["midi_note"]
    assert np.max(np.abs(carrier)) > 0 and np.max(np.abs(modulator)) > 0


def test_given_repeatable_score_when_synthesized_then_samples_are_identical() -> None:
    # Arrange
    notes = compose(0)

    # Act
    first, second = synthesize(notes, seed=0), synthesize(notes, seed=0)

    # Assert
    np.testing.assert_array_equal(first, second)


def test_given_same_brief_when_regenerated_then_music_and_voice_change_beyond_key(
    tmp_path: Path, evidence: dict
) -> None:
    # Arrange
    brief, text = load_inputs()[0]
    paths = [tmp_path / "version-a", tmp_path / "version-b"]

    # Act
    for path, seed in zip(paths, [42, 43], strict=True):
        render_brief(
            path, brief, text, 0, TestSpeech(), evidence, composition_seed=seed
        )
    scores = [json.loads((path / "score.json").read_text()) for path in paths]

    # Assert
    for instrument in ("lead", "vocal"):
        melodies = [
            [note["pitch"] for note in score if note["instrument"] == instrument]
            for score in scores
        ]
        intervals = [
            tuple(b - a for a, b in zip(melody, melody[1:])) for melody in melodies
        ]
        assert intervals[0] != intervals[1]
    assert (paths[0] / "vocoded.wav").read_bytes() != (
        paths[1] / "vocoded.wav"
    ).read_bytes()
    assert [
        json.loads((path / "composition.json").read_text())["seed"] for path in paths
    ] == [42, 43]


def test_given_prior_output_when_generating_then_rejected_candidate_is_replaced_before_render(
    tmp_path: Path,
) -> None:
    # Arrange
    brief, text = load_inputs()[0]
    archive = tmp_path / "history"
    first = render_brief(
        tmp_path / "first",
        brief,
        text,
        0,
        None,
        None,
        composition_seed=42,
        history_dir=archive,
    )

    # Act
    second = render_brief(
        tmp_path / "second",
        brief,
        text,
        0,
        None,
        None,
        history_dir=archive,
    )

    # Assert
    assert first[0]["composition_seed"] == 42
    assert second[0]["composition_seed"] != 42
    assert second[0]["melody_similarity"]["passed"]


@pytest.mark.parametrize(
    ("duration", "elapsed", "cost", "expected"),
    [
        (30, 299.9, 0.499, "Pass"),
        (30, 300, 0.1, "Fail"),
        (30, 20, 0.50, "Fail"),
        (30, 20, None, "Pending"),
        (30.01, 20, 0.1, "Fail"),
        (30, float("nan"), 0.1, "Fail"),
    ],
)
def test_given_measurements_when_gated_then_strict_thresholds_apply(
    duration: float,
    elapsed: float,
    cost: float | None,
    expected: str,
) -> None:
    assert gate(duration, elapsed, cost) == expected


def test_given_provider_failure_when_rendering_then_attempt_preserves_unknown_cost(
    tmp_path: Path,
    evidence: dict,
) -> None:
    # Arrange
    class FailedSpeech:
        def synthesize(self, text: str) -> Utterance:
            raise RuntimeError("Test failure")

    brief, text = load_inputs()[0]
    directory = tmp_path / brief["brief_id"]

    # Act
    with pytest.raises(RuntimeError, match="Test failure"):
        render_brief(directory, brief, text, 0, FailedSpeech(), evidence)

    # Assert
    attempt = json.loads((directory / "attempt.json").read_text())
    assert attempt["status"] == "failed_or_unknown"
    assert attempt["calculated_request_cost_usd"] is None
    assert not (directory / "manifest.json").exists()


@pytest.mark.parametrize("rate", ["NaN", "-1", "Infinity", "0"])
def test_given_invalid_rate_when_loading_then_reject_before_spend(
    tmp_path: Path,
    evidence: dict,
    rate: str,
) -> None:
    # Arrange
    path = tmp_path / "evidence.json"
    path.write_text(json.dumps({**evidence, "usd_per_million_characters": rate}))

    # Act & Assert
    with pytest.raises(ValueError):
        load_evidence(path)


@pytest.mark.parametrize("rate", [None, "not a price"])
def test_given_missing_or_malformed_rate_when_loading_then_explain_required_field(
    tmp_path: Path,
    evidence: dict,
    rate: str | None,
) -> None:
    path = tmp_path / "evidence.json"
    path.write_text(json.dumps({**evidence, "usd_per_million_characters": rate}))

    with pytest.raises(ValueError, match="usd_per_million_characters"):
        load_evidence(path)


def test_given_missing_cloud_configuration_when_running_then_no_output_created(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    monkeypatch.setattr(
        "sys.argv", ["audio_poc", "--azure", "--output", str(tmp_path / "renders")]
    )

    # Act
    status = main()

    # Assert
    assert status == 2 and not (tmp_path / "renders").exists()
