<!-- markdownlint-disable-file -->
# Review: Existing web app with Azure Files

## Executive Summary

* Assessment: Local deployment and storage changes have three high-severity gaps; cloud acceptance was not assessed.
* Why this matters: Updates can overlap writers, a lost melody database can be silently recreated, and the documented login can produce an incorrect registry role assignment.
* Review execution: Complete for the local comparison.
* Assessed outcome: Defects found, proposed pending user decisions.
* Validation coverage: Reviewed the recorded local suite, image, Bicep and backup checks; no validation was executed during review.
* Confidence and limitations: The code and configuration demonstrate the gaps. Azure-specific effects and all actual cloud acceptance remain unverified.

The assessment is a proposal until Parent Decision Record records final decisions.

## What You May Not Know

Live Azure deployment, SMB locking, backup and External ID sign-in have not been tested. The startup database guard does not continuously protect the databases.

## Findings and Proposed Routes

<!-- rpi:review id=RV-001 -->
### RV-001 [High]: The documented deployment does not enforce writer shutdown

The app's advisory lock has not been validated on Azure Files, and the update procedure relies entirely on an operator remembering to stop and check every writer. The deployment path itself does not enforce that procedure.

* Related scope: P04-T01, P05-T01, NFR-005.
* Expected behavior: Demonstrate reliable exclusion across revisions or document and enforce stop-old-before-start-new maintenance.
* Observed behavior and evidence: azure.yaml exposes the ordinary `azd up` path; infra/service.bicep sets single revision and one replica but has no stop or verification gate. audio_poc/cloud_web.py relies on `flock`, whose Azure SMB semantics are unverified. docs/azure-deployment.md directs operators to stop and verify writers manually; no enforcement is provided.
* Impact: An update that bypasses the manual procedure can overlap revisions or replacement replicas and risk SQLite corruption or data loss. The actual overlap and lock behavior are not established in Azure.
* Resolution condition: A deployment/update path enforces and verifies writer exclusion or an enforced stop-before-start gate; demonstrate the applicable behavior locally and, separately authorized, on Azure.
* Proposed destination: rpi-implement.
* Smallest useful next action: Add an enforceable update safety gate without assuming Azure SMB locks work.

<!-- rpi:review id=RV-002 -->
### RV-002 [High]: A lost melody database is recreated while the app runs

The missing-database guard runs only at startup. A subsequent render initializes melody storage again, so a missing history database can be replaced with an empty one rather than blocking delivery.

* Related scope: P05-T01, FR-008, NFR-008.
* Expected behavior: Preserve melody-history screening and fail explicitly rather than silently recreate missing data.
* Observed behavior and evidence: audio_poc/cloud_web.py `prepare_databases` checks the marker only before starting Uvicorn. audio_poc/web_app.py passes the melody directory to `render_brief` for every render; audio_poc/__main__.py constructs `MelodyService`; audio_poc/melody_service.py creates the database with `O_CREAT` and initializes tables. Existing tests/test_web_app.py covers a database missing before startup, not its loss after startup.
* Impact: If melody/melody.sqlite3 disappears after startup, a render can screen against an empty history and overwrite the apparent history baseline, rather than reporting data loss.
* Resolution condition: After initialization, a missing required database blocks affected runtime operations without recreating it; exercise this for both databases where applicable while preserving valid fresh-store initialization.
* Proposed destination: rpi-implement.
* Smallest useful next action: Guard runtime database opens and add focused regression coverage.

<!-- rpi:review id=RV-003 -->
### RV-003 [High]: Registry push assignment hard-codes a service-principal type

The documented interactive sign-in can use a user identity, but the registry assignment declares every deployment principal to be a service principal.

* Related scope: P04-T01, FR-006.
* Expected behavior: The documented azd setup supports the actual deployment principal and deploys the working image.
* Observed behavior and evidence: docs/azure-deployment.md uses interactive `azd auth login`; infra/main.parameters.json passes `AZURE_PRINCIPAL_ID` through infra/main.bicep to infra/platform.bicep `pushRole`, which hard-codes `principalType: 'ServicePrincipal'`. Microsoft documents `principalType` as distinguishing users from service principals: https://learn.microsoft.com/azure/azure-resource-manager/bicep/scenarios-rbac.
* Impact: An interactive user is misclassified in the registry role assignment, potentially preventing provisioning or correct registry authorization. A live Azure failure has not been demonstrated.
* Resolution condition: Registry-role configuration supports both interactive users and service principals with the correct principal type, or the supported login contract is explicitly and correctly restricted; verify the generated configuration for both supported cases and perform live authorization testing only with approval.
* Proposed destination: rpi-implement.
* Smallest useful next action: Correct the role assignment's principal-type handling and cover supported login types.

## Parent Decision Record

### Current Disposition

* Based on events: RD-001 through RD-012.
* Review execution: Complete for the local comparison.
* Final outcome: Defects found; three high-severity findings remain unresolved.
* Finding decisions and next actions: RV-001 and RV-002 accepted for rpi-implement; RV-003 accepted with the route refined to GitHub OIDC-only deployment guidance and verification.
* Decisions still needed: none. Walkthrough complete; all findings await implementation.

### Decision History

| Event | Subject | Decision source | Status or value | Proposed destination | Final destination | Owner | More information needed | Smallest next action | Rationale |
|---|---|---|---|---|---|---|---|---|---|
| RD-001 | participation | system | user-owned | none | none | user | none | Assess supplied evidence | Standalone review defaults to user-owned decisions. |
| RD-002 | execution | agent | Complete for local comparison | none | none | review parent | Live Azure acceptance remains untested | Walk through findings | Supplied local evidence and source were compared; cloud operation is outside the authorized review boundary. |
| RD-003 | walkthrough | agent | pending RV-001 | rpi-implement | pending | user | Cloud SMB locking remains unverified | Ask for the RV-001 route decision | User-owned participation requires one finding at a time. |
| RD-004 | RV-001 | user | accepted | rpi-implement | rpi-implement | implementer | Actual Azure exclusion remains unverified | Enforce safe updates before cloud acceptance | User selected the suggested action; defect remains until implemented. |
| RD-005 | walkthrough | agent | pending RV-002 | rpi-implement | pending | user | none | Ask for the RV-002 route decision | RV-001 decision recorded. |
| RD-006 | RV-002 | user | accepted | rpi-implement | rpi-implement | implementer | none | Prevent silent database recreation and add regression coverage | User selected the suggested action; defect remains until implemented. |
| RD-007 | walkthrough | agent | pending RV-003 | rpi-implement | pending | user | Azure role-assignment behavior has not been tested live | Ask for the RV-003 route decision | RV-002 decision recorded. |
| RD-008 | RV-003 | user | clarification needed | rpi-implement | pending | user | Whether interactive azd deployments remain supported | Clarify the intended deployment authentication contract | User stated they will use GitHub OIDC federation; that does not by itself resolve the contradictory interactive-login instructions. |
| RD-009 | RV-003 | user | changed | rpi-implement | rpi-implement | implementer | Actual GitHub OIDC authorization remains untested | Align deployment guidance and verification with GitHub OIDC only; do not imply interactive user login is supported | User selected GitHub OIDC only; the deployment identity is separate from the existing External ID registrations. |
| RD-010 | walkthrough | agent | complete; RV-001, RV-002 and RV-003 decided | none | none | review parent | none | Finalize review | All user-owned finding decisions were recorded. |
| RD-011 | outcome | agent | Defects found | none | none | review parent | Live Azure acceptance remains unavailable | Return findings and accepted routes | Three local implementation gaps remain open; cloud behavior is not inferred. |
| RD-012 | continuation | agent | standalone handoff | rpi-implement | rpi-implement | user | Separate authorization still needed for Azure and tenant operations | Invoke `/rpi-implement` to address accepted findings | All three accepted routes belong to the existing implementation direction. |

## Validation Evidence

| Check | Scope | Status | Summary |
|---|---|---|---|
| Targeted web/auth tests and full pytest | P04-P05 | Passed, recorded | Changes record reports 206 passed and one existing warning; runtime database-loss case was not covered. |
| Ruff | P04-P05 | Passed, recorded | Changes record reports `uv run --no-sync ruff check .`. |
| Bicep compilation and resource assertions | P04 | Passed, recorded | Compilation and static configuration checks do not prove role correctness for an interactive user. |
| Image, local HTTP, synthetic render and restart | P04-P05 | Passed, recorded | Local container and signed-token smoke; Azure identity and SMB are not proven. |
| Local backup and restore | P05 | Passed, recorded | Both integrity checks and referenced-audio check reported passed. |
| Live Azure mount, CIAM, exclusivity and recovery | P04-P05 | Unavailable | Separate user authorization required; not run during review. |

## Risks, Blockers, and Residual Work

* Blockers: None for the local comparison; cloud acceptance requires separate authorization and live evidence.
* Remaining active work: No unchecked markers in the plan; RV-001 through RV-003 identify local gaps despite those completion markers.
* Residual work: Authorized cloud acceptance remains a distinct operator-owned activity, including actual mount, update, user isolation, restart and restore checks.

## Review Record

### Scope and Evidence

* Task ID: azure-files-working-app.
* Review date: 2026-11-14.
* Review scope: full local implementation of P04 and P05; cloud behavior is not claimed.
* Assessed boundary: FR-006 through FR-010, NFR-005 through NFR-008, checked task markers, implementation changes, critique dispositions, operator guidance and recorded validation.
* Review depth and provenance: standard; default.
* Candidate identity: current uncommitted workspace and the named artifacts.
* Review execution: Complete for the local comparison.
* Helper use: none; direct comparison.
* Plan: .copilot-tracking/plans/2026-11-14/azure-files-working-app-plan.md.
* Plan critique: .copilot-tracking/reviews/plans/2026-11-14/azure-files-working-app-plan-critique.md.
* Changes: .copilot-tracking/changes/2026-11-14/azure-files-working-app-changes.md.
* Other evidence: azure.yaml, Dockerfile.web, .dockerignore, infra/main.bicep, infra/main.parameters.json, infra/platform.bicep, infra/service.bicep, audio_poc/cloud_web.py, audio_poc/web_app.py, audio_poc/web_storage.py, audio_poc/melody_service.py, audio_poc/__main__.py, tests/test_web_app.py, docs/azure-deployment.md, docs/audio-poc/web-app.md; Microsoft Learn Azure Files mounts, Bicep RBAC and azd deployment documentation.

### Opening Review State

* Interpreted review goal: compare the local implementation to the approved plan, evidence, and safety boundaries.
* Review scope: full local implementation.
* Evidence readiness: plan, critique, changes and local source are available; live cloud evidence is not.
* Acceptance basis: current task requirements, confirmed user direction and critique dispositions.
* First comparison boundary: implementation and documented operations; do not infer cloud validation from local checks.
* Active read-only boundaries: write only this review record; do not provision resources or mutate source.
* Authority: the review parent compares evidence and writes findings; final decisions and routes belong in Parent Decision Record.
* Initial blockers: none for the local comparison.

### Acceptance and Change Coverage

| Requirement or scope | Implementation and validation evidence | Assessment | Finding or rationale |
|---|---|---|---|
| P04-T01, FR-006, NFR-006 | Dockerfile.web, azure.yaml, infra/service.bicep and docs/audio-poc/web-app.md | Gap | Actual UI/API, six settings and app-owned scopes are configured; interactive deployer role type is wrong, RV-003. Live sign-in is unassessed. |
| P04-T01, FR-007, NFR-007 | infra/platform.bicep, infra/service.bicep; Microsoft Learn storage-mounts; changes validation | Locally consistent | Classic SMB, environment identity, documented storage role and mount are configured without a key. Availability and mount authorization remain unassessed in Azure. |
| P04-T01, P05-T01, NFR-005 | infra/service.bicep, audio_poc/cloud_web.py, docs/azure-deployment.md | Gap | One worker and per-revision replica limits exist, but mandatory operational exclusion is not enforced; RV-001. |
| P05-T01, FR-008, NFR-008 | audio_poc/cloud_web.py, audio_poc/web_storage.py, audio_poc/melody_service.py, audio_poc/__main__.py, tests/test_web_app.py | Gap | Startup checks rollback mode and missing databases; runtime recreation bypasses melody history, RV-002. Network filesystem reliability remains unassessed. |
| P05-T01, FR-009 | docs/azure-deployment.md, docs/audio-poc/web-app.md | Locally consistent with limitations | CIAM settings, risks, backup, restore, inventory and teardown are documented; actual recovery and update behavior need cloud acceptance. |
| P05-T01, FR-010 | Changes Validation Record; docs/azure-deployment.md Cloud acceptance | Local evidence recorded; cloud not assessed | Local tests, image render, restart and backup are reported; authorized live CIAM, isolation, mount operations and recovery remain pending. |
| Plan update and confirmed direction | Plan P04-T01/P05-T01 Guidance, changes Implementation-Time Plan Updates | Consistent | Relocates real mount tests to conditional cloud acceptance without changing the user-selected architecture or claiming successful cloud tests. |
| Paid-render and access-control preservation | audio_poc/web_app.py, audio_poc/web_storage.py; changes Validation Record | Locally consistent with limitations | Existing application authorization and paid controls remain, paid Speech disabled; local regression reported, two-user cloud checks unavailable. |

### Critique and Follow-Up Assessment

* Latest critique dispositions: PC-001 is addressed by docs/azure-deployment.md; PC-002 is addressed by the local render evidence and specified live acceptance; PC-003 is addressed by documented inventory, preview, independent backup and approval boundaries.
* Material revisions: The mount validation move matches the plan details and changes record. No subsequent critique is recorded or required for this implementation-only scheduling clarification.
* Dependent-work pause assessment: Local implementation proceeded without cloud operations; live tests remain authorization-gated.
* Justification assessment: The scheduling clarification is supported by the need for separately authorized cloud resources.

| Follow-up item | Why outside immediate scope | Owner or next action | Assessment and route |
|---|---|---|---|
| None listed | Not applicable | Not applicable | Plan and changes record agree. Cloud acceptance is a documented gated requirement, not a listed follow-up. |

### Reviewer Self-Check

* [x] Every material local requirement, marker, update, critique disposition, validation result, blocker and follow-up is assessed or explicitly limited.
* [x] Findings use stable IDs, severity, evidence, expected behavior, resolution conditions and proposed routes.
* [x] Execution, assessed outcome, validation coverage and limitations are distinct.
* [x] The summary distinguishes demonstrated implementation gaps from unassessed cloud behavior.
* [x] Standard review stayed within the supplied boundary and omitted cosmetic feedback.
* [x] Review wrote only this record and did not execute validation or mutate other task artifacts.
* Checked boundary: P04-P05, FR-006 through FR-010, NFR-005 through NFR-008, implementation update, critique and validation.
* Missing or limited evidence: Actual cloud mounting, CIAM authentication, update exclusivity, data persistence and recovery.
