<!-- markdownlint-disable-file -->
# RPI Changes: Local audio proof

## Metadata

* Task ID: `issue-2-local-audio-proof`
* Date: 2026-11-12
* Plan: [.copilot-tracking/plans/2026-11-12/issue-2-local-audio-proof-plan.md](../../plans/2026-11-12/issue-2-local-audio-proof-plan.md)

## Execution Status

In progress, full plan. First task: `P01-T01`. All markers remain unchecked.

## Execution Summary

Implement a local renderer and focused tests, preserving fixture contracts.

## Completed Work

### Original instrumental renders

* Related task: `P01-T01`.
* Files: [audio_poc/dsp.py](../../../audio_poc/dsp.py),
  [audio_poc/__main__.py](../../../audio_poc/__main__.py),
  [docs/audio-poc/generation-scripts.json](../../../docs/audio-poc/generation-scripts.json),
  [pyproject.toml](../../../pyproject.toml).
* Original harmonic instruments, seeded percussion and inspectable MIDI now
  render all three briefs without network access or evaluator inputs.
* Validation: `uv run python -m audio_poc --instrumental-only` produced three
  outputs under `renders/20261112T135627Z-5b2ccd6d`; status correctly Pending.
  Initial Ruff style findings fixed by Ruff; current lint passes.

### Paired speech, vocoder and attempt evidence

* Related task: `P02-T01`.
* Files: [audio_poc/speech.py](../../../audio_poc/speech.py),
  [audio_poc/__main__.py](../../../audio_poc/__main__.py).
* Explicit Azure mode now records attempts before submission, validates full
  word coverage, aligns complete intervals to note slots, vocodes the carrier
  and exports both treatments with honest cost allocation and Pending rights.
* Validation: installed Speech SDK imports and required enums exist without
  contacting Azure. Three parametrized tone-provider pair tests verify all six
  export paths, complete alignment, PCM duration, distinct variants and exact
  allocation. These are not live Azure results.

### Clear invalid-rate preflight error

* Related task: `P02-T01`.
* Files: [audio_poc/__main__.py](../../../audio_poc/__main__.py),
  [tests/test_audio_poc.py](../../../tests/test_audio_poc.py).
* Null or malformed Azure price input now identifies the required evidence field
  rather than exposing a decimal conversion exception. No request is submitted.
* Validation: targeted rate/configuration tests passed (7); Ruff check passed.

### Focused checks and operator guide

* Related task: `P03-T01`, local checks complete; live evidence outstanding.
* Files: [tests/test_audio_poc.py](../../../tests/test_audio_poc.py),
  [docs/audio-poc/rendering.md](../../../docs/audio-poc/rendering.md),
  [docs/audio-poc/protocol.md](../../../docs/audio-poc/protocol.md).
* Tests cover all briefs, failed-attempt accounting, invalid timing/rates,
  strict numeric thresholds, reproducibility and configuration failure.
* Validation: `uv run pytest -q`: 24 passed; Ruff lint and format checks passed.
  Actual Azure and human listening checks unavailable without external inputs.

## Implementation-Time Plan Updates

None.

## Business Alignment

* None.

## Validation Record

`uv run pytest -q`: 24 passed in 6.16s.
`uv run ruff check audio_poc tests`: Passed.
`uv run ruff format --check audio_poc tests`: Passed.
All-brief offline CLI: Passed, three persistent instrumental WAVs and MIDI scores.
SDK native import/interfaces: Passed, 1.53.0, no network requests.
Live Azure run `renders/20261112T152159Z-97981b2c/summary.json`: six
vocoded/spoken outputs for three briefs; each is 30 seconds, with numeric
gates passing and shared render times of approximately 1.78 to 4.00 seconds.
Estimated total Speech cost is USD 0.017712 from supplied rate evidence, not
reconciled billing. Listening and commercial-rights evidence remain pending.
Telemetry overlay: local proof only, no production telemetry or emitters added.

## Pre-Review Reconciliation

Not ready: implementation in progress.

## Blockers

User must listen and record transcription and ratings, verify commercial-use
rights, and reconcile Azure billing. Do not request or record keys.

## Remaining Work

`P03-T01` user-owned proof evaluation and evidence; live renders produced.

## Follow-Up Items

* None.

## Return-to-Caller State

Automatic parent continues local implementation; no issue completion claimed.
