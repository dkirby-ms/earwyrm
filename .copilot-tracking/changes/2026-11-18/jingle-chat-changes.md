<!-- markdownlint-disable-file -->
# RPI Changes: Jingle chat

## Metadata

* Task ID: `jingle-chat`
* Related plan: [.copilot-tracking/plans/2026-11-18/jingle-chat-plan.md](../../plans/2026-11-18/jingle-chat-plan.md)
* Implementation date: 2026-11-18

## Execution Status

Complete, full-plan invocation. `P01-T01`, `P02-T01` and `P03-T01` checked. Review-ready.

## Execution Summary

Implement real MCP conversation, protected composition previews, exact-artifact vocals and advertiser-scoped chat. No live paid calls or deployment.

## Completed Work

### Real MCP advice, writing and committed resources

* Related task: `P01-T01`.
* Files: [apps/api/src/jingle_chat.ts](../../../apps/api/src/jingle_chat.ts), [apps/api/src/jingle_tools.ts](../../../apps/api/src/jingle_tools.ts), [apps/api/src/lyric_mcp.ts](../../../apps/api/src/lyric_mcp.ts), [apps/api/src/lyric_cloud.ts](../../../apps/api/src/lyric_cloud.ts), [apps/api/src/lyrics.ts](../../../apps/api/src/lyrics.ts), [apps/api/src/lyric_service.ts](../../../apps/api/src/lyric_service.ts).
* Behavior: bounded screened advice is a real MCP tool; writer direction joins safety preflight. SDK clients own linked transports, strict results and digest-checked resource loading. Dictionary-counted orthographic timing preserves every lyric word.
* Validation: API typecheck and 114 existing lyric/platform tests passed. New protocol discussion/screening regression included in subsequent targeted run.

### Protected previews and exact-arrangement vocals

* Related task: `P02-T01`.
* Files: [apps/api/src/web_app.ts](../../../apps/api/src/web_app.ts), [apps/api/src/render.ts](../../../apps/api/src/render.ts), [apps/api/src/speech.ts](../../../apps/api/src/speech.ts).
* Behavior: paid discussion/writing require literal consent and existing entitlement. Owner-scoped accepted lyrics build one recoverable protected preview through MCP. Estimates bind job/digest and lyrics. Voice rendering consumes committed backing, MIDI, score and vocal timing without recomposition, resizing or self-screening. Existing ordinary rendering remains covered.
* Validation: API typecheck and 129 protocol/audio/web API tests passed. New tests exercise consent, cross-owner denial, held drafts, lost-response/completed-status recovery, exact paid selection and actual fixed-timing voice rendering.

### Advertiser-scoped collaboration in Create

* Related task: `P03-T01`.
* Files: [apps/web/src/App.tsx](../../../apps/web/src/App.tsx), [apps/web/src/types.ts](../../../apps/web/src/types.ts), [apps/web/src/index.css](../../../apps/web/src/index.css), [apps/web/src/App.test.tsx](../../../apps/web/src/App.test.tsx), [docs/service-contracts.md](../../../docs/service-contracts.md), [docs/audio-poc/web-app.md](../../../docs/audio-poc/web-app.md), [.env.example](../../../.env.example).
* Behavior: bounded page-memory conversations and editable directions are separate per advertiser and clear on sign-out. Each chat/write action consumes fresh consent, reports failures and never renders automatically. Accepted drafts build protected previews; Listen offers exact-arrangement voice estimates with job/lyric selection retained through paid confirmation. Existing three-option and ordinary voice paths remain.
* Validation: 14 workspace UI tests passed, including advertiser isolation, sign-out cleanup, refusal/retry consent, exact estimate/confirmation and existing flows. Browser workflow at 1440px and 390px passed using injected auth/API responses, without horizontal overflow or page exceptions. Desktop/mobile screenshots inspected.
* Design: inherited Campaign Color typography retained. The value-specific Helvetica detector exception records this in [.impeccable/config.json](../../../.impeccable/config.json); no broad detector rule disabled.

## Implementation-Time Plan Updates

* Added P03 guidance for the concrete chat API and exact composition-selection handoff.
* Multiline multi-turn protocol validation exposed that conversation cannot replace a single-line brief tone. Preflight now receives the full bounded conversation separately; no truncation or duplicate conversation classifier.
* Both spoken and vocoded committed mixes use the exact syllable timeline. Ordinary uncommitted spoken placement remains unchanged.

## Business Alignment

* None.

## Validation Record

* Passed: `npm run typecheck`.
* Passed: `npm run test:api -- tests/platform.test.ts tests/creative-audio.test.ts tests/web_app.test.ts tests/creative-lyrics.test.ts` (212 tests).
* Passed: `npm run test:web -- src/App.test.tsx` (14 tests).
* Passed: `npm run build`.
* Passed: browser chat-to-preview-to-exact-voice-estimate workflow, advertiser isolation and mobile overflow check. Browser API and identity were injected; actual MCP and DSP were exercised separately in API/audio tests.
* Passed: interrupted preview publication, completed-status repair, missing/changed preview rejection before Speech, exact MIDI/score/timing, fixed duration and spoken mix comparison.
* Not run: live paid provider calls, tenant changes, deployment and real-listener broadcast approval. These remain outside the approved local implementation boundary.
* Browser automation tooling was missing; restored only in session storage. No dependency manifest or lockfile changed.

## Pre-Review Reconciliation

Ready. All plan markers have implementation and validation evidence; no task-specific external BRD/PRD/ADR deviation or unresolved blocker. One post-implementation Review remains.

## Blockers

None.

## Remaining Work

None for implementation. Required Review is next.

## Follow-Up Items

None.

## Return-to-Caller State

Automatic parent, full-plan implementation complete and review-ready. No user action required.
