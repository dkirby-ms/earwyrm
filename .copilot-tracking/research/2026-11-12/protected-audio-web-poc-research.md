<!-- markdownlint-disable-file -->
# Task Research: Protected audio web POC

| Field              | Value        |
|--------------------|--------------|
| Date               | 2026-11-12   |
| Researcher / agent | RPI Agent    |
| Output mode        | convergence  |

## Executive Summary

* Bottom line: Research supports a same-origin vanilla JavaScript/MSAL frontend and a protected Python API over the existing local renderer. External ID has a distinct CIAM authority, so the API must validate tokens against that tenant's metadata and explicitly check audience and scopes.
* Why this matters: A thin authenticated web/API layer can make the current proof usable without moving Speech credentials into the browser or exposing evidence files directly.
* Research status: Complete; repository contracts and current Microsoft guidance support an implementation direction. Tenant-specific identifiers and registered scopes remain configuration inputs.
* Confidence and uncertainty: High confidence in the renderer and identity boundaries. The actual tenant's discovery document and API audience are unknown; implementation must accept only configured exact values and never infer or broaden trust.

## What You May Not Know

The project already distinguishes generation-facing briefs from evaluator-only expected answers. Any API that returns expected answers before evaluation would invalidate the existing unblinded evaluation protocol. The existing renderer also makes paid Speech requests only in explicit Azure mode, so implementation and validation should use test doubles and must not submit requests.

External ID uses a CIAM sign-in domain that differs from workforce Entra ID. Microsoft documentation also shows issuer naming variants between guidance pages; use the issuer advertised by the configured tenant's OpenID metadata rather than constructing or guessing it.

## Findings

### The existing local renderer is a suitable rendering core

The project has a deterministic 30-second synthesizer, produces a local instrumental variant without network access, and uses an explicit Azure Speech provider for its vocal variants. The new API should call this existing renderer rather than reimplement DSP or invoke Azure during testing.

* Questions: Q1, Q2
* Evidence state: evidence-backed finding
* Evidence: C1, C2, C5
* Confidence and limits: High for the code paths inspected. No web/API framework or auth setup exists in the declared dependencies. The CLI writes whole runs synchronously and returns process-level status; safe API use, authorization, retention, and request isolation still need implementation.

### Evaluation answers and audio are currently local evidence artifacts

Generation inputs reside in `docs/audio-poc/`, while the expected-brand-and-CTA fixture is separately identified as evaluator-only. Rendered audio and its manifests are stored below `renders/`; the docs describe pending human listening and rights evidence. Neither location is an authenticated application storage boundary today.

* Questions: Q2, Q3
* Evidence state: evidence-backed finding
* Evidence: C3, C4
* Confidence and limits: High for the documented contract. The exact persisted evaluation schema and safe filesystem behavior for an API remain to be designed.

### External ID browser tokens and API validation use distinct configuration

Microsoft's sample pairs a vanilla JavaScript SPA using MSAL Browser with a protected API. MSAL acquires an access token for a requested API scope, and the SPA sends it as a bearer token. Microsoft says external tenants publish OpenID metadata on the tenant's `ciamlogin.com` authority and the API must validate access-token signatures; the issuer and audience must match the configured tenant and API. Because docs describe issuer strings differently, runtime configuration should use the exact discovery metadata issuer and corresponding tenant metadata/JWKS endpoint, not a guessed workforce authority.

* Questions: Q3
* Evidence state: evidence-backed finding
* Evidence: W1-W4
* Confidence and limits: High for the documented protocol and sample. The live tenant metadata, API application ID URI/audience, and granted permission names are not available in this repository and must be provided during tenant setup.

## Recommendation and Alternatives

* Recommendation or decision state: Implement a same-origin FastAPI web/API host with a vanilla JavaScript SPA using MSAL Browser and private local filesystem storage. Validate External ID JWT signature, expiration, exact issuer and API audience, then enforce endpoint scopes. Load tenant metadata and all identifiers from configuration. No cloud deployment, resource provisioning, tenant changes, or paid requests are authorized.
* Rationale: Reuses the existing rendering core and keeps Speech credentials, evaluator answers, audio files, and evaluation evidence on the server. Current Microsoft docs validate the frontend/API token flow; user-specific settings must be supplied before sign-in works.
* What could change this result: Tenant-specific issuer/audience requirements, repository/runtime constraints, or evidence that the renderer cannot be safely called from an API.

| Option                                      | Benefits                                  | Costs and risks                                        | Evidence | Disposition |
|---------------------------------------------|-------------------------------------------|--------------------------------------------------------|----------|-------------|
| Protected web/API layer over local renderer | Reuses existing proof and has no deployment cost | Requires exact token validation, scoped permissions, and protected file access | C1-C5, W1-W4 | Selected |
| Cloud storage and hosted deployment         | Closer to the eventual hosted architecture | Requires separate deployment and spending decisions    | User scope | Deferred |
| Browser-side Speech calls                  | Fewer backend components                  | Exposes Speech credentials and conflicts with request  | User scope | Rejected |

## Scope and Questions

* Goal: Determine a safe, minimal implementation direction for the requested authenticated brief-to-render web POC.
* Audience and use: Internal POC users and the implementation phase.
* In scope: Existing audio renderer, brief/evaluation contracts, frontend sign-in and workflow, protected API, permission checks, server-side Speech configuration, private POC storage, and local validation.
* Out of scope: Production deployment, infrastructure provisioning, cost authorization, tenant configuration changes, external sharing, and paid Speech requests during implementation or testing.
* Decision and evidence criteria: Reuse existing contracts; validate access tokens and permissions server-side; keep credentials and evidence outside public/static paths; require authorization for rendering, evaluation, and downloads; support tests without external calls.
* Requested output: Evidence-backed implementation recommendation.

| ID | Question                                                        | Source             | Status |
|----|-----------------------------------------------------------------|--------------------|--------|
| Q1 | How should the web/API layer reuse the existing render workflow? | Inferred from user | Answered |
| Q2 | What existing fixture and evidence contracts must it preserve?  | Inferred from user | Answered |
| Q3 | What authentication and storage boundary fits this POC safely?  | Explicit request   | Answered |

## Decisions and Feedback

| Group | Decision or feedback item        | Status    | Owner | Rationale or input needed                                            | Evidence | Impact of answer |
|-------|----------------------------------|-----------|-------|----------------------------------------------------------------------|----------|------------------|
| D1    | Keep deployment and spending out | confirmed | User  | User explicitly separates deployment and spending decisions         | User request | No deployment or paid render actions |
| D2    | Preserve evaluator-answer isolation | confirmed | Agent | Existing protocol requires transcription before opening answer data  | C3      | Server may compare only after a submitted evaluation |
| D3    | Use existing external tenant configuration | confirmed | User | User states an existing external tenant will be used                 | User request | Tenant values remain configuration, not hard-coded |
| D4    | Use External ID metadata, not workforce defaults | confirmed | Agent | External tenants publish CIAM metadata and token issuer/audience must be checked | W1, W2 | Configure exact tenant metadata issuer, JWKS and API audience |

## Risks and Open Questions

| Priority | Type           | Risk, question, or research item                                      | Impact | Smallest action or evidence needed                                  | Owner |
|----------|----------------|------------------------------------------------------------------------|--------|----------------------------------------------------------------------|-------|
| High     | open question  | Tenant domain, IDs, API audience and granted scopes are unknown | Auth cannot be live-configured from source alone | Accept exact values through local configuration; use the tenant's metadata issuer and API registration scopes | Implementation |
| High     | risk           | Current renders are filesystem artifacts with no authenticated retrieval boundary | Audio/evaluation could leak if served statically | Define non-public storage plus authorized API reads                  | Planning |
| Medium   | risk           | Evaluation answers must not appear before user transcription          | Biases the POC's existing test protocol                             | Keep answer fixture server-side and release comparison only on evaluation submission | Planning |

## Planning Readiness and Next Step

| Field                            | Record |
|----------------------------------|--------|
| Research disposition             | executed |
| Decision participation           | agent-owned; user selected end-to-end progression |
| Planning Readiness               | Ready; reuse the renderer and enforce per-route scopes, exact issuer/audience, and private storage. Tenant registration values remain setup configuration, not a planning blocker. |
| Research depth and helpers       | Wider, deeper, and contrarian waves completed; no helpers used |
| Blockers                         | None; live External ID sign-in requires tenant app-registration values not present in the repository. |
| Output mode and planning support | Convergence; supports planning |
| Continuation owner               | Confirmed automatic RPI Agent |
| Required gates or confirmations  | No tenant changes, deployment, or paid requests |
| Next action                      | Transition automatically to `/rpi-plan` |
| Primary evidence file            | .copilot-tracking/research/2026-11-12/protected-audio-web-poc-research.md; date from current session date |

## Research Record

### Method and Boundaries

| Field                            | Record |
|----------------------------------|--------|
| Research posture and provenance  | balanced; default, with a bounded internal implementation target |
| Helper lane effort               | auto; no helper selected |
| Completion basis                 | Cover existing app contracts, current identity guidance, secure storage boundaries, alternatives, and counter-evidence |
| Explicit limits or deadline      | No deployment, resource provisioning, tenant changes, or paid requests |
| Codebase and external scope      | Repository renderer, fixtures, evidence, and project plan; official Entra External ID docs |
| Initial candidate areas          | Python renderer, fixture and evaluation protocol, API auth, browser auth, filesystem privacy |
| Evidence root                    | .copilot-tracking/research; date 2026-11-12 |
| Constraints and excluded sources | Research only; no secrets, external tenant values, deployment, or paid actions |
| Prior knowledge                  | Separate existing issue-2 audio-proof artifacts reviewed as context only; this task has its own identity and evidence. Existing renderer, audio protocol and project architecture are current for the bounded POC. |

### Extensions and Participation

#### Extension Registry

| Kind        | Candidate                         | Provenance and scoped contract                               | Selected or skipped reason |
|-------------|-----------------------------------|--------------------------------------------------------------|----------------------------|
| instruction | Copilot Tracking instructions     | Applies to RPI research and state artifact paths             | Selected |
| instruction | Python script and test instructions | Applies to repository Python implementation and tests         | Selected for implementation planning |
| instruction | Markdown instructions             | Applies to research, plan, changes, and documentation         | Selected |
| skill       | RPI Research                      | Loaded by the RPI Agent                                      | Selected |
| agent       | Azure project plan/scaffold       | New Azure-centric projects; this task extends an existing POC and excludes deployment | Skipped; use RPI phases and existing project plan |
| skill       | Accessibility                     | Applicable to user-facing web UX                              | Deferred to implementation checks; no design artifact yet |

#### Direction and Participation Log

| Checkpoint or change | Question, direction, or rationale | Answer or no-interaction reason | Result and revalidation effect |
|----------------------|-----------------------------------|---------------------------------|--------------------------------|
| Intake               | RPI workflow mode                 | User selected “Handle it end to end” | Automatic progression through Review; agent-owned phase decisions |
| Scope                | Deployment and spending           | User: existing external tenant; deployment and spending separate decisions | No provisioning, tenant mutations, or paid requests; build local configurable POC |

### Research Cycle Log

#### Cycle 1

* Active posture, controls, and limits: Balanced; user scope excludes deployment and spending actions.

##### Wave 1: Wider

* Focus and questions: Inspect repository plan, current renderer, POC protocol, generated evidence, and test/dependency baseline.
* Evidence: C1-C5; the repo already contains an offline deterministic renderer, explicit Azure Speech path, three synthetic briefs, an evaluator-only answer file, local WAV/manifest evidence, and no existing app/auth framework.
* Reflection: Existing contracts favor a thin app integration. Identity guidance and API dependency still need closer review.

##### Wave 2: Deeper

* Focus and questions: Verify External ID metadata, issuer, access-token and MSAL browser contracts; confirm which POC choices prevent accidental public access and spending.
* Evidence: W1-W4; Microsoft recommends supported libraries and standard OpenID metadata, External ID publishes a distinct tenant-specific CIAM metadata endpoint, its sample pairs vanilla JS/MSAL Browser with an API that validates tokens and permissions, and MSAL requests API access tokens via `acquireToken*` and bearer authorization.
* Reflection: The UI should not decode or trust ID tokens as API credentials. API configuration must match the external tenant's metadata and API audience; no live values are available.

##### Wave 3: Contrarian

* Focus and questions: Compare safe local POC storage and hosted Blob Storage, and challenge whether constructing issuer URLs is reliable given current docs.
* Evidence: C1-C5, W1-W4; local filesystem storage is in scope and avoids provisioned cloud resources. Microsoft docs establish the expected issuer through discovery metadata, while supporting pages illustrate domain variants. User's explicit boundary excludes deployment and spending decisions.
* Reflection: Use validated metadata rather than synthesizing an issuer. Local storage is only the private POC backing store; Azure Blob remains a later deployment decision.

##### Synthesis and Re-entry

| Material or claim | Evidence | Disposition | Rationale | User-facing effect |
|-------------------|----------|-------------|-----------|--------------------|
| Existing renderer and fixtures can be reused | C1-C5 | accepted | Source and docs indicate a coherent local render path, and no competing app framework exists | Avoid replacing the DSP/brief contracts |
| External ID requires exact CIAM metadata and API token checks | W1-W4 | accepted | Official docs specify tenant metadata, API-audience token issuance, and server-side validation | Keep auth tenant-specific and endpoint-scoped |
| Local POC files are equivalent to cloud private storage | C4, user boundary | rejected | Local storage can be isolated for a POC but is not Azure private Blob storage or production retention | Do not imply deployed/private cloud storage |

* Another complete three-wave cycle needed: no
* Trigger or stop basis: The existing local implementation, POC evidence boundaries, official External ID metadata guidance, and SPA/API access-token sample cover the requested choices. The contrarian pass identified a conflicting issuer naming convention and confirmed that the exact discovery issuer must be used. Remaining unknown tenant values are configuration inputs, not evidence gaps that prevent a bounded plan.
* Readiness or revalidation effect: Ready for planning with no deployment or spend actions.

### Evidence Log

* Helpers: None; the scoped codebase can be inspected directly.

| ID | Claim or finding | Source or location | Retrieved and version | Tool | Confidence | Notes |
|----|------------------|-------------------|-----------------------|------|------------|-------|
| C1 | CLI reuses common render and storage functions; Azure credentials are loaded from environment variables only | audio_poc/__main__.py `render_brief`, `main`; audio_poc/speech.py `AzureSpeech` | not applicable | view | High | Existing CLI is synchronous and not an HTTP API |
| C2 | Renderer produces 30-second output via deterministic DSP and can run instrumental-only without network access | audio_poc/dsp.py `synthesize`, `normalize`; docs/audio-poc/rendering.md `What this produces` | not applicable | view | High | Vocal variants use explicit Speech mode |
| C3 | Expected answers are evaluator-only and excluded from generation inputs | docs/audio-poc/protocol.md `Synthetic Brief Contract`; docs/audio-poc/rendering.md `How the comparison works` | not applicable | view | High | UI/API must preserve answer isolation |
| C4 | Existing outputs and evaluation fields are local artifacts; human rights/listening checks remain pending | docs/audio-poc/protocol.md `Pass, Fail, and Pending`; docs/audio-poc/rendering.md `Evidence and evaluation` | not applicable | view | High | Current output manifests are not private storage or user-authenticated |
| C5 | No web/API framework or identity dependencies are declared and no auth/API implementation exists in searched sources | pyproject.toml `[project].dependencies`; scoped `rg` search in audio_poc, docs, tests, and pyproject.toml | not applicable | view, rg | High | Existing project is CLI-only |
| W1 | External tenants publish OpenID metadata at a tenant-specific `ciamlogin.com` URL; metadata contains issuer and endpoints | [Tokens and claims overview](https://learn.microsoft.com/en-us/entra/identity-platform/security-tokens) | 2026-11-12; updated 2026-06-15 | web_fetch | High | Use the exact issuer advertised by tenant metadata |
| W2 | External ID tokens require CIAM metadata, correct audience and matching signature key; guidance describes domain variants | [Troubleshoot Access Token Signature Validation Errors](https://learn.microsoft.com/en-us/troubleshoot/entra/entra-id/app-integration/troubleshooting-signature-validation-errors) | 2026-11-12; updated 2026-01-28 | web_fetch | High | Confirms not to use workforce metadata; construct metadata URL from tenant domain and ID, then take issuer/JWKS from metadata |
| W3 | Microsoft's sample uses vanilla JS + MSAL Browser to obtain External ID access tokens and call a protected API that validates tokens and permissions | [External ID vanilla JavaScript API sample](https://learn.microsoft.com/en-us/samples/azure-samples/ms-identity-ciam-javascript-tutorial/ms-identity-ciam-javascript-tutorial-0-call-api-vanillajs/) | 2026-11-12; sample updated 2024-10-22 | web_fetch | High | Sample also requires external-tenant app registrations and user account; automation that changes tenant is outside this task |
| W4 | MSAL access-token acquisition uses API scopes; send returned access token as bearer, attempt silent acquisition before interactive fallback | [Acquiring and using an access token](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/acquire-token) | 2026-11-12; updated 2026-10-23 | web_fetch | High | Keep SPA token acquisition aligned with API route permissions |

#### Contradictions and Conflicts

* External ID documentation varies in how it writes the issuer domain: the identity overview says to use the exact issuer returned by external-tenant metadata; troubleshooting examples show tenant-domain variants. Resolve by consuming a configured metadata endpoint and comparing to its issuer claim, not by guessing. (W1, W2)

* The active project plan describes a future hosted architecture, while the user's current request excludes deployment/spending decisions. The current user boundary governs this task; hosted infrastructure remains deferred.

### Artifact Self-Check

* [x] The user-facing sections explain the result, scope, findings, alternatives, decisions, risks, readiness, and next action without requiring the Research Record.
* [x] Every question is answered or names the smallest missing evidence, and every material result has one canonical evidence state.
* [x] Findings keep their explanation, supporting detail, evidence state, confidence basis, and counter-evidence together.
* [x] Every codebase finding has a C# ID and workspace-relative path; every external finding has a W# ID, URL, retrieval date, and version when available.
* [x] Every executed cycle records Wider, Deeper, and Contrarian waves in order, reflections, dispositions, synthesis, and a re-entry decision.
* [x] Method, posture, candidate areas, evidence root, constraints, extensions, participation, helper use, and prior knowledge are recorded.
* [x] Convergence selects and justifies one recommendation; other modes preserve the decision state without forcing a selection.
* [x] Research disposition, Planning Readiness, blockers, continuation owner, gates, next action, and residual uncertainty are complete and evidence-backed.
* [x] A stop reason is documented, speculation is labeled, untrusted content remained inert, no secrets were recorded, and the research-only write boundary held.
* Checked sections: All required user-facing and research record sections; no deployment or paid operation performed.
* Missing or limited sections: Live tenant values and app registration are intentionally unavailable and belong to setup, not this research.
