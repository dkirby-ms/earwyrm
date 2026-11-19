<!-- markdownlint-disable-file -->
# RPI Plan Critique: Access Request and Approval Flow

## Metadata

* Task ID: access-request-approval-flow
* Critique date: 2026-11-18
* Plan: .copilot-tracking/plans/2026-11-18/access-request-approval-flow-plan.md
* Critique execution: Complete
* Critique depth: standard
* Depth provenance: default
* Critique type: initial
* Earlier critique: not applicable

## Inputs and Criterion Boundary

* Task context and caller requirements: Replace identity-provider details on the signed-in, application-denied screen with an access-request flow; let administrators grant or deny queued requests without manually entering a subject; preserve existing authorization boundaries.
* Research and evidence considered: .copilot-tracking/research/2026-11-18/access-request-approval-flow-research.md
* Decisions, dependencies, task Goals, and task Requirements considered: Plan decisions D1-D6, FR-001-FR-008, NFR-001-NFR-004, P01/P02 goals and task requirements, and their stated dependencies.
* Assessment boundary: Assess the supplied plan against the supplied research and confirmed user direction for requirement coverage, evidence support, executability, and material risk. Do not inspect unsupplied sources or perform additional research.

## Lens Assessments

| Lens          | Scope                       | Reasoning effort and source       | Status | Candidates |
|---------------|-----------------------------|-----------------------------------|--------|------------|
| Coverage      | Entire plan, all FR/NFR/tasks | Host default; lens default low    | Complete | 3 adopted; 3 rejected: case-count inference, map/reference documentation traceability, and an implied startup-gate change do not establish substantive omissions |
| Evidence      | P01 and P01-T01/T02          | Host default; lens default medium | Complete | 3 adopted; 3 rejected; 1 merged into PC-002 |
| Evidence      | P02 and P02-T01/T02          | Host default; lens default medium | Complete | 0 adopted; 2 merged into PC-004/008; 7 rejected as non-material, contradicted by caller direction, or based on planner-authored requirements |
| Executability | P01 and P01-T01/T02          | Host default; lens default medium | Complete | 2 adopted in PC-009; 3 merged into PC-004/006/007; 3 rejected as unverified or unsupported by the supplied evidence |
| Executability | P02 and P02-T01/T02          | Host default; lens default medium | Complete | 2 adopted; 4 rejected; 1 merged into PC-001 |
| Risk          | Entire plan, cross-phase risks | Host default; lens default medium | Complete | 0 new findings; 7 merged into PC-002/003/004/006/007/008/009; 3 rejected as speculative or unsupported by the supplied evidence |

## Coverage Assessment

| Requirement, research, phase, or task ID | Coverage | Evidence or concern |
|------------------------------------------|----------|---------------------|
| FR-008, P02-T01, P02-T02 | Partial | Accessibility is required, but the task coverage lists do not name keyboard or live-region assertions. |
| FR-002, FR-005, D2, D5, P01-T01, P01-T02 | Partial | The plan does not define how request/grant operations handle already-enabled or administratively disabled application users. |
| FR-003, FR-004, NFR-002, P01-T02 | Partial | Duplicate or stale admin decisions and unknown request IDs have no stated outcome or coverage. |
| NFR-001, P01-T02 | Partial | The exact delegated scopes are specified, but the supplied research does not establish that the request scope is available to signed-in users who are not enabled in the app. |
| NFR-003, P01-T01 | Partial | The plan requires an unconditional upgrade and complete validation, but does not state how pre-upgrade validation avoids requiring the new table before it is created. |
| FR-001, FR-006, FR-007, NFR-004 | Covered | Core user-visible behavior, database compatibility work, and preservation of direct permission editing are planned; the partial rollout and state-edge gaps are listed separately. |

## Verdict

* Verdict: Revise
* Rationale: The plan has actionable coverage, authorization-evidence, PostgreSQL rollout-order, and test-execution gaps recorded in PC-001 through PC-009. The plan should be revised before implementation.

## Findings

<!-- rpi:critique id=PC-001 -->
### PC-001 [Medium]: Accessibility requirements lack testable coverage

* Related IDs: FR-008, P02-T01, P02-T02
* Evidence: .copilot-tracking/plans/2026-11-18/access-request-approval-flow-plan.md; FR-008 and the P02 semantic/regression coverage lists require accessible feedback and keyboard-operable controls, but no test assertion names those behaviors.
* Concern: The requirement may be implemented without a check for keyboard access or assistive-technology status announcements.
* Impact: The requester and admin actions could be inaccessible while the plan's listed tests still pass.
* Smallest useful change: Name focused assertions in the existing UI test ownership for live status announcements and keyboard operation of request and decision actions.
* Action owner: Planning parent
* Exact resolving evidence: P02 task Details and semantic coverage specify the assertions and the focused UI test cases that verify them.
* Decision route: Direct planner correction

<!-- rpi:critique id=PC-002 -->
### PC-002 [Medium]: Existing application-user states are undefined

* Related IDs: FR-002, FR-005, D2, D5, P01-T01, P01-T02
* Evidence: .copilot-tracking/plans/2026-11-18/access-request-approval-flow-plan.md; the request scope is an identity "that is not enabled in the app," while approval enables baseline access. Research C16 records that existing application users are permission rows and an unregistered identity lookup returns null.
* Concern: The plan does not distinguish an identity with no application-user row from an administratively disabled row or an already-enabled user. An approval could unexpectedly reactivate a user whose access was revoked, while an enabled user could create a redundant queue item. It also does not specify how a first-time grant creates an application-user record with baseline permissions.
* Impact: A grant may restore previously disabled access or preserve unexamined elevated permissions, and request status may be inconsistent for users who already have access.
* Smallest useful change: Specify the request and grant behavior for new identities, already-enabled users, and administratively disabled rows; define first-time baseline user creation, keep disabled accounts on the existing direct-admin path unless an explicit safe policy is evidenced, and add focused regression cases.
* Action owner: Planning parent
* Exact resolving evidence: P01 task requirements and tests define each existing-user state and verify that approval creates only baseline access without unexpectedly restoring revoked or elevated permissions.
* Decision route: Direct planner correction

<!-- rpi:critique id=PC-003 -->
### PC-003 [Medium]: Stale and unknown request decisions lack outcomes

* Related IDs: FR-003, FR-004, NFR-002, P01-T02
* Evidence: .copilot-tracking/plans/2026-11-18/access-request-approval-flow-plan.md; P01-T02 defines grant and denial for pending requests but does not state outcomes for an unknown identifier or a request that another administrator has already decided.
* Concern: The implementation has no plan-level contract for stale queue entries, repeated decisions, or a status lookup with no record.
* Impact: Concurrent or repeated admin actions may produce inconsistent responses or unintended user-permission changes.
* Smallest useful change: Define the status and mutation behavior for unknown, already-decided, and no-current-request cases, with regression coverage proving non-pending decisions do not alter access.
* Action owner: Planning parent
* Exact resolving evidence: P01-T02 Requirements and semantic/regression coverage state the response and user-access effect for each case.
* Decision route: Direct planner correction

<!-- rpi:critique id=PC-004 -->
### PC-004 [Medium]: Existing denial-screen and startup assertions need in-place updates

* Related IDs: FR-001, NFR-003, P01-T01, P02-T01
* Evidence: .copilot-tracking/research/2026-11-18/access-request-approval-flow-research.md, C10 records an existing App.test.tsx case that expects verified identity on the denied screen; C14 records an existing PostgreSQL test that validates without upgrading when lyrics are false or unset. The plan changes both behaviors but does not state that the existing assertions will be rewritten.
* Concern: The old assertions will fail after the required UI and startup changes unless the existing tests are updated. "Exact test removals: none" does not clarify that in-place assertion updates are permitted.
* Impact: The implementation may leave known failing tests or exceed the declared test-addition budget through unplanned replacements.
* Smallest useful change: Name both existing tests as in-place assertion updates, preserving the test cases and counting no test removals.
* Action owner: Planning parent
* Exact resolving evidence: P01-T01 and P02-T01 test ownership explicitly authorize updating the C14 startup and C10 denial-screen assertions in place for the new required behavior.
* Decision route: Direct planner correction

<!-- rpi:critique id=PC-005 -->
### PC-005 [Medium]: P02 tasks can conflict in shared UI files

* Related IDs: P02-T01, P02-T02
* Evidence: .copilot-tracking/plans/2026-11-18/access-request-approval-flow-plan.md; both P02 tasks name apps/web/src/App.tsx and apps/web/src/App.test.tsx as targets and depend only on P01-T02.
* Concern: The plan does not sequence the two tasks or define a combined test budget, despite their overlapping source and test ownership.
* Impact: Parallel execution could cause conflicting edits or exceed per-task assumptions about shared test coverage.
* Smallest useful change: Make P02-T02 depend on P02-T01, or merge the tasks and their test budget into one UI task.
* Action owner: Planning parent
* Exact resolving evidence: P02-T02 Dependencies names P02-T01 as a prerequisite, or the plan consolidates their UI change and test ownership.
* Decision route: Direct planner correction

<!-- rpi:critique id=PC-006 -->
### PC-006 [Medium]: PostgreSQL upgrade and full validation order is ambiguous

* Related IDs: NFR-003, P01-T01
* Evidence: .copilot-tracking/research/2026-11-18/access-request-approval-flow-research.md, C13 says the current upgrade validates the existing store before creating schema; C14 says false/unset lyric configuration validates without running the upgrade. The plan adds the request table to both the upgrade and required-table validation but does not distinguish pre-upgrade validation from complete post-upgrade validation.
* Concern: If the new table is required by the existing pre-upgrade validation, every existing PostgreSQL deployment missing it can fail before the additive upgrade creates it.
* Impact: Startup can fail on the very deployments the unconditional upgrade is intended to support.
* Smallest useful change: State that pre-upgrade checks tolerate the absent access table, the idempotent additive upgrade creates it before full required-table validation, and all `LYRIC_ENABLED` paths exercise that order.
* Action owner: Planning parent
* Exact resolving evidence: P01-T01 Details and NFR-003 specify pre-upgrade compatibility, create-before-full-validation order, and tests for an existing store with the request table absent.
* Decision route: Direct planner correction

<!-- rpi:critique id=PC-007 -->
### PC-007 [Medium]: Request authorization scope is not evidenced for unenabled users

* Related IDs: NFR-001, P01-T02
* Evidence: .copilot-tracking/research/2026-11-18/access-request-approval-flow-research.md, C8 and C17 establish scope checks but do not name the scopes or show which scope an unenabled identity's token carries. P01-T02 names `briefs.read` for request/status and `renders.read`/`renders.write` for admin operations.
* Concern: The request scope may not be present for a signed-in identity that is not enabled for application access, preventing the intended requester from submitting or checking a request.
* Impact: The main access-request path could reject valid requesters despite successful sign-in.
* Smallest useful change: Ground the request scope in the existing identity/access route contract and confirm it is available to unenabled identities; retain the existing admin scope contract for queue and decision routes.
* Action owner: Planning parent
* Exact resolving evidence: A source-backed plan reference or research finding establishes the exact request scope available to an unenabled identity and the existing admin scopes.
* Decision route: Direct planner correction

<!-- rpi:critique id=PC-008 -->
### PC-008 [Low]: Resubmission decision is misattributed to user intent

* Related IDs: FR-003, D4, P01-T01, P02-T01
* Evidence: .copilot-tracking/plans/2026-11-18/access-request-approval-flow-plan.md, D4 cites "User intent"; the user request did not specify resubmission. Research records denied-user resubmission as an open question at .copilot-tracking/research/2026-11-18/access-request-approval-flow-research.md.
* Concern: The plan presents an agent-selected lifecycle behavior as user intent, obscuring that resubmission was a planner decision.
* Impact: Later readers may treat an unconfirmed behavior as a user requirement.
* Smallest useful change: Record D4 as an agent-owned default informed by the research's open question, not as user intent.
* Action owner: Planning parent
* Exact resolving evidence: D4 cites the research open question and clearly states the agent-owned rationale for allowing a denied request to be resubmitted.
* Decision route: Direct planner correction

<!-- rpi:critique id=PC-009 -->
### PC-009 [Medium]: Test budgets are not reconciled with required coverage

* Related IDs: P01-T01, P01-T02, P02-T01, P02-T02, FR-008, NFR-003, NFR-004
* Evidence: .copilot-tracking/plans/2026-11-18/access-request-approval-flow-plan.md; fixed maximum additions are 8 tests for each P01 task and 4 for each P02 task, while their semantic and regression lists include more separately named outcomes, including three `LYRIC_ENABLED` states and accessibility assertions.
* Concern: The plan does not map the listed outcomes to test cases or explain which behaviors share cases.
* Impact: The hard test caps may force omission of required security, migration, or accessibility coverage.
* Smallest useful change: Map required outcomes to the permitted test cases, including in-place updates to existing tests, or raise the caps to fit the mapped cases.
* Action owner: Planning parent
* Exact resolving evidence: Each task's test ownership section contains a bounded case-to-outcome map that covers every listed semantic and regression outcome within its declared additions.
* Decision route: Direct planner correction

## Strengths and Residual Risk

* The request flow is correctly scoped to a signed-in, application-denied user, derives identity from validated claims, and preserves enabled-admin checks at both API and storage layers.
* Research confirms the need for separate request state, an unconditional PostgreSQL upgrade path, and compatibility with older SQLite imports.

## Questions or Blocking Evidence Gaps

* No direct user response is requested during critique. The planning parent should resolve the agent-owned policy and scope-evidence questions in PC-002 and PC-007 before implementation.

## Limitations

* The supplied evidence does not establish deployed PostgreSQL DDL privileges, multi-replica startup behavior, or the exact database test harness. Risk candidates about these were not adopted as findings without supporting evidence.

## Recommended Next Action

* Highest-impact finding: PC-006
* Action owner: Planning parent
* Smallest next action: Revise the plan for PC-001 through PC-009, verify the request-scope contract, and only then hand off to Implement.
* User response required: No
