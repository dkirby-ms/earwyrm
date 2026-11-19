<!-- markdownlint-disable-file -->

# Whole-Repository Review Board

Target: clean `main` at `6f4ec3b85bcf4899f8c0a8eaa185de17b53abb8c`. The user confirmed the full-repository scope, comprehensive depth, and the six areas below. This is a baseline audit, not a patch review.

| # | Area | Status | Preliminary signal |
|---|---|---|---|
| 1 | Authentication and API (`auth-api`) | In progress | Browser MSAL scopes and server-side JWT/scope plus enabled-user checks form a shared boundary across access requests, administration, and owner-scoped routes. Evidence: `apps/web/src/auth.ts:26-82`, `apps/api/src/web_auth.ts:134-268`, `apps/api/src/web_app.ts:443-451`. |
| 2 | Paid generation and budgets (`paid-ai`) | In progress | Paid text and Speech use separate consent/configuration and reservation paths; Speech confirmations bind to server estimates and input fingerprints. Evidence: `apps/api/src/web_app.ts:316-339`, `apps/api/src/web_app.ts:831-948`, `apps/api/src/web_storage.ts:207-218`, `apps/api/src/web_storage.ts:431-469`. |
| 3 | Persistence and migration (`data`) | In progress | Runtime SQLite/PostgreSQL adapters share storage abstractions while PostgreSQL startup validates an explicit marker and migration/reset are operator workflows. Evidence: `apps/api/src/persistence.ts:111-175`, `apps/api/src/persistence.ts:260-275`, `apps/api/src/bootstrap_database.ts:100-119`, `apps/api/src/bootstrap_database.ts:209-271`. |
| 4 | Azure deployment (`deployment`) | In progress | Azure provisioning, application startup, and reset/initialization span Bicep, approval-gated workflows, private networking, and a temporary initialization job. Evidence: `infra/platform.bicep:249-351`, `.github/workflows/deploy-web.yml:107-126`, `scripts/initialize_deployment.ts:130-200`. |
| 5 | Frontend/API and services (`integration`) | In progress | Browser routes, MCP clients/servers, platform scaffold, and service-contract documentation are separate integration surfaces. Evidence: `apps/api/src/web_app.ts:613-820`, `apps/api/src/jingle_tools.ts:31-82`, `apps/api/src/platform_service.ts:18-157`, `docs/service-contracts.md:79-140`. |
| 6 | Tests and readiness (`validation`) | In progress | API and browser suites span the named subsystems, while root scripts define typecheck/build/test and coverage reporting is not present in the supplied state. Evidence: `package.json:8-13`, `apps/api/vitest.config.ts:3-8`, `apps/web/src/App.test.tsx:282-884`. |

## Perspective Dispatch

The full review runs functional, standards, accessibility, security, and readiness perspectives. Functional, standards, and readiness cover all six areas; accessibility focuses on the browser experience; security focuses on identity, paid operations, persistence, and deployment. Findings are reviewed and deduplicated before the final report.

The source-linked, factual walkthrough is in `walkthrough.md`. User confirmation was received before dispatch.
