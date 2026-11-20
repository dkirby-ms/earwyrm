<!-- markdownlint-disable-file -->
# RPI Changes: Generation validation

Task ID: generation-validation. Scope: full P01 and P02 plan. Status: Complete.

## Execution Status

* Status: Complete
* Declared invocation scope: full plan
* Completed scope markers: P01, P01-T01, P01-T02, P01-T03, P02, P02-T01
* All remaining active-plan markers: none
* Status basis: all four reported findings and required RV-001 have implementation and passing validation evidence

## Implementation-Time Plan Updates

P02 appended and completed for accepted required RV-001. P01 remains complete. The initial review found that edge whitespace bypasses fixed checks but fails every draft. No new scope, critique or repeat review; local correction within prior finding targets.
Plan: [generation-validation-plan.md](../../plans/2026-11-20/generation-validation-plan.md), Ready; standard critique Pass.

## Summary

Implement fixed-text validation, explicit pronunciation hints, contextual keyword handling and punctuation-normalized lexical/speech copies. Existing dirty generation-flow changes are retained.

## Completed Work

### P01-T01: Fixed text and lexical normalization

Fixed brand/CTA pronunciation and meter defects reject before generation; short spoken CTAs require a 16-syllable total. Lexical and render-input copies normalize common punctuation while exact draft text is retained.
Files: [apps/api/src/lyrics.ts](../../../apps/api/src/lyrics.ts), [apps/api/src/lyric_service.ts](../../../apps/api/src/lyric_service.ts), [apps/api/src/web_app.ts](../../../apps/api/src/web_app.ts).
Validation: creative-lyrics suite passed, 111 tests; initial fixture-count failures corrected from actual dictionary evidence.

## Validation

* Passed: affected API suites (`creative-lyrics.test.ts`, `web_app.test.ts`), 195 tests.
* Passed: browser `App.test.tsx`, 21 tests.
* Passed: `npm run typecheck`, all workspaces and root scripts.
* Passed: `npm run build`, all workspaces and root scripts.
* Passed after final local guard preservation: creative-lyrics suite (111 tests) and API build. Existing risk keywords remain unchanged except the free-to idiom.
* Passed: isolated mocked browser at 1280x900 and 390x844; native disclosure keyboard toggle, 16px field text, no horizontal overflow, visible labels/help/focus. No real provider calls.
* Passed after P02: affected API suites, 199 tests; `npm run typecheck`; `npm run build --workspace @earwyrm/api`.
* Browser suite remains valid: no browser source changed in P02. Total focused API/browser cases: 220.

## Remaining Work

None in P01 or P02. Required acceptance finding RV-001 is resolved with validation, without a repeat review.

## Blockers and Follow-Up Items

None.

## Business Alignment

No cited BRD/PRD/ADR changes.

### P01-T02: Pronunciation hints and contextual gates

Browser optional disclosure accepts explicit brand-token dictionary spellings and retains input on failure. The API derives/stores strict ARPABET overrides and reports fixed failures specifically. Ordinary sound comparisons and invitations use contextual evidence; screening, refusals and human holds remain required.
Files: [apps/web/src/App.tsx](../../../apps/web/src/App.tsx), [apps/api/src/lyrics.ts](../../../apps/api/src/lyrics.ts), [apps/api/src/lyric_cloud.ts](../../../apps/api/src/lyric_cloud.ts), [apps/api/src/lyric_service.ts](../../../apps/api/src/lyric_service.ts), [apps/api/src/web_app.ts](../../../apps/api/src/web_app.ts), [apps/api/src/jingle_diagnostics.ts](../../../apps/api/src/jingle_diagnostics.ts).
Validation: API/browser regression suites and typecheck passed.

### P01-T03: Regression evidence and user guidance

Tests cover short/fixed invalid CTAs, hint acceptance/failure, punctuation provenance and submitted speech, and contextual flags. The web guide documents constraints and pronunciation limits.
Files: [apps/api/tests/creative-lyrics.test.ts](../../../apps/api/tests/creative-lyrics.test.ts), [apps/api/tests/web_app.test.ts](../../../apps/api/tests/web_app.test.ts), [apps/web/src/App.test.tsx](../../../apps/web/src/App.test.tsx), [docs/audio-poc/web-app.md](../../../docs/audio-poc/web-app.md).
Validation: 216 tests passed, workspace build/typecheck and isolated browser checks passed.

## Pre-Review Reconciliation

Full P01 completion evidence exists. No blockers, unresolved business alignment or selected follow-ups; initial acceptance and refinement reviews are eligible.
Telemetry: existing create.lyrics server span and content-free outcome/request-failed logs are reused. Only bounded allowlisted reason values were added; no new attributes or emitters, and hint/brand/CTA content is dropped from diagnostics.

### P02-T01: Stop immutable format failures before retries

Fixed brand/CTA edge whitespace, normalized format and expanded punctuation length reject with zero opening attempts. Exact text is not trimmed. Actionable API feedback and guide text describe the format requirement. Parameterized cases verify no preflight/generation, no composition/speech in the browser route, and the spoken total boundary of 15 rejected versus 16 accepted.
Files: [apps/api/src/lyrics.ts](../../../apps/api/src/lyrics.ts), [apps/api/src/web_app.ts](../../../apps/api/src/web_app.ts), [apps/api/src/jingle_diagnostics.ts](../../../apps/api/src/jingle_diagnostics.ts), [apps/api/tests/creative-lyrics.test.ts](../../../apps/api/tests/creative-lyrics.test.ts), [apps/api/tests/web_app.test.ts](../../../apps/api/tests/web_app.test.ts), [docs/audio-poc/web-app.md](../../../docs/audio-poc/web-app.md).
Validation: affected API suites 199 passed, workspace typecheck and API build passed. Resolves RV-001; changes remain localized to accepted targets.

## Follow-up Reconciliation

P01 and P02 complete; no required findings or blockers remain. Initial acceptance/refinement records are reused, with completion decisions appended after P02 validation rather than a second review. Owned browser page is closed, Vite stopped and four named scratch files removed. No deployment, commits, pushes or paid provider calls.
