"""Provisional v1 lyric contracts and deterministic English prosody checks."""

from __future__ import annotations

import re
from functools import lru_cache
from typing import Annotated, Literal, Self, TypedDict

import cmudict
from pydantic import ConfigDict, Field, model_validator

from audio_poc.melody import Contract, ProductPath

Text = Annotated[str, Field(min_length=1, max_length=400)]
WORD = re.compile(r"[A-Za-z]+(?:'[A-Za-z]+)?")
SPOKEN_TEXT = re.compile(r"[A-Za-z' ,.!?;:\-\n]+")
VOWELS = {
    "AA",
    "AE",
    "AH",
    "AO",
    "AW",
    "AY",
    "EH",
    "ER",
    "EY",
    "IH",
    "IY",
    "OW",
    "OY",
    "UH",
    "UW",
}
CONSONANTS = {
    "B",
    "CH",
    "D",
    "DH",
    "F",
    "G",
    "HH",
    "JH",
    "K",
    "L",
    "M",
    "N",
    "NG",
    "P",
    "R",
    "S",
    "SH",
    "T",
    "TH",
    "V",
    "W",
    "Y",
    "Z",
    "ZH",
}
PHONEMES = CONSONANTS | {f"{vowel}{stress}" for vowel in VOWELS for stress in "012"}


class _Policy(TypedDict):
    lines: int
    min_syllables: int
    max_syllables: int
    rhyme_scheme: str


POLICIES: dict[str, _Policy] = {
    "spoken": {
        "lines": 2,
        "min_syllables": 8,
        "max_syllables": 20,
        "rhyme_scheme": "--",
    },
    "vocoded": {
        "lines": 4,
        "min_syllables": 8,
        "max_syllables": 12,
        "rhyme_scheme": "AABB",
    },
}


class LyricContract(Contract):
    """Reject type coercion and extra fields throughout lyric contracts."""

    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False)


class ContactDetails(LyricContract):
    email: Text
    phone: Text


class AdvertiserBrief(LyricContract):
    """The seven generation-facing fields from the synthetic brief adapter."""

    brief_id: str = Field(pattern=r"^brief-[0-9]{3}$")
    name: Text
    offer: Text
    location: Text
    contact_details: ContactDetails
    tone: Text
    approved_claims: list[Text] = Field(min_length=1, max_length=20)


class LyricRequest(LyricContract):
    """Fixed 30-second English product rules, not a freeform artist prompt."""

    schema_version: Literal[1] = 1
    brief: AdvertiserBrief
    product_path: ProductPath
    cta: Text
    language: Literal["en"] = "en"
    duration_seconds: Literal[30] = 30
    style: Literal["retro-synth"] = "retro-synth"
    pronunciations: dict[str, list[str]] = Field(default_factory=dict, max_length=40)

    @model_validator(mode="after")
    def validate_text(self) -> Self:
        values = [
            self.brief.name,
            self.brief.offer,
            self.brief.location,
            self.brief.tone,
            self.brief.contact_details.email,
            self.brief.contact_details.phone,
            self.cta,
            *self.brief.approved_claims,
        ]
        if any(
            not value.strip()
            or not value.isascii()
            or any(ord(char) < 32 or ord(char) == 127 for char in value)
            for value in values
        ):
            raise ValueError(
                "Brief and CTA must contain single-line printable ASCII text"
            )
        if not WORD.search(self.brief.name):
            raise ValueError("Brand must contain English words")
        if not _pronounceable(self.brief.name) or not _pronounceable(self.cta):
            raise ValueError("Brand and CTA must spell out numbers and symbols")
        for word, phones in self.pronunciations.items():
            if (
                WORD.fullmatch(word) is None
                or word != word.lower()
                or not 1 <= len(phones) <= 40
                or any(phone not in PHONEMES for phone in phones)
                or not any(phone[-1:] in {"0", "1", "2"} for phone in phones)
            ):
                raise ValueError(
                    "Pronunciations require lowercase words and valid stressed ARPABET"
                )
        return self


class LyricDraft(LyricContract):
    """The six fixed model fields; metadata is independently recomputed."""

    hook: Text
    lyrics: str = Field(min_length=1, max_length=400)
    syllables_per_line: list[int] = Field(min_length=2, max_length=4)
    rhyme_scheme: Literal["--", "AABB"]
    brand_count: int = Field(ge=0, le=20)
    cta: Text


class LyricResult(LyricContract):
    """Only accepted or human-held results carry screened text.

    Acceptance is technical validation, never permission to broadcast.
    """

    schema_version: Literal[1] = 1
    status: Literal[
        "accepted",
        "human_review_required",
        "rejected",
        "retry_exhausted",
        "unavailable",
    ]
    attempts: int = Field(ge=0, le=4)
    output: LyricDraft | None = None
    reasons: list[str] = Field(default_factory=list)
    ai_generated: Literal[True] = True
    broadcast_approval_required: Literal[True] = True

    @model_validator(mode="after")
    def validate_outcome(self) -> Self:
        if (self.output is not None) != (
            self.status in {"accepted", "human_review_required"}
        ):
            raise ValueError("Only validated or human-held outcomes can carry lyrics")
        if self.status != "accepted" and not self.reasons:
            raise ValueError("Non-accepted outcomes require an explicit reason")
        return self


class LyricRuleError(ValueError):
    """A safe, retryable rule code, without rejected model text."""


@lru_cache(maxsize=1)
def _dictionary() -> dict[str, list[list[str]]]:
    return cmudict.dict()


def words(text: str) -> list[str]:
    """Normalize English words for pronunciation and full-token brand matching."""
    return WORD.findall(text.lower())


def _pronounceable(text: str) -> bool:
    return (
        SPOKEN_TEXT.fullmatch(text) is not None
        and re.search(r"[A-Za-z]\.[A-Za-z]", text) is None
    )


def _pronunciation(word: str, overrides: dict[str, list[str]]) -> list[str]:
    if word in overrides:
        return overrides[word]
    pronunciations = _dictionary().get(word)
    if not pronunciations:
        raise LyricRuleError("unknown_pronunciation")
    return pronunciations[0]


def _rhyme(phones: list[str]) -> tuple[str, ...]:
    for index in range(len(phones) - 1, -1, -1):
        if phones[index][-1:] in {"1", "2"}:
            return tuple(re.sub("[012]", "", phone) for phone in phones[index:])
    raise LyricRuleError("unstressed_rhyme")


def validate_draft(request: LyricRequest, draft: LyricDraft) -> LyricDraft:
    """Recompute lexical meter/rhyme and enforce every fixed product-path rule.

    Raises:
        LyricRuleError: Unknown pronunciation, metadata mismatch or rule failure.
    """
    policy = POLICIES[request.product_path]
    lines = draft.lyrics.split("\n")
    if (
        len(lines) != policy["lines"]
        or not draft.lyrics.isascii()
        or any(not line.strip() or line != line.strip() for line in lines)
        or any(
            ord(char) < 32 and char != "\n" or ord(char) == 127 for char in draft.lyrics
        )
    ):
        raise LyricRuleError("line_format")
    if (
        draft.cta != request.cta
        or lines[-1] != request.cta
        or lines.count(request.cta) != 1
    ):
        raise LyricRuleError("cta_placement")
    if draft.hook not in lines[:-1]:
        raise LyricRuleError("hook_placement")
    token_lines = [words(line) for line in lines]
    if any(not tokens for tokens in token_lines) or not _pronounceable(draft.lyrics):
        raise LyricRuleError("use_pronounceable_words")
    phones = [
        [_pronunciation(word, request.pronunciations) for word in tokens]
        for tokens in token_lines
    ]
    counts = [
        sum(phone[-1:] in {"0", "1", "2"} for word in row for phone in word)
        for row in phones
    ]
    if any(
        not policy["min_syllables"] <= count <= policy["max_syllables"]
        for count in counts
    ):
        raise LyricRuleError("meter")
    if draft.syllables_per_line != counts:
        raise LyricRuleError("syllable_metadata")
    if draft.rhyme_scheme != policy["rhyme_scheme"]:
        raise LyricRuleError("rhyme_metadata")
    if request.product_path == "vocoded":
        tails = [_rhyme(row[-1]) for row in phones]
        if (
            tails[0] != tails[1]
            or tails[2] != tails[3]
            or tails[0] == tails[2]
            or token_lines[0][-1] == token_lines[1][-1]
            or token_lines[2][-1] == token_lines[3][-1]
        ):
            raise LyricRuleError("rhyme")
    brand = words(request.brief.name)
    brand_count = sum(
        tokens[index : index + len(brand)] == brand
        for tokens in token_lines
        for index in range(len(tokens) - len(brand) + 1)
    )
    if brand_count != 2 or draft.brand_count != brand_count:
        raise LyricRuleError("brand_count")
    return draft
