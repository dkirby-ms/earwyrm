<!-- markdownlint-disable-file -->
# RPI Plan Critique: LLM MIDI Jingle Pipeline

## Metadata

* Task ID: `llm-midi-jingle`
* Critique date: 2026-11-19
* Plan: .copilot-tracking/plans/2026-11-19/llm-midi-jingle-plan.md
* Critique execution: Complete
* Critique depth: standard
* Depth provenance: default
* Critique type: initial
* Earlier critique: not applicable

## Inputs and Criterion Boundary

* Task context and caller requirements: Investigate the supplied LLM MIDI-jingle idea and produce an implementation-ready plan; source implementation, deployment execution, and paid live inference remain outside scope.
* Research and evidence considered: .copilot-tracking/research/2026-11-19/llm-midi-jingle-research.md; docs/idea.md; docs/service-contracts.md; docs/azure-deployment.md; .github/workflows/deploy-web.yml; Dockerfile; Dockerfile.web; relevant API provider, compose, persistence, and renderer modules named in the plan.
* Decisions, dependencies, task Goals, and task Requirements considered: Planning decisions D1-D4; FR-001-FR-006; NFR-001-NFR-006; dependencies and risks assigned to P01-P04 and P01-T01-P04-T02.
* Assessment boundary: Assess the complete supplied plan and its cited research/code evidence for coverage, evidence support, executability, dependencies, cost/consent controls, and material risks. Do not inspect live model configuration, perform open-ended research, or infer unsupported provider behavior.

## Lens Assessments

| Lens | Scope | Reasoning effort and source | Status | Candidates |
|------|-------|-----------------------------|--------|------------|
| Coverage | All requirements, goals, phases, tasks, and traceability | low (auto-selected) | Complete | 7 adopted; 0 rejected |
| Evidence | P01-P04, research, sources, task details, and decisions | medium (auto-selected) | Complete | 3 adopted; 0 rejected: two merged into existing findings |
| Executability | P01-P04, phase/task order, dependencies, checks, environments, and budgets | medium (auto-selected) | Complete | 7 adopted; 2 rejected: two merged into existing findings |
| Risk | P01-P04, external actions, consent, idempotency, deployment, and uncovered material risks | medium (auto-selected) | Complete | 6 adopted; 2 rejected: three merged into existing findings |

## Coverage Assessment

| Requirement, research, phase, or task ID | Coverage | Evidence or concern |
|------------------------------------------|----------|---------------------|
| FR-001, P01-T01, P02-T01, P04-T02 | Partial | The brief boundary and supported style are not defined at the compose request. |
| FR-002, P01-T01, P02-T01 | Partial | Screening and field-level validation are not stated as a complete pre-render boundary. |
| FR-003, P03-T01 | Partial | Unknown provider outcomes lack a defined state, owner, and reconciliation path; persistence evolution/rollback is unspecified. |
| FR-004, P02-T01, P02-T02, P04-T01 | Partial | Model capability, idempotent reservation/cost, and normal deployment enablement lack complete pass criteria. |
| FR-005, P03-T02, P04-T01 | Partial | SoundFont path and notice checks need named image locations and non-root runtime verification. |
| FR-006 | Covered | P01-T01/P02-T02 retain the deterministic preview and legacy paths. |
| NFR-001 | Covered | P01-T01/P01-T02 give the tempo, bar, and duration bounds. |
| NFR-002, P02-T01, P02-T02 | Partial | Model support, provider-reported token measurement, budget ceiling, and consent disclosure are incomplete. |
| NFR-003, P03-T01 | Partial | Retry behavior is bounded in principle but the unknown-outcome contract and migration recovery are incomplete. |
| NFR-004, P01-T02, P03-T01 | Partial | Existing records and rollback compatibility are not addressed. |
| NFR-005 | Covered | Provider-injected tests and no paid test calls are explicitly required. |
| NFR-006, P04-T02 | Partial | Listening outputs have no specified generation source or reproducible sample identity. |
| Supplied idea scope, D1-D4, P01-T01, P04-T02 | Partial | Several idea extensions are omitted without a documented first-increment deferral. |
| P02-T01, P02-T02, P03-T01 | Partial | P03-T01 consumes the provider contract but does not name P02-T01 as a direct dependency. |

## Verdict

* Verdict: Revise
* Rationale: Three High findings require a defined listening-evaluation source, an actionable reconciliation contract for uncertain provider outcomes, and a bounded/idempotent paid-action reservation contract. Medium and Low findings also have planner-owned corrections; no current finding requires a user decision.

## Findings

<!-- rpi:critique id=PC-001 -->
### PC-001 [High]: Listening evaluation has no defined composition source

* Related IDs: NFR-006, P04-T02
* Evidence: .copilot-tracking/plans/2026-11-19/llm-midi-jingle-plan.md; docs/idea.md; .copilot-tracking/research/2026-11-19/llm-midi-jingle-research.md
* Concern: The task requires listening to three brief-based compositions but does not state whether they are fixtures or outputs from the paid composer. Automated tests cannot call Foundry, and this RPI request excludes paid live inference.
* Impact: Brief fit and musical-quality results cannot be reproduced or accepted as written.
* Smallest useful change: State that future manual evaluation uses three separately consented, budget-reserved compose actions; automated tests remain provider-injected. If those actions are not authorized or budgeted, mark the evaluation blocked rather than substituting fixtures.
* Action owner: planning parent
* Exact resolving evidence: P04-T02 names the evaluation output source, separates it from automated tests, and records the three sample identities and rubric results.
* Decision route: direct planner correction

<!-- rpi:critique id=PC-002 -->
### PC-002 [High]: Ambiguous provider timeouts lack a reconciliation contract

* Related IDs: NFR-003, P03-T01
* Evidence: .copilot-tracking/plans/2026-11-19/llm-midi-jingle-plan.md; .copilot-tracking/research/2026-11-19/llm-midi-jingle-research.md
* Concern: The plan says to persist an uncertain outcome but does not define the stored state, who reconciles it, how the user/operator sees it, or what evidence allows another paid attempt.
* Impact: A job can remain unresolved indefinitely, or an unguarded retry can incur a duplicate charge.
* Smallest useful change: Define an explicit unknown-provider-outcome state, a non-success response, operator reconciliation using provider status/idempotency evidence, and a test proving no automatic resubmission or second reservation before resolution.
* Action owner: planning parent
* Exact resolving evidence: NFR-003 and P03-T01 specify state transitions, user/operator outcome, reconciliation owner/evidence, and the expected timeout-test result.
* Decision route: direct planner correction

<!-- rpi:critique id=PC-003 -->
### PC-003 [Medium]: Several supplied idea features are silently out of scope

* Related IDs: D1-D4, P01-T01, P04-T02
* Evidence: docs/idea.md; .copilot-tracking/plans/2026-11-19/llm-midi-jingle-plan.md
* Concern: The plan omits humanization, velocity/dynamics, polyphony limits, named section variation, drum-specific constraints, and the second Composer/Producer pass without recording whether they are intentionally deferred.
* Impact: The plan can be mistaken for covering the complete supplied idea, and implementers cannot distinguish a deliberate first-increment boundary from an omission.
* Smallest useful change: Add one grouped, evidence-backed deferral to Planning Decisions, Non-Goals, and Follow-Up Items, retaining the current bounded first increment.
* Action owner: planning parent
* Exact resolving evidence: D5 and the Non-Goals/Follow-Up sections explicitly list these supplied idea extensions as deferred, separate from active FRs and tasks.
* Decision route: direct planner correction

<!-- rpi:critique id=PC-004 -->
### PC-004 [Medium]: The score request does not define its brief input or style

* Related IDs: FR-001, P01-T01, P02-T01, P04-T02
* Evidence: apps/api/src/lyrics.ts; apps/api/src/jingle_chat.ts; apps/api/src/melody.ts; .copilot-tracking/plans/2026-11-19/llm-midi-jingle-plan.md
* Concern: The existing lyric request has an `AdvertiserBrief` and `retro-synth` style, but `composition_request` drops the brief when it creates `CompositionRequest`. The plan requests a selected brief and later names only an undefined "supported v1 style."
* Impact: The provider input and three-brief listening task cannot be implemented or reproduced from the current contract.
* Smallest useful change: Define a bounded, server-supplied brief subset for the composition request, exclude unnecessary contact details/raw chat, and name `retro-synth` as the v1 style.
* Action owner: planning parent
* Exact resolving evidence: FR-001, P01-T01, P02-T01, and P04-T02 identify the input subset and `retro-synth` consistently.
* Decision route: direct planner correction

<!-- rpi:critique id=PC-005 -->
### PC-005 [Medium]: Normal deployment enablement has no explicit task outcome

* Related IDs: Goals, FR-004, P02-T01, P04-T01
* Evidence: .github/workflows/deploy-web.yml; docs/azure-deployment.md; .copilot-tracking/plans/2026-11-19/llm-midi-jingle-plan.md
* Concern: The plan's goal says the feature is enabled by normal deployment, but P04-T01 only reconciles documentation and no task explicitly verifies that the application uses the existing shared Foundry settings and paid-text availability contract.
* Impact: Documentation can be updated while the normal deployment still cannot expose the composer, or a new feature-specific switch may be introduced contrary to direction.
* Smallest useful change: Make normal shared-Foundry wiring and reuse of the existing paid-text gate a P02/P04 task requirement; prohibit adding a composer-specific deployment flag.
* Action owner: planning parent
* Exact resolving evidence: A task states the existing deployment/settings and availability gate that enable the composer by default, with no new feature-level setting or approval.
* Decision route: direct planner correction

<!-- rpi:critique id=PC-006 -->
### PC-006 [High]: Paid compose has no bounded, idempotent reservation contract

* Related IDs: NFR-002, FR-004, P02-T01, P02-T02, P03-T01
* Evidence: apps/api/src/lyric_budget.ts; docs/service-contracts.md; .copilot-tracking/research/2026-11-19/llm-midi-jingle-research.md
* Concern: The plan does not define how to verify the configured model/version's structured-output support, how to measure completion tokens against the cap, what compose reserves, how it fits the shared per-action/total caps, or what cost the user consents to.
* Impact: A compose call could exceed the shared ledger, disclose no meaningful maximum to the user, or be charged twice after an interrupted request.
* Smallest useful change: Define the supported-model check and no-go behavior; a compose call ceiling and cost formula using existing approved budget values; provider-reported token usage; reservation before invocation keyed idempotently by logical job; committed-job lookup before reserving; and maximum-cost disclosure before consent.
* Action owner: planning parent
* Exact resolving evidence: P02-T01/P02-T02, P03-T01, and the service contract specify the capability-check result, hard completion limit, provider-usage measurement, cost formula, ledger limits, reservation identity/order, and consent disclosure.
* Decision route: direct planner correction; reuse existing operator-approved USD bounds rather than selecting new amounts.

<!-- rpi:critique id=PC-007 -->
### PC-007 [Low]: P03-T01 omits a direct provider-task dependency

* Related IDs: P02-T01, P02-T02, P03-T01
* Evidence: .copilot-tracking/plans/2026-11-19/llm-midi-jingle-plan.md
* Concern: P03-T01 invokes the composer defined in P02-T01 but lists only P02-T02. The dependency is transitive, but not explicit at the task that consumes the provider contract.
* Impact: The task dependency record does not show all direct prerequisites.
* Smallest useful change: Add P02-T01 to P03-T01 Dependencies.
* Action owner: planning parent
* Exact resolving evidence: P03-T01 Dependencies directly name P02-T01.
* Decision route: direct planner correction

<!-- rpi:critique id=PC-008 -->
### PC-008 [Low]: Deployment image selection lacks its strongest source citations

* Related IDs: FR-005, P03-T02, P04-T01
* Evidence: .copilot-tracking/plans/2026-11-19/llm-midi-jingle-plan.md; azure.yaml; .github/workflows/prepare-deployment.yml
* Concern: The plan says Azure deploys `Dockerfile.web`, but its source list does not cite `azure.yaml` or the preparation workflow that select and build that image.
* Impact: An implementer cannot follow the plan's strongest evidence for the deployed image boundary.
* Smallest useful change: Add both deployment selectors to the P04-T01 References and Sources.
* Action owner: planning parent
* Exact resolving evidence: The plan links `azure.yaml` and `.github/workflows/prepare-deployment.yml` in the deployment source list.
* Decision route: direct planner correction

<!-- rpi:critique id=PC-009 -->
### PC-009 [Medium]: The feature-gate change could be misread as removing deployment safeguards

* Related IDs: Confirmed User Direction, D3, P04-T01
* Evidence: docs/azure-deployment.md; .github/workflows/deploy-web.yml; .copilot-tracking/plans/2026-11-19/llm-midi-jingle-plan.md
* Concern: The plan rejects feature-level deployment approval but does not state that the current `maintenance_approved` run gate and cost/billing approvals remain. An implementer could conflate those operator safeguards with the prohibited per-feature approval.
* Impact: Reconciling the docs could unintentionally remove existing deployment safety controls or imply an unattended deployment.
* Smallest useful change: Name the target shared-AI default and explicitly preserve maintenance and billing approval gates while keeping deployment preview optional.
* Action owner: planning parent
* Exact resolving evidence: P04-T01 names the shared-AI default, optional preview, retained maintenance/billing approvals, and no new per-feature gate.
* Decision route: direct planner correction

<!-- rpi:critique id=PC-010 -->
### PC-010 [Medium]: Durable score and reservation changes lack a migration and rollback contract

* Related IDs: NFR-003, NFR-004, P03-T01
* Evidence: apps/api/src/persistence.ts; apps/api/src/melody_service.ts; .copilot-tracking/plans/2026-11-19/llm-midi-jingle-plan.md
* Concern: The task adds persisted score/version/provenance and uncertain-outcome state, and compose adds a new paid action to a closed budget-action map, but the plan does not say how existing SQLite/PostgreSQL data is evolved or how a failed rollout is rolled back without corrupting committed jobs or reservations.
* Impact: A deployment can break existing job recovery or leave incompatible/duplicated budget records after rollback.
* Smallest useful change: Require an additive, backward-compatible migration and a tested rollback/recovery procedure that preserves existing records and idempotent reservation identity.
* Action owner: planning parent
* Exact resolving evidence: P03-T01/P02-T02 specify migration versioning, forward compatibility, rollback behavior, and tests against an existing database with committed and pending jobs.
* Decision route: direct planner correction

<!-- rpi:critique id=PC-011 -->
### PC-011 [Medium]: SoundFont notices and runtime path are not verified at a named image location

* Related IDs: FR-005, P03-T02, P04-T01
* Evidence: Dockerfile; Dockerfile.web; apps/api/src/backing.ts; .copilot-tracking/research/2026-11-19/llm-midi-jingle-research.md
* Concern: P03-T02 requires notices to be present in the image but does not identify their package source/location or verify that the packaged `EARWYRM_SOUNDFONT` path resolves for the non-root runtime user.
* Impact: Azure rendering may fail despite the package being installed, or the image may omit required notices.
* Smallest useful change: Name the package-provided SoundFont path and notice file(s) from the cited research and assert both path readability and notice presence in the built-image smoke test.
* Action owner: planning parent
* Exact resolving evidence: P03-T02 identifies the configured runtime path, package notice locations, and non-root image checks.
* Decision route: direct planner correction

<!-- rpi:critique id=PC-012 -->
### PC-012 [Medium]: The plan does not make the screening boundary testable for generated scores

* Related IDs: FR-002, P01-T01, P02-T01
* Evidence: apps/api/src/jingle_tools.ts; apps/api/src/melody.ts; .copilot-tracking/plans/2026-11-19/llm-midi-jingle-plan.md
* Concern: The plan says to preserve current screening and validates the provider's JSON schema, but it does not state the screening boundary for the brief/accepted lyrics sent to the provider or the explicit allowlist/range checks applied to every generated score field before rendering.
* Impact: New model output or passed-through user content could bypass an existing safety boundary or reach the renderer without the intended application checks.
* Smallest useful change: Specify the existing input-screening step and the generated-score allowlist/range-validation step, with focused tests proving both run before provider invocation or rendering as applicable.
* Action owner: planning parent
* Exact resolving evidence: P01-T01/P02-T01 specify the screening order and field-level validation, and tests assert rejected content cannot invoke the provider or renderer.
* Decision route: direct planner correction

* Risk candidate not adopted: A shared model change could regress chat/lyrics. P02-T01 explicitly states that model verification is not authorization to change production configuration; the selected approach uses the existing shared configuration and treats unsupported capability as a no-go. No separate finding is warranted unless that constraint changes.
* Risk candidate not adopted: A separate image rollback requirement was low impact and unsupported by evidence of an image-specific rollback gap; the plan already requires a built-image smoke test and deployment contract check.
* Executability candidates merged: reservation/committed-job order and budget/token checks into PC-006; model verification ownership into PC-006; listening-source ownership into PC-001; SoundFont path into PC-011; timeout behavior into PC-002; and deployment settings/gates into PC-005/PC-009.
* Executability candidates not adopted: Local/MCP mode is explicitly kept on deterministic composition in P02-T02; naming a separate documentation-check command is low-impact and no command evidence was supplied.

## Strengths and Residual Risk

* The four-phase sequence covers DSL compilation, provider integration, durable rendering, and operational validation; every FR/NFR is assigned to at least one task.
* The plan preserves deterministic guided previews, injected-provider automated tests, shared Foundry configuration, and the separation between feature enablement and per-action paid consent.
* Pattern-based output, strict schema validation, tempo-aware compilation, and artifact digests keep model output bounded and rendering deterministic.
* Residual operational risks remain around the actual configured model/version, provider idempotency/status support, nonsecret budget values, and subjective music quality. The plan must make each an explicit pre-live gate rather than assume it is available.

## Questions or Blocking Evidence Gaps

* Before live inference, verify the existing model/version supports the requested structured-output contract without changing shared production configuration; unsupported capability is a no-go.
* Before paid compose is enabled, verify current action caps, per-call cost calculation, and reservation storage behavior; reuse approved shared limits and do not invent new USD bounds.
* The supplied evidence does not establish a provider idempotency/status API or exact SoundFont notice paths; require those checks at implementation and keep uncertain jobs blocked from paid resubmission.
* Identify the three listening samples only after the feature exists; sample generation requires separate user consent and available budget, and no such calls are part of this critique.

## Limitations

* Standard critique used only the supplied plan, research, and cited repository evidence; no live model/deployment calls or paid inference were performed.
* Candidate details that required unprovided provider/deployment evidence were routed as verification gates, not asserted as facts.

## Recommended Next Action

* Highest-impact findings: PC-001, PC-002, and PC-006 are High; their common action owner is the planning parent.
* Smallest next action: revise the plan to define the consented listening source, timeout reconciliation, and idempotent budget reservation/call-cost contract, then disposition all remaining findings.
* User response required: no
