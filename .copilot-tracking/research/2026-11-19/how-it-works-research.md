<!-- markdownlint-disable-file -->
# Task Research: How it works

| Field | Value |
|---|---|
| Date | 2026-11-19 |
| Researcher / agent | rpi-research |
| Output mode | convergence |

## Executive Summary

The existing workspace can expose an informative secondary view with two diagrams: the user-to-audio flow and the deployed Azure topology. Research is complete and supports planning. Confidence is high for the repository's configured architecture; the page must describe a representative deployment rather than assert the state of any live environment.

## What You May Not Know

The hosted web client and API share one container, rather than being separate Azure services. The API's static server returns 404 for unknown paths, so adding a conventional URL route would require server routing changes. Local storage differs from the cloud deployment.

## Findings

### The existing shell already switches between persistent views

The workspace and administrator panels use React state and stay mounted while hidden. Following this pattern can preserve active drafts; focus handling matters when moving to the new view.

* Questions: Q1, Q3
* Evidence state: evidence-backed finding
* Evidence: C1, C6, C7.
* Confidence and limits: high for the current client and static server. Whether the reader needs a shareable URL was not specified.

### The logical flow combines local music with conditional paid services

Users start with a brief, choose an instrumental arrangement, generate and choose lyrics, then may confirm an estimated paid voice render and review the result. Server checks and user approval remain important. Instrumental preview does not require the paid lyric or voice services.

* Questions: Q2
* Evidence state: evidence-backed finding
* Evidence: C4, C8.
* Confidence and limits: high for the documented guided path. The app also contains advanced and batch workflows, which can be acknowledged without mapping every branch.

### Azure hosts one app with separate identity, data and AI services

Azure Container Apps serves the web and API together. Entra External ID handles sign-in; the app uses PostgreSQL over a private endpoint for records and Azure Files for audio and working files. The app uses managed identities for configured Azure services, and Foundry/Speech capabilities depend on configuration. A separate local setup can use SQLite.

* Questions: Q2
* Evidence state: evidence-backed finding
* Evidence: C2, C3, C9.
* Confidence and limits: high for source templates and their intended configuration, not a live-deployment inspection. Display optional services as conditional, not as guaranteed for every installation.

## Recommendation and Alternatives

* Recommendation: add a secondary in-app view, inheriting the existing visual system, with separate logical and Azure diagrams composed from accessible HTML and concise explanatory text. Describe the Azure picture as representative of the deployed design.
* Rationale: C1-C9 support reuse of the view model and accurate local-versus-cloud distinctions without introducing a routing dependency.
* What could change this result: an explicit requirement for a shareable standalone URL, public access, or a specific live deployment topology.

| Option | Benefits | Costs and risks | Evidence | Disposition |
|---|---|---|---|---|
| In-app secondary view | Fits existing shell and preserves form state; no routing changes | Not a standalone deep link | C1, C7 | selected |
| Separate URL route | Shareable, direct navigation | Requires static server fallback and new routing behavior | C7 | rejected for unspecified requirement |
| Render a third-party diagram library | Rich visualization | Extra dependency, accessibility and maintenance work for fixed diagrams | C6 | rejected for this bounded page |

## Scope and Questions

* Goal: establish the evidence for a concise How it works page with logical and cloud architecture diagrams.
* Audience and use: users of the existing Earwyrm web application seeking a clear overview.
* In scope: web navigation, product and design conventions, actual runtime and Azure architecture, accessible explanatory diagrams, and relevant validation.
* Out of scope: deployment, infrastructure modification, and unrelated changes.
* Decision criteria: accurate current architecture, readable concise explanations, usable navigation, accessibility, and existing product identity.
* Requested output: evidence-backed recommendation supporting implementation planning.

| ID | Question | Source | Status |
|---|---|---|---|
| Q1 | How does the web app expose secondary pages and preserve navigation? | User request | answered |
| Q2 | What is the actual logical and cloud architecture, including optional and local behavior? | User request | answered |
| Q3 | What presentation and validation fit this app without overcomplicating the experience? | User request | answered |

## Decisions and Feedback

| Group | Decision or feedback item | Status | Owner | Rationale and evidence |
|---|---|---|---|---|
| D1 | Use the existing in-app navigation and visual system | confirmed | agent | C1, C5, C7; end-to-end participation selected by user |
| D2 | Present a representative hosted topology and note local/configuration differences | confirmed | agent | C3, C8, C9; live resource state is not established |

## Risks and Open Questions

| Priority | Risk | Mitigation |
|---|---|---|
| Medium | Explanations drift from future infrastructure changes | Align labels with code and document maintenance in the web guide. |
| Medium | A visual-only diagram hides relationships from screen readers or small screens | Use semantic ordered content and visible, readable flow labels; validate responsive rendering. |

## Planning Readiness and Next Step

| Field | Record |
|---|---|
| Research disposition | executed |
| Decision participation | agent-owned, automatic mode, user selected end-to-end |
| Planning Readiness | Ready: C1-C9 cover navigation, current behavior and architecture |
| Research depth and helpers | Balanced; Wider, Deeper and Contrarian completed; no helpers |
| Blockers | None |
| Output mode and planning support | convergence; supports planning |
| Continuation owner | confirmed automatic RPI session |
| Required gates or confirmations | research gates passed; implementation safety remains in force |
| Next action | automatic transition to Plan |
| Primary evidence file | .copilot-tracking/research/2026-11-19/how-it-works-research.md; date from session start |

## Research Record

### Method and Boundaries

* Posture: balanced, default.
* Helper lane effort: auto; no helpers selected.
* Explicit limits: repository scope, no deployment or unrelated changes.
* Initial candidate areas: apps/web, apps/api, infra, and existing docs.
* External sources: none initially; source of truth is the implementation.
* Evidence root: .copilot-tracking/research/2026-11-19, date from user-supplied current date.
* Prior knowledge: no matching state found; existing design context is preliminary, to be verified against code.

### Extensions and Participation

* Selected: tracking location and tracking conventions, Markdown and writing instructions; impeccable for the existing web surface and design context.
* Architecture-diagrams skipped for research: the planned browser-native diagrams are not a requested Mermaid/ASCII infrastructure rendering. Accessibility guidance remains applicable to implementation validation.
* No interaction required for ordinary research decisions: user selected end-to-end agent ownership.

### Research Cycle Log

#### Cycle 1

* Active posture: balanced; repository evidence only, no deployment.

##### Wave 1: Wider

* App surface, existing user workflow, deployment infrastructure, runtime packaging and test commands examined (C1-C5).
* Reflection: the existing interface uses internal view switching rather than a router, and the cloud picture must separate hosted infrastructure from local usage. Investigate actual view lifecycle, protected storage, and optional AI connections.

##### Wave 2: Deeper

* Inspected React view switching, Azure service configuration, test setup, local guides, and image packaging (C1-C6).
* Reflection: browser and API share one hosted app; an architecture diagram must not imply a separately deployed web service. Paid AI services are configuration-dependent.

##### Wave 3: Contrarian

* Challenged a standalone URL against static-server behavior; unknown paths return 404 (C7). Existing navigation can expose the page without an unrelated server routing change.
* Challenged descriptions of paid services against optional template inputs and local SQLite behavior (C3, C8, C9). Describe configuration-dependent features instead of universal guarantees.
* Reflection: no material gap prevents planning. Live deployment state was not inspected and must not be implied.

##### Synthesis and Re-entry

| Material | Evidence | Disposition | Rationale |
|---|---|---|---|
| Existing view model | C1, C7 | accepted | preserves current shell and avoids adding route fallback |
| Separate URL | C7 | rejected | requirement does not specify a shareable route |
| Detailed operational topology | C3, C9 | deferred | conflicts with concise user-facing explanation |

* Another complete three-wave cycle needed: no. Source coverage is sufficient for the bounded page and remaining deployment-state uncertainty is explicitly qualified.

### Evidence Log

* Helpers: none.

| ID | Claim or finding | Source or location | Retrieval | Tool | Confidence |
|---|---|---|---|---|---|
| C1 | Workspace uses React state for workspace/admin navigation, not a router. | apps/web/src/App.tsx `WorkspaceView`, `handleViewChange` | not applicable | read/search | high |
| C2 | Web and API are built into one Node container. | Dockerfile.web `frontend-build`, `ENTRYPOINT` | not applicable | read | high |
| C3 | Hosted runtime uses Container Apps, PostgreSQL, Azure Files, identity and conditional AI. | infra/platform.bicep `platform`, infra/service.bicep `app` | not applicable | read/search | high |
| C4 | Product flow takes briefs through arrangements, lyrics, optional voice and review. | docs/audio-poc/web-app.md `Create and review a jingle` | not applicable | read | high |
| C5 | Existing design uses red navigation, white work areas and restrained controls. | apps/web/DESIGN.md `Campaign Color`, apps/web/src/index.css `:root` | not applicable | read | high |
| C6 | UI is tested using Vitest and Testing Library. | apps/web/package.json `scripts`, apps/web/src/App.test.tsx `installMocks` | not applicable | read | high |
| C7 | Static server does not serve the application for unknown paths. | apps/api/src/web_app.ts `create_app` static file handling | not applicable | read | high |
| C8 | Local SQLite is selected when PostgreSQL is not configured; paid features are gated. | apps/api/src/web_storage.ts `StorageOptions`; apps/api/src/web_app.ts `lyric_available`; docs/audio-poc/web-app.md `Create and review a jingle` | not applicable | read | high |
| C9 | Hosted workload uses a private PostgreSQL endpoint and mounted share; AI deployment is conditional. | infra/postgresql.bicep `privateEndpoint`; infra/platform.bicep `ai`; infra/service.bicep `app` | not applicable | read | high |

#### Contradictions and Conflicts

Documentation describes an earlier paid-feature default while current workflow settings and templates support configured services. The page will avoid claiming a universal enabled or disabled default.

### Artifact Self-Check

* [x] Questions, findings, alternatives, decisions, risks and readiness are recorded with canonical source IDs.
* [x] Wider, Deeper and Contrarian waves, reflections and re-entry decision are recorded.
* [x] Agent-owned decisions are supported by repository evidence; no live deployment was inferred.
* [x] Research-only write boundary held; no secrets recorded.
