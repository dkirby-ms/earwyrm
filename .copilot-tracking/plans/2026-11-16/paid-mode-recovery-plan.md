<!-- markdownlint-disable-file -->
# RPI Plan: Paid mode recovery

## Task Metadata

* Task ID: paid-mode-recovery
* Parent task: unified-brief-workspace
* Plan date: 2026-11-16

## Executive Summary

Correct accepted parent Review finding `RV-001`: unavailable paid rendering must not prevent deselecting vocals and using offline previews. Reuse existing state and one focused paid-flow test; no API or spending-boundary change.
Planning is Complete and Ready; no unresolved decision or evidence gap remains.

### What You May Not Know

This is the session's required correction, not a second Review. The change will be regression-tested and built; no additional review is requested.

## Phase Checklist

`P04` changes the batch-mode gate in [apps/web/src/App.tsx](../../../apps/web/src/App.tsx) and its existing regression case in [apps/web/src/App.test.tsx](../../../apps/web/src/App.test.tsx); no parts or connections are added.

<!-- rpi:phase id=P04 -->
### [x] P04: Preserve independent offline rendering

Goals:
* Users can leave an unavailable paid mode without bypassing any paid safeguard.

Dependencies:
* None within this child; the parent's workspace implementation is complete.

Changes in the map: batch-mode gate and existing paid-flow test.

<!-- rpi:task id=P04-T01 -->
#### [x] P04-T01: Restore paid-to-offline mode switching

Goals:
* An unresolved paid attempt blocks another vocal dispatch while leaving instrumental rendering reachable.

Requirements:
* `FR-006`, `NFR-005`; parent `RV-001`.
* Regression demonstrates the selected vocal state becoming unavailable after paid dispatch, then turning it off and submitting `mode: instrumental`.

Details:
* Preserve the primary-action paid check, reconciliation behavior and busy gate.
* Extend the existing optional-vocals test in [apps/web/src/App.test.tsx](../../../apps/web/src/App.test.tsx); test ownership stays there. No test removals or new cases, dependencies or generated-file edits.
* First confirm the extended test fails on the gate, then correct the gate and run `npm run test:web`, `npm run typecheck` and `npm run build`.
* Parent API test evidence remains applicable because API code is unchanged. Direct visual evidence remains unavailable.

References:
* [apps/web/src/App.tsx](../../../apps/web/src/App.tsx): `paidAvailable`, `includeVocals` and batch controls.
* [apps/web/src/App.test.tsx](../../../apps/web/src/App.test.tsx): fake paid-flow and dialog patterns.
* [.copilot-tracking/reviews/logs/2026-11-16/unified-brief-workspace-review.md](../../reviews/logs/2026-11-16/unified-brief-workspace-review.md): accepted finding `RV-001`.

Dependencies:
* None.

## User Decisions and Requirements

* Inherited automatic end-to-end authorization, approved workspace scope and paid safeguards.
* Planning participation: agent-owned, inherited.
* Accepted finding: parent `RV-001`, routed by `RD-003` through `RD-007`.
* No unresolved significant decision; no extra approval needed to preserve the existing offline path.

## Planning Readiness and Next Step

* Planning execution: Complete.
* Readiness: Ready; single narrow task and validation ownership recorded.
* Evidence: parent research C1/C2 and accepted source-backed finding establish cause and intended behavior.
* Blockers: none.
* Resolved plan path: this artifact.

## Goals

Keep offline rendering usable when optional paid vocals become unavailable.

## Scope and Non-Goals

* Scope: existing client mode gate and paid-flow regression test.
* Non-goals: API changes, ledger bypass, another critique or Review, deployment, provider calls, paid spending or unrelated cleanup.

## Functional Requirements

* `FR-006`: selected but unavailable vocals can be deselected; available offline rendering can then be dispatched.

## Non-Functional Requirements

* `NFR-005`: unavailable paid dispatch remains blocked; busy actions remain locked; existing focused web tests, typecheck and production build pass.

## Risks and Open Questions

* `P04-T01`: a broad gate change could accidentally enable paid dispatch. Preserve the existing primary-action paid check and test it before switching modes.

## Sources

* [.copilot-tracking/reviews/logs/2026-11-16/unified-brief-workspace-review.md](../../reviews/logs/2026-11-16/unified-brief-workspace-review.md), `RV-001`.
* [.copilot-tracking/research/2026-11-16/unified-brief-workspace-research.md](../../research/2026-11-16/unified-brief-workspace-research.md), C1/C2, reused.
* No cited BRD, PRD or ADR; inherited source search found none.

## Critique Disposition

* Skipped by automatic parent child-loop policy; no additional critique requested.

## Follow-Up Items

* None.

## Handoff

* Full-plan implementation Complete. Changes record: [.copilot-tracking/changes/2026-11-16/paid-mode-recovery-changes.md](../../changes/2026-11-16/paid-mode-recovery-changes.md).
* No additional Review; passing regression/typecheck/build evidence returns to the parent for session acceptance.
