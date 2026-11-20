<!-- markdownlint-disable-file -->
# RPI Changes: Budget Reservation and Actual Cost

## Metadata

* Task ID: `budget-reservation-accounting`
* Related plan: [`.copilot-tracking/plans/2026-11-20/budget-reservation-accounting-plan.md`](../../plans/2026-11-20/budget-reservation-accounting-plan.md)
* Implementation date: `2026-11-20`

## Execution Status

* Status: Complete
* Declared invocation scope: P03
* Completed scope markers: P03, P03-T01, and P03-T02
* All remaining active-plan markers: None
* Status basis: Both P03 documentation and implementation-evidence tasks are complete. P01 and P02 remain complete from the earlier implementation; no active plan markers remain.

## Execution Summary

P01 distinguishes pending lyric holds from settled actuals, preserves correction/reopen history, exposes evidence-gated admin operations, and carries state/history through explicit SQLite-to-PostgreSQL import. P02 presents separate reserved and verified actual amounts and gives administrators settlement, correction, and reopen controls. The service and web-app guides explain evidence-gated lyric settlement, its audit path, and the difference between the app ledger and Azure charges. The original implementation's full API/web suites and typecheck passed. P03 corrects the budget guide's reconciliation wording and reconciles this record with the completed plan and recorded results. Runtime tests were not rerun for the documentation and tracking-only follow-up.

## Completed Work

### P01-T01: Persist pending and settled lyric costs

* Pending lyric reservations continue to count at their original cap; settled reservations count at the recorded nonnegative actual, including zero and amounts above the reserve. Shared, per-user, and unattributed totals follow the effective amount; score and Speech accounting remain unchanged.
* Admin storage operations settle once, correct, or reopen a reservation atomically with the admin check. Each transition records actor, time, evidence where applicable, reason, and prior/current amounts.
* Existing SQLite and PostgreSQL stores migrate legacy rows as pending; readiness requires schema version 3. SQLite import preserves settlement state and event history.
* Affected files: [apps/api/src/web_storage.ts](../../../apps/api/src/web_storage.ts), [apps/api/src/bootstrap_database.ts](../../../apps/api/src/bootstrap_database.ts), [apps/api/tests/budget.test.ts](../../../apps/api/tests/budget.test.ts), and [apps/api/tests/storage-admin.test.ts](../../../apps/api/tests/storage-admin.test.ts).
* Validation: targeted budget and storage-admin tests passed (55 passed, 1 skipped); `npm run typecheck` passed.

### P01-T02: Add admin-authorized lyric reconciliation

* `GET /api/admin/budgets` exposes pending and settled lyric entries with transition history. Admin-only settle, correct, and reopen routes require scoped inputs; storage rechecks administrator status before mutation.
* Settlement and correction require a finite nonnegative actual, evidence reference, and reason. Reopening requires a reason and restores the pending hold. Failed lyric requests remain pending and counted.
* Affected files: [apps/api/src/web_app.ts](../../../apps/api/src/web_app.ts), [apps/api/src/web_storage.ts](../../../apps/api/src/web_storage.ts), and [apps/api/tests/web_app.test.ts](../../../apps/api/tests/web_app.test.ts).
* Validation: `web_app.test.ts` passed (77 tests); `npm run typecheck` passed with these routes.

### P02-T01: Show reserved and settled lyric amounts

* Users see pending lyric reserves separately from administrator-recorded verified actuals, while remaining-budget calculations continue to reflect outstanding holds and settled charges. Administrators can settle pending entries with evidence, correct or reopen settled entries, and inspect transition history.
* Affected files: [apps/web/src/App.tsx](../../../apps/web/src/App.tsx), [apps/web/src/types.ts](../../../apps/web/src/types.ts), [apps/web/src/index.css](../../../apps/web/src/index.css), and [apps/web/src/App.test.tsx](../../../apps/web/src/App.test.tsx).
* Validation: `npm run test --workspace @earwyrm/web -- --run src/App.test.tsx` passed (21 tests). The full API/web suites and typecheck later passed in the original implementation; they were not rerun for P03.

### P02-T02: Update the budget service contract

* The service and web-app guides distinguish pending lyric reserves from administrator-recorded actuals, explain that failures and token counts do not verify billed dollars, and describe evidence-backed settlement, correction, and reopening without implying the app reads Azure billing data.
* The guides preserve the existing score and Speech policies and state that the reported two failures have not been verified against account-specific request and reservation records.
* Affected files: [docs/service-contracts.md](../../../docs/service-contracts.md) and [docs/audio-poc/web-app.md](../../../docs/audio-poc/web-app.md).
* Validation: Documentation updated. The full API/web suites and typecheck passed in the original implementation; they were not rerun for P03.

### P03-T01: Clarify lyric and Speech reconciliation wording

* Related phase or task: P03-T01
* Files:
  * [docs/audio-poc/web-app.md](../../../docs/audio-poc/web-app.md)
* Behavior or functionality changed: The budget guide limits administrator evidence-backed actual entry to lyric reservation controls and identifies Speech/full-jingle actuals as part of the existing owner-scoped attempt reconciliation workflow.
* Validation: `git diff --check` passed. Runtime tests were not run because this documentation-only task changes no runtime behavior.

### P03-T02: Reconcile implementation status and validation evidence

* Related phase or task: P03-T02
* Files:
  * [this changes record](./budget-reservation-accounting-changes.md)
  * [the plan](../../plans/2026-11-20/budget-reservation-accounting-plan.md)
* Behavior or functionality changed: The implementation handoff now reports completed scope, recorded validation, remaining work, and review readiness consistently with plan markers and review evidence.
* Validation: The record was compared with the completed plan and Review validation table. `git diff --check` passed. Runtime tests were not rerun because this tracking-only task changes no runtime behavior.

## Implementation-Time Plan Updates

### P03 follow-up plan

* Affected plan area or markers: P03, P03-T01, P03-T02, FR-007, NFR-004, and decisions D4-D5.
* What changed: The plan adds separate documentation and implementation-evidence tasks for the two accepted Review findings.
* Why: RV-001 identified broad budget-guide wording about administrator-recorded actuals; RV-002 identified stale completion and validation statements in this record.
* Triggering evidence: [RV-001 and RV-002](../../reviews/logs/2026-11-20/budget-reservation-accounting-review.md).
* User answer or decision: None; the corrections remain within the user's confirmed automatic, local-only scope.
* Reconciliation performed: Added P03 task requirements, dependencies, references, decision rows, and change-map updates; implementation markers and this record now reflect completion.
* Planning and critique state: P03 was implementation-ready with no blockers. The initial critique remains recorded; no follow-up critique was required.

### PostgreSQL upgrades and unattributed totals

* Affected plan area or markers: P01-T01 Details and References.
* What changed: The plan now names the explicit PostgreSQL upgrade path, requires readiness validation against the new lyric schema version, and includes unattributed reservation totals in the effective-amount calculation.
* Why: Existing PostgreSQL startup validates schema and does not run DDL; the admin overview also tracks lyric reservations without an owner.
* Triggering evidence: [apps/api/src/web_storage.ts](../../../apps/api/src/web_storage.ts) and [apps/api/src/bootstrap_database.ts](../../../apps/api/src/bootstrap_database.ts).
* User answer or decision: None; this is a local implementation detail that preserves the approved SQLite/PostgreSQL scope.
* Reconciliation performed: Updated P01-T01 Details and References; no requirements, task order, or change-map connections changed.
* Planning and critique state: The plan remains ready; PC-001 through PC-003 are resolved. No follow-up critique is required.

### Admin correction visibility

* Affected plan area or markers: P01-T02 Requirements and Details.
* What changed: The admin budget response now includes settled lyric reservations and their transition history as well as pending holds.
* Why: PC-001 adds correction and reopening, so administrators need to locate a settled reservation and inspect the prior transition before changing it.
* Triggering evidence: PC-001 and the approved correction/reopen requirement FR-006.
* User answer or decision: None; this is required to expose the approved admin correction capability.
* Reconciliation performed: Updated the P01-T02 admin-view contract; P02-T01 continues to own the UI.
* Planning and critique state: The plan remains ready; PC-001 through PC-003 are resolved. No follow-up critique is required.

### Storage contracts and import compatibility

* Affected plan area or markers: P01-T01 Guidance and References.
* What changed: The plan now names the storage balance and reservation-history response contracts, admin settlement methods, and the SQLite import path for settlement events.
* Why: P01-T02 and P02 consume these contracts, and omitting the new event table from import would lose verified settlement history during PostgreSQL migration.
* Triggering evidence: [apps/api/src/web_storage.ts](../../../apps/api/src/web_storage.ts), [apps/api/src/bootstrap_database.ts](../../../apps/api/src/bootstrap_database.ts), and the passing storage migration tests.
* User answer or decision: None; this preserves the approved storage and migration scope.
* Reconciliation performed: Added P01-T01 Guidance; no requirements, task order, or change-map connections changed.
* Planning and critique state: The plan remains ready; PC-001 through PC-003 are resolved. No follow-up critique is required.

### Admin API handoff

* Affected plan area or markers: P01-T02 Guidance and P02-T01 Details.
* What changed: The plan now records the budget response fields, admin route paths, request shapes, and `{ reservation }` response contract.
* Why: The UI needs stable endpoints and payload shapes for settlement, correction, and reopening.
* Triggering evidence: [apps/api/src/web_app.ts](../../../apps/api/src/web_app.ts), [apps/api/src/web_storage.ts](../../../apps/api/src/web_storage.ts), and passing route tests.
* User answer or decision: None; the contracts implement the approved admin workflow.
* Reconciliation performed: Added P01-T02 Guidance; no requirements, task order, or change-map connections changed.
* Planning and critique state: The plan remains ready; PC-001 through PC-003 are resolved. No follow-up critique is required.

## Validation Record

| Check | Scope | Status | Evidence or reason |
|-------|-------|--------|--------------------|
| `npm run test --workspace @earwyrm/api -- --run tests/budget.test.ts tests/storage-admin.test.ts` | P01-T01 | Passed | 55 passed, 1 skipped |
| `npm run test --workspace @earwyrm/api -- --run tests/web_app.test.ts` | P01-T02 | Passed | 77 passed |
| `npm run test --workspace @earwyrm/web -- --run src/App.test.tsx` | P02-T01 | Passed | 21 passed |
| `npm run test:api` | Original implementation | Passed | 505 passed, 1 skipped |
| `npm run test:web` | Original implementation | Passed | 21 passed |
| `npm run typecheck` | Original implementation | Passed | API, web workspace, and root TypeScript checks completed |
| `npm run typecheck` | P01-T01 | Passed | API, web workspace, and root TypeScript checks completed |
| `npm run typecheck` | P01-T02 | Passed | API, web workspace, and root TypeScript checks completed |
| `git diff --check` | P03 | Passed | No whitespace errors after documentation and tracking updates |

## Pre-Review Reconciliation

* Plan markers and task-local context: Current; P01, P02, and P03 and all their tasks are checked, with P03 evidence recorded.
* Completed-work entries and handoff prose: Current; original implementation, both P03 corrections, and the P03 plan update are recorded.
* Validation, blockers, remaining work, and follow-up items: Original full API/web suites and typecheck passed; P03 `git diff --check` passed. No blockers, active markers, or follow-up items remain.
* Review readiness: RV-001 and RV-002 resolution conditions are met. No repeat review is required for this bounded documentation and tracking-only follow-up; the automatic parent owns session closeout.

## Blockers

* None.

## Remaining Work

* None.

## Follow-Up Items

* Canonical plan list: [`.copilot-tracking/plans/2026-11-20/budget-reservation-accounting-plan.md`](../../plans/2026-11-20/budget-reservation-accounting-plan.md), `## Follow-Up Items`
* None.

## Return-to-Caller State

* Implementation execution status: Complete for the declared P03 scope.
* Declared scope and markers: P03; P03-T01, P03-T02, and P03 complete. P01 and P02 were already checked before this bounded continuation. No active plan markers remain.
* Validation coverage: The original implementation's full API suite (505 passed, 1 skipped), full web suite (21 passed), and `npm run typecheck` passed. P03 `git diff --check` passed; runtime tests were not rerun for the documentation and tracking-only changes.
* Blockers: None.
* Current plan updates: P03 records the accepted RV-001 and RV-002 follow-ups; prior P01-T01 and P01-T02 implementation contract updates remain documented.
* Business alignment entries: None; no BRD, PRD, or ADR requirements are cited.
* Planning and critique state: The initial standard critique is complete; P03 was ready for implementation and no repeat critique was required.
* Follow-up items: None.
* Review readiness or no-handoff reason: Both accepted Review findings meet their resolution conditions. No repeat Review is required for this bounded documentation/tracking follow-up; the automatic parent owns closeout.
* Continuation owner: Confirmed automatic RPI Agent.
