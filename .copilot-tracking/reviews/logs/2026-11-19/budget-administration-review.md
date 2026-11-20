<!-- markdownlint-disable-file -->
# Review: Budget administration

## Executive Summary

Review execution: Complete. Assessed outcome: Defects found. Full P01 acceptance
comparison at standard depth identified one Medium compatibility gap (RV-001).
Targeted tests, build/typecheck, and isolated desktop/mobile evidence support
the remaining requirements; deployed billing and live PostgreSQL are unverified.

The assessment is a proposal; final decisions are in Parent Decision Record.

## What You May Not Know

Live provider billing and deployed PostgreSQL operation are outside the local evidence boundary.

## Findings and Proposed Routes

<!-- rpi:review id=RV-001 -->
### RV-001 [Medium]: Budget administration rejects previously valid Speech defaults

* Related scope: FR-001, FR-004, P01-T02; preserving existing operator settings.
* Expected: budget visibility accepts the existing Speech total-budget representations while writes retain the new strict decimal contract.
* Observed: apps/api/src/web_app.ts `positive_decimal` uses `decimal`, which accepts positive forms such as `1e2` and `.5`. New `budget_defaults` applies the stricter admin-write regex to those operator defaults and returns 503. `loadAdmin` now waits for this endpoint alongside access lists.
* Impact: a previously valid Speech configuration prevents loading budget and access administration. Persisted overrides do not avoid the parse.
* Resolution condition: normalize existing valid Speech defaults without weakening strict administrative update validation; cover valid alternate representations and invalid defaults through the HTTP endpoint.
* Proposed destination: rpi-implement through a new plan phase.
* Smallest useful next action: reuse the existing decimal parser for Speech default normalization and test the protected read/write distinction.

## Parent Decision Record

### Current Disposition

* Participation: agent-owned; walkthrough skipped-auto (RD-001/002).
* Execution: Complete (RD-003).
* Final outcome: Conformant after validated localized remediation (RD-007/008).
* RV-001 accepted and resolved by P02-T01 (RD-005/006/007).
* Pending decisions and required follow-ups: none. Session acceptance established; stop automatically (RD-009).

### Decision History

| Event | Subject | Decision source | Status or value | Rationale |
|---|---|---|---|---|
| RD-001 | Participation | User-authorized automatic parent | agent-owned | User selected Handle it end to end; no retained Review decisions |
| RD-002 | Walkthrough | Automatic parent | skipped-auto | No user-owned decisions; resolve from source evidence |
| RD-003 | Execution | Parent | Complete | All material tasks/contracts and validation assessed |
| RD-004 | Outcome | Parent | Defects found | RV-001 prevents acceptance of valid operator defaults |
| RD-005 | RV-001 route | Parent | accepted; rpi-plan then rpi-implement | Required in-scope compatibility fix, not optional cleanup |
| RD-006 | Continuation | Automatic parent | select RV-001 in this session as P02 | Highest and only required group; reuse existing decimal parser, no widened public update contract |
| RD-007 | RV-001 resolution | Parent after P02 | resolved | Existing decimal parser normalizes valid Speech defaults; 72 endpoint tests pass including scientific/leading-dot defaults, invalid configuration and strict update rejection; final typecheck/API build pass |
| RD-008 | Outcome | Parent | Conformant | Sole material defect resolved; prior scoped assessment remains unchanged, localized fix validated without repeat review |
| RD-009 | Session acceptance / continuation | Automatic parent | established; stop | All FR/NFR supported by P01/P02 and current validation; no required findings, decisions or blockers; subscription billing remains excluded |

## Validation Evidence

| Check | Status | Summary |
|---|---|---|
| API targeted budget/storage-admin/storage/web_app tests | Passed | 155; one skipped live PostgreSQL test |
| Updated storage-admin tests | Passed | 45; one skipped |
| Frontend App suite | Passed | 17 |
| Repository typecheck and build | Passed | API, web and operator scripts |
| Desktop/mobile browser fixture | Passed | 1400/390px, exact save, announcement, wrapping and keyboard focus |
| Live PostgreSQL and paid billing | Skipped | Opt-in engine unavailable/not selected; no live billing authorized |

These are implementation-session results. Review executed no new validation.

## Risks, Blockers, and Residual Work

Initial blockers: none. RV-001 was routed to local follow-up; its resolution
and current status are recorded in Parent Decision Record without rewriting the original finding.
Subscription billing remains explicitly excluded and is not required follow-up.

## Review Record

### Scope and Evidence

Task: budget-administration. Date: 2026-11-19. Scope: full P01 and P01-T01/T02/T03.
Depth: standard, initial-pass default. Execution: Complete. Helpers: none.
Plan: .copilot-tracking/plans/2026-11-19/budget-administration-plan.md
Critique: .copilot-tracking/reviews/plans/2026-11-19/budget-administration-plan-critique.md
Changes: .copilot-tracking/changes/2026-11-19/budget-administration-changes.md
Research: .copilot-tracking/research/2026-11-19/budget-administration-research.md
Candidate: current local implementation and validation from this session.

### Opening Review State

Goal: establish persistent authorized budget administration and combined $5 lifetime trial enforcement against unchanged accounting safeguards.
Evidence readiness: all plan markers complete, changes entries reconciled, targeted tests/build/browser evidence available.
Acceptance basis: FR-001 through FR-004, NFR-001 through NFR-003, tasks and critique.
Boundary: directly changed storage, import, startup, API, UI, tests, and docs; no deployment or live billing verification.
Read-only boundaries: only this review record is written during comparison.
Authority: parent compares, records findings, and owns final outcomes/routes.
Initial blockers: none.

### Acceptance and Change Coverage

| Requirement or scope | Implementation and validation evidence | Assessment |
|---|---|---|
| FR-001 / P01-T01,T02 | `budgets_as_admin`, `speech_usage`, `reserved_text_cost`, admin summaries and separate actuals | Gap only in valid Speech-default normalization, RV-001 |
| FR-002 | `set_budget_as_admin` exact input, transaction access check/upsert, `saveBudget`, persistence/zero/lowered tests | Met |
| FR-003 | $5 fallback in `user_budget`, owner-aware lyric/score/Speech reservations, all `paid_lyric_backend` call sites, own-budget route | Met |
| FR-004 | Effective overrides at reservation/preflight, combined `jingle_quote`, score replay before new reservation, existing Speech reconciliation gates | Gap only in administrative compatibility, RV-001 |
| NFR-001 | Money precision 28; strict discriminated update; serialized writer transactions; own-only endpoint and protected admin storage | Met |
| NFR-002 / P01-T01 | Additive schema, import explicit-column allowlist and legacy owner handling, upgrade/readiness additions; storage-admin tests | Met within local SQL-backed PostgreSQL fixture; live engine skipped |
| NFR-003 / P01-T02 | Native label/fieldset/help/status/alert, busy state, isolated 390px overflow and keyboard evidence, save/load UI tests | Met |
| P01-T03 | One added focused test file; existing affected suites, full build/typecheck, docs and isolated browser | Met; live validation explicitly excluded |

### Critique and Follow-Up Assessment

Initial critique Complete/Pass, no findings to resolve. No material plan changes
or divergent decisions during implementation; CSS cascade fixes are local
judgment. No dependent work resumed across an unresolved user decision.
Research D1-D5 are supported by the ledgers and authorized scope.
Business Alignment: no BRD/PRD/ADR source requirements or alignment entries.
Subscription billing is the sole excluded future item; no premature entitlements.

### Reviewer Self-Check

* [x] All FR/NFR, P01 task markers, critique, updates, validation and exclusions assessed.
* [x] Finding is substantive with expected/observed evidence, severity, resolution and route.
* [x] Execution and outcome kept separate; evidence limits are explicit.
* [x] No missing evidence represented as a demonstrated defect.
* [x] Standard scoped comparison; no cosmetic suggestions or duplicate helper reviews.
* [x] Only this record written during assessment; no source changes or validation run.
* Checked boundary: P01-T01/T02/T03 and directly changed contracts/docs/tests.
* Limits: local PostgreSQL adapter fixture, not a live PostgreSQL service; no live billing.
