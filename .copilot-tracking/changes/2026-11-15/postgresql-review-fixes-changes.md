<!-- markdownlint-disable-file -->
# RPI Changes: PostgreSQL review fixes

## Metadata

* Task ID: `postgresql-review-fixes`
* Related plan: [.copilot-tracking/plans/2026-11-15/postgresql-review-fixes-plan.md](../../plans/2026-11-15/postgresql-review-fixes-plan.md)
* Implementation date: 2026-11-15

## Execution Status

* Status: Complete
* Declared invocation scope: Full plan
* Completed scope markers: P06, P06-T01, P06-T02
* All remaining active-plan markers: None
* Status basis: Both accepted PostgreSQL findings are implemented and the planned test, lint, and format checks passed.

## Execution Summary

P06-T01 reconciles provisioned PostgreSQL firewall rules to the approved allowlist. P06-T02 enforces verified TLS for remote explicit database URLs while preserving a narrow local-only exception.

## Completed Work

### Reconciling approved PostgreSQL firewall access

* Related phase or task: `P06-T01`
* Files:
  * [.github/workflows/deploy-web.yml](../../../.github/workflows/deploy-web.yml)
  * [scripts/deployment_gate.py](../../../scripts/deployment_gate.py)
  * [tests/test_deployment_gate.py](../../../tests/test_deployment_gate.py)
  * [docs/azure-deployment.md](../../../docs/azure-deployment.md)
* Behavior or functionality changed: The approved workflow removes only obsolete indexed app-owned firewall rules after provisioning and writer quiescence, then verifies exact allowlist inventory. Unknown rules remain untouched and cause failure; inventory and Azure-operation errors fail closed. Operator guidance distinguishes control-plane inventory from network propagation.
* Validation: `uv run pytest -q tests/test_deployment_gate.py` passed (29 tests); `uv run ruff check scripts/deployment_gate.py tests/test_deployment_gate.py` passed; `uv run ruff format --check scripts/deployment_gate.py tests/test_deployment_gate.py` passed.

### Enforcing verified TLS for explicit database URLs

* Related phase or task: `P06-T02`
* Files:
  * [audio_poc/persistence.py](../../../audio_poc/persistence.py)
  * [tests/test_postgres_storage.py](../../../tests/test_postgres_storage.py)
  * [docs/audio-poc/web-app.md](../../../docs/audio-poc/web-app.md)
* Behavior or functionality changed: Remote URLs must use `sslmode=verify-full` and an effective trusted CA; an omitted CA uses the system bundle. Only clearly local loopback or Unix-socket targets may use non-TLS settings. Unknown or conflicting host settings fail as remote, and parser errors do not reveal URL details.
* Validation: The planned `uv run pytest -q tests/test_deployment_gate.py tests/test_postgres_storage.py` passed (51 passed, 22 skipped); all 22 skips require the unconfigured `EARWYRM_TEST_DATABASE_URL`. The planned Ruff check and format check both passed.

## Implementation-Time Plan Updates

### React/Vite POC data boundary

* Affected plan area or markers: `## Follow-Up Items`
* What changed: Clarified that the queued React/Vite POC should focus on coding the new version without migrating existing data.
* Why: The user stated that legacy data migration is unnecessary for this POC.
* Triggering evidence: User request 2026-11-15.
* User answer or decision: Confirmed; do not spend effort migrating existing data for the React/Vite work.
* Reconciliation performed: Updated the follow-up scope only; active PostgreSQL finding requirements remain unchanged.
* Planning and critique state: No replanning or critique required; the clarification is limited to the follow-up item.

## Business Alignment

* None. The plan cites no approved BRD, PRD, or ADR.

## Validation Record

| Check | Scope | Status | Evidence or reason |
|-------|-------|--------|--------------------|
| `uv run pytest -q tests/test_deployment_gate.py` | P06-T01 | Passed | 29 tests passed. |
| `uv run ruff check scripts/deployment_gate.py tests/test_deployment_gate.py` | P06-T01 | Passed | No lint findings. |
| `uv run ruff format --check scripts/deployment_gate.py tests/test_deployment_gate.py` | P06-T01 | Passed | Both files are formatted. |
| `uv run pytest -q tests/test_deployment_gate.py tests/test_postgres_storage.py` | P06 | Passed | 51 passed; 22 PostgreSQL integration tests skipped because `EARWYRM_TEST_DATABASE_URL` is not configured. |
| `uv run ruff check scripts/deployment_gate.py audio_poc/persistence.py tests/test_deployment_gate.py tests/test_postgres_storage.py` | P06 | Passed | No lint findings. |
| `uv run ruff format --check scripts/deployment_gate.py audio_poc/persistence.py tests/test_deployment_gate.py tests/test_postgres_storage.py` | P06 | Passed | All four files are formatted. |

## Pre-Review Reconciliation

* Plan markers and task-local context: P06 and both task markers are complete.
* Completed-work entries and handoff prose: Both outcomes and validation results are recorded.
* Validation, blockers, remaining work, and follow-up items: Planned checks passed; 22 database integration tests skipped because the test URL is unset; no blockers.
* Review readiness: Implementation is complete. Review is skipped for this child task; Follow-up will assess the parent Review findings against these results.

## Blockers

* None.

## Remaining Work

* None within the active plan.

## Follow-Up Items

* Canonical plan list: [.copilot-tracking/plans/2026-11-15/postgresql-review-fixes-plan.md](../../plans/2026-11-15/postgresql-review-fixes-plan.md), `## Follow-Up Items`.
* Research and plan the separate React/Vite migration, including the full TypeScript boundary and the `src/audio_poc/` move, after these PostgreSQL findings are implemented and validated. For the POC, focus on coding the new version; do not spend effort migrating existing data. The parent RPI task owns that next child.

## Return-to-Caller State

* Implementation execution status: Complete.
* Declared scope and markers: Full plan; P06, P06-T01, and P06-T02 complete; no active markers remain.
* Validation coverage: Planned test, lint, and format checks passed; PostgreSQL integration tests were skipped because `EARWYRM_TEST_DATABASE_URL` is unset.
* Blockers: None.
* Current plan updates: Clarified the React/Vite follow-up's no-legacy-data-migration boundary.
* Business alignment entries: None.
* Planning and critique state: Plan is Ready; critique is skipped by child-task default.
* Follow-up items: React/Vite and the source-directory move remain a later parent-owned task.
* Review readiness or no-handoff reason: Implementation complete; Review is skipped for this child task and parent Follow-up assesses RV-001 and RV-002 against the implementation evidence.
* Continuation owner: Confirmed automatic RPI Agent.
