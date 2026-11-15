<!-- markdownlint-disable-file -->
# RPI Changes: React/Vite Web Client

## Metadata

* Task ID: `react-vite-web`
* Related plan: [.copilot-tracking/plans/2026-11-15/react-vite-web-plan.md](../../plans/2026-11-15/react-vite-web-plan.md)
* Implementation date: `2026-11-15`

## Execution Status

* Status: Complete.
* Declared invocation scope: Full plan.
* Completed scope markers: P07, P07-T01, P08, P08-T01, P09, and P09-T01.
* All remaining active-plan markers: None.
* Status basis: The Python package move, React client, FastAPI production integration, web image, tests, and setup documentation are complete and validated.

## Execution Summary

P07-T01 moved the Python package to `src/audio_poc/` while preserving `audio_poc` imports and the existing PostgreSQL work. P08-T01 replaced the browser DOM client with a typed React/Vite workspace and focused interaction tests. P09-T01 serves the production build through FastAPI, builds assets in a Node stage while keeping Node out of the Python runtime, preserves auth and protected-storage boundaries, and removes the replaced DOM client. No legacy SQLite data will be imported.

## Completed Work

### Python package uses the src layout

* Related phase or task: P07 and P07-T01
* Files:
  * [src/audio_poc/](../../../src/audio_poc/)
  * [pyproject.toml](../../../pyproject.toml)
  * [Dockerfile](../../../Dockerfile)
  * [Dockerfile.web](../../../Dockerfile.web)
  * [.dockerignore](../../../.dockerignore)
  * `tests/test_web_navigation.cjs` (subsequently retired in P09-T01 after React workflow coverage was added)
  * [docs/service-contracts.md](../../../docs/service-contracts.md)
  * [docs/lyric-mcp.md](../../../docs/lyric-mcp.md)
  * [docs/melody-mcp.md](../../../docs/melody-mcp.md)
  * [docs/audio-poc/web-app.md](../../../docs/audio-poc/web-app.md)
* Behavior or functionality changed: Python modules now load from `src/audio_poc/` without changing the `audio_poc` import name or runtime entry points. Pytest retains both repository-root and `src` import paths, and both Python images copy the moved package. Repository fixtures, static paths, source links, and lint commands point to the new layout; no database import behavior changed.
* Validation: `uv run pytest -q` passed (271 passed, 27 skipped); Ruff check and format checks passed; `uv lock --check` passed; `uv sync --locked` and the package import check passed; both `Dockerfile` and `Dockerfile.web` images built successfully. The first pytest collection exposed a missing root import path for the existing `scripts` tests; keeping both `.` and `src` in pytest's path resolved it.

### React workspace replaces the browser DOM client

* Related phase or task: P08 and P08-T01
* Files:
  * [frontend/](../../../frontend/)
  * [frontend/public/auth-callback.html](../../../frontend/public/auth-callback.html)
  * [frontend/public/auth-callback.js](../../../frontend/public/auth-callback.js)
  * [frontend/public/vendor/](../../../frontend/public/vendor/)
* Behavior or functionality changed: The new React workspace preserves sign-in, same-origin token use, navigation state, brief selection, protected audio/evidence, evaluation, access administration, paid-render confirmation, reconciliation, and visible status/errors. It uses the existing MSAL callback and vendored scripts, and permission flags clear when an administrator edits a different subject.
* Validation: `npm ci`, `npm run typecheck`, `npm test -- --run` (3 tests), and `npm run build` passed. Tests cover keyboard activation, navigation state, permission clearing, access-denial messaging, same-origin bearer authorization, and self-revocation of administrator access.

### FastAPI serves the production React client

* Related phase or task: `P09` and `P09-T01`
* Files:
  * [src/audio_poc/web_app.py](../../../src/audio_poc/web_app.py)
  * [src/audio_poc/web_storage.py](../../../src/audio_poc/web_storage.py)
  * [Dockerfile.web](../../../Dockerfile.web)
  * [.dockerignore](../../../.dockerignore)
  * [frontend/public/](../../../frontend/public/)
  * [tests/test_web_app.py](../../../tests/test_web_app.py)
  * [tests/test_web_auth.py](../../../tests/test_web_auth.py)
  * [docs/audio-poc/web-app.md](../../../docs/audio-poc/web-app.md)
* Behavior or functionality changed: FastAPI serves the Vite build at the existing origin while retaining API routing, CSP and callback behavior; private data is rejected beneath the new static root. The web image builds frontend assets in a Node stage and copies only `frontend/dist/` into the Python runtime. The callback and licensed MSAL assets now live under `frontend/public/`, and the replaced static UI and DOM navigation test are retired.
* Validation: Locked npm install, frontend typecheck/tests/build, the full Python suite, Ruff check/format, lock consistency, Docker build, runtime image-content check, and MSAL asset checksum verification passed.

## Implementation-Time Plan Updates

### Reconcile source references after the package move

* Affected plan area or markers: P07-T01, P08-T01, P09-T01, Planning Readiness and Next Step
* What changed: Update direct source references to `src/audio_poc/`, clarify the required pytest import paths, record P07 completion, and point the next action to P08-T01.
* Why: The package now resides under `src/`; prior plan links and path descriptions no longer identify the current source files.
* Triggering evidence: The package move is present at `src/audio_poc/`; both container builds and the full Python suite pass.
* User answer or decision: None; implementation follows the confirmed `src/audio_poc/` layout and preserves the existing `audio_poc` import name.
* Reconciliation performed: Updated source links and task details, checked P07 and P07-T01, recorded validation, and advanced the implementation next action to P08-T01. Planning readiness remains Ready; critique remains skipped by child-task default.

### Advance the implementation to production integration

* Affected plan area or markers: P08-T01, P09-T01, Planning Readiness and Next Step
* What changed: Record the React/Vite client and interaction coverage, check P08 and P08-T01, and advance the next action to P09-T01.
* Why: P08's required workspace behaviors and focused tests now pass; P09 can integrate the built assets without changing the approved server boundary.
* Triggering evidence: `frontend/src/App.tsx`, `frontend/src/App.test.tsx`, and the passing frontend typecheck, tests, and production build.
* User answer or decision: None; the React client retains FastAPI and server-side authorization as selected in the plan.
* Reconciliation performed: Recorded P08 behavior and validation, updated completion markers and remaining work, and set P09-T01 as the next implementation task. Planning readiness remains Ready; critique remains skipped by child-task default.

### Reconcile current references after production integration

* Affected plan area or markers: `P09-T01`, Validation and Test Ownership, Sources, Planning Readiness and Next Step
* What changed: Mark P09 and P09-T01 complete, remove the retired DOM-navigation test from current target/source references, and point the next action to the automatic RPI parent.
* Why: Production integration and all planned validations now pass, and the removed test no longer exists as a current test boundary.
* Triggering evidence: Built React assets and callback are served by FastAPI; the web image contains built assets without Node; the full planned validation set passed.
* User answer or decision: None; this reconciles completed implementation work with the approved plan.
* Reconciliation performed: Updated completion markers, current test references, and next action; the no-migration boundary is unchanged. Planning readiness remains Ready and critique remains skipped by child-task default.

## Business Alignment

* None.

## Validation Record

| Check | Scope | Status | Evidence or reason |
|-------|-------|--------|-------------------|
| `uv sync --locked` and import | P07-T01 | Passed | Installed package imports from `src/audio_poc/__init__.py`. |
| `uv run pytest -q` | P07-T01 | Passed | 271 passed, 27 skipped; the initial pytest-path issue was corrected before the passing run. |
| `uv run ruff check src/audio_poc tests` | P07-T01 | Passed | All checks passed. |
| `uv run ruff format --check src/audio_poc tests` | P07-T01 | Passed | 38 files already formatted. |
| `uv lock --check` | P07-T01 | Passed | Lockfile is consistent. |
| Docker builds for `Dockerfile` and `Dockerfile.web` | P07-T01 | Passed | Both Python images built using the `src/audio_poc/` copy path. |
| `npm ci` | P08-T01 | Passed | Installed the pinned frontend lockfile. |
| `npm run typecheck` | P08-T01 | Passed | TypeScript project build passed. |
| `npm test -- --run` | P08-T01 | Passed | Three focused React interaction tests passed. |
| `npm run build` | P08-T01 | Passed | Vite produced production assets. |
| `npm run typecheck` | P09-T01 | Passed | TypeScript project build passed after production integration changes. |
| `npm ci` | P09-T01 | Passed | Installed the pinned frontend lockfile; npm reported no vulnerabilities. |
| `npm test -- --run` | P09-T01 | Passed | Three focused React interaction tests passed. |
| `npm run build` | P09-T01 | Passed | Vite produced the production assets used by the static-serving tests. |
| `uv run pytest -q` | P09-T01 | Passed | 271 passed and 27 skipped; static app, callback, CSP, auth, and broader Python regression coverage passed. |
| `uv run ruff check src/audio_poc tests` | P09-T01 | Passed | Ruff check passed after correcting the test import order. |
| `uv run ruff format --check src/audio_poc tests` | P09-T01 | Passed | All 38 Python files are formatted. |
| `uv lock --check` | P09-T01 | Passed | Lockfile is consistent. |
| `docker build -f Dockerfile.web -t earwyrm-web-poc .` | P09-T01 | Passed | The Node build stage generated `frontend/dist/`, copied it into the Python runtime, and built the web image. |
| Runtime image content check | P09-T01 | Passed | `/app/frontend/dist/index.html` and the callback exist, and Node is absent from the Python runtime image. |
| MSAL asset checksums | P09-T01 | Passed | Both vendored asset SHA-384 values match the documented values. |

## Pre-Review Reconciliation

* Plan markers and task-local context: Current; P07, P07-T01, P08, P08-T01, P09, and P09-T01 are checked.
* Completed-work entries and handoff prose: P07-T01, P08-T01, and P09-T01 behavior and validation evidence are recorded.
* Validation, blockers, remaining work, and follow-up items: All planned validation passed; no blockers or active-plan work remain; no follow-up items are recorded.
* Review readiness: Implementation is complete; the child Review step remains skipped by default, and the automatic RPI parent owns its next eligible gate.

## Blockers

* None.

## Remaining Work

* None.

## Follow-Up Items

* Canonical plan list: [.copilot-tracking/plans/2026-11-15/react-vite-web-plan.md](../../plans/2026-11-15/react-vite-web-plan.md), `## Follow-Up Items`
* None.

## Return-to-Caller State

* Implementation execution status: Complete.
* Declared scope and markers: Full plan; P07, P07-T01, P08, P08-T01, P09, and P09-T01 are complete.
* Validation coverage: P07 package, Python, lint/format, lock, and container checks passed; P08 and P09 locked npm install, typecheck, interaction tests, and build passed; full Python tests, Ruff check/format, lock consistency, web-image build, runtime image-content check, and MSAL checksum verification passed.
* Blockers: None.
* Current plan updates: Reconciled source paths after the package move, completed P09 markers, removed obsolete current test references, and returned the next action to the automatic RPI parent.
* Business alignment entries: None; no business source is cited by the plan.
* Planning and critique state: Plan is Ready; critique is skipped by child-task default.
* Follow-up items: None.
* Review readiness or no-handoff reason: Implementation and planned checks are complete; Review was not run under the child-task default, and the automatic RPI parent owns continuation.
* Continuation owner: Automatic RPI Agent.
