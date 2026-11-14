<!-- markdownlint-disable-file -->
# RPI Changes: Lyric and Hook Writer

## Metadata

* Task ID: issue-5
* Related plan: [.copilot-tracking/plans/2026-11-13/issue-5-lyric-hook-writer-plan.md](../../plans/2026-11-13/issue-5-lyric-hook-writer-plan.md)
* Implementation date: 2026-11-13

## Execution Status

Complete; full-plan invocation. P01-P03 complete, including accepted RV-001 remediation.

## Execution Summary

Implemented strict contracts, cloud adapters, bounded service and independent
MCP tool. Verified with mocked cloud and actual MCP protocol calls. Existing
web and melody behavior remains unchanged. No paid calls made.

## Completed Work

### P01-T01: Strict lyric rules and metadata

* Files: [audio_poc/lyrics.py](../../../audio_poc/lyrics.py),
  [tests/test_lyrics.py](../../../tests/test_lyrics.py),
  [tests/conftest.py](../../../tests/conftest.py),
  [pyproject.toml](../../../pyproject.toml), [uv.lock](../../../uv.lock).
* Added seven-field brief, versioned request, six-field draft and explicit outcomes.
* Dictionary-backed counts and stressed-vowel rhymes enforce fixed spoken/vocoded
  rules, two full brand mentions and final-line CTA. Unknown pronunciations fail.
* Validation: `uv run pytest -q tests/test_lyrics.py`: 14 passed.
  Initial test fixture failed at an earlier hook gate; corrected the fixture to
  isolate meter, with no production relaxation.
* RV-001 resolved: unsupported symbols, numeric/symbolic brand and CTA forms,
  and domain notation are explicitly rejected. The generation prompt and
  setup documentation explain spelling these forms out. Sentence punctuation,
  hyphens and explicit pronunciation overrides remain supported.
* Remediation validation: 87 lyric cases and 181 full-suite cases passed,
  including 15 new notation, input-contract and punctuation cases. Ruff passed.

### P03-T01: Bounded MCP generation with explicit outcomes

* Files: [audio_poc/lyric_service.py](../../../audio_poc/lyric_service.py),
  [audio_poc/lyric_mcp.py](../../../audio_poc/lyric_mcp.py),
  [tests/test_lyric_service.py](../../../tests/test_lyric_service.py),
  [tests/test_lyric_mcp.py](../../../tests/test_lyric_mcp.py),
  [docs/lyric-mcp.md](../../../docs/lyric-mcp.md).
* Added independent artist/language preflight, exact four-generation ceiling,
  independent factual assessment, mandatory screening and human holds.
* Terminal safety, refusal and unavailable outcomes contain no candidate text.
* Validation: 72 lyric cases passed; complete existing+new suite 166 passed.
  CLI help, Ruff lint/format and lock checks passed.

### P02-T01: Mandatory cloud evidence

* Files: [audio_poc/lyric_cloud.py](../../../audio_poc/lyric_cloud.py),
  [tests/test_lyric_cloud.py](../../../tests/test_lyric_cloud.py).
* Added Foundry strict JSON generation, independent preflight and grounding/language/risk
  assessments. Content Safety requires complete four-category moderation and an
  explicit protected-material result. Missing evidence cannot imply safety.
* Entra ID, finite HTTP timeouts, no model SDK retries, content-free client spans.
* Validation: combined lyric/rules HTTP fake suite: 36 passed.

## Implementation-Time Plan Updates

### RV-001: Explicit pronounceable-text boundary

* P01-T01 reopened after Review identified ignored symbols and numeric brand suffixes.
* Requirement clarified within existing pronounceable English scope: reject
  unsupported notation instead of losing it during tokenization.
* No significant scope or architecture change; automatic parent accepted direct correction.
* Existing plan critique is retained; no additional critique or Review is started.

## Business Alignment

* None.

## Validation Record

| Check | Scope | Status | Evidence |
|---|---|---|---|
| Focused pytest | All four lyric test modules after remediation | Passed | 87 cases |
| Full pytest | Existing and new behavior after remediation | Passed | 181 cases, existing Starlette/httpx deprecation warning |
| Ruff check | New modules/tests and shared fixtures | Passed | No issues |
| Ruff format | Same scope | Passed | 9 files pass final format check |
| uv lock --check | Dependencies | Passed | 58 packages resolved |
| CLI help | Module entry point | Passed | Both transport options available |
| Live Azure model/safety | Deployment effectiveness | Unavailable | No paid calls made; requires configured resources and consent |

## Pre-Review Reconciliation

All plan markers complete, validation current, no required remaining work.
Business Alignment: no cited BRD/PRD/ADR differences. The task's one Review
identified RV-001, now resolved with regression evidence; no new Review was run.
OTel server/client spans and content-free logs follow telemetry-foundations;
no user/brief/model content attributes are emitted.

## Blockers

None for local implementation.

## Remaining Work

None.

## Follow-Up Items

None.

## Return-to-Caller State

Implementation complete, including RV-001. Automatic parent proceeds to
Follow-up acceptance using the existing Review and remediation evidence.
Live Azure effectiveness remains explicitly unverified, not represented by
mocked results.
