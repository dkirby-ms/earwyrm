<!-- markdownlint-disable-file -->
# Task Research: Unified brief workspace

| Field | Value |
|-------|-------|
| Date | 2026-11-16 |
| Researcher / agent | rpi-research, local execution |
| Output mode | convergence |

## Executive Summary

Research complete. The approved workspace can reuse existing rendering, protected media, evaluation, and lyric screening. Custom brief inputs need content-derived identities and immutable output snapshots; loaded, unrendered drafts can remain browser-session scoped without changing the deployed database schema.

## What You May Not Know

Lyric generation is an independent paid Foundry/Content Safety capability, not part of offline rendering. It needs its own explicit opt-in and configuration. Lyric alternatives will be reviewable drafts, not silently substituted into the existing spoken/vocoded renderer.

## Findings

### One component already owns the disconnected views

The existing React component preserves selection and evaluation drafts across hidden panels. Consolidation can preserve those state owners while moving the brief collection, active brief sections, batch actions and run history into one composition.

* Questions: Q1
* Evidence state: evidence-backed finding
* Evidence: C1
* Confidence and limits: high for source behavior; no participant testing or live UI observation.

### Custom briefs require validation and immutable provenance

The renderer accepts a brief and script independently, but the web API only resolves three fixture IDs. Existing extensible, owner-scoped output manifests can preserve the submitted brief/CTA snapshot without changing PostgreSQL schema. A content hash can bind a custom ID to exact facts and CTA. The server must validate the snapshot on every submission, derive the script, and include a content fingerprint in paid confirmation.

* Questions: Q2, Q4
* Evidence state: evidence-backed finding for existing contracts; proposed integration selected from those contracts.
* Evidence: C2, C3, C5, C6
* Confidence and limits: high for existing contracts. Session drafts do not promise cross-device persistence before rendering.

### Reuse the fail-closed lyric writer, not unscreened local substitutes

The independent writer already owns bounded retries, pronunciation/prosody checks, factual assessment, moderation and protected-material screening. Expose a three-option request with explicit paid authorization and server enablement. Keep held/rejected/unavailable outcomes visible and deduplicate without additional retries. Rendering generated lyrics is not requested explicitly and would need a separate trusted selection/persistence contract; it is excluded rather than accepting client-asserted approval.

* Questions: Q3, Q4
* Evidence state: evidence-backed finding
* Evidence: C4, C7
* Confidence and limits: high. Provider configuration and user entitlement remain prerequisites; no provider call was made.

## Recommendation and Alternatives

* Recommendation: one brief-led workspace; session-scoped custom drafts validated by the API; immutable render snapshots; existing screened writer for independent lyric alternatives.
* Rationale: preserves current database, ownership, render evidence and paid safeguards while implementing the requested inputs and composition.
* What could change this: a later explicit request for cross-device unrendered drafts or selecting generated lyrics for audio.

| Option | Benefits | Costs and risks | Evidence | Disposition |
|--------|----------|-----------------|----------|-------------|
| Reuse current state and extensible output snapshots | Narrow integration; existing deployed schema remains valid | Unrendered custom drafts stay in current browser session | C1-C5 | Selected |
| New durable brief/lyric tables and migration | Cross-device drafts and trusted lyric references | Wider schema/bootstrap/import/deployment changes not needed by this request | C5 | Deferred |
| Browser-only mock lyric templates | No provider prerequisites | Bypasses writer screening and misrepresents output quality | C4, C7 | Rejected |

## Scope and Questions

* Goal: Establish how to implement the approved brief-led screen with working custom input, lyric options, batch rendering, output evaluation and recent runs.
* Audience and use: Engineering implementation in the existing React/Express workspaces.
* In scope: Existing web client, API brief/lyric/render/persistence contracts, focused tests, directly related documentation.
* Out of scope: Deployment, infrastructure, real identity/provider calls, paid spending, remote writes, unrelated refactors.
* Criteria: Functional multi-brief flow, coherent non-columnar layout, explicit errors, preserved ownership/authentication and paid-confirmation boundaries, persistence and regression coverage.
* Requested output: Evidence-backed implementation direction.

| ID | Question | Source | Status |
|----|----------|--------|--------|
| Q1 | How do client views and run/output state currently connect? | User consolidation request | Answered by C1 |
| Q2 | Which brief entry, validation, ownership and persistence contracts can be reused? | User custom-input requirement | Answered by C2, C3, C5 |
| Q3 | How can several lyric options be generated and associated with rendering? | User lyric requirement | Answered by C4, C7; audio substitution explicitly excluded |
| Q4 | What paid-render and existing-evaluation behavior must survive? | Approved proposal and documentation | Answered by C2, C5, C6 |

## Decisions and Feedback

| Group | Decision | Status | Owner | Rationale | Evidence | Impact |
|-------|----------|--------|-------|-----------|----------|--------|
| D1 | End-to-end automatic work with agent-owned ordinary decisions | Confirmed | User | Explicit mode selection | Conversation 2026-11-16 | Continue eligible phases without routine approval |
| D2 | Use approved proposal as UX direction, not as evidence of implemented capability | Confirmed | User and constraint | Approval does not verify APIs or research | Supplied sketch-structure asset | Verify source contracts |
| D3 | Keep maximum three briefs per render; use batch-level optional vocals | Confirmed | Agent | Existing bounded API and paid ledger apply to batches | C2 | No implicit expansion of spending |
| D4 | JSON upload uses the same structured fields as manual entry, with a required CTA | Confirmed | Agent | Existing strict schema and derived render script | C3, C4 | One server validation contract |
| D5 | Preserve custom drafts in browser session, clear on sign-out, recover rendered briefs from owned output snapshots | Confirmed | Agent | Avoid deployment schema changes while preserving result context | C1, C5 | Document retention boundary |
| D6 | Generate three screened lyric alternatives independently, with explicit paid consent; no automatic audio substitution | Confirmed | Agent | Existing writer and spending boundary; no trusted lyric selection store exists | C4, C7 | Clear UX wording and disabled/unavailable states |

## Risks and Open Questions

* No automated semantic brief scoring is established. "Ready" will describe schema/input readiness only; output evaluation remains independent.
* Uploaded/entered advertiser data is private session data until rendered; rendered snapshots follow existing server retention.
* Lyric cloud integration must remain disabled by default, require configured endpoints and entitled user, and make no paid calls in tests.
* Generated lyric drafts need producer/advertiser approval before broadcast; held outputs do not become automatically approved.
* Scroll behavior and responsive composition need runtime/browser evidence if a browser tool is available; none is currently exposed.

## Planning Readiness and Next Step

| Field | Record |
|-------|--------|
| Research disposition | executed, complete |
| Decision participation | agent-owned; user-selected end-to-end RPI |
| Planning Readiness | Ready; C1-C7 cover layout state, custom inputs, lyric gates, provenance and paid regression boundaries |
| Blockers | None established |
| Continuation owner | Automatic RPI session |
| Next action | Automatic parent transitions to Plan; no user acknowledgment required |
| Primary evidence file | .copilot-tracking/research/2026-11-16/unified-brief-workspace-research.md; date from current user context |

## Research Record

### Method and Boundaries

* Posture: balanced, default; adjacent persistence and paid safety are directly relevant.
* Helper lane effort: auto; no helpers or dispatch tools available.
* Explicit limits: no deployment, external writes, provider requests or paid spending.
* Initial candidate areas: apps/web/src; apps/api/src/web_app.ts, lyric services, contracts and storage; existing tests; supplied UX proposal and docs/audio-poc/web-app.md.
* Evidence root: .copilot-tracking/research/2026-11-16.
* Prior knowledge: documentation-based proposal approved; its implementation assumptions remain unverified.

### Extensions and Participation

| Kind | Candidate | Disposition and authority |
|------|-----------|---------------------------|
| Instruction | Tracking location, tracking conventions, Markdown and writing style | Selected for canonical artifacts |
| Instruction | TypeScript contract comments | Selected for later source changes; no source changes during Research |
| Skill | UX artifacts | Existing approved source consumed; no new UX production route |
| Skill | accessibility | Deferred unless technical accessibility guidance is needed; no conformance claim |
| Skill | External research and security frameworks | Skipped; local contracts are primary evidence and no broader assessment requested |

### Direction and Participation Log

* User approved layout proposal and selected end-to-end mode; ordinary research decisions are agent-owned.
* No material intake question remains; runtime source inspection is required rather than asking the user to invent contracts.

### Research Cycle Log

#### Cycle 1

* Wider: inspected web state, layouts, existing tests, rendering, storage, and independent lyric service. The browser only exposes fixture briefs; the API selects fixture IDs exclusively.
* Reflection after Wider: custom input is not a layout-only change. Prioritize immutable brief content, evaluator answers, lyric screening, and paid confirmation rather than presenting unsupported controls.
* Deeper: verified the strict AdvertiserBrief and LyricRequest schemas, LyricWriter safe outcomes, private output manifests, canonical selection ordering, paid reservations, and PostgreSQL's explicit version-one initialization boundary.
* Reflection after Deeper: reuse existing rendering and lyric safety contracts; avoid a schema migration solely for draft workspace state. Candidate: session-scoped loaded custom briefs, content-derived IDs, server-validated render inputs, and immutable snapshots in existing output manifests. Generated lyrics must retain acceptance/review dispositions and cannot become trusted render text merely by a client assertion.
* Contrarian: challenged browser-only mock lyric generation, client-asserted lyric approval, new schema requirements, and conflating evaluation Pending with rendering. Checked writer tests, error boundaries, exact paid confirmation tests and storage initialization.
* Reflection after Contrarian: do not introduce unscreened generation or silently replace scripts. Default-disable paid lyric calls, require explicit consent, preserve existing three-brief bound, and distinguish draft validation from evaluation.
* Synthesis: accept C1-C7. Select existing state plus snapshots; reject mock generators and arbitrary lyric audio substitution; defer cross-device draft tables.
* Re-entry: no further complete cycle needed. Required contracts and counter-evidence are covered; remaining design choices are resolved with bounded decisions D3-D6.

### Evidence Log

* Helpers: none.

| ID | Claim | Source and locator | Retrieval | Tool | Confidence |
|----|-------|--------------------|-----------|------|------------|
| C1 | Workspace state and protected output handling already live in one React component; navigation only hides separate panels | apps/web/src/App.tsx `App`, `loadWorkspaceData`, `renderOffline`, `startPaidRender` | not applicable | read | High |
| C2 | Brief selection, estimates, evaluation and rendering use fixtures and exact paid confirmations | apps/api/src/web_app.ts `selected_inputs`, `RenderRequest`, `create_app` | not applicable | read | High |
| C3 | Renderer accepts structured brief and text independently and produces immutable manifests | apps/api/src/render.ts `load_inputs`, `render_brief`, `component_ledger` | not applicable | read | High |
| C4 | Existing lyric service owns retries, screening and explicit accepted/held/rejected/unavailable outcomes | apps/api/src/lyrics.ts `AdvertiserBrief`, `LyricRequest`, `LyricResult`; apps/api/src/lyric_service.ts `LyricWriter`; apps/api/src/lyric_mcp.ts `create_server` | not applicable | read | High |
| C5 | Storage owner-filters runs/outputs and stores extensible manifests; PostgreSQL startup does not create schema | apps/api/src/web_storage.ts `Manifest`, `save_output`, `list_outputs`; apps/api/src/persistence.ts `validate_postgres_store` | not applicable | read | High |
| C6 | Local fixtures contain structured facts; expected answers remain separate | docs/audio-poc/advertiser-briefs.json; docs/audio-poc/generation-scripts.json; apps/api/tests/web_app.test.ts `same-origin Express API` | not applicable | read | High |
| C7 | Existing writer tests establish real screening, bounded attempts, refusals and unavailable outcomes; default backend uses server credentials | apps/api/tests/creative-lyrics.test.ts `four-attempt fail-closed writer`; apps/api/src/lyric_cloud.ts `AzureLyricBackend`, `LyricCloudSettings`, `azure_backend` | not applicable | read | High |

### Artifact Self-Check

* [x] Questions and material findings have source-backed evidence IDs, limits and implications.
* [x] Wider, Deeper and Contrarian waves ran in order with separate reflection and synthesis.
* [x] Convergence preserves alternatives and records ordinary decisions with rationale.
* [x] Participation, extensions, scope, provenance, source-only research boundary and no-helper execution are explicit.
* [x] Planning readiness and residual uncertainty are recorded without claiming runtime, human or conformance validation.
