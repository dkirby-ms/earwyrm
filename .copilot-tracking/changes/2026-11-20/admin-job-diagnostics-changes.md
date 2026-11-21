<!-- markdownlint-disable-file -->
# RPI Changes: Admin job diagnostics

## Metadata

* Task ID: `admin-job-diagnostics`
* Related plan: [.copilot-tracking/plans/2026-11-20/admin-job-diagnostics-plan.md](../../plans/2026-11-20/admin-job-diagnostics-plan.md)
* Implementation date: 2026-11-20

## Execution Status

* Status: Complete
* Declared invocation scope: full plan
* Completed scope markers: `P01`, `P01-T01`, `P02`, `P02-T01`, `P03`, `P03-T01`, `P03-T02`
* Remaining active-plan markers: none
* Status basis: The full implementation and its planned checks are complete; acceptance and refinement review remain.

## Execution Summary

Jingle requests now have a durable content-free lifecycle record and administrator-only lookup.

## Completed Work

### Durable job lifecycle and authorized lookup (`P01-T01`)

[apps/api/src/web_storage.ts](../../../apps/api/src/web_storage.ts), [apps/api/src/web_app.ts](../../../apps/api/src/web_app.ts), and [apps/api/src/jingle_diagnostics.ts](../../../apps/api/src/jingle_diagnostics.ts) persist content-free lifecycle states before paid calls, guard access, and present interrupted work as unknown. Diagnostic write failures surface an uncertainty warning and prevent further paid stages where possible. [apps/api/src/lyric_service.ts](../../../apps/api/src/lyric_service.ts) and [apps/api/src/render.ts](../../../apps/api/src/render.ts) await stage persistence before safety and voice calls. [apps/api/src/bootstrap_database.ts](../../../apps/api/src/bootstrap_database.ts) and [apps/api/src/persistence.ts](../../../apps/api/src/persistence.ts) support initialization, upgrade, reset, and legacy import. Focused API, storage and migration tests and API typecheck pass.

### Bounded provider evidence (`P02-T01`)

[apps/api/src/jingle_diagnostics.ts](../../../apps/api/src/jingle_diagnostics.ts) captures recognized codes, sent parameter names, UUID request IDs, operations and status codes, while discarding raw provider content. The bounded event store is validated on write, read and SQLite import. Evidence-write failure stops further paid work and score submission remains conservatively recorded as unknown. API and provider tests cover recognized, hostile, malformed, oversized, successful and refusal responses without paid calls.

### Task-oriented administration and lookup (`P03-T01`)

[apps/web/src/App.tsx](../../../apps/web/src/App.tsx), [apps/web/src/types.ts](../../../apps/web/src/types.ts), and [apps/web/src/index.css](../../../apps/web/src/index.css) provide the user-selected task rail and an admin-only lookup, with explicit loading, missing, error, unknown and provider-evidence states. Budgets, lyric settlement and access controls remain available in separate tasks. Synthetic desktop and mobile captures, keyboard dialog return, responsive overflow, 27 web tests and the web build passed.

### Operational guidance and verification (`P03-T02`)

[docs/azure-deployment.md](../../../docs/azure-deployment.md) describes lookup, retention, unknown outcomes, sanitized evidence, historical limits and schema-before-worker startup. API and web tests and builds pass. The independent Impeccable reviewer requested seed corroboration and clearer unknown-state treatment; its verdict pass scored both fixes resolved and returned `ship` for those fixes. No deployment or paid provider call was made.

## Implementation-Time Plan Updates

`P02-T01` identifies the lifecycle contracts created by `P01-T01`; `P03-T01` identifies the provider-event response shape created by `P02-T01`.
The user selected the code-led Task rail layout for `P03-T01`; its direction and chosen sketch are recorded in [apps/web/.impeccable/surfaces/src-app-tsx.md](../../../apps/web/.impeccable/surfaces/src-app-tsx.md).

## Business Alignment

* None.

## Validation Record

| Check | Scope | Status | Evidence or reason |
|-------|-------|--------|--------------------|
| Storage and migration tests | `P01-T01` partial | Passed | 83 passed, one opt-in PostgreSQL test skipped |
| API typecheck | `P01-T01` partial | Passed | `npm run typecheck --workspace @earwyrm/api` |
| Jingle and diagnostic API tests | `P01-T01` | Passed | 19 passed using local fixtures |
| API, provider and migration suites | `P01-T01`, `P02-T01` | Passed | 254 passed, one opt-in PostgreSQL test skipped; additional score metadata tests passed |
| Web test and build | `P03-T01` | Passed | 27 tests and web typecheck/build |
| Visual checks | Admin desktop and mobile | Passed | Synthetic browser fixture; no mobile overflow; budget dialog Escape returned focus |
| Impeccable finish review | Admin | Passed | Reviewer scored both requested fixes resolved; verdict `ship` for the fix list |
| Final API and migration validation | Full plan | Passed | 306 tests passed, one opt-in PostgreSQL test skipped; API build passed |
| Unknown outcome visual correction | Admin | Passed | Amber outcome and caution recaptured on desktop and mobile; 27 web tests and web build passed |

## Pre-Review Reconciliation

Full-plan implementation is ready for acceptance and refinement review. The live PostgreSQL test was skipped because it is opt-in; disposable migration fixtures passed.

## Blockers

None known.

## Remaining Work

None in the implementation plan; the automatic session continues to its initial reviews.

## Follow-Up Items

* Canonical list: [.copilot-tracking/plans/2026-11-20/admin-job-diagnostics-plan.md](../../plans/2026-11-20/admin-job-diagnostics-plan.md), `## Follow-Up Items`.
* None.

## Return-to-Caller State

* Implementation execution status: Complete, full plan.
* Validation coverage: API, migration and web tests and builds passed; live PostgreSQL integration skipped.
* Blockers: none known.
* Planning and critique state: ready; critique findings resolved.
* Review readiness: ready.
* Continuation owner: automatic RPI session.
