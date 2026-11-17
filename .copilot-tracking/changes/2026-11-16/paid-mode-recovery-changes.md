<!-- markdownlint-disable-file -->
# RPI Changes: Paid mode recovery

## Metadata

* Task ID: paid-mode-recovery
* Plan: [.copilot-tracking/plans/2026-11-16/paid-mode-recovery-plan.md](../../plans/2026-11-16/paid-mode-recovery-plan.md)
* Parent finding: `RV-001`
* Implementation date: 2026-11-16

## Execution Status

* Status: Complete
* Declared scope: full child plan, `P04-T01`
* Completed markers: `P04`, `P04-T01`
* Remaining markers: none
* First active item: none

## Execution Summary

Preserve the independent offline path when the selected paid-vocal option becomes unavailable. The paid primary-action and busy safeguards must remain enforced.

## Completed Work

### Paid mode can be deselected without enabling another paid dispatch

* Related task: `P04-T01`; resolves parent `RV-001`.
* Files: [apps/web/src/App.tsx](../../../apps/web/src/App.tsx), [apps/web/src/App.test.tsx](../../../apps/web/src/App.test.tsx).
* Behavior: an unavailable checked vocal option can be turned off; unavailable unselected vocals remain disabled. The paid primary-action and busy gates are unchanged.
* Evidence: the existing paid-flow test now enters unresolved usage after exact-batch confirmation, asserts another paid render is blocked, turns vocals off and verifies a subsequent `mode: instrumental` request.
* Validation: the regression failed before the gate change and passes afterward; all nine web tests, root typecheck and production build pass.

## Implementation-Time Plan Updates

* None.

## Business Alignment

* None.

## Validation Record

* Confirmed failing regression: `npm run test --workspace @earwyrm/web -- --run -t 'estimates optional vocals'` failed at the disabled checked vocal toggle, exactly reproducing `RV-001`.
* Passed: `npm run test:web` (nine tests, including the extended red/green regression).
* Passed: `npm run typecheck` and `npm run build`.
* Parent focused API evidence remains applicable; no API change is planned.
* Browser validation remains unavailable.

## Blockers

* None.

## Remaining Work

* None.

## Follow-Up Items

* None.

## Return-to-Caller State

* Full child plan Complete; parent `RV-001` resolution condition is demonstrated by the extended test.
* Correction is validated but not reviewed again, following the session's one-Review rule. No further selected work or blocker.
