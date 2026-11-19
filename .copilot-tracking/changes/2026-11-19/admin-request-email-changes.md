<!-- markdownlint-disable-file -->
# RPI Changes: Admin request email

## Metadata

Task ID: admin-request-email. Date: 2026-11-19.
Related plan: [.copilot-tracking/plans/2026-11-19/admin-request-email-plan.md](../../plans/2026-11-19/admin-request-email-plan.md).

## Execution Status

Complete, full-plan scope. P01, P01-T01 and P01-T02 complete; no remaining active markers.

## Execution Summary

Capture trusted email, persist nullable metadata and display it in the existing admin queue.

## Completed Work

### P01-T01: Trusted email survives request storage and admin listing

* [apps/api/src/web_app.ts](../../../apps/api/src/web_app.ts) captures validated token `email`/`emails` only and returns nullable email to admins.
* [apps/api/src/web_storage.ts](../../../apps/api/src/web_storage.ts) persists metadata, refreshes pending email without queue changes, and upgrades existing schemas.
* [apps/api/src/bootstrap_database.ts](../../../apps/api/src/bootstrap_database.ts) preserves current and legacy SQLite imports.
* Targeted API, storage and migration tests: 22 passed. A first legacy import check exposed the copy helper's strict whitelist; both validation and copy now accept only the exact old or current schema.

### P01-T02: Admin queue shows email and subject

* [apps/web/src/App.tsx](../../../apps/web/src/App.tsx) displays email and labeled subject, or an explicit unavailable state.
* [apps/web/src/types.ts](../../../apps/web/src/types.ts) carries nullable email metadata.
* [apps/web/src/App.test.tsx](../../../apps/web/src/App.test.tsx) verifies present/missing email and existing grant/deny interactions.
* [docs/audio-poc/web-app.md](../../../docs/audio-poc/web-app.md) documents claim sources, historical requests and migration.
* Browser inspection at 1440px and 390px confirmed labeled metadata, long-email wrapping, actionable grant controls, and no horizontal overflow.

## Implementation-Time Plan Updates

None.

## Business Alignment

* None

## Validation Record

* Passed: affected API/storage/import/cloud files, 135 tests; 1 pre-existing opt-in live PostgreSQL test skipped.
* Passed: full frontend App suite, 26 tests.
* Passed: `npm run typecheck`, `git diff --check`.
* Passed: rendered desktop/mobile checks using isolated synthetic MSAL/API fixtures. No live tenant claims or production database accessed.
* Telemetry: no new emitters. Email and token claims are not emitted to logs, spans or metrics; PII strategy is drop.

## Pre-Review Reconciliation

Plan checklist, completed entries, scope and validation reconciled. Ready for Review.

## Blockers

None.

## Remaining Work

None.

## Follow-Up Items

None.

## Return-to-Caller State

Automatic parent continues after implementation and checks.
