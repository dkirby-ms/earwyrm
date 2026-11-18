<!-- markdownlint-disable-file -->
# RPI Plan: MCP operation deadline

## Task Metadata

* Task ID and slug: `jingle-chat-timeout`.
* Plan date: 2026-11-18.

## Executive Summary

Correct the real MCP client's deadline so slow, bounded paid writers do not
time out before their supported provider stages finish. Preserve provider
bounds, explicit consent, existing retries and API serialization. Implementation
complete and validated; child Review skipped by automatic session default.

### What You May Not Know

The existing writer allows at most eleven provider posts: one preflight,
four generation/assessment pairs, and two safety posts on the accepted draft.
Each post separately bounds credentials and HTTP to thirty seconds each.
A four-minute MCP deadline is therefore shorter than a valid eleven-minute
provider envelope.

## Phase Checklist

P04 changes the deadline in [apps/api/src/jingle_tools.ts](../../../apps/api/src/jingle_tools.ts)
and adds one real-protocol regression in [apps/api/tests/platform.test.ts](../../../apps/api/tests/platform.test.ts), without changing connections.

<!-- rpi:phase id=P04 -->
### [x] P04: Preserve bounded paid operation lifetime

Goals:
* Keep the MCP request and API guard active throughout supported writer work.

Dependencies:
* Parent P01-P03 complete; Review RV-001 accepted.

Changes in the map: MCP client deadline and real-protocol regression.

<!-- rpi:task id=P04-T01 -->
#### [x] P04-T01: Cover the supported writer envelope

Goals:
* A slow valid writer crosses the old four-minute boundary without a timeout, extra retry or released API operation.

Requirements:
* `NFR-004`, inheriting parent `NFR-002` and `NFR-003`.

Details:
* Set an operation deadline beyond the eleven bounded credential/HTTP stages with explicit margin; do not extend individual provider waits or add retries.
* Use fake time and the actual `JingleTools`/MCP writer path to demonstrate a valid bounded write crossing four minutes remains pending and resolves normally. It must fail under the old deadline.
* Tests stay in the existing platform test file: one new focused case, no removals, no new tools or dependencies.
* Re-run targeted API tests, root typecheck/build and affected workspace tests; retain existing browser evidence because no UI changes.
* Production targets are source only; generated build output is not edited manually.

References:
* [apps/api/src/jingle_tools.ts](../../../apps/api/src/jingle_tools.ts): current tool deadline.
* [apps/api/src/lyric_service.ts](../../../apps/api/src/lyric_service.ts): bounded attempt loop.
* [apps/api/src/lyric_cloud.ts](../../../apps/api/src/lyric_cloud.ts): credential and HTTP bounds.
* [.copilot-tracking/reviews/logs/2026-11-18/jingle-chat-review.md](../../reviews/logs/2026-11-18/jingle-chat-review.md): RV-001.

Dependencies:
* None within this plan.

## User Decisions and Requirements

* Inherit the end-to-end local implementation boundary and exact MCP vocals.
* Agent-owned correction selected by Review RD-006. No new material user decision.
* No live paid calls, provider retry changes, deployment or new architecture.

## Planning Readiness and Next Step

Complete. The automatic parent can resolve RV-001 from the child changes record.

## Non-Functional Requirements

* NFR-004: MCP deadline exceeds the supported provider envelope; slow valid writes retain the API guard and complete normally, without changing paid consent or bounded retries.

## Risks and Open Questions

Provider latency remains bounded by existing adapters. This change does not
promise progress beyond those bounds or cover an injected provider that never
settles. No open decision or blocker.

## Sources

Parent research C5/C7 and accepted Review RV-001. No new business requirement
source or architecture change.

## Critique Disposition

Skipped by automatic child default. The parent critique is already complete;
no second critique or Review is required.

## Artifact Self-Check

One bounded correction; one regression case; no test removals or dependency
changes. Margin and slow-path behavior validated; no open acceptance blocker.

## Follow-Up Items

None.

## Handoff

P04-T01 is complete. Implementation and regression evidence are in
[.copilot-tracking/changes/2026-11-18/jingle-chat-timeout-changes.md](../../changes/2026-11-18/jingle-chat-timeout-changes.md).
Return to parent Follow-up without another critique or Review.
