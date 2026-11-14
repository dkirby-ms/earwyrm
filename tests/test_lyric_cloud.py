"""Verify Azure wire contracts with HTTP fakes, not paid model calls."""

from __future__ import annotations

import json

import httpx
import pytest
from azure.core.credentials import AccessToken

from audio_poc.lyric_cloud import (
    AzureLyricBackend,
    CloudFailure,
    LyricCloudSettings,
    ModelRefusal,
)
from audio_poc.lyrics import LyricDraft, LyricRequest


class Credential:
    def get_token(self, *scopes: str, **kwargs: object) -> AccessToken:
        return AccessToken("test-token", 2**31)


SETTINGS = LyricCloudSettings(
    "https://model.openai.azure.com",
    "test-deployment",
    "https://safety.cognitiveservices.azure.com",
)


def _completion(content: str, **updates: object) -> dict:
    return {
        "choices": [
            {"finish_reason": "stop", "message": {"content": content}, **updates}
        ]
    }


def test_given_generation_when_posted_then_strict_schema_and_facts_only(
    lyric_request: LyricRequest,
    lyric_draft: LyricDraft,
) -> None:
    # Arrange
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(200, json=_completion(lyric_draft.model_dump_json()))

    # Act
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        backend = AzureLyricBackend(SETTINGS, Credential(), client)
        result = backend.generate(lyric_request, ["meter"])

    # Assert
    assert LyricDraft.model_validate_json(result) == lyric_draft
    assert len(calls) == 1
    request = calls[0]
    assert request.url.path == "/openai/v1/chat/completions"
    assert request.headers["authorization"] == "Bearer test-token"
    body = json.loads(request.content)
    schema = body["response_format"]["json_schema"]
    assert schema["strict"] and schema["schema"]["additionalProperties"] is False
    assert set(schema["schema"]["required"]) == set(lyric_draft.model_dump())
    data = json.loads(body["messages"][1]["content"])
    assert data["brief"] == lyric_request.brief.model_dump()
    assert data["failed_rules"] == ["meter"] and "expected_cta" not in data


@pytest.mark.parametrize(
    ("response", "error", "retryable"),
    [
        (_completion("", message={"refusal": "Cannot comply"}), ModelRefusal, False),
        (_completion("{}", finish_reason="content_filter"), ModelRefusal, False),
        (_completion("{", finish_reason="length"), CloudFailure, True),
        ({"choices": []}, CloudFailure, False),
        (_completion("", message={}), CloudFailure, False),
    ],
)
def test_given_invalid_completion_when_generated_then_explicit_failure(
    lyric_request: LyricRequest,
    response: dict,
    error: type[CloudFailure],
    retryable: bool,
) -> None:
    # Act & Assert
    with httpx.Client(
        transport=httpx.MockTransport(lambda _: httpx.Response(200, json=response))
    ) as client:
        with pytest.raises(error) as failure:
            AzureLyricBackend(SETTINGS, Credential(), client).generate(
                lyric_request, []
            )
    assert failure.value.retryable == retryable


@pytest.mark.parametrize(
    ("status", "code", "retryable"),
    [
        (401, "cloud_request_failed", False),
        (429, "cloud_temporarily_unavailable", True),
        (503, "cloud_temporarily_unavailable", True),
    ],
)
def test_given_http_failure_when_called_then_no_hidden_retry(
    lyric_request: LyricRequest,
    status: int,
    code: str,
    retryable: bool,
) -> None:
    # Arrange
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(status, json={"error": {"code": "test"}})

    # Act & Assert
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(CloudFailure) as failure:
            AzureLyricBackend(SETTINGS, Credential(), client).generate(
                lyric_request, []
            )
    assert failure.value.code == code and failure.value.retryable == retryable
    assert len(calls) == 1


@pytest.mark.parametrize(
    "assessment",
    [
        "{}",
        '{"english":true,"artist_imitation":false,"risky_claims":"false"}',
        '{"english":true,"artist_imitation":false,"risky_claims":false,"extra":false}',
    ],
)
def test_given_incomplete_assessment_when_preflight_then_unavailable(
    lyric_request: LyricRequest,
    assessment: str,
) -> None:
    # Act & Assert
    with httpx.Client(
        transport=httpx.MockTransport(
            lambda _: httpx.Response(200, json=_completion(assessment)),
        )
    ) as client:
        with pytest.raises(CloudFailure, match="malformed_assessment"):
            AzureLyricBackend(SETTINGS, Credential(), client).preflight(lyric_request)


@pytest.mark.parametrize(("severity", "detected"), [(0, False), (2, False), (0, True)])
def test_given_complete_safety_when_screened_then_both_api_verdicts_retained(
    severity: int,
    detected: bool,
) -> None:
    # Arrange
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        if "detectProtectedMaterial" in request.url.path:
            return httpx.Response(
                200, json={"protectedMaterialAnalysis": {"detected": detected}}
            )
        return httpx.Response(
            200,
            json={
                "categoriesAnalysis": [
                    {"category": category, "severity": severity}
                    for category in ("Hate", "SelfHarm", "Sexual", "Violence")
                ]
            },
        )

    # Act
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        report = AzureLyricBackend(SETTINGS, Credential(), client).screen(
            "Original test text"
        )

    # Assert
    assert report.moderation_passed == (severity == 0)
    assert report.protected_material_detected == detected
    assert len(calls) == 2 and all(
        r.url.params["api-version"] == "2024-09-01" for r in calls
    )
    assert all(json.loads(r.content)["text"] == "Original test text" for r in calls)


@pytest.mark.parametrize(
    ("moderation", "protected"),
    [
        (
            {"categoriesAnalysis": []},
            {"protectedMaterialAnalysis": {"detected": False}},
        ),
        (
            {"categoriesAnalysis": [{"category": "Hate", "severity": 0}] * 4},
            {"protectedMaterialAnalysis": {"detected": False}},
        ),
        ({}, {}),
        ({"categoriesAnalysis": [{"category": "Hate", "severity": "0"}]}, {}),
    ],
)
def test_given_missing_safety_evidence_when_screened_then_fail_closed(
    moderation: dict,
    protected: dict,
) -> None:
    # Act & Assert
    with httpx.Client(
        transport=httpx.MockTransport(
            lambda request: httpx.Response(
                200,
                json=protected
                if "detectProtectedMaterial" in request.url.path
                else moderation,
            ),
        )
    ) as client:
        with pytest.raises(CloudFailure):
            AzureLyricBackend(SETTINGS, Credential(), client).screen(
                "Original test text"
            )


@pytest.mark.parametrize(
    "endpoint",
    ["http://localhost", "https://user:pass@example.com", "https://example.com/?key=x"],
)
def test_given_unsafe_endpoint_when_configured_then_rejected(endpoint: str) -> None:
    # Act & Assert
    with pytest.raises(CloudFailure, match="invalid_cloud_endpoint"):
        LyricCloudSettings(endpoint, "deployment", SETTINGS.safety_endpoint)


def test_given_candidate_when_assessed_then_tone_and_cta_are_not_fact_sources(
    lyric_request: LyricRequest,
    lyric_draft: LyricDraft,
) -> None:
    # Arrange
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(json.loads(request.content))
        return httpx.Response(
            200,
            json=_completion(
                '{"english":true,"grounded":false,"risky_claims":true}',
            ),
        )

    # Act
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        assessment = AzureLyricBackend(SETTINGS, Credential(), client).assess(
            lyric_request,
            lyric_draft,
        )

    # Assert
    assert not assessment.grounded and assessment.risky_claims
    data = json.loads(calls[0]["messages"][1]["content"])
    assert "tone" not in data["facts"] and "cta" not in data["facts"]
    assert data["candidate"] == lyric_draft.model_dump()
