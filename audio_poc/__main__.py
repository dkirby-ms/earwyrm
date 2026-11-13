"""Run with uv run python -m audio_poc; cloud use always requires --azure."""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import math
import os
import re
import sys
import time
import uuid
from dataclasses import asdict
from datetime import UTC, date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path

import numpy as np

from audio_poc.dsp import (
    SAMPLE_RATE,
    compose,
    mix,
    normalize,
    synthesize,
    vocode,
    write_midi,
    write_wav,
)
from audio_poc.speech import VOICE, AzureSpeech, SpeechProvider, align, place_spoken

LOGGER = logging.getLogger(__name__)
FIXTURES = Path(__file__).resolve().parents[1] / "docs" / "audio-poc"
TERMS = "https://www.microsoft.com/licensing/terms/productoffering/MicrosoftAzure/MCA"
DISCLOSURE = "https://learn.microsoft.com/azure/ai-services/speech-service/faq-tts"


def save_json(path: Path, data: object) -> None:
    """Write strict JSON evidence, rejecting nonfinite measurements."""
    path.write_text(
        json.dumps(data, indent=2, allow_nan=False) + "\n", encoding="utf-8"
    )


def load_inputs() -> list[tuple[dict, str]]:
    """Load only generation-facing fixtures, never the evaluator answer file."""
    briefs = json.loads(
        (FIXTURES / "advertiser-briefs.json").read_text(encoding="utf-8")
    )
    scripts = json.loads(
        (FIXTURES / "generation-scripts.json").read_text(encoding="utf-8")
    )
    fields = {
        "brief_id",
        "name",
        "offer",
        "location",
        "contact_details",
        "tone",
        "approved_claims",
    }
    if (
        not isinstance(briefs, list)
        or not isinstance(scripts, dict)
        or len(briefs) != 3
    ):
        raise ValueError("Expected three briefs and a generation-script mapping")
    ids = []
    result = []
    for brief in briefs:
        if not isinstance(brief, dict) or set(brief) != fields:
            raise ValueError("Brief does not match the provider-neutral contract")
        brief_id = brief["brief_id"]
        if not isinstance(brief_id, str) or not re.fullmatch(r"brief-\d{3}", brief_id):
            raise ValueError("Invalid brief ID")
        text = scripts.get(brief_id)
        if not isinstance(text, str) or not text.isascii() or not 1 <= len(text) <= 400:
            raise ValueError(
                "Each generation script must contain 1-400 ASCII characters"
            )
        if brief["name"] not in text:
            raise ValueError("Script must include its brief's brand")
        ids.append(brief_id)
        result.append((brief, text))
    if len(set(ids)) != 3 or set(scripts) != set(ids):
        raise ValueError("Brief and script IDs must match uniquely")
    return result


def load_evidence(path: Path) -> dict:
    """Require dated rate and resource evidence; commercial clearance may be pending."""
    evidence = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(evidence, dict):
        raise ValueError("Evidence must be a JSON object")
    for field in (
        "region",
        "resource_reference",
        "rate_source",
        "rate_checked_on",
        "tier",
    ):
        if not isinstance(evidence.get(field), str) or not evidence[field].strip():
            raise ValueError(f"Evidence requires {field}")
    if evidence["tier"] != "S0":
        raise ValueError("This proof requires a paid S0 Speech resource")
    checked = date.fromisoformat(evidence["rate_checked_on"])
    if checked > date.today():
        raise ValueError("Rate evidence cannot be dated in the future")
    try:
        rate = Decimal(str(evidence.get("usd_per_million_characters")))
    except InvalidOperation as error:
        raise ValueError(
            "Set usd_per_million_characters to a positive numeric USD rate in the evidence file"
        ) from error
    if not rate.is_finite() or rate <= 0:
        raise ValueError("Supply a finite positive USD rate per million characters")
    basis = evidence.get("commercial_use_basis")
    if basis is not None and (not isinstance(basis, str) or not basis.strip()):
        raise ValueError("Commercial-use basis must be a nonempty string or null")
    evidence["usd_per_million_characters"] = str(rate)
    return evidence


def cost_for(text: str, evidence: dict) -> Decimal:
    """Estimate plain-ASCII TTS character charges, without free-tier assumptions."""
    return (
        Decimal(len(text))
        * Decimal(evidence["usd_per_million_characters"])
        / Decimal(1_000_000)
    )


def gate(duration: float, elapsed: float, cost: float | None) -> str:
    """Apply numeric proof gates; missing cost is Pending, never zero."""
    if not (29.5 <= duration <= 30.0) or not math.isfinite(elapsed) or elapsed >= 300:
        return "Fail"
    if cost is not None and (not math.isfinite(cost) or cost < 0 or cost >= 0.50):
        return "Fail"
    return "Pending" if cost is None else "Pass"


def component_ledger(evidence: dict | None) -> list[dict]:
    """Identify every audible source, without asserting unreviewed output rights."""
    components = [
        {
            "component": "melody_and_chords",
            "origin": "Original deterministic score in audio_poc/dsp.py",
            "evidence": "score.json and score.mid",
            "commercial_use_basis": None,
            "status": "Pending",
        },
        {
            "component": "instruments_and_carrier",
            "origin": "Harmonic oscillators, synthesized kick and seeded noise in audio_poc/dsp.py",
            "evidence": "score.json; no samples or SoundFonts",
            "commercial_use_basis": None,
            "status": "Pending",
        },
        {
            "component": "script",
            "origin": "Repository-authored synthetic brief script",
            "evidence": "brief.json and script.txt",
            "commercial_use_basis": None,
            "status": "Pending",
        },
    ]
    if evidence is not None:
        components.append(
            {
                "component": "stock_synthetic_voice",
                "origin": f"Azure Speech {VOICE}, S0, {evidence['region']}",
                "evidence": [TERMS, DISCLOSURE, evidence["resource_reference"]],
                "commercial_use_basis": None,
                "status": "Pending",
            }
        )
        # A supplied basis is a human assertion, not an automatic legal determination.
        for component in components:
            component["commercial_use_basis"] = evidence.get("commercial_use_basis")
            component["status"] = (
                "Recorded basis; human review required"
                if evidence.get("commercial_use_basis")
                else "Pending"
            )
    return components


def render_brief(
    directory: Path,
    brief: dict,
    text: str,
    index: int,
    provider: SpeechProvider | None,
    evidence: dict | None,
) -> list[dict]:
    """Persist a single brief's outputs and every attempted metered request.

    A fresh directory is required. Failed attempts retain unknown cost and are
    re-raised; partial files cannot be mistaken for a completed manifest.
    """
    started = time.perf_counter()
    directory.mkdir()
    attempt_id = str(uuid.uuid4())
    save_json(directory / "brief.json", brief)
    (directory / "script.txt").write_text(text + "\n", encoding="utf-8")
    notes = compose(index)
    bed = synthesize(notes, seed=index)
    outputs = {"instrumental": normalize(bed)}
    attempt = None
    alignment = []
    utterance = None
    request_cost = None
    if provider is not None:
        if evidence is None:
            raise ValueError("Azure rendering requires usage-rate evidence")
        request_cost = cost_for(text, evidence)
        attempt = {
            "attempt_id": attempt_id,
            "status": "submitted",
            "submitted_at": datetime.now(UTC).isoformat(),
            "provider": "Azure Speech",
            "voice": VOICE,
            "submitted_characters": len(text),
            "unit": "character",
            "calculated_request_cost_usd": None,
            "cost_status": "Unknown until request completes",
            "evidence": evidence,
        }
        save_json(directory / "attempt.json", attempt)
        try:
            utterance = provider.synthesize(text)
        except (RuntimeError, ValueError, OSError):
            attempt["status"] = "failed_or_unknown"
            save_json(directory / "attempt.json", attempt)
            raise
        attempt.update(
            status="synthesis_completed",
            result_id=utterance.result_id,
            calculated_request_cost_usd=str(request_cost),
            cost_status="Calculated estimate; reconcile with Azure billing",
        )
        save_json(directory / "attempt.json", attempt)
        modulator, carrier, melody, alignment = align(
            utterance, text, [48, 50, 45][index]
        )
        notes += melody
        outputs = {
            "vocoded": mix(bed, vocode(modulator, carrier)),
            "spoken": mix(bed, place_spoken(utterance)),
        }
        write_wav(directory / "source-speech.wav", utterance.audio)
        write_wav(directory / "aligned-speech.wav", modulator)
    save_json(directory / "score.json", [asdict(note) for note in notes])
    write_midi(directory / "score.mid", notes)
    save_json(directory / "alignment.json", alignment)
    rows = []
    for variant, audio in outputs.items():
        path = directory / f"{variant}.wav"
        write_wav(path, audio)
        rows.append(
            {
                "output_id": f"{directory.parent.name}-{brief['brief_id']}-{variant}",
                "brief_id": brief["brief_id"],
                "variant": variant,
                "file": path.name,
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                "duration_seconds": len(audio) / SAMPLE_RATE,
                "peak_dbfs": float(20 * np.log10(np.max(np.abs(audio)))),
                "rms_dbfs": float(20 * np.log10(np.sqrt(np.mean(audio**2)))),
                "azure_usage": {
                    "attempt_id": attempt_id if attempt else None,
                    "submitted_characters": len(text) if attempt else 0,
                    "allocation_fraction": "0.5" if attempt else None,
                    "allocated_characters": str(Decimal(len(text)) / 2)
                    if attempt
                    else "0",
                    "request_cost_usd": str(request_cost)
                    if request_cost is not None
                    else "0",
                    "allocated_cost_usd": str(request_cost / 2)
                    if request_cost is not None
                    else "0",
                    "basis": "One shared request, 50/50 pair allocation"
                    if attempt
                    else "No Azure request; instrumental-only",
                    "rate_evidence": evidence,
                    "billing_reconciled": False,
                },
                "components": component_ledger(evidence),
                "ai_generated": True,
                "disclosure": "Code-generated music and, in live mode, a stock synthetic Azure voice; review demo, not broadcast master.",
                "evaluation": {
                    "brand_transcription": None,
                    "cta_transcription": None,
                    "self_rating": None,
                    "status": "Pending",
                    "type": "unblinded self-evaluation",
                },
                "status": "Pending",
            }
        )
    elapsed = time.perf_counter() - started
    for row in rows:
        row["render_seconds"] = elapsed
        row["render_time_basis"] = (
            "Shared brief render, including synthesis and both mixes"
        )
        # Evaluate the full request cost, not the smaller allocated cost.
        row["numeric_gates"] = gate(
            row["duration_seconds"],
            elapsed,
            float(request_cost) if request_cost is not None else 0.0,
        )
        if row["numeric_gates"] == "Fail":
            row["status"] = "Fail"
    save_json(
        directory / "manifest.json",
        {
            "schema_version": 1,
            "attempt_id": attempt_id,
            "outputs": rows,
            "fixed_gateway_hosting_cost_usd": "0",
            "fixed_cost_basis": "Local run; no gateway or hosting provisioned",
            "excluded_costs": [
                "Local electricity/hardware",
                "Developer and human-review time",
            ],
            "loudness": "Peak-only demo normalization, not LUFS or broadcast compliance",
        },
    )
    return rows


def create_parser() -> argparse.ArgumentParser:
    """Parse explicit offline versus paid-cloud rendering modes."""
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument(
        "--instrumental-only",
        action="store_true",
        help="No network requests; not a vocal proof",
    )
    mode.add_argument(
        "--azure", action="store_true", help="Make one paid synthesis request per brief"
    )
    parser.add_argument("--output", type=Path, default=Path("renders"))
    parser.add_argument(
        "--evidence", type=Path, help="Local non-secret rate/resource/rights JSON"
    )
    parser.add_argument(
        "--max-cost-usd",
        type=Decimal,
        help="Explicit total synthesis budget for this run",
    )
    return parser


def main() -> int:
    """Render all three briefs; fail explicitly and preserve incomplete evidence."""
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    args = create_parser().parse_args()
    try:
        inputs = load_inputs()
        evidence = None
        provider = None
        if args.azure:
            if args.evidence is None or args.max_cost_usd is None:
                raise ValueError("--azure requires --evidence and --max-cost-usd")
            evidence = load_evidence(args.evidence)
            if evidence["region"] != os.environ.get("SPEECH_REGION"):
                raise ValueError("Evidence region must match SPEECH_REGION")
            estimated = sum(
                (cost_for(text, evidence) for _, text in inputs), Decimal(0)
            )
            if (
                not args.max_cost_usd.is_finite()
                or args.max_cost_usd <= 0
                or estimated > args.max_cost_usd
            ):
                raise ValueError(
                    "Estimated requests exceed the finite positive --max-cost-usd budget"
                )
            provider = AzureSpeech()
        elif args.evidence is not None or args.max_cost_usd is not None:
            raise ValueError("Azure evidence/budget options require --azure")
        run = args.output / f"{datetime.now(UTC):%Y%m%dT%H%M%SZ}-{uuid.uuid4().hex[:8]}"
        run.mkdir(parents=True, exist_ok=False)
        LOGGER.info("Rendering into %s", run)
        rows = []
        for index, (brief, text) in enumerate(inputs):
            rows.extend(
                render_brief(
                    run / brief["brief_id"], brief, text, index, provider, evidence
                )
            )
        status = "Fail" if any(row["status"] == "Fail" for row in rows) else "Pending"
        save_json(
            run / "summary.json",
            {
                "status": status,
                "mode": "azure" if args.azure else "instrumental-only",
                "outputs": rows,
            },
        )
        LOGGER.info(
            "%d outputs written; proof status %s (listening and rights not auto-approved)",
            len(rows),
            status,
        )
        return 1 if status == "Fail" else 0
    except (ValueError, OSError, RuntimeError, ArithmeticError, ImportError) as error:
        LOGGER.error("%s", error)
        return 2 if isinstance(error, (ValueError, ArithmeticError)) else 1
    except KeyboardInterrupt:
        LOGGER.error(
            "Interrupted; any submitted attempt has unknown billing until reconciled"
        )
        return 130


if __name__ == "__main__":
    sys.exit(main())
