"""Reproducible candidate randomness for tests of downstream render behavior."""

from __future__ import annotations

from itertools import count

import pytest


@pytest.fixture
def composition_seeds(monkeypatch: pytest.MonkeyPatch) -> None:
    """Keep downstream tests independent of chance reference-set rejections."""
    seeds = count(42)
    monkeypatch.setattr(
        "audio_poc.similarity.secrets.randbits", lambda _bits: next(seeds)
    )
