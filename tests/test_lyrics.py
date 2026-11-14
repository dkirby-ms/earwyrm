"""Deterministic lyric gates use pronunciations, never generator assertions."""

import pytest
from pydantic import ValidationError

from audio_poc.lyrics import LyricDraft, LyricRequest, LyricRuleError, validate_draft


def test_given_spoken_lyrics_when_validated_then_recomputed_metadata_matches(
    lyric_request: LyricRequest,
    lyric_draft: LyricDraft,
) -> None:
    # Act & Assert
    assert validate_draft(lyric_request, lyric_draft) == lyric_draft


@pytest.mark.parametrize(
    ("update", "code"),
    [
        ({"syllables_per_line": [1, 1]}, "syllable_metadata"),
        ({"brand_count": 1}, "brand_count"),
        ({"cta": "Call today"}, "cta_placement"),
        ({"hook": "A different hook"}, "hook_placement"),
        ({"rhyme_scheme": "AABB"}, "rhyme_metadata"),
        (
            {
                "lyrics": "Bright Bike\nCall Bright Bike to plan your next ride",
                "hook": "Bright Bike",
            },
            "meter",
        ),
        (
            {
                "lyrics": "Bright Bike, a tune up for your qzx\nCall Bright Bike to plan your next ride",
                "hook": "Bright Bike, a tune up for your qzx",
            },
            "unknown_pronunciation",
        ),
    ],
)
def test_given_failed_rule_when_validated_then_explicit_code(
    lyric_request: LyricRequest,
    lyric_draft: LyricDraft,
    update: dict,
    code: str,
) -> None:
    # Act & Assert
    with pytest.raises(LyricRuleError, match=code):
        validate_draft(lyric_request, lyric_draft.model_copy(update=update))


def test_given_vocoded_lyrics_when_validated_then_phonetic_pairs_required(
    lyric_request: LyricRequest,
) -> None:
    # Arrange
    request = lyric_request.model_copy(
        update={
            "product_path": "vocoded",
            "cta": "Call Bright Bike to plan your next day",
        }
    )
    lines = [
        "Bright Bike, a tune up for your ride",
        "A tune up for the bike at your side",
        "A tune to take along on your way",
        request.cta,
    ]
    draft = LyricDraft(
        hook=lines[0],
        lyrics="\n".join(lines),
        syllables_per_line=[8, 9, 9, 8],
        rhyme_scheme="AABB",
        brand_count=2,
        cta=request.cta,
    )

    # Act & Assert
    assert validate_draft(request, draft) == draft
    broken = draft.model_copy(update={"lyrics": draft.lyrics.replace("side", "shop")})
    with pytest.raises(LyricRuleError, match="rhyme"):
        validate_draft(request, broken)


@pytest.mark.parametrize(
    "overrides",
    [
        {"Bright": ["B", "R", "AY1", "T"]},
        {"bright": ["INVALID"]},
        {"bright": ["B", "R"]},
        {"bright": []},
    ],
)
def test_given_invalid_pronunciation_when_requested_then_rejected(
    lyric_request: LyricRequest,
    overrides: dict,
) -> None:
    # Act & Assert
    with pytest.raises(ValidationError):
        LyricRequest.model_validate(
            {**lyric_request.model_dump(), "pronunciations": overrides}
        )


def test_given_malformed_model_fields_when_parsed_then_no_coercion(
    lyric_draft: LyricDraft,
) -> None:
    # Act & Assert
    with pytest.raises(ValidationError):
        LyricDraft.model_validate({**lyric_draft.model_dump(), "brand_count": "2"})


@pytest.mark.parametrize(
    ("path", "count", "valid"),
    [
        ("spoken", 7, False),
        ("spoken", 8, True),
        ("spoken", 20, True),
        ("spoken", 21, False),
        ("vocoded", 7, False),
        ("vocoded", 8, True),
        ("vocoded", 12, True),
        ("vocoded", 13, False),
    ],
)
def test_given_meter_boundary_when_validated_then_exact_policy_enforced(
    lyric_request: LyricRequest,
    path: str,
    count: int,
    valid: bool,
) -> None:
    # Arrange
    cta = "Call Bright Bike to plan your next day"
    request = LyricRequest.model_validate(
        {
            **lyric_request.model_dump(),
            "product_path": path,
            "cta": cta,
        }
    )
    first = "Bright Bike " + "one " * (count - 3) + "ride"
    lines = [first, cta]
    counts = [count, 8]
    if path == "vocoded":
        lines = [first, "one " * 7 + "side", "one " * 7 + "way", cta]
        counts = [count, 8, 8, 8]
    draft = LyricDraft(
        hook=first,
        lyrics="\n".join(lines),
        syllables_per_line=counts,
        rhyme_scheme="AABB" if path == "vocoded" else "--",
        brand_count=2,
        cta=cta,
    )

    # Act & Assert
    if valid:
        assert validate_draft(request, draft) == draft
    else:
        with pytest.raises(LyricRuleError, match="meter"):
            validate_draft(request, draft)


def test_given_unknown_word_when_pronunciation_supplied_then_counted_explicitly(
    lyric_request: LyricRequest,
    lyric_draft: LyricDraft,
) -> None:
    # Arrange
    request = LyricRequest.model_validate(
        {
            **lyric_request.model_dump(),
            "pronunciations": {"qzx": ["R", "AY1", "D"]},
        }
    )
    draft = lyric_draft.model_copy(
        update={
            "hook": lyric_draft.hook.replace("ride", "qzx"),
            "lyrics": lyric_draft.lyrics.replace("ride\n", "qzx\n"),
        }
    )

    # Act & Assert
    assert validate_draft(request, draft) == draft


@pytest.mark.parametrize("punctuation", ["-", ":", "."])
def test_given_ordinary_punctuation_when_validated_then_prosody_is_preserved(
    lyric_request: LyricRequest,
    lyric_draft: LyricDraft,
    punctuation: str,
) -> None:
    # Arrange
    hook = lyric_draft.hook.replace(",", punctuation)
    draft = lyric_draft.model_copy(
        update={
            "hook": hook,
            "lyrics": hook + "\n" + lyric_request.cta,
        }
    )

    # Act
    result = validate_draft(lyric_request, draft)

    # Assert
    assert result == draft


@pytest.mark.parametrize("notation", ["&", "@", "+", "$", "%", "/", "24", "shop.com"])
def test_given_spoken_notation_when_validated_then_not_silently_dropped(
    lyric_request: LyricRequest,
    lyric_draft: LyricDraft,
    notation: str,
) -> None:
    # Arrange
    hook = lyric_draft.hook.replace(",", f" {notation},")
    draft = lyric_draft.model_copy(
        update={
            "hook": hook,
            "lyrics": hook + "\n" + lyric_request.cta,
        }
    )

    # Act & Assert
    with pytest.raises(LyricRuleError, match="use_pronounceable_words"):
        validate_draft(lyric_request, draft)


@pytest.mark.parametrize(
    ("field", "text"),
    [
        ("name", "Bright Bike 24"),
        ("name", "Bright & Bike"),
        ("cta", "Call Bright Bike @ noon"),
        ("cta", "Call Bright Bike 24"),
    ],
)
def test_given_symbolic_brand_or_cta_when_requested_then_explicitly_rejected(
    lyric_request: LyricRequest,
    field: str,
    text: str,
) -> None:
    # Arrange
    data = lyric_request.model_dump()
    if field == "name":
        data["brief"]["name"] = text
    else:
        data["cta"] = text

    # Act & Assert
    with pytest.raises(ValidationError, match="spell out numbers and symbols"):
        LyricRequest.model_validate(data)
