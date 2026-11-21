<!-- markdownlint-disable-file -->
# Task Research: Admin job diagnostics

| Field | Value |
|-------|-------|
| Date | 2026-11-20 |
| Researcher | RPI Research |
| Output mode | convergence |

## Executive Summary

Failures can occur before any render record exists, and the diagnostic ID currently correlates process logs rather than a durable job record. Preserve a minimal per-request record from the start, expose it only to administrators, and keep the existing access and spending workflows. Research is complete for planning; historical failures cannot be reconstructed from current records alone.

## What You May Not Know

Provider error bodies and headers are untrusted: even fields named code, parameter or request ID can carry arbitrary strings. Sanitization must be stricter than truncating free text, and missing evidence must remain explicitly unavailable. A failed or interrupted job does not establish whether provider usage occurred.

## Findings

### F1: Early failures have no durable job lookup

The browser jingle route starts diagnostics before validating its input, but render and paid-attempt records are only created later. Progress is process-local and cleared at the end. A diagnostic ID in the response can correlate logs, but those logs do not provide an application lookup. A durable request-level record can cover early failure and interruption; it cannot recreate old details.

* Questions: Q1
* Evidence state: evidence-backed finding
* Evidence: C1, C2
* Confidence: high for the browser-jingle route; other endpoints are outside this request.

### F2: Provider response details are discarded deliberately

The lyric and score adapters currently translate failed HTTP responses into stable internal failure codes, except that a known content filter is classified specially. Their bodies are not safe to persist verbatim. Request IDs, provider codes, and parameter identifiers need bounded validation or explicit allowlists and must never carry messages, URLs, credentials or prompts.

* Questions: Q1, Q3
* Evidence state: evidence-backed finding
* Evidence: C3, C4
* Confidence: high for observed code; provider-specific response variations must be handled as unavailable when not recognized.

### F3: Admin access and accounting are separate requirements

The existing page exposes access decisions, permission changes, shared budgets, per-user allowances, and lyric reconciliation. These remain functional after the redesign. Billing totals are not evidence of an individual job's success or actual provider charge.

* Questions: Q2, Q3
* Evidence state: evidence-backed finding
* Evidence: C5, C6
* Confidence: high for the present implementation.

### F4: SQLite and PostgreSQL have different schema lifecycles

SQLite initializes schema on startup; PostgreSQL validates an explicitly initialized schema and uses an additive upgrade. A diagnostics table must be included in the applicable fresh, upgrade, import, reset, and validation paths without changing existing data. The startup and existing deployment behavior must be checked before implementation.

* Questions: Q3
* Evidence state: evidence-backed finding
* Evidence: C7
* Confidence: high for inspected code; deployment is not part of this task.

## Recommendation and Alternatives

Select durable, bounded diagnostic records keyed by the existing server-owned diagnostic ID, with admin-only inspection. Preserve error-specific metadata only through strict validation and show unavailable fields honestly. Retain the current product design world while reorganizing the admin surface around the operator's tasks.

| Option | Benefits | Costs and risks | Evidence | Disposition |
|--------|----------|-----------------|----------|-------------|
| Durable request-level diagnostics | Covers failures before render and survives restarts | Requires schema upgrade and bounded data policy | C1, C2, C7 | Selected |
| Existing process logs only | No storage migration | Not a reliable in-app job lookup | C2 | Rejected |
| Billing or render records only | Reuses existing records | Misses early failures and cannot prove provider outcomes | C1, C6 | Rejected |
| Save raw provider errors | Potentially detailed | Can leak credentials and customer content | C3, C4 | Rejected |

## Scope and Questions

* Goal: establish how to redesign the admin screen around job inspection and preserve sanitized provider codes, rejected parameter names, and request IDs.
* Audience and use: PoC administrators diagnosing individual generation jobs.
* In scope: job lifecycle, persistence, provider failures, admin authorization, admin UI, existing design guidance and relevant tests.
* Out of scope: deployment, live paid generation, unrelated product work, sensitive content in diagnostics.
* Criteria: job-specific visibility, truthful outcomes, safe diagnostics, preserved admin functions, and a usable responsive admin experience.
* Requested output: evidence-backed recommendation supporting implementation planning.

| ID | Question | Source | Status |
|----|----------|--------|--------|
| Q1 | How are jobs and provider failures identified, stored, and exposed? | User request | Answered F1-F2 |
| Q2 | What admin functions and design constraints must be retained? | User request | Answered F3 |
| Q3 | What privacy, authorization, compatibility, and verification constraints apply? | Inferred from request | Answered F2-F4 |

## Decisions and Feedback

Automatic mode delegates research decisions to the agent. User selected the web application and end-to-end progression.

Impeccable product confirmation: user selected job lookup while preserving existing access and budget operations. Do not expose prompts or raw provider messages.

## Risks and Open Questions

Provider fields can contain sensitive content even when syntactically valid. Implementation must test hostile values and absence of raw data. Existing historical jobs cannot acquire evidence that was never stored. Browser inspection requires a safely isolated authenticated fixture. Status after process interruption must not imply success or failure.

## Planning Readiness and Next Step

| Field | Record |
|-------|--------|
| Research disposition | executed |
| Decision participation | agent-owned; end-to-end selection |
| Planning Readiness | Ready; C1-C7 cover the core path and constraints |
| Research depth and helpers | Balanced; wider, deeper, contrarian completed without helpers |
| Blockers | None known |
| Output mode and planning support | convergence; supports planning when ready |
| Continuation owner | automatic RPI session |
| Required gates or confirmations | Product workflow confirmed; Impeccable surface direction and visual validation remain implementation gates |
| Next action | Transition to Plan |
| Primary evidence file | .copilot-tracking/research/2026-11-20/admin-job-diagnostics-research.md; date from current session |

## Research Record

### Method and Boundaries

* Posture: balanced, default; no explicit deadline.
* Candidate internal areas: apps/api/src, apps/api/tests, apps/web/src, apps/web/PRODUCT.md, apps/web/DESIGN.md, existing diagnostic tracing and budget administration evidence.
* External scope: none initially; consult authoritative provider documentation only if needed for error contracts.
* Evidence root: repository .copilot-tracking; evidence file date is current session date.
* Constraints: research is read-only except workflow and research records. Do not retain secrets or raw user content. No live paid calls or deployment.
* Prior knowledge: prior completed diagnostic tracing and budget administration sessions are leads, not assumed evidence.
* Helper use: auto; none dispatched initially.

### Extensions and Participation

* Selected: tracking location and tracking conventions for research artifacts; Impeccable for admin design context and later design workflow.
* Markdown and writing conventions apply to Markdown; tracking artifacts are exempt from markdownlint.
* Research-specific domain skills: none identified as necessary at intake. Accessibility guidance may inform implementation, but no accessibility audit was requested.
* User selected automatic end-to-end progression and apps/web as Impeccable target. Agent resolves evidence-supported research decisions.

### Research Cycle Log

#### Cycle 1

* Active posture: balanced.

##### Wider

* The web admin combines budgets, reservations, access requests and user management in one view; the server issues a diagnostic ID that the browser displays when a jingle fails. The API has separate run and paid-attempt persistence and request-scoped content-free logs.
* Reflection: a new UI must preserve existing operations, and a log-only diagnostic ID does not itself provide durable per-job lookup. Prioritize tracing how requests map to persisted records and what information provider adapters discard.
* Sources to examine more deeply: apps/web/src/App.tsx, apps/api/src/web_app.ts, apps/api/src/web_storage.ts, apps/api/src/jingle_diagnostics.ts, apps/api/src/lyric_cloud.ts, apps/api/src/score_cloud.ts.

##### Deeper

* Provider responses currently become generic `cloud_request_failed`, apart from known content-filter codes; response diagnostics are discarded in both model adapters. Request tracing uses a server-generated ID and process logs, while browser progress is in-memory only.
* Browser-jingle run records are created later during rendering, so a failed lyric or score stage may not have a run record. Admin currently has budget, reservation, access request and user controls.
* Reflection: a reliable lookup needs an early correlation record or an equivalent durable event history; reusing only existing render records or billing data cannot cover early failures. Preserve content-free handling and authorization.
* Sources: apps/api/src/lyric_cloud.ts `AzureLyricBackend.post`; apps/api/src/score_cloud.ts `AzureScoreComposer.request_score`; apps/api/src/jingle_diagnostics.ts `trace_jingle`; apps/api/src/web_app.ts `/api/jingles`; apps/web/src/App.tsx admin view.

##### Contrarian

* Existing render and reservation records omit pre-render failures; process-local progress disappears; logs alone require external log availability. The route and storage trace disprove those alternatives as a complete lookup.
* The design system's brand commitments favor preserving the established visual world while changing the admin surface's structure rather than replacing the creator workspace.
* Reflection: safe field extraction and database upgrade deserve explicit implementation validation. No evidence supports reconstructing past failures or treating costs as outcomes.

##### Synthesis and Re-entry

* Accepted: durable request records and narrow, sanitized provider metadata (C1-C4, C7).
* Rejected: raw errors, billing-only and log-only inspection (C1-C4, C6).
* Another cycle: no. Primary paths, constraints, alternatives and the available offline test seam are identified; remaining details belong to planning and implementation.

### Evidence Log

| ID | Source and symbol | Claim or finding |
|----|-------------------|----------|
| C1 | apps/api/src/web_app.ts `/api/jingles`, `render_selection` | In-memory progress; early failures precede render record creation. |
| C2 | apps/api/src/jingle_diagnostics.ts `trace_jingle`, `jingle_diagnostic` | Server UUID, content-free process logs, no persisted lookup. |
| C3 | apps/api/src/lyric_cloud.ts `AzureLyricBackend.post` | Discards response details apart from known refusal classification. |
| C4 | apps/api/src/score_cloud.ts `request_score`; apps/api/tests/web_app.test.ts diagnostic tests | Score errors are generalized; tests protect content-free logs. |
| C5 | apps/web/src/App.tsx admin view; apps/web/PRODUCT.md; apps/web/DESIGN.md | Existing operations and binding brand constraints. |
| C6 | apps/api/src/web_app.ts admin routes; apps/api/src/web_storage.ts `RunRecord` | Admin authorization and budget/reservation versus run separation. |
| C7 | apps/api/src/web_storage.ts `_create_schema`; apps/api/src/bootstrap_database.ts `upgrade_postgres_store`, `WEB_TABLE_COLUMNS`; docs/azure-deployment.md | SQLite initialization, PostgreSQL additive upgrade, import and lifecycle integration. |

### Artifact Self-Check

Questions, evidence states, source locators, alternatives, participation, three waves, readiness and boundaries checked. No helper, live provider call, external system mutation, or source-code edit was used. Design direction and rendered inspection remain later gates.
