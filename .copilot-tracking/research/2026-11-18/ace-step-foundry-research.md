<!-- markdownlint-disable-file -->
# Task Research: ACE-Step on Foundry managed compute

| Field | Value |
|-------|-------|
| Date | 2026-11-18 |
| Researcher / agent | RPI Agent / rpi-research |
| Output mode | research-only |

## Executive Summary

ACE-Step is not currently a verified turnkey deployment on the new Foundry Managed Compute service. The public catalog-lookup service documented by Hugging Face returned HTTP 404 for the original ACE-Step model, the primary 1.5 model, and the official 1.5 XL Turbo Diffusers model. Its documented control model returned HTTP 200, establishing that the lookup service was functioning.

This is a catalog/runtime onboarding gap, not evidence that Azure GPUs cannot run ACE-Step. Azure Machine Learning managed online endpoints explicitly support custom containers and provide a technically credible managed-hosting alternative, but ACE-Step deployment on that path was not executed here.

Research completed for public-documentation feasibility. Confidence is high in platform contracts and the observed lookup responses, moderate in catalog coverage, and unestablished for actual subscription availability, deployed inference quality, latency, or price.

## What You May Not Know

* New Foundry Managed Compute and classic Azure Machine Learning-backed endpoints have different runtime, quota, and API contracts.
* ACE-Step 1.5 now has a native Hugging Face Diffusers pipeline. It would be inaccurate to reject it categorically as an architecture that can only run untrusted custom code.
* The native Diffusers pipeline serves the DiT synthesis part of the system, not the complete optional LM planning service or its asynchronous REST API.
* Neither native Diffusers support nor a permissive license establishes that Microsoft has published a compatible Foundry deployment template.
* Dedicated GPU billing is not per generated song or per active request. Idle allocated time matters.

## Findings

### F1: New Foundry Managed Compute requires a compatible curated deployment

The new service owns the runtime image, GPU topology, patching, and serving stack. Deployment requires a model asset plus a compatible deployment template from the azure-huggingface registry. The template fixes runtime, accelerator count, probes, and serving settings. The documented workflow is not an arbitrary Docker-image deployment surface.

Foundry supports more than chat: audio and other non-LLM modalities are documented, and non-OpenAI runtimes use the managed-deployments route. ACE-Step should therefore not be rejected merely because it generates audio. Conversely, uploading weights or observing a Transformers tag does not establish a working music-generation runtime.

* Questions: Q1, Q3
* Evidence state: Evidence-backed finding
* Evidence: W1, W4, W5, W10
* Confidence and limits: High for documented deployment contract. Broad announcements mention custom weights, but the reviewed material does not establish a generally available customer-supplied runtime path for ACE-Step.

### F2: The checked ACE-Step models have no public Foundry catalog mapping

The official Hugging Face Azure guide documents a public lookup service that returns a catalog URL or HTTP 404 for a Hugging Face model ID. Direct read-only requests produced:

| Model ID | HTTP result | Meaning |
|----------|-------------|---------|
| ACE-Step/Ace-Step1.5 | 404 | Lookup reports no latest version in Foundry Preview or Classic |
| ACE-Step/acestep-v15-xl-turbo-diffusers | 404 | Same negative lookup result for the official native Diffusers variant |
| ACE-Step/ACE-Step-v1-3.5B | 404 | Same negative lookup result for the original model |
| HuggingFaceTB/SmolLM3-3B | 200 | Positive control returned a versioned Foundry catalog URL |

This is stronger evidence than an empty web search, but not an exhaustive authenticated query of all Foundry registries, private previews, model aliases, or project-specific availability. No ACE-Step model asset and matching new-Foundry template pair was established.

* Questions: Q1
* Evidence state: Evidence-backed finding
* Evidence: W6 and W7
* Confidence and limits: High for these exact responses; moderate for broader availability inference. Treat new Foundry deployment as unconfirmed/unavailable through these checked mappings, not permanently unsupported.

### F3: Native Diffusers support makes onboarding plausible, not automatic

Hugging Face documents `AceStepPipeline` in Diffusers v0.43.0. Its example uses the official ACE-Step/acestep-v15-xl-turbo-diffusers checkpoint. This model has Diffusers metadata, a text-to-audio task, and MIT weight licensing, with a separately attributed Apache-2.0 text encoder.

This weakens the assumption that Microsoft must run arbitrary upstream ACE-Step Python to support synthesis. It does not prove that the Microsoft-curated runtime contains the required Diffusers version, exposes music-specific fields such as lyrics and duration, or has validated this model. The pipeline wraps DiT synthesis rather than the full LM planner and task server.

The HF Azure task list uses text-to-speech terminology for the former text-to-audio task and does not by itself prove support for ACE-Step music parameters. Request confirmation of the model, task schema, and runtime version rather than treating a task-label match as compatibility.

* Questions: Q1, Q2, Q3
* Evidence state: Evidence-backed finding
* Evidence: W8, W9, W11, W18
* Confidence and limits: High for upstream native pipeline support; Foundry onboarding remains an unresolved possibility.

### F4: AML custom-container hosting is credible but needs an endpoint adapter

Azure Machine Learning managed online endpoints explicitly support customer containers with custom web servers, model mounts, and liveness/readiness/scoring routes. This permits an ACE-Step runtime without waiting for model-catalog curation, subject to packaging and deployment validation.

Do not treat the upstream server as a drop-in AML scoring endpoint. ACE-Step's REST API uses submission, polling, and file-download routes. AML exposes a configured scoring route; it is not documented here as a transparent multi-route proxy for that whole API. A scoring wrapper around the Python or Diffusers inference API is one feasible shape. Another is a job-operation dispatcher, but durable job state and artifact persistence must be designed explicitly.

AML synchronous scoring is limited to 180 seconds, with a documented default of 5 seconds. That is an AML limit, not a proven new-Foundry limit. For longer jobs, a durable asynchronous worker/result-storage arrangement would be needed. Audio duration is not inference duration. Model initialization requires correctly configured startup probes and must not happen on every request.

* Questions: Q1, Q3
* Evidence state: Evidence-backed finding
* Evidence: W3, W12, W13
* Confidence and limits: High for platform support and route/timeout constraints; ACE-Step container compatibility and deployed behavior have not been tested.

### F5: Memory minima are not production sizing or price guarantees

The upstream installation guide specifies Python 3.11-3.12, around 10 GB for core model files, a CUDA GPU recommendation, at least 4 GB VRAM for DiT-only mode, and at least 6 GB for LM+DiT. Its model-tier guidance differentiates 2B variants from XL, for which at least 12 GB with offload and around 20 GB without offload are stated. These are upstream configuration claims, not measured Earwyrm requirements. Full weights, caches, container layers, batch size, duration, and optional LM increase the footprint.

New Foundry documents A100 80 GB, H100 80 GB, H200 141 GB, and MI300X 192 GB families, which have ample nominal memory for these published minima, but a compatible template is still required. AML's supported SKU list includes T4, A10, A100, and H100 families; choose an actual SKU only after validating accelerator/dtype/kernel compatibility, memory, region, quota, and workload.

For Foundry, cost is accelerators per instance multiplied by instance count, allocated running hours, and accelerator hourly rate. One continuously allocated accelerator consumes 720 accelerator-hours in a 30-day month, before other services. An exact USD estimate is not established: the pricing page rendered rate placeholders. A concrete quote requires accelerator family, scope, currency/offer, and a displayed rate. Do not infer scale-to-zero or per-song billing from marketing language.

Foundry GPU-count quota is separate from AML/VM quota, token quota, and PTUs. Global and US/EU Data Zone scopes are documented; project/model availability and actual capacity still need checking. An existing Foundry account does not establish any of these entitlements.

* Questions: Q2, Q4
* Evidence state: Evidence-backed finding
* Evidence: W1, W2, W4, W14, W15, W17, W19
* Confidence and limits: High for billing/quota mechanics; published upstream sizing is configuration-dependent. Advertised sub-two-second generation is not an end-to-end latency SLA.

### F6: Earwyrm integration would be a new audio backend, not an endpoint swap

Earwyrm's current melody service produces locally arranged MIDI, per-syllable timing, melody similarity screening, backing audio, and provenance under one durable logical job identity. The shared Foundry account currently documented for text, Speech, and Content Safety is not evidence that a music-generation model is deployed.

ACE-Step returns generated audio and optional related metadata, not the existing composition contract. A future adapter must preserve job identity, durable artifact hashes, access control, and truthful provenance, and decide how to represent missing MIDI or note-level timing. Existing MIDI-based screening cannot be claimed to screen generated audio without an appropriate extraction/evaluation path.

An instrumental-only trial would avoid changing exact-vocal behavior while testing music generation, but is a possible future evaluation choice, not a selected product change. Full generated singing would need evaluation of exact brand/CTA words, timing, intelligibility, and output safety. Foundry Managed Compute does not include built-in Content Safety filtering on its inference path.

* Questions: Q3, Q5
* Evidence state: Evidence-backed finding
* Evidence: C1, C2, C3, W1, W3, W8
* Confidence and limits: High for inspected contracts. No integration was implemented or tested.

## Recommendation and Alternatives

No implementation platform has been selected. The decision state is conditional:

* If the goal is specifically new Foundry Managed Compute, first obtain a published compatible ACE-Step model/template pair or request onboarding. The official Diffusers-format model is a credible candidate to raise with the Foundry/Hugging Face team.
* If the goal is Azure-managed ACE-Step hosting without waiting for catalog onboarding, AML managed online endpoints with a custom container have a documented platform path. Packaging, scoring adaptation, cost, and inference behavior still require a separately scoped test.
* New Foundry evidence could change this result immediately: a model asset, compatible template, supported task schema, and project availability would resolve the principal catalog gate.

| Option | Benefits | Costs and risks | Evidence | Disposition |
|--------|----------|-----------------|----------|-------------|
| New Foundry Managed Compute | Microsoft-owned runtime, unified identity/networking, accelerator billing | Checked ACE-Step catalog mappings missing; cannot assume arbitrary container support | W1, W4, W7 | Conditional on onboarding/verified model template |
| AML managed online endpoint, custom container | Documented custom-server and GPU support | Own container/dependencies; scoring adaptation; timeout and allocated-compute costs | W12, W13, W14 | Technically viable alternative, untested for ACE-Step |
| Raw GPU VM or Kubernetes | Runtime control | More infrastructure operations; outside the managed-hosting preference | Contrast with W1 | Not investigated further |
| Request model addition | Retains the desired Foundry experience; native Diffusers candidate exists | No delivery date or onboarding guarantee | W5, W8, W16 | Available next evidence-gathering route; no request posted |

## Scope and Questions

* Goal: Determine whether Foundry managed compute supports deploying ACE-Step and what that means for Earwyrm.
* Audience and use: Earwyrm maintainer evaluating a hosted music-generation backend.
* In scope: Current public Microsoft documentation, official ACE-Step code/model documentation, managed hosting contracts, GPU requirements, pricing mechanics, and existing Earwyrm integration boundaries.
* Out of scope: Provisioning resources, paid experiments, cloud mutations, source changes, or claiming verified deployment without execution.
* Criteria: Distinguish documented platform support from inference and actual deployment validation; identify model version, container/protocol requirements, quota/region constraints, cost drivers, and next evidence needed.
* Requested output: Sourced feasibility investigation, not implementation.

| ID | Question | Source | Status |
|----|----------|--------|--------|
| Q1 | Does Foundry managed compute allow ACE-Step directly, through a custom model/container, or neither? | User | Answered for public evidence; live new-Foundry availability unconfirmed, F1-F4 |
| Q2 | Which ACE-Step version and hardware/runtime requirements matter? | Inferred prerequisite | Answered with version/configuration limits, F3/F5 |
| Q3 | What endpoint, lifecycle, authentication, and long-running inference constraints apply? | Inferred prerequisite | Answered for documented paths; deployed adapter behavior untested, F1/F4/F6 |
| Q4 | What quota, region, operational cost, and licensing caveats remain? | Inferred feasibility criteria | Mechanics answered; numeric price and subscription capacity not established, F5 |
| Q5 | How would this fit Earwyrm without assuming it already has a music-model adapter? | Workspace context | Answered at feasibility level, F6 |

## Decisions and Feedback

| Group | Decision or feedback item | Status | Owner | Rationale | Evidence | Impact |
|-------|----------|--------|-------|-----------|----------|--------|
| D1 | Handle investigation end to end | Confirmed | User | User selected Handle it end to end | Current conversation | Agent-owned ordinary research decisions |
| D2 | Research-only scope; no deployment | Confirmed | Agent | Investigate is not authorization to provision or integrate | User request | No implementation handoff |
| D3 | Do not claim turnkey new-Foundry support or permanent architectural incompatibility | Confirmed | Agent | Negative exact-model mapping checks plus native Diffusers evidence support a conditional conclusion | W1, W7, W8 | Feasibility answer bounded to observed evidence |
| D4 | Do not select or provision AML as an implicit fallback | Confirmed | Agent | User asked to investigate Foundry; alternate platform is evidence, not deployment authority | W12, user scope | Investigation completes without changes to the product |

## Risks and Open Questions

| Priority | Type | Risk or open question | Smallest useful evidence | Disposition |
|----------|------|-----------------------|--------------------------|-------------|
| High | Availability | Is an ACE-Step model/template available through an unindexed alias or private preview? | Actual model asset ID, compatible template ID, task schema, and project availability | Follow-up validation, not a blocker to this bounded investigation |
| High | Runtime | Does the curated runtime contain AceStepPipeline and required checkpoint layout? | Microsoft/HF model/runtime confirmation or controlled deployment test | No compatibility assumed |
| High | Quality | Do generated ads preserve exact words and timing? | Listening plus transcription/timing checks on representative 12-30 second originals | Needed before product adoption, not performed |
| Medium | Cost | Numeric GPU rates not rendered by the public pricing page | Portal estimate or quote for selected family/scope/offer and runtime budget | No fabricated dollar amount |
| Medium | Operations | Cold start, restart recovery, concurrency, and artifact survival | End-to-end test including failure/restart paths | Not established by upstream demo API |
| Medium | Rights | Model license does not clear outputs, reference recordings, voices, or brand usage | Component license review and output-specific rights/safety review | MIT 1.5 and Apache-2.0 original model metadata are not legal clearance |
| Medium | Authentication | Current overview says ai.azure.com token scope; deployment examples use cognitiveservices.azure.com | Follow the actual deployed endpoint/card and verify accepted audience/role | Documentation inconsistency; no auth code generated |

## Planning Readiness and Next Step

| Field | Record |
|-------|--------|
| Research disposition | executed |
| Decision participation | Agent-owned, automatic mode, user selected Handle it end to end |
| Planning Readiness | Not applicable: investigation only |
| Research depth and helpers | One completed wider/deeper/contrarian cycle; no helpers; direct primary-source verification |
| Blockers | None for documentation research |
| Output mode and planning support | research-only; no implementation handoff |
| Continuation owner | Automatic RPI Agent |
| Required gates or confirmations | No Azure mutations authorized |
| Next action | Close investigation with conditional feasibility answer; no automatic Plan or deployment handoff |
| Primary evidence file | .copilot-tracking/research/2026-11-18/ace-step-foundry-research.md; date from user current_datetime |

## Research Record

### Method and Boundaries

* Posture: balanced, default.
* Root: .copilot-tracking/research/2026-11-18/.
* Initial candidate areas: docs/azure-deployment.md, infra/platform.bicep, melody service/contracts; Microsoft Learn Foundry managed compute and Azure Machine Learning custom-container endpoints; official ACE-Step repository/model cards.
* Prior knowledge: General Azure endpoint concepts require current verification. A separate shared-foundry task exists but is not this task and will not be resumed or changed.
* Completion basis: Each question answered at documentation-feasibility depth; direct documented catalog lookup with a positive control; native Diffusers counter-evidence verified; remaining gaps require project/runtime/paid-test evidence rather than more generic searching.
* Limits: No deployment or paid test; no stated deadline; paraphrase sources and preserve source links.
* Helpers and effort: None; direct research.

### Extensions and Participation

| Kind | Candidate | Disposition and scoped authority |
|------|-----------|---------------------------------|
| Instructions | Tracking location and conventions | Selected for state/evidence ownership and paths |
| Instructions | Markdown and writing style | Selected; tracking files use the explicit markdownlint exemption |
| Instructions | Licensing posture | Selected; paraphrase-first public-source synthesis |
| Instructions | Telemetry overlay | Not applicable; investigation introduces no production behavior |
| Skill | Architecture diagrams, performance-slo-planner, experiment-design | Skipped; no diagram, SLO plan, or experiment design requested |
| Skill | rpi-research | Active phase owner |

Direction: User asks to investigate Foundry managed compute for ACE-Step and selects end-to-end handling. No further intake needed; compare hosting meanings before choosing technical direction.

### Research Cycle Log

#### Cycle 1

##### Wave 1: Wider

* Sources: Microsoft Learn deployment overview and managed-compute overview search results; official ACE-Step-1.5 README and API documentation; Earwyrm melody service and shared-AI deployment documentation.
* Reflection: New Foundry managed compute is distinct from classic AML hosting. ACE-Step 1.5 has a multi-stage LM/DiT/audio runtime and asynchronous API, not merely an LLM checkpoint. Prioritize whether custom containers or unsupported architectures can enter the new managed runtime, then examine generic AML custom-container feasibility separately.
* Version direction: Use official ACE-Step 1.5 as the current family, retaining the original ACE-Step ambiguity as a qualification. No source specifies a requested checkpoint.

##### Wave 2: Deeper

* Verified full W1 and deployment/Hugging Face guidance: Foundry new requires a compatible model asset and deployment template in azure-huggingface; runtime and image are Microsoft-owned; GPU-count quota is separate from VM quota. A100/H100/H200/MI300X are documented. Models can expose non-OpenAI endpoints.
* Verified official ACE-Step API and install guide: Python 3.11-3.12; about 10 GB core model storage; 4 GB DiT-only and 6 GB LM+DiT minimums, not universal sizing guarantees. Job submission/polling/download differs from chat completions.
* Verified AML managed-online deployment schema: custom containers supported; synchronous scoring has a documented 180-second ceiling, distinct from Foundry new.
* Pricing page renders placeholders rather than numeric GPU rates, so no numerical price is established.
* Reflection: Main gate is a supported catalog/runtime/template combination, not GPU capacity alone. Do not equate private custom weights or MIT metadata with arbitrary executable runtime support.

##### Wave 3: Contrarian

* Native Diffusers support verified at the complete pipeline documentation and official checkpoint card. Rejected categorical architectural-incompatibility claim.
* Catalog absence tested beyond web search: discovered and executed HF's documented public lookup for three relevant exact model IDs and the documented positive control. All ACE-Step checks returned model-specific 404, control returned 200. No helper/no lower-effort helper negative-result inference involved.
* LLM-only restriction rejected: W1 documents audio/hf-serve and non-OpenAI routes. Task names still do not guarantee music-field support.
* Full upstream service equals native pipeline rejected: W8 explicitly wraps DiT rather than optional LM planning. A compatible runtime must match the intended feature set.
* A direct ai.azure.com page fetch yielded only the single-page application shell, not model-card validation; it is not counted as evidence for or against catalog presence.
* Reflection: The public evidence supports a catalog-gated answer, not unconditional support or permanent impossibility. AML is an independently documented custom-runtime alternative, not equivalent to new Foundry.

##### Synthesis and Re-entry

| Material | Evidence | Disposition | Rationale |
|----------|----------|-------------|-----------|
| New Foundry can run any supplied ACE-Step Docker image | W1, W4 | Rejected as unsupported by reviewed contract | Curated model/template path, Microsoft-owned runtime |
| ACE-Step cannot use a standard HF library | W8, W9 | Rejected | Native Diffusers pipeline exists |
| Checked ACE-Step models are discoverable by documented public lookup | W7 | Rejected for the tested exact IDs | Three 404 results with positive 200 control |
| AML custom-container deployment is technically plausible | W12-W14 | Accepted with execution caveat | Platform supports required runtime ownership; actual packaging not tested |
| Exact cost, quota, and latency are known | W14, W15 | Deferred | Quote, subscription context, and execution evidence absent |

Another full cycle is not needed for this bounded investigation. The contrarian findings were resolved within this cycle. Re-entry is justified by an actual catalog/template reference, a requested model-onboarding investigation, or an explicitly scoped hosting test. Do not continue searching to manufacture an implementation selection.

### Evidence Log

| ID | Source or location | Retrieved and version | Claim or finding |
|----|--------------------|-----------------------|------------------|
| C1 | apps/api/src/melody_service.ts `MelodyService.submit`, `CompositionResult` | Workspace read, not applicable | Current local synthesis emits MIDI, timing, similarity, backing audio, and provenance |
| C2 | docs/azure-deployment.md `Shared AI configuration` | Workspace read, not applicable | Existing AIServices deployment serves text, Speech, and Content Safety; not evidence of music-model hosting |
| W1 | [Managed compute in Microsoft Foundry](https://learn.microsoft.com/azure/foundry/concepts/managed-compute-overview) | 2026-11-18, full current Learn page | Unified endpoint, curated runtimes, accelerator families, quota, billing, content-filter limits |
| W2 | [ACE-Step 1.5 README](https://github.com/ace-step/ACE-Step-1.5/blob/main/README.md) | 2026-11-18, main | Current family, GPU tiers, model variants, self-reported performance |
| W3 | [ACE-Step API](https://github.com/ace-step/ACE-Step-1.5/blob/main/docs/en/API.md) | 2026-11-18, main | Task submission, polling, file download, non-OpenAI API |
| C3 | apps/api/src/melody_mcp.ts `create_server` | Workspace read, not applicable | Existing durable queue identity and digest-checked artifacts |
| W4 | [Deploy open-source models with managed compute](https://learn.microsoft.com/azure/foundry/how-to/deploy-models-managed) | 2026-11-18, full current Learn page | Required model/template references, roles, quota, scopes, deployment lifecycle |
| W5 | [Hugging Face models in Foundry](https://learn.microsoft.com/azure/foundry/foundry-models/how-to/hugging-face-models) | 2026-11-18, full current Learn page | Curation, project filters, eligibility, model request path |
| W6 | [HF Azure supported models](https://huggingface.co/docs/microsoft-azure/foundry/models) | 2026-11-18, current | Documents public lookup API and limitations of curated catalog |
| W7 | [Public Azure model lookup](https://get-azure-ai-url.azurewebsites.net/api/get-azure-ai-url) | 2026-11-18, direct HTTP GET via curl | Query parameter model_id; three ACE-Step 404 responses and SmolLM3-3B 200 control recorded in F2 |
| W8 | [Diffusers ACE-Step 1.5 pipeline](https://huggingface.co/docs/diffusers/api/pipelines/ace_step) | 2026-11-18, rendered v0.43.0 documentation | Native AceStepPipeline, DiT-only synthesis coverage, lyrics/duration parameters |
| W9 | [Official XL Turbo Diffusers model card](https://huggingface.co/ACE-Step/acestep-v15-xl-turbo-diffusers) | 2026-11-18, main model card | Diffusers format, MIT weights, Apache-2.0 text encoder, source-install note |
| W10 | [Foundry Managed Compute announcement](https://devblogs.microsoft.com/foundry/announcing-foundry-managed-compute/) | 2026-11-18, dated 2026-06-03 | Platform distinction; broader custom-weight positioning does not prove arbitrary-runtime support |
| W11 | [HF Azure supported tasks](https://huggingface.co/docs/microsoft-azure/foundry/tasks) | 2026-11-18, current | Broad task list; text-to-audio/text-to-speech naming caveat |
| W12 | [AML custom containers](https://learn.microsoft.com/azure/machine-learning/how-to-deploy-custom-container?view=azureml-api-2) | 2026-11-18, CLI/SDK v2 | Custom web servers, health/scoring routes, model mounting, image ownership |
| W13 | [AML managed online deployment schema](https://learn.microsoft.com/azure/machine-learning/reference-yaml-deployment-managed-online?view=azureml-api-2) | 2026-11-18, CLI v2 current | 180000 ms scoring ceiling, 5000 ms default, probes and concurrency |
| W14 | [AML managed endpoint SKU list](https://learn.microsoft.com/azure/machine-learning/reference-managed-online-endpoints-vm-sku-list?view=azureml-api-2) | 2026-11-18, current | GPU family availability at platform level, not subscription capacity |
| W15 | [Foundry pricing](https://azure.microsoft.com/pricing/details/ai-foundry-models/microsoft/) | 2026-11-18, public page | Managed Compute hourly GPU entries rendered without numeric prices |
| W16 | [Request HF Azure model addition](https://huggingface.co/docs/microsoft-azure/guides/request-model-addition) | 2026-11-18, current | Request path and inclusion criteria; no request submitted |
| W17 | [ACE-Step installation](https://github.com/ace-step/ACE-Step-1.5/blob/main/docs/en/INSTALL.md) | 2026-11-18, main | Python, memory, disk, first-run downloads |
| W18 | [ACE-Step 1.5 model card](https://huggingface.co/ACE-Step/Ace-Step1.5) | 2026-11-18, main | MIT, Transformers metadata, text-to-audio; publisher claims are not independent validation |
| W19 | [Original ACE-Step model card](https://huggingface.co/ACE-Step/ACE-Step-v1-3.5B) | 2026-11-18, main | Original 3.5B generation and Apache-2.0 metadata; do not conflate with 1.5 |

All external sources were fetched directly through web/docs tools, except W7 which was executed with read-only HTTP requests. General web/docs searches supplied discovery only. No repository code, credentials, or private configuration was sent to an external search system.

#### Contradictions and Conflicts

* Upstream README/model-card performance claims use different configurations and XL parameter/weight figures are not fully consistent across cards. Retain configuration-specific guidance and require pinned checkpoints plus measurement; do not derive deployment memory from parameter slogans.
* The native checkpoint card says to install Diffusers from source until a release includes AceStepPipeline, while rendered docs identify v0.43.0. Pin and test an actual release/commit instead of assuming a curated runtime has the same version.
* HF task guidance lists text-to-speech both as supported and upcoming and equates it with former text-to-audio. It does not settle music-generation task semantics.
* Learn overview and tutorial authentication examples name different token audiences; capture as a future validation item rather than emitting untested auth code.
* Broad announcement support for custom weights does not override the specific documented model/template workflow or prove support for custom executable serving stacks.

### Artifact Self-Check

* [x] Reader-first sections explain findings, alternatives, decisions, risks, and continuation.
* [x] Every question is answered or names the smallest missing evidence.
* [x] Material findings separate documented support, observed lookup results, inference, and unexecuted deployment.
* [x] Code evidence has C IDs and symbol/heading locations; external evidence has W IDs, source links, dates, and applicable versions.
* [x] Wider, deeper, and contrarian waves ran in order with reflections, dispositions, and a re-entry decision.
* [x] Participation, boundaries, extensions, prior knowledge, and absence of helpers are recorded.
* [x] Research-only scope preserves alternatives without selecting a deployment implementation.
* [x] No unresolved user decision blocks this investigation; residual validation gaps remain explicit.
* [x] Evidence persisted; no secrets or third-party expressive text reproduced; research-only write boundary held.
* [x] No build or runtime tests were run or implied. Validation was a source/artifact self-check plus read-only public catalog HTTP probes.

Checked sections: all. Limitations: authenticated project catalog, subscription quota/capacity, numeric rate, deployment health, and generated audio quality remain unverified. These limit a deployment decision, not completion of the requested public-evidence investigation.
