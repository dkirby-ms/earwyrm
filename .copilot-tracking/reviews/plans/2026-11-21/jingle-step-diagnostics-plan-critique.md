<!-- markdownlint-disable-file -->
# RPI Plan Critique: Jingle step diagnostics

## Metadata

* Task ID: `jingle-step-diagnostics`
* Critique date: 2026-11-21
* Plan: `.copilot-tracking/plans/2026-11-21/jingle-step-diagnostics-plan.md`
* Critique execution: Complete
* Critique depth: standard
* Depth provenance: initial-plan default
* Critique type: initial
* Earlier critique: not applicable

## Inputs and Criterion Boundary

* Task context and caller requirements: Show useful diagnostic information at every jingle-generation step; the user selected end-to-end handling through review.
* Research and evidence considered: `.copilot-tracking/research/2026-11-21/jingle-step-diagnostics-research.md`.
* Decisions, dependencies, task Goals, and task Requirements considered: Agent-owned decision to report server-measured stage durations and omit incomplete token counts; 60-second owner-scoped terminal retention; P01 and P01-T01 through P01-T03; FR-001, FR-002, and NFR-001 through NFR-003; task dependencies and bounded test ownership.
* Assessment boundary: Initial standard critique of the complete supplied plan and its cited research only. No implementation validation, external research, or unsupplied source inspection.

## Lens Assessments

| Lens          | Scope                                      | Reasoning effort and source | Status | Candidates |
|---------------|--------------------------------------------|-----------------------------|--------|------------|
| Coverage      | All requirements, phase P01, tasks P01-T01 through P01-T03 | direct | Complete | 1 adopted; 0 rejected |
| Evidence       | Plan decisions, details, references, research findings F1-F2 and questions Q1-Q3 | direct | Complete | 0 adopted; 0 rejected: decisions and metric scope are supported by the supplied research. |
| Executability | P01 task order, ownership, test budget, commands, and validation environment | direct | Complete | 0 adopted; 0 rejected: task dependencies are clear, and scoped test commands and bounded test ownership are specified. |
| Risk          | Owner isolation, terminal retention, privacy, failure behavior, and UI compatibility | direct | Complete | 0 adopted; 0 rejected: the plan preserves owner checks, limits terminal retention, excludes provider content, and does not add external side effects. |

## Coverage Assessment

| Requirement, research, phase, or task ID | Coverage | Evidence or concern |
|------------------------------------------|----------|---------------------|
| FR-001, NFR-001, P01-T01, P01-T02 | Partial | The API plans to accumulate revisited stages, but the UI instructions do not define the active step's displayed value when that stage has prior accumulated time. |
| FR-002, NFR-002, NFR-003, F1-F2, D1-D2 | Covered | Research supports server timing, omission of incomplete token counts, owner-scoped terminal retrieval, and preserving existing UI announcements; 60 seconds is identified as an implementation choice. |
| P01, P01-T01, P01-T02, P01-T03 | Covered | API work precedes the UI dependency; documentation is independent; each task has bounded scope and directly related tests or updates. |

## Findings

<!-- rpi:critique id=PC-001 -->
### PC-001 [Medium]: Define the displayed total for a revisited active stage

* Related IDs: FR-001, NFR-001, P01-T01, P01-T02
* Evidence: `.copilot-tracking/plans/2026-11-21/jingle-step-diagnostics-plan.md`; `.copilot-tracking/research/2026-11-21/jingle-step-diagnostics-research.md` (F1, C7)
* Concern: The plan requires repeated visits to a stage to accumulate, but its API example separates completed stage durations from current-stage elapsed time and its UI says to show only the live elapsed time for the active stage. It does not say whether a stage revisited while active should include the prior completed duration in its displayed total.
* Impact: Since the server may revisit a stage, users could see a lower active duration than the already accumulated work for that same step, even though the terminal result later includes the accumulated total.
* Smallest useful change: Define the active stage's displayed duration as its prior accumulated duration plus the current visit's elapsed time, and clarify how the progress response represents these two components.
* Action owner: Planning parent
* Exact resolving evidence: Updated P01-T01 response-contract details and P01-T02 display behavior explicitly define and test the active revisited-stage total.
* Decision route: Direct planner correction

## Verdict

* Verdict: Revise
* Rationale: One Medium coverage finding leaves the active display contract underspecified when a stage is revisited. Clarifying the API and UI total is a planner-owned correction; no Critical or High findings were identified.

## Strengths and Residual Risk

* The supplied research supports server-measured duration and excluding partial token counts; the plan preserves owner isolation, failure behavior, and accessible stage announcements while bounding terminal retention.

## Questions or Blocking Evidence Gaps

* None. The identified gap is directly resolvable in the plan.

## Limitations

* This initial critique assessed the supplied plan and research only; it did not inspect implementation files, run tests, or perform external research.

## Recommended Next Action

* Highest-impact finding: PC-001
* Action owner: Planning parent
* Smallest next action: Update P01-T01 and P01-T02 to define the active revisited-stage total and assert it in focused API and browser tests.
* User response required: No

