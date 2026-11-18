<!-- markdownlint-disable-file -->
# RPI Plan: Shared Foundry provisioning

## Task Metadata

* Task ID and slug: `shared-foundry`
* Date: 2026-11-18

## Planning Readiness and Critique Disposition

Local repository scope authorized by the shared-resource decision and automatic mode. Critique skipped for the follow-up. No Azure operations authorized.

## Phase Checklist

* [x] P01: Provision and wire shared AI
  * [x] P01-T01: Provision the account and optional model
  * [x] P01-T02: Preserve guarded synthesis and rollout guidance

<!-- rpi:phase id=P01 -->
## P01 Provision and wire shared AI

<!-- rpi:task id=P01-T01 -->
### P01-T01 Provision the account and optional model

**Goals:** Remove manually created Speech and text resources from the web deployment prerequisites.

**Requirements:** One account if either flag is on, one model deployment if text is on, no local account keys, no account on a fresh both-off deployment.

**Details:** Pass the approved region/model/capacity via the protected workflow. Assign app identity roles at account scope and derive runtime endpoints.

**References:** [infra/platform.bicep](../../../infra/platform.bicep)

**Dependencies:** Research E1 and E3. Validate all four flag combinations via offline Bicep snapshots.

<!-- rpi:task id=P01-T02 -->
### P01-T02 Preserve guarded synthesis and rollout guidance

**Goals:** Use managed identity in Azure while retaining local Speech key authentication.

**Requirements:** Preserve word timing, entitlement, explicit paid consent, spending controls, and both safety calls. Match cloud rate evidence to the provisioned account and region.

**Details:** Validate auth modes and evidence with focused tests; build the app and document live verification gates. Azure results are not inferred from mocks.

**References:** [apps/api/src/speech.ts](../../../apps/api/src/speech.ts), [docs/azure-deployment.md](../../../docs/azure-deployment.md)

**Dependencies:** Research E2 and P01-T01.
