"""Verify acceptance, safety holds and the exact generation budget."""

from __future__ import annotations

import json

import pytest

from audio_poc.lyric_cloud import (
    Assessment,
    CloudFailure,
    ModelRefusal,
    Preflight,
    Screening,
)
from audio_poc.lyric_service import LyricWriter
from audio_poc.lyrics import LyricDraft, LyricRequest


class Backend:
    def __init__(self, draft: LyricDraft) -> None:
        self.raw = draft.model_dump_json()
        self.preflight_result = Preflight(
            english=True, artist_imitation=False, risky_claims=False
        )
        self.assessment = Assessment(english=True, grounded=True, risky_claims=False)
        self.screening = Screening(
            moderation_passed=True, protected_material_detected=False
        )
        self.calls: list[str] = []
        self.feedback: list[list[str]] = []
        self.failure: CloudFailure | None = None
        self.failure_stage = "generate"

    def _call(self, name: str) -> None:
        self.calls.append(name)
        if self.failure is not None and self.failure_stage == name:
            raise self.failure

    def preflight(self, request: LyricRequest) -> Preflight:
        self._call("preflight")
        return self.preflight_result

    def generate(self, request: LyricRequest, feedback: list[str]) -> str:
        self._call("generate")
        self.feedback.append(feedback.copy())
        return self.raw

    def assess(self, request: LyricRequest, draft: LyricDraft) -> Assessment:
        self._call("assess")
        return self.assessment

    def screen(self, text: str) -> Screening:
        self._call("screen")
        return self.screening


@pytest.fixture
def backend(lyric_draft: LyricDraft) -> Backend:
    return Backend(lyric_draft)


def test_given_valid_output_when_written_then_all_gates_precede_acceptance(
    lyric_request: LyricRequest,
    lyric_draft: LyricDraft,
    backend: Backend,
) -> None:
    # Act
    result = LyricWriter(backend).write(lyric_request)

    # Assert
    assert result.status == "accepted" and result.output == lyric_draft
    assert result.attempts == 1 and result.broadcast_approval_required
    assert backend.calls == ["preflight", "generate", "assess", "screen"]


@pytest.mark.parametrize(
    "reason", ["malformed", "unsupported_claims", "meter", "transient"]
)
def test_given_retryable_failures_when_exhausted_then_exactly_three_retries(
    lyric_request: LyricRequest,
    backend: Backend,
    reason: str,
) -> None:
    # Arrange
    if reason == "malformed":
        backend.raw = "{"
    elif reason == "unsupported_claims":
        unsupported = "Bright Bike will fix your bike for free"
        payload = json.loads(backend.raw)
        payload["hook"] = unsupported
        payload["lyrics"] = unsupported + "\n" + lyric_request.cta
        backend.raw = json.dumps(payload)
        backend.assessment = backend.assessment.model_copy(update={"grounded": False})
    elif reason == "meter":
        backend.raw = backend.raw.replace("[8,8]", "[2,2]")
    else:
        backend.failure = CloudFailure("cloud_temporarily_unavailable", retryable=True)

    # Act
    result = LyricWriter(backend).write(lyric_request)

    # Assert
    assert result.status == "retry_exhausted" and result.output is None
    assert result.attempts == backend.calls.count("generate") == 4
    assert "screen" not in backend.calls
    if reason == "unsupported_claims":
        assert result.reasons == ["unsupported_claims"]


def test_given_first_failure_when_next_output_valid_then_second_attempt_accepted(
    lyric_request: LyricRequest,
    backend: Backend,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    outputs = iter(["{}", backend.raw])
    generate = backend.generate

    def next_output(request: LyricRequest, feedback: list[str]) -> str:
        generate(request, feedback)
        return next(outputs)

    monkeypatch.setattr(backend, "generate", next_output)

    # Act
    result = LyricWriter(backend).write(lyric_request)

    # Assert
    assert result.status == "accepted" and result.attempts == 2
    assert backend.feedback == [[], ["malformed_lyric_output"]]


@pytest.mark.parametrize(
    ("stage", "failure"),
    [
        ("preflight", CloudFailure("malformed_assessment")),
        ("assess", CloudFailure("malformed_assessment")),
        ("screen", CloudFailure("incomplete_safety_response")),
        ("screen", CloudFailure("cloud_temporarily_unavailable", retryable=True)),
        ("generate", CloudFailure("cloud_authentication_failed")),
    ],
)
def test_given_unavailable_evidence_when_writing_then_no_output_or_retry(
    lyric_request: LyricRequest,
    backend: Backend,
    stage: str,
    failure: CloudFailure,
) -> None:
    # Arrange
    backend.failure_stage, backend.failure = stage, failure

    # Act
    result = LyricWriter(backend).write(lyric_request)

    # Assert
    assert result.status == "unavailable" and result.output is None
    assert result.reasons == [failure.code]
    assert backend.calls.count("generate") <= 1


@pytest.mark.parametrize(
    ("moderated", "protected", "reasons"),
    [
        (False, False, ["moderation_rejected"]),
        (True, True, ["protected_material"]),
        (False, True, ["moderation_rejected", "protected_material"]),
    ],
)
def test_given_safety_rejection_when_writing_then_terminal_without_unsafe_text(
    lyric_request: LyricRequest,
    backend: Backend,
    moderated: bool,
    protected: bool,
    reasons: list[str],
) -> None:
    # Arrange
    backend.screening = Screening(
        moderation_passed=moderated,
        protected_material_detected=protected,
    )

    # Act
    result = LyricWriter(backend).write(lyric_request)

    # Assert
    assert result.status == "rejected" and result.output is None
    assert result.reasons == reasons and result.attempts == 1
    assert backend.calls.count("generate") == 1


@pytest.mark.parametrize(
    "source", ["preflight", "assessment", "price", "superlative", "regulated"]
)
def test_given_risky_claims_when_screened_then_held_not_accepted(
    lyric_request: LyricRequest,
    backend: Backend,
    source: str,
) -> None:
    # Arrange
    if source == "preflight":
        backend.preflight_result = backend.preflight_result.model_copy(
            update={"risky_claims": True}
        )
    elif source == "assessment":
        backend.assessment = backend.assessment.model_copy(
            update={"risky_claims": True}
        )
    else:
        claim = {
            "price": "Tune ups cost ten dollars",
            "superlative": "The best tune ups",
            "regulated": "Health clinic services",
        }[source]
        lyric_request.brief.approved_claims.append(claim)

    # Act
    result = LyricWriter(backend).write(lyric_request)

    # Assert
    assert result.status == "human_review_required" and result.output is not None
    assert backend.calls[-1] == "screen" and result.broadcast_approval_required


@pytest.mark.parametrize("source", ["explicit", "preflight"])
def test_given_artist_imitation_when_requested_then_rejected_before_generation(
    lyric_request: LyricRequest,
    backend: Backend,
    source: str,
) -> None:
    # Arrange
    if source == "explicit":
        lyric_request.brief.tone = "In the style of a named artist"
    else:
        backend.preflight_result = backend.preflight_result.model_copy(
            update={"artist_imitation": True}
        )

    # Act
    result = LyricWriter(backend).write(lyric_request)

    # Assert
    assert result.status == "rejected" and result.reasons == ["artist_imitation"]
    assert result.attempts == 0 and "generate" not in backend.calls


@pytest.mark.parametrize("source", ["input", "output"])
def test_given_non_english_when_assessed_then_not_accepted(
    lyric_request: LyricRequest,
    backend: Backend,
    source: str,
) -> None:
    # Arrange
    if source == "input":
        backend.preflight_result = backend.preflight_result.model_copy(
            update={"english": False}
        )
    else:
        backend.assessment = backend.assessment.model_copy(update={"english": False})

    # Act
    result = LyricWriter(backend).write(lyric_request)

    # Assert
    assert result.status == "rejected" and result.output is None
    assert "screen" not in backend.calls


def test_given_model_refusal_when_generating_then_no_filter_evasion_retries(
    lyric_request: LyricRequest,
    backend: Backend,
) -> None:
    # Arrange
    backend.failure = ModelRefusal("model_refusal")

    # Act
    result = LyricWriter(backend).write(lyric_request)

    # Assert
    assert result.status == "rejected" and result.reasons == ["model_refusal"]
    assert backend.calls.count("generate") == 1
