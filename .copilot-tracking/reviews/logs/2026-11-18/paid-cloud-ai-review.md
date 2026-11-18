<!-- markdownlint-disable-file -->
# Review: Paid cloud AI

## Executive Summary

The repository changes conform to the accepted scope. The review completed without actionable findings. Local checks cover fail-closed admission, shared budget behavior across app instances, additive migration, and independent cloud opt-ins. Live Azure and real PostgreSQL integration were not exercised.

## What You May Not Know

The ledger retains worst-case reservations after failures. It does not reconcile actual billed usage or cap costs outside this web application.

## Findings and Proposed Routes

No substantive findings in the reviewed repository scope.

## Parent Decision Record

### Current Disposition

Review execution Complete; final outcome Conformant. No required repository follow-ups or outstanding review decisions. Live rollout is separately gated.

### Decision History

| Event | Subject | Source | Value | Rationale |
|---|---|---|---|---|
| RD-001 | Participation | User mode selection | Agent-owned | Handle it end to end |
| RD-002 | Walkthrough | Agent | skipped-auto | No findings or retained decisions |
| RD-003 | Execution | Agent | Complete | All in-scope contracts compared |
| RD-004 | Outcome | Agent | Conformant | Acceptance supported for repository changes |
| RD-005 | Continuation | Agent | Close repository work | Azure activation remains a separate approved operation |

## Validation Evidence

| Check | Status | Summary |
|---|---|---|
| Workspace production build and whitespace | Passed | Build and diff check passed |
| Paid web, provider, storage and deployment suites | Passed | 219 passed |
| Bicep compiler and mocked workflow | Passed | Independent opt-in, invalid configuration rejection, and disabled defaults |
| Real PostgreSQL harness | Skipped | No approved isolated test connection |
| Live Azure and billable smoke | Not run | Outside repository review scope |

## Review Record

### Scope and Evidence

* Task: paid-cloud-ai; full repository scope; 2026-11-18.
* Depth: standard, default. Execution: Complete. Direct comparison.
* Plan: .copilot-tracking/plans/2026-11-18/paid-cloud-ai-plan.md
* Critique: .copilot-tracking/reviews/plans/2026-11-18/paid-cloud-ai-plan-critique.md
* Changes: .copilot-tracking/changes/2026-11-18/paid-cloud-ai-changes.md
* Research: .copilot-tracking/research/2026-11-18/paid-cloud-ai-research.md

### Opening Review State

Compare both completed tasks against FR-001–FR-003 and NFR-001. Local validation evidence is available. Review can write only this record and does not approve any live paid action.

### Acceptance and Change Coverage

| Requirement | Assessment and evidence |
|---|---|
| FR-001 / P01-T01 | Met. apps/api/src/web_app.ts `paid_lyric_backend` is shared by the three text actions and awaits `reserve_lyric_action` before dispatch. apps/api/src/web_storage.ts `write` commits the reservation under the existing lock. The guarded ledger test covers exact-budget concurrency, per-action refusal, and retained failure reservations. |
| FR-002 / P01-T01 | Met. apps/api/src/lyric_cloud.ts `post` consumes a model or safety slot before token and transport work, and rejects oversized serialized payloads. The adapter test verifies extra requests never reach transport. Existing text gating and free composition remain separate from Speech. |
| FR-003 / P02-T01 | Met for repository wiring. infra/service.bicep `speechEnv` and `lyricEnv` map separate selectors, a Key Vault secret reference, and the managed identity. docs/azure-deployment.md has a private-network additive upgrade and live approval boundary. |
| NFR-001 | Met locally. The ledger contains no prompts, responses, owner identifiers, or secrets. Storage tests cover upgrade idempotence and importing reservations. Deployment shell and template checks used fictional configuration. |

### Critique and Follow-Up Assessment

PC-001: confirmed distinct 409 budget messages propagated by the web client. PC-002: confirmed additive upgrade documented for the private network. No material implementation-time plan divergence, business-source alignment entry, or unselected required follow-up.

### Reviewer Self-Check

Compared completed markers, all named requirements, critique resolutions, validation evidence, and scope boundaries. Live activation and provider pricing are not certified by this review.
