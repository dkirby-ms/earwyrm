<!-- markdownlint-disable-file -->
# RPI Changes: Budget administration

## Metadata

Task ID: budget-administration. Date: 2026-11-19.
Plan: [.copilot-tracking/plans/2026-11-19/budget-administration-plan.md](../../plans/2026-11-19/budget-administration-plan.md).

## Execution Status

Complete; full-plan scope. P01/P01-T01 through P01-T03 and P02/P02-T01 completed.
Remaining active-plan work: none.

## Execution Summary

Implement persistent administrative limits and per-user lifetime trials using existing ledgers.

## Completed Work

### Persistent reservation-aware limits

P01-T01: [apps/api/src/web_storage.ts](../../../apps/api/src/web_storage.ts), [apps/api/src/bootstrap_database.ts](../../../apps/api/src/bootstrap_database.ts), [apps/api/src/persistence.ts](../../../apps/api/src/persistence.ts).
Database overrides retain environment defaults, lifetime users default to $5, and text/score/Speech share user-level accounting under the writer lock. Historical ownerless lyrics remain globally charged. Admin updates recheck access and preserve consumption.
Validation: budget and storage-admin suites passed, 50 tests; one opt-in live PostgreSQL test skipped.

### Admin controls and caller balances

P01-T02: [apps/api/src/web_app.ts](../../../apps/api/src/web_app.ts), [apps/web/src/App.tsx](../../../apps/web/src/App.tsx), [apps/web/src/types.ts](../../../apps/web/src/types.ts), [apps/web/src/index.css](../../../apps/web/src/index.css).
Admins inspect usage/actuals and edit exact shared/user ceilings; users see their own balance. All HTTP lyric reservations carry the authenticated owner, and jingle quotes check the entire lifetime cost before billable work. Busy/error/save states retain current patterns.
Validation: affected API suites 155 passed, 1 opt-in live PostgreSQL skipped; App suite 17 passed. Repository typecheck and production web build passed.

### Verified workflows and operator guidance

P01-T03: [apps/api/tests/budget.test.ts](../../../apps/api/tests/budget.test.ts), [apps/api/tests/storage-admin.test.ts](../../../apps/api/tests/storage-admin.test.ts), [apps/api/tests/web_app.test.ts](../../../apps/api/tests/web_app.test.ts), [apps/web/src/App.test.tsx](../../../apps/web/src/App.test.tsx), [docs/audio-poc/web-app.md](../../../docs/audio-poc/web-app.md), [docs/azure-deployment.md](../../../docs/azure-deployment.md).
Tests cover atomic trial boundaries, combined spending, own-user isolation, overrides, administrator revocation, strict payloads, preflight before paid work, legacy ownership, limits/ownership preservation through PostgreSQL import and upgrades, and frontend load/save/error behavior.
No tests deleted; one focused budget test file added. Existing SQL/count fixtures updated for the additive schema.

### Existing Speech defaults remain administrable

P02-T01 / RV-001: [apps/api/src/web_app.ts](../../../apps/api/src/web_app.ts)
normalizes operator Speech defaults through the existing `decimal` parser.
Strict text-default and administrator-write formats remain intact. Existing
scientific/leading-dot Speech values no longer break admin loading, while
malformed defaults explicitly return 503.
[apps/api/tests/web_app.test.ts](../../../apps/api/tests/web_app.test.ts) adds
two declarations (three regression cases) and an exponent-update rejection case.
Validation: endpoint suite 72 passed; repository typecheck and final API build
passed. `git diff --check` passed. No contracts, schema, UI or provider gates changed.

## Implementation-Time Plan Updates

P02 appended from accepted RV-001/RD-005/006, retaining completed P01 and the
initial critique. Localized parser correction; no new user decision or wider scope.

## Business Alignment

* None

## Validation Record

| Check | Status | Evidence |
|---|---|---|
| Budget, storage-admin, storage, web_app suites | Passed | 155 tests; 1 skipped opt-in live PostgreSQL test |
| Storage-admin after import/upgrade assertions added | Passed | 45 tests; 1 skipped |
| App tests | Passed | 17 tests |
| Repository typecheck | Passed | All workspaces and root |
| Repository build | Passed | API, web production, operator scripts |
| Browser fixture desktop/mobile | Passed | Isolated identity/API; exact per-user save and saved announcement, 1400px and 390px, no horizontal overflow, keyboard focus |
| Final web_app suite after RV-001 fix | Passed | 72 tests, including 3 new compatibility regressions |
| Final repository typecheck / API build | Passed | After localized follow-up; prior web build remains applicable |
| Patch hygiene | Passed | `git diff --check` |

Rendered inspection corrected inherited global definition-list columns and checkbox-label flex rules for the budget summary/form. No design-system changes. The existing DESIGN.md sidecar staleness warning is unrelated and was not repaired.
An initial browser route-callback fixture stalled; a browser-local fetch fixture replaced it. Final browser interaction completed without paid calls. This evidence does not establish live billing or deployed PostgreSQL behavior.

## Pre-Review Reconciliation

Initial P01 reviewed: acceptance Complete/Defects found (RV-001); refinement
Complete/Clean. P02 resolves the sole required accepted finding with exact
regression evidence. Parent final outcome may now be Conformant. No unresolved
decisions, blockers or required follow-ups. Localized remediation was validated
without repeating either review; original assessment evidence is preserved.

## Blockers

None.

## Remaining Work

None.

## Follow-Up Items

Subscription billing remains excluded.

## Return-to-Caller State

Automatic parent performs final follow-up reconciliation and closes the session.
No new telemetry emitters; actor/timestamp are private storage metadata.
Temporary browser server stopped. No deployment, live budget changes or commits.
