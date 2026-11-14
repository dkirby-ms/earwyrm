<!-- markdownlint-disable-file -->
# RPI Plan Critique: Existing web app with Azure Files

## Metadata

* Task ID: azure-files-working-app
* Critique date: 2026-11-14
* Plan: .copilot-tracking/plans/2026-11-14/azure-files-working-app-plan.md
* Critique execution: Complete
* Critique depth: standard
* Depth provenance: default
* Critique type: initial
* Earlier critique: not applicable

## Inputs and Criterion Boundary

* The supplied user direction, plan, existing Dockerfile, Azure configuration, web authentication and storage code, and Azure Files and SQLite documentation.
* Assess P04-P05, FR-006 through FR-010 and NFR-005 through NFR-008. Cloud semantics and a live deployment are not independently validated.

## Lens Assessments

| Lens | Scope | Reasoning effort and source | Status | Candidates |
|---|---|---|---|---|
| Coverage | Requirements and tasks | direct | Complete | 1 adopted; 0 rejected |
| Evidence | Technical claims and sources | direct | Complete | 0 adopted; 0 rejected |
| Executability | Dependencies, sequence and verification | direct | Complete | 1 adopted; 0 rejected |
| Risk | Shared resources and failure handling | direct | Complete | 1 adopted; 0 rejected |

## Coverage Assessment

| Requirement or task | Coverage | Evidence or concern |
|---|---|---|
| FR-006 through FR-010; P04-T01, P05-T01 | Partial | Core architecture is covered; PC-001 through PC-003 identify documentation, workflow validation and preservation gaps. |
| NFR-005 through NFR-008 | Covered with residual risk | Single-writer, security and SQLite risks are acknowledged; practical SMB properties remain a live verification requirement. |

## Verdict

* Verdict: Revise.
* Rationale: Three high-severity gaps affect operator safety and evidence that the actual app works.

## Findings

<!-- rpi:critique id=PC-001 -->
### PC-001 [High]: The documentation requirement has no explicit deliverable

* Related IDs: FR-009, P05-T01
* Evidence: The plan requires operator documentation, but P05-T01 does not identify docs/azure-deployment.md, which currently documents the obsolete scaffold and workforce identity assumptions.
* Concern: The deployment path can change while the existing primary guide continues to instruct the operator to provision a different stack and use the wrong identity configuration.
* Impact: Operators can deploy or configure the wrong application.
* Smallest useful change: Identify the existing deployment guide as a canonical update target and require replacement of obsolete instructions with exact `azd` inputs and approved CIAM callback guidance.
* Action owner: planning parent.
* Exact resolving evidence: P05-T01 explicitly requires updating docs/azure-deployment.md and identifies the six configuration keys and deployed callback.
* Decision route: direct planner correction.

<!-- rpi:critique id=PC-003 -->
### PC-003 [High]: Existing cloud resources lack an explicit preservation gate

* Related IDs: FR-007, FR-009, NFR-005, P04-T01, P05-T01
* Evidence: infra/main.bicep already defines a multi-service foundation, while docs/azure-deployment.md includes `azd down`; the plan changes the deployment model and instructs the operator to document teardown.
* Concern: The plan does not distinguish an isolated new environment from an existing environment with data and billable resources or require a review of destructive updates.
* Impact: An operator could disrupt or delete unrelated resources or the persistent share during migration or cleanup.
* Smallest useful change: Require a cloud inventory and deployment preview, explicitly preserve existing resources/data, and make destructive migration and teardown separately approved; backups must be stored outside the share being protected.
* Action owner: planning parent.
* Exact resolving evidence: P04-T01 and P05-T01 include these gates and preserve durable data during routine deployments.
* Decision route: direct planner correction.

<!-- rpi:critique id=PC-002 -->
### PC-002 [High]: Cloud acceptance does not exercise the working render workflow

* Related IDs: FR-006, FR-008, FR-010, P05-T01
* Evidence: docs/audio-poc/web-app.md describes offline instrumental render, comparison, evaluation and protected downloads, but the cloud acceptance checklist only names authentication, restart, backup and mount tests.
* Concern: The image may pass health, configuration and basic storage checks while the actual generation workflow fails in the container.
* Impact: A non-working app could be declared cloud-accepted.
* Smallest useful change: Require an authenticated instrumental render, evaluation, protected audio/evidence download and restart retrieval on the actual deployment, with paid Speech remaining disabled.
* Action owner: planning parent.
* Exact resolving evidence: P05-T01 identifies this end-to-end live acceptance path and local image-level functional smoke.
* Decision route: direct planner correction.

## Strengths and Residual Risk

* User-selected External ID and managed-identity design is preserved, including exact issuer and no key fallback.
* SQLite corruption and managed-identity preview risk are explicitly retained rather than treated as solved.

## Questions or Blocking Evidence Gaps

* None for the three planner-owned corrections; cloud validity is pending separate authorization.

## Limitations

Actual Azure mount behavior is unverified.

## Recommended Next Action

* Highest-impact finding: PC-003.
* Action owner: planning parent.
* Smallest next action: revise plan to preserve existing resources and data; apply PC-001 and PC-002.
* User response required: no.
