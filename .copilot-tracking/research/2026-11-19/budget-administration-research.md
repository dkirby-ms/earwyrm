<!-- markdownlint-disable-file -->
# Task Research: Budget administration

| Field | Value |
|---|---|
| Date | 2026-11-19 |
| Researcher | rpi-research |
| Output mode | convergence |

## Executive Summary

Research complete. Extend the existing access administration with shared text/Speech limits and per-user lifetime allowances. Preserve immutable actuals and distinguish them from conservative charged reservations.

## What You May Not Know

Text costs are worst-case reservations, not measured provider charges. Historical lyric reservations have no owner. They must stay charged globally without fabricated user attribution.

## Findings

### Shared limits currently come from environment configuration

The database contains consumption rather than configurable limits. Text and score reservations share a cumulative cap; Speech has its own ledger and reconciliation rules. Persist admin overrides while retaining environment totals as initial defaults and existing per-operation safety limits.
Q1; evidence-backed finding; C1, C2. High confidence from provider call sites and transactional storage.

### User budgets must cover every paid path

Legacy lyrics, chat, score composition, jingle writing, and Speech all reserve independently. Every new reservation must test the combined owner's charged amount under the existing global writer lock. A full-jingle preflight should reject insufficient trial balance before writing begins, but individual stages remain authoritative under concurrency.
Q1/Q3; evidence-backed finding; C1, C2. Legacy ownerless lyric costs cannot be reconstructed.

### Existing admin authorization and forms are reusable

Current administrator methods recheck enabled/admin permissions inside the transaction. Add budget APIs with the same protection, strict decimal strings, and explicit errors. Extend the existing admin section rather than introduce new navigation or aesthetics.
Q2; evidence-backed finding; C3, C4. High confidence.

### Explicit PostgreSQL upgrades and imports must evolve together

SQLite initializes additively; PostgreSQL only upgrades by operator command. New tables and nullable lyric owner columns must participate in bootstrap, upgrades, imports, and readiness validation.
Q1/Q3; evidence-backed finding; C5. High confidence from source and upgrade test contracts.

## Recommendation and Alternatives

Select database-backed limit overrides with $5 as the default per-user lifetime allowance. Existing owner-attributed spend counts for existing users; historical ownerless lyric charges remain globally counted and visibly unattributed. Limits may be lowered below usage without deleting history: remaining becomes zero and new spending stops.

| Option | Benefits | Costs and risks | Evidence | Disposition |
|---|---|---|---|---|
| Extend existing reservation ledgers | Preserves current paid safety and reconciliation | Text consumption remains conservative | C1/C2 | Selected |
| Replace with a new universal billing ledger | Future billing flexibility | Large migration, duplicated records, premature subscription design | C1/C5 | Deferred |
| Reset actuals to grant credit | Small apparent change | Destroys cost evidence and auditability | C1 | Rejected |

## Scope and Questions

Goal: give administrators visibility and editing controls for budgets, and enforce a default $5 total budget per user. Audience: maintainers and administrators.
In scope: accounting persistence, API authorization, admin and user budget UX, enforcement, tests, directly related documentation.
Out of scope: live deployment, production data changes, subscription payments, periodic premium grants.
Criteria: consistent recorded actuals, adjustable limits, reservation-aware enforcement, unchanged provider safety caps, backward-compatible storage initialization.

| ID | Question | Status |
|---|---|---|
| Q1 | How are global actuals, limits, and reservations stored and enforced? | Answered C1/C2/C5 |
| Q2 | How can administrators inspect and change budgets securely? | Answered C3/C4 |
| Q3 | How should lifetime trial limits relate to existing accounts and future subscriptions? | Answered C1/C2/C5 |

## Decisions and Feedback

| Group | Decision or feedback item | Status | Owner | Rationale |
|---|---|---|---|---|
| D1 | $5 lifetime allowance for all users, including existing users/admins; no monthly reset | Confirmed | Agent | User total-trial requirement; no unsupported exemptions |
| D2 | Actuals are read-only; administrators edit shared limits and individual lifetime limits | Confirmed | Agent | Preserve reconciled evidence; limits grant future headroom |
| D3 | Existing env totals are defaults, persisted overrides govern total enforcement | Confirmed | Agent | Enables actual administrative control without weakening per-call caps |
| D4 | No subscription plans, checkout, or recurring entitlements | Deferred | User scope | Future groundwork only |
| D5 | Preserve existing Operate admin layout and design system | Confirmed | Agent | Local extension; user authorized end-to-end decisions |

## Risks and Open Questions

Conservative text reservations can exceed actual provider charges. Label these correctly rather than inventing actuals. Keep uncertain calls charged and preserve existing Speech reconciliation gates. No blockers remain.

## Planning Readiness and Next Step

Ready based on C1-C5 and D1-D5. Research disposition: executed. Agent-owned automatic parent proceeds to Plan; no user acknowledgment required.

## Research Record

### Method and Boundaries

Balanced posture by default; local repository evidence only, no external sources needed initially.
Root: .copilot-tracking/research/; date supplied by user context: 2026-11-19.
Primary evidence: .copilot-tracking/research/2026-11-19/budget-administration-research.md.
Prior knowledge: repository memories unverified and not relied upon.
Candidate areas: API budget storage and paid-provider call sites; admin authorization and frontend; existing tests.
No helpers required for this continuous code trace. No explicit deadline.

### Extensions and Participation

Selected tracking location, tracking conventions, Markdown, writing style, and licensing instructions for evidence artifacts.
UI design skill selected: impeccable context and new-work guidance establish an inherited local Operate extension, no new visual world.
Telemetry overlay applies to implementation audit changes later; no new emitters in research.
User chose Handle it end to end. No intake question needed: purpose and scope are sufficient.

### Research Cycle Log

Cycle 1, balanced, no helpers:

1. Wider: inspected budget, admin, storage, and UI surfaces (C1-C5). Reflection: limits are environment-defined; stored values are ledger consumption.
2. Deeper: traced lyric backend creation, score retry claims, jingle quotes, Speech reservations, reconciliation, and import upgrade contracts. Reflection: owner attribution is missing only from legacy lyrics; existing locks allow cross-feature enforcement.
3. Contrarian: challenged treating reservations as actuals, resetting trials for existing users, and building a new billing system. Reconciled AI actuals live in jingle evidence but cannot safely replace independent text reservations without call-level attribution. Reflection: report actuals separately and preserve charged ceilings.

Synthesis: accept extending current ledgers, reject spend resets, defer subscription billing. Another cycle is unnecessary: every material question has source-backed answers, and further subscription research would widen scope.

### Evidence Log

| ID | Claim or finding | Source |
|---|---|---|
| C1 | Transactional cumulative ledgers, admin checks, Speech actuals | apps/api/src/web_storage.ts `reserve_lyric_action`, `claim_score_compose`, `reserve_paid_run`, `require_admin`, `reconcile_attempt` |
| C2 | Paid call paths and environment pricing/caps | apps/api/src/web_app.ts `paid_lyric_backend`, `jingle_quote`, `paid_configuration`; apps/api/src/lyric_budget.ts `lyric_budget` |
| C3 | Existing strict admin routes and error handling | apps/api/src/web_app.ts `/api/admin/users`, `authorized`, `errors` |
| C4 | Established admin surface and exact-money convention | apps/web/src/App.tsx `loadAdmin`, `saveUserAccess`, `combinedCost`; apps/web/DESIGN.md `Generation Costs` |
| C5 | Explicit additive upgrades and import compatibility | apps/api/src/bootstrap_database.ts `WEB_TABLE_COLUMNS`, `import_sqlite`, `upgrade_postgres_store`; apps/api/tests/storage-admin.test.ts |

All evidence verified by direct source reads; high confidence, retrieval metadata not applicable. No external sources or conflicting claims.

### Artifact Self-Check

Checked: user-facing synthesis, evidence states and locators, scope, all three waves and reflections, alternatives, decisions, readiness, extensions, no helpers, no secrets, and research-only write boundary. No missing material sections.
