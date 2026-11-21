<!-- markdownlint-disable-file -->
# RPI Changes: Jingle step diagnostics

## Metadata

* Task ID: `jingle-step-diagnostics`
* Related plan: [plan](../../plans/2026-11-21/jingle-step-diagnostics-plan.md)
* Implementation date: 2026-11-21

## Execution Status

* Status: Complete
* Declared invocation scope: Full plan
* Completed scope markers: P01-T01, P01-T02, P01-T03
* All remaining active-plan markers: None
* Status basis: The progress API, browser timeline, workflow guide, and final workspace typecheck are complete.

## Execution Summary

The progress API returns owner-scoped server timing, the browser timeline displays active and completed step durations, and the workflow guide explains timing semantics and unavailable states.

## Completed Work

### Returning owner-scoped stage timing from the progress API

* Related phase or task: `P01-T01`
* Files:
  * [apps/api/src/web_app.ts](../../../apps/api/src/web_app.ts)
  * [apps/api/src/jingle_progress_timing.ts](../../../apps/api/src/jingle_progress_timing.ts)
  * [apps/api/tests/web_app.test.ts](../../../apps/api/tests/web_app.test.ts)
* Behavior or functionality changed: The progress endpoint reports server-measured completed and active stage durations, preserves the final stage for up to 60 seconds after success or failure, and returns an empty timing shape to non-owners or after expiry. Repeated same-stage assignments do not reset timing, and revisited stages accumulate their earlier durations.
* Validation: API progress tests passed, 94 tests; API workspace typecheck and final workspace typecheck passed.

### Displaying generation-step timing

* Related phase or task: `P01-T02`
* Files:
  * [apps/web/src/App.tsx](../../../apps/web/src/App.tsx)
  * [apps/web/src/types.ts](../../../apps/web/src/types.ts)
  * [apps/web/src/App.test.tsx](../../../apps/web/src/App.test.tsx)
  * [apps/web/src/index.css](../../../apps/web/src/index.css)
* Behavior or functionality changed: The generation timeline shows accumulated server-measured durations for completed steps and elapsed time for the active step, including earlier visits. It reads a terminal snapshot after success or failure and labels unreached or unavailable timings without exposing token counts or changing progress and error announcements. Its repeat-stage test asserts the active display includes prior duration plus current elapsed time.
* Validation: Focused web tests passed, 30 tests; web workspace typecheck and final workspace typecheck passed. Synthetic-browser visual review at 1280px and 375px found no horizontal overflow; the desktop and mobile document widths were 1265px and 360px respectively.

### Documenting generation-step timing

* Related phase or task: `P01-T03`
* Files:
  * [docs/audio-poc/web-app.md](../../../docs/audio-poc/web-app.md)
* Behavior or functionality changed: The workflow guide explains server-measured elapsed time, accumulated active and completed durations, the distinction from billing or token usage, and the not-reached and unavailable labels while retaining existing failure, diagnostic-ID, and charge warnings.
* Validation: Documentation-only change; no documentation test is configured. Final workspace typecheck passed.

## Implementation-Time Plan Updates

### Resolving PC-001 active revisited-stage timing

* Affected plan area or markers: `P01-T01`, `P01-T02`
* What changed: The active response distinguishes previously accumulated stage time from the current visit, and the UI displays their sum for the active stage.
* Why: The standard critique found the active display contract unclear when a stage is revisited.
* Triggering evidence: [plan critique](../../reviews/plans/2026-11-21/jingle-step-diagnostics-plan-critique.md), finding `PC-001`; [research](../../research/2026-11-21/jingle-step-diagnostics-research.md), finding `F1` and evidence `C7`.
* User answer or decision: None needed; this is a planner-owned clarification consistent with confirmed requirements.
* Reconciliation performed: Updated the task Details, task test expectations, Planning Readiness, critique disposition, and executive summary; the change map and requirement IDs remain unchanged.
* Planning and critique state: The single standard critique completed with a Revise verdict; `PC-001` is resolved in the plan. No follow-up critique is planned.

## Business Alignment

* None

## Validation Record

| Check | Scope | Status | Evidence or reason |
|-------|-------|--------|--------------------|
| `npm run test --workspace @earwyrm/api -- tests/web_app.test.ts` | API | Passed | 94 tests passed, including repeated-stage active and terminal accumulation. |
| `npm run typecheck --workspace @earwyrm/api` | API | Passed | TypeScript completed without errors. |
| `npm run test --workspace @earwyrm/web -- --run src/App.test.tsx` | Web | Passed | 30 tests passed, including the active duration on a revisited step. |
| `npm run typecheck --workspace @earwyrm/web` | Web | Passed | TypeScript completed without errors. |
| Synthetic-browser desktop and mobile visual review | Web | Passed | 1280px and 375px viewports; no horizontal overflow. |
| `npm run typecheck` | Workspace | Passed | API and web workspaces plus root TypeScript completed without errors. |

## Pre-Review Reconciliation

* Plan markers and task-local context: Current; P01-T01, P01-T02, and P01-T03 are complete.
* Completed-work entries and handoff prose: Current; all tasks record the API, timeline, and guide behavior.
* Validation, blockers, remaining work, and follow-up items: API and web tests, workspace and final typechecks, and desktop/mobile visual review passed; no blockers or remaining implementation tasks.
* Review readiness: Ready; the full plan and its named validation are complete.

## Blockers

* None.

## Remaining Work

* None.

## Follow-Up Items

* Canonical plan list: [plan](../../plans/2026-11-21/jingle-step-diagnostics-plan.md), `## Follow-Up Items`.
* Revisit cross-provider token counts only if every relevant generation step can report accurate usage through an approved user-facing contract; future planning session.

## Return-to-Caller State

* Implementation execution status: Complete
* Declared scope and markers: Full plan; P01 and P01-T01 through P01-T03 complete.
* Validation coverage: Focused API tests (94 passed), focused web tests (30 passed), API and web workspace typechecks, final workspace typecheck, and desktop/mobile visual review passed.
* Blockers: None.
* Current plan updates: PC-001 resolved by defining the active revisited-stage total.
* Business alignment entries: None.
* Planning and critique state: Plan is Ready; critique execution is Complete, verdict Revise, and PC-001 is resolved.
* Follow-up items: Deferred cross-provider token counts, as recorded in the plan.
* Review readiness or no-handoff reason: Review is complete; accepted finding `RV-001` has been implemented and focused validation passed. Continue to refinement without a second full review.
* Continuation owner: Automatic RPI session.

## Review Follow-Up

### Verifying repeated-stage duration accumulation

* Related markers: `P01-T01`, `P01-T02`; accepted review finding `RV-001`.
* Status: Complete.
* Files in scope:
  * [apps/api/src/jingle_progress_timing.ts](../../../apps/api/src/jingle_progress_timing.ts)
  * [apps/api/src/web_app.ts](../../../apps/api/src/web_app.ts)
  * [apps/api/tests/web_app.test.ts](../../../apps/api/tests/web_app.test.ts)
  * [apps/web/src/App.test.tsx](../../../apps/web/src/App.test.tsx)
* Change: Extracted the stage timing arithmetic into a shared helper used by the progress endpoint. A deterministic API test verifies accumulation across a revisit, while the browser test verifies the active revisited-stage display includes prior duration plus current elapsed time.
* Validation: Focused API tests passed (94), focused web tests passed (30), and `npm run typecheck` passed.
