<!-- markdownlint-disable-file -->
# RPI Changes: Existing web app with Azure Files

## Metadata

* Task ID: `azure-files-working-app`
* Related plan: [.copilot-tracking/plans/2026-11-14/azure-files-working-app-plan.md](../../plans/2026-11-14/azure-files-working-app-plan.md)
* Implementation date: 2026-11-14

## Execution Status

* Status: Complete for local implementation, including accepted review corrections
* Declared invocation scope: full plan
* Completed scope markers: `P04`, `P04-T01`, `P05`, `P05-T01`
* Remaining active-plan markers: none
* Status basis: Accepted `RV-001` through `RV-003` are implemented and locally validated. Live Azure acceptance requires separate authorization.

## Execution Summary

Configured the existing authenticated web app, Azure Files managed identity, local writer and persistence guards, and an operator handoff. No Azure resources or app registrations were changed.

Accepted review corrections now enforce stopped-writer deployment hooks and GitHub OIDC-only publishing, prevent missing databases from being recreated after initialization, and release a paid-render lock when reservation fails. Existing unrelated in-progress persistence and dependency changes remain intact.

## Completed Work

### Missing runtime databases block delivery instead of resetting history

* Related task: `P05-T01`, accepted `RV-002`.
* Files: [audio_poc/sqlite_files.py](../../../audio_poc/sqlite_files.py), [audio_poc/web_storage.py](../../../audio_poc/web_storage.py), [audio_poc/melody_service.py](../../../audio_poc/melody_service.py), [audio_poc/web_app.py](../../../audio_poc/web_app.py), [tests/test_web_app.py](../../../tests/test_web_app.py), [docs/azure-deployment.md](../../../docs/azure-deployment.md).
* Behavior: Fresh stores can initialize; marked stores open existing database files without creation. Both stores use SQLite `mode=rw` for every subsequent connection. Cached services, newly constructed services and actual web renders fail without recreating a lost database. Storage errors receive explicit logged failure responses. Paid reservation failures release their process lock without calling Speech or masking loss with an empty ledger.
* Validation: 71 targeted cases passed across web, auth, melody and deployment tests. Full pytest: 226 passed with one pre-existing Starlette/httpx deprecation warning. Ruff and browser navigation regression passed. The updated Docker image served actual HTTP health/UI/config as UID `10001`; in-image synthetic authenticated instrumental rendering, evaluation, protected audio/evidence, second-owner denial and retrieval in a new container passed. A stopped source volume was copied to a separate volume; restored API retrieval, referenced-audio hashes and both SQLite integrity checks passed. No paid Speech call or Azure operation ran.

### Enforced stopped-writer deployment and GitHub OIDC-only publishing

* Related task: `P04-T01`, accepted `RV-001` and `RV-003`.
* Files: [azure.yaml](../../../azure.yaml), [scripts/deployment_gate.py](../../../scripts/deployment_gate.py), [.github/workflows/deploy-web.yml](../../../.github/workflows/deploy-web.yml), [tests/test_deployment_gate.py](../../../tests/test_deployment_gate.py), [docs/azure-deployment.md](../../../docs/azure-deployment.md).
* Behavior: Provision/deploy hooks fail closed unless an approved GitHub OIDC account targets the configured isolated app, its running status is stopped and all revisions have zero replicas. Authorized maintenance stops only that app and polls actual replica inventory. A manual, serialized workflow separates preview from approved deployment and quiesces again after provisioning. Interactive deployment is no longer documented or supported; registry `ServicePrincipal` assignment matches the selected OIDC contract.
* Validation: 13 mocked gate cases passed, including CLI failures, old-revision writers, invalid inventory, unrelated apps, wrong identity, absent approvals, stop timeout and a running app with zero current replicas. Ruff and YAML workflow/hook assertions passed. Bicep compilation passed without warnings. No live stop/start, deployment, OIDC or SMB verification ran.

### Working web deployment and protected mount

* Related phase or task: `P04-T01`.
* Files: [azure.yaml](../../../azure.yaml), [Dockerfile.web](../../../Dockerfile.web), [audio_poc/cloud_web.py](../../../audio_poc/cloud_web.py), [infra/](../../../infra/), [tests/test_web_app.py](../../../tests/test_web_app.py).
* Behavior: The azd service builds the existing web app; Bicep configures the six CIAM settings and an environment-managed-identity SMB share without storage keys. Cloud startup requires an actual mount and a single-worker advisory lock; no EasyAuth is configured.
* Validation: Bicep build without warnings, Docker build, health/UI/config smoke, unmounted-directory and concurrent-writer checks passed locally. The actual Azure mount remains unverified.

### Persistent store startup and operator recovery

* Related phase or task: `P05-T01`.
* Files: [audio_poc/cloud_web.py](../../../audio_poc/cloud_web.py), [tests/test_web_app.py](../../../tests/test_web_app.py), [docs/azure-deployment.md](../../../docs/azure-deployment.md), [docs/audio-poc/web-app.md](../../../docs/audio-poc/web-app.md).
* Behavior: The cloud entrypoint checks both databases for rollback-journal mode, initializes a new store and refuses to silently recreate a missing database after initialization. The guide covers the existing CIAM registrations, writer shutdown, independent backups and recovery, costs, and separately authorized cloud acceptance.
* Validation: Full tests, local authenticated synthetic instrumental render, isolated backup and restore, both SQLite integrity checks, referenced-audio check, and local container restart passed. Real SMB permissions, locking, revision overlap, recovery and External ID sign-in remain unverified.

## Implementation-Time Plan Updates

### Resume accepted deployment and runtime-storage corrections

* Affected markers: `P04-T01`, `P05-T01`.
* What changed: Reopened both tasks for enforceable stopped-writer hooks, runtime non-creating database opens, and GitHub OIDC-only deployment.
* Why and triggering evidence: [.copilot-tracking/reviews/logs/2026-11-14/azure-files-working-app-review.md](../../reviews/logs/2026-11-14/azure-files-working-app-review.md), `RV-001` through `RV-003`.
* User decision: `RD-004`, `RD-006`, `RD-009` accept the fixes and select GitHub OIDC only; no cloud mutation approval.
* Reconciliation: Summary, markers, task details, confirmed direction, readiness and handoff updated. Existing map parts and phase assignments are unchanged.
* Planned validation: Mocked deployment-gate failures/successes, focused runtime database-loss cases, full pytest, Ruff, warning-free Bicep, image and HTTP smoke.
* First item: `P04-T01`. Local blockers: none. Business sources: none.
* Result: Both reopened tasks are now locally complete; no architecture or business-source divergence was introduced.

### Place live mount checks with cloud acceptance

* Affected plan area: `P04-T01`, `P05-T01`.
* What changed: Assign actual SMB UID, file-operation and lock verification to `P05-T01`, retaining all live checks.
* Why: `P04` implements the deployable configuration locally; cloud checks require separate authorization and were already part of `P05`.
* Triggering evidence: Azure Files managed-identity mount is preview and cannot be tested without an authorized Azure deployment.
* User decision: prior direction requires separate cloud authorization.
* Reconciliation: task details and guidance updated; architecture and requirements unchanged.
* Planning and critique state: ready for local implementation; cloud acceptance remains pending.

## Business Alignment

* None.

## Validation Record

| Check | Scope | Status | Evidence or reason |
|---|---|---|---|
| Targeted web/auth/melody/deployment tests | P04-P05 | Passed | 71 cases, including runtime database loss and paid lock release; included in full suite. |
| Full pytest suite | P04-P05 | Passed | 226 passed; one existing Starlette/httpx deprecation warning. |
| Ruff | P04-P05 | Passed | `uv run --no-sync ruff check .`. |
| Bicep | P04 | Passed | Warning-free compilation and compiled resource, CIAM settings, identity, mount and replica assertions. |
| GitHub workflow and azd hooks | P04 | Passed | `uv tool run --from actionlint-py actionlint .github/workflows/deploy-web.yml`; YAML assertions verify manual dispatch, OIDC, approval, serialization and fail-closed hooks. |
| Browser navigation | P05 | Passed | `node --test tests/test_web_navigation.cjs`; one regression passed. |
| New-test limit | P04-P05 | Passed | 11 new test functions against the maximum of 12, including the earlier startup tests. |
| Docker image and HTTP smoke | P04-P05 | Passed | Rebuilt image; actual HTTP health/UI/config and non-root UID 10001 passed. Existing mount and local writer tests passed in the suite. |
| Instrumental render and restart | P05 | Passed | Updated image: synthetic signed token, instrumental render, evaluation, protected audio/evidence, second-owner denial and matching audio hashes in a new container passed. |
| Backup and restore | P05 | Passed | Stopped source volume copied to a separate isolated volume; restored API records/evaluations, both SQLite integrity checks and matching referenced-audio hash passed. |
| Live Azure mount, identity, persistence, updates and restore | P04-P05 | Unavailable | Requires separate user authorization. |

## Pre-Review Reconciliation

* Plan markers, task context, completed-work entries, handoff, blockers, remaining work and validation are current.
* Accepted review decisions are implemented with local evidence; the historical review remains unchanged and no second review was required or invoked.
* Business sources: none cited; Business Alignment remains none.
* Review readiness: ready for optional local review; live cloud acceptance is not established.

## Blockers

* Cloud acceptance: user must separately authorize cloud operations; the Azure/GitHub operator must configure and approve the OIDC environment and verify actual SMB mounting, writer exclusion, authentication, restart and restore. Any required External ID registration changes need separate tenant-owner approval.

## Remaining Work

* No remaining active-plan markers. Live cloud checks remain conditional and unperformed.

## Follow-Up Items

* Canonical list: [.copilot-tracking/plans/2026-11-14/azure-files-working-app-plan.md](../../plans/2026-11-14/azure-files-working-app-plan.md), `## Follow-Up Items`.
* None.

## Return-to-Caller State

* Implementation execution status: complete for local implementation and accepted review corrections.
* Scope: full plan; `P04`, `P04-T01`, `P05`, `P05-T01` complete; remaining active-plan markers: none. Cloud acceptance pending separate authorization.
* Validation: targeted and full suites, lint, navigation, workflow semantics, Bicep, updated image HTTP smoke, synthetic render/restart and isolated backup/restore passed.
* Blockers: no permission granted to provision Azure or mutate tenant registrations; actual cloud behavior remains unverified.
* Business alignment entries: none.
* Current plan updates: accepted review corrections added to existing task details and confirmed direction; reopened tasks completed. Historical critique findings remain resolved.
* Follow-up items: none.
* Review readiness: ready for optional local review, not cloud acceptance.
* Continuation owner: user.
