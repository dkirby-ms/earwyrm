<!-- markdownlint-disable-file -->
# RPI Plan Critique: Issue #1 briefs and audio proof

## Metadata

* Task ID: issue-1-define-synthetic-advertiser-briefs
* Critique date: 2026-11-12
* Plan: .copilot-tracking/plans/2026-11-11/issue-1-define-synthetic-advertiser-briefs-plan.md
* Critique execution: Complete
* Critique depth: standard
* Depth provenance: default for the first task
* Critique type: initial
* Earlier critique: not applicable

## Inputs and Criterion Boundary

* Task context and caller requirements: Plan the synthetic advertiser briefs and audio POC protocol for Issue #1, using a one-person 3/3 self-evaluation screen, metered-only per-render cost threshold, rights and duration evidence, and local-document reconciliation. The original 5+3 panel is deferred future validation. No live tracker mutation, participant outreach, audio production, cloud spending, or platform implementation is authorized.
* Research and evidence considered: .copilot-tracking/research/2026-11-11/issue-1-define-synthetic-advertiser-briefs-research.md; docs/design-proposal.md; docs/project-plan.md; docs/github-issues.md; live Issue #1 as linked in the plan.
* Decisions, dependencies, task Goals, and task Requirements considered: D1 confirms JSON briefs with a separate answer key; D2 confirms retaining the original panel only as deferred future validation. P01-T01 defines the provider-neutral contract and protocol; P01-T02 creates fixtures and depends on P01-T01; P02-T01 reconciles local documents and depends on P01. Requirements FR-001 through FR-005 and NFR-001 through NFR-003.
* Assessment boundary: Assess the supplied plan against its research, source documents, user decisions, requirements, dependencies, deliverables, validation approach, and scope. Do not edit the plan or perform additional research.

## Lens Assessments

| Lens          | Scope                    | Reasoning effort and source | Status   | Candidates |
|---------------|--------------------------|-----------------------------|----------|------------|
| Coverage      | Entire plan              | low (lens default)          | Complete | 4 adopted; 0 rejected |
| Evidence      | Entire plan and research | medium (lens default)       | Complete | 3 adopted; 2 rejected: duplicate findings merged; participant identity was not a demonstrated requirement, and source-inventory claims are planner observations |
| Executability | Entire plan              | medium (lens default)       | Complete | 8 adopted; 0 rejected; duplicate candidates merged into existing findings |
| Risk          | Entire plan and evidence | medium (lens default)       | Complete | 6 adopted; 1 rejected: tracker mutation conflicts with confirmed user scope |

## Coverage Assessment

| Requirement, research, phase, or task ID | Coverage | Evidence or concern |
|------------------------------------------|----------|---------------------|
| FR-001, P01-T01                           | Partial  | Adapter response fields and stable identifier need to be explicit (PC-004). |
| FR-002, NFR-001, P01-T02                  | Partial  | Join key, placeholder pattern, and one-off JSON validation need to be checkable (PC-004, PC-008, PC-011). |
| FR-003, NFR-002, P01-T01                  | Partial  | Empty/pending result records, decision consequences, and answer-key handling need to be explicit (PC-006, PC-007, PC-009). |
| FR-004, NFR-003, P01-T01                  | Partial  | Per-output rights and cost evidence fields need to be specified (PC-001). |
| FR-005, P02-T01, research C6-C7           | Partial  | All local full-panel references and the 7/9 percentage error need reconciliation (PC-002, PC-003). |
| Planning D1/D2, research D1-D3             | Partial  | Local planning decisions and research decisions need distinct references (PC-005). |

## Verdict

* Verdict: Revise
* Rationale: The complete standard assessment found three High findings affecting reproducible evidence, complete local-document scope, and unsupported result records, plus actionable Medium and Low findings. These are planner-owned corrections; no unresolved user decision is required.

## Findings

<!-- rpi:critique id=PC-001 -->
### PC-001 [High]: Specify reproducible per-output rights and cost records

* Related IDs: FR-004, P01-T01, research C3-C4
* Evidence: .copilot-tracking/plans/2026-11-11/issue-1-define-synthetic-advertiser-briefs-plan.md; .copilot-tracking/research/2026-11-11/issue-1-define-synthetic-advertiser-briefs-research.md
* Concern: The plan requires rights evidence, render duration, metered cost, and separate fixed-charge reporting but does not name the record fields needed to reproduce or audit those measurements.
* Impact: The implemented protocol could omit usage quantity, unit rate, currency, source/date, per-attempt attribution, or component-level rights evidence, leaving the cost and rights gates unverifiable.
* Smallest useful change: Specify the per-output rights and metered-usage fields, fixed-charge reporting, and pending behavior for missing evidence in P01-T01.
* Action owner: planning parent
* Exact resolving evidence: P01-T01 names the rights and metered-usage fields and the protocol's validation checks require them.
* Decision route: direct planner correction

<!-- rpi:critique id=PC-009 -->
### PC-009 [High]: Keep future evaluation results pending until outputs exist

* Related IDs: FR-003, FR-004, P01-T01, NFR-002
* Evidence: .copilot-tracking/plans/2026-11-11/issue-1-define-synthetic-advertiser-briefs-plan.md; .copilot-tracking/research/2026-11-11/issue-1-define-synthetic-advertiser-briefs-research.md
* Concern: The plan requires output-level observations but this task excludes audio production and creates only protocol and fixture artifacts.
* Impact: An implementer could leave the evaluation undefined or create unsupported results, violating the evidence boundary.
* Smallest useful change: State that this task creates an empty result template only, with each output row pending until an actual output and measurement exist; no result is inferred or fabricated.
* Action owner: planning parent
* Exact resolving evidence: The protocol contains blank/pending output records and the task scope explicitly excludes producing audio or filling results.
* Decision route: direct planner correction

<!-- rpi:critique id=PC-010 -->
### PC-010 [Medium]: Make local protocol links required

* Related IDs: FR-005, P02-T01
* Evidence: .copilot-tracking/plans/2026-11-11/issue-1-define-synthetic-advertiser-briefs-plan.md, P02-T01 Details and Phase Checklist
* Concern: The change map assumes the local documents link to the protocol, but the task says to add links only "where useful."
* Impact: The docs may be updated without making the new protocol discoverable, contrary to the planned change map.
* Smallest useful change: Require all three affected local documents to link to the protocol; the protocol itself links to both JSON files.
* Action owner: planning parent
* Exact resolving evidence: P02-T01 names the required protocol link in each affected local document and the protocol links to both fixtures.
* Decision route: direct planner correction

<!-- rpi:critique id=PC-011 -->
### PC-011 [Medium]: Name a one-off JSON syntax check

* Related IDs: FR-002, P01-T02
* Evidence: .copilot-tracking/plans/2026-11-11/issue-1-define-synthetic-advertiser-briefs-plan.md, P01-T02 Details
* Concern: P01-T02 requires parsing JSON while excluding a parser deliverable, but does not identify a simple verification command.
* Impact: The validation could be skipped or mistaken for a request to add parsing infrastructure.
* Smallest useful change: State that a one-off standard-tool invocation such as `python3 -m json.tool` is validation only, not a deliverable.
* Action owner: planning parent
* Exact resolving evidence: The task names a one-off JSON parse command as validation and continues to exclude runtime parsing infrastructure.
* Decision route: direct planner correction

<!-- rpi:critique id=PC-006 -->
### PC-006 [Medium]: Define local POC outcome consequences

* Related IDs: FR-003, FR-004, P01-T01, P02-T01
* Evidence: docs/project-plan.md, Week-1 decision gate; docs/design-proposal.md, section 9; .copilot-tracking/research/2026-11-11/issue-1-define-synthetic-advertiser-briefs-research.md
* Concern: The plan defines a 3/3 screen but does not state whether a pass, fail, or missing evidence changes the local POC path.
* Impact: The result could be treated as either a complete product go/no-go or as unusable, and local docs could apply inconsistent consequences.
* Smallest useful change: State that the protocol records pass/fail/pending for the local POC only, ties pass/fail to the existing vocoded-path or spoken-tagline decision, and does not update or satisfy live GitHub issues.
* Action owner: planning parent
* Exact resolving evidence: The protocol and all affected local documents use the same local-only outcome and consequence; missing evidence remains pending.
* Decision route: direct planner correction

<!-- rpi:critique id=PC-007 -->
### PC-007 [Medium]: Control answer-key exposure during self-evaluation

* Related IDs: FR-002, FR-003, P01-T01, P01-T02, research Cycle 2
* Evidence: .copilot-tracking/research/2026-11-11/issue-1-define-synthetic-advertiser-briefs-research.md, Cycle 2
* Concern: The plan keeps answers separate from generation but does not tell the evaluator to record each transcription before consulting the expected-answer file.
* Impact: The self-screen could be biased by seeing expected answers first, making its already limited result less informative.
* Smallest useful change: Require transcription before answer-key review and consistently label the result as unblinded self-evaluation.
* Action owner: planning parent
* Exact resolving evidence: The protocol's sequence records each transcription before answer-key comparison and labels the result unblinded self-evaluation.
* Decision route: direct planner correction

<!-- rpi:critique id=PC-008 -->
### PC-008 [Low]: Specify reserved synthetic contact placeholders

* Related IDs: NFR-001, P01-T02, research W2-W3
* Evidence: .copilot-tracking/research/2026-11-11/issue-1-define-synthetic-advertiser-briefs-research.md, Evidence Log W2-W3
* Concern: "Non-operational synthetic contact placeholders" does not name a checkable placeholder pattern.
* Impact: A fixture could accidentally include an operational-looking email or phone number.
* Smallest useful change: Require reserved example domains and phone numbers in the 555-0100 through 555-0199 range, then validate fixture contacts against those patterns.
* Action owner: planning parent
* Exact resolving evidence: All fixture contact values use the documented non-operational patterns and the validation checks confirm this.
* Decision route: direct planner correction

<!-- rpi:critique id=PC-005 -->
### PC-005 [Low]: Disambiguate plan and research decision IDs

* Related IDs: P01-T02, P02-T01, research D1-D3
* Evidence: .copilot-tracking/plans/2026-11-11/issue-1-define-synthetic-advertiser-briefs-plan.md; .copilot-tracking/research/2026-11-11/issue-1-define-synthetic-advertiser-briefs-research.md
* Concern: The plan uses D1 and D2 for its own representation and deferred-panel decisions, while the research artifact uses D1 and D2 for the one-person screen and cost basis and D3 for representation.
* Impact: Readers following unqualified decision references can reach the wrong evidence.
* Smallest useful change: Label plan decisions as Planning D1/D2 and cite the matching research decision IDs, including research D3 for JSON representation.
* Action owner: planning parent
* Exact resolving evidence: Task references distinguish Planning D1/D2 from research D1/D2/D3 and point to the matching evidence.
* Decision route: direct planner correction

<!-- rpi:critique id=PC-002 -->
### PC-002 [High]: Include every local full-panel criterion location

* Related IDs: FR-005, P02-T01, research C7
* Evidence: docs/github-issues.md, local Issue #3 acceptance criteria; docs/project-plan.md, Main risks
* Concern: P02-T01 names Issue #1 and the Week-1 gate/risk but leaves other local statements of the original 5+3 panel outside its edit and validation scope.
* Impact: Local documents can continue to present the panel as an active POC gate, contradicting the confirmed deferred-only treatment.
* Smallest useful change: Expand P02-T01 to reconcile all local POC-gate references, including Issue #3 and the project-plan risk, while keeping later full validation explicitly deferred and the live tracker unchanged.
* Action owner: planning parent
* Exact resolving evidence: P02-T01 lists the affected sections and validates remaining full-panel references as clearly deferred.
* Decision route: direct planner correction

<!-- rpi:critique id=PC-003 -->
### PC-003 [Low]: Correct the proposal's 7/9 percentage label

* Related IDs: P02-T01, research C6
* Evidence: docs/design-proposal.md, section 9; .copilot-tracking/research/2026-11-11/issue-1-define-synthetic-advertiser-briefs-research.md
* Concern: The proposal labels seven of nine professional ratings as 70%, although the exact count is about 77.8%.
* Impact: Deferred full-panel criteria retain an inaccurate percentage and can be misread as a lower threshold.
* Smallest useful change: In the local proposal, keep the exact 7/9 count and remove the inaccurate parenthetical percentage.
* Action owner: planning parent
* Exact resolving evidence: The local proposal's deferred criteria state 7 of 9 without a conflicting percentage.
* Decision route: direct planner correction

<!-- rpi:critique id=PC-004 -->
### PC-004 [Medium]: Define a stable brief key and adapter response

* Related IDs: FR-001, FR-002, P01-T01, P01-T02, research Q2
* Evidence: .copilot-tracking/plans/2026-11-11/issue-1-define-synthetic-advertiser-briefs-plan.md
* Concern: The plan requires each answer to match a brief and excludes expected answers from the adapter response, but defines neither a stable join key nor the response fields.
* Impact: Fixture matching and answer-key separation cannot be checked consistently.
* Smallest useful change: Add a stable `brief_id` to the contract, both JSON files, and answer records; enumerate the provider-neutral response fields and explicitly exclude expected answers.
* Action owner: planning parent
* Exact resolving evidence: The protocol and fixtures use the same unique `brief_id`, and the documented adapter response contains only generation-facing brief fields.
* Decision route: direct planner correction

## Strengths and Residual Risk

* The confirmed one-person 3/3 scope, separate JSON answer key, deferred-only panel, metered-only cost threshold, and no-tracker-mutation boundary are reflected consistently in the research and confirmed user direction.
* The user explicitly excludes live tracker mutation. Live Issue #1 and related live Issue #3 therefore remain unchanged; any tracker reconciliation remains out of scope.

## Questions or Blocking Evidence Gaps

None; all findings have planner-owned resolving evidence and require no additional user answer.

## Limitations

The live Issue #1 and Issue #3 bodies were not fetched during critique; the plan treats them as unchanged and uses the supplied research and local-document evidence. The Mermaid map was not previewed in light and dark themes.

## Recommended Next Action

* Highest-impact finding: PC-001, PC-002, and PC-009 (High)
* Action owner: planning parent
* Smallest next action: revise the plan to make the record contract reproducible, reconcile all relevant local criteria, and keep actual results pending until outputs exist.
* User response required: no
