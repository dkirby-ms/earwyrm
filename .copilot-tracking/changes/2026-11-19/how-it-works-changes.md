<!-- markdownlint-disable-file -->
# RPI Changes: How it works

## Metadata

* Task ID: `how-it-works`
* Related plan: [.copilot-tracking/plans/2026-11-19/how-it-works-plan.md](../../plans/2026-11-19/how-it-works-plan.md)
* Implementation date: 2026-11-19

## Execution Status

* Status: Complete
* Declared invocation scope: full plan
* Completed scope markers: `P01`, `P01-T01`, `P01-T02`
* All remaining active-plan markers: none
* Status basis: implementation, test suite, build, and desktop/narrow browser checks are complete.

## Execution Summary

The signed-in workspace includes two accessible architecture diagrams with concise explanations and a link from the web guide.

## Completed Work

### Architecture view and workspace navigation

* Related phase or task: `P01-T01`
* Files: [apps/web/src/App.tsx](../../../apps/web/src/App.tsx), [apps/web/src/HowItWorks.tsx](../../../apps/web/src/HowItWorks.tsx), [apps/web/src/index.css](../../../apps/web/src/index.css).
* Behavior or functionality changed: ready workspace users can open a dedicated view explaining the logical components and representative Azure deployment, then return to the preserved workspace.
* Validation: web build and type-check passed; behavior and browser validation follow in `P01-T02`.

### Navigation and responsive verification

* Related phase or task: `P01-T02`
* Files: [apps/web/src/App.test.tsx](../../../apps/web/src/App.test.tsx), [docs/audio-poc/web-app.md](../../../docs/audio-poc/web-app.md).
* Behavior or functionality changed: focused tests cover non-admin navigation, focus, diagram labels, restored selection and access-denied visibility; the guide identifies the new view.
* Validation: web tests passed (28 tests), production build passed, and browser inspection passed at 1440px and 320px with mocked identity/API. No page-level horizontal overflow was measured.

## Implementation-Time Plan Updates

* Added a `P01-T02` guidance link to the new view component for test context; no requirement changed.

## Business Alignment

* None.

## Validation Record

| Check | Scope | Status | Evidence or reason |
|---|---|---|---|
| Web test suite | `P01` | Passed | `npm run test:web`: 28 tests |
| Web build | `P01` | Passed | `npm run build --workspace @earwyrm/web` |
| Desktop and 320px browser inspection | `P01` | Passed | Playwright, mocked identity and API; page scroll width equals client width at both sizes |
| Diff whitespace | `P01` | Passed | `git diff --check` |

## Pre-Review Reconciliation

* Plan markers and task-local context: current.
* Completed-work entries and handoff prose: current.
* Validation, blockers, remaining work, and follow-up items: current.
* Review readiness: ready.

## Blockers

* None.

## Remaining Work

* None.

## Follow-Up Items

* Canonical plan list: [.copilot-tracking/plans/2026-11-19/how-it-works-plan.md](../../plans/2026-11-19/how-it-works-plan.md), `## Follow-Up Items`.
* None.

## Return-to-Caller State

* Implementation execution status: Complete, full plan.
* Validation coverage: tests and build passed; desktop and narrow browser inspection passed with mocked services.
* Blockers: none.
* Business alignment entries: none.
* Planning and critique state: ready; PC-001 resolved in plan.
* Review readiness: ready.
* Continuation owner: automatic RPI session.
