<!-- markdownlint-disable-file -->
# Task Research: Retire Python

| Field | Value |
|---|---|
| Date | 2026-11-15 |
| Researcher / agent | rpi-research |
| Output mode | convergence |

## Executive Summary

The application can move fully to Node 24 and TypeScript. Preserve HTTP/MCP wire contracts and existing SQLite/PostgreSQL schemas while replacing Python-only libraries with native TypeScript code and supported JavaScript SDKs. Research completed; exact historical NumPy seeded waveforms are not portable, but deterministic generation, duration, screening and export properties remain acceptance requirements.

## What You May Not Know

The working tree contains an existing uncommitted frontend and PostgreSQL migration. Preserve that work.

## Findings

### Migration includes audio and operations, not only APIs

The backend renders PCM and MIDI, validates word alignment, screens melodic similarity and enforces lyric safety gates. Deployment and database administration are also Python. All require replacements to retire the runtime. Questions Q1/Q3; evidence-backed finding, high confidence: C1/C3/C6.

### Data and identity compatibility are critical

SQLite is still the offline default; PostgreSQL startup must validate an explicit initialization marker. Access is bound to issuer and subject, with transactional paid-budget reservations and owner-scoped output/evaluation records. Preserve schemas, transaction serialization and fail-closed behavior. Questions Q1/Q3; evidence-backed finding, high confidence: C2/C4.

### TypeScript replacements are available

Node 24 provides SQLite; pg, jose, Express, Zod, MCP SDK, Azure identity and Speech packages cover the existing runtime boundaries. Native DSP avoids a Python subprocess dependency. Questions Q2; evidence-backed finding based on installed Node and npm package metadata C7, with integration still to validate.

### Musical behavior can persist without identical random sequences

NumPy generators and SciPy filters do not have a drop-in TypeScript interface. A documented deterministic PRNG and digital filters can retain the observable audio contract but will change historical seed-to-score/audio values. Keep existing exports readable and disclose this versioned reproducibility boundary. Question Q2; evidence-backed finding C6; actual TypeScript synthesis quality and timing require tests.

## Recommendation and Alternatives

Select an ESM Node 24 backend using Express, Zod, pg, jose and the official MCP/Azure JavaScript SDKs. Implement DSP and binary export in TypeScript. Retain the frontend package and browser API shapes.

| Option | Benefits | Costs and risks | Evidence | Disposition |
|---|---|---|---|---|
| Native TypeScript backend and DSP | Eliminates Python completely, shared language | Porting and parity validation | C1-C7 | Selected |
| TypeScript wrapper around Python workers | Smaller initial change | Does not retire Python | C1/C6 | Rejected |
| Remove local rendering, SQLite or safety checks | Less code | Breaks current behavior | C4/C6 | Rejected |

## Scope and Questions

* Goal: retire application Python in favor of TypeScript, including APIs, MCP, CLI, scripts, tests and deployment.
* Audience and use: maintainers implementing and validating behavior parity.
* In scope: existing application behavior, contracts, persistence, audio generation, authentication, deployment paths and directly related documentation.
* Out of scope: live deployment, remote publishing, unrelated cleanup, production-data modification and frontend redesign.
* Criteria: no application Python runtime/tooling dependency; TypeScript build and regression tests pass; existing API/MCP/data contracts retained.
* Requested output: evidence-supported migration recommendation for automatic planning.

| ID | Question | Source | Status |
|---|---|---|---|
| Q1 | What Python behavior and external contracts require parity? | User request | Answered C1-C6 |
| Q2 | Which TypeScript libraries and runtime can preserve that behavior? | Migration requirement | Answered C6/C7 |
| Q3 | How can retirement be verified without damaging existing work or data? | Safety and acceptance | Answered C2-C6; offline tests and opt-in PostgreSQL tests |

## Decisions and Feedback

| Group | Decision or feedback item | Status | Owner | Rationale | Evidence | Impact |
|---|---|---|---|---|---|---|
| D1 | End-to-end automatic progression | Confirmed | User | User selected Handle it end to end | Intake | Agent-owned ordinary decisions |
| D2 | Preserve existing work and public contracts | Confirmed | Agent | Migration, not redesign | User request and git status | Parity-first scope |
| D3 | Native TypeScript with existing storage schemas | Confirmed | Agent | Avoid Python workers and data migrations | C4/C6/C7 | Ready to plan |
| D4 | Versioned deterministic music, not NumPy bit equivalence | Confirmed | Agent | Implementation-specific PRNG and filters must change | C6 | Test properties and document change |

## Risks and Open Questions

* High: auth, authorization, concurrency and budget regression. Port negative tests and actual protocol tests.
* High: database import or startup must not reset existing stores. Test new and existing SQLite files; require opt-in isolated PostgreSQL target.
* Medium: synthesized audio differs from historical NumPy output. Retain 24 kHz mono PCM16, exact 30-second duration, bounded similarity and measurable non-silence/clipping tests.
* Live Azure generation and cloud deployment remain unverified without separately authorized paid/shared-system actions.

## Planning Readiness and Next Step

| Field | Record |
|---|---|
| Research disposition | executed |
| Decision participation | agent-owned; automatic intake authorization |
| Planning Readiness | Ready; C1-C7 cover scope and supported alternatives |
| Blockers | None established |
| Continuation owner | Automatic RPI parent |
| Next action | Parent transitions automatically to Plan; no unresolved user-owned research decision |
| Primary evidence file | .copilot-tracking/research/2026-11-15/retire-python-research.md; user-supplied current date |

## Research Record

### Method and Boundaries

* Posture: balanced, default.
* Evidence root: .copilot-tracking/research/2026-11-15.
* Initial candidate areas: src/audio_poc, tests, scripts, frontend, Dockerfiles, workflows, infra and docs.
* External candidates: official Node, MCP SDK, Azure identity/speech and PostgreSQL library interfaces where needed.
* Prior knowledge: workspace snapshot and git status only; verify live source.
* Explicit limits: no deployment, no destructive database actions, no overwriting pre-existing edits.
* Helpers: none initially; direct investigation preferred.

### Extensions and Participation

Tracking-location, tracking-format, Markdown, writing-style and licensing instructions selected for artifacts. Domain authoring instructions apply when implementation becomes eligible. Lifecycle peers excluded from research guidance. Agent-owned intake needs no further questionnaire.

### Research Cycle Log

#### Cycle 1

##### Wave 1: Wider

* Evidence C1: 22 Python modules implement approximately 6,500 lines of application behavior. Tests cover audio, schemas, cloud screening, MCP, owner access, auth, storage and deployment.
* Evidence C2: frontend/src/api.ts and frontend/src/types.ts define same-origin JSON shapes; preserve these snake_case wire fields.
* Evidence C3: Dockerfiles, azure.yaml and deploy-web workflow still require uv/Python. Retiring only API files cannot meet the request.
* Reflection: prioritize persistent identities and ledger transactions, fail-closed auth, bounded paid calls, real MCP transports and measurable audio properties. Existing platform services intentionally refuse generation; preserve that limitation rather than accidentally wiring paid generation into scaffolds.

##### Wave 2: Deeper

* C4: remote PostgreSQL requires verified TLS and initialized version-one tables; local SQLite remains supported.
* C5: real MCP initialization, structured outputs and binary resources are tested; a JSON-RPC lookalike is insufficient.
* C6: 24 kHz mono PCM16 output, 30 seconds, MIDI type 0, speech timing coverage, 18-band vocoder, bounded lyric retries and safe failure outcomes are implemented.
* Reflection: retain semantic safety gates and durable transactions, with focused measurable parity tests rather than line-for-line translation.

##### Wave 3: Contrarian

* Challenged: migrating APIs alone could suffice. Rejected by Python CLI, audio, database bootstrap and deployment dependencies (C1/C3).
* Challenged: replace SQLite with PostgreSQL only. Rejected because offline CLI and local MCP use SQLite by default (C4/C5).
* Challenged: preserve every seed byte-for-byte. Unsupported by NumPy/SciPy implementation dependence; retain deterministic new implementation and document the boundary (C6).
* Challenged: turn scaffold MCPs into working production generation. Rejected: existing scaffolds explicitly return non-integrated errors (C5).
* Reflection: no material architectural gap remains for planning. SDK wire/API details will be verified against installed package declarations during implementation.

##### Synthesis and Re-entry

Native TypeScript selected, Python wrappers and capability removal rejected. No further cycle needed: boundaries are mapped and remaining uncertainty is executable integration validation.

### Evidence Log

| ID | Claim or finding | Source or location | Retrieved | Tool | Confidence |
|---|---|---|---|---|---|
| C1 | Application and tests span creative, data and API boundaries | src/audio_poc; tests, module and test definitions | not applicable | inventory/read | High |
| C2 | Frontend uses protected same-origin snake_case JSON | frontend/src/api.ts `requestApi`; frontend/src/types.ts | not applicable | read | High |
| C3 | Python is required by image and deployment paths | Dockerfile; Dockerfile.web; .github/workflows/deploy-web.yml; azure.yaml | not applicable | read/search | High |
| C4 | Stores retain SQLite and PostgreSQL with explicit initialization | src/audio_poc/persistence.py `validate_postgres_store`; src/audio_poc/web_storage.py `WebStorage`; src/audio_poc/cloud_web.py `prepare_databases` | not applicable | read | High |
| C5 | Local MCP and platform scaffolds have different capabilities | src/audio_poc/lyric_mcp.py `create_server`; src/audio_poc/melody_mcp.py `create_server`; src/audio_poc/platform_service.py `create_app` | not applicable | read | High |
| C6 | DSP, alignment and safety properties define semantic parity | src/audio_poc/dsp.py `normalize`, `vocode`, `write_midi`; src/audio_poc/speech.py `validate_utterance`; src/audio_poc/lyric_service.py `LyricWriter`; src/audio_poc/similarity.py `screen` | not applicable | read | High |
| C7 | Runtime and dependencies available | Node v24.18.0; npm view for express, zod, pg, jose, @modelcontextprotocol/sdk, cmu-pronouncing-dictionary and microsoft-cognitiveservices-speech-sdk | 2026-11-15 npm metadata | runtime/registry probe | High |

### Artifact Self-Check

All questions answered; findings include evidence, limitations and alternatives. Wider, Deeper and Contrarian completed in order with direct investigation and no helpers. Agent-owned choices resolved from source evidence. No secrets persisted; research-only write boundary respected. Planning may begin automatically.
