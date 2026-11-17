<!-- markdownlint-disable-file -->
# RPI Changes: Complete hook minimum

## Metadata

* Task ID: `complete-hook-minimum`
* Related plan: [.copilot-tracking/plans/2026-11-17/complete-hook-minimum-plan.md](../../plans/2026-11-17/complete-hook-minimum-plan.md)
* Implementation date: 2026-11-17

## Execution Status

* Status: Complete
* Declared invocation scope: full plan
* Completed scope markers: `P01`, `P01-T01`
* All remaining active-plan markers: none
* Status basis: Shared lower bound, contracts and documentation agree; all planned checks passed.

## Execution Summary

Resolve parent `RV-001` by requiring enough time for both hook phrases, without changing ordinary automatic durations or legacy defaults.

## Completed Work

### Complete returning and answering hook at the minimum duration

* Related task: `P01-T01`
* Files: [apps/api/src/dsp.ts](../../../apps/api/src/dsp.ts), [apps/api/src/contracts.ts](../../../apps/api/src/contracts.ts), [apps/api/src/melody_mcp.ts](../../../apps/api/src/melody_mcp.ts), [apps/api/tests/creative-audio.test.ts](../../../apps/api/tests/creative-audio.test.ts), [apps/api/tests/platform.test.ts](../../../apps/api/tests/platform.test.ts), [docs/melody-mcp.md](../../../docs/melody-mcp.md), [docs/service-contracts.md](../../../docs/service-contracts.md).
* Forms now require 12-30 seconds in whole bars, providing a verse, two complete hook phrases and cadence. Existing 14-20-second automatic selection and legacy 30-second defaults are unchanged.
* Existing structural checks now also exercise the minimum across four seeds; explicit 8/10-second requests reject, 12-second requests accept, and an overlong lyric window rejects independently.
* A single 12-second table row additionally verifies deterministic PCM, exact MIDI end time and note counts. Existing complete-speech rejection uses the valid shortest form.
* Validation: all 123 affected tests, workspace build/typecheck and whitespace passed.
* Parent `RV-001` resolution condition satisfied by implementation and validation. No second Review performed.

## Implementation-Time Plan Updates

* None

## Business Alignment

* None

## Validation Record

| Check | Scope | Status | Evidence or reason |
|---|---|---|---|
| Targeted tests | creative-audio, platform, web_app | Passed | 3 files, 123 tests; includes minimum structure/PCM/MIDI and sub-minimum rejection |
| Typecheck/build | workspace | Passed | `npm run typecheck`; `npm run build` |
| Whitespace | changed files | Passed | `git diff --check` |
| Full suite | parent implementation | Passed before bounded correction | 376 API tests and 9 web tests; optional PostgreSQL test skipped without test database URL; affected suites rerun afterward |
| Live Azure/listening | not automated | Unavailable | No paid provider request or subjective listening; existing 16/16/18-second instrumental previews remain unchanged |

## Pre-Review Reconciliation

* Plan markers and task-local context: current.
* Completed-work entries and handoff prose: current.
* Validation, blockers, remaining work, and follow-up items: current.
* Review readiness: child Review skipped per session default; implementation validated, not reviewed again.

## Blockers

* None

## Remaining Work

* None

## Follow-Up Items

* None

## Return-to-Caller State

Implementation Complete for full plan (`P01`, `P01-T01`); no remaining markers, blockers, plan changes, business alignment entries or follow-ups. All planned checks passed. Return to parent for acceptance assessment; this post-Review correction was validated but not reviewed again.
