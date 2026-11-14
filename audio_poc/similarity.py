"""Bounded, transposition-invariant screening, not catalog or legal clearance."""

from __future__ import annotations

import logging
import secrets
from collections.abc import Callable, Mapping, Sequence
from difflib import SequenceMatcher
from typing import TypeVar

from pydantic import Field

from audio_poc.melody import Contract

REFERENCE_VERSION = "earwyrm-reference-v1"
THRESHOLD = 0.85
WINDOW = 7
LIMITATION = "Limited reference-set screening only; not commercial-catalog or legal clearance. Human rights and producer review required."
MAX_CANDIDATES = 8
LOGGER = logging.getLogger(__name__)
Candidate = TypeVar("Candidate")

# Public-domain compositions, manually encoded; no recordings or arrangements copied.
KNOWN_TUNES: dict[str, list[int]] = {
    "traditional:twinkle-twinkle": [
        60,
        60,
        67,
        67,
        69,
        69,
        67,
        65,
        65,
        64,
        64,
        62,
        62,
        60,
    ],
    "beethoven:ode-to-joy": [
        64,
        64,
        65,
        67,
        67,
        65,
        64,
        62,
        60,
        60,
        62,
        64,
        64,
        62,
        62,
    ],
    "traditional:frere-jacques": [
        60,
        62,
        64,
        60,
        60,
        62,
        64,
        60,
        64,
        65,
        67,
        64,
        65,
        67,
    ],
}
LEGACY_MOTIFS = ([0, 7, 12, 4, 9, 7, 4, 2], [0, 4, 7, 9, 7, 4, 2, 0])
REFERENCES = {
    **KNOWN_TUNES,
    **{
        f"earwyrm:legacy-{kind}-rotation-{rotation}": (
            motif[rotation:] + motif[:rotation]
        )
        * 3
        for kind, motif in enumerate(LEGACY_MOTIFS)
        for rotation in range(8)
    },
}


class SimilarityReport(Contract):
    """Auditable strongest match and the exact screening policy used."""

    reference_version: str = REFERENCE_VERSION
    method: str = "max-seven-interval-window-sequence-ratio"
    threshold: float = THRESHOLD
    maximum_similarity: float = Field(ge=0, le=1)
    closest_reference: str
    references_checked: int
    passed: bool
    limitation: str = LIMITATION


class SimilarityError(ValueError):
    """A rejected melody cannot be delivered or queued."""

    def __init__(self, report: SimilarityReport) -> None:
        self.report = report
        super().__init__(
            f"Melody similarity rejected: {report.closest_reference} "
            f"scored {report.maximum_similarity:.3f} >= {report.threshold}. {LIMITATION}"
        )


def _windows(pitches: Sequence[int]) -> set[tuple[int, ...]]:
    intervals = [right - left for left, right in zip(pitches, pitches[1:])]
    if len(intervals) < WINDOW:
        raise ValueError(
            "Similarity screening requires at least eight notes per melody"
        )
    return {
        tuple(intervals[start : start + WINDOW])
        for start in range(len(intervals) - WINDOW + 1)
    }


def similarity(left: Sequence[int], right: Sequence[int]) -> float:
    """Compare local interval windows, ignoring absolute pitch and tempo.

    SequenceMatcher counts ordered equal intervals; a seven-interval window with
    six equal intervals scores 6/7 and fails the 0.85 threshold. Rhythm cannot
    disguise a pitch-sequence copy. This small corpus is not a rights clearance.
    """
    a, b = _windows(left), _windows(right)
    if a & b:
        return 1.0
    return max(
        SequenceMatcher(None, x, y, autojunk=False).ratio()
        for x in sorted(a)
        for y in sorted(b)
    )


def screen(
    melodies: Mapping[str, Sequence[int]],
    history: Mapping[str, Sequence[int]] | None = None,
) -> SimilarityReport:
    """Check all submitted melodic parts; one failed part blocks the arrangement."""
    references = {**REFERENCES, **(history or {})}
    maximum, closest = -1.0, ""
    for part, pitches in melodies.items():
        for name, reference in references.items():
            score = similarity(pitches, reference)
            if score > maximum:
                maximum, closest = score, f"{part}/{name}"
    if maximum < 0:
        raise ValueError("No melodies supplied for similarity screening")
    report = SimilarityReport(
        maximum_similarity=maximum,
        closest_reference=closest,
        references_checked=len(references),
        passed=maximum < THRESHOLD,
    )
    if not report.passed:
        raise SimilarityError(report)
    return report


def select_screened(
    build: Callable[[int], tuple[Candidate, dict[str, list[int]]]],
    *,
    seed: int | None,
    history: Mapping[str, Sequence[int]] | None = None,
) -> tuple[int, Candidate, dict[str, list[int]], SimilarityReport]:
    """Choose at most eight local candidates; explicit seeds never silently change."""
    for attempt in range(1, MAX_CANDIDATES + 1):
        chosen_seed = seed if seed is not None else secrets.randbits(63)
        candidate, melodies = build(chosen_seed)
        try:
            report = screen(melodies, history)
        except SimilarityError:
            if seed is not None or attempt == MAX_CANDIDATES:
                raise
            LOGGER.info(
                "Generated candidate rejected by similarity screen; trying another local candidate"
            )
        else:
            return chosen_seed, candidate, melodies, report
    raise AssertionError("Candidate selection exhausted without a screening result")
