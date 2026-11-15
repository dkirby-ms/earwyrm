<!-- markdownlint-disable-file -->
# RPI Changes: PostgreSQL migration

## Metadata

* Task ID: `postgresql-migration`
* Related plan: [.copilot-tracking/plans/2026-11-15/postgresql-migration-plan.md](../../plans/2026-11-15/postgresql-migration-plan.md)
* Implementation date: 2026-11-15

## Execution Status

* Status: Complete
* Declared invocation scope: full plan
* Completed scope markers: P01, P01-T01, P02, P02-T01, P03, P03-T01, P04, P04-T01, P05, P05-T01
* All remaining active-plan markers: none
* Status basis: P05-T01 passed Bicep compilation, deployment-gate and connection-configuration tests, lint, formatting, and documentation reconciliation. No Azure resource was provisioned.

## Execution Summary

Both store classes can use PostgreSQL while preserving SQLite locally. The web and melody entry points use the same configured PostgreSQL store and reject an absent or incomplete initialization marker. Fresh initialization, source-preserving SQLite import, hosted infrastructure configuration, and operating guidance are implemented. Azure provisioning, live connectivity, and approved cutover remain separate deployment gates; no cloud resources were provisioned.

## Completed Work

### PostgreSQL persistence and serialization — P01-T01

* [audio_poc/persistence.py](../../../audio_poc/persistence.py), [audio_poc/web_storage.py](../../../audio_poc/web_storage.py), [audio_poc/melody_service.py](../../../audio_poc/melody_service.py), [audio_poc/web_app.py](../../../audio_poc/web_app.py), [audio_poc/cloud_web.py](../../../audio_poc/cloud_web.py), [audio_poc/__main__.py](../../../audio_poc/__main__.py), and [audio_poc/melody_mcp.py](../../../audio_poc/melody_mcp.py) support the PostgreSQL backend and transaction-scoped serialization, fail closed for an uninitialized store, and retain private media and local SQLite behavior.
* Validation: 76 PostgreSQL and SQLite integration/regression tests passed against an isolated PostgreSQL 16 container; targeted Ruff checks passed. Tests cover concurrent reservations, budget enforcement, evaluation idempotency, job identity and screening, write-failure cleanup, and a web render using PostgreSQL for both stores.

### Explicit owner bootstrap and managed access — P02-T01

* [audio_poc/web_storage.py](../../../audio_poc/web_storage.py), [audio_poc/web_auth.py](../../../audio_poc/web_auth.py), [audio_poc/web_app.py](../../../audio_poc/web_app.py), and [audio_poc/bootstrap_database.py](../../../audio_poc/bootstrap_database.py) bind application users to the verified issuer and subject, require enrollment, offer explicit operator management, and allow exactly one initial enabled administrator with paid entitlement. Bootstrap replay does not restore privileges. Paid reservations recheck entitlement under the same transaction lock used by access changes.
* [docs/audio-poc/web-app.md](../../../docs/audio-poc/web-app.md) and [.env.example](../../../.env.example) describe discovery and operator use and replace the old single-subject configuration.
* Validation: 103 targeted tests passed against isolated PostgreSQL and SQLite, including concurrent owner bootstrap, disabled and unknown users, issuer binding, replay, and revoked paid access; Ruff checks passed.

### Protected browser administration — P03-T01

* [audio_poc/web_app.py](../../../audio_poc/web_app.py) and [audio_poc/web_storage.py](../../../audio_poc/web_storage.py) enforce administrator authorization inside the read or write transaction.
* [audio_poc/web/index.html](../../../audio_poc/web/index.html) and [audio_poc/web/app.js](../../../audio_poc/web/app.js) provide management and identity discovery, show access errors, and clear selected permissions when the subject changes.
* Validation: 106 targeted Python tests passed against isolated PostgreSQL and SQLite; two Node navigation tests and Ruff checks passed. A mocked browser session verified keyboard navigation, labeled controls, success and denial feedback, unenrolled access, and permission reset on subject changes. This is not a full accessibility or screen-reader assessment.

### Controlled migration and verification — P04-T01

* Related phase or task: P04-T01
* Files:
  * [audio_poc/bootstrap_database.py](../../../audio_poc/bootstrap_database.py)
  * [tests/test_postgres_storage.py](../../../tests/test_postgres_storage.py)
  * [docs/audio-poc/web-app.md](../../../docs/audio-poc/web-app.md)
* Behavior or functionality changed: Operators can import both existing SQLite stores into an empty PostgreSQL schema. The command validates SQLite integrity, supported table layouts, JSON, ownership and foreign-key relationships, manifests, audio references, melody artifact paths and hashes. Schema creation, record copy, row-count verification, and the PostgreSQL initialization marker are one transaction. Source databases, markers, and media are retained; no cutover or destructive action occurs.
* Validation: 92 targeted PostgreSQL and regression tests passed against an isolated PostgreSQL 16 database; Ruff and formatting checks passed. The test run emitted one existing Starlette/httpx deprecation warning.

### Hosted PostgreSQL deployment and operating guide — P05-T01

* Affected files: [infra/main.bicep](../../../infra/main.bicep), [infra/main.parameters.json](../../../infra/main.parameters.json), [infra/platform.bicep](../../../infra/platform.bicep), [infra/service.bicep](../../../infra/service.bicep), [infra/postgresql.bicep](../../../infra/postgresql.bicep), [infra/keyvault-secret-reader.bicep](../../../infra/keyvault-secret-reader.bicep), [.github/workflows/deploy-web.yml](../../../.github/workflows/deploy-web.yml), [scripts/deployment_gate.py](../../../scripts/deployment_gate.py), [audio_poc/persistence.py](../../../audio_poc/persistence.py), [tests/test_deployment_gate.py](../../../tests/test_deployment_gate.py), [tests/test_postgres_storage.py](../../../tests/test_postgres_storage.py), [docs/azure-deployment.md](../../../docs/azure-deployment.md), and [docs/audio-poc/web-app.md](../../../docs/audio-poc/web-app.md).
* Behavior or functionality changed: The deployment configures a PostgreSQL Flexible Server with explicit public-IP firewall rules and provisions the password through a secure Key Vault reference. A narrowly scoped role assignment is deployed in the vault's resource group. The app uses a version-pinned secret reference and TLS hostname/certificate verification. The workflow separates preview, provision, and application deployment, keeps the app stopped until store initialization/import is verified, and rejects missing or unsafe network, vault, and secret-version settings. The guides now cover initialization/import, coordinated credential rotation, and backups/restores for both PostgreSQL records and Azure Files data.
* Validation: Bicep builds for `main.bicep`, `platform.bicep`, `postgresql.bicep`, and `keyvault-secret-reader.bicep` passed with no diagnostics. `uv run pytest -q tests/test_deployment_gate.py tests/test_postgres_storage.py` passed with 25 passed and 22 PostgreSQL integration tests skipped because `EARWYRM_TEST_DATABASE_URL` was not configured. Targeted Ruff checks and formatting passed; `git diff --check` passed. No live Azure provisioning, network egress verification, or database connectivity test was run.

## Implementation-Time Plan Updates

* Added P02, P03, and P04 guidance naming the PostgreSQL configuration, access records, and store initialization contract.

### React/Vite web migration follow-up

* Affected plan area or markers: `## Follow-Up Items`.
* What changed: Added a separate React/Vite browser-application migration, a conventional Python `src/audio_poc/` layout, and a distinct React source directory for a later RPI child task named `react-vite-web`.
* Why: This request is outside the active PostgreSQL implementation plan and needs its own Research and Plan phases.
* Triggering evidence: User requests on 2026-11-15 to move from the Python web application to React/Vite and move code from `audio_poc/` to `src/`.
* User answer or decision: The user selected `src/audio_poc/`; Research will determine the backend boundary.
* Reconciliation performed: Kept the new work outside active plan markers and completion claims; mirrored it in the session scope and follow-up tracking.
* Planning and critique state: The PostgreSQL plan remains ready; the follow-up requires its own Research and Plan.

## Business Alignment

* None.

## Validation Record

| Check | Scope | Status | Evidence or reason |
|-------|-------|--------|--------------------|
| PostgreSQL concurrency and regression tests | P01-T01 | Passed | 76 targeted PostgreSQL and SQLite tests passed against an isolated PostgreSQL 16 container |
| Storage Ruff checks | P01-T01 | Passed | Changed Python files passed Ruff |
| Authorization and operator tests | P02-T01 | Passed | 103 targeted tests passed; Ruff checks passed |
| Web administration and browser tests | P03-T01 | Passed | 106 targeted Python tests, two Node tests, Ruff, and mocked keyboard and interaction checks; no full assistive-technology assessment |
| Fresh initialization | P04-T01 | Passed | 21 focused PostgreSQL and authorization tests; target/source rejection, writer lock, rollback, marker, and schema checks |
| SQLite import and verification | P04-T01 | Passed | 92 targeted PostgreSQL and regression tests passed against isolated PostgreSQL 16, including data preservation, media integrity, import rollback, repeat-import rejection, and startup gating |
| Bicep builds | P05-T01 | Passed | `main.bicep`, `platform.bicep`, `postgresql.bicep`, and `keyvault-secret-reader.bicep` compiled with no diagnostics |
| Deployment-gate and connection configuration tests | P05-T01 | Passed | 25 passed; 22 PostgreSQL integration tests skipped because `EARWYRM_TEST_DATABASE_URL` was not configured |
| Targeted Ruff checks and formatting | P05-T01 | Passed | Changed Python source and tests passed Ruff check and format validation |
| Whitespace validation | P05-T01 | Passed | `git diff --check` |

## Pre-Review Reconciliation

* Plan markers and task-local context: current.
* Completed-work entries and handoff prose: current.
* Validation, blockers, remaining work, and follow-up items: current.
* Review readiness: ready for post-implementation Review; live provisioning and cutover remain separately approval-gated.

## Blockers

* None currently.

## Remaining Work

* No active plan markers remain. PostgreSQL implementation is ready for Review; live Azure provisioning and data cutover remain separately approval-gated.

## Follow-Up Items

* Canonical plan list: [.copilot-tracking/plans/2026-11-15/postgresql-migration-plan.md](../../plans/2026-11-15/postgresql-migration-plan.md), `## Follow-Up Items`.
* Research and plan the React/Vite browser-application migration, place the Python package at `src/audio_poc/`, and give React its own source directory after the PostgreSQL task is reviewed; determine the backend boundary during Research. Owner: RPI session; next action: create child Research task `react-vite-web`.

## Return-to-Caller State

* Implementation execution status: Complete for the full plan.
* Declared scope and markers: full plan; P01 through P05 complete.
* Validation coverage: targeted PostgreSQL, authorization, web administration, migration and deployment-gate tests; Bicep builds and Ruff checks passed. PostgreSQL integration tests for P05 were skipped because `EARWYRM_TEST_DATABASE_URL` was not configured.
* Blockers: none currently.
* Current plan updates: all active implementation markers are complete; the React/Vite web migration remains a separate follow-up.
* Business alignment entries: none.
* Planning and critique state: ready; four critique findings resolved.
* Follow-up items: React/Vite browser-application migration with Python under `src/audio_poc/`; backend boundary to be determined during Research.
* Review readiness: ready for the single post-implementation Review; no Azure resources or live data were touched.
* Continuation owner: automatic RPI session; continue to Review, then select the React/Vite child Research task.
