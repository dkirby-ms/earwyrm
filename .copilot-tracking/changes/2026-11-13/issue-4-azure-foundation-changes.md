<!-- markdownlint-disable-file -->
# RPI Changes: Azure foundation

## Metadata

* Task ID: issue-4-azure-foundation
* Related plan: [.copilot-tracking/plans/2026-11-13/issue-4-azure-foundation-plan.md](../../plans/2026-11-13/issue-4-azure-foundation-plan.md)
* Implementation date: 2026-11-13

## Execution Status

* Status: Complete for the full local implementation plan; cloud acceptance remains blocked.
* Declared scope: full plan.
* Completed markers: P01, P01-T01, P02, P02-T01, P03, P03-T01.
* Remaining markers: none. Issue acceptance still requires live cloud validation.

## Execution Summary

Implement contracts, service/container scaffolds, azd/Bicep and operator documentation. Preserve all prior uncommitted lyric work. No Azure resource creation, GitHub mutation, commit or push is authorized.

## Completed Work

### Shared contracts and honest service surfaces

* Related task: P01-T01.
* Files: [audio_poc/contracts.py](../../../audio_poc/contracts.py), [audio_poc/platform_service.py](../../../audio_poc/platform_service.py), [Dockerfile](../../../Dockerfile), [.dockerignore](../../../.dockerignore).
* Contracts reuse existing creative schemas and add immutable identities, queue envelopes, errors, measured quality, provenance and human approval records.
* HTTP health identifies a scaffold, not generation readiness. Real MCP negotiates supported protocol versions and returns explicit tool errors for unintegrated generation. Render entrypoint fails without consuming or acknowledging work.
* Validation: 20 targeted cases pass; Ruff passes. The initial Rust-regex lookahead incompatibility was fixed with an explicit nonzero trace validator. Container build remains P03.
* Telemetry: bounded errors only; no request payload/access logs. Schema HTTP span uses SERVER kind and the HTTP semantic name. Azure exporter integration is not claimed.

## Implementation-Time Plan Updates

* P03 uses [docs/azure-deployment.md](../../../docs/azure-deployment.md) and [docs/service-contracts.md](../../../docs/service-contracts.md) for deployment and schema instructions.
* Backend identity authorization uses APIM's service-principal object ID in `allowedPrincipals.identities`, not its application/client ID. This is a schema-backed correction, not an architecture change.

## Business Alignment

* None.

## Validation Record

* Passed: 201 regression tests, including 20 targeted cases. One existing Starlette/httpx deprecation warning remains.
* Passed: warning-free Bicep compilation after correcting the APIM service management version to `2024-05-01`; native MCP uses `2025-09-01-preview`.
* Passed: locked Docker build, UID 10001 runtime, real image HTTP health/schema/MCP initialization, and explicit worker exit 2 without queue acknowledgement. Own smoke container was stopped.
* Passed: final Ruff check and formatting check on the four new Python files.
* Passed: official azd JSON Schema validation using upstream versioned schema; shortlink returned HTML, so the editor directive now uses the verified upstream URL. The missing PyYAML validator was isolated with `uv run --with pyyaml`, without manifest or lock changes.
* Passed: APIM XML parsing; malformed/missing seller object IDs are rejected before rate-limit indexing.
* Passed: bootstrap image pull and actual HTTP 200 on port 8080 as UID 101; own container was stopped.
* Passed: task-local azd 1.37.3 standalone binary reports its version. No global installation, symlink, telemetry or shared configuration changes. Release metadata via gh was SSO-blocked; the package came from the official installer's public Azure artifact feed.
* Passed: final embedded policy Bicep compilation, schema validation, 22 local documentation links and `git diff --check`.
* Pending: Review.
* Unverified: clean live azd up and authenticated cloud smoke; these require prerequisites and billing consent.

## Pre-Review Reconciliation

All P01-P03 requirements have local evidence or their explicitly required unverified-cloud status. Review-ready for local code, infrastructure, docs and tests. No cloud success, professional approval or completed generation is asserted.

## Blockers

No local implementation blocker. Cloud acceptance requires operator prerequisites and explicit provisioning consent.

## Remaining Work

Actual cloud verification after explicit provisioning consent and non-secret prerequisites.

## Follow-Up Items

None.

## Return-to-Caller State

Automatic parent proceeds to Review, then requests cloud provisioning consent/prerequisites if no required local findings remain.

## Azure foundation resources

* Related task: P02-T01.
* Files: [azure.yaml](../../../azure.yaml), [infra/](../../../infra/).
* Subscription-scoped deployment creates isolated Container Apps services/job, private Blob containers and render queue, registry, model, Content Safety, paid Speech, RBAC Key Vault and workspace-backed monitoring.
* APIM validates seller issuer/tenant/audience/scope and object ID, then authenticates to backends as its own managed identity. Backends restrict principal identity; only health is excluded from authentication.
* Runtime roles receive scoped data-plane permissions. Lyric has no unnecessary Blob access. Storage and AI key authentication are disabled, and Key Vault stays empty.
* Bootstrap image and application use port 8080 with TCP probes and no incompatible command override. azd discovers all four resources by service tags; operator guide explains full up/deploy versus bootstrap-only provision.
* Validation: Bicep compile passed without diagnostics; cloud quota/availability and provisioning remain unverified.

## Verification and operator handoff

* Related task: P03-T01.
* Files: [tests/test_contracts.py](../../../tests/test_contracts.py), [tests/test_platform_service.py](../../../tests/test_platform_service.py), [docs/azure-deployment.md](../../../docs/azure-deployment.md), [docs/service-contracts.md](../../../docs/service-contracts.md), [docs/project-plan.md](../../../docs/project-plan.md).
* Added semantic contract/protocol tests and durable prerequisites, Entra setup, costs, supported runtime/MCP, deployment configuration, local/container smoke, authenticated cloud acceptance, limits and destructive-teardown instructions.
* Guides distinguish private authorization from network isolation, prepared telemetry from exported traces, and scaffold health from working generation.
* Validation: 201 regression tests and scoped Ruff passed; image/bootstrap smoke passed; azd schema and policy XML validation passed.
* Cloud acceptance is required and unverified, not optional follow-up.
