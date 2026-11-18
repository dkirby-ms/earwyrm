<!-- markdownlint-disable-file -->
# Task Research: Paid cloud AI

| Date | Researcher | Output mode |
|---|---|---|
| 2026-11-18 | rpi-research | convergence |

## Executive Summary

The existing web API can host chat, lyric generation, and Speech without a new agent service. Configure existing Azure services and block paid text actions before they can exceed a durable allowance. Research completed; exact provider prices and live identities must be verified by the operator before enabling.

## What You May Not Know

One lyric action can make multiple model requests, and Content Safety has its own transactions. In-memory locking, Azure billing alerts, or only counting user messages would not bound this spend.

## Findings

### F1: Admission must cover the whole action

Q1; evidence-backed (C1, C2). Discussion uses up to two model and two safety calls. A draft can use one preflight plus up to four generation and four assessment calls, and at most one pair of safety requests. Three drafts multiply those ceilings. Use conservative ceilings for each action and enforce them in the adapter so future control flow changes cannot spend beyond the reservation. Existing output cap is 1,200 tokens per call; add a serialized-request byte limit. These counts apply to the authenticated web paths, not standalone tools.

### F2: The web store can enforce a cumulative allowance

Q2; evidence-backed (C3). Its SQLite write transaction and PostgreSQL advisory lock already serialize writers. Persist exact USD upper-bound reservations before provider access. Retain the full reservation even with failures or ambiguous charges; it is not an invoice and can exhaust sooner than actual costs. Use explicit additive PostgreSQL upgrade, not startup DDL.

### F3: Deployment can attach to approved resources

Q3; evidence-backed (C4, W1). Existing workflow and Bicep deliver the web app and already use a Key Vault reference. Optional settings and an app managed identity can enable the two paid paths separately, without creating new AI services or public MCP endpoints. Speech evidence must be explicitly placed on the private mount; it is not in the cloud image. Operator must verify model compatibility, resource-scope RBAC, network access, and pricing.

## Recommendation and Alternatives

Select an application-wide cumulative cap and full-action worst-case reservation using operator-approved upper bounds for one model and one safety request. The operator should use the deployed model's full input context at uncached pricing plus maximum output, and upper-bound all billable units in a safety request. This is intentionally conservative and avoids guessing token prices or interpreting absent usage data. Reject alert-only enforcement and in-memory counters; defer actual-usage credits (including reconciliation for unknown outcomes) and separate entitlements.

## Scope and Questions

Help the application owner enable voice and chat safely without changing entitlements. Determine how to enforce spending before provider calls and configure the existing deployment. No live changes, credentials, or billable tests during research.

| ID | Question | Status |
|---|---|---|
| Q1 | What calls incur costs and how are they bounded? | Answered by F1 |
| Q2 | What can reserve an app-wide budget durably and atomically? | Answered by F2 |
| Q3 | How can cloud operators opt in without weakening deployment gates? | Answered by F3 |

## Decisions and Feedback

| ID | Decision | Status | Basis |
|---|---|---|---|
| D1 | Retain paid Speech entitlement | Confirmed | User request |
| D2 | Reserve full upper bound per action, including screening | Selected | C1–C3; restart and ambiguous spend correctness |
| D3 | Use approved existing Azure resources | Selected | C4/W1; no new public service or provisioning requirement |

## Risks and Open Questions

No live approval, price evidence, model selection, smoke test or RBAC verification is implied. Operators must approve concrete values and compare actual bills; other apps and subscription costs are not capped by this ledger. A missing ledger or incomplete paid configuration must not allow a paid call.

## Planning Readiness and Next Step

| Field | Record |
|---|---|
| Research disposition | Executed |
| Decision participation | Agent-owned, automatic user-selected |
| Planning Readiness | Ready; C1–C4 and W1 identify runtime and deployment paths |
| Research depth | Wider, Deeper, Contrarian; no helpers |
| Blockers | None for repository changes; live approval and evidence remain required |
| Continuation | Automatic RPI; plan next |
| Primary evidence file | .copilot-tracking/research/2026-11-18/paid-cloud-ai-research.md; session date |

## Research Record

### Method and Boundaries

Balanced, default. Start from the paid API dispatch paths, provider limits, persistence, Azure workflow, and Microsoft Learn. Prior chat confirmed an existing shared model adapter; verify against current worktree. Evidence path is .copilot-tracking/research/2026-11-18/paid-cloud-ai-research.md, using the session date.

### Extensions and Participation

Selected tracking location, tracking, Markdown and licensing conventions for evidence. No delegation needed for source tracing. Automatic, agent-owned by user's end-to-end choice; no intake decision outstanding.

### Research Cycle Log

1. Wider: followed the three paid routes and deploy workflow (C1/C4). Scope includes safety and existing protected deploy.
2. Deeper: traced retry and screening stages and schema bootstrap (C2/C3). Count assessments inside the loop, but notice screening returns or throws terminally.
3. Contrarian: tested design reasoning against retries, app restarts, storage migration, manual configuration drift and missing evidence (C2–C4/W1). Keep durable reservations even for unknown outcomes and preserve the ledger in migration. A billing alert is useful but cannot replace synchronous admission.

Synthesis accepts conservative upfront reservations and default-off wiring; no second cycle needed because the remaining unknowns are operator-specific paid rollout evidence, not implementation choices.

### Evidence Log

| ID | Evidence | Location |
|---|---|---|
| C1 | Two MCP text paths plus direct three-option route | apps/api/src/web_app.ts `/api/chat` and `/api/lyrics/options` |
| C2 | Stage counts, limits, and terminal screening | apps/api/src/lyric_service.ts `write_candidate`; apps/api/src/lyric_mcp.ts `suggest_jingle`; apps/api/src/lyric_cloud.ts `complete`, `screen` |
| C3 | Durable write serialization and explicit PostgreSQL schema management | apps/api/src/web_storage.ts `write`; apps/api/src/persistence.ts `transaction`; apps/api/src/bootstrap_database.ts `import_sqlite` and `upgrade` |
| C4 | Default disabled, OIDC deployment gates; evidence not copied into image | .github/workflows/deploy-web.yml `deploy`; infra/service.bicep `app`; Dockerfile.web runtime stage |
| W1 | Container Apps Key Vault secret configuration | [Manage secrets in Azure Container Apps](https://learn.microsoft.com/en-us/azure/container-apps/manage-secrets); retrieved 2026-11-18 |

### Artifact Self-Check

Questions answered; findings linked to stable evidence, participation and safety boundaries recorded, and three waves complete. No live verification claimed.
