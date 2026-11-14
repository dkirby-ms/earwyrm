<!-- markdownlint-disable-file -->
# Task Research: Azure foundation for issue 4

| Field | Value |
|---|---|
| Date | 2026-11-13 |
| Researcher | RPI Agent |
| Output mode | convergence |

## Executive Summary

Research is complete for local scaffolding. The user explicitly confirmed "audio proof passed", resolving the prerequisite as a user attestation rather than independently reconstructed measurements. Reuse Python, Pydantic and the MCP SDK; keep deployment scaffolds distinct from the existing local POC and from a completed production workflow. A real clean Azure deployment still requires prerequisite setup and explicit billing consent.

## What You May Not Know

APIM's native passthrough MCP resource requires its 2025-09-01-preview management API even though MCP itself must negotiate 2025-06-18 or newer. Consumption APIM is not supported. Current azd supports Container App Jobs using the same containerapp host and service-discovery tags. The existing melody queue is SQLite-local, not an Azure render queue.

## Findings

### F1: Platform work has an explicit audio-decision prerequisite

The project plan requires recording and freezing the selected product path before deployment and shared contracts. Issue 4 says to create the foundation only after the audio decision.

* Questions: Q1
* Evidence state: evidence-backed finding
* Evidence: W1; C2, Week-1 decision gate and Work sequence
* Confidence and limits: high for the required ordering; no selected path was found in the repository.

### F2: The local POC differs from the original panel requirement

The local protocol defers the independent panel. Its current gate remains Pending while required self-evaluation or rights/cost evidence is missing. Blank result rows are explicitly not a passing result.

* Questions: Q1
* Evidence state: evidence-backed finding
* Evidence: C3, Output Evaluation Record and Pass, Fail, and Pending
* Confidence and limits: high for the recorded local requirements; evaluation outside the repository may exist.

### F3: User confirmation resolves the decision, not its individual measurements

Issue 3 is closed with unmarked acceptance checkboxes and no comments. A prior local issue-3 conversation states that its planned decision record would report Pending without selecting a path. No matching decision document exists in the current repository. The melody session completed a provisional local service contract while deferring platform adoption.

* Questions: Q1 and Q2
* Evidence state: evidence-backed finding for user confirmation; underlying measurements remain outside this task
* Evidence: W2, C4 and C5
* Confidence and limits: the user then confirmed "audio proof passed". Proceed with vocoded output plus spoken fallback; do not claim independent panel validation or legal clearance.

### F4: Reuse the local contracts without deploying the local SQLite service

The existing models define brief, lyric, composition and syllable timing shapes. Preserve those imports as canonical v1 definitions and add shared job, quality, manifest and approval contracts around them. The foundation container should expose health, schemas and real MCP protocol negotiation, but advertise unimplemented generation explicitly. Running the local melody queue on ephemeral ACA storage would lose idempotency and history.

* Questions: Q2
* Evidence state: evidence-backed finding
* Evidence: C1, C5-C6
* Confidence and limits: high for current entrypoints; production queue/worker adoption remains later integration work.

### F5: A managed-identity deployment is feasible with explicit prerequisites

Use Container Apps for web and two MCP scaffolds, an event-driven job and Azure Storage Queue, private Blob containers, ACR, APIM Developer, an Azure OpenAI model deployment, paid Speech S0, Content Safety S0, Key Vault and workspace-based Application Insights. Entra registrations remain documented prerequisites. APIM validates seller tokens and uses its own managed identity to call MCP backends; backend authentication permits only that identity's service-principal object ID through `allowedPrincipals.identities`. No shared keys or generated client secrets are needed.

* Questions: Q3
* Evidence state: partially supported claim
* Evidence: W3-W7
* Confidence and limits: resource schemas and local builds can be checked here; subscription quotas, regional access, permissions and azd up need live operator verification. No cloud success is claimed.

## Recommendation and Alternatives

* Recommendation: Python 3.12 container runtime, reusable Pydantic JSON schemas, explicit non-generating service scaffolds, azd image-based deployment and Bicep.
* Rationale: existing code already uses Python 3.11+, FastAPI and MCP. Native ACA authentication avoids introducing a second JWT implementation for the scaffolds.
* Rejected: redeploying local SQLite queues on ephemeral storage; public unauthenticated MCP; APIM Consumption; silently choosing quality thresholds or claiming a scaffold performs rendering.
* Deferred: production workflow and worker wiring, existing local app migration, actual billable deployment until consent and prerequisites.

## Scope and Questions

* Goal: establish the evidence needed to implement issue 4.
* Audience: accelerator contributors and deployment operators.
* In scope: service contracts, container/runtime scaffolding, azd/Bicep, identity, regional prerequisites, smoke checks and teardown.
* Out of scope: unrelated lyric changes, production workflow completion, GitHub mutations, provisioning without explicit consent.
* Criteria: all acceptance criteria on issue 4, including verification of prerequisite issue 3.

| ID | Question | Source | Status |
|---|---|---|---|
| Q1 | What audio decision authorizes platform work? | Issue 4 dependency | answered by explicit user pass confirmation |
| Q2 | Which existing contracts and entrypoints should be reused? | Repository | answered, F4 |
| Q3 | What Azure configuration makes azd up reproducible? | Issue 4 | answered for implementation; live verification remains required |

## Decisions and Feedback

| Group | Decision or feedback item | Status | Owner | Evidence |
|---|---|---|---|---|
| D1 | End-to-end automatic progression | confirmed | user | Intake form |
| D2 | Preserve existing uncommitted lyric work | confirmed | constraint | Initial git status |
| D3 | Locate issue 3 audio decision | resolved | user | User supplied the pass attestation in D4 |
| D4 | Audio proof passed | confirmed | user | User replied "audio proof passed" to D3; proceed on that attestation, without inventing per-output measurements or legal clearance |

## Risks and Open Questions

The user supplied the audio gate confirmation. Azure subscription access, quota, regional model availability and clean deployment remain unverified. No billable actions are authorized. Do not use the scaffold as a functioning production generator. Model defaults must be checked against current regional quota before azd up.

## Planning Readiness and Next Step

* Research disposition: executed, complete for implementation
* Decision participation: agent-owned, user selected end-to-end
* Planning Readiness: Ready for local scaffolding; live deployment verification is a separate consent gate
* Continuation owner: automatic RPI Agent
* Next action: automatic Plan with standard critique, then Implement and Review
* Primary evidence file: .copilot-tracking/research/2026-11-13/issue-4-azure-foundation-research.md

## Research Record

### Method and Boundaries

* Posture: balanced (default)
* Evidence root: .copilot-tracking/research/
* Date source: user-provided current date, 2026-11-13
* Initial internal areas: docs/audio-poc, docs/project-plan.md, existing MCP and web services
* Initial external areas: official Azure APIM MCP, Container Apps jobs, azd and Bicep documentation
* Prior knowledge: issue 4 read directly; issue 3 closed with no comments; no matching RPI state found
* Helpers: none
* Explicit deadline: none
* Writes: research and required workflow state only

### Extensions and Participation

Tracking, Markdown, writing-style, licensing and untrusted-content boundaries apply. Deployment-specific Bicep, Python and shell instructions will apply if Implementation becomes eligible. Domain planning skills and external Azure research are deferred until the dependency gate is settled. Automatic decisions are agent-owned; exceptional actions still require consent. No helpers were used.

### Research Cycle Log

#### Cycle 1

##### Wave 1: Wider

* Examined issue 4, issue 3, project plan, audio protocol and rendering guide; enumerated documentation and matching workflow state.
* Evidence: W1-W2, C1-C3.
* Reflection: platform scope is clear, but closed issue status is insufficient to identify the audio path.

##### Wave 2: Deeper

* Traced prior issue-3 session and searched current documentation/tracking for selected-path records. Inspected melody state for dependency adoption.
* Evidence: C4-C5; exact-path and include-ignored tracking searches found no issue-3 decision artifact.
* Reflection: prior work described Pending rather than a passing evaluation; further Azure research cannot resolve this human-evaluation gap.

##### Wave 3: Contrarian

* Tested the alternatives that issue closure, a protocol change, or adjacent service completion might establish readiness.
* Evidence: W2 shows closure only; C3 explicitly defers the panel but retains a provisional evidence gate; C5 uses a provisional local contract rather than a shared platform decision.
* Reflection: no available evidence authorizes selecting the product path. The possibility of an external completed decision remains unresolved.

##### Synthesis and Re-entry

* Accepted F1-F2 as recorded requirements.
* Rejected closure alone as proof of a selected path.
* Deferred Q2-Q3 rather than doing implementation-oriented research before the required decision.
* Another cycle is blocked on an existing decision/evaluation record. Re-enter when that evidence is supplied; do not manufacture a pass or choose the pivot.

### Evidence Log

| ID | Claim or finding | Source or location | Retrieved and version |
|---|---|---|---|
| W1 | Platform work depends on the audio decision | https://github.com/dkirby-ms/earwyrm/issues/4 | 2026-11-13, gh |
| W2 | Issue 3 is closed, checkboxes are not marked, no comments | https://github.com/dkirby-ms/earwyrm/issues/3 | 2026-11-13, gh |
| C1 | Python 3.11+, FastAPI, MCP SDK, managed identity libraries available | pyproject.toml, project dependencies | local read |
| C2 | Platform follows the recorded audio decision | docs/project-plan.md, `Week-1 decision gate` and `Work sequence` | local read |
| C3 | One-person POC remains Pending without required evidence | docs/audio-poc/protocol.md, `Pass, Fail, and Pending` | local read |
| C4 | Prior issue-3 conversation explicitly retained Pending and no selected path | Local session 6b9894cc-2146-47f2-8411-bd29825e5840, turn 0; referenced issue-3 artifacts are absent from this checkout | 2026-11-13, session store |
| C5 | Melody completion used provisional local contracts, not deployment adoption | .copilot-tracking/rpi-sessions/2026-11-13/melody-arrangement/issue-6-melody-arrangement-state.json, `confirmed_decisions` | local read |
| C6 | Local contracts and entrypoints use loopback and SQLite; cloud lyric adapter uses Entra ID | audio_poc/melody.py, `CompositionRequest`; audio_poc/lyrics.py, `AdvertiserBrief`; audio_poc/melody_service.py, `MelodyService`; audio_poc/lyric_cloud.py, `azure_backend` | local read |
| W3 | MCP passthrough type, transport and management API | https://learn.microsoft.com/azure/api-management/manage-mcp-servers-rest-api | 2026-11-13, API 2025-09-01-preview |
| W4 | APIM tiers and minimum MCP protocol | https://learn.microsoft.com/azure/api-management/expose-existing-mcp-server | 2026-11-13 |
| W5 | azd supports image-based apps and job service discovery | https://learn.microsoft.com/azure/developer/azure-developer-cli/container-apps-workflows | 2026-11-13 |
| W6 | Queue-driven job settings and identities | https://learn.microsoft.com/azure/container-apps/jobs | 2026-11-13 |
| W7 | Content Safety protected-material region support and identity | https://learn.microsoft.com/azure/ai-services/content-safety/region-availability; https://learn.microsoft.com/azure/ai-services/content-safety/overview | 2026-11-13 |

#### Cycle 2 after user confirmation

* Wider: read existing brief/lyric/composition models, MCP entrypoints, lyric cloud adapter, local web entrypoint, and official APIM/ACA/azd/Content Safety documentation. C6 and W3-W7 establish reuse and deployment options.
* Reflection: preserve local behavior; cloud foundation must not misrepresent SQLite as durable Azure queueing.
* Deeper: verified native APIM `type: mcp`, `transportType: streamable`, `/mcp`, preview API version; azd job tags; ACA managed-identity auth policy fields; available local Bicep, Docker and uv tools.
* Reflection: no shell hook is needed for job deployment with current azd. Use a single image and role-specific environment.
* Contrarian: tested Consumption APIM (unsupported), passing seller tokens directly to backends (allows governance bypass unless restricted), and deploying existing local melody code (ephemeral queue loss). Rejected each. Clean azd deployment cannot be established by static tests alone.
* Synthesis: select F4-F5, preserve live provisioning as an explicit incomplete acceptance item, and proceed to Plan. No further research cycle is needed before writing and locally validating the scaffold. No helpers were used.

### Artifact Self-Check

Scope, identity, participation, evidence path, sources and write boundary are recorded. Both cycles include Wider, Deeper and Contrarian reflections. All questions have implementation-ready answers and explicit validation limits. User confirmation is not misrepresented as independently measured proof. No source changes or cloud deployment were made during Research.
