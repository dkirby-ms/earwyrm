"""Verify user isolation, evaluation, and guarded local render workflows."""

from __future__ import annotations

import json
import re
import stat
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from decimal import Decimal
from pathlib import Path
from typing import Any

import jwt
import numpy as np
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

import audio_poc.web_app as web_app
from audio_poc.dsp import SAMPLE_RATE, tone
from audio_poc.speech import Utterance, Word
from audio_poc.web_storage import StorageConflict, WebStorage

pytestmark = pytest.mark.usefixtures("composition_seeds")

AUTHORITY = "https://tenant.ciamlogin.com/tenant-id"
ISSUER = "https://tenant.ciamlogin.com/tenant-id/v2.0"
AUDIENCE = "api://audio-api"
METADATA_URL = (
    "https://tenant.ciamlogin.com/tenant-id/v2.0/.well-known/openid-configuration"
)
JWKS_URI = "https://tenant.ciamlogin.com/tenant-id/discovery/v2.0/keys"
ALL_SCOPES = "briefs.read renders.read renders.write evaluations.write outputs.read"


class FakeSpeech:
    """Generate tone-only fixtures and never call Azure."""

    def __init__(self, *, failure: bool = False) -> None:
        self.failure = failure
        self.calls: list[str] = []

    def synthesize(self, text: str) -> Utterance:
        self.calls.append(text)
        if self.failure:
            raise RuntimeError("credential-sentinel provider diagnostic")
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


def _environment(data_dir: Path) -> dict[str, str]:
    return {
        "ENTRA_CLIENT_ID": "local-spa-client",
        "ENTRA_AUTHORITY": AUTHORITY,
        "ENTRA_METADATA_URL": METADATA_URL,
        "ENTRA_EXPECTED_ISSUER": ISSUER,
        "ENTRA_AUDIENCE": AUDIENCE,
        "ENTRA_API_SCOPE_PREFIX": AUDIENCE,
        "EARWYRM_DATA_DIR": str(data_dir),
    }


def _token(private_key: Any, subject: str = "user-a") -> str:
    return jwt.encode(
        {
            "iss": ISSUER,
            "aud": AUDIENCE,
            "exp": int(time.time()) + 60,
            "sub": subject,
            "scp": ALL_SCOPES,
        },
        private_key,
        algorithm="RS256",
        headers={"kid": "test-key"},
    )


def _client(
    *,
    data_dir: Path,
    private_key: Any,
    public_jwk: dict[str, object],
    subject: str = "user-a",
    environ: dict[str, str] | None = None,
    speech_provider_factory: Any = None,
    metadata_overrides: dict[str, object] | None = None,
) -> tuple[TestClient, str]:
    metadata = {
        **{
            "issuer": ISSUER,
            "jwks_uri": JWKS_URI,
            "id_token_signing_alg_values_supported": ["RS256"],
        },
        **(metadata_overrides or {}),
    }
    app = web_app.create_app(
        environ=environ or _environment(data_dir),
        data_dir=data_dir,
        metadata_fetcher=lambda _url: metadata,
        jwks_fetcher=lambda _url: {"keys": [public_jwk]},
        speech_provider_factory=speech_provider_factory,
    )
    return TestClient(app), _token(private_key, subject)


def _speech_environment(
    data_dir: Path,
    evidence_path: Path,
    *,
    allowed_subject: str = "user-a",
    per_run_cap: str = "1",
    total_budget: str = "0.2",
) -> dict[str, str]:
    return {
        **_environment(data_dir),
        "SPEECH_ENABLED": "true",
        "SPEECH_ALLOWED_SUBJECT": allowed_subject,
        "SPEECH_PER_RUN_CAP_USD": per_run_cap,
        "SPEECH_TOTAL_BUDGET_USD": total_budget,
        "SPEECH_REGION": "test-region",
        "SPEECH_KEY": "credential-sentinel",
        "SPEECH_EVIDENCE_PATH": str(evidence_path),
    }


def _write_evidence(path: Path, **overrides: object) -> None:
    path.write_text(
        json.dumps(
            {
                "tier": "S0",
                "region": "test-region",
                "resource_reference": "test-resource-reference",
                "usd_per_million_characters": "1000",
                "rate_source": "TEST-ONLY-NOT-A-QUOTE",
                "rate_checked_on": date.today().isoformat(),
                "commercial_use_basis": None,
                **overrides,
            }
        ),
        encoding="utf-8",
    )


def test_given_configured_api_when_serving_web_app_then_applies_csp_and_pinned_client(
    tmp_path: Path,
    signing_material: tuple[Any, dict[str, object]],
) -> None:
    # Arrange
    private_key, public_jwk = signing_material
    client, _token_value = _client(
        data_dir=tmp_path / "private",
        private_key=private_key,
        public_jwk=public_jwk,
        metadata_overrides={
            "authorization_endpoint": "https://login.example.test/tenant/authorize",
            "token_endpoint": "https://login.example.test/tenant/token",
        },
    )

    # Act
    page = client.get("/")
    bundle = client.get("/vendor/msal-browser.min.js")

    # Assert
    policy = page.headers["content-security-policy"]
    assert page.status_code == 200
    assert bundle.status_code == 200
    assert "https://tenant.ciamlogin.com" in policy
    assert "https://login.example.test" in policy
    assert "https://attacker.example" not in policy
    assert "script-src 'self'" in policy
    assert "connect-src 'self'" in policy
    assert "frame-src 'self'" in policy
    directives = {
        parts[0]: parts[1:]
        for directive in policy.split(";")
        if (parts := directive.split())
    }
    assert directives["media-src"] == ["'self'", "blob:"]
    assert directives["default-src"] == ["'self'"]
    assert directives["script-src"] == ["'self'"]
    assert "object-src 'none'" in policy
    assert "base-uri 'self'" in policy
    assert "frame-ancestors 'none'" in policy
    assert "/vendor/msal-browser.min.js" in page.text


@pytest.fixture
def signing_material() -> tuple[Any, dict[str, object]]:
    """Create a local RSA key pair for synthetic access tokens."""
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_jwk = jwt.algorithms.RSAAlgorithm.to_jwk(
        private_key.public_key(), as_dict=True
    )
    public_jwk.update({"kid": "test-key", "alg": "RS256", "use": "sig"})
    return private_key, public_jwk


def test_given_subset_when_rendering_offline_then_preserves_index_and_owner_boundary(
    tmp_path: Path,
    signing_material: tuple[Any, dict[str, object]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange
    private_key, public_jwk = signing_material
    data_dir = tmp_path / "private"
    client, token = _client(
        data_dir=data_dir,
        private_key=private_key,
        public_jwk=public_jwk,
        speech_provider_factory=lambda: pytest.fail(
            "Offline rendering must not construct Speech"
        ),
    )
    indices: list[int] = []
    render = web_app.render_brief

    def capture_index(*args: Any, **kwargs: Any) -> list[dict[str, Any]]:
        indices.append(args[3])
        return render(*args, **kwargs)

    monkeypatch.setattr(web_app, "render_brief", capture_index)

    # Act
    response = client.post(
        "/api/renders",
        headers={"Authorization": f"Bearer {token}"},
        json={"brief_ids": ["brief-003"], "mode": "instrumental"},
    )
    run = response.json()
    outputs = run["outputs"]
    other, other_token = _client(
        data_dir=data_dir,
        private_key=private_key,
        public_jwk=public_jwk,
        subject="user-b",
    )
    other_outputs = other.get(
        "/api/outputs", headers={"Authorization": f"Bearer {other_token}"}
    )
    run_list = client.get("/api/renders", headers={"Authorization": f"Bearer {token}"})
    other_runs = other.get(
        "/api/renders", headers={"Authorization": f"Bearer {other_token}"}
    )

    # Assert
    assert response.status_code == 200
    assert indices == [2]
    assert run["status"] == "completed"
    assert len(outputs) == 1
    assert outputs[0]["brief_id"] == "brief-003"
    assert outputs[0]["status"] == "Pending"
    assert "file" not in outputs[0]
    assert other_outputs.json() == {"outputs": []}
    assert run_list.json()["runs"][0]["run_id"] == run["run_id"]
    assert other_runs.json() == {"runs": []}
    assert (
        other.get(
            f"/api/outputs/{outputs[0]['output_id']}/audio",
            headers={"Authorization": f"Bearer {other_token}"},
        ).status_code
        == 404
    )
    assert (
        other.get(
            f"/api/outputs/{outputs[0]['output_id']}/evidence",
            headers={"Authorization": f"Bearer {other_token}"},
        ).status_code
        == 404
    )
    assert (
        client.get(
            "/api/outputs/not-a-generated-id/audio",
            headers={"Authorization": f"Bearer {token}"},
        ).status_code
        == 404
    )
    status_response = client.get(
        "/api/poc/status", headers={"Authorization": f"Bearer {token}"}
    )
    assert status_response.json()["status"] == "Pending"
    assert [brief["brief_id"] for brief in status_response.json()["briefs"]] == [
        "brief-001",
        "brief-002",
        "brief-003",
    ]

    audio_path = data_dir / "audio" / f"{outputs[0]['output_id']}.wav"
    assert stat.S_IMODE(data_dir.stat().st_mode) == 0o700
    assert stat.S_IMODE((data_dir / "audio").stat().st_mode) == 0o700
    assert stat.S_IMODE((data_dir / "earwyrm.sqlite3").stat().st_mode) == 0o600
    assert stat.S_IMODE(audio_path.stat().st_mode) == 0o600
    download = client.get(
        outputs[0]["audio_url"], headers={"Authorization": f"Bearer {token}"}
    )
    assert download.status_code == 200
    assert download.headers["cache-control"] == "private, no-store"
    assert download.content[:4] == b"RIFF"


def test_given_valid_evaluation_when_submitting_twice_then_keeps_first_and_hides_answers(
    tmp_path: Path,
    signing_material: tuple[Any, dict[str, object]],
    caplog: pytest.LogCaptureFixture,
) -> None:
    # Arrange
    private_key, public_jwk = signing_material
    client, token = _client(
        data_dir=tmp_path / "private",
        private_key=private_key,
        public_jwk=public_jwk,
    )
    rendered = client.post(
        "/api/renders",
        headers={"Authorization": f"Bearer {token}"},
        json={"brief_ids": ["brief-001"], "mode": "instrumental"},
    ).json()
    output_id = rendered["outputs"][0]["output_id"]
    answers = json.loads(web_app.EXPECTED_ANSWERS.read_text(encoding="utf-8"))[0]
    body = {
        "brand_transcription": answers["expected_brand"],
        "cta_transcription": answers["expected_cta"],
        "self_rating": "usable with minor edits",
    }
    headers = {"Authorization": f"Bearer {token}"}

    # Act
    response = client.post(
        f"/api/outputs/{output_id}/evaluation", headers=headers, json=body
    )
    duplicate = client.post(
        f"/api/outputs/{output_id}/evaluation", headers=headers, json=body
    )
    evidence = client.get(f"/api/outputs/{output_id}/evidence", headers=headers)

    # Assert
    assert response.status_code == 200
    assert response.json() == {
        "output_id": output_id,
        "brand_match": True,
        "cta_match": True,
        "self_rating": "usable with minor edits",
        "status": "Pending",
    }
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"] == "Evaluation is immutable after submission"
    assert evidence.status_code == 200
    assert evidence.json()["evaluation"]["brand_match"] is True
    assert answers["expected_brand"] not in response.text
    assert answers["expected_cta"] not in response.text
    assert answers["expected_brand"] not in caplog.text
    assert answers["expected_cta"] not in caplog.text


def test_given_failed_transcription_when_submitting_then_rollup_fails(
    tmp_path: Path,
    signing_material: tuple[Any, dict[str, object]],
) -> None:
    # Arrange
    private_key, public_jwk = signing_material
    client, token = _client(
        data_dir=tmp_path / "private",
        private_key=private_key,
        public_jwk=public_jwk,
    )
    headers = {"Authorization": f"Bearer {token}"}
    rendered = client.post(
        "/api/renders",
        headers=headers,
        json={"brief_ids": ["brief-002"], "mode": "instrumental"},
    ).json()
    output_id = rendered["outputs"][0]["output_id"]

    # Act
    evaluation = client.post(
        f"/api/outputs/{output_id}/evaluation",
        headers=headers,
        json={
            "brand_transcription": "incorrect brand",
            "cta_transcription": "incorrect call to action",
            "self_rating": "usable with minor edits",
        },
    )
    rollup = client.get("/api/poc/status", headers=headers)

    # Assert
    assert evaluation.json()["status"] == "Fail"
    assert rollup.json()["status"] == "Fail"
    assert rollup.json()["briefs"][1]["status"] == "Fail"


def test_given_default_disabled_speech_when_rendering_then_never_constructs_provider(
    tmp_path: Path,
    signing_material: tuple[Any, dict[str, object]],
) -> None:
    # Arrange
    private_key, public_jwk = signing_material
    env = {
        **_environment(tmp_path / "private"),
        "SPEECH_KEY": "credential-sentinel",
        "SPEECH_REGION": "test-region",
    }
    constructed: list[bool] = []

    def provider_factory() -> FakeSpeech:
        constructed.append(True)
        raise AssertionError("Provider must not be constructed")

    client, token = _client(
        data_dir=tmp_path / "private",
        private_key=private_key,
        public_jwk=public_jwk,
        environ=env,
        speech_provider_factory=provider_factory,
    )

    # Act
    options = client.get(
        "/api/render-options", headers={"Authorization": f"Bearer {token}"}
    )
    response = client.post(
        "/api/renders",
        headers={"Authorization": f"Bearer {token}"},
        json={"brief_ids": ["brief-001"], "mode": "azure"},
    )

    # Assert
    assert options.json() == {
        "instrumental_available": True,
        "speech_status": "disabled",
    }
    assert response.status_code == 409
    assert constructed == []


@pytest.mark.parametrize(
    ("case", "expected_status"),
    [
        ("missing-key", 503),
        ("placeholder-resource", 503),
        ("invalid-rate", 503),
        ("region-mismatch", 503),
        ("not-allowlisted", 403),
        ("per-run-cap", 409),
    ],
)
def test_given_unmet_speech_prerequisite_when_estimating_then_refuses_paid_mode(
    tmp_path: Path,
    signing_material: tuple[Any, dict[str, object]],
    case: str,
    expected_status: int,
) -> None:
    # Arrange
    private_key, public_jwk = signing_material
    evidence_path = tmp_path / "speech-evidence.json"
    evidence_overrides: dict[str, object] = {}
    if case == "placeholder-resource":
        evidence_overrides["resource_reference"] = (
            "your non-secret resource and paid-tier evidence reference"
        )
    elif case == "invalid-rate":
        evidence_overrides["usd_per_million_characters"] = "NaN"
    _write_evidence(evidence_path, **evidence_overrides)
    env = _speech_environment(
        tmp_path / "private",
        evidence_path,
        allowed_subject="different-user" if case == "not-allowlisted" else "user-a",
        per_run_cap="0.0000001" if case == "per-run-cap" else "1",
    )
    if case == "missing-key":
        env.pop("SPEECH_KEY")
    elif case == "region-mismatch":
        env["SPEECH_REGION"] = "different-region"
    client, token = _client(
        data_dir=tmp_path / "private",
        private_key=private_key,
        public_jwk=public_jwk,
        environ=env,
    )

    # Act
    response = client.post(
        "/api/renders/estimate",
        headers={"Authorization": f"Bearer {token}"},
        json={"brief_ids": ["brief-001"]},
    )

    # Assert
    assert response.status_code == expected_status
    assert "credential-sentinel" not in response.text


@pytest.mark.parametrize(
    "confirmation",
    [
        {"brief_ids": ["brief-002"], "estimated_cost_usd": "0.1"},
        {"brief_ids": ["brief-001"], "estimated_cost_usd": "0.0000001"},
        None,
    ],
)
def test_given_mismatched_confirmation_when_rendering_then_refuses_before_provider(
    tmp_path: Path,
    signing_material: tuple[Any, dict[str, object]],
    confirmation: dict[str, object] | None,
) -> None:
    # Arrange
    private_key, public_jwk = signing_material
    evidence_path = tmp_path / "speech-evidence.json"
    _write_evidence(evidence_path)
    env = _speech_environment(tmp_path / "private", evidence_path)
    constructed: list[bool] = []

    def provider_factory() -> FakeSpeech:
        constructed.append(True)
        return FakeSpeech()

    client, token = _client(
        data_dir=tmp_path / "private",
        private_key=private_key,
        public_jwk=public_jwk,
        environ=env,
        speech_provider_factory=provider_factory,
    )

    # Act
    response = client.post(
        "/api/renders",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "brief_ids": ["brief-001"],
            "mode": "azure",
            "confirmation": confirmation,
        },
    )

    # Assert
    assert response.status_code == 409
    assert constructed == []


def test_given_confirmed_paid_render_when_complete_then_requires_reconciliation(
    tmp_path: Path,
    signing_material: tuple[Any, dict[str, object]],
    caplog: pytest.LogCaptureFixture,
) -> None:
    # Arrange
    private_key, public_jwk = signing_material
    evidence_path = tmp_path / "speech-evidence.json"
    _write_evidence(evidence_path, credential_marker="evidence-secret-sentinel")
    env = _speech_environment(tmp_path / "private", evidence_path, total_budget="0.2")
    provider = FakeSpeech()
    client, token = _client(
        data_dir=tmp_path / "private",
        private_key=private_key,
        public_jwk=public_jwk,
        environ=env,
        speech_provider_factory=lambda: provider,
    )
    headers = {"Authorization": f"Bearer {token}"}
    estimate = client.post(
        "/api/renders/estimate",
        headers=headers,
        json={"brief_ids": ["brief-001"]},
    ).json()
    answer = json.loads(web_app.EXPECTED_ANSWERS.read_text(encoding="utf-8"))[0]
    payload = {
        "brief_ids": estimate["brief_ids"],
        "mode": "azure",
        "confirmation": estimate,
    }

    # Act
    response = client.post("/api/renders", headers=headers, json=payload)
    run = response.json()
    blocked = client.post("/api/renders", headers=headers, json=payload)
    busy_options = client.get("/api/render-options", headers=headers)
    observer, observer_token = _client(
        data_dir=tmp_path / "private",
        private_key=private_key,
        public_jwk=public_jwk,
        environ=env,
    )
    observer_busy_options = observer.get(
        "/api/render-options",
        headers={"Authorization": f"Bearer {observer_token}"},
    )
    attempt_id = run["attempt"]["attempt_id"]
    reconciled = client.post(
        f"/api/attempts/{attempt_id}/reconcile",
        headers=headers,
        json={
            "actual_cost_usd": "0.6",
            "evidence_reference": "TEST-ONLY billing export reference",
        },
    )
    over_budget = client.post("/api/renders", headers=headers, json=payload)
    evidence_response = client.get(
        f"/api/outputs/{run['outputs'][0]['output_id']}/evidence",
        headers=headers,
    )

    # Assert
    assert response.status_code == 200
    assert run["attempt"]["status"] == "awaiting_reconciliation"
    assert len(provider.calls) == 1
    assert blocked.status_code == 409
    assert busy_options.json()["speech_status"] == "busy"
    assert observer_busy_options.json()["speech_status"] == "busy"
    assert attempt_id not in observer_busy_options.text
    assert reconciled.status_code == 200
    assert reconciled.json()["status"] == "reconciled"
    assert over_budget.status_code == 409
    assert "credential-sentinel" not in response.text
    assert "evidence-secret-sentinel" not in response.text
    assert answer["expected_brand"] not in response.text
    assert answer["expected_cta"] not in response.text
    assert "credential-sentinel" not in evidence_response.text
    assert "evidence-secret-sentinel" not in evidence_response.text
    assert answer["expected_brand"] not in evidence_response.text
    assert answer["expected_cta"] not in evidence_response.text
    assert "credential-sentinel" not in caplog.text
    assert "evidence-secret-sentinel" not in caplog.text
    assert answer["expected_brand"] not in caplog.text
    assert answer["expected_cta"] not in caplog.text
    assert evidence_response.json()["attempt"]["attempt_id"] == attempt_id
    usage = evidence_response.json()["manifest"]["azure_usage"]
    assert usage["billing_reconciled"] is True
    assert usage["actual_allocated_cost_usd"] is not None
    assert evidence_response.json()["status"] == "Fail"
    assert client.get("/api/poc/status", headers=headers).json()["status"] == "Fail"


def test_given_provider_failure_when_rendering_then_blocks_retry_until_reconciled(
    tmp_path: Path,
    signing_material: tuple[Any, dict[str, object]],
    caplog: pytest.LogCaptureFixture,
) -> None:
    # Arrange
    private_key, public_jwk = signing_material
    evidence_path = tmp_path / "speech-evidence.json"
    _write_evidence(evidence_path)
    env = _speech_environment(tmp_path / "private", evidence_path)
    provider = FakeSpeech(failure=True)
    client, token = _client(
        data_dir=tmp_path / "private",
        private_key=private_key,
        public_jwk=public_jwk,
        environ=env,
        speech_provider_factory=lambda: provider,
    )
    headers = {"Authorization": f"Bearer {token}"}
    estimate = client.post(
        "/api/renders/estimate",
        headers=headers,
        json={"brief_ids": ["brief-001"]},
    ).json()
    answer = json.loads(web_app.EXPECTED_ANSWERS.read_text(encoding="utf-8"))[0]
    payload = {
        "brief_ids": estimate["brief_ids"],
        "mode": "azure",
        "confirmation": estimate,
    }

    # Act
    response = client.post("/api/renders", headers=headers, json=payload)
    attempt_id = response.json()["detail"]["attempt_id"]
    blocked = client.post("/api/renders", headers=headers, json=payload)
    reconciliation = client.post(
        f"/api/attempts/{attempt_id}/reconcile",
        headers=headers,
        json={
            "actual_cost_usd": "0",
            "evidence_reference": "TEST-ONLY reconciled failed attempt",
        },
    )

    # Assert
    assert response.status_code == 502
    assert response.json()["detail"]["status"] == "failed_or_unknown"
    assert blocked.status_code == 409
    assert len(provider.calls) == 1
    assert reconciliation.status_code == 200
    assert "credential-sentinel provider diagnostic" not in response.text
    assert "credential-sentinel provider diagnostic" not in caplog.text
    assert answer["expected_brand"] not in response.text
    assert answer["expected_cta"] not in response.text
    assert answer["expected_brand"] not in caplog.text
    assert answer["expected_cta"] not in caplog.text


def test_given_concurrent_paid_reservations_when_reserved_then_only_one_succeeds(
    tmp_path: Path,
) -> None:
    # Arrange
    root = tmp_path / "private"
    first = WebStorage(root)
    second = WebStorage(root)
    barrier = threading.Barrier(2)

    def reserve(store: WebStorage, suffix: str) -> str:
        barrier.wait()
        try:
            store.reserve_paid_run(
                run_id=f"run-{suffix}",
                attempt_id=f"attempt-{suffix}",
                owner=f"user-{suffix}",
                brief_ids=["brief-001"],
                per_brief_estimates={"brief-001": "0.01"},
                estimated_cost_usd=Decimal("0.01"),
                submitted_characters=100,
                total_budget_usd=Decimal("1"),
                evidence={"region": "test-region"},
            )
        except StorageConflict:
            return "blocked"
        return "reserved"

    # Act
    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(
            executor.map(
                lambda pair: reserve(*pair),
                [(first, "one"), (second, "two")],
            )
        )

    # Assert
    assert sorted(results) == ["blocked", "reserved"]


def test_given_private_storage_inside_static_root_when_initializing_then_rejects_path() -> (
    None
):
    # Arrange
    unsafe_root = Path(web_app.__file__).resolve().parent / "web" / "private"

    # Act & Assert
    with pytest.raises(ValueError, match="outside the web root"):
        WebStorage(unsafe_root)
