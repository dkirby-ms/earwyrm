<!-- markdownlint-disable-file -->
# RPI Plan Critique: Retire Python

## Metadata

* Task ID: retire-python
* Critique date: 2026-11-15
* Plan: .copilot-tracking/plans/2026-11-15/retire-python-plan.md
* Critique execution: Complete
* Critique depth: standard
* Depth provenance: first-task default
* Critique type: initial

## Inputs and Criterion Boundary

Full plan and .copilot-tracking/research/2026-11-15/retire-python-research.md, C1-C7; user requests full Python retirement and automatic progression. No additional discovery or source writes.

## Lens Assessments

| Lens | Scope | Reasoning effort and source | Status | Candidates |
|---|---|---|---|---|
| Coverage | FR-001 through FR-006, NFR-001 through NFR-004 | direct | Complete | All mapped; no adopted findings |
| Evidence | C1-C7 and architecture | direct | Complete | SDK availability supports architecture; no adopted findings |
| Executability | P01-P04 dependencies and tests | direct | Complete | PC-001 adopted |
| Risk | Data, paid calls, auth and removals | direct | Complete | Data, costs and live changes bounded; no adopted findings |

## Coverage Assessment

FR-001 through FR-006 and NFR-001 through NFR-004 are covered by task Requirements. Tests include negative behavior and real transports; old Python removal is dependent on replacements.

## Verdict

Pass, with PC-001 planner-owned correction. Zero Critical or High findings; one Medium finding. Existing schemas, explicit destructive-action exclusions and removal dependencies bound the material risks.

## Findings

<!-- rpi:critique id=PC-001 -->
### PC-001 [Medium]: Make cross-module port interfaces binding before parallel implementation

* Related IDs: P02-T01, P02-T02, P03-T01, P03-T02; FR-002.
* Evidence: plan names snake_case exports and async stores but leaves keyword argument signatures and callback injection largely illustrative.
* Concern: independently ported callers can disagree on positional versus option arguments and schema outputs.
* Impact: integration rework and accidental wire-shape drift.
* Smallest useful change: assign a single owner per module, make Python positional arguments retained and keyword-only arguments an options object, and require owners to communicate exported interface changes before callers finalize.
* Action owner: planning parent.
* Exact resolving evidence: plan Details establish binding convention and integration typecheck.
* Decision route: direct planner correction; no new user decision.

## Limitations

Direct assessment: supplied evidence fits one context; no subagents needed. Live provider and PostgreSQL execution are outside this critique.

## Strengths and Residual Risk

The plan preserves SQLite and PostgreSQL rather than silently dropping offline behavior, and explicitly tests real MCP clients. Musical output identity changes and lack of live cloud validation remain disclosed risks.

## Recommended Next Action

Planning parent applies PC-001 and proceeds. No user response required.
