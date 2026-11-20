<!-- markdownlint-disable-file -->
# RPI Plan Critique: Budget Reservation and Actual Cost

## Metadata

* Task ID: `budget-reservation-accounting`
* Critique date: `2026-11-20`
* Plan: .copilot-tracking/plans/2026-11-20/budget-reservation-accounting-plan.md
* Critique execution: Complete
* Critique depth: standard
* Depth provenance: default
* Critique type: initial
* Earlier critique: not applicable

## Inputs and Criterion Boundary

* Task context and caller requirements: Preserve the upfront spending cap, show reserved and verified actual amounts separately, release only verified unused reservation, and do not infer account-specific charges for the reported failures. Work is limited to local code, tests, and directly related documentation; no live billing inspection or Azure deployment.
* Research and evidence considered: .copilot-tracking/research/2026-11-20/budget-reservation-accounting-research.md
* Decisions, dependencies, task Goals, and task Requirements considered: The plan's agent-owned, admin-authorized evidence-gated settlement decision; P01 before P02; all phase and task Goals; FR-001 through FR-005 and NFR-001 through NFR-003.
* Assessment boundary: Assess the supplied two-phase plan against the supplied research and confirmed user direction. The critique can assess local implementation readiness and evidence limits, but cannot establish whether the two reported failures incurred charges or whether Azure billing can attribute an actual to an individual request.

## Lens Assessments

| Lens | Scope | Reasoning effort and source | Status | Candidates |
|------|-------|-----------------------------|--------|------------|
| Coverage | All plan requirements, phases, tasks, and task Requirements | low (selected) | Complete | 2 adopted (PC-002, PC-003); 2 rejected: API response shape is owned by P02-T01; over-reservation visibility is already required by FR-004 and P02-T01 |
| Evidence | Full plan claims, decisions, Details, and References against supplied research | medium (selected) | Complete | 0 adopted; 5 rejected: the plan cites code references for current IDs and PostgreSQL scope without contrary evidence; attribution and overlap are bounded in the plan; agent ownership and research citations are distinguishable |
| Executability | P01-P02, tasks, dependencies, validation commands, and stated environment | medium (selected; parent verified only against the plan and research) | Complete | 1 adopted (merged into PC-003); 4 rejected: PostgreSQL path/test claims and unowned-row behavior require source verification; the 15-case cap is not demonstrably exceeded |
| Risk | Shared-budget release, authorization, evidence, external effects, decisions, and residual risks | medium (selected) | Complete | 1 adopted (PC-001); 5 rejected: indefinite holds follow confirmed direction; the two-failure uncertainty is documented; in-flight risk is unsubstantiated; agent ownership and research IDs are explicit |

## Coverage Assessment

| Requirement, research, phase, or task ID | Coverage | Evidence or concern |
|------------------------------------------|----------|---------------------|
| FR-001, P01-T01 | Partial | Pending holds are required, but the named test cases do not explicitly verify that a failed lyric request remains pending and counted; PC-002. |
| FR-002, P01-T01, P02-T01 | Covered | The plan separates pending lyric holds from settled lyric actuals and preserves existing accounting policies. |
| FR-003, P01-T02 | Covered | Admin authorization, required evidence reference, and amount validation are specified. |
| FR-004, P01-T01, P02-T01 | Partial | The calculation and over-reservation behavior are specified, but a one-time settlement has no correction path if the recorded actual is wrong; PC-001. |
| FR-005, P01-T02 | Covered | Failure status, diagnostics, and token counts cannot settle a reservation; unsupported attribution leaves it pending. |
| NFR-001, P01-T01 | Partial | Duplicate settlement is named, but concurrent settlement and a valid zero-cost settlement are not explicit test cases; PC-003. |
| NFR-002, P01-T01 | Covered | SQLite and PostgreSQL adapter compatibility and legacy pending rows are explicit plan requirements and test targets; implementation details remain for the referenced code paths. |
| NFR-003, P01-T02, P02-T02 | Covered | The plan limits stored evidence to settlement metadata/reference and excludes raw billing data and secrets. |

## Verdict

* Verdict: Revise
* Rationale: The plan preserves the spending guard and correctly keeps unsupported charges pending, but a mistaken one-time admin settlement can release shared budget with no planned correction path. Two additional settlement invariants also need explicit regression coverage.

## Findings

<!-- rpi:critique id=PC-001 -->
### PC-001 [High]: One-time settlement has no correction path

* Related IDs: FR-003, FR-004, NFR-001, P01-T01, P01-T02.
* Evidence: Plan P01-T02 says an already-settled reservation returns a conflict; FR-004 permits release up to the unused amount; no task specifies correction, void, or reversal.
* Concern: The administrator-entered actual is immutable after the first settlement. A mistyped or subsequently corrected amount can leave the shared budget guard using an incorrect release, with no in-app way to restore the hold while preserving the audit record.
* Impact: An understated actual can release too much shared budget and permit additional spending beyond the intended guard.
* Smallest useful change: Add an admin-only, audited correction or void operation that records the prior and replacement values, updates the effective hold atomically, and has focused budget-guard tests.
* Action owner: Planning parent.
* Exact resolving evidence: The plan defines the correction/void contract and its audit and atomicity tests demonstrate that correcting a settlement restores the correct effective budget without deleting the original record.
* Decision route: Direct planner correction.

<!-- rpi:critique id=PC-002 -->
### PC-002 [Medium]: Failed-request hold retention lacks a named regression test

* Related IDs: FR-001, P01-T01, P01-T02.
* Evidence: FR-001 requires the reservation to remain pending after failure; the P01 test lists cover pending holds and settlement arithmetic but do not name a failed lyric request. Research C2 confirms reservations are created before provider calls and have no matching release on failure.
* Concern: The test contract does not explicitly protect the failure-path hold from a later code change that releases it on provider failure.
* Impact: The upfront spending guard could be weakened by an untested failure path.
* Smallest useful change: Name an API test that forces lyric generation to fail and asserts that its reservation remains pending and counted in the budget.
* Action owner: Planning parent.
* Exact resolving evidence: The validation plan and P01 task identify the failure-path test and its assertion on both pending status and budget accounting.
* Decision route: Direct planner correction.

<!-- rpi:critique id=PC-003 -->
### PC-003 [Medium]: Settlement concurrency and zero-cost cases are not explicit in test coverage

* Related IDs: FR-003, FR-004, NFR-001, P01-T01, P01-T02.
* Evidence: FR-003 accepts a nonnegative amount, so zero is valid; NFR-001 requires concurrent or repeated attempts not to release twice. P01-T01 names settlement arithmetic and duplicate settlement tests but does not state that zero and concurrent requests are exercised.
* Concern: A valid zero-cost settlement or two simultaneous attempts could be mishandled without failing the named regression suite.
* Impact: The budget guard may reject a valid zero actual or release the same reservation more than once.
* Smallest useful change: Name focused tests for a zero-cost settlement and two concurrent settlement attempts, with one successful release and unchanged totals after the competing attempt.
* Action owner: Planning parent.
* Exact resolving evidence: P01-T01 and the Validation Plan name both cases and state the expected actual, hold, and budget totals.
* Decision route: Direct planner correction.

## Strengths and Residual Risk

* The plan preserves the upfront cap, does not infer actual dollars from a failure or token count, and keeps unsupported reservations pending.
* The admin-only settlement boundary, amount checks, duplicate conflict, and separate treatment of Speech and score reservations are explicit.
* Azure evidence may not support request-level attribution. Pending holds can therefore remain indefinitely and consume available budget; this consequence follows the confirmed requirement not to release an unverified amount.
* The reported `$1.24` remains unverified; P02-T02 explicitly preserves that limitation in documentation.

## Questions or Blocking Evidence Gaps

* None require a user response. PC-001 through PC-003 are planner-owned corrections.

## Limitations

* This critique assessed only the supplied plan and research; it did not inspect source files, run tests, inspect live Azure billing, or validate account-specific charges.
* The Executability lens return included code-level claims outside the supplied plan/research boundary. Those claims were not treated as findings; its plan-and-research coverage was completed directly.

## Recommended Next Action

* Highest-impact finding: PC-001
* Action owner: Planning parent
* Smallest next action: Revise P01 to provide an audited correction path for an erroneous settlement, then update the focused test contract for PC-002 and PC-003.
* User response required: No
