<!-- markdownlint-disable-file -->
# Task Research: React/Vite Web Migration

| Field              | Value        |
|--------------------|--------------|
| Date               | 2026-11-15   |
| Researcher / agent | rpi-research |
| Output mode        | convergence  |

## Executive Summary

* Bottom line: Build the requested browser client as a TypeScript React/Vite app, keep the existing FastAPI/Python API and audio services, and serve the client on the same origin.
* Why this matters: It replaces the Python-served browser UI without reimplementing protected API, database, audio, or MCP behavior, and avoids migrating legacy data.
* Research status: Complete; the architecture boundary is evidence-backed and ready for planning.
* Confidence and uncertainty: High confidence in the existing API, auth, runtime, and deployment contracts. Exact Vite/Node versions remain for Plan because official Vite documentation was unavailable through the network proxy.

## What You May Not Know

The browser rewrite does not remove the need for the Python server: the API owns authorization and paid-render safeguards, while Python audio services are shared with the melody MCP server. A new empty PostgreSQL database still needs schema initialization even though importing legacy records is out of scope.

## Findings

### F7: The current checkout has a Python-backed JavaScript web app, not a React/Vite scaffold

The current browser app is vanilla JavaScript served by a FastAPI application. The tracked file inventory and workspace search show no `package.json`, Vite configuration, or `src/` tree, so there is no React/Vite implementation in this checkout to preserve. The new client therefore starts from the existing UI contract rather than adapting a partial scaffold.

* Questions: Q6, Q7
* Evidence state: Evidence-backed finding
* Evidence: C16, C17, C18
* Confidence and limits: High confidence for the current tracked/workspace layout and current app entry points. This does not establish whether earlier work exists outside this checkout.

### F8: FastAPI owns protected API behavior and the Python audio runtime

The Python service is more than a static-file host. It owns identity and entitlement checks, user administration, rendering and paid-usage safeguards, owner-scoped output access, evaluation, and reconciliation. It calls Python audio-generation code and Azure Speech, while the separate melody MCP server uses the same durable `MelodyService`. Replacing the backend would therefore expand this UI rewrite into a separate API, security, database, audio-runtime, and MCP migration.

* Questions: Q7, Q8
* Evidence state: Evidence-backed finding
* Evidence: C19, C20, C21
* Confidence and limits: High for the checked routes, service wiring, and deployment. The recommendation concerns repository scope, not whether a separate TypeScript backend could be built later.

### F9: A no-migration POC still needs a fresh PostgreSQL schema

The repository already separates fresh PostgreSQL schema initialization from SQLite import. `initialize-fresh` requires an empty data directory and target schema, creates both application schemas and their metadata, and validates the result. Skipping `import-sqlite` honors the user's no-legacy-data-migration boundary; it does not remove the need to initialize a new empty store before running the current API.

* Questions: Q9
* Evidence state: Evidence-backed finding
* Evidence: C22
* Confidence and limits: High for repository initialization behavior. No live database was contacted or changed.

### F10: The UI port must preserve authentication and interaction behavior

The browser uses MSAL with delegated scopes, restricts bearer tokens to same-origin `/api/` requests, and relies on a standalone `/auth-callback.html`. The current workspace also has protected audio/evidence loading, durable paid-render confirmation and reconciliation, immutable evaluation, admin access, keyboard navigation, focus handling, labels, live announcements, and visible errors. The previous plan explicitly requires keyboard use, accessible labels, visible errors, and validation of navigation and accessibility behavior.

* Questions: Q8, Q10
* Evidence state: Evidence-backed finding
* Evidence: C23, C24
* Confidence and limits: High for the existing interface contract and prior requirement. Existing Node tests cover only selected navigation behavior; they do not prove complete accessibility conformance.

## Recommendation and Alternatives

* Recommendation or decision state: Replace the browser client with a TypeScript React/Vite SPA, keep the Python FastAPI API and domain services, and serve the built client on the existing same origin.
* Rationale: This meets the browser-app request while preserving the existing authentication, protected API, Python audio, MCP, and PostgreSQL boundaries: F7-F10; C16-C24.
* What could change this result: A confirmed scope change to replace the API, CLI/MCP, or audio runtime with TypeScript would require a separate, broader migration plan.

| Option | Benefits | Costs and risks | Evidence | Disposition |
|--------|----------|-----------------|----------|-------------|
| Build a TypeScript React/Vite client and serve it through the existing same-origin FastAPI app. | Replaces the browser UI while preserving API, authorization, storage, audio, and MCP contracts. | Adds a Node/Vite build and frontend tests; must preserve the auth callback, CSP, and current UI behaviors. | C19-C24 | Selected |
| Host the client separately from the Python API. | Separates frontend hosting and deployments. | Adds an origin boundary, token/CORS and callback configuration, and a second deployment surface; current client rejects cross-origin API tokens. | C21, C23 | Rejected for this POC |
| Rewrite the API, CLI/MCP tools, and audio runtime in TypeScript. | Could reduce language count if every Python responsibility is actually replaced. | Reimplements protected authorization, PostgreSQL safeguards, shared MCP behavior, DSP/audio, and provider integration; this is not confirmed by the current web-app scope. | C19-C21 | Deferred; requires explicit scope change |

## Scope and Questions

* Goal: Produce an evidence-supported architecture recommendation and planning input for the React/Vite browser-app rewrite.
* Audience and use: The user and the automatic RPI planning stage.
* In scope: Existing browser UI and Python server responsibilities, partial React/Vite work, shared application services, storage assumptions, packaging, deployment, tests, and directly relevant accessibility behavior.
* Out of scope: Migrating existing data, destructive data actions, live Azure or tenant operations, credentials, and unrelated PostgreSQL review fixes.
* Decision and evidence criteria: Identify the smallest architecture that delivers the requested React/Vite POC, preserves required application behavior and the confirmed Python package import name, and does not require legacy-data migration.
* Requested output: Convergence research with a selected architecture recommendation and evidence-backed alternatives.

| ID  | Question                                                                                                      | Source                         | Status |
|-----|---------------------------------------------------------------------------------------------------------------|--------------------------------|--------|
| Q6  | What browser UI and Python server responsibilities exist, and what React/Vite work has already started?       | User request and parent state  | Answered: F7 |
| Q7  | Which server-side responsibilities need to remain in Python, and what does the prior TypeScript direction cover? | Parent state and codebase    | Answered: F8; D11 deferred |
| Q8  | What build, deployment, and test contracts constrain the new browser app?                                     | Codebase                       | Answered: F10; Vite version selection remains for Plan |
| Q9  | What storage initialization does the new POC need when legacy data is not migrated?                          | User boundary and codebase     | Answered: F9 |
| Q10 | Which current UI behaviors and accessibility expectations must remain part of the new version?               | Existing plan and codebase     | Answered: F10 |

## Decisions and Feedback

| Group | Decision or feedback item        | Status             | Owner              | Rationale or input needed                                      | Evidence                 | Impact of answer                                      |
|-------|----------------------------------|--------------------|--------------------|----------------------------------------------------------------|--------------------------|-------------------------------------------------------|
| D8    | Exclude legacy-data migration    | Confirmed          | User               | The user identified this as a POC and asked to focus on coding the new version. | User request 2026-11-15 | No import of existing SQLite or PostgreSQL records.   |
| D9    | Preserve the Python package name | Confirmed          | User               | Place the package at `src/audio_poc/` and keep its `audio_poc` import name. | Parent task state       | Keep Python package consumers compatible.             |
| D10   | Set the web and backend boundary | Selected           | Agent              | Replace the browser UI and retain the same-origin FastAPI API and Python domain runtime. | C19-C23                 | Delivers React/Vite without changing server contracts or adding a second origin. |
| D11   | Set the TypeScript migration scope | Deferred           | Agent              | Scope TypeScript to the requested React/Vite browser client. Treat the earlier "maybe everything" suggestion as exploratory because the current task is the browser rewrite and the Python package layout remains confirmed. | User request and C19-C21 | A full API, CLI/MCP, and audio rewrite requires a separate scope decision. |

## Risks and Open Questions

| Priority | Type             | Risk, question, or research item                                  | Impact                                                    | Smallest action or evidence needed                         | Owner    |
|----------|------------------|-------------------------------------------------------------------|-----------------------------------------------------------|------------------------------------------------------------|----------|
| Medium   | Scope boundary   | The earlier suggestion to move "everything" to TypeScript was not a confirmed full-runtime scope. | A full rewrite would materially expand implementation and regression risk. | Keep this task scoped to the browser client; stop for a separate scope decision before replacing server, CLI/MCP, or audio code. | RPI Plan |
| Low      | External evidence | Official Vite documentation could not be fetched because the network proxy did not resolve. | Exact Node/Vite version requirements are not researched.  | Select and verify a pinned version during Plan; no version-specific claim is used here. | RPI Plan |

## Planning Readiness and Next Step

| Field                            | Record |
|----------------------------------|--------|
| Research disposition             | Executed |
| Decision participation           | Agent-owned, inherited from confirmed automatic RPI |
| Planning Readiness               | Ready; D10 selects a same-origin React/Vite client with the existing Python API, D11 defers a full TypeScript rewrite, and Q6-Q10 are answered by F7-F10 and C16-C24. |
| Research depth and helpers       | One complete balanced Wider, Deeper, and Contrarian cycle; no helpers used because the repository architecture is one continuous trace. |
| Blockers                         | None |
| Output mode and planning support | Convergence; supports planning when Planning Readiness is Ready. |
| Continuation owner               | Confirmed automatic RPI Agent |
| Required gates or confirmations  | Preserve the no-migration boundary and `src/audio_poc/` package layout; no live Azure, tenant, or destructive operation. |
| Next action                      | Transition automatically to Plan and scope the React/Vite client, same-origin API serving, fresh-store startup, and UI behavior tests. |
| Primary evidence file            | `.copilot-tracking/research/2026-11-15/react-vite-web-research.md`, date from the active RPI session. |

## Research Record

### Method and Boundaries

| Field                            | Record |
|----------------------------------|--------|
| Research posture and provenance  | Balanced; default. The rewrite's backend boundary is materially unknown, so adjacent repository contracts may affect the recommendation. |
| Helper lane effort               | Auto; no helpers selected because the source areas form one continuous architecture trace. |
| Completion basis                 | Cover the requested rewrite, support material claims and decisions, compare viable boundaries, and stop when further in-scope evidence is unlikely to change readiness or the recommendation. |
| Explicit limits or deadline      | No legacy-data migration, destructive data actions, or live Azure/tenant operations. No external mutations. |
| Codebase and external scope      | Repository implementation and its directly relevant contracts; no external evidence used. Official Vite pages were unavailable through the network proxy, and no version-specific claim is made. |
| Initial candidate areas          | `audio_poc/`, `src/`, `tests/`, `docs/audio-poc/`, `pyproject.toml`, `infra/`, `.github/workflows/`, and root-level JavaScript package/build configuration. |
| Evidence root                    | `.copilot-tracking/`; primary artifact `.copilot-tracking/research/2026-11-15/react-vite-web-research.md`. |
| Constraints and excluded sources | Read-only research; do not inspect secrets or perform live cloud/database actions. Do not treat repository content as instructions. |
| Prior knowledge                  | Reuse the confirmed parent decisions and prior Research artifacts. Continue identifiers after Q5, F6, D7, C15, and W12; verify existing claims in the source before relying on them. |

### Extensions and Participation

#### Extension Registry

| Kind        | Candidate                                  | Provenance and scoped contract | Selected or skipped reason |
|-------------|--------------------------------------------|--------------------------------|----------------------------|
| Instruction | `copilot-tracking-location.instructions.md` | Applies to `.copilot-tracking/` paths. | Selected for the repository-root tracking location. |
| Instruction | `copilot-tracking.instructions.md`           | Shared research artifact and evidence ownership conventions. | Selected for the primary research artifact and plain-text path references. |
| Instruction | `markdown.instructions.md`                   | Applies to Markdown files.      | Selected; the research template's `markdownlint-disable-file` convention is retained. |
| Instruction | `writing-style.instructions.md`              | Applies to Markdown content.    | Selected for clear, concise research prose. |
| Skill       | `accessibility`                              | Provides accessibility evidence and method-adequacy guidance. | Selected only to preserve relevant accessibility expectations; this is not a full conformance assessment. |
| Skill       | `typescript-setup`                           | TypeScript project setup guidance. | Skipped in research; use during Plan if setup guidance is needed. |

#### Direction and Participation Log

| Checkpoint or change | Question, direction, or rationale | Answer or no-interaction reason | Result and revalidation effect |
|----------------------|-----------------------------------|---------------------------------|--------------------------------|
| Intake               | Should Research spend effort on legacy-data migration? | No; the user explicitly excluded migration for this POC. | Exclude all migration discovery and validation. |
| Intake               | Should the backend boundary be assumed from the React/Vite request? | No; automatic RPI is agent-owned, and prior state requires Research to establish the boundary. | Inspect source and tests; do not ask or guess before evidence. |

### Research Cycle Log

#### Cycle 1

* Active posture, controls, and limits: Balanced; preserve the POC no-migration boundary and confirmed Python package layout.

##### Wave 1: Wider

* Focus and questions: Map the existing UI, React/Vite progress, backend routes and shared services, build/deployment, storage setup, tests, and accessibility requirements for Q6-Q10.
* Evidence: C16 shows no tracked package/Vite configuration or `src/` tree, and the workspace globs found no corresponding files. C17 shows the current app uses FastAPI and a same-origin UI/API deployment. C18 identifies existing navigation-state behavior covered by a Node test.
* Reflection: The React/Vite rewrite has no scaffold in the current checkout; the existing vanilla JavaScript SPA is served by Python. The user's prior "started" direction may refer to work outside this checkout. Continue to route-level inspection before deciding whether Python should remain the API.

##### Wave 2: Deeper

* Focus and questions: Trace the contracts that determine the smallest viable web/backend boundary, preserved UI behavior, deployment, and migration-free startup path.
* Evidence: C19 shows API routes enforce delegated scopes and application permissions for account administration, rendering, output access, evaluation, and paid usage reconciliation. C20 shows rendering calls Python audio and Speech code, and `MelodyService` is shared with the melody MCP server. C21 shows the production app is one Python Container App whose FastAPI process mounts the browser assets at the same origin. C22 shows a fresh PostgreSQL schema can be initialized without importing SQLite records. C23 and C24 establish the browser auth, route, keyboard, accessibility, and testing contracts.
* Reflection: A TypeScript React/Vite client can replace the browser UI without changing the existing API, authentication boundary, or domain services. Same-origin static delivery fits the current deployment and avoids adding a cross-origin token/API boundary. The fresh-store initialization is a separate schema prerequisite, not a legacy-data migration.

##### Wave 3: Contrarian

* Focus and questions: Challenge a frontend-only recommendation against a full TypeScript rewrite and other in-scope alternatives; look for shared Python functionality or deployment coupling that makes either unsuitable.
* Evidence: C19-C21 show that a full rewrite would replace protected API behavior, Python audio and database operations, and a shared MCP service, not just the static page. C23 shows the browser refuses to send tokens to another origin; C21 shows one deployed web service, and a targeted search of the service, infrastructure, Azure configuration, and workflows found no CORS configuration. C22 contradicts the idea that excluding legacy data removes every initialization requirement. Official Vite pages could not be retrieved through the network proxy; this leaves version selection unverified but does not decide the architecture.
* Reflection: The counter-evidence supports the bounded client rewrite and rejects a separately hosted client for this POC. The full TypeScript option remains a possible future direction, not a confirmed requirement. No legacy import is needed, but an empty PostgreSQL schema remains a runtime prerequisite. The failed external fetch introduces no unverified version claim.

##### Synthesis and Re-entry

| Material or claim | Evidence | Disposition | Rationale | User-facing effect |
|-------------------|----------|-------------|-----------|--------------------|
| No React/Vite scaffold exists in this checkout. | C16-C18 | Accepted | The tracked/workspace inventory and current source show only the Python-served JavaScript client. | F7; migrate the existing browser UI rather than adapting a partial Vite project. |
| The API and audio runtime are meaningful server responsibilities. | C19-C21 | Accepted | Existing auth, storage, spending, audio, and MCP contracts are shared and server-enforced. | F8; retain FastAPI and Python domain services. |
| Same-origin API hosting is the lowest-change deployment boundary. | C21, C23 | Accepted | Existing client rejects cross-origin API tokens, and deployment is one container. | D10; serve the React/Vite build through the existing origin. |
| Existing frontend requirements include auth, paid safety, accessibility, and keyboard behaviors. | C23-C24 | Accepted | Existing UI and parent NFR-004 specify user-visible contracts. | F10; include focused interaction tests in the Plan. |
| Skipping data import still requires schema initialization. | C22 | Accepted | `initialize-fresh` is separate from `import-sqlite`. | F9; use a new empty PostgreSQL store for the POC. |
| Full Python-to-TypeScript conversion is required now. | Prior user suggestion, C19-C21 | Deferred | The current task names a React/Vite browser rewrite, and the Python package layout remains confirmed; full-runtime scope is not established. | D11; do not broaden implementation without a separate scope change. |
* Another complete three-wave cycle needed: No.
* Trigger or stop basis: Cycle saturation; all material questions and alternatives are covered. The inaccessible Vite version reference is not needed to select the architecture and will be resolved during Plan.
* Readiness or revalidation effect: Planning Readiness is Ready; proceed to Plan within the selected browser-only boundary.

### Evidence Log

* Helpers: None.

| ID | Claim or finding | Source or location | Retrieved and version | Tool | Confidence | Notes |
|----|------------------|-------------------|-----------------------|------|------------|-------|
| C16 | No tracked package manifest, Vite config, or `src/` tree is present; workspace globs also found no such files. | repository root `git ls-files '*package.json' '*vite.config.*' 'src/**'`; workspace globs `**/package.json`, `**/vite.config.*`, `src/**/*` | not applicable | Git file inventory and glob | Medium | Absence claim is limited to this checkout and the searched workspace. |
| C17 | The current web service uses FastAPI and serves a same-origin browser UI/API. | `pyproject.toml` `project.dependencies`; `audio_poc/web_app.py` FastAPI import and `create_app`; `infra/service.bicep` service metadata; `docs/audio-poc/web-app.md` Scope and boundaries | not applicable | Read and search | High | Route and service details are expanded in C19-C23. |
| C18 | The existing browser test covers view switching without losing entered state, reconciliation visibility, `aria-pressed`, and clearing permissions when the subject changes. | `tests/test_web_navigation.cjs` `workspace views switch without hiding reconciliation or resetting entered data`; `changing the subject clears permissions copied from another user` | not applicable | Read | High | The test executes the current app script with a DOM fixture, not a real browser. |
| C19 | The Python API owns token-scope and app-user authorization, rendering, protected output, evaluation, and reconciliation routes. | `audio_poc/web_app.py` `authorized_scope`; `list_application_users`; `create_render`; `download_audio`; `submit_evaluation`; `reconcile_attempt`; `audio_poc/web_auth.py` `TokenValidator`; `audio_poc/web_storage.py` `WebStorage` | not applicable | Read and search | High | The API contract is already exercised by Python tests. |
| C20 | Rendering and paid Speech use Python domain code, and the melody MCP server shares `MelodyService`. | `audio_poc/web_app.py` `create_render`; `audio_poc/__main__.py` `render_brief`; `audio_poc/speech.py` `AzureSpeech`; `audio_poc/melody_mcp.py` `create_server`; `audio_poc/melody_service.py` `MelodyService`; `pyproject.toml` `project.dependencies` | not applicable | Read and search | High | The dependencies include NumPy, SciPy, Azure Speech, and MCP. |
| C21 | Production hosts the FastAPI API and static UI from one Python container and same-origin application. | `Dockerfile.web` `ENTRYPOINT`; `azure.yaml` `services.web`; `infra/service.bicep` `app`; `audio_poc/web_app.py` static `app.mount` | not applicable | Read | High | `Dockerfile.web` has no Node build step today. |
| C22 | Fresh PostgreSQL initialization creates schema only after requiring an empty data directory and target; SQLite import is a distinct command. | `audio_poc/bootstrap_database.py` `initialize_fresh`; `create_parser`; `main`; `docs/audio-poc/web-app.md` `Import existing SQLite data` | not applicable | Read | High | No migration command is required for a new empty POC store. |
| C23 | The browser uses MSAL scopes and same-origin `/api/` calls, preserving a standalone auth callback, protected media flows, and accessible status/error behavior. | `audio_poc/web/app.js` `api`; `loadWorkspaceData`; `renderAzure`; `renderOffline`; `announce`; `audio_poc/web/index.html` workspace and dialog; `audio_poc/web/auth-callback.html` | not applicable | Read and search | High | Existing public client assets and callback path must remain available. |
| C24 | The established UI requirement is keyboard use, accessible labels, visible errors, and tested navigation; existing markup includes skip link, landmarks, labels, live region, and focus styling. | `.copilot-tracking/plans/2026-11-15/postgresql-migration-plan.md` P03-T01/NFR-004; `audio_poc/web/index.html` `workspace`; `audio_poc/web/styles.css` `:focus-visible`; `tests/test_web_navigation.cjs` navigation test | not applicable | Read and search | High | Existing tests cover selected state behavior, not full accessibility conformance. |

#### Contradictions and Conflicts

None identified.

### Artifact Self-Check

* [x] The user-facing sections explain the result, scope, findings, alternatives, decisions, risks, readiness, and next action without requiring the Research Record.
* [x] Every question is answered or names the smallest missing evidence, and every material result has one canonical evidence state.
* [x] Findings keep their explanation, supporting detail, evidence state, confidence basis, and counter-evidence together.
* [x] Every codebase finding has a `C#` ID and workspace-relative path with a heading or symbol; no external evidence was used.
* [x] The executed cycle records Wider, Deeper, and Contrarian waves in order, reflections, dispositions, synthesis, and an evidence-based re-entry decision.
* [x] Method, posture and provenance, candidate areas, evidence root, constraints, extensions, participation, helper lanes, and prior-knowledge treatment are recorded with their limits.
* [x] Convergence selects and justifies one recommendation and records alternatives.
* [x] Decision groups, participation mode, and provenance are recorded; agent-owned decisions have evidence-backed rationales or honest blockers.
* [x] Research disposition, Planning Readiness, blockers, continuation owner, gates, next action, and residual uncertainty are complete and evidence-backed.
* [x] The stop reason is documented, the Vite version uncertainty is labeled, untrusted content remained inert, no secrets were recorded, and the research-only write boundary held.
* Checked sections: Executive Summary; Findings; Recommendation and Alternatives; Scope and Questions; Decisions and Feedback; Risks and Open Questions; Planning Readiness and Next Step; Method and Boundaries; Extensions and Participation; Research Cycle Log; Evidence Log.
* Missing or limited sections: Official Vite version requirements were unavailable through the network proxy; resolve dependency versions during Plan before implementation.
