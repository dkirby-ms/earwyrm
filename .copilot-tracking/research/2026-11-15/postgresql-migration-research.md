<!-- markdownlint-disable-file -->
# Task Research: PostgreSQL migration

| Field | Value |
|-------|-------|
| Date | 2026-11-15 |
| Researcher | RPI Research |
| Output mode | convergence |

## Executive Summary

The hosted web path needs both databases migrated, not just the main store. Retain the existing External ID sign-in, add explicit authorization management, and bootstrap exactly one verified owner. B1ms is the smallest documented Flexible Server compute size, but the cheapest complete deployment and exact price depend on region and networking.

## What You May Not Know

Melody screening is shared by the web renderer and the standalone tool. Paid Speech remains disabled until its separate cost, credential, and authorization checks pass. An External ID subject is application-specific; a GitHub username is not a substitute.

## Findings

### Storage migration must retain transactional safeguards

The web records, metered usage ledger and melody history currently use two SQLite databases. The renderer also writes private audio and melody artifacts on the mounted share. Concurrent spend reservation and similarity screening rely on SQLite write serialization, so a PostgreSQL port must reproduce those guarantees and migrate existing data and files safely.

* Questions: Q1, Q3
* Evidence state: evidence-backed finding
* Evidence: C1, C4, C5, C6
* Confidence and limits: high for repository behavior; the amount and location of live data are not established.

### Existing identity and Speech controls must stay fail-closed

External ID validates tokens and delegated scopes. Paid Speech currently requires an enabled flag, a matching access-token subject, valid Speech credentials, cost evidence and explicit confirmation; reconciliation gates further requests. Add administrative management without granting access to unverified users or automatically relaxing those safeguards.

* Questions: Q1, Q3
* Evidence state: evidence-backed finding
* Evidence: C2, C7, W4
* Confidence and limits: high for current code. The requester's verified API-token subject is not known.

### Smallest compute does not establish total cheapest cost

Microsoft documents Burstable B1ms as one vCore and 2 GiB and lists 32 GiB as the lower storage size. Burstable can suffer credit exhaustion. The entire cost depends on region, storage, network connectivity and subscription pricing; no target or quote has been verified.

* Questions: Q2
* Evidence state: evidence-backed finding
* Evidence: W1, W3, W5
* Confidence and limits: high for documented sizes; no claim that the full deployment is globally cheapest.

### Existing Key Vault and network boundaries are deployment inputs

Container Apps supports managed-identity Key Vault references. The repository does not identify a vault, and its existing Container Apps environment does not declare customer VNet integration. The broad Azure-services PostgreSQL firewall rule includes other tenants. Vault access, approved connectivity and exact costs must be checked before live provisioning.

* Questions: Q2, Q3
* Evidence state: evidence-backed finding
* Evidence: C3, W2, W3
* Confidence and limits: high for configuration and documented behavior; live resources were not inspected.

## Recommendation and Alternatives

Recommend PostgreSQL for both hosted stores with transactional serialization, an explicit data-preserving migration, existing External ID, a narrowly controlled owner-bootstrap and authorization administration, and managed-identity access to an existing Key Vault secret. Retain local behavior where needed and document operational inputs; do not silently enable paid billing or broad network access.

| Option | Benefits | Costs and risks | Evidence | Disposition |
|--------|----------|-----------------|----------|-------------|
| B1ms Flexible Server | Smallest documented compute, managed database | Burst exhaustion; price and regional availability unverified | W1, W5 | Selected candidate subject to region and cost review |
| Larger server | More predictable capacity | Higher compute cost | W1 | Deferred unless workload requires it |
| All-Azure firewall | Low-friction connectivity | Includes other customers' subscriptions | W3 | Rejected as silent default |
| Replace External ID | New identity implementation | Duplicates working authentication and risks ownership changes | C2, W4 | Rejected |

## Scope and Questions

* Goal: replace SQLite with a dedicated low-cost Azure PostgreSQL Flexible Server, use a password in the existing Key Vault, manage user authentication, and bootstrap the requester as the only user with paid speech access.
* Audience and use: repository owner and implementation phase.
* In scope: persistence, migration, deployment, identity, authorization, entitlement, testing, pricing, and operational constraints.
* Out of scope: live provisioning or destructive data changes without separate confirmation.
* Criteria: preserve data and behavior, restrict privileged access, use supported low-cost Azure deployment, and verify changes.

| ID | Question | Source | Status |
|----|----------|--------|--------|
| Q1 | How do persistence, authentication, user management, and speech entitlement work today? | User request | Answered: C1, C2, C5, C7 |
| Q2 | What Azure configuration, secret handling, connectivity, and hosting cost constraints apply? | User request | Answered with deployment-specific price and availability unresolved: C3, W1-W3, W5 |
| Q3 | How can the owner's identity and existing data be bootstrapped safely? | User request | Answered in principle; actual subject, data and vault are operational inputs: C4-C7, W4 |

## Decisions and Feedback

| Group | Decision or feedback item | Status | Owner | Rationale and evidence |
|-------|----------|--------|-------|------------------------|
| D1 | Retain External ID and add managed authorization | Selected | Agent | Existing verified sign-in and ownership; C2, W4 |
| D2 | Use B1ms as deployment candidate | Selected with regional verification | Agent | Smallest documented compute, not a regional cost guarantee; W1, W5 |
| D3 | Bootstrap one verified user and preserve paid safeguards | Selected | User direction and agent | Subject cannot be inferred; C2, C7, W4 |
| D4 | Inventory, cost approval and live changes | Deferred to deployment gate | User | Existing deployment explicitly requires review; C3, C7 |

## Risks and Open Questions

| Priority | Risk | Smallest action or evidence needed | Owner |
|----------|------|------------------------------------|-------|
| High | Wrong owner or vault could grant access or fail startup | Securely supply and verify the API subject and vault resource at bootstrap; do not paste a token or password | Deployment owner |
| High | Existing data or paid ledger may be lost during migration | Inventory source stores and files, back up, test import and obtain migration approval | Deployment owner |
| High | Networking or billing differs from assumptions | Review region-specific availability, total price and restricted network design | Deployment owner |
| Medium | Local PostgreSQL runtime unavailable | Identify a suitable isolated test database or test fixture before integration validation | Implementation |

## Planning Readiness and Next Step

| Field | Record |
|-------|--------|
| Research disposition | Executed |
| Decision participation | Agent-owned; automatic end-to-end user selection |
| Planning Readiness | Ready for repository planning; operational inputs remain deployment gates, C1-C7 and W1-W5 |
| Research depth and helpers | Two wider, deeper and contrarian cycles; no helpers |
| Blockers | No blocker to planning; live deployment requires verified identity, vault, data and network inputs |
| Output mode and planning support | Convergence; supports planning |
| Continuation owner | Confirmed automatic RPI session |
| Required gates or confirmations | Cloud mutation, maintenance, data migration and billing require separate approval |
| Next action | Transition to Plan after persistence |
| Primary evidence file | .copilot-tracking/research/2026-11-15/postgresql-migration-research.md; date from session |

## Research Record

### Method and Boundaries

Balanced posture, default provenance. Candidate areas: Python persistence and auth, deployment configuration and Key Vault, Azure Flexible Server SKU and networking, and existing tests and documentation. No explicit deadline. Evidence root is repository .copilot-tracking/research/. Prior state search found no matching migration task; prior artifacts are not assumed current. Research-only writes remain within tracking paths.

### Extensions and Participation

| Kind | Candidate | Decision |
|------|-----------|----------|
| Instruction | Tracking location and RPI tracking | Selected for evidence locations and state |
| Instruction | Markdown and writing style | Selected for artifact |
| Skill | DataOps | Skipped: this is transactional application storage, not a data pipeline or data-science test suite |
| Skill | Security planning | Skipped: no security planning artifact requested |

The user chose end-to-end execution, so supported decisions are agent-owned; do not request credentials. Helper lane effort is auto; no helpers were dispatched.

### Research Cycle Log

#### Cycle 1

##### Wave 1: Wider

* Focus: storage, existing authentication, speech controls, deployment, and official Azure options.
* Evidence: C1 identifies two SQLite databases and `BEGIN IMMEDIATE` transaction locks; C2 identifies token-based External ID and a single-subject paid Speech setting; C3 identifies a Container Apps deployment with Azure Files and no Key Vault declaration.
* Reflection: PostgreSQL requires preserving database-specific transaction guarantees and existing filesystem artifacts. The owner subject and existing Key Vault are not established by these files. Investigate existing database history and Azure server pricing, connectivity, and secrets.

##### Wave 2: Deeper

* Focus: storage atomicity, identity bindings, Azure capacity and secret delivery.
* Evidence: C4 shows that the cloud entry point refuses missing databases and that media and melody artifacts remain on a mount. C1 serializes spend, evaluations, and melody screening. C2 uses the verified access-token `sub`; C3 uses a user-assigned managed identity but contains no existing Key Vault reference. W1 documents B1ms, 32 GiB minimum and burst-credit limits; W2 describes managed-identity Key Vault references; W3 documents public firewall behavior.
* Reflection: A new PostgreSQL implementation must preserve budget and melody serialization, preserve mounted files and provide a safe migration path. User subject, vault identity and regional prices must be supplied at deployment rather than guessed.

##### Wave 3: Contrarian

* Focus: challenge the cheapest-SKU and lowest-cost networking assumptions, and whether replacing identity is necessary.
* Evidence: W1 warns that Burstable can be unavailable after CPU credits are exhausted and is not recommended for production. W3 says the all-Azure firewall exception permits other customers' subscriptions, while C2 already provides identity validation. Storage prices and regional availability vary; a specific cheapest overall configuration cannot be established without a target region and full estimate.
* Reflection: Reuse External ID rather than introducing a password-based application identity provider. Avoid broad Azure firewall access as a silent default; actual deployment topology and cost need explicit verification. Existing credential and data state are not implied by repository configuration.

##### Synthesis and Re-entry

* Tentative: B1ms is the smallest documented compute option; keep durable files and implement PostgreSQL-backed records while retaining External ID and its paid safeguards.
* Further investigation: trace melody usage and any supported local PostgreSQL test tooling, and assess bootstrap identity and migration evidence before declaring readiness.

#### Cycle 2

##### Wave 1: Wider

* Focus: cross-service melody history and existing validation tools.
* Evidence: C5 shows the web renderer and standalone MCP share `MelodyService`, while C6 tests concurrent paid reservations and melody deduplication. The workspace has `psql`, Docker, Azure CLI and azd; a PostgreSQL server binary was not found on PATH.
* Reflection: Changing only web storage leaves SQLite melody history on the production path. Local CLI behavior and transactional concurrency must remain covered.

##### Wave 2: Deeper

* Focus: bootstrap identity binding and deployment discovery.
* Evidence: C2 uses the authenticated token `sub`; W4 states External ID `sub` is pairwise. The repository does not establish the requester's External ID subject or live Key Vault resource. W5 states retail pricing varies by region and SKU.
* Reflection: No GitHub username or email can safely stand in for the verified API-token subject. Make bootstrap explicit and fail closed until the correct subject and vault are securely supplied; never ask for token or password contents.

##### Wave 3: Contrarian

* Focus: deployment portability and retaining local tools.
* Evidence: W3 warns that the cheap all-Azure firewall shortcut admits other customers; C3 already uses an environment without customer-managed VNet configuration. C5 and C6 show local independent tools depend on SQLite today.
* Reflection: A new restricted networking design is required for a safe hosted solution; preserving an optional local SQLite backend may protect existing CLI behavior even though hosted stores must use PostgreSQL. Verify the approved user's intended migration scope if a safe rollout cannot preserve both.

##### Synthesis and Re-entry

* Evidence supports planning a bounded PostgreSQL migration, configurable vault reference and explicit verified-subject bootstrap, while retaining actual cloud and data mutation approval gates.
* No additional complete cycle is needed for an implementation plan; deployment-specific region, vault, subject, live data inventory and price remain required operational inputs rather than discoverable repository facts.

### Evidence Log

| ID | Claim or finding | Source or location | Retrieved | Tool | Confidence |
|----|------------------|--------------------|-----------|------|------------|
| C1 | Two SQLite stores serialize sensitive operations with `BEGIN IMMEDIATE` | audio_poc/web_storage.py `WebStorage.reserve_paid_run`; audio_poc/melody_service.py `MelodyService._submit` | Not applicable | Read | High |
| C2 | Existing External ID subject allowlist gates paid Speech | audio_poc/web_app.py `_paid_configuration`; audio_poc/web_auth.py `TokenValidator` | Not applicable | Read | High |
| C3 | Current deployment uses Azure Files and disables Speech; Key Vault is not declared in these modules | infra/platform.bicep `platform`; infra/service.bicep `app` | Not applicable | Read | High |
| C4 | Cloud startup validates both databases and a mounted private data directory | audio_poc/cloud_web.py `prepare_databases`, `main`; audio_poc/web_storage.py `WebStorage.__init__` | Not applicable | Read | High |
| C5 | The web and independent melody paths share melody history storage | audio_poc/__main__.py `render_brief`; audio_poc/melody_mcp.py `create_server`; audio_poc/melody_service.py `MelodyService` | Not applicable | Search and read | High |
| C6 | Tests enforce concurrent reservations and melody idempotence | tests/test_web_app.py `test_given_concurrent_paid_reservations_when_reserved_then_only_one_succeeds`; tests/test_melody_service.py `test_given_concurrent_retry_and_restart_when_submitted_then_same_durable_job` | Not applicable | Read | High |
| C7 | Deployment is approval-gated and Speech requires spending and reconciliation controls | docs/azure-deployment.md `Configure and deploy`; docs/audio-poc/web-app.md `Configure the existing External ID registrations`; audio_poc/web_app.py `_paid_configuration`, `create_render` | Not applicable | Read | High |
| W1 | B1ms is the smallest documented burstable compute; limits and cost caveats apply | [Compute options](https://learn.microsoft.com/azure/postgresql/compute-storage/concepts-compute) | 2026-11-15 | Microsoft Docs | High |
| W2 | Container Apps can reference Key Vault secrets with managed identity | [Manage secrets](https://learn.microsoft.com/azure/container-apps/manage-secrets) | 2026-11-15 | Microsoft Docs | High |
| W3 | All-Azure firewall access includes other customers' subscriptions | [Public networking](https://learn.microsoft.com/azure/postgresql/network/concepts-networking-public) | 2026-11-15 | Microsoft Docs | High |
| W4 | External ID subject is pairwise | [Migrate from Cognito](https://learn.microsoft.com/entra/external-id/customers/migrate-from-cognito-to-external-id#step-2-prepare) | 2026-11-15 | Microsoft Docs search | Medium |
| W5 | Azure retail prices are region and SKU dependent | [Azure Retail Prices overview](https://learn.microsoft.com/rest/api/cost-management/retail-prices/azure-retail-prices) | 2026-11-15 | Microsoft Docs search | High |

#### Contradictions and Conflicts

None established. The smallest compute is not presented as a verified total-cost minimum.

### Artifact Self-Check

The findings, evidence IDs, participation, two complete cycles, alternatives, readiness, scope, constraints and operational gaps have been checked. No credentials were collected. No source files or live resources were modified during research.
