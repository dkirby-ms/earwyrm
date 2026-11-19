<!-- markdownlint-disable-file -->
# Review: Access Request and Approval Flow

## Executive Summary

* Assessment: The full supplied boundary was assessed. The requester and admin flows meet the accepted behavior, with no substantive findings; conditional durable decision history remains future work.
* Why this matters: Signed-in users can request access without seeing identity-provider internals, and enabled admins can grant or deny queued requests without re-entering a subject.
* Review execution: Complete.
* Assessed outcome: Residual work.
* Validation coverage: Focused API and web tests, API/web typechecks and builds, whitespace validation, and desktop/mobile browser checks passed as reported in the changes record.
* Confidence and limitations: Standard-depth review of the supplied artifacts and local implementation evidence. No live Entra/Azure deployment, PostgreSQL DDL-permission check, multi-replica startup, or assistive-technology session was exercised.

The final outcome and route decisions are recorded in the Parent Decision Record.

## What You May Not Know

Granting a request enables baseline application access only. Administrator and paid Speech permissions remain off, including when a previously disabled user is granted access. The request record stores the current/latest state, not a durable decision audit history; it should not be treated as an audit or retention record.

## Findings and Proposed Routes

No substantive findings were identified within the assessed boundary. Low-impact malformed-ID and diagnostic edge cases were reviewed but do not change the access-request outcome or mutate state; they are not promoted to findings at standard depth.

## Parent Decision Record

### Current Disposition

* Based on events: RD-001 through RD-007.
* Review execution: Complete.
* Final outcome: Residual work; no substantive implementation findings, with conditional durable history retained for future requirements.
* Finding decisions and next actions: None; no substantive `RV-xxx` findings.
* Decisions still needed: None.
* Automatic session acceptance: Complete; no required follow-up, blocker, or unresolved acceptance criterion remains.

### Decision History

| Event  | Subject | Decision source | Status or value | Proposed destination | Final destination | Owner | More information needed | Smallest next action | Rationale |
|--------|---------|-----------------|-----------------|----------------------|-------------------|-------|-------------------------|----------------------|-----------|
| RD-001 | Review decision participation | Agent | agent-owned | None | None | Review parent | None | Complete the evidence comparison | Confirmed automatic RPI mode uses agent-owned review decisions by default. |
| RD-002 | Review execution | Agent | started | None | None | Review parent | None | Assess each in-scope marker and validation record | Full-plan implementation markers are complete and the review boundary is ready. |
| RD-003 | Review walkthrough | Agent | skipped-auto | None | None | Review parent | None | None | Agent-owned review decisions require no per-finding walkthrough when no actionable findings exist. |
| RD-004 | Conditional durable-history follow-up | Agent | accepted as conditional, not active | Follow-up if audit or retention requirements emerge | None until triggered | Product owner or future planning | An audit or retention requirement | Revisit scope if such a requirement emerges | The current task establishes no audit or retention requirement, so this is not required in-scope work or an active child task. |
| RD-005 | Review execution | Agent | Complete | None | None | Review parent | None | Continue to automatic Follow-up assessment | The full supplied boundary was assessed; limitations are disclosed and do not block the scoped verdict. |
| RD-006 | Final outcome | Agent | Residual work | Follow-up if audit or retention requirements emerge | None until triggered | Product owner or future planning | An audit or retention requirement | No action unless a requirement emerges | No substantive findings remain; the plan's distinct history item is conditional future work. |
| RD-007 | Automatic session acceptance | Agent | Complete | None | None | RPI parent | None | No required follow-up; stop the automatic session | The review supports every accepted criterion, no required finding or completion blocker remains, and conditional history is not active work unless an audit or retention requirement emerges. |

## Validation Evidence

| Command | Scope | Status | Summary |
|---------|-------|--------|---------|
| `npm run test --workspace @earwyrm/api -- tests/storage.test.ts tests/storage-admin.test.ts tests/cloud_web.test.ts` | P01-T01 | Passed | Changes record reports 79 passed, 1 skipped. |
| `npm run typecheck --workspace @earwyrm/api` | P01-T01, P01-T02 | Passed | Changes record reports typecheck completed for both P01 tasks. |
| `npm run build --workspace @earwyrm/api` | P01-T01, P01-T02 | Passed | Changes record reports API build completed for both P01 tasks. |
| `npm run test --workspace @earwyrm/api -- tests/web_app.test.ts` | P01-T02, P02-T02 | Passed | Changes record reports 50 focused API tests passed. |
| `npm run test --workspace @earwyrm/web -- --run src/App.test.tsx` | P02-T01 | Passed | Changes record reports 20 focused tests passed. |
| `npm run test --workspace @earwyrm/web -- --run src/App.test.tsx` | P02 | Passed | 25 focused tests passed. |
| `npm run typecheck --workspace @earwyrm/web` | P02 | Passed | TypeScript check completed. |
| `npm run build --workspace @earwyrm/web` | P02 | Passed | Web production build completed. |
| `git diff --check` | Full implementation | Passed | No whitespace errors. |
| Browser visual review | P02 | Passed | Requester and admin views were checked at desktop and 390px mobile widths with temporary API/auth mocks. |

## Risks, Blockers, and Residual Work

* Blockers: None.
* Remaining active work: None; all implementation markers are checked.
* Residual work: Durable request decision history remains a distinct follow-up if an audit or retention requirement emerges; owner is the product owner or follow-up planning.

## Review Record

### Scope and Evidence

* Task ID: access-request-approval-flow
* Review date: 2026-11-18
* Review scope: Full task.
* Assessed boundary: P01 storage and schema rollout, P01 requester/admin APIs, P02 requester/admin UI, focused tests, documentation, critique dispositions, implementation-time updates, and the recorded follow-up item.
* Review depth and provenance: Standard; default.
* Decision participation: Agent-owned; confirmed automatic RPI mode.
* Candidate identity: Current worktree for access-request-approval-flow, with all plan markers checked.
* Review execution: Complete.
* Helper use: P01 RPI Reviewer compared storage, schema rollout/import, and API behavior with P01 requirements and tests (max; RPI Reviewer frontmatter default). Parent verified the cited authorization, lifecycle, baseline-grant, schema-upgrade, and error-mapping mechanisms; the candidates were assessed as inherited behavior, behavior explicitly allowed by the baseline-only grant, low-impact diagnostics/input edges, or non-demonstrated evidence gaps. Runtime and real PostgreSQL behavior remain unassessed. P02 RPI Reviewer was assigned requester/admin UI, accessibility, and guidance (max; frontmatter default) but failed before comparison because its prompt exceeded the model budget; the parent completed that comparison directly.
* Plan: .copilot-tracking/plans/2026-11-18/access-request-approval-flow-plan.md
* Plan critique: .copilot-tracking/reviews/plans/2026-11-18/access-request-approval-flow-plan-critique.md
* Changes: .copilot-tracking/changes/2026-11-18/access-request-approval-flow-changes.md
* Other evidence considered: .copilot-tracking/research/2026-11-18/access-request-approval-flow-research.md; focused test and build results in the changes record.

### Opening Review State

* Interpreted review goal: Compare the completed access-request implementation with the full accepted plan, user direction, validation evidence, critique dispositions, and follow-up boundary.
* Review scope: Full task.
* Evidence readiness: Plan, critique, research, changes record, source, tests, and guide are available; all implementation markers are complete.
* Acceptance basis: User-confirmed access request and admin decision outcomes; FR-001 through FR-008; NFR-001 through NFR-004; task-specific Goals, Requirements, Details, and dependencies; and resolved PC-001 through PC-009.
* First comparison boundary: Compare each completed marker with its requirements and implementation evidence, reconcile plan updates, then assess validations, critique dispositions, and residual follow-up. No live identity-provider or hosted-deployment verification is claimed.
* Active read-only boundaries: Review may update this record and the allowed parent-state projections (review path and derived next action/follow-ups) only; source, plan, critique, research, and changes record are read-only.
* Authority: The review parent compares evidence and writes findings; final outcome, route dispositions, and continuation are recorded in Parent Decision Record.
* Initial blockers: None.

### Acceptance and Change Coverage

| Requirement or scope | Implementation and validation evidence | Assessment | Finding or rationale |
|----------------------|----------------------------------------|------------|----------------------|
| FR-002, FR-003, NFR-001; P01-T02 | apps/api/src/web_app.ts `/api/access-requests` GET/POST uses `require_scope('briefs.read')` and validated `identity(response)`; POST accepts an empty strict body. apps/api/src/web_storage.ts `request_access` checks existing enabled access, makes pending submissions idempotent, and creates a new request ID after a decision. apps/api/tests/web_app.test.ts covers own-identity submission, denied resubmission, scope/token rejection, and caller-supplied identity rejection. | Met | Identity is derived from validated claims, not request payload. |
| FR-004, FR-005, FR-007, NFR-002; P01-T02 | apps/api/src/web_app.ts admin routes use `authorized('renders.read'/'renders.write')`; apps/api/src/web_storage.ts `list_access_requests_as_admin` and `decide_access_request_as_admin` call `require_admin` inside `write()`. `set_locked` applies baseline flags. Tests cover admin scope, live revocation, grant/deny, unknown and decided requests. | Met; implementation follows the NFR's transactional admin-check contract | API middleware checks scopes and enabled access; the transaction rechecks admin status in storage. This matches NFR-002 and the researched existing authorization split. P01-T02 Requirements describes the enabled-admin check as occurring at both API and storage layers, but that wording does not change the stated NFR or the observed authorization contract. |
| FR-006, NFR-003, NFR-004; P01-T01 | apps/api/src/web_storage.ts creates `access_requests`; apps/api/src/bootstrap_database.ts includes it in fresh schema, reset/import contracts, and additive upgrade; apps/api/src/persistence.ts requires it after upgrade; apps/api/src/cloud_web.ts calls preparation before worker startup. apps/api/tests/cloud_web.test.ts covers enabled/disabled/unset lyric configuration; apps/api/tests/storage-admin.test.ts covers import with and without access requests. | Met within recorded test boundary | Real PostgreSQL DDL behavior and deployed privileges were not exercised; the validation record reports SQLite-backed/emulated PostgreSQL tests and a skipped live test. |
| FR-001, FR-003, FR-008; P02-T01 | apps/web/src/App.tsx `loadWorkspaceData` enters the request state only for the exact `403` detail `Application access denied`; the signed-out panel remains separate. The requester panel displays none/pending/denied/approved states, denial retry, and approved reload. Submission uses the authenticated client without a caller identity. apps/web/src/App.test.tsx covers hidden identity details, signed-out sign-in, keyboard submission, status announcements, retry, and approved reload. | Met | Requester behavior remains attached to the signed-in, application-denied state. Keyboard and live-region behavior were source- and test-checked; no assistive-technology session was run. |
| FR-004, FR-005, FR-007, FR-008; P02-T02 | apps/web/src/App.tsx renders the queue only for admins, displays read-only subjects, provides native Grant/Deny buttons, preserves the existing permission editor, and refreshes the queue/users after decisions or errors. `runAction` exposes announcements and errors through the live region and alert. apps/web/src/App.test.tsx covers read-only identity, grant/deny via keyboard, status announcements, non-admin hiding, and decision-error refresh. | Met | Grant copy explicitly says baseline access only and leaves elevated permissions off. |
| User guide; P02-T02 | docs/audio-poc/web-app.md documents request/status, denial retry, approval reload, admin grant/deny, baseline-only permissions, and first-admin bootstrap. | Met | Guidance matches the implemented lifecycle and existing bootstrap flow. |
| Implementation-time Guidance and critique dispositions | The plan adds API/storage Guidance for P01-T02 and requester/admin contracts for P02. The changes record reports these as code-contract updates; source matches the named endpoint scopes, response types, and baseline-grant behavior. PC-001 through PC-009 are resolved in the plan's Critique Disposition and exercised by the focused tests cited above. | Met | No material revision changed confirmed user direction or task scope; the P01-T02 wording note is non-material, as explained above. |
| P01/P02 completion and dependency order | The plan marks P01, P01-T01, P01-T02, P02, P02-T01, and P02-T02 complete; the changes record lists the same complete markers and no remaining active work. Dependencies serialize storage/API/UI work. | Met | No premature dependent-work resumption is reported. |
| Plan follow-up: durable request decision history | The plan and changes record both defer durable history until audit or retention requirements emerge; the current model records only one current request/decision per identity. | Residual work | Retain as a distinct conditional product follow-up, not a defect or active plan task. |

### Critique and Follow-Up Assessment

* Latest critique dispositions: The plan records PC-001 through PC-009 as resolved. The plan revisions add explicit keyboard/status test cases (PC-001), define new/enabled/disabled-user behavior and baseline-only grants (PC-002), define `none`/`404`/`409` outcomes and non-mutation cases (PC-003), authorize in-place updates to the existing denial and startup assertions (PC-004), serialize overlapping UI tasks (PC-005), distinguish tolerant pre-upgrade checks from post-upgrade validation (PC-006), cite request and admin scope contracts (PC-007), identify denied resubmission as an agent-owned default (PC-008), and map scenarios to bounded test cases (PC-009). Source and focused tests confirm the relevant behaviors within the recorded boundary.
* Material revisions: The changes record reports that Guidance blocks were added for P01-T02 and the P02 requester/admin UI tasks after implementation revealed stable API/storage contracts. The plan's Guidance sections identify those contracts; source comparison confirms the contracts are reflected in the implementation.
* Dependent-work pause assessment: The plan orders P01-T01 before P01-T02, P02-T01 after P01-T02, and P02-T02 after both P01-T02 and P02-T01. The changes record reports completion in that order with all markers checked and no active work; no premature dependent-work resumption is reported.
* Justification assessment: The accepted direction and task requirements are consistent across the plan, critique disposition, and changes-record summary. The live enabled-admin requirement is transactionally enforced in storage as required by NFR-002; the broader P01-T02 wording is a non-material wording inconsistency, not a demonstrated authorization gap.

| Follow-up item | Why outside immediate scope | Owner or next action | Assessment and route |
|----------------|-----------------------------|----------------------|----------------------|
| Durable request decision history | No audit or retention requirement was established for the current flow; the plan retains current request state only. | Product owner or follow-up planning, if an audit or retention requirement emerges | Retain as distinct conditional follow-up, not an implementation defect or active plan task. |

### Reviewer Self-Check

* [x] Every supplied requirement, acceptance criterion, in-scope marker, material update, critique disposition, validation result, blocker, remaining item, and plan follow-up has an assessment or explicit gap.
* [x] No substantive finding met the standard-depth materiality threshold; the low-impact candidates were checked against cited evidence and no `RV-xxx` finding was warranted.
* [x] Execution status, assessed outcome, validation coverage, limitations, and proposed routes are complete and internally consistent.
* [x] The summary is scoped and advisory, and acceptance coverage distinguishes demonstrated gaps from unassessed behavior.
* [x] Standard review assessed the material boundary while omitting restatement, cosmetic feedback, exhaustive strengths, low-impact suggestions, and continual narration.
* [x] The review did not mutate source, the plan, critique, research, or changes record, wrote only this record, did not execute validation, verified helper candidates at cited evidence before deciding they were not findings, and counted a requirement consistent only from a cited location.
* Checked boundary: Review the requirements, checked markers, validation, critique dispositions, implementation-time updates, and follow-up item across P01 and P02.
* Missing or limited evidence: No live Entra/Azure deployment, live PostgreSQL DDL-permission check, multi-replica startup, or assistive-technology session was exercised; the reported browser visual review used temporary API/auth mocks.
