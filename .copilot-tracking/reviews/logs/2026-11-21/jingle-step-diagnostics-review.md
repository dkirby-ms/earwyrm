<!-- markdownlint-disable-file -->
# Review: Jingle step diagnostics

## Executive Summary

* Assessment: The API, timeline, and guide implement the approved server-timed diagnostics. One planned repeat-stage accumulation check is not directly asserted by the tests.
* Why this matters: A missed assertion leaves the central revisited-stage timing rule without regression coverage.
* Review execution: Complete.
* Assessed outcome: Defects found, limited to a low-severity validation gap; no runtime behavior defect was demonstrated.
* Review depth: Standard, initial-review default.
* Validation coverage: The changes record reports 93 API tests, 30 web tests, API/web/workspace typechecks, and desktop/mobile visual review as passed. The review did not rerun these checks.
* Confidence and limitations: Source behavior is consistent with the requirements on inspection, but repeated-stage accumulation lacks direct automated assertions. No live provider calls, paid requests, or deployment were performed.

The assessment above is the reviewer's proposal. Parent Decision Record contains the final decisions and next actions, or states that decisions are pending.

## What You May Not Know

The displayed values are server-measured elapsed time, not provider billing or token usage. Incomplete token counts are intentionally omitted. Active-stage time includes earlier completed visits, and the final snapshot is retained for up to 60 seconds for the requesting owner.

## Findings and Proposed Routes

<!-- rpi:review id=RV-001 -->
### RV-001 [Low]: Revisited-stage accumulation lacks direct test assertions

The approved timing contract requires repeated visits to a stage to accumulate. The API and UI implementations appear to support that behavior, but the recorded test evidence does not directly verify the accumulated total after a revisit.

* Related scope: P01-T01, P01-T02, FR-001, NFR-001, and critique finding PC-001.
* Expected behavior: A revisited active stage displays prior accumulated duration plus current-visit elapsed time, and its terminal duration includes all visits.
* Observed behavior and evidence: `apps/api/src/web_app.ts` accumulates a stage's duration when `set_stage` changes stage and adds the final visit in request cleanup. In `apps/api/tests/web_app.test.ts`, the controlled-clock assertions cover active and terminal timing for a single visit per stage, not a revisit. `apps/web/src/App.test.tsx` changes the active stage from lyrics to safety and back, but does not assert the lyrics timing after it is revisited.
* Impact: A regression in accumulation for either the API response or UI display could pass the current focused tests, leaving the clarified PC-001 behavior unverified.
* Resolution condition: Automated assertions demonstrate the accumulated active and terminal duration across a deterministic stage revisit, and the browser assertion verifies the active revisited-stage total.
* Proposed destination: `rpi-implement`.
* Smallest useful next action: Add focused repeat-stage assertions to the existing API and web tests, using deterministic timing values.

This is a validation-coverage finding, not evidence that the current implementation reports an incorrect duration.

## Parent Decision Record

### Current Disposition

* Based on events: `RD-001` through `RD-007`.
* Review execution: Complete.
* Final outcome: Defects found at the review boundary because planned repeat-stage regression checks were missing; the accepted route was completed afterward.
* Finding decisions and next actions: `RV-001` accepted for `rpi-implement` and implemented with deterministic API and UI repeat-stage assertions; no further action remains for this finding.
* Decisions still needed: None.

This summary is derived from Decision History, not a second decision record. The latest event for each subject governs; refresh this summary after appending decisions and on recovery.

### Decision History

| Event  | Subject        | Decision source | Status or value     | Proposed destination | Final destination | Owner                 | More information needed | Smallest next action                                     | Rationale |
|--------|----------------|-----------------|--------------------|----------------------|-------------------|-----------------------|-------------------------|----------------------------------------------------------|-----------|
| RD-001 | Participation  | Agent           | agent-owned        | None                 | None              | Review parent         | None                    | Compare full plan                                        | Automatic RPI session; user directed end-to-end handling through review. |
| RD-002 | Walkthrough    | Agent           | skipped-auto       | None                 | None              | Review parent         | None                    | Decide findings from evidence                            | Agent-owned participation skips per-finding questions. |
| RD-003 | Execution      | Agent           | Complete           | None                 | None              | Review parent         | None                    | Record assessed outcome                                  | Full-plan comparison completed. |
| RD-004 | Outcome        | Agent           | Defects found      | None                 | None              | Review parent         | None                    | Route `RV-001`                                           | Planned repeat-stage test evidence is missing. |
| RD-005 | `RV-001` route | Agent           | accepted           | `rpi-implement`      | `rpi-implement`   | Automatic RPI session | None                    | Add deterministic API and UI repeat-stage assertions     | The test obligation is within the approved implementation scope. |
| RD-006 | Continuation   | Agent           | `rpi-implement` first | `rpi-implement`  | `rpi-implement`   | Automatic RPI session | None                    | Complete focused validation, then continue to refinement | Resolve the accepted validation finding before refinement. |
| RD-007 | `RV-001` route completion | Agent | implemented and validated | `rpi-implement` | `rpi-implement` | Automatic RPI session | None | Continue to refinement | The changes record documents the helper and repeat-stage assertions; 94 API tests, 30 web tests, and workspace typecheck passed. |

## Validation Evidence

| Command or check | Scope | Status | Summary |
|------------------|-------|--------|---------|
| `npm run test --workspace @earwyrm/api -- tests/web_app.test.ts` | API | Passed | Changes record reports 93 tests passed; the repeat-stage accumulation case is not directly asserted. |
| `npm run test --workspace @earwyrm/web -- --run src/App.test.tsx` | Web | Passed | Changes record reports 30 tests passed; the repeated active stage is not checked for its accumulated display. |
| `npm run typecheck` | Workspace | Passed | Changes record reports API, web, and root TypeScript checks completed without errors. |
| Synthetic-browser desktop and mobile visual review | Web | Passed | Changes record reports 1280px and 375px viewports with no horizontal overflow. |
| Documentation test | Guide | Skipped | No documentation test is configured. |

## Risks, Blockers, and Residual Work

* Blockers: None.
* Remaining active work: The accepted `RV-001` test-coverage correction is routed to `rpi-implement`.
* Residual work: Cross-provider token counts remain optional, separate future planning work as recorded in the plan.

## Review Record

### Scope and Evidence

* Task ID: `jingle-step-diagnostics`
* Review date: 2026-11-21
* Review scope: Full task.
* Assessed boundary: P01 and P01-T01 through P01-T03, covering the owner-scoped progress API, browser timeline, guide semantics, critique disposition, follow-up, and recorded validation.
* Review depth and provenance: Standard; initial-review default.
* Candidate identity: `jingle-step-diagnostics`, full plan, current worktree changes at review start.
* Review execution: Complete.
* Helper use: None.
* Plan: .copilot-tracking/plans/2026-11-21/jingle-step-diagnostics-plan.md
* Plan critique: .copilot-tracking/reviews/plans/2026-11-21/jingle-step-diagnostics-plan-critique.md
* Changes: .copilot-tracking/changes/2026-11-21/jingle-step-diagnostics-changes.md
* Other evidence considered: .copilot-tracking/research/2026-11-21/jingle-step-diagnostics-research.md; API and web source changes; focused test results; final workspace typecheck; synthetic-browser captures at desktop and mobile widths.

### Opening Review State

* Interpreted review goal: Verify the completed full-plan implementation against user direction, FR-001 and FR-002, NFR-001 through NFR-003, and resolved critique finding PC-001.
* Review scope: Full task.
* Evidence readiness: Plan, critique, changes record, research, implementation diffs, and recorded validation results are available.
* Acceptance basis: Approved plan requirements, D1-D2, PC-001 disposition, and the original end-to-end user direction.
* First comparison boundary: Compare each task's requirements with implementation behavior and validation; exclude live provider requests, deployment, and unrelated dirty worktree changes.
* Active read-only boundaries: Review may update only this review record.
* Authority: The review parent compares evidence and writes findings; final outcome, route dispositions, and continuation are recorded in Parent Decision Record.
* Initial blockers: None.

### Acceptance and Change Coverage

| Requirement or scope | Implementation and validation evidence | Assessment | Finding or rationale |
|----------------------|-----------------------------------------|------------|----------------------|
| P01-T01, FR-001, NFR-001 | `apps/api/src/web_app.ts`, progress route, `set_stage`, and request cleanup report active and terminal server durations with accumulation by stage. API assertions cover active and terminal single visits, owner isolation, and expiry. | Gap | The planned direct repeat-stage active and terminal assertions are missing; see `RV-001`. |
| FR-002, NFR-002, D2 | The progress route returns only stage timing fields, checks progress ID plus issuer and subject, and retains one in-memory terminal snapshot for 60 seconds. API tests assert another owner and an expired snapshot receive an empty timing response. | Met | The snapshot is reset on a new request and is not persisted. |
| P01-T02, FR-001, NFR-003 | `apps/web/src/App.tsx` adds prior stage durations to live elapsed time, retrieves terminal timing on success and failure, and leaves timing text outside the stage announcement. `apps/web/src/App.test.tsx` checks live, terminal, unavailable, unreached, and announcement states. Visual review covered 1280px and 375px widths. | Gap | The test revisits lyrics but does not assert the displayed accumulated value on that revisit; see `RV-001`. |
| P01-T03, FR-001, FR-002 | `docs/audio-poc/web-app.md` explains server-measured duration, accumulated visits, the distinction from billing and token usage, and not-reached and unavailable labels while retaining failure guidance. | Met | Documentation-only update; no documentation test is configured. |
| PC-001, D1 | The revised plan defines an active revisited-stage total as prior duration plus current-visit elapsed time; source code uses that formula and preserves the 60-second terminal snapshot. | Met with validation gap | The planned direct regression assertions remain absent; see `RV-001`. |
| User direction and P01 | The plan, changes record, API, UI, and guide implement per-step timing and omit incomplete token counts. All three task markers are complete in the plan. | Met | No live provider calls or deployment were required or performed. |

### Critique and Follow-Up Assessment

* Latest critique dispositions: PC-001 was resolved in P01-T01 and P01-T02 by specifying prior accumulated duration plus current-visit elapsed time for an active revisited stage. The code follows that contract; direct test coverage is incomplete as recorded in `RV-001`.
* Material revisions: The plan updates match the recorded research, preserve the confirmed server-timing scope, and do not change the requirement IDs or work boundary.
* Dependent-work pause assessment: No dependent work resumed before the critique finding was resolved; the implementation followed its explicit task dependency.
* Justification assessment: D1 excludes incomplete token counts, D2 bounds terminal timing to 60 seconds, and the changes record provides the matching rationale. No unresolved plan assumption prevents acceptance beyond `RV-001`.

| Follow-up item | Why outside immediate scope | Owner or next action | Assessment and route |
|----------------|-----------------------------|----------------------|-----------------------|
| Cross-provider token counts | The plan and research show that token usage is unavailable for several steps and could misrepresent total usage. | Future planning session, only if a consistent approved contract becomes available | Remains justified residual work, not a defect or active plan task. |

### Reviewer Self-Check

* [x] Every supplied requirement, acceptance criterion, in-scope marker, material update, critique disposition, validation result, blocker, remaining item, and plan follow-up has an assessment or explicit gap.
* [x] Findings are substantive, evidence-grounded, severity-graded, and use stable `RV-xxx` IDs with expected and observed behavior, a resolution condition, and one proposed route each.
* [x] Execution status, assessed outcome, validation coverage, limitations, and proposed routes are complete and internally consistent.
* [x] The summary is scoped and advisory, findings keep their supporting context together, and acceptance coverage distinguishes demonstrated gaps from unassessed behavior.
* [x] Standard review completely assessed the material boundary while omitting restatement, cosmetic feedback, exhaustive strengths, low-impact suggestions, and continual narration; deep review remained inside the supplied boundary.
* [x] The review did not mutate source, the plan, critique, research, or changes record, did not execute validation, and counted a requirement as consistent only from a cited location. The parent state records only the review path and derived next action.
* Checked boundary: P01 and all three task markers, FR-001/002, NFR-001 through NFR-003, D1-D2, PC-001, validation evidence, the implementation change record, and the deferred token-count follow-up.
* Missing or limited evidence: No direct automated assertion verifies active and terminal duration accumulation across a stage revisit. Provider execution, paid requests, and deployment were not performed.
