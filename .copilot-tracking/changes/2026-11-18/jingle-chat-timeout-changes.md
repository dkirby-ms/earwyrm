<!-- markdownlint-disable-file -->
# RPI Changes: MCP operation deadline

## Metadata

* Task: `jingle-chat-timeout`.
* Plan: [.copilot-tracking/plans/2026-11-18/jingle-chat-timeout-plan.md](../../plans/2026-11-18/jingle-chat-timeout-plan.md).
* Origin: parent Review RV-001.

## Execution Status

Complete; full child plan, P04 and P04-T01. Child Review is skipped.

## Completed Work

### P04-T01: Keep slow bounded writers connected through completion

* [apps/api/src/jingle_tools.ts](../../../apps/api/src/jingle_tools.ts)
  now allows fifteen minutes for an MCP operation, covering the eleven-minute
  maximum provider-stage envelope with margin. Provider timeouts, retries,
  consent and API serialization are unchanged.
* [apps/api/tests/platform.test.ts](../../../apps/api/tests/platform.test.ts)
  adds one fake-time regression through the real MCP client and writer. Eleven
  stages each take fifty-nine seconds; the request stays pending past four
  minutes, then completes with exactly four generation/assessment attempts.
* [docs/service-contracts.md](../../../docs/service-contracts.md)
  documents the bounded operation deadline without implying longer individual
  provider waits.
* NFR-004 and inherited NFR-002/NFR-003 hold for the supported bounded provider
  path. No new telemetry emitter or dependency was introduced.

## Implementation-Time Plan Updates

None.

## Business Alignment

None; preserves parent NFR-002 and NFR-003.

## Validation Record

* Before correction: the new platform regression failed at its pending-after-
  four-minutes assertion under the old 240,000 ms deadline; 32 other tests passed.
* After correction:
  * `npm run typecheck`: passed, root and both workspaces.
  * `npm run test:api -- tests/platform.test.ts tests/creative-audio.test.ts tests/web_app.test.ts tests/creative-lyrics.test.ts`:
    passed, 213 tests including the new slow real-MCP regression.
  * `npm run test:web -- src/App.test.tsx`: passed, 14 tests.
  * `npm run build`: passed, root and both workspaces.
  * `git diff --check`: passed.
* Prior desktop/mobile browser evidence remains applicable: this child changes
  no UI. The temporary Vite service was stopped; the old integrated browser
  page no longer exists.
* No live paid calls, tenant changes, deployment, push or commit.

## Blockers

None.

## Remaining Work

None.

## Follow-Up Items

None.

## Pre-Review Reconciliation

Every child plan marker has implementation and validation evidence. No blockers,
remaining tasks or required follow-ups remain. Child Review is skipped by the
automatic session default: the correction was validated, not reviewed. Return
this evidence to the parent for RV-001 resolution and session acceptance.
