<!-- markdownlint-disable-file -->
# Review: Generation validation

## Executive Summary

Review execution: Complete. Scope: full P01, four reported failures, preserved safeguards and exact text. Standard initial comparison found one remaining fixed-line formatting defect; assessed outcome: Defects found.

## What You May Not Know

Dictionary hints verify meter, not stock-voice pronunciation. All provider evidence here is mocked.

## Findings and Proposed Routes

<!-- rpi:review id=RV-001 -->
### RV-001 [High]: Fixed whitespace can still exhaust every opening retry

* Related scope: FR-001, P01-T01
* Expected behavior: immutable closing-line defects stop before generating openings.
* Observed evidence: apps/api/src/lyrics.ts `validate_fixed_lyrics` counts words and meter but does not check CTA trimming. `validate_draft` rejects any line differing from its trimmed form; LyricRequest allows leading/trailing ASCII spaces. A fixed CTA with an edge space therefore cannot pass any opening attempt.
* Impact: deterministic retry waste remains for a supported malformed fixed input.
* Resolution condition: fixed CTA edge whitespace and normalized format/length defects reject with zero generation attempts, preserving exact original text and giving actionable feedback.
* Proposed destination: rpi-implement, via new P02 planning phase in this automatic session.
* Smallest useful next action: add fixed-text format check and a focused zero-attempt regression; do not trim or rewrite the exact CTA.

## Parent Decision Record

### Current Disposition

Based on RD-001 through RD-010: review execution Complete, final outcome Conformant. RV-001 resolved by validated P02; no required findings remain. Initial assessed findings are preserved. Follow-up changes were validated without a repeat review.

### Decision History

| Event | Subject | Decision source | Status or value | Rationale |
|-------|---------|-----------------|-----------------|-----------|
| RD-001 | participation | user | agent-owned | End-to-end mode |
| RD-002 | walkthrough | agent | skipped-auto | Agent-owned scope |
| RD-003 | execution | agent | Complete | All P01 material contracts compared |
| RD-004 | outcome | agent | Defects found | RV-001 remains |
| RD-005 | RV-001 | agent | accepted; rpi-implement via P02 | Fixed-format precheck required by FR-001 |
| RD-006 | continuation | agent | rpi-plan P02 | Required localized finding fix; no repeat review unless significant changes |
| RD-007 | RV-001 | agent | resolved | P02-T01: fixed whitespace and normalization-length regressions reject with attempts 0; actionable API error, no compose/speech; 199 API tests passed |
| RD-008 | execution | agent | Complete | Initial review reused; localized accepted-target follow-up validated without repeat review |
| RD-009 | outcome | agent | Conformant | FR-001 through FR-004 and NFR-001/002 supported by completed P01/P02, 220 focused cases, workspace typecheck/build and current API build |
| RD-010 | continuation | agent | stop automatic session | Acceptance established; no required work/blockers, no paid or external actions |

## Validation Evidence

195 API tests, 21 browser tests, workspace typecheck/build passed. Final unchanged risk keyword restoration: 111 lyric tests and API build passed. Mocked browser desktop/mobile keyboard/layout checks passed.

## Risks, Blockers, and Residual Work

RV-001 remains required in-scope work; live provider quality unverified.

## Review Record

### Scope and Evidence

Task ID: generation-validation. Date: 2026-11-20. Full P01, standard default, direct review without helpers.
Plan: .copilot-tracking/plans/2026-11-20/generation-validation-plan.md.
Critique: .copilot-tracking/reviews/plans/2026-11-20/generation-validation-plan-critique.md.
Changes: .copilot-tracking/changes/2026-11-20/generation-validation-changes.md.
Research: .copilot-tracking/research/2026-11-20/generation-validation-research.md.

### Opening Review State

All markers completed, critique Pass, FR-001 through FR-004 and NFR-001/002 are the acceptance basis. Read-only comparison of changed code/tests/docs and recorded validation. No external deployment or paid-provider claims.

### Acceptance and Change Coverage

| Requirement or scope | Implementation and validation evidence | Assessment | Finding or rationale |
|----------------------|----------------------------------------|------------|----------------------|
| FR-001, P01-T01 | lyrics validate_fixed_lyrics/validate_draft; short CTA and no-attempt tests | Gap | RV-001 fixed edge whitespace |
| FR-002, P01-T02 | brand_pronunciations, /api/jingles, App disclosure; API stored provenance and browser input retention tests | Met | Explicit dictionary-derived overrides persist |
| FR-003, P01-T02 | IMITATION, RISK, contextual preflight/assessment and mandatory screen; regression tests | Met | False-positive examples pass; contextual flags/refusals remain effective |
| FR-004, P01-T01 | normalize_spoken_text, render_inputs and exact CTA matching; API speech/provenance tests | Met | Display originals retained and speech copies normalized |
| NFR-001/002, P01-T03 | 216 tests, workspace typecheck/build; guided existing checks; mock viewport evidence | Met | No paid requests; normalized length bounded to 400 |
| Existing dirty changes | Initial diff compared with scoped edits | Met | Prior generation-flow work preserved |

### Critique and Follow-Up Assessment

Critique Complete/Pass, no findings. No selected follow-ups.

### Reviewer Self-Check

All material P01 requirements, tasks, critique dispositions, validation, telemetry reason redaction and remaining work assessed once. No helpers or source mutations during review. Browser/voice evidence is mocked; no claim of live pronunciation quality.
