<!-- markdownlint-disable-file -->
# RPI Plan Critique: Paid cloud AI

* Task ID: paid-cloud-ai
* Critique date: 2026-11-18
* Plan: .copilot-tracking/plans/2026-11-18/paid-cloud-ai-plan.md
* Critique execution: Complete
* Depth: standard (first-task default); initial

## Inputs and Criterion Boundary

User-approved integration and unchanged entitlement. Plan FR-001–FR-003, NFR-001, P01/P02 and research C1–C4/W1. Local readiness only; live services are excluded.

## Lens Assessments

| Lens | Scope | Effort | Status |
|---|---|---|---|
| Coverage | Requirements and tasks | Direct | Complete: PC-001 |
| Evidence | Research and decision basis | Direct | Complete: no finding |
| Executability | Migration and deploy gates | Direct | Complete: PC-002 |
| Risk | Paid omissions and rollback | Direct | Complete: no additional finding |

## Coverage Assessment

FR-002 and NFR-001 covered. FR-001 and FR-003 need explicit operator and user behavior below.

## Verdict

Revise. Both findings can be addressed directly without changing user direction.

## Findings

<!-- rpi:critique id=PC-001 -->
### PC-001 [Medium]: Make a budget denial actionable

* Related IDs: FR-001, P01-T01.
* Evidence: existing chat handler maps cloud failures to generic 503; the plan specifies refusal but no response distinction.
* Impact: users can mistake exhausted budget for a transient provider failure.
* Smallest useful change and resolving evidence: require and test a clear distinct admission denial with no provider call.
* Action owner and route: planning parent, direct.

<!-- rpi:critique id=PC-002 -->
### PC-002 [High]: Give existing Azure stores a reachable upgrade path

* Related IDs: FR-003, P02-T01.
* Evidence: private PostgreSQL is unreachable from normal hosted runners; the existing bootstrap workflow uses a Container Apps Job.
* Impact: enabling text on an existing store without a supported upgrade leaves it unusable.
* Smallest useful change and resolving evidence: explicitly document use of the additive upgrade from an approved VNet-connected host, with the supported new database image/checkout and no reset; only then enable text.
* Action owner and route: planning parent, direct.

## Strengths and Residual Risk

Durable upper-bound reservations account for ambiguous traffic. Rates and credential access still require operator evidence.

## Questions or Blocking Evidence Gaps

None for local implementation.

## Limitations

No live Azure validation.

## Recommended Next Action

Planning parent resolves PC-002 and PC-001. No user response required.
