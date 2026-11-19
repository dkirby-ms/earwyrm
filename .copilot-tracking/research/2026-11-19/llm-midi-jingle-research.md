<!-- markdownlint-disable-file -->
# Task Research: LLM MIDI Jingle Pipeline

| Field             | Value       |
|-------------------|-------------|
| Date              | 2026-11-19  |
| Researcher / agent | rpi-research |
| Output mode       | convergence |

## Executive Summary

* Bottom line: Structured LLM composition is feasible as a bounded, versioned score format that Earwyrm validates and compiles into its existing MIDI and audio pipeline.
* Why this matters: It can provide editable, repeatable jingles without an audio-generation model, while retaining deterministic rendering and artifact integrity.
* Research status: Complete; the code paths, external API contract, alternatives, deployment image, test seams, and material counter-evidence were examined.
* Confidence and uncertainty: High confidence in the integration shape. The exact deployed Foundry model and budget values remain unknown, and musical quality still requires listening evaluation.

## What You May Not Know

The repository's separate Dockerfile already packages FluidSynth and FluidR3 GM, but Azure deploys `Dockerfile.web`, which does not. The deployment runbook also contradicts itself about whether shared Foundry text and Speech are enabled by the normal deployment. The SoundFont's Debian copyright record identifies the upstream bank as MIT-licensed; any image packaging must preserve the relevant notices.

## Findings

### The renderer exists, but the deployed web image does not use its sampled path

Earwyrm already has a deterministic MIDI-to-audio path. `render_backing` writes MIDI using the seeded palette and invokes FluidSynth when a SoundFont is configured, retaining oscillator synthesis as a fallback. The repository's separate `Dockerfile` installs FluidSynth and FluidR3 GM, but Azure selects `Dockerfile.web`, whose runtime omits both. The core renderer is therefore reusable, but sampled production output requires updating and smoke-testing the deployed image. The Debian copyright record identifies the FluidR3 GM bank as MIT-licensed, so the plan should preserve the package's notices and verify the resulting image's attribution.

* Questions: Q1, Q4
* Evidence state: Evidence-backed finding
* Evidence: C1, C10, C11, C14, W4
* Confidence and limits: The renderer, both image definitions, and Azure's selected Dockerfile are directly verified. W4 is Debian's package copyright record, not a legal review of every possible use of the bank.

### Current composition contracts do not accept model-authored arrangements

The current request is lyrics- and syllable-timing-oriented. The service deterministically composes a score, screens candidates, and maps notes through fixed roles and three seeded GM palettes. The MIDI writer hard-codes 120 BPM and does not accept a caller's key, meter, or arbitrary programs. Model-authored tracks therefore need a new, explicit score contract and compiler; the idea's example cannot be passed into the current writer unchanged.

* Questions: Q1, Q3
* Evidence state: Evidence-backed finding
* Evidence: C2, C3, C7
* Confidence and limits: Request, service, and MIDI serialization code are directly verified. A bounded score DSL remains a proposed design choice, not an existing project contract.

### Foundry structured output is reusable, but composition needs its own call and budget path

The lyric provider already sends strict JSON Schema requests to a Foundry-compatible Chat Completions endpoint and validates parsed content again with Zod. Microsoft's documentation confirms structured-output support for eligible models and documents a constrained JSON Schema subset. The provider caps output at 1,200 completion tokens, and the web adapter rejects serialized requests larger than 64 KiB. This is a viable pattern, not an existing composition feature: the selected deployed model/version is unknown, and current paid-action reservations are lyric-specific. A new score format should be compact enough for the current response cap or explicitly update its limit and reserved cost. Composition must validate musical limits after parsing and extend existing paid-action consent and budget protections. Shared AI is intended to be enabled together at deployment; composition should not add another deployment toggle or mandatory deployment preview.

* Questions: Q2, Q3
* Evidence state: Partially supported claim
* Evidence: C4, C5, C8, C15-C17, W1, W3
* Confidence and limits: The provider pattern, response limit, application request limit, and platform schema/quota contracts are verified. Existing literal consent applies to paid discussion and writing, not today's deterministic compose action; the actual configured model/version, quota, and cost are not available in repository evidence.

### Existing persistence and tests provide seams, not a quality guarantee

Composition already persists score, MIDI, WAV, timing, and provenance under a stable logical job identity, with idempotent retry recovery. Guided previews verify artifact hashes before reuse. Existing tests inject model transports for strict-schema, refusal, and error cases, and exercise deterministic MIDI/audio output without paid calls. The new path can reuse those patterns, but should version its score/provenance and preserve preview/final continuity. Passing structural and deterministic tests will not prove that the jingles are memorable or commercially useful; a small listening evaluation remains necessary.

* Questions: Q1, Q3, Q4
* Evidence state: Evidence-backed finding
* Evidence: C3, C6, C13
* Confidence and limits: Persistence, preview verification, and test seams are directly verified. Musical quality has not been evaluated in this research.

### Deployment guidance conflicts about shared AI defaults

The `Scope and limitations` section says paid Speech/text are off by default and the deployment creates no model deployment. The later `Shared AI configuration` section says the normal workflow provisions Foundry and enables voice/text together, while `deploy-web.yml` requires both settings objects and passes them into deployment. This conflict prevents treating the documentation alone as proof of the active environment's model or feature state. The plan should reconcile the runbook with the current workflow and verify the selected model configuration before paid composition calls.

* Questions: Q2, Q4
* Evidence state: Evidence-backed finding
* Evidence: C12, W1, W3
* Confidence and limits: The documentation and workflow conflict is directly verified. No active GitHub environment values or live deployment were inspected.

### PatchGator and Summit are not present in the inspected application paths

The supplied idea references PatchGator and a Summit synthesizer, but the inspected application source, documentation, and infrastructure contain no such integration outside the idea itself. Treat external hardware or patch-generation support as an optional future boundary, not a prerequisite for the local MIDI-and-WAV increment.

* Questions: Q3, Q4
* Evidence state: Partially supported claim
* Evidence: C9
* Confidence and limits: The search covered the Earwyrm application, docs, and infra paths. It does not establish whether the referenced tools exist in another repository or workspace.

## Recommendation and Alternatives

* Recommendation or decision state: Use a constrained, versioned LLM-authored arrangement DSL, compile it to the existing note/rendering pipeline, and defer synth-patch and hardware integration.
* Rationale: This meets the idea's editable-score goal while containing model output and reusing deterministic rendering, persistence, screening, and test seams. Use a compact pattern-based DSL for 4/4, 8-12 bars, 100-140 BPM, a declared major/minor key, and only existing renderer roles and GM palette; deterministic code expands it to note events. That range produces approximately 13.7-28.8 seconds, within the current 12-30 second envelope; the plan must add tempo-aware MIDI timing and permit corresponding fractional audio durations without weakening the legacy contract. Keep the model response within the current 1,200-token cap unless its configured budget is explicitly updated. Reuse the shared Foundry deployment without separate feature-level deployment approval or a mandatory deployment preview, while preserving explicit per-action consent and capped-budget protections for billable generation. Package FluidSynth/SoundFont in `Dockerfile.web` with notices. Evidence: C1-C8, C10-C17, W1-W4.
* What could change this result: A configured model that cannot meet the structured-output contract, a requirement for arbitrary custom instruments or non-4/4 meter in the first increment, or a SoundFont distribution restriction not resolved by the package notices.

| Option | Benefits | Costs and risks | Evidence | Disposition |
|--------|----------|-----------------|----------|-------------|
| Compact LLM arrangement DSL compiled to deterministic MIDI/audio | Editable score; bounded provider output; reuses rendering, persistence, preview verification, and test seams | Requires score validation, tempo-aware timing, model budget and consent handling, and listening evaluation | C1-C8, C13-C17, W1-W4 | Selected |
| Keep the current deterministic composer only | Lowest integration and operational risk; known behavior | Does not deliver LLM-authored arrangements, the idea's central capability | C2-C4 | Rejected for this goal |
| Let the model emit unrestricted MIDI events and programs | Closely mirrors the example and permits broad musical control | Increases output size and validation burden; arbitrary programs exceed the renderer's current roles/palette | C2, C7, W1 | Deferred |
| Add patch generation or Summit/PatchGator control now | Could extend sound design beyond the current palette | No integration seam found; adds separate tooling/hardware and validation risks | C7, C9 | Deferred |

## Scope and Questions

* Goal: Determine feasibility and recommend a bounded implementation approach for LLM-authored structured MIDI jingles in Earwyrm.
* Audience and use: Repository owner deciding whether and how to implement the idea.
* In scope: Existing score, MIDI, audio-rendering, AI-provider, API, artifact, test, and deployment-runtime contracts; relevant official API and format documentation.
* Out of scope: Source implementation, deployment, paid external inference, tracker writes, and claiming subjective audio quality without listening evidence.
* Decision and evidence criteria: Verify current interfaces and runtime dependencies; distinguish platform-supported behavior from assumptions; preserve existing request, preview/final, and artifact contracts; produce a staged plan with testable acceptance criteria and explicit risks.
* Requested output: Evidence-backed recommendation and actionable RPI plan.

| ID | Question | Source | Status |
|----|----------|--------|--------|
| Q1 | How do current composition, MIDI serialization, sampled backing, and final rendering connect? | Inferred from the supplied idea and prior project artifacts | Answered |
| Q2 | What structured-output and model-call capabilities are available in the existing Foundry integration? | Inferred from the supplied idea | Partially answered; model/version and active configuration remain unknown |
| Q3 | What is the smallest coherent integration that can produce editable, validated jingle arrangements? | Inferred from the requested plan | Answered with the selected bounded DSL approach |
| Q4 | What counter-evidence, quality limits, licensing issues, or operational risks could make the proposal unsuitable? | Inferred from the requested investigation | Partially answered; listening quality and active deployment settings remain unverified |

## Decisions and Feedback

| Group | Decision or feedback item | Status | Owner | Rationale or input needed | Evidence | Impact of answer |
|-------|---------------------------|--------|-------|--------------------------|----------|------------------|
| D1 | Select a bounded first implementation approach | Selected | Agent | A constrained DSL and deterministic compiler best fit the verified contracts and the idea's editable-score goal | C1-C8, C10-C14, W1-W4 | Defines the first increment and its validation boundaries |
| D2 | Include synth patch-description generation in the first increment | Deferred | Agent | No integration was found; patch/device control is independent of producing a validated MIDI jingle | C7, C9 | Keeps the first increment focused; revisit only after core MIDI generation works |

## Risks and Open Questions

| Priority | Type | Risk, question, or research item | Impact | Smallest action or evidence needed | Owner |
|----------|------|----------------------------------|--------|------------------------------------|-------|
| Medium | Open question | Whether the configured Foundry model/version supports the required strict structured-output schema | Could require changing the deployment model or provider contract | Verify the selected model/version against Microsoft's capability table before live calls | Plan |
| Medium | Risk | Structurally valid LLM arrangements may still sound weak or fail the jingle brief | Automated tests cannot establish memorability or commercial usefulness | Run a small listening evaluation using representative briefs and a documented rubric | Plan |
| Medium | Risk | Deployment docs conflict about shared Foundry and paid-feature defaults | Could lead to a plan based on the wrong model endpoint or configuration | Reconcile the runbook with `deploy-web.yml` and verify the active nonsecret configuration | Owner / Plan |
| Medium | Risk | The deployed image lacks the renderer and SoundFont, and sample-bank notice handling is not verified in that image | Sampled audio may be unavailable or attribution may be omitted | Add the dependencies and notices, then smoke-test the built image and inspect its license files | Plan |
| Medium | Risk | Composition inference adds model quota use and cost beyond local MIDI/audio rendering | May exceed the configured budget or fail under shared quota contention | Charge composition through the existing capped-action accounting and verify model quota/cost | Plan |
| Medium | Risk | A paid composition call could bypass the existing per-action consent convention if wired into the current free compose action unchanged | Users may incur model charges without the consent used for other billable text actions | Preserve explicit action-level consent and reservation while avoiding a new deployment-level feature gate | Plan |
| Medium | Risk | A full note-event response may exceed the current 1,200 completion-token cap or reserved per-call budget | The model may truncate output or cost assumptions may understate the call | Use a compact pattern DSL or explicitly revise the provider limit and budget reservation before live use | Plan |

## Planning Readiness and Next Step

| Field | Record |
|-------|--------|
| Research disposition | Executed |
| Decision participation | Agent-owned; user selected Handle it end to end |
| Planning Readiness | Ready; Q1 and Q3 are answered and the remaining model, deployment, cost, and quality uncertainties are explicit planning gates or risks, supported by C1-C14 and W1-W4 |
| Research depth and helpers | Cycle 1 complete with Wider, Deeper, and Contrarian waves; no helpers used |
| Blockers | None |
| Output mode and planning support | Convergence; supports planning and readiness is Ready |
| Continuation owner | Confirmed automatic RPI Agent |
| Required gates or confirmations | Pre-transition state write; no unresolved research decision requires user input |
| Next action | Automatically transition to Plan and create .copilot-tracking/plans/2026-11-19/llm-midi-jingle-plan.md |
| Primary evidence file | .copilot-tracking/research/2026-11-19/llm-midi-jingle-research.md; date from current RPI session |

## Research Record

### Method and Boundaries

| Field | Record |
|-------|--------|
| Research posture and provenance | Balanced; default, because the proposal has multiple adjacent technical uncertainties |
| Helper lane effort | Auto; no helper used for the tightly coupled code-path trace |
| Completion basis | Cover the requested architecture and integration questions, verify material claims, assess counter-evidence, and stop when remaining uncertainty cannot change the first implementation plan |
| Explicit limits or deadline | Read-only research; no source changes, deployment, paid inference, or external tracker writes |
| Codebase and external scope | Earwyrm score, MIDI, renderer, provider, API and runtime contracts; official platform and format documentation |
| Initial candidate areas | docs/idea.md; prior General MIDI and jingle-musicality artifacts; apps/api/src/dsp.ts, backing.ts, render.ts, melody_service.ts, guided_arrangement.ts, contracts.ts, platform_service.ts; API tests; Dockerfile, Dockerfile.web, Azure workflow and deployment documentation |
| Evidence root | .copilot-tracking/research; date 2026-11-19 from the current session |
| Constraints and excluded sources | No paid service calls or deployment; external research limited to relevant official documentation and primary specifications |
| Prior knowledge | Reviewed general-midi and jingle-musicality research and plans as context only; verified that FluidSynth packaging in Dockerfile does not apply to the Dockerfile.web image selected for deployment. Verified the repository memory about shared AI provisioning against the current Shared AI configuration and deployment workflow; no active environment values were inspected. |

### Extensions and Participation

#### Extension Registry

| Kind | Candidate | Provenance and scoped contract | Selected or skipped reason |
|------|-----------|--------------------------------|----------------------------|
| Instruction | copilot-tracking.instructions.md | Applies to RPI research artifacts under .copilot-tracking | Selected; establishes artifact location, naming, and evidence ownership |
| Instruction | copilot-tracking-location.instructions.md | Applies when locating or writing tracking files | Selected; establishes repository-root tracking location |
| Instruction | markdown.instructions.md | Applies to Markdown files | Selected; governs Markdown structure |
| Instruction | writing-style.instructions.md | Applies to Markdown files | Selected; governs tone and clarity |
| Instruction | licensing-posture.instructions.md | Applies to tracking artifacts that discuss third-party licensing | Selected; paraphrase-first and cite the source; no license text was reproduced |
| Instruction | telemetry-overlay.instructions.md | Applies to selected planning and change subdirectories, not this research path | Skipped; no research-path-specific telemetry mandate |
| Skill | rpi-research | Current phase skill | Selected; owns the research cycle and evidence |
| Skill | c4-architecture | Architecture modeling and diagrams | Skipped; no architecture diagram is needed to answer the bounded feasibility questions |
| Skill | telemetry-foundations | Telemetry vocabulary and instrumentation conventions | Deferred; consult only if evidence makes production telemetry design material |

#### Direction and Participation Log

| Checkpoint or change | Question, direction, or rationale | Answer or no-interaction reason | Result and revalidation effect |
|----------------------|-----------------------------------|--------------------------------|--------------------------------|
| Intake | User asked to investigate the supplied MIDI jingle idea and build a plan; RPI mode determines decision participation and progression | User selected “Handle it end to end” | Agent-owned research and planning choices; automatic progression. Scope remains research and plan, not implementation. |

### Research Cycle Log

#### Cycle 1

* Active posture, controls, and limits: Balanced; user requested investigation and a plan. Research and planning artifacts only; no implementation or paid calls.

##### Wave 1: Wider

* Focus and questions: Map the existing score-to-MIDI-to-audio route; identify model-provider paths and runtime constraints; collect official structured-output and synthesis documentation.
* Evidence: C1 verifies an existing `render_backing` path that writes MIDI, runs FluidSynth when configured, and preserves an oscillator fallback. W1 and W2 establish the documented structured-output and MIDI-to-SoundFont rendering capabilities.
* Reflection: The renderer is reusable, but its deployed image still needs verification. Continue by tracing score, persistence, provider, and image-selection contracts.

##### Wave 2: Deeper

* Focus and questions: Trace exact contracts, data fields, persistence/preview behavior, MIDI/audio renderer interfaces, and model-call schemas.
* Evidence: C2-C8 establish a strict lyric/timing request, deterministic candidate generation and screening, durable artifact/idempotency behavior, fixed MIDI roles, strict structured output for lyrics only, guided-preview digest checks, and lyric-specific cost reservations. C15 establishes the existing literal-consent convention for paid discussion and writing. C10-C11 identify the image actually deployed. W1's documentation limits structured output to eligible models and a supported schema subset; W3 documents model quota.
* Reflection: An LLM score can reuse the provider pattern and deterministic renderer, but cannot be dropped into the existing lyric-oriented request unchanged. The exact model/version and active environment configuration remain unknown. Preserve the existing per-action consent and budget protections for a new paid composition call, while keeping deployment enablement shared. Compare bounded and unrestricted scores and verify image/license counter-evidence.

##### Wave 3: Contrarian

* Focus and questions: Challenge whether an LLM score is the best first step; compare the current composer, constrained and unrestricted score formats, and optional patch generation; surface deployment, licensing, model, quota, and musical-quality limits.
* Evidence: C7 shows that arbitrary tempo and programs exceed the serializer. C8 shows that paid reservations currently target lyric actions. C9 found no PatchGator/Summit integration. C10-C11 show that the deployed web image lacks FluidSynth/SoundFont, while C14 shows the separate image already packages them. C12 records contradictory Foundry deployment statements. C13 confirms no-paid-call test seams. W1 documents structured output; W2 documents FluidSynth rendering; W3 documents model quota; W4 identifies the SoundFont package's license and notice context.
* Reflection: Unrestricted scores and patch/hardware generation add scope without improving the core editable-MIDI goal. A bounded DSL can use existing roles and renderers, with new tempo-aware serialization and explicit duration validation. The SoundFont can follow the existing package pattern, subject to preserving notices. Model quotas and subjective quality remain operational and listening-evaluation concerns, not reasons to abandon planning.

##### Synthesis and Re-entry

| Material or claim | Evidence | Disposition | Rationale | User-facing effect |
|-------------------|----------|-------------|-----------|--------------------|
| Reuse the current MIDI/audio and persistence path | C1-C3, C6, C13 | Accepted | It provides deterministic render, retry, and preview-integrity seams | Selected compiler targets existing rendering and versioned artifacts |
| Let the model output arbitrary programs and unconstrained MIDI | C2, C7, W1 | Deferred | The current renderer has bounded roles and no custom patch path; unrestricted output expands validation | V1 uses bounded score fields and existing roles/palette |
| Use local MIDI/audio instead of generative-audio inference | C1, W2, W3 | Accepted | It avoids an audio-generation model but still requires Foundry quota, action consent, and budget for score inference | Do not describe the whole workflow as quota-free or cost-free |
| Preserve paid-action consent while keeping deployment feature enablement shared | C12, C15-C17 | Accepted | Existing paid discussion/writing use explicit per-action consent; the current compose action is deterministic, and the user direction concerns deployment-level approvals | Extend the paid action contract without adding a separate feature toggle |
| Bound model output to the existing response budget | C16 | Accepted | The current provider allows 1,200 completion tokens, and its cost reservation assumes that maximum | Prefer compact musical patterns; revise caps and budget explicitly if the score cannot fit |
| Package FluidSynth/SoundFont for Azure | C10-C11, C14, W4 | Accepted with notice check | A separate image already uses these packages; Azure's image does not | Include the runtime dependency, notices, and a container smoke test |
| Assume Foundry is enabled exactly as documentation describes | C12 | Rejected as an assumption | The runbook conflicts with itself and active settings were not inspected | Reconcile documentation and check the nonsecret model configuration in Plan |
| Automated structural tests prove musical quality | C13 | Rejected | MIDI validity and deterministic rendering do not establish jingle quality | Add a small listening evaluation |

* Another complete three-wave cycle needed: No.
* Trigger or stop basis: The balanced scope is covered, all three waves and synthesis are complete, and remaining exact-model, active-settings, and listening questions cannot change the integration direction. Plan-time checks of the consent flow and 1,200-token provider limit narrowed the score format to a compact pattern DSL; these confirm the selected bounded approach rather than requiring another research cycle. No repository evidence can establish secret environment values, so model capability and cost remain planning preflight items.
* Readiness or revalidation effect: Planning can start with the compact DSL direction; model capability, active deployment settings, budget, image licensing notices, and listening quality remain explicit tasks or risks.

### Evidence Log

* Helpers: None; the code-path trace is tightly coupled and the primary sources are directly accessible.

| ID | Claim or finding | Source or location | Retrieved and version | Tool | Confidence | Notes |
|----|------------------|--------------------|-----------------------|------|------------|-------|
| C1 | Backing rendering writes MIDI using the seeded palette and uses FluidSynth when a SoundFont is configured, otherwise retaining oscillator synthesis. | apps/api/src/backing.ts `render_backing`; Dockerfile runtime package installation | not applicable | view, rg | High | Direct source and container configuration confirm an existing offline renderer. |
| C2 | Composition requests require lyrics, timed syllables, a whole-bar duration, a fixed style, and a stable logical job identity; they do not contain arbitrary tracks or patch descriptions. | apps/api/src/melody.ts `CompositionRequest`; `PreviewCompositionRequest` | not applicable | view | High | Strict Zod contract. |
| C3 | The melody service deterministically arranges and screens candidates, writes MIDI/WAV/score/timing/provenance, and recovers identical retries under the same logical job ID. | apps/api/src/melody_service.ts `submit`; `CompositionResult` | not applicable | view | High | Direct code trace. |
| C4 | Existing model calls use strict JSON Schema, parse the returned envelope, and validate the JSON response again against a local Zod schema. | apps/api/src/lyric_cloud.ts `complete`; `assessment` | not applicable | view | High | This adapter currently serves lyric and jingle-advice flows, not music arrangement. |
| C5 | Project documentation requires a strict-structured-output-capable deployment for the lyric API and identifies composition as a separate deterministic tool. | docs/service-contracts.md `Lyric writer`; `Melody and arrangement` | not applicable | view | High | Documentation aligns with source. |
| C6 | Guided preview loading verifies committed backing, score, MIDI, and timing digests before reuse. | apps/api/src/web_app.ts `guided_preview` | not applicable | view | High | Existing continuity constraint. |
| C7 | The MIDI writer uses a fixed 120 BPM meta-event, role-to-channel mapping, and three GM palettes; it does not serialize caller-selected tempo, key, or meter. | apps/api/src/dsp.ts `BEAT`; `GM_PALETTES`; `write_midi` | not applicable | view, rg | High | Direct source inspection. |
| C8 | The web lyric actions reserve per-call and cumulative budgets before paid provider requests. | apps/api/src/web_app.ts `reserve_lyric_action`; docs/service-contracts.md `Browser chat and exact vocals` | not applicable | rg, view | High | Existing budget model is lyric-specific. |
| C9 | PatchGator/Summit references occur in the supplied idea but were not found in inspected application, docs, or infrastructure paths. | apps/api, docs, infra search for PatchGator, Summit, synth patch, and patch generation | not applicable | rg | Medium | Scoped negative search; does not establish availability outside this repository. |
| C10 | The web runtime image installs only `ca-certificates` and `util-linux` and does not set a SoundFont path. | Dockerfile.web runtime stage | not applicable | view | High | Unlike the separate Dockerfile, this is the image used by Azure deployment. |
| C11 | Azure deployment configuration selects Dockerfile.web for the application image. | azure.yaml `services.web.docker`; .github/workflows/prepare-deployment.yml `Build web image` | not applicable | view | High | Direct configuration verifies the production image selection. |
| C12 | Deployment documentation conflicts: Scope and limitations says paid Speech/text are off by default and no model deployment is created; Shared AI configuration says the normal workflow provisions and enables shared Foundry text and Speech. | docs/azure-deployment.md `Scope and limitations`; `Shared AI configuration`; .github/workflows/deploy-web.yml `Configure isolated environment` | not applicable | view | Medium | The workflow requires both settings objects and passes them into deployment, but active environment settings were not inspected. |
| C13 | Existing tests use an injected CloudTransport for strict-schema/refusal/error behavior and deterministic audio/MIDI checks, without calling paid providers. | apps/api/tests/creative-lyrics.test.ts `posts strict schemas`; `rejects malformed or refused completions`; apps/api/tests/creative-audio.test.ts `DSP artifacts` | not applicable | view | High | Supports a no-paid-call unit-test strategy for the planned provider integration. |
| C14 | The separate Dockerfile already installs FluidSynth and FluidR3 GM and sets `EARWYRM_SOUNDFONT`; the Azure web image is a separate build. | Dockerfile runtime stage; Dockerfile.web runtime stage | not applicable | view | High | Reuse the known package pattern in the deployed image, while retaining notices and validating the packaged bank. |
| C15 | Browser discussion and writing require paid entitlement and literal per-action consent; the existing compose action is deterministic and has no model inference. | docs/service-contracts.md `Browser chat and exact vocals`; `Melody and arrangement` | not applicable | view | High | A paid LLM compose path must preserve action-level consent and caps without adding a deployment-level feature gate. |
| C16 | The lyric provider requests at most 1,200 completion tokens; the web adapter blocks serialized requests over 64 KiB, and the budget estimate includes the 1,200-token output maximum. | apps/api/src/lyric_cloud.ts `complete`; docs/service-contracts.md `Browser chat and exact vocals` | not applicable | view | High | A full note-event score may exceed the existing bound; prefer compact pattern output or explicitly update both provider and cost limits. |
| C17 | The `compose` chat action currently calls deterministic `compose_arrangement`; its UI describes the build as making no cloud requests, while other paid chat actions use one-shot consent. | apps/api/src/web_app.ts `/api/chat`; apps/api/src/jingle_tools.ts `compose`; apps/web/src/App.tsx `buildMusicPreview`; `jingle-chat` | not applicable | view | High | Turning composition into a paid model call requires updated UI consent, API validation, and budget reservation. |
| W1 | Microsoft Foundry Chat Completions and Responses APIs support JSON Schema structured outputs; deployments must support the feature and schemas must follow the documented subset. | [How to use structured outputs with Azure OpenAI in Microsoft Foundry Models](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/structured-outputs) | Retrieved 2026-11-19; page updated 2026-08-24 | web_fetch | High | Official source directly fetched; verify the selected deployment/model before planning a live call. |
| W2 | FluidSynth can render MIDI files using a SoundFont, including non-interactive fast-render output. | [FluidSynth User Manual](https://www.fluidsynth.org/wiki/UserManual/) | Retrieved 2026-11-19 | web_fetch | High | Official project manual directly fetched; Earwyrm already uses the fast-render option. |
| W3 | Foundry quota is allocated per subscription, region, and model in tokens per minute; shared quota testing is usage-based and production endpoints should use dedicated quota. | [Manage and increase quotas for resources](https://learn.microsoft.com/en-us/azure/foundry/how-to/quota) | Retrieved 2026-11-19; page updated 2026-07-28 | web_fetch | High | Official Foundry documentation; actual quota and price depend on the selected model/deployment. |
| W4 | Debian's FluidR3 GM copyright record identifies the upstream SoundFont as MIT-licensed and the Debian packaging as GPL-2-or-later. | [fluid-soundfont Debian copyright record](https://metadata.ftp-master.debian.org/changelogs/main/f/fluid-soundfont/fluid-soundfont_3.1-5.3_copyright) | Retrieved 2026-11-19; fluid-soundfont 3.1-5.3 | web_fetch | High | Paraphrased from the package copyright record; preserve the required upstream notice and verify notices in the deployed image. |

#### Contradictions and Conflicts

The prior General MIDI research names Dockerfile as the container image for FluidSynth. Current deployment configuration uses Dockerfile.web, which lacks those dependencies. The prior finding is valid for the separate Dockerfile runtime but does not establish sampled rendering in the deployed web image. The Azure runbook's Scope and limitations contradicts its Shared AI configuration section and the workflow's required settings; no active environment values were inspected. The no-extra-approval direction concerns deployment-level feature enablement, while `service-contracts.md` separately establishes per-action consent for paid text calls; the plan preserves both scopes. The existing provider also has a 1,200-token completion cap, so the proposed score must stay compact or update its budget explicitly. W4 describes the Debian package's upstream and packaging licenses, but does not replace checking the actual notices shipped in the final image.

### Artifact Self-Check

* [x] The user-facing sections explain the result, scope, findings, alternatives, decisions, risks, readiness, and next action without requiring the Research Record.
* [x] Every question is answered or names the smallest missing evidence, and every material result has one canonical evidence state.
* [x] Findings keep their explanation, supporting detail, evidence state, confidence basis, and counter-evidence together.
* [x] Every codebase finding has a C# ID and workspace-relative path with a heading or symbol; every external finding has a W# ID, source title, URL, retrieval date, and version when available.
* [x] The executed cycle records Wider, Deeper, and Contrarian waves, reflections, dispositions, synthesis, and an evidence-based re-entry decision.
* [x] Method, posture, candidate areas, evidence root, constraints, extensions, participation, helper use, and prior-knowledge treatment are recorded with their limits.
* [x] Convergence selects and justifies one recommendation.
* [x] Decisions and participation provenance are recorded; agent-owned decisions include evidence-backed rationales.
* [x] Research disposition, Planning Readiness, blockers, continuation owner, gates, next action, further research, and residual uncertainty are complete and evidence-backed.
* [x] The stop reason is documented, speculation is labeled, untrusted content remained inert, no secrets were recorded, and the research-only write boundary held.
* Checked sections: All user-facing findings, evidence, cycle waves, synthesis, readiness, and artifact-integrity checks.
* Missing or limited sections: Active deployment settings, selected model/version, and subjective listening quality remain unverified and are carried into Plan as preflight items or risks. The existing per-action consent pattern and 1,200-token response bound are recorded separately from deployment-level feature enablement.
