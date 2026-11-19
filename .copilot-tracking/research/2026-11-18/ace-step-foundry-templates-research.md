<!-- markdownlint-disable-file -->
# Task Research: ACE-Step Foundry model and template route

| Field | Value |
|-------|-------|
| Date | 2026-11-18 |
| Output mode | research-only |
| Researcher / agent | RPI Agent / rpi-research |

## Executive Summary

No deployable ACE-Step model/template pair was found in the accessible new-Foundry registry. Read-only discovery enumerated 153 model containers and 1,446 deployment-template records, following both forms of pagination to completion. None matched ACE-Step/acestep by name. Exact model lookup and the public HF mapping checks also failed for the candidate checkpoints.

The route is not categorically ruled out: the ARM/SDK contract accepts generic registry model URIs, makes the template field optional, and describes project-scoped templates for VmManagedCompute. Public documentation does not establish that customer-published templates are admitted to GlobalManagedCompute, or document a usable VM-backed path for ACE-Step. The next missing evidence is a service-owner-confirmed model/runtime/template combination, not GPU capacity alone.

Public-source and accessible-registry research is complete. Platform admission, runtime loading, and audio inference remain unverified. No deployment, inference, upload, or public request was performed.

## What You May Not Know

* The documented template-list CLI returned only ten records. Its installed SDK follows nextLink, but the live service returns continuationToken. Using the REST contract and following that token expanded the check to 1,446 records. A short CLI list is not an exhaustive catalog check.
* A real Diffusers catalog model has a specialized protein-generation runtime and scoring API. Sharing the Diffusers library does not make its template reusable for music.
* The official ACE-Step Diffusers checkpoint is a stronger onboarding candidate than the original custom-code checkpoints, but a missing custom_code tag is not proof of runtime compatibility. Its model_index.json references an ACE-Step-specific condition encoder; the managed image must resolve it correctly.
* Current Fireworks custom-weight import and Foundry-managed LoRA documentation describe separate, constrained paths. Neither establishes arbitrary ACE-Step architecture support on GlobalManagedCompute.

## Findings

Numbering continues from F6/W19 in .copilot-tracking/research/2026-11-18/ace-step-foundry-research.md.

### F7: Live registry discovery strengthens the bounded absence result

The accessible azure-huggingface registry contained 153 model containers across four pages. Case-insensitive name checks for ACE-Step/acestep found no match. The normalized XL Turbo Diffusers model returned no versions through REST, and the CLI reported that the asset did not exist. XL Base and SFT Diffusers variants also returned HTTP 404 through the documented public mapping service.

This is stronger than the original mapping-only test, but is not proof about hidden aliases, private previews, other registries, or future catalog updates. The 11,000-model figures in general HF documentation also cover classic/AML experiences; they do not describe the 153 containers observed in this new-Foundry registry.

* Questions: Q6
* Evidence state: Evidence-backed finding, bounded to the queried registry and names
* Evidence: W20, W24, W25, W29
* Confidence: High for the observations; no universal availability claim

### F8: The API is broader than the curated deployment tutorial

The ARM and JavaScript SDK contract requires a registry model URI but does not restrict its registry name syntactically to azure-huggingface. deploymentTemplate is optional. For VmManagedCompute, it also describes a computeId and a project-scoped template path.

This qualifies any earlier interpretation that the explicit curated template and registry are universal API requirements. It does not show the service will accept a customer registry, infer a runtime for an unknown architecture, or run a custom image on GlobalManagedCompute. Current overview documentation describes Global and Data Zone scopes, not a practical VmManagedCompute onboarding workflow. Searches for VM-backed/project-scoped support produced schema references rather than that missing procedure.

* Questions: Q7
* Evidence state: Evidence-backed schema finding; customer admission remains an unresolved possibility
* Evidence: W21, W31
* Confidence: High for field semantics; insufficient evidence for executable customer BYOM support

### F9: Registry templates can be inspected, but are model/runtime-specific

The documented CLI can inspect a real template and model-to-template references. For example, the observed nvidia--rfd4-proteina-diffusers version 1 model points at:

`azureml://registries/azure-huggingface/deploymenttemplates/nvidia--rfd4-proteina-diffusers--nvidia-a100/versions/1`

That template references hf-rfd4-proteina-nvidia environment version 1, assigns one A100_80GB, mounts the model at /var/azureml-app, and scores on /v1/designs at port 8000. Its input/output are protein-design formats, not music. It is an actual inspectable asset, not a candidate ACE-Step deployment.

The full template enumeration contained 1,446 records across 15 pages, without ACE-Step/acestep name matches. No description matched the exploratory music-generation/text-to-audio/text-to-music terms either; descriptions are not a complete task taxonomy, so that secondary search does not establish that audio runtimes are absent.

* Questions: Q6, Q7
* Evidence state: Evidence-backed finding
* Evidence: W28, W29
* Confidence: High for inspected metadata and pagination; no cross-architecture compatibility inferred

### F10: Native Diffusers helps onboarding, not automatic deployment

The official XL Turbo, Base, and SFT Diffusers repositories are public, tagged for Diffusers/text-to-audio, and carry MIT metadata. Their API metadata does not advertise custom_code, unlike many original-format checkpoints. XL Turbo's model card cites the merged AceStepPipeline and a single from_pretrained call.

The actual model_index.json records a development Diffusers version and refers to condition_encoder as ace_step/AceStepConditionEncoder. Rendered Diffusers documentation identifies v0.43.0 and exposes lyrics, audio_duration, vocal_language, sampling settings, and stereo 48 kHz audio output. These sources establish a credible runtime target, not a tested version pin or a compatible managed server.

The required verification is loading the exact checkpoint revision inside the candidate managed image without arbitrary remote-code execution, including the condition encoder, tokenizer, VAE, and dependencies. Optional raw silence_latent.pt is listed in the card as unnecessary at runtime; curation still needs a file/format review rather than assuming every artifact is Safetensors.

* Questions: Q7, Q8
* Evidence state: Evidence-backed candidate identification; serving compatibility remains unresolved
* Evidence: W20, W26, W27
* Confidence: High for published metadata and signatures; no inference or dependency installation performed

### F11: Template publication and BYOW examples do not close admission

Customer AML registry templates are documented, including custom environments and default_deployment_template model metadata. The demonstrated target is AML managed online endpoints. The similarly named Foundry Local custom-template guide targets Arc-connected Kubernetes. Neither is evidence that GlobalManagedCompute admits those customer environments.

The Managed Compute launch announcement puts BYOW on its roadmap, although its introduction describes the longer-term custom-model vision. More recent Fireworks documentation does support custom-weight import, but requires matching supported Fireworks base architectures and uses its provisioned deployment path. Current managed-compute adapter documentation allows Foundry-produced LoRAs only and says imported adapters are not yet supported on that path.

Consequently, do not treat a generic model URI, an omitted template, a Qwen-based encoder/planner, or a separately documented BYOW workflow as permission to deploy the ACE-Step DiT.

* Questions: Q7
* Evidence state: Evidence-backed distinction; ACE-Step admission remains unresolved
* Evidence: W21-W23, W31-W34
* Confidence: High for documented scope; historical roadmap language is not asserted as current universal availability

### F12: There is a documented onboarding request route

HF documents Request to add on the model card and issues in huggingface/Microsoft-Azure as model-addition channels. Its criteria include compatible framework/task metadata, public weights, license and Safetensors checks, and restrictions on unverified custom code. The task list aliases text-to-audio to text-to-speech and mixes AML/Foundry language; that does not prove a lyrics-plus-duration music handler exists.

Microsoft documents demand-driven curation, runtime image preparation, and model/runtime/accelerator validation before catalog publication. The launch post also links a Managed Compute preview intake form. These are contact/request paths, not acceptance guarantees or a deployment entitlement.

The draft below asks specifically for the new GlobalManagedCompute path so a generic classic-model addition would not be mistaken for success.

* Questions: Q8
* Evidence state: Evidence-backed request channels; acceptance and ownership must be confirmed by the service teams
* Evidence: W30-W32
* Confidence: High for published request paths; no request submitted

## Recommendation and Alternatives

The Foundry route remains plausible but not deployment-ready. No verified model/template references for ACE-Step can be supplied.

* Catalog onboarding of the native XL Turbo Diffusers checkpoint is the most concrete documented route to pursue. It requires architecture loading, task/API support, curation, and publication, not just copying weights into a registry.
* Customer registry/project templates remain an explicit question for the Foundry team, especially the distinction between GlobalManagedCompute and VmManagedCompute. Preserve this possibility rather than declaring it unsupported.
* AML custom-container and Foundry Local examples are explanatory contrasts only, not selected alternatives or implementation handoffs.

### Unsubmitted model and runtime request

Request ACE-Step 1.5 XL Turbo Diffusers support specifically on new Foundry Managed Compute, starting with the public ACE-Step/acestep-v15-xl-turbo-diffusers repository and its native AceStepPipeline documentation. XL Base/SFT Diffusers are secondary candidates.

Ask the Foundry/HF teams to confirm:

1. Whether an existing, aliased, or private-preview asset is available, with exact model version, template version, managed environment/runtime version, supported scope, and accelerator references.
2. Whether customer registry templates are admitted to GlobalManagedCompute, and whether omitted deploymentTemplate resolves only an existing default. If VmManagedCompute is a supported customer route, request its compute/template authoring and access prerequisites.
3. Whether a maintained managed runtime can load the exact ACE-Step pipeline and condition encoder without trust_remote_code, and which dependency versions/checkpoint revisions are validated.
4. Whether its scoring schema preserves prompt, lyrics, audio_duration, vocal_language, seed, and denoising-step controls, and how stereo 48 kHz audio is returned. Confirm timeout, maximum duration, concurrency, and artifact limits.
5. Who owns adding the model/task/runtime combination and publishing its default template, including file-format, security, component-license, and accelerator validation.
6. Whether a single A100/H100 model instance is a supported starting configuration, with measured memory/latency and current dedicated-capacity pricing before any paid experiment.

Published request paths: [HF model-addition guidance](https://huggingface.co/docs/microsoft-azure/guides/request-model-addition), [HF/Azure issue entry](https://github.com/huggingface/Microsoft-Azure/issues/new), and the [preview intake linked by Microsoft](https://forms.cloud.microsoft/r/8Jnx1LALLA). This text is research output only; submitting it requires separate consent.

## Scope and Questions

* Goal: Investigate model discovery, template compatibility, custom-model/template publication, and model onboarding for ACE-Step.
* In scope: Read-only public catalog/API/docs queries; existing local Azure authentication may be used for read-only discovery if available, without exposing credentials.
* Out of scope: Deployment, resource creation, inference charges, model uploads, public posts, and fallback implementation.
* Evidence criteria: Obtain actual compatible model/template references or identify precisely who can publish them and what is missing.

| ID | Question | Status |
|----|----------|--------|
| Q6 | Can ACE-Step aliases or Diffusers variants be found beyond the HF mapping service? | No match in fully paginated accessible registry; official native variants identified; hidden aliases remain unverified |
| Q7 | Can customers create or reuse a new-Foundry template for an arbitrary compatible model? | Broader schema verified; customer admission and practical VmManagedCompute path require service-owner evidence |
| Q8 | What exact onboarding evidence and request path could enable this model? | Published request channels and an unsubmitted, runtime-specific request recorded |

## Decisions and Feedback

| Group | Decision or feedback item | Status | Owner | Rationale |
|-------|---------------------------|--------|-------|-----------|
| D5 | Continue Foundry model/template investigation | Confirmed | User | User follow-up at 19:47 local; preserve research-only boundary |
| D6 | Qualify the initial explicit-template/registry interpretation | Accepted | Agent | W21 shows broader field semantics; do not infer service admission from schema |
| D7 | Stop public discovery at a service-owner evidence boundary | Accepted | Agent | Full registry/template pagination plus focused/contrarian documentation checks found no ACE-Step pair; no deployment or public posting authorized |

## Risks and Open Questions

* The accessible registry is not every catalog, alias, or private preview. No browser-authenticated Foundry portal session was available for an independent project-filtered check.
* A generic registry URI and optional template do not establish custom-runtime admission. Service-owner confirmation or a published new-Foundry procedure is the smallest evidence needed to reopen that question.
* Native HF metadata and rendered Diffusers documentation need validation against an exact managed runtime image. Metadata alone does not establish no-custom-code compliance.
* Music generation requires a task handler and binary/audio response contract, not just an LLM-compatible endpoint.
* The launch post lists historical GPU rates and preview status; use current pricing/quota sources before paid work. No cost quote or capacity availability was established here.
* GH CLI access to an Azure SDK directory was blocked by organization SAML enforcement. No authentication bypass was attempted. Installed public SDK files, documentation, and successful live GETs supplied the needed REST contracts.

## Planning Readiness and Next Step

| Field | Record |
|-------|--------|
| Execution status | Complete for public and accessible-registry discovery; platform admission remains unverified |
| Research disposition | executed |
| Decision participation | Agent-owned, inherited automatic mode |
| Planning Readiness | Not applicable: research-only |
| Next action | Obtain service-owner answers to the unsubmitted request if the user elects to pursue onboarding |
| Primary evidence file | .copilot-tracking/research/2026-11-18/ace-step-foundry-templates-research.md |
| Blockers | No blocker to research closeout; deployment planning lacks an admitted ACE-Step model/runtime/template pair |

## Research Record

### Method and Boundaries

Balanced posture, narrowed by explicit user direction to Foundry model/template route. Root is .copilot-tracking/research/2026-11-18, date from user current_datetime. Reuse earlier W1-W19 as context, not proof of exhaustive catalog absence. No helpers. No deadline.

Extensions: tracking location/conventions, Markdown/writing, and licensing instructions retained. Microsoft Foundry skill selected for platform discovery; no hosted-agent workflow applies. Its dependency check initially failed executable permissions, then ran through Bash and installed its missing azd extensions. After the documented az ml command failed because ml was missing, the CLI extension was installed for read-only inspection. No Azure resource changes.

### Research Cycle Log

#### Cycle 2

##### Wider

* Official ARM/SDK references expose more than the portal walkthrough: deploymentTemplate is optional, model accepts a registry URI, and VmManagedCompute accepts project-scoped templates. This is a material lead, not proof that arbitrary templates work on GlobalManagedCompute.
* Customer-authored AML registry deployment templates are documented, but their demonstrated target is managed online endpoints. Foundry Local custom-template instructions target Arc deployments, not the global managed GPU service.
* HF's author-model API exposes official XL base/SFT Diffusers variants in addition to Turbo. Primary original-format 1.5 models have custom_code tags; native Diffusers variants do not.
* Existing Azure CLI authentication works, allowing read-only provider/catalog discovery without fetching keys.
* Reflection: Prioritize the boundary between GlobalManagedCompute and VmManagedCompute, and direct registry discovery. Avoid treating catalog absence as sufficient to rule out bring-your-own registry assets.

##### Deeper

* Registry discovery succeeded with existing CLI authentication. Following every nextLink on the discovered azure-huggingface registry endpoint returned 153 model containers across four pages, with no case-insensitive ACE-Step/acestep name match. The initial contains/$top request was ignored by the service; the complete enumeration, not that filter, supports this bounded result.
* An exact normalized XL Turbo Diffusers model/version lookup returned an empty list. Additional official XL Base and SFT Diffusers HF mapping requests both returned HTTP 404. These observations do not cover private catalogs or unidentified aliases.
* ARM/SDK references corroborate VmManagedCompute/project-scoped-template fields, but targeted searches found schema references rather than an executable onboarding guide. Treat it as a lead requiring service-owner clarification.
* The launch announcement explicitly places Bring Your Own Weights on its roadmap despite aspirational introductory language about custom models. It links a Managed Compute preview intake form. This is dated launch evidence, not proof of today's availability.
* Reflection: A valid Foundry model/template pair remains missing. Contrarian work must test customer template discovery, native pipeline dependency assumptions, and whether later documentation actually announces BYOW rather than confusing AML/Arc examples with GlobalManagedCompute.

##### Contrarian

* The service does expose non-chat, non-LLM runtime templates: a real Diffusers protein model supplies a counterexample to any assumption that Managed Compute is LLM-only. Its specialized environment/API also demonstrates why a generic Diffusers label is insufficient.
* The documented template-list client yielded ten entries. Installed SDK source revealed nextLink-only extraction while the service returned continuationToken. Direct, error-checked pagination subsequently traversed all 15 pages (1,446 records), finding no ACE-Step name or exploratory music-task description match.
* An initial response-shape assumption and an auxiliary jq selector failed. Corrected parsing and a complete rerun finished without errors; only the successful enumeration supports the final counts and candidate results.
* Native Diffusers cards/docs support the candidate, but model_index.json retains a development version and an ACE-Step condition-encoder reference. A library tag is weaker evidence than loading the exact checkpoint in the managed image.
* Later Fireworks BYOW and managed-compute adapter documentation are real capabilities, but architecture/base-model restrictions and differing deployment paths do not establish ACE-Step support.
* HF task guidance groups text-to-audio under speech and mixes classic/AML and current Foundry concepts. Do not equate that task label with a validated music-serving schema.
* Reflection: The public evidence now distinguishes registry absence, schema capability, runtime compatibility, and service admission. Further generic searches repeat documentation; the material remaining questions require an unpublished owner response or new official onboarding procedure.

##### Synthesis and Re-entry

Accepted F7-F12 and D6-D7. Rejected categorical claims that only LLMs can use Managed Compute, that an explicit template is universally API-required, and that generic AML/Arc templates prove GlobalManagedCompute BYOM. Deferred deployment, uploads, runtime/inference experiments, and public requests as outside authority.

No additional research cycle is selected: all three questions are answered to the accessible evidence boundary, and the missing service-admission/runtime proof cannot be established by repeating public catalog searches. Re-enter on an owner-provided asset/template pair, a customer-template admission guide, or confirmed VmManagedCompute onboarding access. This research-only task has no Plan/Implement handoff and requires no acknowledgement-only prompt.

### Evidence Log

| ID | Claim or finding | Source or location | Retrieved and version |
|----|------------------|--------------------|-----------------------|
| W20 | Official variants and framework/task/license/custom_code metadata | [HF author API](https://huggingface.co/api/models?author=ACE-Step&limit=100) | 2026-11-18 investigation |
| W21 | Generic registry model URI, optional template, computeId and project-template semantics | [ARM reference](https://learn.microsoft.com/en-us/azure/templates/microsoft.cognitiveservices/accounts/managedcomputedeployments), [JavaScript SDK](https://learn.microsoft.com/en-us/javascript/api/@azure/arm-cognitiveservices/managedcomputedeploymentproperties?view=azure-node-preview) | 2026-11-18 investigation; ARM latest listed 2026-09-15-preview |
| W22 | Customer template publication is documented for AML managed online endpoints | [Concept](https://learn.microsoft.com/en-us/azure/machine-learning/concept-deployment-template?view=azureml-api-2), [Authoring](https://learn.microsoft.com/en-us/azure/machine-learning/how-to-manage-models-deployment-templates?view=azureml-api-2) | 2026-11-18 investigation |
| W23 | Foundry Local custom-template scope is Arc-connected Kubernetes, not global GPUs | [Local guide](https://learn.microsoft.com/en-us/azure/azure-sovereign-clouds/private/foundry-local/how-to-customize-deployment-template-foundry-portal) | 2026-11-18 investigation |
| W24 | Read-only registry discovery and full model-container enumeration; 153 entries, four pages, no ACE name matches; exact candidate absent | [Discovery GET](https://eastus.api.azureml.ms/registrymanagement/v1.0/registries/azure-huggingface/discovery?api-version=v1.0); discovered primaryRegionResourceProviderUri plus model-list API version 2024-04-01; az ml model show negative and positive controls | 2026-11-18 investigation; live Azure CLI/REST observations |
| W25 | Additional native Base/SFT mapping requests returned HTTP 404 | [Documented mapping API](https://get-azure-ai-url.azurewebsites.net/api/get-azure-ai-url), model_id ACE-Step/acestep-v15-xl-base-diffusers and ACE-Step/acestep-v15-xl-sft-diffusers | 2026-11-18 investigation; initial Turbo/1.5/original checks retained in parent report |
| W26 | Actual checkpoint pipeline and component-version declarations | [model_index.json](https://huggingface.co/ACE-Step/acestep-v15-xl-turbo-diffusers/raw/main/model_index.json), [condition encoder config](https://huggingface.co/ACE-Step/acestep-v15-xl-turbo-diffusers/raw/main/condition_encoder/config.json) | 2026-11-18 investigation; mutable main, not a revision pin |
| W27 | Native pipeline inputs, audio output, dependencies, and component licensing | [Official model card](https://huggingface.co/ACE-Step/acestep-v15-xl-turbo-diffusers), [Diffusers documentation](https://huggingface.co/docs/diffusers/api/pipelines/ace_step) | 2026-11-18 investigation; rendered docs v0.43.0; card recommends source installation |
| W28 | Real Diffusers model default/allowed templates and specialized template environment/API | az ml model show --registry-name azure-huggingface --name nvidia--rfd4-proteina-diffusers --label latest; az ml deployment-template show --registry-name azure-huggingface --name nvidia--rfd4-proteina-diffusers--nvidia-a100 --version 1; [CLI reference](https://learn.microsoft.com/en-us/cli/azure/ml/deployment-template?view=azure-cli-latest) | 2026-11-18 investigation; live read-only model/template version 1 |
| W29 | Complete template enumeration requires continuationToken; 1,446 records across 15 pages | SDK-derived GET https://eastus.api.azureml.ms/genericasset/v2.0/.../registries/azure-huggingface/deploymenttemplates?api-version=2026-05-01-preview; count=100; URL-encoded continuationToken until absent. Installed SDK operations/_operations.py extracts nextLink rather than the returned token | 2026-11-18 investigation; final complete rerun without parsing errors |
| W30 | Model-addition request paths, metadata/format/custom-code criteria, and task-list ambiguity | [Request guide](https://huggingface.co/docs/microsoft-azure/guides/request-model-addition), [Tasks](https://huggingface.co/docs/microsoft-azure/foundry/tasks), [Models](https://huggingface.co/docs/microsoft-azure/foundry/models) | 2026-11-18 investigation |
| W31 | Current curated runtime ownership, validation, scopes, and task-specific endpoint routes | [Managed Compute overview](https://learn.microsoft.com/en-us/azure/foundry/concepts/managed-compute-overview), [HF model guide](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/how-to/hugging-face-models) | 2026-11-18 investigation; overview dated 2026-11-10; fetched guide updated 2026-11-17 |
| W32 | Launch BYOW roadmap, historical prices, and preview intake link | [Microsoft launch announcement](https://devblogs.microsoft.com/foundry/announcing-foundry-managed-compute/) | 2026-11-18 investigation; launch dated 2026-06-03, not current availability proof |
| W33 | Fireworks BYOW requires supported base architecture and uses its own provisioned path | [Import guide](https://learn.microsoft.com/en-us/azure/foundry/how-to/fireworks/import-custom-models) | 2026-11-18 investigation; fetched metadata updated 2026-11-17 |
| W34 | Managed-compute adapters require compatible targets and Foundry fine-tuning output; imported adapters not yet supported on this path | [Adapter overview](https://learn.microsoft.com/en-us/azure/foundry/concepts/adapter-deployment-overview) | 2026-11-18 investigation; fetched metadata updated 2026-11-17 |

### Artifact Self-Check

All three waves completed without helpers. Findings distinguish observed behavior, source claims, interpretation, and unresolved service admission. Initial failed/partial queries were superseded by successful full pagination. No working ACE-Step deployment is claimed. No secrets, Azure resources, model uploads, inference calls, or public posts were produced. Only research/workflow artifacts changed in the repository; local tool-extension installations are recorded above. Research-only continuation and the unsubmitted owner request are explicit.
