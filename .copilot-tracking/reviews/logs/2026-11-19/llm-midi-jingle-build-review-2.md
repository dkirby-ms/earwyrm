<!-- markdownlint-disable-file -->
# Review: LLM MIDI Jingle Required Fixes

## Executive Summary

* Assessment: Required fixes work for the tested score, but publication still applies an exact floating-point duration bound inconsistent with the compiler/renderer's tolerance.
* Review execution: Complete
* Assessed outcome: Defects found
* Review depth: surface, significant same-session result/recovery contract changes
* Validation coverage: Current implementation reports 481 API passes, one optional PostgreSQL skip, 27 web passes, build, typecheck and whitespace passed.
* Limits: No deployment, paid/live inference, listening, real PostgreSQL or exporter verification.

## What You May Not Know

Submitted recovery requires the administrator to stop the original worker and attest to that fact; the app does not verify external provider/billing evidence.

## Findings and Proposed Routes

<!-- rpi:review id=RV-001 -->
### RV-001 [Medium]: Playable score loading rejects tolerated bar-end arithmetic

* Related scope: P09-T01; original RV-001; FR-009/FR-010.
* Expected behavior: Valid tempo-derived committed scores are playable and selectable for final audio.
* Observed evidence: apps/api/src/score_dsl.ts `compile_score` computes each bar start and note duration separately. apps/api/src/dsp.ts `validate_note` permits 1 ns arithmetic tolerance; apps/api/src/jingle_tools.ts `artifacts` instead rejects any `note.start + note.duration > result.duration_seconds`. The new paid publication path calls this strict reader, so last-bar addition can reject a score already accepted and durably rendered. A full-bar pad at 140 BPM/12 bars is a concrete boundary candidate; the 137 BPM/9-bar regression does not exercise it.
* Impact: Some valid paid scores may remain unplayable despite successful provider/render commits.
* Resolution condition: Boundary-tempo publication and both vocal variants pass with original MIDI/backing identity; material out-of-duration events still fail.
* Proposed destination: rpi-implement
* Smallest useful next action: Reproduce the boundary in the existing end-to-end case and align artifact-reader arithmetic tolerance with the existing renderer.

## Parent Decision Record

### Current Disposition

* Based on events: RD-001 through RD-009
* Review execution: Complete
* Final outcome: Conformant after P12 resolution, within authorized offline scope
* Finding decisions and next actions: RV-001 resolved by reproduced failing boundary and matching local tolerance; no required work remains.
* Decisions still needed: None; agent-owned walkthrough skipped-auto.

### Decision History

| Event | Subject | Source | Status | Route | Rationale |
|-------|---------|--------|--------|-------|-----------|
| RD-001 | participation | Saved automatic parent | agent-owned | none | Significant P09-P11 changes warrant surface comparison only |
| RD-002 | walkthrough | Agent | skipped-auto | none | Automatic participation |
| RD-003 | RV-001 | Agent | accepted | rpi-plan | In-scope duration-bound mismatch; confirm exact fixture before the smallest local correction |
| RD-004 | execution | Agent | Complete | none | Latest changed contracts assessed once |
| RD-005 | outcome | Agent | Defects found | none | Required playable-score arithmetic boundary remains |
| RD-006 | continuation | Agent | selected | rpi-plan | Append P12; no new architecture, live calls or repeat full review |
| RD-007 | RV-001 | Parent follow-up | resolved | none | P12 reproduced HTTP 503 at 140 BPM/12 bars before repair; both tempo vocal paths and material overflow rejection now pass |
| RD-008 | outcome | Parent follow-up | Conformant | none | 172 final affected API/MCP regressions, workspace build/typecheck/whitespace passed; this local predicate fix does not require another review |
| RD-009 | continuation | Parent follow-up | complete | none | Required offline criteria met; stop automatic session without paid inference, listening, deployment or exporter claims |

## Validation Evidence

| Check | Status | Evidence |
|-------|--------|----------|
| Current `npm test` | Passed before review | 481 API and 27 web passed; one opt-in PostgreSQL skipped |
| Current build/typecheck/whitespace | Passed before review | P11 implementation command results |
| Review validation | Not executed | Source comparison only; boundary candidate routes to implementation regression |
| Live/listening/export | Skipped | Outside authorized offline scope |

## Risks, Blockers, and Residual Work

* Review blockers: None; accepted RV-001 remains required work.
* Paid listening remains separate and unauthorized; host export is operator-owned and unverified.

## Review Record

### Scope and Evidence

* Task ID: llm-midi-jingle-build; coordinating parent llm-midi-jingle
* Review date: 2026-11-19
* Scope: P09-T01, P10-T01, P10-T02, P11-T01 against original RV-001 through RV-005 and RF-001
* Depth and provenance: surface, significant same-session public/cross-module contract changes
* Candidate identity: Current working tree after successful P11 checks
* Review execution: Complete
* Helpers: None
* Plan: .copilot-tracking/plans/2026-11-19/llm-midi-jingle-build-plan.md
* Changes: .copilot-tracking/changes/2026-11-19/llm-midi-jingle-build-changes.md
* Prior review: .copilot-tracking/reviews/logs/2026-11-19/llm-midi-jingle-build-review.md
* Prior refinement: .copilot-tracking/reviews/logs/2026-11-19/llm-midi-jingle-build-refinement.md
* Critique: Initial parent critique dispositions remain settled; no repeat critique.

### Opening Review State

* Goal: Verify required fixes meet their original resolution conditions and preserve adjacent contracts.
* Evidence readiness: P05-P11 checked; current changes, validation, blockers and exclusions reconciled.
* Acceptance basis: P09-P11 Requirements, original RV/RF conditions, child FR-007 through FR-010 and NFR-008 through NFR-010 as affected.
* Boundary: Latest playback/timing, import/cleanup, recovery/accounting, token usage and host guidance; no settled-scope reaudit.
* Read-only: Only this review record is writable during comparison.
* Authority: Main agent compares evidence; parent owns recorded decisions and continuation.
* Initial blockers: None.

### Acceptance and Change Coverage

| Task / requirement | Evidence | Assessment |
|--------------------|----------|------------|
| P09-T01; original RV-001; FR-009/FR-010 | web_app.ts shared publication; App.tsx refresh/inspection; render.ts tempo propagation; CompositionResult optional tempo; web_app/App tests | Met for injected 137 BPM case and owner-scoped playback/retries; remaining arithmetic-reader mismatch is new RV-001 |
| P10-T01; original RV-002/RF-001; NFR-009 | bootstrap_database.ts nullable provider validation; MelodyService outer cleanup; storage-admin/creative-audio regression evidence | Met: SQL NULL preserved, malformed values rejected, actual commit failures clean only newly created artifacts |
| P10-T02; original RV-003/RV-005; FR-008/FR-009 | web_storage.ts claim/reconcile/commit/finish, web_app.ts attempt propagation; restart/fencing/repricing tests | Met: explicit stopped-worker authority, no timed reclaim, atomic current-cost delta and aggregate budget |
| P11-T01; original RV-004; NFR-010 | score_cloud.ts Completion usage/span attributes; creative-lyrics tests; service-contracts.md and azure-deployment.md | Met: validated reported counts, missing values absent, content-free bounded telemetry, host setup/export limits documented |
| Plan/changes reconciliation | All P05-P11 markers and current successful checks | Met; implementation completion does not override this remaining acceptance finding |

### Critique and Follow-Up Assessment

* D10/D11 fixes preserve scope, paid consent, provider non-acceptance evidence, digest checks and host-owned telemetry.
* Initial critique is not repeated; unchanged P05-P08 contracts are not re-audited.
* Paid listening remains a separate user-consented task; export verification is operator-owned. No unrelated optional work selected.
* Business alignment: None; no BRD/PRD/ADR cited.

### Reviewer Self-Check

* [x] Latest task requirements, changes, validation, decisions and follow-ups assessed within surface scope.
* [x] Remaining finding identifies a concrete inconsistent bound and a checkable regression, not a cosmetic preference.
* [x] Execution Complete remains distinct from Defects found; no source or phase artifact changed during review.
* [x] No tests executed during review; supplied checks distinguished from source-only boundary analysis.
* Limits: No all-tempo runtime enumeration, real PostgreSQL, live inference, listening, deployment or exporter observation.
