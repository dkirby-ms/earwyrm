<!-- markdownlint-disable-file -->
# RPI Changes: Protected audio web POC

## Metadata

* Task ID: `protected-audio-web-poc`
* Related plan: [`.copilot-tracking/plans/2026-11-12/protected-audio-web-poc-plan.md`](../../plans/2026-11-12/protected-audio-web-poc-plan.md)
* Implementation date: 2026-11-12

## Execution Status

* Status: Complete
* Declared invocation scope: Full plan
* Completed scope markers: `P01`, `P01-T01`, `P01-T02`, `P02`, `P02-T01`, `P03`, and `P03-T01`
* All remaining active-plan markers: None
* Status basis: The local POC, setup guide, full test suite, static checks, setup-boundary smoke checks, and fake-identity browser workflows are complete. Deployment, real tenant sign-in, and paid Speech remain outside the approved boundary.

## Execution Summary

The approved local POC now has a fail-closed External ID API, protected rendering and evaluation workflows, owner-only local evidence storage, a same-origin signed-in browser workflow, and local setup guidance. Planned validation passed without contacting an External ID tenant or Speech service.

## Completed Work

### P01-T01: Protecting the brief-list API

The local API now exposes non-sensitive health and browser configuration endpoints plus `GET /api/briefs`, protected by RS256 access-token signature, issuer, audience, expiry, subject, and delegated-scope checks. Discovery metadata and JWKS are fetched only after complete HTTPS configuration; unsupported issuer, algorithm, JWKS origin, or unusable RSA signing keys keep setup unavailable. The browser configuration response contains only client ID, authority, scope prefix, and setup status. Expected-answer data and generation scripts are excluded from brief responses.

* Files: [audio_poc/web_auth.py](../../../audio_poc/web_auth.py), [audio_poc/web_app.py](../../../audio_poc/web_app.py), [tests/test_web_auth.py](../../../tests/test_web_auth.py), [pyproject.toml](../../../pyproject.toml), [uv.lock](../../../uv.lock)
* Validation: `uv run pytest -q tests/test_web_auth.py tests/test_audio_poc.py` passed (40 tests); `uv run ruff check audio_poc/web_auth.py audio_poc/web_app.py tests/test_web_auth.py` passed; `uv run ruff format --check audio_poc/web_auth.py audio_poc/web_app.py tests/test_web_auth.py` passed. The test run reports one upstream Starlette/httpx deprecation warning.

### P01-T02: Retaining protected renders and evaluation evidence

The API now renders selected briefs with their canonical source indices, stores generated WAVs and evidence in a private SQLite-backed data root, and scopes outputs, run recovery, downloads, evaluation, and usage reconciliation to the authenticated subject. Evaluation is immutable and returns only match results; the three-brief rollup remains Pending for missing outputs/evidence and fails when any measured output fails. Paid rendering stays disabled unless explicitly enabled with a subject allowlist, server-side credentials, valid non-placeholder rate/resource evidence, per-run and cumulative limits, and a matching selected-brief/server-estimate confirmation. A durable attempt must be reconciled before another paid attempt.

* Files: [audio_poc/web_app.py](../../../audio_poc/web_app.py), [audio_poc/web_storage.py](../../../audio_poc/web_storage.py), [tests/test_web_app.py](../../../tests/test_web_app.py), [.gitignore](../../../.gitignore)
* Validation: `uv run pytest -q tests/test_web_auth.py tests/test_web_app.py tests/test_audio_poc.py` passed (57 tests); targeted `ruff check` and `ruff format --check` passed; `git check-ignore -v .earwyrm-data/earwyrm.sqlite3` confirmed the private data path is ignored. The test run reports one upstream Starlette/httpx deprecation warning.

### P02-T01: Delivering the signed-in brief workflow

* Related phase or task: `P02`, `P02-T01`
* Files:
  * [audio_poc/web/index.html](../../../audio_poc/web/index.html)
  * [audio_poc/web/styles.css](../../../audio_poc/web/styles.css)
  * [audio_poc/web/app.js](../../../audio_poc/web/app.js)
  * [audio_poc/web/vendor/msal-browser.min.js](../../../audio_poc/web/vendor/msal-browser.min.js)
  * [audio_poc/web/vendor/LICENSE](../../../audio_poc/web/vendor/LICENSE)
  * [audio_poc/web_auth.py](../../../audio_poc/web_auth.py)
  * [audio_poc/web_app.py](../../../audio_poc/web_app.py)
  * [audio_poc/web_storage.py](../../../audio_poc/web_storage.py)
  * [tests/test_web_auth.py](../../../tests/test_web_auth.py)
  * [tests/test_web_app.py](../../../tests/test_web_app.py)
* Behavior or functionality changed: A same-origin MSAL client now supports setup-needed and configured states, requests exact route scopes, and drives brief selection, offline rendering, comparison, immutable evaluation, protected audio/evidence loading and downloads, and recovery-oriented run status. A generic API busy status now disables paid rendering for every user while any paid attempt remains unreconciled, without exposing another user's attempt. The client keeps bearer tokens out of URLs and never renders expected answers.
* Validation: `uv run pytest -q tests/test_audio_poc.py tests/test_web_auth.py tests/test_web_app.py` passed (60 tests; one upstream Starlette/httpx deprecation warning). Targeted Ruff lint/format checks and `node --check audio_poc/web/app.js` passed. A local Chromium acceptance run with fake MSAL and API responses passed setup-needed/configured startup, CSP, exact scopes, bearer headers, offline render, status announcements, keyboard sign-in with visible focus, protected audio/evidence fetches and downloads, evaluation immutability, and token/answer non-leakage. No tenant or Speech endpoint was contacted.

### P03-T01: Documenting setup boundaries and verifying the local POC

* Related phase or task: `P03`, `P03-T01`
* Files: [docs/audio-poc/web-app.md](../../../docs/audio-poc/web-app.md)
* Behavior or functionality changed: Added local setup instructions for the existing External ID registration, proposed API scopes, the pinned MSAL asset and CSP, server-side secret handling, private local SQLite/audio storage, manual retention, and default-off Speech safeguards. The guide keeps tenant changes, deployment, resource creation, and spending as separate decisions.
* Validation: `uv run pytest -q` passed (60 tests; one upstream Starlette/httpx deprecation warning). Ruff lint and format, `node --check audio_poc/web/app.js`, `uv lock --check`, `uv sync --locked`, and the private-data ignore check passed. Both local servers returned `200` from `/healthz`, reported `setup-needed` from `/api/config`, and returned `503` from protected `/api/briefs`. Corrected fake-identity Chromium acceptance passed keyboard sign-in, brief selection, offline rendering, comparison/status, protected audio playback and downloads, transcript/rating submission, protected evidence loading/download, visible focus, and live announcements. The separate fake long-running paid-attempt acceptance also passed recovery/busy-state checks with no retry or cancellation. No real tenant, token, or Speech call was made.

## Implementation-Time Plan Updates

### Synchronizing plan markers and change map

* Affected plan area or markers: Phase Checklist and Planning Readiness and Next Step
* What changed: Added unchecked phase/task markers and identity comments, made both flow maps parser-compatible with outlined phase boxes, and set the next action to `P01-T01`
* Why: RPI implementation navigation requires explicit unchecked markers; the workflow canvas reported unreadable phases and Mermaid lines
* Triggering evidence: Canvas source warnings before the update; after a refresh, `source.warnings` is empty; the planning template's marker and diagram contract
* User answer or decision: None
* Reconciliation performed: All phase/task markers remain unchecked; the change map tags and planning readiness remain consistent; no business-source requirements are cited
* Planning and critique state: Plan implementation-ready; initial standard critique execution Complete with verdict Revise and all 22 findings directly resolved

### Adding a protected product route for auth validation

* Affected plan area or markers: `P01-T01`, `PC-003`
* What changed: Added the protected `GET /api/briefs` route and `FR-002` to the auth task so configured test tokens reach a real product endpoint
* Why: Exercise the configured token-to-scope path without introducing a test-only API route
* Triggering evidence: `PC-003` requires configured sign-in and scoped API access coverage
* User answer or decision: None
* Reconciliation performed: Added the task requirement and `audio_poc/__main__.py` reference; retained the existing `P01-T02` rendering work and updated the critique disposition
* Planning and critique state: The initial critique remains complete; no follow-up critique was requested or run

### Moving the MSAL contract test to the browser task

* Affected plan area or markers: `P01-T01`, `P02-T01`, and `PC-003`
* What changed: Kept API token and scope validation in `P01-T01`; assigned the fake MSAL scope/token contract to the browser workflow validation in `P02-T01` and `P03-T01`.
* Why: The API task has no SPA to exercise, while `P02-T01` already owns the configured MSAL client and fake-browser contract.
* Triggering evidence: `P02-T01` specifies the exact configured full scope request and authenticated API call; P01-T01's protected `GET /api/briefs` independently verifies API authorization.
* User answer or decision: None
* Reconciliation performed: Updated the PC-003 disposition to point to the browser task; the test remains required before full-plan completion.
* Planning and critique state: The initial critique remains complete; no follow-up critique was requested or run.

## Business Alignment

* None

## Validation Record

| Check | Scope | Status | Evidence or reason |
|---|---|---|---|
| Auth/API and renderer tests | `P01-T01` | Passed | `uv run pytest -q tests/test_web_auth.py tests/test_audio_poc.py` — 40 passed; one upstream Starlette/httpx deprecation warning |
| Auth/storage/API and renderer tests | `P01-T02` | Passed | `uv run pytest -q tests/test_web_auth.py tests/test_web_app.py tests/test_audio_poc.py` — 57 passed; one upstream Starlette/httpx deprecation warning |
| API, authentication, and renderer regression tests | `P02-T01` | Passed | `uv run pytest -q tests/test_audio_poc.py tests/test_web_auth.py tests/test_web_app.py` — 60 passed; one upstream Starlette/httpx deprecation warning |
| Targeted Ruff lint and format; frontend syntax | `P02-T01` | Passed | `uv run ruff check ...`, `uv run ruff format --check ...`, and `node --check audio_poc/web/app.js` |
| Fake-identity browser acceptance | `P02-T01` | Passed | Local Chromium with fake MSAL and API responses exercised setup-needed and configured startup, scopes, offline workflow, evaluation, protected media/evidence, keyboard focus, and no-leak checks; no tenant or Speech calls |
| Ruff lint | `P01-T01`, `P01-T02` | Passed | Targeted `uv run ruff check` over the changed auth, storage, API, and test files |
| Ruff format | `P01-T01`, `P01-T02` | Passed | Targeted `uv run ruff format --check` over the changed auth, storage, API, and test files |
| Private data ignore | `P01-T02` | Passed | `git check-ignore -v .earwyrm-data/earwyrm.sqlite3` |
| Full test suite | `P03-T01` | Passed | `uv run pytest -q` — 60 passed; one upstream Starlette/httpx deprecation warning |
| Lint, formatting, and frontend syntax | `P03-T01` | Passed | `uv run ruff check audio_poc tests`, `uv run ruff format --check audio_poc tests`, and `node --check audio_poc/web/app.js` |
| Dependency lock and sync | `P03-T01` | Passed | `uv lock --check` and `uv sync --locked` |
| Private data ignore | `P03-T01` | Passed | `git check-ignore -v .earwyrm-data/earwyrm.sqlite3` |
| Setup-boundary endpoints | `P03-T01` | Passed | Ports 8787 and 8788: `/healthz` returned 200, `/api/config` reported `setup-needed`, and `/api/briefs` returned 503 |
| Fake-identity keyboard browser acceptance | `P03-T01` | Passed | Local Chromium with corrected fake API routing completed setup-needed/configured startup and the offline brief-to-evaluation-and-download path, with exact scopes, bearer headers, visible focus, and announced statuses; no external calls |
| Fake long-running paid-attempt recovery | `P03-T01` | Passed | Local fake attempt verified visible busy/reconciliation state, reload recovery, disabled paid rendering, and one POST with no retry or cancellation |

## Pre-Review Reconciliation

* Plan markers and task-local context: Current; all phases and tasks are checked
* Completed-work entries and handoff prose: Current; API/storage, browser, setup guide, validation outcomes, and scope boundaries are recorded
* Validation, blockers, remaining work, and follow-up items: All planned checks passed; no implementation blockers or follow-up items remain
* Review readiness: Ready for the single post-implementation Review

## Blockers

* None for the local implementation. Real tenant sign-in requires later local configuration; paid Speech remains disabled pending a separate user decision.

## Remaining Work

* None

## Follow-Up Items

* Canonical plan list: [`.copilot-tracking/plans/2026-11-12/protected-audio-web-poc-plan.md`](../../plans/2026-11-12/protected-audio-web-poc-plan.md), `## Follow-Up Items`
* None

## Return-to-Caller State

* Implementation execution status: Complete for the full plan
* Declared scope and markers: Full plan; all markers are checked
* Validation coverage: Full pytest suite, Ruff lint/format, frontend syntax, lock/sync, private storage ignore, setup-boundary endpoints, and fake-identity browser acceptance passed
* Blockers: None for the local build
* Current plan updates: Checklist markers and change map synchronized
* Business alignment entries: None; no BRD, PRD, or ADR requirements are cited
* Planning and critique state: Plan ready; all 22 initial critique findings resolved
* Follow-up items: None
* Review readiness or no-handoff reason: Ready for the single post-implementation Review
* Continuation owner: Confirmed automatic RPI Agent
