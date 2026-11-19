# Register 1 — Whole-repository orientation

## Audit frame

This is a baseline orientation of the repository at `main`, commit
`6f4ec3b85bcf4899f8c0a8eaa185de17b53abb8c`. The checkout is clean. The
precomputed state records `diff.available: false`, so this walkthrough describes
the current system and review surface; it does not characterize a patch or imply
that these files changed. The confirmed scope covers application source, tests,
frontend, API, infrastructure, deployment workflows/scripts, and directly
related documentation. Generated render outputs, installed dependencies,
build outputs, and historical tracking records are not primary review targets.

The review profile is `full` and the confirmed depth is `comprehensive`. The six
confirmed areas are auth-api, paid-ai, data, deployment, integration, and
validation. Exact `path:line` references below identify current entry points,
control/data flow, and boundaries for the later review. The board remains
pending human confirmation; no findings are recorded here.

## System shape and runway

### Entry points and runtime shape

The root workspace scripts expose typecheck, build, and the API/web test suites;
they also distinguish the browser API, standalone MCP tools, platform service,
renderer, and database operator entry points (`package.json:8-22`). The browser
mounts `App` from `apps/web/src/main.tsx:1-10`. In the production container,
`Dockerfile.web:1-20` builds the Vite frontend and TypeScript API separately;
`Dockerfile.web:22-37` assembles the runtime image and starts
`apps/api/dist/cloud_web.js`.

The production supervisor in `apps/api/src/cloud_web.ts:140-188` checks the
mounted data directory and takes a writer lock (`cloud_web.ts:60-81`), prepares
the selected local or PostgreSQL store (`cloud_web.ts:99-136`), and launches
`web_app.js` with the worker descriptor inherited (`cloud_web.ts:146-159`).
For PostgreSQL, this startup path validates the existing store and may perform
the configured additive lyric-schema upgrade; it does not use the normal
SQLite-initialization branch (`cloud_web.ts:99-136`,
`apps/api/src/persistence.ts:260-275`). The Express app factory is
`apps/api/src/web_app.ts:273`; its direct development entry listens on the
configured port (`web_app.ts:1088-1092`).

### Browser, identity, and API flow

On browser boot, `App.initializeApplication` fetches `/api/config`, checks
`setup_status`, initializes MSAL, then loads workspace data when an account is
selected (`apps/web/src/App.tsx:344-374`). `initializeAuth` initializes the
public client and handles the redirect result (`apps/web/src/auth.ts:26-60`);
`getAccessToken` uses silent acquisition and then the interactive popup fallback
(`auth.ts:63-82`). The shared API helper obtains that token, limits requests to
same-origin `/api/` paths, and sends bearer-authenticated, no-store requests
(`apps/web/src/api.ts:25-56`).

On the server, `AuthSettings` reads the External ID settings
(`apps/api/src/web_auth.ts:44-84`); `TokenValidator` loads discovery/JWKS and
verifies issuer, audience, required claims, and the RS256 signature
(`web_auth.ts:134-203`). `require_scope` verifies the bearer token and delegated
scope (`web_auth.ts:244-268`). Most application routes then pass through the
`authorized` wrapper, which checks the verified issuer/subject against enabled
application access (`apps/api/src/web_app.ts:443-451`). The browser's initial
workspace sequence requests identity and access before briefs, options, runs,
outputs, and status (`apps/web/src/App.tsx:233-340`); corresponding route
families are registered in `web_app.ts:531-612` and `web_app.ts:821-987`.
Access-request and admin paths are distinct routes (`web_app.ts:538-590`),
with administration operations delegated to owner-aware storage methods
(`apps/api/src/web_storage.ts:301-320`,
`web_storage.ts:363-421`).

### Paid generation, composition, and output flow

The browser workspace separates instrumental arrangement previews, screened
lyric options, MCP-backed chat, offline rendering, and optional paid Speech
(`apps/web/src/App.tsx:685-875`). Lyric and chat actions include explicit
browser consent state and submit the `confirm_paid_generation` contract
(`App.tsx:713-765`). The API validates the action and current user entitlement;
text reservations are committed before a paid backend is constructed
(`apps/api/src/web_app.ts:316-339`, `web_app.ts:681-763`,
`web_storage.ts:193-218`). The lyric writer calls preflight, generation,
assessment, and local screening before returning an accepted, held, or rejected
result (`apps/api/src/lyric_service.ts:27-83`).

Paid Speech has a separate route: the browser obtains an estimate and starts
rendering only after confirmation (`apps/web/src/App.tsx:818-887`). The API
recomputes the estimate and input fingerprint, checks the submitted confirmation,
reserves a paid attempt, marks provider submission, renders, and records the
terminal run/attempt state (`apps/api/src/web_app.ts:831-948`). Storage keeps
the paid ledger and outputs owner-scoped; actual usage is reconciled later
(`apps/api/src/web_storage.ts:431-469`,
`web_storage.ts:509-554`, `apps/api/src/web_app.ts:1021-1038`). Speech provider
configuration and synthesis are in `apps/api/src/speech.ts:13-83`.

Arrangement previews pass through `POST /api/arrangements`, where the API
submits deterministic preview jobs to `MelodyService` and stores a protected
instrumental output (`apps/api/src/web_app.ts:613-670`). When a lyric is
composed into a preview, the browser sends the selected option ID
(`apps/web/src/App.tsx:766-794`); the server resolves that option under the
current owner before calling the composition tool (`web_app.ts:681-763`).
Output retrieval first resolves the output for the authenticated subject, then
serves its audio path (`web_app.ts:969-985`; `web_storage.ts:509-521`).

### Persistence and migration boundaries

`WebStorage` owns the private data root, audio/work directories, and database
selection (`apps/api/src/web_storage.ts:100-137`). The SQLite and PostgreSQL
adapters implement the shared connection/transaction contract; remote
PostgreSQL requires hostname-verified TLS and a trusted CA
(`apps/api/src/persistence.ts:111-175`). The web schema covers runs, paid
attempts, outputs, evaluations, application identity/users, access requests,
lyric options, and lyric reservations (`web_storage.ts:138-229`).
Owner-filtered reads and writes connect API identity to stored runs, media,
evaluations, and paid usage (`web_storage.ts:423-588`).

The operator CLI separates fresh initialization, SQLite import, and additive
upgrade (`apps/api/src/bootstrap_database.ts:281-352`). Fresh initialization
creates the PostgreSQL schemas and owner under explicit reset authorization
(`bootstrap_database.ts:100-119`); import validates the SQLite databases and
media references before copying into an empty PostgreSQL target
(`bootstrap_database.ts:209-250`); the upgrade path adds selected tables without
resetting the existing store (`bootstrap_database.ts:254-271`). These paths
cross structured PostgreSQL records and retained/media files, with the
application's mounted data directory also used by the cloud supervisor.

### Integration boundaries

The browser-facing API is Express in `web_app.ts`; the API's MCP client wrappers
are in `apps/api/src/jingle_tools.ts:31-82`. Standalone lyric and melody MCP
servers expose tools through their own entry points
(`apps/api/src/lyric_mcp.ts:13-63`,
`apps/api/src/melody_mcp.ts:16-77`), while `platform_service.ts:18-157`
contains a separate platform HTTP/MCP scaffold. The service-contract document
describes the browser chat API and distinguishes it from standalone MCP usage
(`docs/service-contracts.md:8-15`, `service-contracts.md:79-106`,
`service-contracts.md:129-140`). The browser-to-API type boundary is represented by `apps/web/src/types.ts`;
the web server's request schemas and parser are in
`apps/api/src/web_app.ts:47-84` and `web_app.ts:460-466`. The separate
canonical MCP/service contracts are in `apps/api/src/contracts.ts:13-171`.

### Deployment and operations path

`azure.yaml:1-20` selects Bicep and runs the deployment gate before provisioning
and deployment. `infra/main.bicep:81-112` supplies the platform module;
`infra/platform.bicep:59-116` defines network and existing Key Vault context,
`platform.bicep:147-200` conditionally provisions AI resources and role
assignments, `platform.bicep:249-307` defines Azure Files and its Container Apps
mount, and `platform.bicep:310-351` wires PostgreSQL and the web service.
`infra/postgresql.bicep:23-98` defines the server, database, private endpoint,
and DNS group; `infra/service.bicep:63-168` builds application environment
settings and the container app, including the database and volume mount.

The manually dispatched deployment workflow requires maintenance approval and
serializes the environment (`.github/workflows/deploy-web.yml:1-26`). Its steps
quiesce writers, provision, verify private networking, deploy, and resume the
app (`deploy-web.yml:107-126`). The separate bootstrap workflow gates
credentials and database initialization on explicit approvals
(`.github/workflows/bootstrap-web.yml:1-28`,
`bootstrap-web.yml:48-98`). The deployment gate verifies the selected target,
writer state, replica count, and private endpoint/DNS inventory
(`scripts/deployment_gate.ts:139-205`,
`deployment_gate.ts:207-291`). The initialization script creates a temporary
private job to reset and initialize the PostgreSQL store and leaves the web app
stopped (`scripts/initialize_deployment.ts:49-65`,
`initialize_deployment.ts:130-200`). Operator runbook guidance is in
`docs/azure-deployment.md:10-47`, `azure-deployment.md:230-280`, and
`azure-deployment.md:381-405`.

### Validation surface

The root scripts define workspace typecheck/build and API plus web test
commands (`package.json:8-13`); API and web package scripts define their
individual commands (`apps/api/package.json:10-12`,
`apps/web/package.json:8-10`). API Vitest includes `tests/**/*.test.ts`
(`apps/api/vitest.config.ts:3-8`); representative suites cover auth
(`apps/api/tests/web_auth.test.ts:45-206`), API routes
(`apps/api/tests/web_app.test.ts:99-1056`), storage and cross-process behavior
(`apps/api/tests/storage.test.ts:80-357`), PostgreSQL/import administration
(`apps/api/tests/storage-admin.test.ts:28-326`), and deployment/bootstrap
(`apps/api/tests/deployment.test.ts:132-306`,
`apps/api/tests/initialize-deployment.test.ts:121-277`). The browser suite
covers workspace, access, paid generation, and audio interactions
(`apps/web/src/App.test.tsx:282-884`). The supplied state reports no coverage
configuration or report; the scripts above describe declared validation
commands, not commands run for this orientation.

## Dispatch appendix — initial board

The table and item details retain the six user-confirmed areas. Signals are
orientation cues, not conclusions. All items are `pending` in `register-2`;
the current manifest keeps `orientationConfirmed` and `humanAccepted` false.

| # / ID | Area | Status | Preliminary signal |
|---|---|---|---|
| 1 — `auth-api` | Authentication and API | pending | Browser MSAL scopes and server-side JWT/scope plus enabled-user checks form a shared boundary across access requests, administration, and owner-scoped routes (`apps/web/src/auth.ts:26-82`, `apps/api/src/web_auth.ts:134-268`, `apps/api/src/web_app.ts:443-451`). |
| 2 — `paid-ai` | Paid generation and budgets | pending | Paid text and Speech use separate consent/configuration and reservation paths; Speech confirmations bind to server estimates and input fingerprints (`apps/api/src/web_app.ts:316-339`, `web_app.ts:831-948`, `apps/api/src/web_storage.ts:207-218`, `web_storage.ts:431-469`). |
| 3 — `data` | Persistence and migration | pending | Runtime SQLite/PostgreSQL adapters share storage abstractions while PostgreSQL startup validates an explicit marker and migration/reset are operator workflows (`apps/api/src/persistence.ts:111-175`, `persistence.ts:260-275`, `apps/api/src/bootstrap_database.ts:100-119`, `bootstrap_database.ts:209-271`). |
| 4 — `deployment` | Azure deployment | pending | Azure provisioning, application startup, and reset/initialization span Bicep, approval-gated workflows, private networking, and a temporary initialization job (`infra/platform.bicep:249-351`, `.github/workflows/deploy-web.yml:107-126`, `scripts/initialize_deployment.ts:130-200`). |
| 5 — `integration` | Frontend/API and service integration | pending | Browser routes, MCP clients/servers, platform scaffold, and service-contract documentation are separate integration surfaces (`apps/api/src/web_app.ts:613-820`, `apps/api/src/jingle_tools.ts:31-82`, `apps/api/src/platform_service.ts:18-157`, `docs/service-contracts.md:79-140`). |
| 6 — `validation` | Tests and delivery readiness | pending | API and browser suites span the named subsystems, while root scripts define typecheck/build/test and coverage reporting is not present in the supplied state (`package.json:8-13`, `apps/api/vitest.config.ts:3-8`, `apps/web/src/App.test.tsx:282-884`). |

### Item details

#### 1 — auth-api

- **Summary:** Trace identity validation, scope authorization, access enrollment,
  administrator operations, and authenticated browser requests.
- **Supporting references:** `apps/api/src/web_auth.ts:134-203`,
  `web_auth.ts:244-268`; `apps/api/src/web_app.ts:443-451`,
  `web_app.ts:531-590`; `apps/web/src/auth.ts:26-82`,
  `apps/web/src/api.ts:25-56`.
- **Entry points and blast radius:** Browser initialization and sign-in feed
  bearer tokens into API calls; scope and enabled-user gates precede
  application routes. The boundary reaches all workspace data and access
  administration.
- **Candidate symbols:** `TokenValidator`, `require_scope`, `authorized`,
  `identity`, `initializeAuth`, `getAccessToken`, `requestApi`,
  `WebStorage.get_user`, `WebStorage.set_user_as_admin`.
- **Questions for deeper review:** Do browser scopes, API scope checks, and route
  permissions agree for every endpoint? How do issuer/subject identity and
  current enabled/admin state propagate through access requests and later
  requests?

#### 2 — paid-ai

- **Summary:** Follow text-generation consent and budgets, Speech estimates and
  confirmation, provider submission, stored status, and reconciliation.
- **Supporting references:** `apps/api/src/web_app.ts:316-339`,
  `web_app.ts:681-820`, `web_app.ts:831-948`,
  `web_app.ts:1021-1038`; `apps/api/src/lyric_service.ts:27-83`,
  `apps/api/src/speech.ts:13-83`; `apps/api/src/web_storage.ts:207-218`,
  `web_storage.ts:431-469`, `web_storage.ts:553-579`;
  `apps/web/src/App.tsx:713-875`.
- **Entry points and blast radius:** Browser lyric/chat and render actions cross
  the API, owner entitlement, provider credentials, text/Speech budgets, and
  persisted attempt/output state.
- **Candidate symbols:** `lyric_available`, `paid_lyric_backend`,
  `LyricWriter.write`, `reserve_lyric_action`, `render_inputs`,
  `reserve_paid_run`, `AzureSpeech.synthesize`, `reconcile_attempt`,
  `generateLyrics`, `chatAction`, `startPaidRender`.
- **Questions for deeper review:** Are consent and entitlement rechecked at the
  server boundary for each billable path? Do reservation, provider-failure,
  unknown-usage, retry, and reconciliation states remain consistent across
  storage and UI recovery?

#### 3 — data

- **Summary:** Trace backend selection, transaction semantics, owner-bound
  records/media, store validation, and migration lifecycle.
- **Supporting references:** `apps/api/src/persistence.ts:111-175`,
  `persistence.ts:260-275`; `apps/api/src/web_storage.ts:100-229`,
  `web_storage.ts:423-588`; `apps/api/src/cloud_web.ts:99-136`;
  `apps/api/src/bootstrap_database.ts:100-119`,
  `bootstrap_database.ts:209-271`.
- **Entry points and blast radius:** Cloud startup selects PostgreSQL or local
  SQLite before the web worker accepts traffic; operator initialization/import
  crosses the SQL schema, source databases, and media files.
- **Candidate symbols:** `database_url_from_environment`,
  `validate_postgres_store`, `WebStorage`, `transaction`,
  `prepare_databases`, `initialize_fresh`, `import_sqlite`,
  `upgrade_postgres_store`, `save_output`, `audio_path`,
  `reconcile_attempt`.
- **Questions for deeper review:** Are the SQLite and PostgreSQL transaction,
  schema, and JSON contracts equivalent where callers rely on them? Are
  initialization/import/upgrade boundaries consistent with markers, source
  preservation, ownership, and media references?

#### 4 — deployment

- **Summary:** Follow deployment configuration and approval gates through
  infrastructure provisioning, database connectivity, container startup, and
  the separate database bootstrap workflow.
- **Supporting references:** `azure.yaml:1-20`; `infra/platform.bicep:59-116`,
  `platform.bicep:147-200`, `platform.bicep:249-351`;
  `infra/postgresql.bicep:23-98`, `infra/service.bicep:63-168`;
  `.github/workflows/deploy-web.yml:107-126`,
  `.github/workflows/bootstrap-web.yml:48-98`;
  `scripts/deployment_gate.ts:139-291`,
  `scripts/initialize_deployment.ts:49-200`,
  `Dockerfile.web:1-37`.
- **Entry points and blast radius:** Manual GitHub workflows invoke azd,
  inventory/maintenance scripts, Bicep, image build, and an isolated private
  initializer. These paths affect Azure identity and secret references,
  networking, service availability, and persistent data.
- **Candidate symbols:** `deployment_target`, `verify_private_network`,
  `run`, `initialize_deployment`, `main` in `cloud_web.ts`, Bicep `platform`,
  `postgres`, and `web` modules.
- **Questions for deeper review:** Do workflow inputs and environment variables
  satisfy the gates consumed by scripts and Bicep? Are quiesce/resume and
  initialization cleanup behaviors aligned with the single-writer/data-reset
  boundaries documented for operators?

#### 5 — integration

- **Summary:** Compare browser/API contracts with in-process MCP calls,
  standalone MCP entry points, platform scaffold, and operator-facing service
  documentation.
- **Supporting references:** `apps/web/src/App.tsx:685-794`,
  `apps/web/src/api.ts:25-110`; `apps/api/src/web_app.ts:613-820`;
  `apps/api/src/jingle_tools.ts:31-82`,
  `apps/api/src/lyric_mcp.ts:13-63`,
  `apps/api/src/melody_mcp.ts:16-77`,
  `apps/api/src/platform_service.ts:18-157`;
  `docs/service-contracts.md:8-15`, `service-contracts.md:79-140`.
- **Entry points and blast radius:** React actions call the same-origin
  Express API; the API delegates selected chat/lyric/arrangement operations to
  MCP tools. CLI, standalone MCP, and platform-service entry points are
  additional consumers of shared domain code and contracts.
- **Candidate symbols:** `apiJson`, `apiBlob`, `registerWebRoutes` (route
  registration in `web_app.ts`), `JingleTools.discuss`, `JingleTools.write`,
  `JingleTools.compose`, `lyric_mcp.create_server`,
  `melody_mcp.create_server`, `platform_service.create_mcp`,
  `platform_service.create_app`.
- **Questions for deeper review:** Which MCP and platform paths are active
  production interfaces versus local/scaffold interfaces? Do documented
  transport, payload, status, and persistence expectations match each caller
  and server contract?

#### 6 — validation

- **Summary:** Map the declared automated checks to cross-boundary behavior and
  determine what the current test/build commands exercise.
- **Supporting references:** `package.json:8-22`,
  `apps/api/vitest.config.ts:3-8`, `apps/api/tests/web_auth.test.ts:45-206`,
  `apps/api/tests/web_app.test.ts:99-1056`,
  `apps/api/tests/storage.test.ts:80-357`,
  `apps/api/tests/storage-admin.test.ts:28-326`,
  `apps/api/tests/deployment.test.ts:132-306`,
  `apps/api/tests/initialize-deployment.test.ts:121-277`,
  `apps/web/src/App.test.tsx:282-884`.
- **Entry points and blast radius:** Root scripts orchestrate workspace
  typecheck, build, and tests; API tests use Vitest, while the React test suite
  exercises browser-facing workflows. This validation surface spans auth,
  persistence, paid behavior, UI, and operations.
- **Candidate symbols:** root `typecheck`, `build`, `test`, `test:api`,
  `test:web`; `create_app`; `WebStorage`; deployment `run`; React `App`.
- **Questions for deeper review:** Which high-level invariants are exercised
  across both API and browser suites rather than in isolated unit paths? What
  validation is represented by declared commands, and what remains a manual
  deployment or data-cutover check?

## Confirm before dispatch

The user confirmed the factual orientation, all six board areas, and
comprehensive depth on 2026-11-19. The perspective batch now covers functional,
standards, accessibility, security, and readiness; the board remains the
navigation map for findings.
