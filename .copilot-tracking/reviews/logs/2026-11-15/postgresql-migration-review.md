<!-- markdownlint-disable-file -->
# Review: PostgreSQL migration

## Executive Summary

* Assessment: P01-P05 were compared against FR-001 through FR-007, NFR-001 through NFR-005, the resolved plan critique, implementation evidence, and recorded validation. Two P05 implementation gaps remain: firewall rules can outlive a reduced allowlist, and an explicit connection URL can bypass verified TLS.
* Why this matters: Removed public addresses may retain database reachability, and a weakly configured URL can connect without certificate and hostname verification.
* Review execution: Complete.
* Assessed outcome: Defects found.
* Validation coverage: Prior PostgreSQL and SQLite regression evidence, authorization and browser checks, migration tests, deployment-gate tests, Bicep builds, lint, formatting, and whitespace checks were reviewed. P05's 22 PostgreSQL integration tests were skipped in the latest recorded run.
* Confidence and limitations: The source, plan, tests, and operating guidance establish both findings. Azure provisioning, deployed egress coverage, live database connectivity, and data cutover were not assessed.

The assessment above is the reviewer's proposal. Parent Decision Record contains the final decisions and next actions, or states that decisions are pending.

## What You May Not Know

This implementation includes infrastructure and release gates only. Azure resources remain unprovisioned, and actual vault, region, egress addresses, price, owner identity, and source data remain deployment-owner inputs.

## Findings and Proposed Routes

### RV-001 [Medium]: Reduced allowlists can leave obsolete firewall rules

P05-T01 requires PostgreSQL reachability to remain restricted to the current
verified IPv4 allowlist. The Bicep loop names firewall rules by list index.
Azure incremental deployments retain resources omitted from the next template,
so shortening the list does not remove higher-index rules. The deployment gate
validates the submitted list but does not inspect or reconcile existing
PostgreSQL firewall rules. An address removed by an operator can therefore
continue reaching the public database endpoint.

* Related scope: P05-T01, FR-007, NFR-002
* Expected behavior: After an approved allowlist update, only currently
  approved addresses retain firewall access.
* Observed behavior and evidence: infra/postgresql.bicep creates
  `container-app-egress-${index}` resources from the current list.
  scripts/deployment_gate.py validates input syntax and the selected vault
  secret but does not inventory firewall rules. docs/azure-deployment.md
  directs operators to recheck the list when egress changes but does not
  describe removal of obsolete rules. Microsoft documents that incremental
  deployments retain resources not specified in the template:
  https://learn.microsoft.com/azure/azure-resource-manager/templates/deployment-modes
* Impact: Addresses that are no longer approved may retain database network
  reachability after a deployment.
* Resolution condition: After an approved allowlist shrink or change, verify
  that the server firewall contains only the currently approved entries.
* Proposed destination: `rpi-implement`
* Smallest useful next action: Reconcile obsolete rules during allowlist
  updates and verify that removal works without affecting unrelated resources.

### RV-002 [Medium]: Explicit database URLs can bypass verified TLS

P05-T01 requires verified TLS, and NFR-002 requires invalid database
configuration to fail closed. The field-based connection path sets
`sslmode=verify-full` and a trusted CA bundle, but the supported
`EARWYRM_DATABASE_URL` path returns the supplied URL unchanged. It can omit
certificate verification or explicitly disable TLS, despite the operator guide
warning that URLs must require full verification.

* Related scope: P05-T01, FR-007, NFR-002
* Expected behavior: Every supported hosted PostgreSQL configuration enforces
  certificate and hostname verification or is rejected.
* Observed behavior and evidence: audio_poc/persistence.py,
  `database_url_from_environment`, returns an explicit URL without validating
  its TLS mode or CA. docs/audio-poc/web-app.md says operator URLs must use
  `sslmode=verify-full`, but the application does not enforce that instruction.
  tests/test_postgres_storage.py verifies TLS for field-based settings and
  ambiguity rejection, but does not test weak or missing TLS settings in a URL.
  infra/service.bicep uses the safer field-based path in the deployed
  configuration.
* Impact: A URL-based hosted configuration can connect without the required
  certificate and hostname checks, exposing database credentials and traffic
  to interception on an untrusted network path.
* Resolution condition: The hosted application cannot establish a PostgreSQL
  connection through a URL unless full certificate and hostname verification
  with a trusted CA is effective; invalid URL configurations fail closed.
* Proposed destination: `rpi-implement`
* Smallest useful next action: Enforce the verified-TLS requirement for
  supported URL configuration and test missing and weaker TLS settings.

## Parent Decision Record

### Current Disposition

* Based on events: RD-001 through RD-015.
* Review execution: Complete.
* Final outcome: Defects found in the original review; follow-up implementation
  evidence resolves both repository gaps without running a second Review.
* Finding decisions and next actions: RV-001 and RV-002 were accepted for
  implementation and are resolved in the repository. Live Azure inventory and
  database connectivity remain deployment-owner validation gates.
* Decisions still needed: None for the approved repository scope. The React/Vite
  child completed P07-P09 without legacy-data migration; its implementation and
  current regression validation satisfy the selected follow-up. No required
  repository follow-ups remain.
* Session acceptance: Repository work is complete; stop the automatic session.
  Child fixes and React/Vite changes were validated, not reviewed again. Live
  Azure, Entra, paid Speech, and database connectivity remain outside this
  acceptance and require separate authorization and deployment evidence.

This summary is derived from Decision History, not a second decision record. The latest event for each subject governs; refresh this summary after appending decisions and on recovery.

### Decision History

| Event  | Subject                      | Decision source                    | Status or value | Proposed destination | Final destination | Owner   | More information needed | Smallest next action | Rationale |
|--------|------------------------------|------------------------------------|-----------------|----------------------|-------------------|---------|-------------------------|----------------------|-----------|
| RD-001 | Review decision participation | Confirmed automatic RPI session    | agent-owned     | none                 | none              | RPI parent | none                  | Compare supplied evidence | Automatic session owns Review decisions. |
| RD-002 | Review execution              | RPI Review phase                   | started         | none                 | none              | RPI parent | none                  | Complete one evidence-comparison pass | Full plan implementation markers are complete. |
| RD-003 | Review item walkthrough       | RPI Review phase                   | skipped-auto    | none                 | none              | RPI parent | none                  | Apply evidence-based route decisions | Agent-owned participation does not require per-finding questions. |
| RD-004 | RV-001 route                  | RPI parent                         | accepted        | rpi-implement        | rpi-implement     | Automatic RPI | none                 | Reconcile obsolete PostgreSQL firewall rules | An allowlist shrink can leave higher-index rules in an incremental deployment. |
| RD-005 | RV-002 route                  | RPI parent                         | accepted        | rpi-implement        | rpi-implement     | Automatic RPI | none                 | Enforce verified TLS for URL configuration | The explicit URL path bypasses the verified field-based connection settings. |
| RD-006 | Review execution              | RPI parent                         | Complete        | none                 | none              | RPI parent | none                  | Route accepted implementation findings | P01-P05 and their material evidence were assessed. |
| RD-007 | Final outcome                 | RPI parent                         | Defects found   | none                 | none              | RPI parent | none                  | Carry RV-001 and RV-002 to implementation | Both findings are supported by the implementation and acceptance basis. |
| RD-008 | Continuation                  | RPI parent                         | implementation follow-up first | rpi-implement | rpi-implement | Automatic RPI | none | Resolve RV-001 and RV-002, then start `react-vite-web` Research | The accepted P05 defects should be resolved before the separately requested web migration proceeds. |
| RD-009 | Follow-up selection           | Automatic RPI session              | selected        | postgresql-review-fixes | postgresql-review-fixes | Automatic RPI | none | Start child Research for RV-001 and RV-002, then Plan and Implement | The two accepted findings are required in-scope work; resolving them first prevents the React/Vite child from bypassing open acceptance gaps. |
| RD-010 | RV-001 implementation resolution | Automatic RPI Follow-up | resolved-in-repository | rpi-implement | complete | Automatic RPI | Live Azure inventory remains untested | Verify exact rule inventory during an approved deployment | The workflow reconciles and verifies app-owned rules; 29 mocked deployment-gate tests passed. No live Azure operation was authorized. |
| RD-011 | RV-002 implementation resolution | Automatic RPI Follow-up | resolved-in-repository | rpi-implement | complete | Automatic RPI | Live PostgreSQL TLS connection remains untested | Verify connectivity during an approved deployment | Remote URLs enforce `verify-full` and a trusted CA; planned tests passed. 22 database integration tests skipped because `EARWYRM_TEST_DATABASE_URL` is unset. |
| RD-012 | Follow-up selection | Automatic RPI session | selected | react-vite-web | react-vite-web | Automatic RPI | none | Start Research for the React/Vite rewrite without migrating legacy data | The user requested the new version and clarified that this POC does not need existing-data migration. |
| RD-013 | Continuation | Automatic RPI session | child selected | react-vite-web | Research | Automatic RPI | none | Create state .copilot-tracking/rpi-sessions/2026-11-15/postgresql-migration/react-vite-web-state.json and Research artifact .copilot-tracking/research/2026-11-15/react-vite-web-research.md | Start a distinct React/Vite task after resolving RV-001 and RV-002; Research will establish the backend boundary without a legacy-data migration. |
| RD-014 | React/Vite follow-up resolution | Automatic RPI recovery and Follow-up, 2026-11-15 | completed-and-validated | react-vite-web | complete | Automatic RPI | No live-system validation; child Review skipped by default | Close the stale continuation projections | .copilot-tracking/plans/2026-11-15/react-vite-web-plan.md marks P07-P09 complete; .copilot-tracking/changes/2026-11-15/react-vite-web-changes.md records the src layout, React workflows, same-origin production integration, Docker runtime-content check, and MSAL checksums. On resume, the frontend build/typecheck and 3 interaction tests passed; the Python suite passed with 271 passed and 27 skipped using env -u EARWYRM_TEST_DATABASE_URL; Ruff check/format, uv lock --check, and git diff --check passed. No implementation files changed during recovery. |
| RD-015 | Session acceptance and continuation | User requested previous work and Handle it end to end; automatic Follow-up | repository-scope-complete | Follow-up | stop automatic session | Automatic RPI | Live deployment remains separately gated | No further repository action required | RD-010/RD-011 resolve both accepted findings, and RD-014 resolves the only selected remaining follow-up. The approved PostgreSQL repository work and React/Vite POC with src/audio_poc are complete without legacy-data import. Preserve the original Complete/Defects found assessment and the child Review skips; validation is not a new Review. Provisioning, tenant changes, live database use, and destructive data actions were not authorized or performed. |

## Validation Evidence

| Command or check | Scope | Status | Summary |
|------------------|-------|--------|---------|
| Bicep build of `main.bicep`, `platform.bicep`, `postgresql.bicep`, and `keyvault-secret-reader.bicep` | P05-T01 | Passed | All four compiled with no diagnostics. |
| P01-T01 PostgreSQL and SQLite integration/regression tests | P01-T01 | Passed | 76 targeted tests passed against an isolated PostgreSQL 16 container; concurrent transactions, storage failure, and melody job behavior were covered. |
| P02-T01 authorization and operator tests | P02-T01 | Passed | 103 targeted tests passed against isolated PostgreSQL and SQLite, including bootstrap, issuer binding, replay, and paid-access revocation. |
| P03-T01 API and browser checks | P03-T01 | Passed | 106 targeted Python tests, two Node navigation tests, and mocked keyboard and interaction checks passed. No full assistive-technology assessment was recorded. |
| P04-T01 migration and regression tests | P04-T01 | Passed | 92 targeted PostgreSQL and regression tests passed against isolated PostgreSQL 16, including rollback, repeat-import rejection, and media preservation. |
| `uv run pytest -q tests/test_deployment_gate.py tests/test_postgres_storage.py` | P05-T01 | Passed with skips | 25 passed; 22 PostgreSQL integration tests skipped because `EARWYRM_TEST_DATABASE_URL` was not configured. |
| Targeted Ruff checks and formatting | P01-T01 through P05-T01 | Passed | Changed Python source and tests passed the recorded targeted checks. |
| `git diff --check` | Current worktree | Passed | No whitespace errors. |
| Live Azure provisioning, egress inventory, and database connectivity | P05-T01 | Skipped | Live cloud operations were outside the approved implementation scope; they remain deployment-owner gates. |

## Risks, Blockers, and Residual Work

* Blockers: None for the repository review. Live deployment remains blocked on owner-verified vault, region, cost, egress, and data inputs.
* Remaining active work: Resolve RV-001 and RV-002 through `rpi-implement`.
* Residual work: After the implementation findings are routed, the React/Vite browser migration and move to `src/audio_poc/` remain a separate child Research task named `react-vite-web`.

## Review Record

### Scope and Evidence

* Task ID: `postgresql-migration`
* Review date: 2026-11-15
* Review scope: Full task.
* Assessed boundary: Plan markers P01-P05, requirements FR-001 through FR-007 and NFR-001 through NFR-005, completed-work evidence, implementation-time updates, deployment and migration guidance, and recorded validation. Live resource behavior and cutover are excluded.
* Review depth and provenance: Standard; first-task default.
* Candidate identity: `postgresql-migration`, full-plan implementation; plan and changes evidence reconciled.
* Review execution: Complete.
* Helper use: None; the evidence was compared directly.
* Plan: `.copilot-tracking/plans/2026-11-15/postgresql-migration-plan.md`
* Plan critique: `.copilot-tracking/reviews/plans/2026-11-15/postgresql-migration-plan-critique.md`
* Changes: `.copilot-tracking/changes/2026-11-15/postgresql-migration-changes.md`
* Other evidence considered: `.copilot-tracking/research/2026-11-15/postgresql-migration-research.md`, targeted test and Bicep outputs, documentation, and changed source files.

### Opening Review State

* Interpreted review goal: Compare the completed PostgreSQL migration against its approved plan and determine acceptance and any required follow-up.
* Review scope: Full task.
* Evidence readiness: Plan, critique, research, changes record, and validation evidence are available. Live Azure evidence is intentionally unavailable.
* Acceptance basis: FR-001 through FR-007, NFR-001 through NFR-005, task-local requirements, four resolved plan-critique findings, and explicit deployment gates.
* First comparison boundary: Compare each plan marker with implementation, tests, documentation, and validation; do not infer live deployment success.
* Active read-only boundaries: Review may write this record and the defined RPI state projections; implementation and planning artifacts remain read-only.
* Authority: The review parent compares evidence and writes findings; final outcome, route dispositions, and continuation are recorded in Parent Decision Record.
* Initial blockers: None.

### Acceptance and Change Coverage

| Requirement or scope | Implementation and validation evidence | Assessment | Finding or rationale |
|----------------------|----------------------------------------|------------|-----------------------|
| FR-001, P01-T01: PostgreSQL persistence with local workflows | audio_poc/persistence.py, audio_poc/web_storage.py, audio_poc/melody_service.py, and audio_poc/cloud_web.py; 76 PostgreSQL/SQLite integration and regression tests recorded in the changes record. | Met | Both stores support PostgreSQL while the local SQLite paths remain available. |
| FR-002, NFR-001, P01-T01: owner isolation, paid ledger, serialization, and idempotence | `WebStorage.reserve_paid_run`, `MelodyService.submit`, and tests/test_postgres_storage.py; earlier PostgreSQL concurrency and regression validation is recorded in the changes record. | Met | The reviewed implementation preserves transaction-scoped serialization and tested retry behavior. |
| FR-003-FR-005, P02-T01: verified-owner bootstrap, access management, External ID, and paid safeguards | `WebStorage.bootstrap_owner`, `WebStorage.set_user_as_admin`, `authorized_scope` in audio_poc/web_app.py, and tests/test_user_access.py; 103 targeted tests recorded. | Met | Bootstrap is explicit, issuer-bound, and replay does not restore revoked access. |
| FR-004, NFR-004, P03-T01: protected browser administration and accessible interaction | `/api/admin/users` in audio_poc/web_app.py, audio_poc/web/index.html, audio_poc/web/app.js, and tests/test_web_navigation.cjs; 106 Python tests and two Node tests recorded. | Met with validation limit | Keyboard navigation, labels, errors, and permission reset were checked in a mocked browser session; no full assistive-technology assessment was performed. |
| FR-006, P04-T01: safe fresh initialization and SQLite import | `initialize_fresh`, `import_sqlite`, `validate_postgres_store`, and tests/test_postgres_storage.py; 92 targeted tests recorded against isolated PostgreSQL 16. | Met | Fresh and import paths are explicit; source media is retained and target changes roll back on import failure. |
| PC-001 through PC-004 critique dispositions | Plan P02-P05, changes record, and implementation evidence for bootstrap, allowlisting, secret lifecycle, and startup/import marker. | Resolved | The four planning gaps were corrected and their required behavior is represented in the implementation. |
| FR-007, P05-T01: Key Vault credential provisioning and runtime reference | infra/platform.bicep, infra/service.bicep, infra/keyvault-secret-reader.bicep, deployment gate, and docs/azure-deployment.md; Bicep builds passed. | Met for field-based deployment | The app uses the configured secret version through managed identity; explicit URL behavior is separately assessed under RV-002. |
| P05-T01, FR-007, NFR-002: allowlist updates remove obsolete access | infra/postgresql.bicep, scripts/deployment_gate.py, and docs/azure-deployment.md; no firewall reconciliation is implemented or validated. | Gap | RV-001: incremental deployment can retain rules omitted after the allowlist shrinks. |
| P05-T01, FR-007, NFR-002: verified TLS for every accepted database configuration | `database_url_from_environment` in audio_poc/persistence.py, URL guidance in docs/audio-poc/web-app.md, and tests/test_postgres_storage.py. | Gap | RV-002: explicit URLs are returned unchanged; only the separate-fields path is constructed with verified TLS. |
| NFR-005 and P05 release gates | .github/workflows/deploy-web.yml, scripts/deployment_gate.py, and docs/azure-deployment.md; no live provisioning was performed. | Met as a gate; live values not assessed | The guide requires owner verification of egress, region, and cost before provisioning; the values remain unknown. |
| Material plan updates and task sequencing | Plan follow-up, changes record implementation-time update, and RPI state. | Reconciled | React/Vite and `src/audio_poc/` remain outside PostgreSQL markers and are tracked as `react-vite-web`. P05 follows P04; no early follow-up implementation was recorded. |

### Critique and Follow-Up Assessment

* Latest critique dispositions: PC-001 through PC-004 are marked resolved in the plan. The implementation and validation evidence support the identity, migration, and secret-lifecycle corrections. PC-002's live egress verification remains an explicit deployment-owner gate, not evidence that live coverage was demonstrated.
* Material revisions: P02-T01 and P03-T01 define the owner and administrator lifecycle; P04-T01 defines explicit fresh/import startup; P05-T01 defines restricted public IPv4 access and coordinated secret rotation. These align with the confirmed direction. The React/Vite and `src/audio_poc/` changes remain a separate, user-confirmed follow-up.
* Dependent-work pause assessment: P05 depends on P01-P04 and the changes record marks those phases complete before P05. No evidence shows that the React/Vite follow-up began early.
* Justification assessment: The public-network design is an explicit single-address allowlist because the existing Container Apps environment has no customer VNet configuration. The all-Azure exception is rejected. Regional price, stable egress coverage, and live vault permissions remain owner checks before deployment.

| Follow-up item | Why outside immediate scope | Owner or next action | Assessment and route |
|----------------|-----------------------------|----------------------|----------------------|
| RV-001: firewall-rule reconciliation | It is a P05 implementation defect in the current accepted direction. | Automatic RPI parent; route to `rpi-implement`. | Accepted; complete before starting React/Vite Research. |
| RV-002: verified TLS for explicit URLs | It is a P05 implementation defect in the current accepted direction. | Automatic RPI parent; route to `rpi-implement`. | Accepted; complete before starting React/Vite Research. |
| React/Vite browser migration and Python move to `src/audio_poc/` | User confirmed it as a separate task; backend boundary requires Research. | Automatic RPI session; create child Research task `react-vite-web` after the accepted P05 findings are addressed. | Preserve as distinct follow-up; no React/Vite work is included in this review. |

Unresolved plan follow-up items remain distinct follow-up work. Do not treat them as defects or add them to active `Pxx` or `Pxx-Txx` implementation, completion, or acceptance scope.

### Reviewer Self-Check

* [x] Every supplied requirement, acceptance criterion, in-scope marker, material update, critique disposition, validation result, blocker, remaining item, and plan follow-up has an assessment or explicit gap.
* [x] Findings are substantive, evidence-grounded, severity-graded, and use stable `RV-xxx` IDs with expected and observed behavior, a resolution condition, and one proposed route each.
* [x] Execution status, assessed outcome, validation coverage, limitations, and proposed routes are complete and internally consistent.
* [x] The summary is scoped and advisory, findings keep their supporting context together, and acceptance coverage distinguishes demonstrated gaps from unassessed behavior.
* [x] Standard review assessed the material boundary while omitting restatement, cosmetic feedback, exhaustive strengths, low-impact suggestions, and continual narration.
* [x] The review did not mutate source, the plan, critique, research, or changes record, wrote only this record and the permitted parent-state projections, did not execute validation, and counted a requirement consistent only from a cited location.
* Checked boundary: Full plan requirements and markers, implementation updates, critique dispositions, validation, follow-up, and available deployment evidence.
* Missing or limited evidence: Live Azure provisioning, public egress coverage, regional price/availability, TLS connection to the deployed server, and live cutover remain unassessed.
