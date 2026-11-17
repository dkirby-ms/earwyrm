<!-- markdownlint-disable-file -->
# RPI Changes: Unified brief workspace

## Metadata

* Task ID: unified-brief-workspace
* Related plan: [.copilot-tracking/plans/2026-11-16/unified-brief-workspace-plan.md](../../plans/2026-11-16/unified-brief-workspace-plan.md)
* Implementation date: 2026-11-16

## Execution Status

* Status: Complete
* Declared scope: full plan, P01-P03
* Completed markers: P01, P01-T01, P01-T02, P02, P02-T01, P03, P03-T01, P03-T02
* Remaining markers: none
* First active item: none; review-ready

## Execution Summary

The unified brief-led workspace supports sample/manual/uploaded inputs, independent screened lyric alternatives, selected-batch optional-vocal rendering and owned run/output evaluation. Focused API/web tests, repository typechecking and the production build pass. Direct visual and participant validation remain unavailable, not implied by these checks.

## Completed Work

### Immutable custom briefs and mixed rendering

* Related task: `P01-T01`
* Files: [apps/api/src/workspace_briefs.ts](../../../apps/api/src/workspace_briefs.ts), [apps/api/src/lyrics.ts](../../../apps/api/src/lyrics.ts), [apps/api/src/web_app.ts](../../../apps/api/src/web_app.ts), [apps/api/tests/web_app.test.ts](../../../apps/api/tests/web_app.test.ts)
* Behavior: structured input validates against existing contracts; content IDs reject tampering; selected custom/sample batches share existing rendering; paid confirmation fingerprints custom contents; owner-filtered manifests recover rendered custom briefs and immutable evaluation answers.
* Validation: API typecheck Passed; HTTP and existing lyric suites Passed, 115 tests across two files.

### Explicitly authorized screened lyric alternatives

* Related task: `P01-T02`
* Files: [apps/api/src/web_app.ts](../../../apps/api/src/web_app.ts), [apps/api/tests/web_app.test.ts](../../../apps/api/tests/web_app.test.ts)
* Behavior: server-default-disabled three-option generation reuses `LyricWriter`; consent, entitlement and configuration precede provider use; duplicate slots are explicit unavailable outcomes, without hidden retries.
* Validation: focused API/lyric tests Passed; disabled and unauthorized requests construct no provider calls.

### Brief-led workspace with independent inspection and rendering

* Related task: `P02-T01`
* Files: [apps/web/src/App.tsx](../../../apps/web/src/App.tsx), [apps/web/src/BriefEditor.tsx](../../../apps/web/src/BriefEditor.tsx), [apps/web/src/index.css](../../../apps/web/src/index.css), [apps/web/src/types.ts](../../../apps/web/src/types.ts), [apps/web/src/api.ts](../../../apps/web/src/api.ts)
* Behavior: desktop collection, scoped work area and recent-run columns share one batch region; intermediate/narrow layouts retain bounded content and one detail section at a time. Input validation, session recovery, lyric consent/statuses and vocal estimate/confirmation use the real protected API paths.
* State: brief inspection does not select a batch; run inspection preserves evaluation drafts. Render completion does not replace an unfinished manual/evaluation form or open an unrelated run under the active brief. Sign-out clears identity-scoped custom drafts and private client state, with explicit storage-failure notification.
* Validation: nine web tests Passed; root typecheck and production build Passed. Browser visual validation unavailable.

### Focused acceptance checks and current runbook

* Related tasks: `P03-T01`, `P03-T02`
* Files: [apps/web/src/App.test.tsx](../../../apps/web/src/App.test.tsx), [apps/api/tests/web_app.test.ts](../../../apps/api/tests/web_app.test.ts), [docs/audio-poc/web-app.md](../../../docs/audio-poc/web-app.md)
* Behavior: updated existing navigation tests and added six web/four API cases for changed behavior, without removing tests. Coverage includes paid consent/confirmation, immutable custom snapshots, mixed rendering, safe lyric outcomes, session recovery, invalid upload, independent selection and draft preservation.
* Documentation: explains the consolidated screen, valid JSON and limits, retention boundaries, lyric enablement/paid consent, status distinctions and independent lyric drafts rather than automatic audio substitution.
* Validation: 124 focused tests Passed; root typecheck and production build Passed. No real identity/provider requests, dependency installation, migrations, deployment or remote writes.

## Implementation-Time Plan Updates

* Local implementation judgment: pin the inspected output when preserving an evaluation draft after render completion, and do not filter a brief by a newly completed unrelated run. Requirements and architecture unchanged.

## Business Alignment

* None.

## Validation Record

* Passed: `npm run typecheck --workspace @earwyrm/api`.
* Passed: `npm run test --workspace @earwyrm/api -- tests/web_app.test.ts tests/creative-lyrics.test.ts` (115 tests).
* Passed: `npm run test:web` (nine tests, including six added cases).
* Passed: `npm run typecheck`.
* Resolved check failures: test selectors assumed spaces between block labels, dialog methods were absent in jsdom, and role-query options used an unsupported property. Corrected the test environment/selectors; both checks now pass.
* Passed: final `npm run test:web` (nine tests, including render-completion context preservation).
* Passed: final focused HTTP/creative-lyric suites (115 tests).
* Passed: final `npm run typecheck` and `npm run build`.
* Browser validation: unavailable; no browser/discovery tool is exposed.
* Telemetry: existing writer/cloud spans reused; no contact data, brief text, generated text, identity or token attributes will be added.

## Pre-Review Reconciliation

* Ready: all plan markers, behavior entries, current documentation, focused checks and limitations reconciled.
* No BRD, PRD or ADR requirements are cited; Business Alignment remains none.

## Blockers

* None.

## Remaining Work

* None in the implementation plan.

## Follow-Up Items

* None.

## Return-to-Caller State

* Implementation Complete, review-ready; automatic RPI parent continues to the one planned Review.
