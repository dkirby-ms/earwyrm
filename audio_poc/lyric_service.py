"""Fail-closed lyric generation with one initial attempt and three retries."""

from __future__ import annotations

import logging
import re

from opentelemetry import trace
from pydantic import ValidationError

from audio_poc.lyric_cloud import CloudFailure, LyricBackend, ModelRefusal
from audio_poc.lyrics import (
    LyricDraft,
    LyricRequest,
    LyricResult,
    LyricRuleError,
    validate_draft,
)

LOGGER = logging.getLogger(__name__)
TRACER = trace.get_tracer(__name__)
IMITATION = re.compile(
    r"\b(in (?:the )?style of|sound(?:s)? like|inspired by|imitat\w*|"
    r"channel(?:ing)?|sing like|write like|tribute to)\b",
    re.IGNORECASE,
)
RISK = re.compile(
    r"[$%]|\b(dollars?|cents?|pounds?|euros?|price|free|discount|sale|"
    r"best|finest|cheapest|fastest|greatest|leading|guarantee\w*|"
    r"health|medical|dental|clinic|pharmacy|wellness|medicine|treatment|supplement|cure|"
    r"financial|insurance|investment|loan|credit|bank|mortgage|"
    r"alcohol|beer|wine|spirits|brewery|pub|bar|cannabis|gambling|casino|vape|tobacco)\b",
    re.IGNORECASE,
)


def _brief_text(request: LyricRequest) -> str:
    brief = request.brief
    return "\n".join(
        [
            brief.name,
            brief.offer,
            brief.location,
            brief.tone,
            *brief.approved_claims,
            request.cta,
        ]
    )


class LyricWriter:
    """Keep candidate failures separate from terminal safety/provider failures."""

    def __init__(self, backend: LyricBackend) -> None:
        self.backend = backend

    def write(self, request: LyricRequest) -> LyricResult:
        """Return screened lyrics or an explicit outcome, never unsafe draft text."""
        with TRACER.start_as_current_span("create.lyrics", kind=trace.SpanKind.SERVER):
            result = self._write(request)
            if result.status == "unavailable":
                LOGGER.error("Lyric generation unavailable; no lyrics accepted")
            elif result.status != "accepted":
                LOGGER.warning(
                    "Lyric generation did not accept lyrics: %s", result.status
                )
            return result

    def _write(self, request: LyricRequest) -> LyricResult:
        attempts = 0
        feedback: list[str] = []
        brief_text = _brief_text(request)
        if IMITATION.search(brief_text):
            return LyricResult(
                status="rejected", attempts=0, reasons=["artist_imitation"]
            )
        try:
            preflight = self.backend.preflight(request)
            if preflight.artist_imitation or not preflight.english:
                reason = (
                    "artist_imitation"
                    if preflight.artist_imitation
                    else "unsupported_language"
                )
                return LyricResult(status="rejected", attempts=0, reasons=[reason])
            for attempts in range(1, 5):
                try:
                    raw = self.backend.generate(request, feedback)
                    draft = LyricDraft.model_validate_json(raw)
                    validate_draft(request, draft)
                except ValidationError:
                    feedback = ["malformed_lyric_output"]
                    continue
                except LyricRuleError as error:
                    feedback = [str(error)]
                    continue
                except ModelRefusal:
                    raise
                except CloudFailure as error:
                    if not error.retryable:
                        raise
                    feedback = [error.code]
                    continue
                assessment = self.backend.assess(request, draft)
                if not assessment.english:
                    return LyricResult(
                        status="rejected",
                        attempts=attempts,
                        reasons=["unsupported_output_language"],
                    )
                if not assessment.grounded:
                    feedback = ["unsupported_claims"]
                    continue
                screening = self.backend.screen(draft.lyrics)
                reasons = []
                if not screening.moderation_passed:
                    reasons.append("moderation_rejected")
                if screening.protected_material_detected:
                    reasons.append("protected_material")
                if reasons:
                    return LyricResult(
                        status="rejected", attempts=attempts, reasons=reasons
                    )
                held = (
                    preflight.risky_claims
                    or assessment.risky_claims
                    or RISK.search(brief_text) is not None
                    or RISK.search(draft.lyrics) is not None
                )
                return LyricResult(
                    status="human_review_required" if held else "accepted",
                    attempts=attempts,
                    output=draft,
                    reasons=["risky_claims_require_human_review"] if held else [],
                )
        except ModelRefusal:
            return LyricResult(
                status="rejected", attempts=attempts, reasons=["model_refusal"]
            )
        except CloudFailure as error:
            return LyricResult(
                status="unavailable", attempts=attempts, reasons=[error.code]
            )
        return LyricResult(
            status="retry_exhausted", attempts=attempts, reasons=feedback
        )
