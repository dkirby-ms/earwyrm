<!-- markdownlint-disable-file -->
# RPI Changes: Access Request and Approval Flow

## Metadata

* Task ID: access-request-approval-flow
* Related plan: [`.copilot-tracking/plans/2026-11-18/access-request-approval-flow-plan.md`](../../plans/2026-11-18/access-request-approval-flow-plan.md)
* Implementation date: 2026-11-18

## Execution Status

* Status: Complete
* Declared invocation scope: full plan
* Completed scope markers: P01, P01-T01, P01-T02, P02, P02-T01, P02-T02
* All remaining active-plan markers: None
* Status basis: The full implementation plan is complete and validated; the required Review phase is next.

## Execution Summary

P01-T01 adds a durable, identity-bound request lifecycle across SQLite and PostgreSQL, including safe upgrades and legacy import. P01-T02 adds authenticated requester and administrator operations. P02-T01 replaces the technical denial panel with a signed-in request/status flow. P02-T02 adds the administrator pending queue and grant/deny actions while retaining direct permission editing, and updates the user guide. Focused API and web tests, web typecheck/build, whitespace validation, and desktop/mobile browser checks pass. The implementation is ready for Review.

## Completed Work

### P01-T01 — Persist requests and roll out the schema

* Request state is stored separately from app permissions. Pending submissions are idempotent, decisions are transactional, and retries after a decision receive a new request ID.
* Approval grants baseline app access only; already-enabled identities are not queued. Admin list/decision operations recheck current administrator access within the storage transaction.
* SQLite initialization, PostgreSQL bootstrap/validation/upgrade, reset ordering, and SQLite import support `access_requests`. Existing PostgreSQL stores upgrade this schema regardless of `LYRIC_ENABLED`; paid-text schema remains conditional.
* A legacy SQLite source without the request table remains importable, while present request records are copied.
* Affected files: [apps/api/src/web_storage.ts](../../../apps/api/src/web_storage.ts), [apps/api/src/persistence.ts](../../../apps/api/src/persistence.ts), [apps/api/src/bootstrap_database.ts](../../../apps/api/src/bootstrap_database.ts), [apps/api/src/cloud_web.ts](../../../apps/api/src/cloud_web.ts), [apps/api/tests/storage.test.ts](../../../apps/api/tests/storage.test.ts), [apps/api/tests/storage-admin.test.ts](../../../apps/api/tests/storage-admin.test.ts), [apps/api/tests/cloud_web.test.ts](../../../apps/api/tests/cloud_web.test.ts), [docs/azure-deployment.md](../../../docs/azure-deployment.md).

### P01-T02 — Expose authenticated requester and admin operations

* Requesters can read and submit only their own request using verified token claims and `briefs.read`; request bodies cannot specify identity or permissions.
* Enabled admins can list pending requests and decide by request ID. Storage rechecks admin permission transactionally; approval grants baseline access, denial does not alter user permissions, and stale decisions return conflict.
* Affected files: [apps/api/src/web_app.ts](../../../apps/api/src/web_app.ts), [apps/api/tests/web_app.test.ts](../../../apps/api/tests/web_app.test.ts).

### P02-T01 — Request access from the denied-access view

* Signed-in users without app access now see plain-language request status and a request/retry action; approved requests offer a workspace reload. The requester view no longer exposes issuer or subject details, while signed-out sign-in remains unchanged.
* Only the explicit application-access 403 enters the request-status flow; other HTTP failures retain their error behavior. Request submission uses the authenticated client without a caller-supplied identity and announces success accessibly.
* Affected files: [apps/web/src/App.tsx](../../../apps/web/src/App.tsx), [apps/web/src/api.ts](../../../apps/web/src/api.ts), [apps/web/src/types.ts](../../../apps/web/src/types.ts), [apps/web/src/App.test.tsx](../../../apps/web/src/App.test.tsx).
* Validation: 20 focused tests passed; web typecheck and production build passed. Browser checks at desktop and 390px mobile widths covered denied and pending states with temporary API/auth mocks.

### P02-T02 — Review and decide pending access requests

* Enabled administrators can review pending requests, inspect a read-only subject reference, and grant or deny without entering the subject. Successful decisions refresh both the queue and user permissions; failed decisions refresh the queue and surface errors.
* Grant copy states that only baseline access is enabled and elevated administrator/paid Speech flags remain off. The existing permission editor remains available for separate changes. The guide now documents requester status, denied retry, admin decisions, and first-admin bootstrap.
* Affected files: [apps/web/src/App.tsx](../../../apps/web/src/App.tsx), [apps/web/src/types.ts](../../../apps/web/src/types.ts), [apps/web/src/App.test.tsx](../../../apps/web/src/App.test.tsx), [docs/audio-poc/web-app.md](../../../docs/audio-poc/web-app.md).
* Validation: 25 focused web tests and 50 focused API tests passed; web typecheck/build and `git diff --check` passed. Browser checks at 1440px desktop and 390px mobile covered the admin queue and existing permission editor.

## Implementation-Time Plan Updates

* Checked P01 and P01-T02 after recording the task completion. Added `Guidance:` blocks naming the storage contract for P01-T02 and the endpoint/response contract for P02.

## Business Alignment

* None

## Validation Record

| Check | Scope | Status | Evidence or reason |
|-------|-------|--------|--------------------|
| `npm run test --workspace @earwyrm/api -- tests/storage.test.ts tests/storage-admin.test.ts tests/cloud_web.test.ts` | P01-T01 | Passed | 79 passed, 1 skipped. |
| `npm run typecheck --workspace @earwyrm/api` | P01-T01 | Passed | TypeScript check completed. |
| `npm run build --workspace @earwyrm/api` | P01-T01 | Passed | API build completed. |
| `npm run test --workspace @earwyrm/api -- tests/web_app.test.ts` | P01-T02 | Passed | 50 passed. |
| `npm run typecheck --workspace @earwyrm/api` | P01-T02 | Passed | TypeScript check completed. |
| `npm run build --workspace @earwyrm/api` | P01-T02 | Passed | API build completed. |
| `npm run test --workspace @earwyrm/web -- --run src/App.test.tsx` | P02-T01 | Passed | 20 passed. |
| `npm run typecheck --workspace @earwyrm/web` | P02-T01 | Passed | TypeScript check completed. |
| `npm run build --workspace @earwyrm/web` | P02-T01 | Passed | Web production build completed. |
| `npm run test --workspace @earwyrm/web -- --run src/App.test.tsx` | P02-T02 | Passed | 25 passed. |
| `npm run test --workspace @earwyrm/api -- tests/web_app.test.ts` | P02-T02 | Passed | 50 passed. |
| `npm run typecheck --workspace @earwyrm/web` | P02-T02 | Passed | TypeScript check completed. |
| `npm run build --workspace @earwyrm/web` | P02-T02 | Passed | Web production build completed. |
| `git diff --check` | Full implementation | Passed | No whitespace errors. |
| Browser visual review | P02-T01, P02-T02 | Passed | Requester and admin views checked at desktop and 390px mobile widths using temporary API/auth mocks. |

## Pre-Review Reconciliation

* Plan markers and task-local context: P01, P01-T01, P01-T02, P02, P02-T01, and P02-T02 are complete; requester/admin API guidance is recorded for P02.
* Completed-work entries and handoff prose: Storage, API, requester UI, and admin queue behavior and affected files are recorded above.
* Validation, blockers, remaining work, and follow-up items: Focused storage/API/web tests, API/web typechecks and builds, whitespace validation, and desktop/mobile visual checks pass; no blocker or active implementation work remains.
* Review readiness: Ready for the required Review phase.

## Blockers

* None.

## Remaining Work

* None.

## Follow-Up Items

* Canonical plan list: [`.copilot-tracking/plans/2026-11-18/access-request-approval-flow-plan.md`](../../plans/2026-11-18/access-request-approval-flow-plan.md), `## Follow-Up Items`
* Add durable request decision history if an audit or retention requirement emerges; it was not requested for the current access flow. Owner: product owner or follow-up planning.

## Return-to-Caller State

* Implementation execution status: Complete
* Declared scope and markers: Full plan; P01, P01-T01, P01-T02, P02, P02-T01, and P02-T02 complete; no active markers remain.
* Validation coverage: Focused storage/startup, API, and web tests; API/web typechecks and builds; `git diff --check`; and desktop/mobile visual checks all pass.
* Blockers: None.
* Current plan updates: All phase/task markers checked; Guidance added for P01-T02 and P02 requester/admin UI tasks.
* Business alignment entries: None.
* Planning and critique state: Plan is Ready; standard critique execution is Complete with verdict Revise and all findings resolved.
* Follow-up items: Durable request decision history is deferred; see the plan's `## Follow-Up Items`.
* Review readiness or no-handoff reason: Ready for required Review; full implementation is complete.
* Continuation owner: Parent automatic RPI Agent.
