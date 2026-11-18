<!-- markdownlint-disable-file -->
# Task Research: Jingle chat

| Field | Value |
|-------|-------|
| Date | 2026-11-18 |
| Researcher / agent | RPI parent, direct research |
| Output mode | convergence |

## Executive Summary

Add advertiser-scoped chat inside Create, backed by real MCP protocol calls over linked SDK transports in the API process. Extend the lyric MCP with bounded, screened creative conversation. Persist screened lyric options, compose one idempotent arrangement, publish its protected backing preview, and bind the paid voice estimate to that exact arrangement. Research completed; the user explicitly selected exact MCP vocals instead of a separate voice handoff. Provider deployment and actual paid quality remain operator prerequisites, not verified here.

## What You May Not Know

The existing MCP tools do not finish vocal renders. The existing renderer also changes duration after Speech, which would invalidate an exact-arrangement promise. The selected path must consume the MCP backing bytes and vocal timing without recomposition or a second queue submission.

## Findings

### F1: Keep credentials and MCP resources behind the same-origin API

The existing app authorizes each operation and privately serves audio. Linked SDK transports already appear in real protocol tests, so an API-hosted MCP client can invoke the same server tools without exposing a new public service.

* Questions: Q1, Q2, Q4
* Evidence state: evidence-backed finding
* Evidence: C1, C2, C3, C5
* Confidence and limits: high for repository behavior; no live deployment checked.

### F2: Exact vocal rendering requires a new bounded consumption path

Read the committed backing, MIDI, score and vocal map through MCP resources, verify digests, and mix Speech over those bytes. The fixed 30-second lyric policy avoids duration redesign. A dictionary-counted orthographic timing adapter can distribute complete lyric words into bounded note slots; source Speech word intervals must be mapped proportionally to those slots. This is demo-grade resampling, not natural singing or phoneme alignment.

* Questions: Q3, Q4
* Evidence state: evidence-backed finding for existing constraints; proposed design for the adapter
* Evidence: C2-C4, C6
* Confidence and limits: high on API contracts, quality must be listened to by a producer.

### F3: Preserve explicit spending and held-result boundaries

Only explicit requests with paid consent invoke cloud conversation or writing. Only stored accepted lyrics can compose or render. Existing paid entitlement, exact estimate, global budget reservation and reconciliation stay authoritative. Chat cannot supply output status, arbitrary tool names, URLs or accepted text.

* Questions: Q3, Q4
* Evidence state: evidence-backed finding
* Evidence: C3, C7
* Confidence and limits: existing invariants are verified in code; new path requires negative integration tests.

## Recommendation and Alternatives

Select in-process real MCP with an explicit chat action protocol: discuss, write, compose, then confirm voice. Reject direct-service shortcuts because the user requires MCP; reject browser-to-MCP because it bypasses existing authorization; defer separate HTTP deployment because it adds no required capability. Reject a separately recomposed voice version after the user's exact-arrangement choice.

## Scope and Questions

* Goal: add conversational suggestions and collaborative jingle building using real MCP calls.
* Audience: ad sellers in the existing advertiser-first workspace.
* In scope: existing React app, Express authentication/storage, model integration, MCP client/server transport, composition and audio handoff, tests, and setup documentation.
* Out of scope: deployment, paid test calls, replacing existing workflows, public MCP exposure, and an unrelated distributed worker platform.
* Criteria: actual MCP invocation, actionable suggestions, explicit paid consent, honest tool failures, playable output, preservation of existing behavior, authorization, and focused validation.
* Requested output: evidence-backed recommendation feeding automatic planning and implementation.

| ID | Question | Source | Status |
|----|----------|--------|--------|
| Q1 | Where can chat join the existing workspace without replacing it? | User request | answered, F1 |
| Q2 | How can the API call real MCP tools with existing deployment constraints? | User request | answered, F1 |
| Q3 | How can suggestions, safe lyrics, composition, and playable output connect? | Inferred completion requirement | answered, F2 |
| Q4 | What auth, paid-call, retry, and testing invariants must remain? | Existing product boundaries | answered, F3 |

## Decisions and Feedback

| Group | Decision or feedback item | Status | Owner | Rationale | Evidence | Impact |
|-------|----------|--------|-------|-----------|----------|--------|
| D1 | End-to-end automatic RPI | confirmed | user | Intake selection | Conversation | Continue through Review |
| D2 | Extend Create with advertiser-scoped chat, retaining existing controls | confirmed | user | Feature-boundary answer selects expanded option | C1, conversation | Inherit existing UI |
| D3 | Render vocals over the exact MCP arrangement | confirmed | user | User chose exact-mcp-vocals | C2, C3, C6 | Include exact resource consumption and timing integration |
| D4 | Use explicit bounded chat actions, not autonomous arbitrary model tool loops | confirmed | agent | Paid consent and immutable server-owned inputs must remain enforceable | C3, C7 | Model discusses; user chooses paid generation and building |

## Risks and Open Questions

Model/resource availability is configured by operators. No real paid requests or deployment are authorized in this run. Natural singing, phonetic syllable segmentation and broadcast approval are not promised. Unknown provider usage still requires reconciliation. Transcript history is bounded and stays in the current page; accepted lyrics and previews remain durable through existing stores.

## Planning Readiness and Next Step

| Field | Record |
|-------|--------|
| Research disposition | executed, complete |
| Decision participation | agent-owned, automatic, user-selected end-to-end |
| Planning Readiness | Ready, C1-C7 and explicit exact-vocal scope decision |
| Research depth and helpers | Two complete Wider/Deeper/Contrarian cycles, direct research, no helpers |
| Blockers | None established |
| Output mode and planning support | convergence, supports planning when ready |
| Continuation owner | automatic RPI parent |
| Required gates or confirmations | Scope confirmed; no unresolved material research decision |
| Next action | Automatic transition to Plan |
| Primary evidence file | .copilot-tracking/research/2026-11-18/jingle-chat-research.md; current user date |

## Research Record

### Method and Boundaries

Balanced posture (default). No helpers currently needed. Initial candidates: apps/web/src/App.tsx, apps/api/src/web_app.ts, lyric_mcp.ts, melody_mcp.ts, render.ts, persistence and existing model HTTP integration. External sources only for public SDK/provider contracts if local evidence is insufficient. Root: .copilot-tracking/research. Date: 2026-11-18 from user clock. Prior conversation established standalone tools but requires deeper integration verification. No source writes during Research.

### Extensions and Participation

| Kind | Candidate | Disposition |
|------|-----------|-------------|
| Instructions | tracking location/conventions, Markdown/writing, licensing | Selected for evidence files |
| Skill | impeccable | Selected for inherited Operate UI context, no redesign |
| Skill | telemetry-foundations | Apply if implementation introduces emitters |
| Skills | standalone architecture, security and accessibility planners | Skipped; separate assessments exceed task |
| Participation | End-to-end selection | Agent-owned ordinary decisions; no routine approvals |

### Research Cycle Log

### Cycle 1

#### Wave 1: Wider

Inspected the advertiser-first React workspace, authenticated Express API, independent MCP servers, cloud model adapter, storage, and platform deployment. C1-C4 establish existing capabilities and integration points. Reflection: an in-process SDK transport can preserve real MCP tool calls without deploying unauthenticated network endpoints.

#### Wave 2: Deeper

Verified accepted lyric storage and content-bound paid rendering, MCP artifact delivery with digests, composition idempotency, and existing HTTP tests. C2-C5 establish that chat can persist accepted results and publish a protected backing preview. Reflection: model suggestions need a bounded dedicated MCP tool and explicit paid consent; selected direction must enter the writer's safety gates.

#### Wave 3: Contrarian

Challenged browser-to-MCP and automatic vocal queue consumption. Browser access would bypass current same-origin authorization and expose private resources. The current renderer independently composes and may resize music after Speech; claiming it finishes the same MCP arrangement would be false. C2-C4 rule out that shortcut. Proposed voice handoff was superseded by the user's exact-vocal requirement.

### Cycle 2

* Active control: user explicitly requires exact MCP arrangement with vocals.
* Wider: inspected source Speech boundary validation, PCM decoding, mixing and note contracts (C6), and existing paid API schemas (C3).
* Reflection: consume committed artifacts rather than regenerate matching-seed music.
* Deeper: verified source word intervals cover complete lyrics, the composer returns exact syllable timings, PCM decoder supports the same 24kHz format, and estimates already bind custom/lyric content. Extend binding with composition identity and digest. Preserve 30-second duration and reject unfit input.
* Reflection: reuse the existing reservation/reconciliation route and renderer optional input; no distributed worker is necessary for interactive synchronous completion.
* Contrarian: same-seed rerender can differ with instrumentation changes and re-screening against its own committed history fails. Read exact backing/MIDI/score bytes via MCP, verify digests, skip recomposition and duplicate history insertion, and retain Pending rights/quality status. Phonetic quality is not guaranteed by orthographic timing.
* Synthesis: select exact-artifact consumption and bounded explicit actions. Reject autonomous paid tool loops and invented successful results. No further cycle needed: contracts and source paths cover each question; paid production listening is a later operator check, not missing implementation evidence.

### Evidence Log

| ID | Claim or finding | Source or location | Retrieved and version | Tool | Confidence | Notes |
|----|------------------|--------------------|-----------------------|------|------------|-------|
| C1 | Extend the existing Create section and inherit Campaign Color | apps/web/src/App.tsx `App`; apps/web/DESIGN.md; apps/web/.impeccable/surfaces/src-app-tsx.md `Direction contract` | not applicable | view/context | high | Preserve advertiser rail and Listen & review |
| C2 | Real MCP tools already screen, queue idempotently and return digest-bound WAV resources | apps/api/src/lyric_mcp.ts `create_server`; apps/api/src/melody_mcp.ts `create_server`; apps/api/src/melody_service.ts `submit` | not applicable | view | high | No queue worker |
| C3 | Existing voice path enforces selected accepted lyrics, estimates, confirmations and reconciliation | apps/api/src/web_app.ts `render_inputs`, POST /api/renders; apps/api/src/web_storage.ts `save_lyric_option` | not applicable | view | high | Reuse rather than duplicate paid workflow |
| C4 | Renderer composes independently and can resize after Speech | apps/api/src/render.ts `render_brief`; infra/main.bicep | not applicable | view | high | Do not label a separate voice version the same MCP arrangement |
| C5 | SDK linked transport is exercised by existing tests | apps/api/tests/platform.test.ts `connected` | not applicable | view | high | Real Client.callTool and readResource, no service shortcut |
| C6 | Source word validation, PCM decode, resampling, fixed-length mixing and exact note timing are available | apps/api/src/speech.ts `validate_utterance`, `align`, `decode_pcm`; apps/api/src/dsp.ts `mix`, `vocode`; apps/api/src/melody.ts `SyllableNote` | not applicable | view | high | Reuse primitives, preserve full coverage |
| C7 | Writer preflight and output screening are independent and fail closed | apps/api/src/lyric_service.ts `LyricWriter`; apps/api/src/lyric_cloud.ts `AzureLyricBackend` | not applicable | view | high | Creative direction must join preflight and deterministic checks |

### Artifact Self-Check

All questions answered; findings distinguish observations from proposed adapters. Both cycles retain ordered waves, reflection and contrarian evidence. Decisions include user-confirmed scope, evidence-backed alternatives, privacy/paid boundaries and residual quality limits. No external claims, no helpers, no secrets, and no source writes. Ready for automatic Plan.
