<!-- markdownlint-disable-file -->
# Review: Unified brief workspace

## Executive Summary

* Assessment: P01-P03 delivers the approved consolidation and real custom/lyric capabilities, but one paid-mode transition unintentionally blocks offline rendering.
* Review execution: Complete
* Assessed outcome: Defects found
* Severity summary: Critical 0, High 0, Medium 1, Low 0.
* Validation coverage: supplied passing evidence for 115 API/lyric tests, nine web tests, root typecheck and production build.
* Limits: local assessment without independent helpers, live provider use, browser rendering or participant testing.

Parent Decision Record owns the final outcome and continuation.

## What You May Not Know

Unrendered custom inputs are session-scoped. Lyric alternatives require separately enabled paid cloud services and explicit consent; they remain independent review drafts rather than automatically replacing audio scripts. No visual or usability validation is claimed.

## Findings and Proposed Routes

<!-- rpi:review id=RV-001 -->
### RV-001 [Medium]: Unavailable paid mode also traps the user out of offline rendering

After an Azure render leaves usage awaiting reconciliation, `paidAvailable` becomes false while `includeVocals` remains true. The checkbox is then disabled, so the user cannot turn vocals off, and the sole render action is also disabled. Offline rendering previously remained usable independently of paid availability.

* Related scope: P02-T01, FR-002, NFR-001 and the requirement to preserve existing intended behavior.
* Expected behavior: unavailable paid work prevents another paid dispatch, not switching back to offline rendering.
* Observed behavior and evidence: apps/web/src/App.tsx, `paidAvailable` and the batch controls: the checkbox uses `disabled={busy || !paidAvailable}` and the primary action uses `(includeVocals && !paidAvailable)`. The state is retained after `startPaidRender`.
* Impact: users must reconcile paid usage or reset the page merely to render an instrumental preview.
* Resolution condition: while vocals are selected and a paid attempt is unresolved, users can disable vocals and dispatch an instrumental render, while another vocal dispatch stays blocked.
* Proposed destination: `rpi-implement`.
* Smallest useful next action: correct the mode-switch gate and extend the existing paid-flow web test to cover the transition into unresolved usage.

## Parent Decision Record

### Current Disposition

* Based on events: RD-001 through RD-009
* Review execution: Complete
* Final outcome: Defects found in the original Review; the required defect is now resolved by validated child implementation, not a second Review.
* Finding decisions and next actions: RV-001 accepted and resolved by `paid-mode-recovery`; no required finding remains.
* Decisions still needed: none; walkthrough skipped-auto.
* Session acceptance: established from the original scoped assessment plus the child's current regression/typecheck/build evidence. No required follow-up remains; visual/participant and live-cloud limits are preserved.

### Decision History

| Event | Subject | Decision source | Status or value | Proposed destination | Final destination | Owner | More information needed | Smallest next action | Rationale |
|---|---|---|---|---|---|---|---|---|---|
| RD-001 | Participation | User automatic-mode authorization | agent-owned | none | none | RPI parent | none | Compare evidence | User selected end-to-end execution; no retained Review decisions. |
| RD-002 | Walkthrough | Automatic RPI parent | skipped-auto | none | none | RPI parent | none | Decide RV-001 from evidence | Agent-owned decisions do not require a routine approval question. |
| RD-003 | RV-001 route | Automatic RPI parent | accepted | rpi-implement | rpi-implement | paid-mode-recovery child | none | Fix paid-to-offline transition and extend existing test | Required regression in the sole batch action; preserve the paid dispatch gate. |
| RD-004 | Review execution | Automatic RPI parent | Complete | none | none | RPI parent | none | Continue through Follow-up | All material supplied requirements and changes assessed once. |
| RD-005 | Review outcome | Automatic RPI parent | Defects found | none | none | RPI parent | RV-001 resolution evidence | Do not claim acceptance yet | Passing initial checks did not cover the demonstrated mode-switch trap. |
| RD-006 | Continuation | Automatic RPI parent | accepted | required in-scope follow-up | child paid-mode-recovery | RPI parent | Focused regression and current client build | Reuse adequate research and plan the narrow correction | Highest-ranked and only required finding; no additional critique or Review unless user requests one. |
| RD-007 | Child assignment | Automatic RPI parent | assigned, not resolved | RV-001 | child paid-mode-recovery | RPI parent | Regression evidence | Create recorded child state | Identity paid-mode-recovery; state .copilot-tracking/rpi-sessions/2026-11-16/unified-brief-workspace/paid-mode-recovery-state.json; plan .copilot-tracking/plans/2026-11-16/paid-mode-recovery-plan.md; changes .copilot-tracking/changes/2026-11-16/paid-mode-recovery-changes.md. |
| RD-008 | RV-001 resolution | Automatic RPI parent | resolved | rpi-implement | child paid-mode-recovery complete | RPI parent | none | Assess session acceptance | Child P04-T01 demonstrated failure at the disabled checked toggle before correction; afterward the test blocks paid dispatch, deselects vocals and verifies instrumental dispatch. Nine web tests, root typecheck and build pass. Evidence: .copilot-tracking/changes/2026-11-16/paid-mode-recovery-changes.md. Changes validated, not re-reviewed. |
| RD-009 | Session acceptance and continuation | Automatic RPI parent | accepted; stop completed session | Follow-up assessment | no further selected work | RPI parent | none for implemented scope | Persist stopped parent/child states | FR-001 through FR-005 and NFR-001 through NFR-004 supported by the scoped assessment, 115 applicable API/lyric tests, nine current web tests, root typecheck/build and clean whitespace check. Child FR-006/NFR-005 resolves the only required finding. No optional scope is manufactured. Browser/participant and live-provider execution remain unclaimed. |

## Validation Evidence

| Command | Scope | Status | Summary |
|---|---|---|---|
| `npm run test --workspace @earwyrm/api -- tests/web_app.test.ts tests/creative-lyrics.test.ts` | Protected HTTP and lyric contracts | Passed | 115 tests across two files. |
| `npm run test:web` | Consolidated workspace interactions | Passed | Nine tests; six new cases; no removals. |
| `npm run typecheck` | Complete repository | Passed | Both workspaces and root scripts. |
| `npm run build` | Complete repository | Passed | API, production Vite client and root scripts. |
| Browser/participant checks | Visual layout and usability | Unavailable | No browser/discovery tools or participants; not inferred from DOM tests. |

## Risks, Blockers, and Residual Work

* Blockers: no decision blocker; RV-001 prevents session acceptance until corrected.
* Remaining active work: original plan execution complete; required correction assigned through the parent continuation.
* Residual work: no optional cleanup selected. Browser/participant validation remains an explicit evidence limit.

## Review Record

### Scope and Evidence

* Task ID: unified-brief-workspace
* Review date: 2026-11-16
* Review scope: full task, P01-P03
* Assessed boundary: FR-001 through FR-005, NFR-001 through NFR-004, changed client/API/test/docs contracts and confirmed user direction.
* Review depth and provenance: standard; default under automatic RPI.
* Candidate identity: current uncommitted changes on main; task unified-brief-workspace.
* Review execution: Complete
* Helper use: none; dispatch capability unavailable. The parent compares the evidence locally, using relevant code-review criteria.
* Plan: .copilot-tracking/plans/2026-11-16/unified-brief-workspace-plan.md
* Plan critique: .copilot-tracking/reviews/plans/2026-11-16/unified-brief-workspace-plan-critique.md
* Changes: .copilot-tracking/changes/2026-11-16/unified-brief-workspace-changes.md
* Research: .copilot-tracking/research/2026-11-16/unified-brief-workspace-research.md

### Opening Review State

* Interpreted review goal: check that consolidation delivers real custom-input, lyric and rendering capabilities while preserving ownership, evaluation state and paid safeguards.
* Review scope: full P01-P03 task.
* Evidence readiness: all plan markers checked; completed-work entries, test/build output and documentation current.
* Acceptance basis: confirmed user request, approved structure and explicit plan requirements; critique Complete/Pass with zero findings.
* First comparison boundary: supplied plan/changes/research/critique plus changed production/test/docs code, not unrelated baseline issues.
* Active read-only boundaries: only this review record is review-writable; no source or implementation artifact mutation or validation execution.
* Authority: parent compares evidence and records final outcome, route dispositions and continuation here.
* Initial blockers: none.

### Acceptance and Change Coverage

| Requirement or scope | Implementation and validation evidence | Assessment | Finding or rationale |
|---|---|---|---|
| P01-T01; FR-001, FR-002, FR-004; NFR-001, NFR-002 | apps/api/src/workspace_briefs.ts, `create_custom_brief`/`validate_custom_brief`; apps/api/src/web_app.ts, selection, confirmation, manifest snapshots, owner recovery and evaluation routes; HTTP tests | Met | Content identities, strict inputs, immutable evaluation context, bounded mixed batches and owner filtering retain existing storage contracts. |
| P01-T02; FR-003; NFR-001, NFR-003 | apps/api/src/web_app.ts, lyric routes; existing apps/api/src/lyric_service.ts, `LyricWriter`; HTTP/creative-lyric tests | Met | Consent, enablement, entitlement and valid configuration precede provider use; three bounded slots retain screened/held/rejected/unavailable outcomes and deduplicate without extra retries. |
| P02-T01; FR-002; NFR-001 | apps/web/src/App.tsx, batch paid-mode gate | Gap | RV-001: disabled paid mode cannot be deselected, unintentionally blocking offline rendering. |
| P02-T01; FR-001, FR-004, FR-005 | apps/web/src/App.tsx, `BriefEditor`, independent inspection/selection, scoped detail sections, history and protected output UI; apps/web/src/index.css, studio grid and bounded regions; nine web tests | Met within source/DOM boundary | Consolidation, structured entry/upload, session recovery, render-completion context and draft preservation are supported. Visual/responsive runtime quality is unassessed. |
| NFR-002, NFR-003, NFR-004; P03-T01 | Supplied focused tests, root typecheck and build; unchanged dependency manifests and database schema | Met within executed checks | All recorded checks pass without live identity/provider calls. The missing paid-to-offline transition is RV-001, not a claimed test pass. |
| P03-T02; FR-005; NFR-003, NFR-004 | docs/audio-poc/web-app.md, workspace, JSON, retention and paid lyric sections | Met | Documentation matches input limits, optional enablement, status distinctions and independent lyric drafts. |
| Implementation-time context-preservation judgment | apps/web/src/App.tsx, `inspectCompletedRun`; existing web test extended for a draft and unrelated active brief | Supported | Keeps the accepted architecture and prevents automatic context replacement; no significant decision or business-source divergence. |

### Critique and Follow-Up Assessment

* Latest critique: Complete/Pass, zero findings; no critique disposition was bypassed.
* Material revisions: none. Local output-pinning/context-preservation judgment supports P02-T01 without changing accepted architecture or scope.
* Dependent-work pause assessment: no unresolved significant decision or premature dependent-work resumption established.
* Justification assessment: session-scoped drafts, three candidate slots and separate lyric drafts match research D3-D6 and the accepted plan.
* Business Alignment: none; no cited BRD, PRD or ADR and no Business Alignment changes.
* Existing follow-up parity: plan and changes record each declare none. RV-001 is a new required regression, not optional scope expansion.

### Reviewer Self-Check

* [x] Every material requirement, marker, update, critique disposition, check and follow-up is assessed or explicitly limited.
* [x] Findings are evidence-grounded with expected/observed behavior, severity, resolution conditions and routes.
* [x] Execution, outcome, validation limits and proposed routes remain distinct and consistent.
* [x] Review remains within the supplied scope and writes only this record.
* Checked boundary: P01-P03, FR-001 through FR-005, NFR-001 through NFR-004, all changed source/test/docs, critique, local judgment and recorded validation.
* Missing or limited evidence: no browser visual, participant or live cloud execution; no technical accessibility conformance assessment or human sign-off.
