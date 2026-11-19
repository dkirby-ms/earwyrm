<!-- markdownlint-disable-file -->
# Task Research: Access Request and Approval Flow

| Field              | Value        |
|--------------------|--------------|
| Date               | 2026-11-18   |
| Researcher / agent | rpi-research |
| Output mode        | convergence  |

## Executive Summary

* Bottom line: The reported screen is for a user who has signed in to Entra External ID but is not enabled in the application. It displays issuer and subject. Admins must manually enter the subject to enroll someone, although admin authorization is checked at both API and storage layers.
* Why this matters: A dedicated request queue can replace technical details and manual identity entry while reusing verified token identity and existing admin checks.
* Research status: Complete; current behavior, authorization, schema setup, and import contracts are verified.
* Confidence and uncertainty: High confidence in the evidence-backed flow and recommended direction. Product copy and any future request-history/audit requirements remain implementation choices within the plan.

## What You May Not Know

The screen follows a successful Entra sign-in and a failed application-access check; "unauthenticated" here means not authorized for the app. An access request can be tied to the verified issuer and subject without asking the user to type either value. SQLite creates the web schema through its local initialization path, while PostgreSQL startup validates an explicitly initialized schema and its additive upgrade is operator-controlled.

## Findings

### The denial screen is for a signed-in identity that lacks application access

The web app obtains `/api/identity` before `/api/access`. When access is denied after sign-in, the application-access-required panel renders the issuer and subject. The user-facing screen does not currently offer an access request action.

* Questions: Q1, Q2
* Evidence state: evidence-backed finding
* Evidence: C1 and C5 establish the identity-then-access call sequence; C6 and C10 establish the signed-in denial screen and its issuer/subject display.
* Confidence and limits: High confidence in the current flow. A user without a valid signed-in token sees the separate sign-in panel; the issuer and subject are shown only after identity is acquired and application access is denied.

### Admin access management requires manual subject entry but has layered authorization

The admin UI asks for a verified subject and offers permission checkboxes. Both admin routes require API scopes, and storage rechecks that the acting user is an enabled admin before listing or updating users. The update also restricts target users to the store's configured issuer.

* Questions: Q3, Q4
* Evidence state: evidence-backed finding
* Evidence: C7 and C8 show the editor and API gates; C9 shows the transactional storage checks; C11 shows API tests for unauthorized members, malformed permission payloads, and admin revocation.
* Confidence and limits: High confidence in the observed admin path. Research will inspect whether adding a request queue can preserve these gates and the deployment's schema initialization contract.

### A separate request lifecycle is needed and PostgreSQL rollout must not depend on paid-lyrics configuration

The existing user table records only enabled/admin/paid-Speech permissions; it has no pending or denied state. A distinct request record is needed to show the admin a queue and preserve a denial decision. SQLite invokes the idempotent web schema creation path during storage initialization. PostgreSQL does not initialize its schema at app startup; the web supervisor runs the additive upgrade only when `LYRIC_ENABLED` is true, otherwise it validates the existing schema. SQLite-to-PostgreSQL import validates and copies only tables enumerated in its schema contract. A new request table therefore needs deliberate treatment in local initialization, fresh PostgreSQL initialization, unconditional additive PostgreSQL upgrade, validation, and import compatibility.

* Questions: Q5
* Evidence state: partially supported claim
* Evidence: C3, C7, and C16 show the existing user and admin UI schema has no request lifecycle; C12 identifies local SQLite initialization; C13 identifies the PostgreSQL upgrade's lyric-only scope; C14 confirms the supervisor's lyric-config gate and tests; C15 identifies the import table whitelist and optional legacy lyric tables.
* Confidence and limits: High confidence about schema ownership and current upgrade scope. Existing SQLite databases predating this feature will not contain request history, so import should accept a missing request table as an old-schema case and copy it when present.

## Recommendation and Alternatives

* Recommendation or decision state: Add a dedicated access-request lifecycle, derive requester identity from the verified token, and expose request review and grant/deny actions only through the existing admin boundary.
* Rationale: The current user-permission row cannot distinguish pending requests, denied requests, and provisioned-disabled accounts. A separate lifecycle directly fits the requested queue while preserving existing admin authorization (C5-C9, C16-C17).
* What could change this result: A requirement to avoid request-history storage or to delegate access decisions to a separately governed identity-provider workflow.

| Option                                      | Benefits                                      | Costs and risks                                             | Evidence       | Disposition |
|---------------------------------------------|-----------------------------------------------|-------------------------------------------------------------|----------------|-------------|
| Dedicated request lifecycle and admin queue | Distinguishes pending/denied; supports user status; no manual subject entry | Requires schema upgrade, import compatibility, and new API/UI tests | C5-C9, C12-C17 | Recommended |
| Reuse disabled application-user rows        | Less request-specific storage                 | Cannot distinguish requested, denied, or operator-disabled accounts | C7, C16 | Rejected |
| Keep manual enrollment or change identity-provider workflow | No new app request lifecycle | Does not provide the requested in-app queue; provider change is out of scope | C7, C16 | Rejected |

## Scope and Questions

* Goal: Research an access request and admin decision flow within the existing application.
* Audience and use: Unauthenticated users seeking access, administrators reviewing requests, and maintainers planning implementation.
* In scope: Existing signed-in but app-unauthorized experience; API authentication and authorization; admin access-management UI; persistence and schema patterns; relevant tests.
* Out of scope: Identity-provider reconfiguration, unrelated role-system redesign, deployment changes, and unrelated application features.
* Decision and evidence criteria: The request must be tied to the verified token identity without accepting a client-supplied subject; only authorized admins can review and decide; the UI presents plain-language status and does not expose identity-provider technical details; decisions must follow existing authorization and persistence patterns.
* Requested output: Evidence-backed implementation recommendation and planning readiness.

| ID | Question                                                                | Source   | Status   |
|----|-------------------------------------------------------------------------|----------|----------|
| Q1 | What does an unauthenticated or unauthorized user currently see?        | Inferred | Answered |
| Q2 | How are access decisions and identity subjects currently represented?   | Inferred | Answered |
| Q3 | How does the existing admin page authorize and perform access changes?  | Inferred | Answered |
| Q4 | What security invariants must a request-and-decision flow preserve?     | Inferred | Answered |
| Q5 | Which persistence, migration, API, UI, and test patterns fit the change? | Inferred | Answered |

## Decisions and Feedback

| Group | Decision or feedback item | Status    | Owner      | Rationale or input needed | Evidence       | Impact of answer |
|-------|---------------------------|-----------|------------|---------------------------|----------------|------------------|
| D1    | Derive requester identity from the verified token, never a submitted subject | Confirmed | Evidence   | Token validation and the current identity route provide exact issuer and subject | C5, C6, C8 | Prevents identity spoofing and avoids asking users to type identifiers |
| D2    | Keep request decisions behind the existing enabled-admin checks | Confirmed | Constraint | Admin-only list/update checks exist at API and storage layers | C8, C9, C11 | Required security boundary |
| D3    | Store requests separately from application permission records | Confirmed | Evidence | Current user rows have no pending/denied lifecycle; a distinct record supports a queue | C7, C16, C17 | Gives admins a real queue and users a meaningful status without overloading roles |

## Risks and Open Questions

| Priority | Type          | Risk, question, or research item | Impact | Smallest action or evidence needed | Owner |
|----------|---------------|----------------------------------|--------|------------------------------------|-------|
| High     | Risk          | Request identity or admin decisions could trust browser-supplied identity/permissions | A caller could impersonate another person or grant themselves access | Derive identity from verified token; authorize admin routes and storage writes using current checks | Planning |
| High     | Risk          | PostgreSQL request table could be absent when lyrics are disabled | Access requests would fail or deployment validation would stop startup | Include request schema in an unconditional additive upgrade and required-table validation | Planning |
| Medium   | Open question | Whether denied users may resubmit and how long decision history is retained | Affects request lifecycle and admin queue behavior | Define idempotency, resubmission, and history expectations in the plan | Planning |
| Medium   | Risk          | Older SQLite imports do not have a new request table | Import could reject a valid older database or omit existing request history | Treat a missing table as legacy absence and import it when present | Planning |

## Planning Readiness and Next Step

| Field                            | Record |
|----------------------------------|--------|
| Research disposition             | executed, in progress |
| Decision participation           | agent-owned; selected end-to-end RPI mode |
| Planning Readiness               | Ready; token-derived identity, existing admin gates, and all database lifecycle paths are identified. The plan must include unconditional PostgreSQL upgrade, schema validation, and backward-compatible import handling. |
| Research depth and helpers       | Cycle 1 complete: Wider, Deeper, and Contrarian; no helpers dispatched |
| Blockers                         | None |
| Output mode and planning support | convergence; supports planning when readiness is Ready |
| Continuation owner               | confirmed automatic RPI Agent |
| Required gates or confirmations  | Standard plan critique; no exceptional confirmation required for research or planning |
| Next action                      | Transition automatically to Plan and draft the access-request implementation plan |
| Primary evidence file            | .copilot-tracking/research/2026-11-18/access-request-approval-flow-research.md; date from current session |

## Research Record

### Method and Boundaries

| Field                            | Record |
|----------------------------------|--------|
| Research posture and provenance  | balanced; default, because adjacent auth and persistence behavior may materially affect the design |
| Helper lane effort               | auto; no user-set effort |
| Completion basis                 | Cover the request, establish current security and persistence contracts, and complete Wider, Deeper, and Contrarian waves |
| Explicit limits or deadline      | None supplied |
| Codebase and external scope      | Existing access UI, auth, API, persistence, and tests; no external scope planned |
| Initial candidate areas          | apps/web/src/App.tsx, apps/web/src/auth.ts, apps/api/src/web_auth.ts, apps/api/src/web_app.ts, persistence modules, auth/admin tests |
| Evidence root                    | .copilot-tracking; repository root per tracking instructions |
| Constraints and excluded sources | Read-only research; no identity-provider reconfiguration, unrelated role redesign, or deployment work |
| Prior knowledge                  | No matching RPI state or research artifact found; other session artifacts are unrelated and not reused |

### Extensions and Participation

#### Extension Registry

| Kind        | Candidate                                  | Provenance and scoped contract | Selected or skipped reason |
|-------------|--------------------------------------------|--------------------------------|----------------------------|
| Instruction | copilot-tracking.instructions.md           | Applies to research artifact and RPI state | Selected; defines artifact and state locations |
| Instruction | copilot-tracking-location.instructions.md  | Applies to tracking files | Selected; tracking root and ignored-file discovery |
| Instruction | markdown.instructions.md                   | Applies to research Markdown | Selected; format and readability |
| Instruction | writing-style.instructions.md              | Applies to research Markdown | Selected; reader-facing tone |
| Instruction | typescript-doc-comments.instructions.md    | Applies to code being researched | Selected; relevant only if implementation changes reusable TS declarations |
| Skill       | rpi-research                               | Parent-selected Research phase | Selected; owns research process and artifact |
| Skill       | accessibility                              | Accessibility framework assessment | Skipped; this task does not request a standards assessment |
| Skill       | impeccable                                 | Frontend design critique and UI production | Skipped; the requested scope is a focused access workflow, not a broader design exercise |

#### Direction and Participation Log

| Checkpoint or change | Question, direction, or rationale | Answer or no-interaction reason | Result and revalidation effect |
|----------------------|-----------------------------------|---------------------------------|--------------------------------|
| Mode selection       | How should this RPI session progress? | User selected “Handle it end to end” | Automatic progression through Review; phase decisions agent-owned by default |
| Research intake      | Is clarification needed to investigate the requested flow? | No; user named the problem and desired unauthenticated and admin outcomes | Proceed within existing app auth/admin boundaries; revisit only if evidence reveals a material unsupported choice |

### Research Cycle Log

#### Cycle 1

* Active posture, controls, and limits: Balanced; user scope is the access-request and admin grant/deny flow.

##### Wave 1: Wider

* Focus and questions: Locate the unauthenticated UI, auth identity claims, admin access page, authorization checks, storage, and tests.
* Evidence: Search results C1-C4 located the access screen, identity/access routes, storage admin checks, and existing tests.
* Reflection: The screen is not an unauthenticated browser state. It is an authenticated Entra identity denied application access. The admin update API already has two layers of authorization. Deeper work should focus on durable request state and database rollout rather than replacing the auth boundary.

##### Wave 2: Deeper

* Focus and questions: Verify identity claims and route order, admin enforcement at API and storage, current denial/admin tests, and all required schema initialization or upgrade paths.
* Evidence: C5 confirms `loadWorkspaceData` calls `/api/identity` before `/api/access`; C6 confirms the access panel renders the issuer and subject only after a denied application-access lookup; C7 confirms the admin UI requires manual issuer/subject entry; C8 confirms API scopes on admin routes and `identity(response)` for actor identity; C9 confirms storage transactionally rechecks enabled-admin status before listing/updating; C10 confirms the denied-access UI test signs in before checking the panel; C11 confirms API tests deny non-admins and re-check admin loss.
* Reflection: Request submission can rely on token-derived identity rather than client-entered identity. Admin decisions can reuse the existing storage check. A new table is straightforward for fresh/local schemas but is not automatically covered by the current PostgreSQL lyric upgrade; the supervisor only runs that upgrade when lyrics are enabled. The access table must be added to the unconditional schema-upgrade path and the import contract must handle old SQLite stores that do not have it.

##### Wave 3: Contrarian

* Focus and questions: Determine whether the existing disabled-user list can express pending and denied requests, whether there is already a request endpoint, and whether the app can accept a request without valid identity.
* Evidence: C16 confirms `application_users` contains only permission flags and `get_user` returns null for an unregistered exact identity; the web route registry and searches across apps/docs show no request endpoint or queue. C17 confirms requests without a valid bearer token are rejected by `require_scope`, so the request button belongs after successful identity acquisition, not on a truly signed-out page.
* Reflection: Reusing a disabled user row would not record whether access was requested, denied, or merely provisioned off; it cannot provide reliable status or a review queue. The app must require sign-in first to associate the request with verified issuer/subject. A dedicated request record is the supported direction. No in-scope counter-evidence changes the recommendation.

##### Synthesis and Re-entry

| Material or claim | Evidence | Disposition | Rationale | User-facing effect |
|-------------------|----------|-------------|-----------|--------------------|
| The access-denied UI is shown after successful sign-in and displays issuer/subject | C5, C6, C10 | Accepted | Sequence, UI, and regression test agree | Clarifies the exact target state |
| Admin update currently requires manually entering a subject | C7 | Accepted | The form is bound to the `userDraft.subject` input | Confirms admin workflow pain |
| Admin access changes are guarded at API and storage layers | C8, C9, C11 | Accepted | Endpoint scopes and transactional admin checks are tested | Preserve these checks in any request decision API |
| Reusing disabled user records cannot distinguish requests, denials, and provisioned-disabled accounts | C7, C16 | Rejected | Existing record shape has no request or decision state | Use separate request storage |
| Request submission without sign-in cannot be linked to a verified app identity | C17 | Rejected | API requires a valid token with delegated scope | Put the request action on the signed-in access-denied view |
| Dedicated request lifecycle with existing admin protection is the best-fit direction | C5, C8, C9, C12-C15 | Accepted | Matches user intent and preserves current security; migration work is bounded and identifiable | Proceed to planning |

* Another complete three-wave cycle needed: No.
* Trigger or stop basis: All user questions are answered from current app, auth, persistence, bootstrap, import, and test sources; remaining lifecycle choices can be resolved in the implementation plan.
* Readiness or revalidation effect: Planning Readiness is Ready; no evidence gap blocks a plan.

### Evidence Log

* Helpers: None.

| ID  | Claim or finding | Source or location | Retrieved and version | Tool | Confidence | Notes |
|-----|------------------|-------------------|-----------------------|------|------------|-------|
| C1  | Access-denied view and issuer/subject fields exist | apps/web/src/App.tsx `App` | not applicable | search | Medium | Initial symbol/string search |
| C2  | Access lookup and admin list/update routes exist | apps/api/src/web_app.ts `create_web_app` | not applicable | search | Medium | Initial route search |
| C3  | Storage admin list/update methods exist | apps/api/src/web_storage.ts `list_users_as_admin`, `set_user_as_admin` | not applicable | search | Medium | Initial storage search |
| C4  | UI tests cover denied access and admin user updates | apps/web/src/App.test.tsx | not applicable | search | Medium | Initial test search |
| C5  | Web app reads signed-in identity before application access | apps/web/src/App.tsx `loadWorkspaceData` | not applicable | read | High | Direct call sequence |
| C6  | App access denial retains identity and renders issuer/subject | apps/web/src/App.tsx `Application access required` panel; apps/api/src/web_app.ts `/api/access` | not applicable | read | High | Identity endpoint succeeds before access endpoint can return 403 |
| C7  | Admin editor requires manual subject entry and permission selection | apps/web/src/App.tsx `Manage application access` | not applicable | read | High | Subject is editable; issuer is read-only |
| C8  | Admin list/update routes require scoped API authorization | apps/api/src/web_app.ts `authorized`, `/api/admin/users` | not applicable | read | High | Route and API scope checks |
| C9  | Storage rechecks enabled-admin status in the listing/update transaction | apps/api/src/web_storage.ts `require_admin`, `list_users_as_admin`, `set_user_as_admin` | not applicable | read | High | Admin check occurs in same storage write lock/transaction |
| C10 | UI test signs in and then expects the denied access panel | apps/web/src/App.test.tsx `shows an access error and the verified identity when enrollment is denied` | not applicable | read | High | Confirms authenticated-but-unenrolled behavior |
| C11 | API tests reject non-admin access and cover admin revocation | apps/api/tests/web_app.test.ts `enforces scope, exact issuer and live application admin checks for user management` | not applicable | read | High | Tests non-admin rejection, exact issuer, scope, and live admin check |
| C12 | Local SQLite storage runs idempotent web schema creation | apps/api/src/web_storage.ts `_initialize`, `_create_schema` | not applicable | read | High | Web table creation is part of local storage initialization |
| C13 | Current PostgreSQL additive upgrade creates lyric tables only | apps/api/src/bootstrap_database.ts `upgrade_postgres_store` | not applicable | read | High | Upgrade validates existing store then creates lyric schema and budget tables |
| C14 | PostgreSQL upgrade runs only when lyric configuration is enabled | apps/api/src/cloud_web.ts `prepare_databases`; apps/api/tests/cloud_web.test.ts `upgrades PostgreSQL before starting the worker` | not applicable | read | High | Tests confirm false/unset does validate only |
| C15 | SQLite import table contract is explicit and older lyric tables are optional | apps/api/src/bootstrap_database.ts `WEB_TABLE_COLUMNS`, `import_sqlite` | not applicable | read | High | New table needs import compatibility decision |
| C16 | Existing application-user rows have permission flags but no request lifecycle; missing identity lookup returns null | apps/api/src/web_storage.ts `_create_schema`, `get_user`; apps/web/src/App.tsx `Manage application access` | not applicable | read | High | Disabled row cannot distinguish pending, denied, or operator-provisioned |
| C17 | API identity and request routes require valid bearer token and delegated scope | apps/api/src/web_auth.ts `require_scope`; apps/api/src/web_app.ts `identity` | not applicable | read | High | A request must follow Entra sign-in to use verified identity |

#### Contradictions and Conflicts

* None identified.

### Artifact Self-Check

* [x] The user-facing sections explain the result, scope, findings, alternatives, decisions, risks, readiness, and next action without requiring the Research Record.
* [x] Every question is answered or names the smallest missing evidence, and every material result has one canonical evidence state.
* [x] Findings keep their explanation, supporting detail, evidence state, confidence basis, and counter-evidence together.
* [x] Every codebase finding has a `C#` ID and workspace-relative path with a heading or symbol; no external evidence was needed.
* [x] The executed cycle records Wider, Deeper, and Contrarian waves in order, reflections, dispositions, synthesis, and an evidence-based re-entry decision.
* [x] Method, posture and provenance, candidate areas, evidence root, constraints, extensions, participation, helper lanes, and prior-knowledge treatment are recorded with their limits.
* [x] Convergence selects and justifies one recommendation.
* [x] Decision groups, participation mode, and provenance are recorded; agent-owned decisions have evidence-backed rationales.
* [x] Research disposition, Planning Readiness, blockers, continuation owner, gates, next action, and residual uncertainty are recorded.
* [x] The stop basis is documented, untrusted content remained inert, no secrets were recorded, and the research-only write boundary held.
* Checked sections: All sections.
* Missing or limited sections: None.
