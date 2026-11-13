"""Local same-origin web API for the protected audio proof of concept."""

from __future__ import annotations

import json
import os
import sqlite3
import threading
import uuid
from collections.abc import Callable, Mapping
from decimal import Decimal, InvalidOperation
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any, Literal

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.responses import FileResponse

from audio_poc.__main__ import (
    FIXTURES,
    cost_for,
    load_evidence,
    load_inputs,
    render_brief,
)
from audio_poc.speech import AzureSpeech, SpeechProvider
from audio_poc.web_auth import (
    AuthConfigurationError,
    AuthSettings,
    TokenValidator,
    require_scope,
)
from audio_poc.web_storage import (
    StorageConflict,
    StorageNotFound,
    WebStorage,
)

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
EXPECTED_ANSWERS = FIXTURES / "expected-brand-cta.json"
ACCEPTED_RATING = "usable with minor edits"
ALLOWED_RATINGS = {
    ACCEPTED_RATING,
    "usable with major edits",
    "not usable",
}
EVIDENCE_FIELDS = (
    "tier",
    "region",
    "resource_reference",
    "usd_per_million_characters",
    "rate_source",
    "rate_checked_on",
    "commercial_use_basis",
)


class BriefSelection(BaseModel):
    """A bounded selection of canonical synthetic briefs."""

    brief_ids: list[str] = Field(min_length=1, max_length=3)


class RenderConfirmation(BaseModel):
    """The browser's explicit acknowledgment of the server estimate."""

    brief_ids: list[str] = Field(min_length=1, max_length=3)
    estimated_cost_usd: str = Field(min_length=1, max_length=64)


class RenderRequest(BriefSelection):
    """One offline render or explicitly confirmed paid render."""

    mode: Literal["instrumental", "azure"]
    confirmation: RenderConfirmation | None = None


class EvaluationSubmission(BaseModel):
    """A participant's immutable transcription and usability rating."""

    brand_transcription: str = Field(max_length=1000)
    cta_transcription: str = Field(max_length=2000)
    self_rating: str = Field(min_length=1, max_length=64)


class ReconciliationSubmission(BaseModel):
    """Operator-entered actual usage and its evidence reference."""

    actual_cost_usd: str = Field(min_length=1, max_length=64)
    evidence_reference: str = Field(min_length=1, max_length=500)


class PaidRenderingDisabled(RuntimeError):
    """Raised when paid rendering has not been explicitly enabled."""


class PaidConfigurationError(RuntimeError):
    """Raised when server-side Speech prerequisites are incomplete."""


class PaidSubjectDenied(RuntimeError):
    """Raised when the authenticated subject is not allowlisted."""


def _positive_decimal(source: Mapping[str, str], name: str) -> Decimal:
    try:
        value = Decimal(source.get(name, "").strip())
    except InvalidOperation as error:
        raise PaidConfigurationError("Speech budget settings are invalid") from error
    if not value.is_finite() or value <= 0:
        raise PaidConfigurationError("Speech budget settings are invalid")
    return value


def _paid_configuration(
    source: Mapping[str, str], subject: str
) -> tuple[dict[str, object], Decimal, Decimal]:
    enabled = source.get("SPEECH_ENABLED", "false").strip().lower()
    if enabled != "true":
        if enabled in {"", "false"}:
            raise PaidRenderingDisabled("Paid Speech rendering is disabled")
        raise PaidConfigurationError("Speech enablement setting is invalid")
    if not source.get("SPEECH_ALLOWED_SUBJECT", "").strip():
        raise PaidConfigurationError("Speech subject allowlist is missing")
    if subject != source["SPEECH_ALLOWED_SUBJECT"].strip():
        raise PaidSubjectDenied("Subject is not allowed to use paid Speech")
    if (
        not source.get("SPEECH_KEY", "").strip()
        or not source.get("SPEECH_REGION", "").strip()
    ):
        raise PaidConfigurationError("Speech credentials are missing")

    evidence_path = Path(
        source.get(
            "SPEECH_EVIDENCE_PATH",
            str(REPOSITORY_ROOT / "renders" / "speech-evidence.json"),
        )
    ).expanduser()
    if not evidence_path.is_absolute():
        evidence_path = REPOSITORY_ROOT / evidence_path
    try:
        evidence = load_evidence(evidence_path)
    except (OSError, ValueError) as error:
        raise PaidConfigurationError(
            "Speech rate and resource evidence is invalid"
        ) from error

    resource_reference = evidence["resource_reference"].strip().lower()
    if (
        resource_reference.startswith(("your ", "replace ", "<"))
        or "placeholder" in resource_reference
        or evidence["region"] != source["SPEECH_REGION"].strip()
    ):
        raise PaidConfigurationError("Speech resource evidence is not usable")

    per_run_cap = _positive_decimal(source, "SPEECH_PER_RUN_CAP_USD")
    total_budget = _positive_decimal(source, "SPEECH_TOTAL_BUDGET_USD")
    sanitized_evidence = {field: evidence.get(field) for field in EVIDENCE_FIELDS}
    return sanitized_evidence, per_run_cap, total_budget


def _selected_inputs(
    requested_ids: list[str],
) -> list[tuple[int, dict[str, Any], str]]:
    if len(set(requested_ids)) != len(requested_ids):
        raise HTTPException(status_code=422, detail="Brief IDs must be unique")
    requested = set(requested_ids)
    inputs = load_inputs()
    selected = [
        (index, brief, text)
        for index, (brief, text) in enumerate(inputs)
        if brief["brief_id"] in requested
    ]
    if len(selected) != len(requested_ids):
        raise HTTPException(status_code=422, detail="Unknown brief ID")
    return selected


def _subject(claims: dict[str, object]) -> str:
    subject = claims.get("sub")
    if not isinstance(subject, str) or not subject.strip():
        raise HTTPException(status_code=401, detail="Invalid access token")
    return subject


def _parse_nonnegative_decimal(value: str) -> Decimal:
    try:
        parsed = Decimal(value)
    except InvalidOperation as error:
        raise HTTPException(status_code=422, detail="Invalid metered cost") from error
    if not parsed.is_finite() or parsed < 0:
        raise HTTPException(status_code=422, detail="Invalid metered cost")
    return parsed


def _normalize_answer(value: str) -> str:
    return value.strip().casefold()


def _read_expected_answers() -> dict[str, dict[str, object]]:
    try:
        records = json.loads(EXPECTED_ANSWERS.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise HTTPException(
            status_code=503, detail="Evaluation data is unavailable"
        ) from error
    if not isinstance(records, list):
        raise HTTPException(status_code=503, detail="Evaluation data is unavailable")
    answers: dict[str, dict[str, object]] = {}
    for record in records:
        if not isinstance(record, dict):
            raise HTTPException(
                status_code=503, detail="Evaluation data is unavailable"
            )
        brief_id = record.get("brief_id")
        if (
            not isinstance(brief_id, str)
            or not isinstance(record.get("expected_brand"), str)
            or not isinstance(record.get("expected_cta"), str)
            or not isinstance(record.get("accepted_cta_variants"), list)
            or not all(
                isinstance(variant, str) for variant in record["accepted_cta_variants"]
            )
        ):
            raise HTTPException(
                status_code=503, detail="Evaluation data is unavailable"
            )
        answers[brief_id] = record
    return answers


def _actual_request_cost(output: dict[str, Any]) -> Decimal | None:
    attempt = output["attempt"]
    if attempt is None:
        usage = output["manifest"]["azure_usage"]
        return Decimal(0) if usage["submitted_characters"] == 0 else None
    if attempt["status"] != "reconciled" or attempt["actual_cost_usd"] is None:
        return None
    total_estimate = Decimal(attempt["estimated_cost_usd"])
    brief_estimate = Decimal(attempt["per_brief_estimates"][output["brief_id"]])
    if total_estimate <= 0:
        return None
    return Decimal(attempt["actual_cost_usd"]) * brief_estimate / total_estimate


def _allocated_actual_cost(output: dict[str, Any]) -> Decimal | None:
    request_cost = _actual_request_cost(output)
    return request_cost / Decimal(2) if request_cost is not None else None


def _output_status(output: dict[str, Any]) -> str:
    manifest = output["manifest"]
    if manifest.get("status") == "Fail" or manifest.get("numeric_gates") == "Fail":
        return "Fail"
    actual_request_cost = _actual_request_cost(output)
    if actual_request_cost is not None and actual_request_cost >= Decimal("0.50"):
        return "Fail"
    evaluation = output["evaluation"]
    if evaluation is None:
        return "Pending"
    if (
        not evaluation["brand_match"]
        or not evaluation["cta_match"]
        or evaluation["self_rating"] != ACCEPTED_RATING
    ):
        return "Fail"
    if manifest.get("numeric_gates") != "Pass":
        return "Pending"
    components = manifest.get("components")
    if (
        not isinstance(components, list)
        or not components
        or any(component.get("status") != "Pass" for component in components)
    ):
        return "Pending"
    actual_cost = _allocated_actual_cost(output)
    if actual_cost is None:
        return "Pending"
    if actual_cost >= Decimal("0.50"):
        return "Fail"
    return "Pass"


def _public_output(output: dict[str, Any]) -> dict[str, Any]:
    manifest = output["manifest"]
    return {
        "output_id": output["output_id"],
        "run_id": output["run_id"],
        "brief_id": output["brief_id"],
        "variant": output["variant"],
        "duration_seconds": manifest["duration_seconds"],
        "render_seconds": manifest["render_seconds"],
        "numeric_gates": manifest["numeric_gates"],
        "components": manifest["components"],
        "azure_usage": manifest["azure_usage"],
        "evaluation": output["evaluation"],
        "status": _output_status(output),
        "audio_url": f"/api/outputs/{output['output_id']}/audio",
        "evidence_url": f"/api/outputs/{output['output_id']}/evidence",
    }


def _rollup(outputs: list[dict[str, Any]]) -> dict[str, Any]:
    by_brief: dict[str, list[dict[str, Any]]] = {}
    for output in outputs:
        by_brief.setdefault(output["brief_id"], []).append(output)
    briefs = []
    for brief, _script in load_inputs():
        brief_outputs = by_brief.get(brief["brief_id"], [])
        statuses = [_output_status(output) for output in brief_outputs]
        if "Fail" in statuses:
            status = "Fail"
        elif not statuses or any(item != "Pass" for item in statuses):
            status = "Pending"
        else:
            status = "Pass"
        briefs.append(
            {
                "brief_id": brief["brief_id"],
                "status": status,
                "outputs": [_public_output(output) for output in brief_outputs],
            }
        )
    if any(brief["status"] == "Fail" for brief in briefs):
        overall = "Fail"
    elif any(brief["status"] != "Pass" for brief in briefs):
        overall = "Pending"
    else:
        overall = "Pass"
    return {"status": overall, "briefs": briefs}


def create_app(
    *,
    environ: Mapping[str, str] | None = None,
    data_dir: Path | None = None,
    metadata_fetcher: Callable[[str], Mapping[str, object]] | None = None,
    jwks_fetcher: Callable[[str], Mapping[str, object]] | None = None,
    speech_provider_factory: Callable[[], SpeechProvider] | None = None,
) -> FastAPI:
    """Create the local API; storage and external providers stay lazy."""
    source = os.environ if environ is None else environ
    try:
        settings = AuthSettings.from_environment(source)
    except AuthConfigurationError:
        settings = None
        setup_status = "unavailable"
    else:
        setup_status = "configured" if settings is not None else "setup-needed"

    configured_data_dir = data_dir
    if configured_data_dir is None:
        configured_data_dir = Path(
            source.get("EARWYRM_DATA_DIR", str(REPOSITORY_ROOT / ".earwyrm-data"))
        ).expanduser()
        if not configured_data_dir.is_absolute():
            configured_data_dir = REPOSITORY_ROOT / configured_data_dir

    app = FastAPI(
        title="Earwyrm Audio POC",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    app.state.token_validator = (
        TokenValidator(
            settings,
            **(
                {"metadata_fetcher": metadata_fetcher}
                if metadata_fetcher is not None
                else {}
            ),
            **({"jwks_fetcher": jwks_fetcher} if jwks_fetcher is not None else {}),
        )
        if settings is not None
        else None
    )
    app.state.setup_status = setup_status
    app.state.public_identity = {
        "client_id": source.get("ENTRA_CLIENT_ID") or None,
        "authority": source.get("ENTRA_AUTHORITY") or None,
        "scope_prefix": source.get("ENTRA_API_SCOPE_PREFIX") or None,
    }
    app.state.data_dir = configured_data_dir
    app.state.storage = None
    app.state.storage_lock = threading.Lock()
    app.state.paid_render_lock = threading.Lock()
    app.state.speech_provider_factory = speech_provider_factory or AzureSpeech

    def storage() -> WebStorage:
        with app.state.storage_lock:
            if app.state.storage is None:
                app.state.storage = WebStorage(app.state.data_dir)
            return app.state.storage

    def paid_configuration(
        claims: dict[str, object],
    ) -> tuple[dict[str, object], Decimal, Decimal]:
        try:
            return _paid_configuration(source, _subject(claims))
        except PaidRenderingDisabled as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        except PaidSubjectDenied as error:
            raise HTTPException(status_code=403, detail=str(error)) from error
        except PaidConfigurationError as error:
            raise HTTPException(
                status_code=503, detail="Paid Speech rendering is unavailable"
            ) from error

    @app.middleware("http")
    async def apply_security_headers(request: Request, call_next: Callable[..., Any]):
        response = await call_next(request)
        is_auth_callback = request.url.path == "/auth-callback.html"
        if request.url.path.startswith("/api/") or is_auth_callback:
            response.headers["Cache-Control"] = "private, no-store"
        validator: TokenValidator | None = app.state.token_validator
        identity_origins: set[str] = set()
        if validator is not None:
            try:
                identity_origins = validator.allowed_identity_origins()
            except AuthConfigurationError:
                pass
        trusted_sources = " ".join(["'self'", *sorted(identity_origins)])
        frame_ancestors = "'self'" if is_auth_callback else "'none'"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self'; "
            "style-src 'self'; "
            "img-src 'self' data:; "
            f"connect-src {trusted_sources}; "
            f"frame-src {trusted_sources}; "
            "object-src 'none'; "
            "base-uri 'self'; "
            f"frame-ancestors {frame_ancestors}; "
            "form-action 'self'"
        )
        return response

    @app.get("/healthz")
    def health() -> dict[str, str]:
        """Report process health without checking identity or external services."""
        return {"status": "ok"}

    @app.get("/api/config")
    def public_config() -> dict[str, str | None]:
        """Return the browser's non-secret identity settings and readiness."""
        validator: TokenValidator | None = app.state.token_validator
        status = app.state.setup_status
        if validator is not None:
            try:
                validator.preflight()
            except AuthConfigurationError:
                status = "unavailable"
            else:
                status = "ready"
        return {**app.state.public_identity, "setup_status": status}

    @app.get("/api/briefs")
    def list_briefs(
        _claims: dict[str, object] = Depends(require_scope("briefs.read")),
    ) -> list[dict[str, object]]:
        """List only generation-facing brief fields for an authorized user."""
        return [brief for brief, _script in load_inputs()]

    @app.get("/api/render-options")
    def render_options(
        claims: dict[str, object] = Depends(require_scope("renders.read")),
    ) -> dict[str, object]:
        """Report offline availability and global paid-mode status."""
        enabled = source.get("SPEECH_ENABLED", "false").strip().lower()
        if enabled in {"", "false"}:
            speech_status = "disabled"
        elif enabled != "true":
            speech_status = "unavailable"
        else:
            try:
                _paid_configuration(source, _subject(claims))
            except (PaidConfigurationError, PaidSubjectDenied):
                speech_status = "unavailable"
            else:
                speech_status = (
                    "busy" if storage().has_unreconciled_paid_attempt() else "available"
                )
        return {
            "instrumental_available": True,
            "speech_status": speech_status,
        }

    @app.post("/api/renders/estimate")
    def estimate_paid_render(
        selection: BriefSelection,
        claims: dict[str, object] = Depends(require_scope("renders.write")),
    ) -> dict[str, object]:
        """Calculate an allowlisted user's server-side Speech estimate."""
        selected = _selected_inputs(selection.brief_ids)
        evidence, per_run_cap, _total_budget = paid_configuration(claims)
        per_brief = {
            brief["brief_id"]: cost_for(text, evidence)
            for _index, brief, text in selected
        }
        estimate = sum(per_brief.values(), Decimal(0))
        if estimate > per_run_cap:
            raise HTTPException(status_code=409, detail="Per-run Speech cap exceeded")
        return {
            "brief_ids": [brief["brief_id"] for _, brief, _ in selected],
            "estimated_cost_usd": str(estimate),
        }

    @app.post("/api/renders")
    def create_render(
        payload: RenderRequest,
        claims: dict[str, object] = Depends(require_scope("renders.write")),
    ) -> dict[str, Any]:
        """Create a user-owned offline or explicitly confirmed Speech run."""
        owner = _subject(claims)
        selected = _selected_inputs(payload.brief_ids)
        brief_ids = [brief["brief_id"] for _, brief, _ in selected]
        store = storage()
        run_id = str(uuid.uuid4())
        attempt_id: str | None = None
        evidence: dict[str, object] | None = None
        per_brief_estimates: dict[str, Decimal] = {}
        estimate = Decimal(0)
        total_budget = Decimal(0)

        if payload.mode == "instrumental":
            if payload.confirmation is not None:
                raise HTTPException(
                    status_code=422,
                    detail="Offline rendering does not accept a paid confirmation",
                )
            store.create_run(run_id, owner, "instrumental", brief_ids)
        else:
            evidence, per_run_cap, total_budget = paid_configuration(claims)
            per_brief_estimates = {
                brief["brief_id"]: cost_for(text, evidence)
                for _index, brief, text in selected
            }
            estimate = sum(per_brief_estimates.values(), Decimal(0))
            if estimate > per_run_cap:
                raise HTTPException(
                    status_code=409, detail="Per-run Speech cap exceeded"
                )
            confirmation = payload.confirmation
            if confirmation is None:
                raise HTTPException(
                    status_code=409, detail="Explicit Speech confirmation is required"
                )
            if confirmation.brief_ids != brief_ids:
                raise HTTPException(
                    status_code=409, detail="Speech confirmation does not match briefs"
                )
            confirmed_estimate = _parse_nonnegative_decimal(
                confirmation.estimated_cost_usd
            )
            if confirmed_estimate != estimate:
                raise HTTPException(
                    status_code=409,
                    detail="Speech confirmation does not match the server estimate",
                )
            if not app.state.paid_render_lock.acquire(blocking=False):
                raise HTTPException(
                    status_code=409, detail="A paid render is already active"
                )
            attempt_id = str(uuid.uuid4())
            try:
                store.reserve_paid_run(
                    run_id=run_id,
                    attempt_id=attempt_id,
                    owner=owner,
                    brief_ids=brief_ids,
                    per_brief_estimates={
                        key: str(value) for key, value in per_brief_estimates.items()
                    },
                    estimated_cost_usd=estimate,
                    submitted_characters=sum(len(text) for _, _, text in selected),
                    total_budget_usd=total_budget,
                    evidence=evidence,
                )
            except StorageConflict as error:
                app.state.paid_render_lock.release()
                raise HTTPException(status_code=409, detail=str(error)) from error

        try:
            with TemporaryDirectory(dir=store.work_dir) as temporary:
                temporary_root = Path(temporary)
                provider = None
                if payload.mode == "azure":
                    store.mark_attempt_submitted(attempt_id)
                    provider = app.state.speech_provider_factory()
                for index, brief, text in selected:
                    work_directory = temporary_root / brief["brief_id"]
                    rows = render_brief(
                        work_directory,
                        brief,
                        text,
                        index,
                        provider,
                        evidence,
                    )
                    for row in rows:
                        audio = (work_directory / row["file"]).read_bytes()
                        store.save_output(
                            run_id=run_id,
                            owner=owner,
                            manifest=row,
                            audio=audio,
                            attempt_id=attempt_id,
                        )
            store.set_run_status(run_id, "completed")
            if attempt_id is not None:
                store.finish_attempt(attempt_id, "awaiting_reconciliation")
        except (
            RuntimeError,
            ValueError,
            OSError,
            ArithmeticError,
            ImportError,
            sqlite3.Error,
        ) as error:
            store.set_run_status(run_id, "failed_or_unknown")
            if attempt_id is not None:
                store.finish_attempt(attempt_id, "failed_or_unknown")
                raise HTTPException(
                    status_code=502,
                    detail={
                        "message": "Speech render failed or has unknown usage",
                        "attempt_id": attempt_id,
                        "status": "failed_or_unknown",
                    },
                ) from error
            raise HTTPException(
                status_code=500, detail="Offline render failed"
            ) from error
        finally:
            if attempt_id is not None:
                app.state.paid_render_lock.release()

        result = store.get_run(run_id, owner)
        if result is None:
            raise HTTPException(status_code=500, detail="Render record is unavailable")
        return {
            **result,
            "outputs": [_public_output(output) for output in result["outputs"]],
        }

    @app.get("/api/renders/{run_id}")
    def get_render(
        run_id: str,
        claims: dict[str, object] = Depends(require_scope("renders.read")),
    ) -> dict[str, Any]:
        """Return a run's status and outputs only to its authenticated owner."""
        result = storage().get_run(run_id, _subject(claims))
        if result is None:
            raise HTTPException(status_code=404, detail="Render run was not found")
        return {
            **result,
            "outputs": [_public_output(output) for output in result["outputs"]],
        }

    @app.get("/api/renders")
    def list_renders(
        claims: dict[str, object] = Depends(require_scope("renders.read")),
    ) -> dict[str, Any]:
        """List owner-scoped run and attempt statuses for recovery after disconnect."""
        runs = storage().list_runs(_subject(claims))
        return {
            "runs": [
                {
                    **run,
                    "outputs": [_public_output(output) for output in run["outputs"]],
                }
                for run in runs
            ]
        }

    @app.get("/api/outputs")
    def list_outputs(
        claims: dict[str, object] = Depends(require_scope("renders.read")),
    ) -> dict[str, Any]:
        """List only the authenticated user's output metadata."""
        outputs = storage().list_outputs(_subject(claims))
        return {"outputs": [_public_output(output) for output in outputs]}

    @app.get("/api/poc/status")
    def get_poc_status(
        claims: dict[str, object] = Depends(require_scope("renders.read")),
    ) -> dict[str, Any]:
        """Compute the conservative three-brief rollup for one user."""
        return _rollup(storage().list_outputs(_subject(claims)))

    @app.get("/api/outputs/{output_id}/audio")
    def download_audio(
        output_id: str,
        claims: dict[str, object] = Depends(require_scope("outputs.read")),
    ) -> FileResponse:
        """Stream a generated WAV after an owner-scoped database lookup."""
        store = storage()
        output = store.get_output(output_id, _subject(claims))
        if output is None:
            raise HTTPException(status_code=404, detail="Output was not found")
        path = store.audio_path(output)
        if not path.is_file():
            raise HTTPException(status_code=404, detail="Output audio was not found")
        return FileResponse(
            path,
            media_type="audio/wav",
            filename=f"{output_id}.wav",
            headers={"Cache-Control": "private, no-store"},
        )

    @app.get("/api/outputs/{output_id}/evidence")
    def get_output_evidence(
        output_id: str,
        claims: dict[str, object] = Depends(require_scope("outputs.read")),
    ) -> dict[str, Any]:
        """Return an owner's render and evaluation evidence without answer keys."""
        output = storage().get_output(output_id, _subject(claims))
        if output is None:
            raise HTTPException(status_code=404, detail="Output was not found")
        attempt = output["attempt"]
        return {
            "output_id": output_id,
            "status": _output_status(output),
            "manifest": output["manifest"],
            "evaluation": output["evaluation"],
            "attempt": (
                {
                    "attempt_id": attempt["attempt_id"],
                    "status": attempt["status"],
                    "estimated_cost_usd": attempt["estimated_cost_usd"],
                    "actual_cost_usd": attempt["actual_cost_usd"],
                    "reconciliation_reference": attempt["reconciliation_reference"],
                    "evidence": attempt["evidence"],
                }
                if attempt is not None
                else None
            ),
        }

    @app.post("/api/outputs/{output_id}/evaluation")
    def submit_evaluation(
        output_id: str,
        submission: EvaluationSubmission,
        claims: dict[str, object] = Depends(require_scope("evaluations.write")),
    ) -> dict[str, Any]:
        """Compare a submitted transcription without exposing expected answers."""
        if submission.self_rating not in ALLOWED_RATINGS:
            raise HTTPException(status_code=422, detail="Invalid usability rating")
        store = storage()
        owner = _subject(claims)
        output = store.get_output(output_id, owner)
        if output is None:
            raise HTTPException(status_code=404, detail="Output was not found")

        answers = _read_expected_answers()
        answer = answers.get(output["brief_id"])
        if answer is None:
            raise HTTPException(
                status_code=503, detail="Evaluation data is unavailable"
            )
        brand_match = _normalize_answer(submission.brand_transcription) == (
            _normalize_answer(answer["expected_brand"])
        )
        accepted_ctas = [
            answer["expected_cta"],
            *answer["accepted_cta_variants"],
        ]
        cta_match = _normalize_answer(submission.cta_transcription) in {
            _normalize_answer(value) for value in accepted_ctas
        }
        try:
            saved = store.save_evaluation(
                output_id=output_id,
                owner=owner,
                brand_transcription=submission.brand_transcription,
                cta_transcription=submission.cta_transcription,
                self_rating=submission.self_rating,
                brand_match=brand_match,
                cta_match=cta_match,
            )
        except StorageNotFound as error:
            raise HTTPException(
                status_code=404, detail="Output was not found"
            ) from error
        if not saved:
            raise HTTPException(
                status_code=409, detail="Evaluation is immutable after submission"
            )
        evaluated = store.get_output(output_id, owner)
        if evaluated is None:
            raise HTTPException(status_code=404, detail="Output was not found")
        return {
            "output_id": output_id,
            "brand_match": brand_match,
            "cta_match": cta_match,
            "self_rating": submission.self_rating,
            "status": _output_status(evaluated),
        }

    @app.post("/api/attempts/{attempt_id}/reconcile")
    def reconcile_attempt(
        attempt_id: str,
        submission: ReconciliationSubmission,
        claims: dict[str, object] = Depends(require_scope("renders.write")),
    ) -> dict[str, Any]:
        """Record operator-provided billing evidence for an owned paid attempt."""
        try:
            actual_cost = _parse_nonnegative_decimal(submission.actual_cost_usd)
        except HTTPException as error:
            raise HTTPException(
                status_code=422, detail="Invalid metered cost"
            ) from error
        evidence_reference = submission.evidence_reference.strip()
        if not evidence_reference:
            raise HTTPException(
                status_code=422, detail="Evidence reference is required"
            )
        paid_lock: threading.Lock = app.state.paid_render_lock
        if not paid_lock.acquire(blocking=False):
            raise HTTPException(status_code=409, detail="A paid render is active")
        try:
            attempt = storage().reconcile_attempt(
                attempt_id=attempt_id,
                owner=_subject(claims),
                actual_cost_usd=actual_cost,
                evidence_reference=evidence_reference,
            )
        except StorageNotFound as error:
            raise HTTPException(
                status_code=404, detail="Paid attempt was not found"
            ) from error
        except StorageConflict as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        finally:
            paid_lock.release()
        return {
            "attempt_id": attempt["attempt_id"],
            "status": attempt["status"],
            "actual_cost_usd": attempt["actual_cost_usd"],
            "reconciliation_reference": attempt["reconciliation_reference"],
        }

    app.mount(
        "/",
        StaticFiles(directory=REPOSITORY_ROOT / "audio_poc" / "web", html=True),
        name="web",
    )
    return app


app = create_app()
