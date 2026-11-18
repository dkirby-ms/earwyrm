<!-- markdownlint-disable-file -->
# RPI Changes: Shared Foundry provisioning

## Metadata

* Task ID: `shared-foundry`
* Related plan: [.copilot-tracking/plans/2026-11-18/shared-foundry-plan.md](../../plans/2026-11-18/shared-foundry-plan.md)
* Implementation date: 2026-11-18

## Execution Status

Local implementation completed. A separate Review was skipped for this follow-up; the parent Review does not cover it. Live Azure activation is outside the approved write boundary.

## Completed Work

### P01-T01 One provisioned Foundry account

[infra/platform.bicep](../../../infra/platform.bicep) creates an opt-in `S0` account, scoped roles and, for text, one approved model deployment. [infra/service.bicep](../../../infra/service.bicep) derives endpoints and enables only the selected runtime settings. [.github/workflows/deploy-web.yml](../../../.github/workflows/deploy-web.yml) takes approved model parameters and caps instead of external endpoints or a Speech secret.

### P01-T02 Managed-identity Speech and rate evidence

[apps/api/src/speech.ts](../../../apps/api/src/speech.ts) selects managed identity for cloud Speech without changing the existing synthesis events or audio settings. [apps/api/src/web_app.ts](../../../apps/api/src/web_app.ts) binds cloud Speech evidence to the configured account and region. Local key authentication remains supported. The text ledger, screening and entitlement were not relaxed. [docs/azure-deployment.md](../../../docs/azure-deployment.md) describes the new inputs and rollout gates.

## Validation and remaining work

* Passed: 222 focused audio, web, lyric and deployment tests; production build; `git diff --check`.
* Passed: Bicep compilation and offline snapshots for neither feature, each feature alone, and both together. Confirmed conditional account and model counts and runtime environment, with no Speech key.
* Deferred: approved live test of model and quota, Entra role propagation, managed-identity word timings, and both Content Safety calls on the shared account. No billable actions or live mutations.
* Business Alignment: none; no cited business-source requirements changed.
