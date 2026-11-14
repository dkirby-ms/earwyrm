"""Reproducible candidate randomness for tests of downstream render behavior."""

from __future__ import annotations

from itertools import count

import pytest

from audio_poc.lyrics import LyricDraft, LyricRequest


@pytest.fixture
def composition_seeds(monkeypatch: pytest.MonkeyPatch) -> None:
    """Keep downstream tests independent of chance reference-set rejections."""
    seeds = count(42)
    monkeypatch.setattr(
        "audio_poc.similarity.secrets.randbits", lambda _bits: next(seeds)
    )


@pytest.fixture
def lyric_request() -> LyricRequest:
    """A synthetic bike brief with an approved phone-visit CTA."""
    return LyricRequest.model_validate(
        {
            "brief": {
                "brief_id": "brief-001",
                "name": "Bright Bike",
                "offer": "Bike tune ups",
                "location": "Lakeview",
                "contact_details": {
                    "email": "shop@example.com",
                    "phone": "+1-202-555-0101",
                },
                "tone": "Friendly and practical",
                "approved_claims": [
                    "Bike tune ups are available",
                    "Call to plan a visit",
                ],
            },
            "product_path": "spoken",
            "cta": "Call Bright Bike to plan your next ride",
        }
    )


@pytest.fixture
def lyric_draft() -> LyricDraft:
    """Original two-line output with dictionary-verified monosyllables."""
    return LyricDraft(
        hook="Bright Bike, a tune up for your ride",
        lyrics="Bright Bike, a tune up for your ride\nCall Bright Bike to plan your next ride",
        syllables_per_line=[8, 8],
        rhyme_scheme="--",
        brand_count=2,
        cta="Call Bright Bike to plan your next ride",
    )
