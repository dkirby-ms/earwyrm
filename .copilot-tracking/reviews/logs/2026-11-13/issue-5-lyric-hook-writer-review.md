<!-- markdownlint-disable-file -->
# Review: Lyric and Hook Writer

## Executive Summary

Review complete for full issue #5 implementation. Assessed outcome: Defects found.
One High finding affects pronunciation/meter and exact-brand validation.
Local validation is available: 72 lyric cases, 166 full-suite cases,
Ruff and lock checks passed. Live model effectiveness is not established.

## What You May Not Know

This is a provisional contract until #4 is implemented. No deployment, UI
integration or live cloud calls are included.

## Findings and Proposed Routes

### RV-001 [High]: Tokenization silently ignores pronounceable symbols and digits

The dictionary gate counts only regex word matches. It rejects numeric lyric
characters but still silently drops symbols such as `&`, `@` and `+`.
For example, inserting `&` into the valid first line leaves the reported count
unchanged even though Speech may pronounce "and". Brand names containing digits
also lose those digits during matching, so a partial brand can satisfy the count.

* Related scope: FR-002, P01-T01; malformed/rule failures must not be accepted.
* Expected behavior: All pronounced content participates in meter and complete-brand checks, or unsupported notation is explicitly rejected.
* Observed behavior and evidence: audio_poc/lyrics.py, `words`, `LyricRequest.validate_text` and `validate_draft`; the word regex ignores nonletters and only numeric lyric characters have a separate rejection.
* Impact: Incorrect syllables or incomplete brand mentions can pass deterministic gates.
* Resolution condition: Symbol-bearing lyrics and unsupported numeric/symbolic brand/CTA forms cannot pass; focused regression cases demonstrate rejection while existing punctuation and explicit pronunciation overrides still work.
* Proposed destination: rpi-implement.
* Smallest useful next action: Enforce the documented pronounceable-word domain and test symbol/digit cases.

## Parent Decision Record

### Current Disposition

Based on RD-001 through RD-007: execution Complete; parent final outcome Conformant
after validated resolution of RV-001. No required findings remain. The original
assessment below is preserved; remediation was validated, not separately reviewed.

### Decision History

| Event | Subject | Source | Status or value | Rationale |
|---|---|---|---|---|
| RD-001 | participation | user selection | agent-owned | Automatic end-to-end authorization |
| RD-002 | walkthrough | agent | skipped-auto | No retained Review decisions |
| RD-003 | RV-001 route | agent | accepted: rpi-implement | Required in-scope deterministic validation defect |
| RD-004 | execution and outcome | agent | Complete; Defects found | Full comparison completed; fix RV-001 before task completion |
| RD-005 | RV-001 resolution | implementation evidence | resolved | Explicit lexical guard rejects unsupported lyrics and brand/CTA notation; 15 regression/compatibility cases, existing pronunciation override cases, 87 lyric cases and 181 full-suite cases pass; Ruff and lock checks pass |
| RD-006 | final outcome | agent | Conformant | Required finding resolved against its condition; original assessment preserved; no second Review performed |
| RD-007 | continuation and acceptance | automatic parent | no required follow-up | All P01-P03 markers complete; local acceptance supported by final validation; live Azure effectiveness, deployment and provisional-contract integration remain disclosed exclusions |

## Validation Evidence

Full pytest: 166 passed. Focused pytest: 72 passed. Ruff, formatter, lock and
CLI checks passed. Live Azure unavailable: no configured paid test performed.

## Risks, Blockers, and Residual Work

Semantic checks are probabilistic; all output requires producer approval.
RV-001 is required in-scope work before completion. No deployment or paid
validation authority is implied.

## Review Record

### Scope and Evidence

* Task ID: issue-5
* Review date: 2026-11-13
* Review scope: full task P01-P03
* Review depth and provenance: standard, default
* Candidate identity: issue-5, uncommitted changes on current lyrics branch
* Review execution: Complete
* Helper use: none; compact continuous service trace
* Plan: .copilot-tracking/plans/2026-11-13/issue-5-lyric-hook-writer-plan.md
* Plan critique: .copilot-tracking/reviews/plans/2026-11-13/issue-5-lyric-hook-writer-plan-critique.md
* Changes: .copilot-tracking/changes/2026-11-13/issue-5-lyric-hook-writer-changes.md
* Research: .copilot-tracking/research/2026-11-13/issue-5-lyric-hook-writer-research.md

### Opening Review State

Compare all completed tasks against issue acceptance criteria, strict contracts,
API behavior and bounded safety gates. Evidence is ready; active boundary is
read-only except this record and orchestration state. No live paid checks.
The parent owns outcomes, routing and continuation.

### Acceptance and Change Coverage

| Requirement or scope | Implementation and evidence | Assessment |
|---|---|---|
| FR-001 | lyrics.py, strict six-field LyricDraft and versioned LyricResult; MCP protocol output test | Met |
| FR-002 | lyrics.py, validate_draft; dictionary, exact boundary and rhyme tests | Gap: RV-001 |
| FR-003 | lyric_cloud.py, preflight and independent assess; lyric_service.py, grounding retry tests | Met within model-based assessment limits |
| FR-004 | lyric_cloud.py, complete moderation and protected parsing; lyric_service.py, human holds and terminal rejection tests | Met within mocked validation limits |
| FR-005 | lyric_service.py, range(1,5), generation-only retry; exact ceiling and terminal failure tests | Met |
| FR-006 | lyric_mcp.py, stdio and loopback HTTP; actual in-memory protocol and CLI tests | Met |
| NFR-001 | 72 focused cases including actual MCP and HTTP mocks; no removed tests | Met |
| NFR-002 | Content-free logs, client/server spans, Entra ID, finite HTTP timeouts | Met |
| NFR-003 | Existing code unchanged; 166 full-suite cases passed | Met |
| P01-T01 | Strict contracts and prosody | Gap: RV-001 |
| P02-T01 | Foundry/safety adapters and 36 initial combined cases | Met |
| P03-T01 | Bounded service, MCP transport, docs and full validation | Met except inherited P01 defect |
| PC-001 | Assessment requires output English before screening; tests cover both input/output failure | Resolved |

### Critique and Follow-Up Assessment

PC-001 resolved by independent output-language assessment. No plan follow-ups.

### Reviewer Self-Check

All material criteria and code paths compared once. Read-only review, no new
validation run or production changes in Review. No helpers. Canonical plan and
changes records align on completed markers; no unrelated work selected.
Limits: semantic effectiveness, cloud deployment and live screening are not
validated by HTTP mocks. Changes-record entries exist for all three markers,
though two are placed under its update heading; no substantive evidence is lost.
