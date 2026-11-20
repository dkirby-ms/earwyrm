<!-- markdownlint-disable-file -->
# Review: Budget Reservation and Actual Cost

## Executive Summary

* Assessment: The storage, authorization, settlement, UI, and principal cost distinctions meet the plan; one documentation statement overgeneralizes who records actuals, and the changes record contradicts completed plan and validation state.
* Why this matters: Readers need to distinguish the lyric administrator workflow from existing owner-scoped Speech reconciliation and trust the implementation handoff status.
* Review execution: Complete.
* Assessed outcome: Defects found.
* Review depth: Standard.
* Validation coverage: Full API and web suites, typecheck, and whitespace check passed.
* Confidence and limitations: Local implementation and documentation were assessed; no account-specific Azure billing records were inspected, and the reported $1.24 decrease has not been attributed to individual requests.

The assessment above is the reviewer's proposal. Parent Decision Record contains the final decisions and next actions, or states that decisions are pending.

## What You May Not Know

The application records administrator-supplied evidence references but does not retrieve or independently verify Azure billing data. The reported two failed lyric requests have not been verified against account-specific request and reservation records.

## Findings and Proposed Routes

<!-- rpi:review id=RV-001 -->
### RV-001 [Medium]: Scope administrator verification language to lyric actuals

The budget guide says that recorded actuals include only amounts administrators enter with billing evidence. That statement is broader than the new lyric workflow: the existing Speech and full-jingle reconciliation is owner-scoped, so readers may incorrectly believe an administrator must record those actuals too.

* Related scope: P02-T02; FR-006 and the requirement to document unchanged Speech policy.
* Expected behavior: Explain the admin evidence gate for lyric reservations without changing or mischaracterizing existing Speech and full-jingle reconciliation.
* Observed behavior and evidence: `docs/audio-poc/web-app.md`, “Manage budgets,” broadly attributes recorded actuals to administrators. `apps/api/src/web_app.ts` routes `/api/attempts/:attempt_id/reconcile` using the signed-in owner, and `apps/web/src/App.tsx` exposes the existing reconciliation form in the user workspace.
* Impact: Users and administrators can misunderstand who may record Speech or full-jingle actuals.
* Resolution condition: Limit the administrator statement to lyric reservations and state the existing Speech/full-jingle reconciliation roles accurately.
* Proposed destination: `rpi-implement`.
* Smallest useful next action: Correct the broad “Recorded actuals” sentence in the budget guide.

<!-- rpi:review id=RV-002 -->
### RV-002 [Low]: Reconcile the changes record with completed work

The implementation handoff record still reports P02 and P02-T02 as remaining, omits P02-T02 from its completed markers, and says the P02 validations are pending. The plan marks P02 and both tasks complete, and the final full validation passed.

* Related scope: Full-plan completion evidence and P02-T01/P02-T02.
* Expected behavior: The changes record's execution status, completed and remaining markers, task validation, and review readiness agree with the plan and validation output.
* Observed behavior and evidence: `.copilot-tracking/changes/2026-11-20/budget-reservation-accounting-changes.md`, “Execution Status,” “Completed Work,” “Pre-Review Reconciliation,” and “Return-to-Caller State,” conflicts with the checked markers in `.copilot-tracking/plans/2026-11-20/budget-reservation-accounting-plan.md` and the passed commands in “Validation Evidence” here.
* Impact: A later reader or coordinator may treat completed documentation and validation as unfinished or rely on contradictory progress.
* Resolution condition: Mark P02 and P02-T02 complete, clear remaining active markers, update stale per-task validation statements, and align the summary with the passing full checks.
* Proposed destination: `rpi-implement`.
* Smallest useful next action: Reconcile the execution-status and handoff sections of the changes record.

## Parent Decision Record

<!-- Decisions live here. Append events; never rewrite the evidence body above to fit a decision. -->

### Current Disposition

* Based on events: RD-001–RD-006.
* Review execution: Complete.
* Final outcome: Defects found; two accepted follow-up corrections remain.
* Finding decisions and next actions: RV-001 and RV-002 accepted for `rpi-implement`; parent to add bounded follow-up work.
* Decisions still needed: None.

This summary is derived from Decision History, not a second decision record. The latest event for each subject governs; refresh this summary after appending decisions and on recovery.

### Decision History

Append events in order. Never rewrite or delete an earlier row. The latest event for a subject is current.

| Event  | Subject        | Decision source | Status or value | Proposed destination | Final destination | Owner          | More information needed | Smallest next action | Rationale |
|--------|----------------|-----------------|----------------|----------------------|-------------------|----------------|-------------------------|----------------------|-----------|
| RD-001 | Participation  | Agent           | Agent-owned    | None                 | None              | Review parent  | None                    | Compare evidence      | Confirmed automatic RPI session selects agent-owned Review decisions. |
| RD-002 | Walkthrough    | Agent           | Skipped-auto   | None                 | None              | Review parent  | None                    | Record findings       | Automatic Review decisions are agent-owned; no user walkthrough is required. |
| RD-003 | RV-001         | Agent           | Accepted       | `rpi-implement`      | `rpi-implement`   | RPI parent     | None                    | Correct guide wording | The directly observed wording overstates the lyric-only administrator gate. |
| RD-004 | RV-002         | Agent           | Accepted       | `rpi-implement`      | `rpi-implement`   | RPI parent     | None                    | Reconcile changes log | Canonical completion and validation evidence contradict the current changes summary. |
| RD-005 | Execution      | Agent           | Complete       | None                 | None              | Review parent  | None                    | Record outcome        | All planned review comparisons were completed. |
| RD-006 | Outcome        | Agent           | Defects found  | None                 | None              | Review parent  | None                    | Route both findings   | Two bounded implementation-record corrections are required. |

## Validation Evidence

| Command                  | Scope      | Status | Summary                                |
|--------------------------|------------|--------|----------------------------------------|
| `npm run test:api`       | Full plan  | Passed | 505 passed, 1 skipped                  |
| `npm run test:web`       | Full plan  | Passed | 21 passed                               |
| `npm run typecheck`      | Full plan  | Passed | API, web workspace, and root checks ran |
| `git diff --check`       | Worktree   | Passed | No whitespace errors                    |

## Risks, Blockers, and Residual Work

* Blockers: None.
* Remaining active work: None in the original implementation plan; RV-001 and RV-002 are accepted for follow-up planning.
* Residual work: None outside the accepted findings.

## Review Record

### Scope and Evidence

* Task ID: `budget-reservation-accounting`
* Review date: `2026-11-20`
* Review scope: Full task.
* Assessed boundary: P01 storage and migration, P01 admin API, P02 user/admin UI, directly related documentation, plan updates, validation, and review readiness.
* Review depth and provenance: Standard; default initial Review pass.
* Candidate identity: `budget-reservation-accounting`, full-plan implementation recorded in the current plan and changes artifact.
* Review execution: Complete.
* Helper use: None; the evidence is reviewed directly in one marker-driven pass.
* Plan: .copilot-tracking/plans/2026-11-20/budget-reservation-accounting-plan.md
* Plan critique: .copilot-tracking/reviews/plans/2026-11-20/budget-reservation-accounting-plan-critique.md
* Changes: .copilot-tracking/changes/2026-11-20/budget-reservation-accounting-changes.md
* Other evidence considered: .copilot-tracking/research/2026-11-20/budget-reservation-accounting-research.md; API and web source, tests, and docs named in the plan.

### Opening Review State

* Interpreted review goal: Verify that the implemented budget accounting, evidence-gated administrator workflow, UI, and documentation satisfy the approved full-plan requirements without attributing unverified Azure charges.
* Review scope: Full task.
* Evidence readiness: Plan, critique, changes record, research, changed files, and final validation are available.
* Acceptance basis: Plan Goals and Requirements for P01 and P02; resolved critique findings PC-001 through PC-003; confirmed decisions D1 through D4; and recorded validation.
* First comparison boundary: Compare every in-scope marker and material contract across storage, API, UI, docs, and validation; no Azure account or billing evidence is available.
* Active read-only boundaries: Review only; do not modify implementation, plan, critique, research, or changes artifacts.
* Authority: the review parent compares evidence and writes findings; final outcome, route dispositions, and continuation are recorded in Parent Decision Record.
* Initial blockers: None.

### Acceptance and Change Coverage

| Requirement or scope | Implementation and validation evidence | Assessment | Finding or rationale |
|---------------------|---------------------------------------|------------|----------------------|
| P01-T01; FR-001, FR-002, FR-004, FR-006; NFR-001, NFR-002 | `apps/api/src/web_storage.ts`, “text_budget_totals,” settlement methods, and `apps/api/tests/budget.test.ts`; `apps/api/tests/storage-admin.test.ts` verifies explicit schema upgrade and settled-history import. | Met | Pending holds count at reserve, settled rows at actual, and zero, over-reserve, concurrency, corrections, reopening, legacy migration, and history import are covered. |
| P01-T02; FR-003, FR-005, FR-006; NFR-001, NFR-003 | `apps/api/src/web_app.ts`, `LyricSettlementSubmission`, `admin_lyric_operation`, and routes; `apps/api/tests/web_app.test.ts`, “restricts lyric settlement actions.” | Met | Current admin authorization is checked at route and storage layers; failure, token counts, and non-empty references do not themselves settle a hold. |
| P02-T01; FR-002, FR-003, FR-004, FR-006 | `apps/web/src/App.tsx`, user/admin budget views and `updateLyricReservation`; `apps/web/src/App.test.tsx`, settlement/correction/reopen tests. | Met | Separate totals and admin controls refresh after success; rejected settlement keeps inputs and exposes an error. |
| P02-T02; FR-001, FR-005, FR-006; NFR-003 | `docs/service-contracts.md`, “Browser chat and exact vocals”; `docs/audio-poc/web-app.md`, “Understand costs” and “Manage budgets.” | Gap | Lyric evidence gating and the unverified reported failures are documented, but the broad actuals sentence misstates the existing owner-scoped Speech workflow; RV-001. |
| Critique PC-001 through PC-003 | `.copilot-tracking/reviews/plans/2026-11-20/budget-reservation-accounting-plan-critique.md`; plan and API budget tests. | Met | Audited correction/reopen, failed-request hold retention, zero settlement, and concurrent settlement are implemented and covered. |
| Implementation-time plan updates and confirmed decisions | Plan `P01-T01`/`P01-T02` Guidance, decisions D1-D3, and changes record. | Met | Storage/import, admin visibility, and route contracts are reflected in implementation; no requirement or scope deviation was found. |
| Full-plan markers, validation, and handoff | Plan P01/P02 and task markers; changes record; `npm run test:api`, `npm run test:web`, `npm run typecheck`, `git diff --check`. | Gap | Plan and checks are complete, but the changes record still reports P02 work and validation as pending; RV-002. |

### Critique and Follow-Up Assessment

* Latest critique dispositions: PC-001 is resolved by audited correction/reopen operations and coverage; PC-002 by the failed-request hold test; PC-003 by zero-cost and concurrent-settlement tests.
* Material revisions: The four documented storage, API, import, and admin-handoff updates are supported by the implementation and tests. No requirement or scope deviation was found.
* Dependent-work pause assessment: P02 follows completed P01; no early dependent work was observed.
* Justification assessment: The admin-only lyric settlement path follows D1/D4, keeps unsupported costs pending, and leaves score and Speech policies unchanged. No BRD, PRD, or ADR source is cited, so business-source comparison is not applicable.

| Follow-up item | Why outside immediate scope | Owner or next action | Assessment and route |
|----------------|-----------------------------|----------------------|----------------------|
| None | No plan follow-up items are listed. | None | No separate residual route. |

### Reviewer Self-Check

* [x] Every supplied requirement, acceptance criterion, in-scope marker, material update, critique disposition, validation result, blocker, remaining item, and plan follow-up has an assessment or explicit gap.
* [x] Findings are substantive, evidence-grounded, severity-graded, and use stable `RV-xxx` IDs with expected and observed behavior, a resolution condition, and one proposed route each.
* [x] Execution status, assessed outcome, validation coverage, limitations, and proposed routes are complete and internally consistent.
* [x] The summary is scoped and advisory, findings keep their supporting context together, and acceptance coverage distinguishes demonstrated gaps from unassessed behavior.
* [x] Standard review completely assessed the material boundary while omitting restatement, cosmetic feedback, exhaustive strengths, low-impact suggestions, and continual narration; deep review remained inside the supplied boundary.
* [x] The review did not mutate source, the plan, critique, research, or changes record, wrote only this record, did not execute validation, and counted a requirement consistent only from a cited location.
* Checked boundary: All P01 and P02 requirements, markers, implementation-time updates, critique dispositions, follow-up items, and final validation.
* Missing or limited evidence: Account-specific Azure billing data and request-level attribution for the reported failed calls are unavailable.
