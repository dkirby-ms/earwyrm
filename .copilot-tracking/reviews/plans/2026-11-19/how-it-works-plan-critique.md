<!-- markdownlint-disable-file -->
# RPI Plan Critique: How it works

## Metadata

* Task ID: how-it-works
* Critique date: 2026-11-19
* Plan: .copilot-tracking/plans/2026-11-19/how-it-works-plan.md
* Critique execution: Complete
* Critique depth: standard, default
* Critique type: initial
* Earlier critique: not applicable

## Inputs and Criterion Boundary

* Task context: add an in-app How it works page with logical and cloud diagrams and concise explanations.
* Research: .copilot-tracking/research/2026-11-19/how-it-works-research.md.
* Decisions, dependencies, goals and requirements: the supplied plan's P01, P01-T01, P01-T02, FR-001 through FR-003 and NFR-001 through NFR-003.
* Boundary: supplied plan and its referenced evidence; no live deployment assertions or open-ended research.

## Lens Assessments

| Lens | Scope | Reasoning effort and source | Status | Candidates |
|---|---|---|---|---|
| Coverage | Requirements and tasks | direct | Complete | 0 adopted; requirements map to both tasks |
| Evidence | Research and plan | direct | Complete | 0 adopted; supported by research C1-C9 |
| Executability | P01 and tasks | direct | Complete | 1 adopted: PC-001 |
| Risk | P01 and risks | direct | Complete | 0 adopted; access risk merged in PC-001 |

## Coverage Assessment

| IDs | Coverage | Evidence or concern |
|---|---|---|
| FR-001 through FR-003; NFR-001 through NFR-003; P01-T01 and P01-T02 | Covered with correction | Tasks cover the requirements; PC-001 addresses an access-state interaction. |

## Verdict

* Verdict: Revise.
* Rationale: a navigation availability edge case needs an explicit implementation and test decision.

## Findings

<!-- rpi:critique id=PC-001 -->
### PC-001 [Medium]: The new navigation must account for access-denied and loading states

* Related IDs: FR-001, NFR-003, P01-T01, P01-T02.
* Evidence: apps/web/src/App.tsx header and workspace visibility; .copilot-tracking/research/2026-11-19/how-it-works-research.md C1.
* Concern: the header appears for signed-in accounts before application access and workspace readiness, but workspace panels are hidden until both are available. The plan does not specify whether the new view is gated or independently available in these states.
* Impact: placing the view inside the hidden workspace while exposing its button globally can produce a navigation control that opens no content.
* Smallest useful change: gate the button consistently with workspace readiness or explicitly render the view outside that gate; cover the chosen behavior.
* Action owner: planning parent.
* Exact resolving evidence: P01-T01 and P01-T02 specify gating or independent rendering and a corresponding test.
* Decision route: direct planner correction.

## Strengths and Residual Risk

* Source-based topology and explicit no-deployment boundary reduce misrepresentation and operational risk.

## Questions or Blocking Evidence Gaps

* None.

## Limitations

Live cloud configuration is outside the supplied evidence.

## Recommended Next Action

* Highest-impact finding: PC-001.
* Action owner: planning parent.
* Smallest next action: specify access and loading behavior and a focused test.
* User response required: no.
