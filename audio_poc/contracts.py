"""Version-one platform contracts, reusing the existing creative-service models."""

from __future__ import annotations

import uuid
from typing import Annotated, Literal, Self
from urllib.parse import urlsplit

from pydantic import AwareDatetime, Field, model_validator

from audio_poc.lyrics import AdvertiserBrief, LyricRequest, LyricResult
from audio_poc.melody import CompositionRequest, Contract, ProductPath
from audio_poc.melody_service import Component, CompositionResult

Identifier = Annotated[str, Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$")]
Digest = Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
Text = Annotated[str, Field(min_length=1, max_length=1000)]


class VersionIdentity(Contract):
    """A candidate version is immutable; regeneration receives a new version ID."""

    job_id: uuid.UUID
    version_id: uuid.UUID
    version_number: int = Field(ge=1, strict=True)
    brief_id: str = Field(pattern=r"^brief-[0-9]{3}$")


class ServiceError(Contract):
    """Safe public error metadata, never a provider response or credential."""

    code: Identifier
    message: Text
    retryable: bool
    trace_id: str = Field(pattern=r"^[0-9a-f]{32}$")


class BlobArtifact(Contract):
    """An authenticated HTTPS artifact reference; never a bearer/SAS review URL."""

    uri: str = Field(max_length=2000)
    media_type: str = Field(min_length=1, max_length=100)
    sha256: Digest

    @model_validator(mode="after")
    def reject_bearer_urls(self) -> Self:
        parsed = urlsplit(self.uri)
        if (
            parsed.scheme != "https"
            or not parsed.hostname
            or parsed.username
            or parsed.password
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError(
                "Artifact references require HTTPS without credentials or queries"
            )
        return self


class RenderMessage(Contract):
    """A small queue envelope; composition owns submission, not the workflow."""

    schema_version: Literal[1] = 1
    identity: VersionIdentity
    composition: BlobArtifact
    product_path: ProductPath
    traceparent: str = Field(pattern=r"^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$")

    @model_validator(mode="after")
    def reject_empty_trace(self) -> Self:
        _, trace_id, span_id, _ = self.traceparent.split("-")
        if trace_id == "0" * 32 or span_id == "0" * 16:
            raise ValueError("Trace and span IDs must be nonzero")
        return self


class QualityCheck(Contract):
    """A measured inclusive interval; missing measurements or limits stay pending."""

    measured: float | None = None
    minimum: float | None = None
    maximum: float | None = None
    unit: Literal["s", "LUFS", "1"]
    status: Literal["pass", "fail", "pending"]
    evidence: Text

    @model_validator(mode="after")
    def validate_measurement(self) -> Self:
        if (
            self.minimum is not None
            and self.maximum is not None
            and self.minimum > self.maximum
        ):
            raise ValueError("Quality minimum exceeds maximum")
        measurable = self.measured is not None and (
            self.minimum is not None or self.maximum is not None
        )
        if not measurable:
            expected = "pending"
        else:
            within = (self.minimum is None or self.measured >= self.minimum) and (
                self.maximum is None or self.measured <= self.maximum
            )
            expected = "pass" if within else "fail"
        if self.status != expected:
            raise ValueError(
                "Quality status must agree with measurements and configured limits"
            )
        return self


class QualityReport(Contract):
    """Every required measure must pass; this is not a broadcast approval."""

    schema_version: Literal[1] = 1
    identity: VersionIdentity
    duration: QualityCheck
    loudness: QualityCheck
    intelligibility: QualityCheck
    similarity: QualityCheck
    status: Literal["pass", "fail", "pending"]
    checked_at: AwareDatetime

    @model_validator(mode="after")
    def validate_outcome(self) -> Self:
        checks = (self.duration, self.loudness, self.intelligibility, self.similarity)
        statuses = {check.status for check in checks}
        expected = (
            "fail"
            if "fail" in statuses
            else "pending"
            if "pending" in statuses
            else "pass"
        )
        if self.status != expected:
            raise ValueError(
                "Overall quality must fail on failure and remain pending on missing evidence"
            )
        if (
            self.duration.unit != "s"
            or self.duration.minimum != 29.5
            or self.duration.maximum != 30.0
            or self.loudness.unit != "LUFS"
            or self.intelligibility.unit != "1"
            or self.similarity.unit != "1"
        ):
            raise ValueError(
                "Quality units and duration limits must match the v1 contract"
            )
        return self


class ApprovalRecord(Contract):
    """An authenticated human decision bound to the exact candidate artifact."""

    schema_version: Literal[1] = 1
    approval_id: uuid.UUID
    identity: VersionIdentity
    actor_object_id: uuid.UUID
    role: Literal["seller", "advertiser", "producer"]
    decision: Literal["approved", "rejected"]
    artifact_sha256: Digest
    recorded_at: AwareDatetime
    note: str | None = Field(default=None, max_length=1000)


class RenderManifest(Contract):
    """Immutable provenance, technical quality, and separate human decisions."""

    schema_version: Literal[1] = 1
    identity: VersionIdentity
    product_path: ProductPath
    audio: BlobArtifact
    created_at: AwareDatetime
    ai_generated: Literal[True] = True
    disclosure: Literal["AI-generated review demo; not cleared for broadcast"] = (
        "AI-generated review demo; not cleared for broadcast"
    )
    components: list[Component] = Field(min_length=1)
    tool_versions: dict[Identifier, Text] = Field(min_length=1)
    speech_resource_id: Text
    speech_result_id: Text
    voice: Literal["en-US-JennyNeural"] = "en-US-JennyNeural"
    quality: QualityReport
    approvals: list[ApprovalRecord] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_references(self) -> Self:
        if self.quality.identity != self.identity or any(
            approval.identity != self.identity
            or approval.artifact_sha256 != self.audio.sha256
            for approval in self.approvals
        ):
            raise ValueError(
                "Quality and approvals must reference this exact version and audio"
            )
        return self


class JobRecord(Contract):
    """Persist status separately from approval; queue retries reuse the same IDs."""

    schema_version: Literal[1] = 1
    identity: VersionIdentity
    status: Literal[
        "queued", "running", "quality_failed", "awaiting_approval", "failed"
    ]
    attempt: int = Field(ge=1, le=2, strict=True)
    created_at: AwareDatetime
    updated_at: AwareDatetime
    error: ServiceError | None = None
    manifest: BlobArtifact | None = None

    @model_validator(mode="after")
    def validate_status(self) -> Self:
        if self.updated_at < self.created_at:
            raise ValueError("Job update cannot precede creation")
        if (self.status == "failed") != (self.error is not None):
            raise ValueError("Only failed jobs require an error")
        if (self.status in {"quality_failed", "awaiting_approval"}) != (
            self.manifest is not None
        ):
            raise ValueError(
                "Finished render states require a manifest; unfinished states cannot have one"
            )
        return self


class ServiceContracts(Contract):
    """JSON Schema catalog; creative model definitions remain canonical."""

    brief: AdvertiserBrief
    lyric_request: LyricRequest
    lyric_result: LyricResult
    composition_request: CompositionRequest
    composition_result: CompositionResult
    render_message: RenderMessage
    job: JobRecord
    quality_report: QualityReport
    manifest: RenderManifest
    approval: ApprovalRecord
