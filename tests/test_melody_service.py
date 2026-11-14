"""Exercise durable ownership, screening and delivery failures, without cloud use."""

from __future__ import annotations

import json
import sqlite3
import uuid
import wave
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest

import audio_poc.melody_service as module
from audio_poc.dsp import FRAMES, SAMPLE_RATE
from audio_poc.melody import CompositionRequest
from audio_poc.melody_service import CompositionUnavailable, JobConflict, MelodyService
from audio_poc.similarity import SimilarityError


@pytest.fixture
def composition_request() -> CompositionRequest:
    return CompositionRequest(
        logical_job_id="advertiser-campaign-v1",
        product_path="vocoded",
        lyrics="Cedar Loop brings bright sound to your day",
        lines=[
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
        seed=42,
    )


@pytest.mark.parametrize("product_path", ["vocoded", "spoken"])
def test_given_contract_when_submitted_then_complete_artifacts_and_one_job(
    tmp_path: Path, composition_request: CompositionRequest, product_path: str
) -> None:
    # Arrange
    service = MelodyService(tmp_path)
    request = CompositionRequest.model_validate(
        {**composition_request.model_dump(), "product_path": product_path}
    )

    # Act
    result = service.submit(request)
    job_id = uuid.UUID(result.job_id)

    # Assert
    assert result.queue_owner == "melody-arrangement" and result.status == "queued"
    assert result.product_path == product_path
    assert service.read_artifact(job_id, "score.mid").startswith(b"MThd")
    assert len(result.chords) == 15 and len(result.syllable_timing) == 9
    assert result.similarity.passed
    assert all("Pending" in component.status for component in result.components)
    provenance = json.loads(service.read_artifact(job_id, "provenance.json"))
    assert provenance["seed"] == 42 and provenance["ai_generated"]
    with wave.open(str(service.artifact_dir / result.job_id / "backing.wav")) as audio:
        assert audio.getnframes() == FRAMES and audio.getframerate() == SAMPLE_RATE
    with sqlite3.connect(service.database_path) as connection:
        assert connection.execute("SELECT COUNT(*) FROM render_jobs").fetchone()[0] == 1


def test_given_concurrent_retry_and_restart_when_submitted_then_same_durable_job(
    tmp_path: Path, composition_request: CompositionRequest, composition_seeds: None
) -> None:
    # Arrange
    request = composition_request.model_copy(update={"seed": None})
    first, second = MelodyService(tmp_path), MelodyService(tmp_path)

    # Act
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(
            pool.map(lambda service: service.submit(request), [first, second])
        )
    restarted = MelodyService(tmp_path).submit(request)

    # Assert
    assert results[0] == results[1] == restarted
    assert len(list(first.artifact_dir.iterdir())) == 1
    with sqlite3.connect(first.database_path) as connection:
        assert connection.execute("SELECT COUNT(*) FROM render_jobs").fetchone()[0] == 1
        connection.execute("UPDATE render_jobs SET status = 'running'")
    assert MelodyService(tmp_path).submit(request).status == "running"


def test_given_reused_identity_with_changed_payload_when_submitted_then_conflict(
    tmp_path: Path, composition_request: CompositionRequest
) -> None:
    # Arrange
    service = MelodyService(tmp_path)
    service.submit(composition_request)
    changed = composition_request.model_copy(update={"product_path": "spoken"})

    # Act & Assert
    with pytest.raises(JobConflict, match="different request"):
        service.submit(changed)


def test_given_earlier_output_when_new_identity_repeats_melody_then_no_second_job(
    tmp_path: Path, composition_request: CompositionRequest
) -> None:
    # Arrange
    service = MelodyService(tmp_path)
    service.submit(composition_request)
    duplicate = composition_request.model_copy(update={"logical_job_id": "version-2"})

    # Act & Assert
    with pytest.raises(SimilarityError) as failure:
        MelodyService(tmp_path).submit(duplicate)
    assert "earwyrm:" in failure.value.report.closest_reference
    assert len(list(service.artifact_dir.iterdir())) == 1
    with sqlite3.connect(service.database_path) as connection:
        assert connection.execute("SELECT COUNT(*) FROM render_jobs").fetchone()[0] == 1


def test_given_artifact_failure_when_submitted_then_nothing_delivered_or_queued(
    tmp_path: Path,
    composition_request: CompositionRequest,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    service = MelodyService(tmp_path)
    original = module.write_wav

    def fail_write(*_args: object) -> None:
        raise OSError("TEST disk full")

    monkeypatch.setattr(module, "write_wav", fail_write)

    # Act & Assert
    with pytest.raises(CompositionUnavailable, match="retry the same"):
        service.submit(composition_request)
    assert not list(service.artifact_dir.iterdir())
    with sqlite3.connect(service.database_path) as connection:
        assert connection.execute("SELECT COUNT(*) FROM render_jobs").fetchone()[0] == 0
    monkeypatch.setattr(module, "write_wav", original)
    assert service.submit(composition_request).status == "queued"


def test_given_modified_asset_when_read_then_integrity_failure_not_delivery(
    tmp_path: Path, composition_request: CompositionRequest
) -> None:
    # Arrange
    service = MelodyService(tmp_path)
    result = service.submit(composition_request)
    (service.artifact_dir / result.job_id / "backing.wav").write_bytes(b"corrupted")

    # Act & Assert
    with pytest.raises(CompositionUnavailable, match="integrity"):
        service.read_artifact(uuid.UUID(result.job_id), "backing.wav")


def test_given_synchronous_output_when_archived_then_blocks_mcp_copy_without_second_queue(
    tmp_path: Path, composition_request: CompositionRequest
) -> None:
    # Arrange
    service = MelodyService(tmp_path)
    arrangement = module.arrange(composition_request, 42)
    melodies = {
        "lead": [
            note.pitch for note in arrangement.backing if note.instrument == "lead"
        ],
        "vocal": [note.pitch for note in arrangement.vocal],
    }

    # Act
    service.record_local_output("poc-output-1", melodies)

    # Assert
    with pytest.raises(SimilarityError):
        service.submit(composition_request)
    with sqlite3.connect(service.database_path) as connection:
        assert connection.execute("SELECT COUNT(*) FROM render_jobs").fetchone()[0] == 0
        assert (
            connection.execute("SELECT COUNT(*) FROM local_outputs").fetchone()[0] == 1
        )
