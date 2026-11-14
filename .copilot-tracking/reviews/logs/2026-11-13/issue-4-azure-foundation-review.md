<!-- markdownlint-disable-file -->
# Review: Azure foundation

## Executive Summary

* Assessment: local P01-P03 scaffolding meets the reviewed implementation boundary. Issue 4 cannot yet be accepted because its clean-cloud deployment criterion has no execution evidence.
* Review execution: Complete.
* Assessed outcome: Not accepted for full issue acceptance; no demonstrated local implementation defect.
* Material finding: one Medium evidence gap, RV-001, requires authorized cloud verification.
* Validation coverage: 201 tests, scoped Ruff, locked non-root image and bootstrap smoke, warning-free Bicep, official azd schema, XML and documentation checks.
* Confidence: local behavior and configuration are supported; ARM compilation and protocol tests cannot establish Azure service acceptance, tenant authorization, subscription quota or actual APIM passthrough.

The assessment is a proposal; Parent Decision Record owns the final disposition.

## What You May Not Know

The deployed services explicitly cannot generate audio or submit render work. Foundation health and MCP negotiation do not establish later workflow integration or cloud acceptance.

## Findings and Proposed Routes

<!-- rpi:review id=RV-001 -->
### RV-001 [Medium]: Clean Azure deployment and gateway acceptance remain unverified

The issue requires a clean environment to deploy with `azd up` after prerequisite setup. This task has not created cloud resources, so neither that deployment nor the authenticated APIM-to-backend boundary has been exercised. This is missing evidence, not proof that the template fails.

* Related scope: FR-003, FR-004, NFR-004, P02-T01/P03-T01 and the issue's clean-deployment acceptance criterion.
* Expected behavior: an authorized clean environment provisions and deploys all four scaffolds, outputs usable endpoints, and passes the documented positive/negative authentication smoke checks.
* Observed evidence: changes record Validation Record contains local tests, builds and configuration checks but explicitly no live deployment; docs/azure-deployment.md Authenticated cloud acceptance identifies the checks still needed.
* Impact: issue closure or a claim of reproducible cloud deployment would exceed the available evidence.
* Resolution condition: approved non-secret prerequisite configuration, successful clean `azd up`, application-image verification and authenticated endpoint/denial checks, with sanitized results recorded. Any observed deployment defect must be corrected and affected checks rerun.
* Proposed destination: `rpi-research` for a distinct required cloud-validation follow-up after the operator consent/prerequisite gate; route any demonstrated defect to implementation.
* Smallest useful next action: request explicit billable provisioning consent and the configured target environment; do not deploy, register applications or change subscriptions implicitly.

## Parent Decision Record

### Current Disposition

* Based on events: RD-001 through RD-007.
* Review execution: Complete.
* Final outcome: Not accepted for full issue acceptance while RV-001 remains unresolved.
* Finding decisions: RV-001 accepted as required in-scope evidence gathering; operator owns prerequisite configuration and billing consent, RPI parent owns approved validation.
* Walkthrough: skipped-auto, RV-001 decided without routine approval questions.
* Decisions still needed: none for this pause. User will use their own environment; required cloud acceptance evidence remains unresolved.

### Decision History

| Event | Subject | Decision source | Status or value | Proposed destination | Final destination | Owner | More information needed | Smallest next action | Rationale |
|---|---|---|---|---|---|---|---|---|---|
| RD-001 | participation | user automatic-mode selection | agent-owned | none | review | RPI parent | none | Compare P01-P03 once | End-to-end user selection retains exceptional consent requirements |
| RD-002 | walkthrough | agent | skipped-auto; RV-001 decided | none | none | RPI parent | none | Record evidence-based route | Automatic Review participation |
| RD-003 | RV-001 | agent | accepted; required and unresolved | rpi-research | rpi-research after consent | operator and RPI parent | Clean deployment and authenticated smoke | Request consent and configured target | Missing evidence prevents issue acceptance; no demonstrated deployment defect |
| RD-004 | execution | agent | Complete | none | none | RPI parent | none for this comparison | Preserve single review record | All material local contracts and claimed validation assessed once |
| RD-005 | outcome | agent | Not accepted | none | none | RPI parent | RV-001 | Keep issue open | Local completion is not verified cloud acceptance |
| RD-006 | continuation | agent | required cloud-validation follow-up selected, not started | follow-up | await exceptional consent | operator and RPI parent | Billing permission, subscription/regions, Entra setup, model quota | Request focused operator decision | No optional cleanup or unrelated integration selected |
| RD-007 | continuation | user | paused before Azure provisioning; user will use own environment | await exceptional consent | operator-managed cloud validation | user | RV-001 deployment/smoke evidence | Follow deployment guide in user's environment; no agent provisioning | User selected pause and stated they will use their own environment; automatic session stops without claiming acceptance |

## Validation Evidence

| Command or evidence | Scope | Status | Summary |
|---|---|---|---|
| `uv run --locked pytest -q` | Full Python regression suite | Passed | 201 tests; one existing Starlette/httpx deprecation warning |
| Targeted pytest | New contract/runtime suites | Passed | 20 parameterized cases; real MCP HTTP negotiation and explicit tool/worker failure |
| Scoped Ruff check and format check | Four new Python files | Passed | Final checks pass after formatting one declaration |
| `az bicep build --file infra/main.bicep` | Embedded full deployment template | Passed | Final compilation has no schema/type diagnostics |
| `docker build` and image HTTP smoke | Locked Python 3.12 container | Passed | UID 10001, health, schema catalog and real HTTP MCP handshake; worker exits 2 without acknowledgement |
| Bootstrap image smoke | nginx-unprivileged 1.28-alpine | Passed | UID 101; real HTTP 200 on 8080 without command overrides; owned helper stopped |
| Official JSON Schema and XML parsing | azure.yaml and mcp-policy.xml | Passed | Schema validates; final policy parses and response buffering is disabled |
| Local documentation links and `git diff --check` | Related docs/tracked edits | Passed | 22 relative links resolve; no whitespace errors |
| Task-local `azd version` | Tool readiness only | Passed | 1.37.3 standalone; no global installation or cloud operation |
| Clean `azd up`, authenticated gateway/backend smoke | Azure resources and tenant | Unavailable | No billable provisioning consent or selected prerequisite-configured target; RV-001 |

Review assessed supplied validation rather than rerunning it. PyYAML was isolated for schema validation after a missing-module failure; no dependency manifest or lock was changed. The initially unavailable schema shortlink and gh release metadata were not treated as passing checks.

## Risks, Blockers, and Residual Work

* Cloud acceptance requires explicit billable deployment consent, selected subscription/regions, application registrations and quota.
* Remaining local plan markers: none.
* Required remaining work: RV-001 only. Preview native-MCP management, model lifecycle/region/quota, RBAC propagation and runtime cloud authorization remain live-validation risks.
* Unselected scope: later generator/workflow/worker integration, trace exporting and professional/legal approval are explicitly not issue-4 completion claims.
* No optional cleanup or unrelated issue work was selected.

## Review Record

### Scope and Evidence

* Task ID: issue-4-azure-foundation.
* Review date: 2026-11-13.
* Scope: full local P01-P03 plan and explicitly unverified cloud acceptance.
* Depth and provenance: standard, default.
* Review execution: Complete.
* Helpers: none; material evidence remains one connected, manageable review boundary.
* Plan: .copilot-tracking/plans/2026-11-13/issue-4-azure-foundation-plan.md.
* Critique: .copilot-tracking/reviews/plans/2026-11-13/issue-4-azure-foundation-plan-critique.md.
* Changes: .copilot-tracking/changes/2026-11-13/issue-4-azure-foundation-changes.md.
* Research: .copilot-tracking/research/2026-11-13/issue-4-azure-foundation-research.md.
* Source boundary: issue-4 new source/configuration/docs/tests and directly related docstring/ignore updates; pre-existing lyric implementation excluded.

### Opening Review State

* Goal: determine local implementation conformance without treating static checks as cloud acceptance.
* Readiness: plan markers and changes evidence reconciled, standard critique corrected.
* Acceptance basis: issue 4, FR-001 through FR-005, NFR-001 through NFR-004, P01-T01 through P03-T01, PC-001 disposition and confirmed audio attestation.
* Comparison: canonical contracts, scaffold behavior, deployment/auth/RBAC/configuration, operator guidance and supplied validation.
* Read-only boundaries: review writes only this record; parent state reflects its routing.
* Authority: RPI parent owns findings, outcomes, route dispositions and continuation.
* Initial blocker: actual cloud deployment remains unverified and unauthorized.

### Acceptance and Change Coverage

| Requirement or scope | Implementation and validation evidence | Assessment | Rationale or finding |
|---|---|---|---|
| FR-001; P01-T01; identity, status, errors, timing, provenance and approval acceptance | audio_poc/contracts.py catalog, existing lyrics/melody/melody_service models; tests/test_contracts.py | Met locally | Existing creative models remain canonical; new invariants reject contradictory status/quality and cross-version references |
| FR-002; supported MCP acceptance | audio_poc/platform_service.py; tests/test_platform_service.py; real image handshake | Met locally | Stateless Streamable HTTP negotiates at least 2025-06-18; work fails explicitly without enqueueing/acknowledging |
| FR-003; P02-T01; clean azd up acceptance | azure.yaml; infra/main.bicep, platform.bicep, service.bicep, mcp.bicep; Bicep/schema checks | Configuration assessed; cloud not assessed | All required resource types represented; RV-001 retains actual provisioning acceptance |
| FR-004; identity and endpoint acceptance | main.bicep outputs; platform role assignments; service auth; mcp-policy.xml | Met structurally; live authorization unassessed | No committed credentials in added configuration; scoped identities, no shared storage/AI keys; APIM backend principal allowlist is configured, not cloud-proven |
| FR-005; P03-T01; documented prerequisites/setup/smoke/teardown acceptance | docs/azure-deployment.md; docs/service-contracts.md; docs/project-plan.md links | Met | Runtime, regions, model access/lifecycle, APIM tier/costs, permissions, two registrations, local and authenticated cloud checks, image-reset caveat and purge-protected teardown are explicit |
| NFR-001 | 201-test regression result; existing runtime callers unchanged | Met locally | Only existing model docstrings changed; no local service behavior migration |
| NFR-002 | Strict Docker context; safe errors; HTTPS/auth policies; contracts reject SAS references | Met structurally | Cloud enforcement still subject to RV-001; no authentication is falsely claimed for local loopback services |
| NFR-003 | Dockerfile, .dockerignore, successful locked build; final warning-free ARM compilation | Met locally | Private local artifacts excluded; Python runtime and bootstrap probes verified |
| NFR-004 | Changes record and operator cloud-acceptance section | Met as honest evidence boundary; issue still unaccepted | Live acceptance explicitly remains unverified, RV-001 |
| PC-001 bootstrap correction | service.bicep TCP probes; bootstrap image smoke; no command override | Resolved | Actual image listens on port 8080 and starts independently of the Python entrypoint |
| Material implementation annotations | Correct backend object-ID allowlist; documentation pointers; versioned schema URL | Consistent | Evidence-backed clarifications preserve the approved architecture and scope |
| Confirmed user direction | Audio attestation, end-to-end progression, preserved prior lyric work, no unapproved cloud/Git/tracker operations | Met | No independent measurements/rights claim; no cloud writes, commit or push |
| Business-source comparison | Issue 4; docs/design-proposal.md sections 5/6/8; docs/project-plan.md | Consistent within foundation scope | Later MVP integration intentionally remains later work. No BRD/PRD/ADR is cited; no Business Alignment divergence entry is needed |

### Critique and Follow-Up Assessment

* The single standard critique's original verdict was Revise; the plan records PC-001's correction rather than manufacturing a repeat critique. Source and bootstrap validation satisfy its resolving evidence.
* Completed markers have matching changes evidence; P03 explicitly requires retaining unverified-cloud status rather than inventing deployment success.
* No significant architecture deviation, early resumption after an unresolved user decision, or hidden production queue migration was found.
* No plan follow-up was converted into a defect. RV-001 is required issue acceptance, not optional residual work.

### Reviewer Self-Check

* [x] All supplied requirements, markers, critique dispositions, annotations, validation, blockers and remaining work have coverage or an explicit limit.
* [x] The sole finding is an evidence-grounded acceptance gap with severity, expected/observed behavior, resolution condition and route; it is not misrepresented as a demonstrated defect.
* [x] Review execution and acceptance outcome remain separate; no conformant claim is made with required evidence missing.
* [x] Standard review assessed the material boundary once without broadening to unrelated implementation or speculative cleanup.
* [x] Review changed only its canonical record and parent-owned state, did not execute validation or edit source/plan/research/changes, and used no helpers.
* Checked boundary: P01-P03, FR-001 through FR-005, NFR-001 through NFR-004, PC-001 and all six issue acceptance criteria.
* Missing evidence: clean subscription deployment, actual APIM policy acceptance and authenticated positive/negative cloud smoke results, RV-001.
