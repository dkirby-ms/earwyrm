<!-- markdownlint-disable-file -->
# RPI Changes: Melody and Arrangement MCP

Task: issue-6-melody-arrangement. Declared scope: full P01-P03.
Implementation complete. Plan Ready; standard critique PC-001 incorporated.

## Metadata

* Task ID: issue-6-melody-arrangement
* Implementation date: 2026-11-13

## Execution Status

* Status: Complete
* Declared invocation scope: full plan P01-P03
* Completed scope markers: P01-T01, P01-T02, P02-T01, P03-T01
* All remaining active-plan markers: none

## Completed Work

### P01-T01: Composing musical phrases

[audio_poc/dsp.py](../../../audio_poc/dsp.py) chooses seeded scale-degree hooks,
rhythm, harmony, voicing and form. [audio_poc/melody.py](../../../audio_poc/melody.py)
validates complete ordered syllables and quantized windows; no dropped text.
Tests: 24 seeds exceed 20 unique interval/rhythm signatures; PCM and map fit pass.

### P01-T02: Blocking similar melodies

[audio_poc/similarity.py](../../../audio_poc/similarity.py) screens all melodic
parts using key-independent local interval windows. Public-domain, legacy and
supplied prior-output references block on score >=0.85; no rights clearance claim.
`uv run pytest -q tests/test_melody.py`: 16 passed.

### P02-T01: Persisting screened jobs and exposing MCP

[audio_poc/melody_service.py](../../../audio_poc/melody_service.py) serializes
screen/history/artifacts/job commit; equal concurrent/restarted submissions reuse
the original seed, result and queue row. Changed requests conflict.
[audio_poc/melody_mcp.py](../../../audio_poc/melody_mcp.py) exposes typed tools
and integrity-checked binary resources on stdio or loopback Streamable HTTP.
MIDI, actual chord voicings, per-syllable timing, backing and provenance returned.
Handled write failure produces no queue row or resource directory (PC-001).
Validation: 23 composition/service tests and 2 real MCP session tests passed.

### P03-T01: Integrating actual variation

CLI/web share fresh seeded composition and score-derived vocals.
Ordinary local judgment: synchronous POC archive uses the same screening/history
store without queue submission, avoiding duplicate render ownership.
Persistent real CLI output: `renders/20261113T204305Z-cd804ad1`, all three briefs,
30-second PCM/MIDI and reports. Listening/rights remain Pending.
Documentation: [docs/melody-mcp.md](../../../docs/melody-mcp.md) and existing
audio/web guides cover provisional contract, limits, retries, queue ownership.

## Validation

Targeted integrated run: 71 passed. Initial full run exposed two random-candidate
rejections before the intended test scenario (89 passed, 2 failed). Screening
correctly blocked delivery, but generated seed selection needs bounded retries
before any Speech spend; fixtures need controlled candidate seeds. Correcting
this without relaxing the threshold: shared bounded selection, controlled test
seeds, history-aware preflight and atomic publication recheck.
The first real CLI run likewise blocked a prior-output near match; the corrected
run completed all three briefs with an explicitly logged candidate replacement.
Final full run: 94 passed; one existing Starlette/httpx deprecation warning.
Ruff lint and format check pass; `git diff --check` passes.
Node navigation test passes; `uv lock --check` passes.
Live subprocess Streamable HTTP and stdio both negotiated MCP 2025-11-25,
composed, read binary MIDI and preserved retry identity. Helpers stopped and
temporary smoke data removed. No cloud requests authorized or made.

## Pre-Review Reconciliation

Plan markers/context, work entries, validation and follow-up boundaries current.
Review ready. No required human gate for local implementation; no distribution
or listening approval asserted. Open #4/#7 work remains outside this local scope.

## Business Alignment

No separate BRD/PRD/ADR; attached #6 and design sections 4-6 are source.
Local provisional schema/queue boundary retained because dependency #4 is open.

## Remaining Work

None in P01-P03. No implementation blockers. Rights/listening remain human gates
for use, not inferred from automated tests.
