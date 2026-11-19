<!-- markdownlint-disable-file -->
# Refinement Review: LLM MIDI Jingle Implementation

## Executive Summary

* Assessment: Keep the bounded score/provider design; restore transaction-level ownership of artifact cleanup.
* Review execution: Complete
* Assessed outcome: Refinements identified
* Review depth: standard, initial parent refinement default
* Validation coverage: Prior implementation record supplies offline checks; no validation executed during this review.
* Limits: No deployment, paid/live inference or listening.

## What You May Not Know

Acceptance defects are recorded separately in llm-midi-jingle-build-review.md; this pass does not duplicate them as refinement findings.

## Findings and Proposed Routes

<!-- rpi:refinement id=RF-001 -->
### RF-001 [Medium]: The extracted writer claims commit before the transaction commits

* Related scope: P07-T01; MelodyService.submit/submit_score
* Dimension: Error boundaries
* Current state and evidence: apps/api/src/melody_service.ts `persist_arrangement` owns `committed`, sets it after INSERT, and exits before apps/api/src/persistence.ts `transaction` calls connection.commit(). The former submit implementation held its cleanup flag around the entire transaction.
* What to remove or rework: Remove the false inner commit boundary; give the transaction caller ownership of artifact cleanup through actual commit while sharing the common render/write path.
* Impact: A database commit failure currently rolls back the job but leaves private WAV/MIDI artifacts orphaned, including for the legacy path.
* Resolution condition: Injected INSERT and actual COMMIT failures both leave no new job directory or committed database row; retry can publish one durable job. Success and existing-job recovery never delete valid artifacts.
* Proposed destination: rpi-plan
* Smallest useful next action: Restore a single outer success/cleanup boundary shared by legacy and score submissions.

## Parent Decision Record

### Current Disposition

* Based on events: FD-001 through FD-009
* Review execution: Complete
* Final outcome: Clean after recorded RF-001 resolution
* Finding decisions and next actions: RF-001 resolved in P10-T01; no required refinement work remains
* Decisions still needed: None; walkthrough skipped-auto

### Decision History

| Event | Subject | Source | Status | Route | Rationale |
|-------|---------|--------|--------|-------|-----------|
| FD-001 | participation | Saved automatic parent | agent-owned | none | Initial parent refinement retained |
| FD-002 | walkthrough | Agent | skipped-auto | none | Saved automatic participation |
| FD-003 | RF-001 | Agent | accepted | rpi-plan | Restore ownership at actual transaction boundary; no trust-boundary removal |
| FD-004 | execution | Agent | Complete | none | Four lenses assessed in one main-agent pass |
| FD-005 | outcome | Agent | Refinements identified | none | One verified cleanup ownership defect |
| FD-006 | continuation | Agent | selected | rpi-plan | Group with accepted acceptance findings in P09 onward |
| FD-007 | RF-001 | Parent follow-up | resolved | none | P10-T01 owns cleanup through actual transaction COMMIT; legacy/score failure/recovery regressions pass |
| FD-008 | outcome | Parent follow-up | Clean | none | Surface refinement confirms simpler outer cleanup and shared publication/accounting; no new material finding |
| FD-009 | continuation | Parent follow-up | complete | none | Stop automatic session after acceptance P12 boundary regression passes |

## Validation Evidence

Prior offline tests, typecheck, build and image smoke are reported passed in the changes record; no new execution in this pass.

## Risks, Blockers, and Residual Work

* No blocker to the review.
* No runtime/SDK upgrade is needed for this bounded change.

## Refinement Record

### Scope and Evidence

* Task ID: llm-midi-jingle-build; coordinating parent llm-midi-jingle
* Review date: 2026-11-19
* Scope: Changed score/provider, tempo helpers, budget/storage, web routes/UI, tests, docs and Dockerfile.web
* Depth and provenance: standard, initial Review default
* Review execution: Complete
* Helpers: None; main-agent assessment
* Plan: .copilot-tracking/plans/2026-11-19/llm-midi-jingle-build-plan.md
* Changes: .copilot-tracking/changes/2026-11-19/llm-midi-jingle-build-changes.md
* Other evidence: Source diffs, new score modules, existing persistence transaction helper and renderer call sites inspected during acceptance comparison

### Opening Refinement State

* Goal: Remove complexity or rework ownership where the extraction obscures actual durable outcomes.
* Evidence readiness: Completed P05-P08 and changed files available.
* Boundaries: This record only; preserve all authentication, validation, containment, budget and untrusted-content controls.
* Authority: Main agent owns all four lenses and final routing.
* Initial blockers: None

### Lens Coverage and Kept-As-Is Summary

| Lens | Touched evidence | Findings and kept-as-is rationale |
|------|------------------|----------------------------------|
| Logic, branching, error boundaries, performance | MelodyService extraction, web_storage claims, score compiler/provider, DSP buffers | RF-001: cleanup belongs at outer transaction. Bounded pattern loops and fixed-size audio buffers retained; no speculative caching/wrappers proposed. |
| Conventions, SDKs, libraries, language versions | Existing serialized/transaction, strict Zod schema, shared schema conversion, Decimal, OpenTelemetry API, Node 24 | Existing packages and runtime APIs reused; no new dependencies or upgrade justified. Preserve strict validation and content-free errors. |
| Assumptions, architecture, tests | Provider injection and score DSL, durable ledgers, creative-audio/web_app/storage-admin cases | RF-001 regression missed by render-failure-only test. Paid generation publication/recovery defects are RV findings, not repeated here. Keep additive migrations and explicit budget state, not broad architecture redesign. |
| Documents, domain language, infrastructure | service/deployment docs, Dockerfile.web, child/parent plan deferrals | Shared deployment behavior and package-supplied runtime retained. Missing host telemetry guidance already RV-004. No extra flags, infrastructure or optional cleanup selected. |

### Reviewer Self-Check

* [x] All changed surfaces assessed across four lenses, with source/test locations inspected directly.
* [x] RF-001 is net simplifying and closes an actual rollback failure, not additive ceremony.
* [x] Authentication, validation, containment, budgets and untrusted-content controls remain intact.
* [x] Execution Complete is separate from outcome Refinements identified.
* [x] No code, tests, docs, config or phase evidence mutated during refinement.
* Limits: No live provider/exporter/deployment observation or real PostgreSQL integration; review does not infer a performance bottleneck or upgrade need.
