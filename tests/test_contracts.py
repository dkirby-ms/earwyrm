"""Verify platform identity, quality and immutable artifact invariants."""

from __future__ import annotations

import uuid

import pytest
from pydantic import ValidationError

from audio_poc.contracts import (
    BlobArtifact,
    JobRecord,
    QualityCheck,
    QualityReport,
    RenderManifest,
    VersionIdentity,
)


def identity() -> VersionIdentity:
    return VersionIdentity(
        job_id=uuid.uuid4(),
        version_id=uuid.uuid4(),
        version_number=1,
        brief_id="brief-001",
    )


def quality() -> dict:
    return {
        "identity": identity(),
        "duration": {
            "measured": 30,
            "minimum": 29.5,
            "maximum": 30,
            "unit": "s",
            "status": "pass",
            "evidence": "measured",
        },
        "loudness": {
            "unit": "LUFS",
            "status": "pending",
            "evidence": "target not selected",
        },
        "intelligibility": {
            "unit": "1",
            "status": "pending",
            "evidence": "not measured",
        },
        "similarity": {"unit": "1", "status": "pending", "evidence": "not measured"},
        "status": "pending",
        "checked_at": "2026-11-13T23:00:00Z",
    }


@pytest.mark.parametrize(
    "changes",
    [
        {"status": "awaiting_approval"},
        {"status": "failed"},
        {"updated_at": "2026-11-12T23:00:00Z"},
        {"attempt": 3},
    ],
)
def test_given_invalid_job_state_when_validated_then_rejected(changes: dict) -> None:
    values = {
        "identity": identity(),
        "status": "queued",
        "attempt": 1,
        "created_at": "2026-11-13T23:00:00Z",
        "updated_at": "2026-11-13T23:00:00Z",
    }

    with pytest.raises(ValidationError):
        JobRecord.model_validate({**values, **changes})


@pytest.mark.parametrize(
    "changes",
    [
        {"measured": None},
        {"measured": 31},
        {"minimum": 32},
        {"maximum": float("inf")},
    ],
)
def test_given_invalid_quality_pass_when_validated_then_rejected(changes: dict) -> None:
    values = {
        "measured": 30,
        "minimum": 29.5,
        "maximum": 30,
        "unit": "s",
        "status": "pass",
        "evidence": "duration measurement",
    }

    with pytest.raises(ValidationError):
        QualityCheck.model_validate({**values, **changes})


def test_given_pending_quality_when_aggregate_claims_pass_then_rejected() -> None:
    values = quality()
    assert QualityReport.model_validate(values).status == "pending"

    with pytest.raises(ValidationError, match="remain pending"):
        QualityReport.model_validate({**values, "status": "pass"})


@pytest.mark.parametrize(
    "uri",
    [
        "https://store.blob.core.windows.net/audio/a.wav?sig=secret",
        "http://store/audio/a.wav",
        "https://user:password@store/audio/a.wav",
    ],
)
def test_given_bearer_or_insecure_artifact_when_validated_then_rejected(
    uri: str,
) -> None:
    with pytest.raises(ValidationError, match="without credentials"):
        BlobArtifact(uri=uri, media_type="audio/wav", sha256="a" * 64)


def test_given_other_version_quality_when_manifest_validated_then_rejected() -> None:
    with pytest.raises(ValidationError, match="exact version"):
        RenderManifest(
            identity=identity(),
            product_path="vocoded",
            audio=BlobArtifact(
                uri="https://store.blob.core.windows.net/audio/a.wav",
                media_type="audio/wav",
                sha256="a" * 64,
            ),
            created_at="2026-11-13T23:00:00Z",
            components=[
                {
                    "component": "instruments",
                    "origin": "original synthesis",
                    "evidence": "score",
                }
            ],
            tool_versions={"renderer": "1"},
            speech_resource_id="/subscriptions/example/resourceGroups/demo/providers/Microsoft.CognitiveServices/accounts/speech",
            speech_result_id="result-001",
            quality=QualityReport.model_validate(quality()),
        )
