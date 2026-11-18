<!-- markdownlint-disable-file -->
# RPI Changes: Paid cloud AI

## Metadata

* Task ID: `paid-cloud-ai`
* Related plan: [.copilot-tracking/plans/2026-11-18/paid-cloud-ai-plan.md](../../plans/2026-11-18/paid-cloud-ai-plan.md)
* Implementation date: 2026-11-18

## Execution Status

Complete; full plan declared and both tasks validated. No repository implementation blockers.

## Completed Work

### Paid text is reserved before provider work

* Related markers: `P01`, `P01-T01`.
* [apps/api/src/web_app.ts](../../../apps/api/src/web_app.ts), [apps/api/src/lyric_budget.ts](../../../apps/api/src/lyric_budget.ts), and [apps/api/src/web_storage.ts](../../../apps/api/src/web_storage.ts) gate chat and lyrics on a durable per-action and cumulative budget. Transport limits are enforced in [apps/api/src/lyric_cloud.ts](../../../apps/api/src/lyric_cloud.ts).
* Validation: 120 targeted tests passed, including atomic admission and adapter limits. API build passed. Existing traces are retained; reservations store no request content or user identifiers.

### Cloud features are independently opt-in

* Related markers: `P02`, `P02-T01`.
* [infra/service.bicep](../../../infra/service.bicep) and [.github/workflows/deploy-web.yml](../../../.github/workflows/deploy-web.yml) wire existing AI resources, the Speech Key Vault reference, and model managed identity. [docs/azure-deployment.md](../../../docs/azure-deployment.md) documents rollout.
* Validation: clean Bicep compilation and a local mock of default-off, both independent opt-ins, and invalid settings rejection.

## Validation Record

| Check | Result |
|---|---|
| Workspace production build and whitespace | Passed |
| Web, lyric provider, storage and deployment suites | 219 passed; opt-in real PostgreSQL harness skipped without an approved isolated URL |
| Cloud configuration compilation and mocked workflow | Passed |
| Live Azure deploy, RBAC, and paid smoke | Not run; requires concrete configuration, evidence and approval |

## Pre-Review Reconciliation

Both plan tasks have evidence; review scope is the repository changes, not live enablement.

## Business Alignment

* None.

## Return-to-Caller State

Complete and ready for Review. No remaining active plan markers, no business alignment entries, and no required repository follow-ups known. Live rollout remains separately gated.
