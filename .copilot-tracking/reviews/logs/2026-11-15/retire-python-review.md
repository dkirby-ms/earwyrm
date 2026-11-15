<!-- markdownlint-disable-file -->
# Review: Retire Python

## Executive Summary

* Assessment: supplied implementation and validation support full P01-P04 acceptance for the Python-free local app.
* Review execution: Complete
* Assessed outcome: Conformant
* Evidence readiness: all P01-P04 markers checked; implementation reports Complete and Review-ready with final validation.

Parent Decision Record contains final decisions when the comparison is complete.

## What You May Not Know

The user approved exact decimal strings for historical seeds above JavaScript's safe integer range; original database/media bytes are preserved. New TypeScript generation is deterministic but does not reproduce historical NumPy audio bytes. Node 24 and Linux util-linux are the supported private-store runtime. Live Azure deployment, production-mount behavior and paid provider effectiveness are outside authorized validation.

## Findings and Proposed Routes

No substantive findings identified within this acceptance boundary. No Critical, High, Medium or Low findings are adopted; validation limits remain explicit rather than being presented as demonstrated defects or production approval.

## Parent Decision Record

### Current Disposition

* Based on events: RD-001 through RD-007
* Review execution: Complete
* Final outcome: Conformant within the authorized local migration and documented compatibility boundary.
* Finding decisions and next actions: no actionable findings, required follow-ups or remediation routes; session accepted and stopped.
* Decisions still needed: none

### Decision History

| Event | Subject | Decision source | Status or value | Proposed destination | Final destination | Owner | More information needed | Smallest next action | Rationale |
|---|---|---|---|---|---|---|---|---|---|
| RD-001 | Participation | User-authorized automatic session | agent-owned; walkthrough skipped-auto | none | Review | Parent | none | Compare evidence | User selected Handle it end to end; no Review decision retention |
| RD-002 | Walkthrough | Agent under confirmed automatic mode | skipped-auto; no actionable findings | none | none | Parent | none | Decide execution/outcome | No per-item user decision is needed |
| RD-003 | Execution | Agent evidence comparison | Complete | none | none | Parent | none | Accept review execution | Every material requirement, update and validation limit has an assessment |
| RD-004 | Outcome | Agent evidence comparison | Conformant | none | none | Parent | none | Continue automatic acceptance assessment | 309 backend cases, frontend checks, final images and retirement scans support all scoped acceptance criteria |
| RD-005 | Routes | Agent | none required | none | none | Parent | none | Do not create optional work | No unresolved substantive finding or inherited required follow-up |
| RD-006 | Continuation | Agent under automatic scope | accept Review and proceed to Follow-up | Follow-up | Follow-up | Parent | none | Reconcile session acceptance and stop if met | No source changes occurred during Review; approved seed correction was validated before it |
| RD-007 | Session acceptance | Agent under confirmed automatic scope | accepted; stop automatic session | none | completed | Parent | none | No user action required | Full Python retirement, supported APIs/MCP/audio/stores, approved lossless seeds and local safety criteria have passing persistent evidence; no required findings remain |

## Validation Evidence

Review ran no new validation; these completed implementation results were reconciled.

| Command or check | Scope | Status | Summary |
|---|---|---|---|
| `npm test` with dedicated `EARWYRM_TEST_DATABASE_URL` | Eight backend test files | Passed | 309 cases, zero skips, after Python removal |
| `npm run typecheck`; `npm run build` | Full backend and scripts | Passed | Strict types and production ESM emit |
| Frontend `npm test -- --run`; `npm run build` | Existing Vite/React client | Passed | Three tests, frontend typecheck and production bundle |
| Actual MCP client sessions | Stdio, HTTP and in-memory transports | Passed | Typed tools, schema negotiation, binary resources, retries and exact oversized seeds |
| Actual offline CLI and contract CLI | Three fixtures and canonical catalog | Passed | 30-second PCM16/24kHz WAV, type-0 MIDI, pending provenance and parseable JSON |
| SQLite/PostgreSQL and process tests | Temporary private roots and uniquely named dedicated database schemas | Passed | Serialization, import, ownership, paid ledger, legacy seeds and unchanged source bytes |
| Both Docker builds and final runtime checks | Node platform and web images | Passed | UID10001, CA/flock, no Python binary, Vite client and guarded API; render role exits 2 |
| Browser setup-needed view | Actual compiled web image | Passed | Existing UI loads; configuration and protected routes remain fail-closed |
| Pinned container actionlint | Updated OIDC workflow | Passed | Container alternative used after host tool/Go were unavailable |
| Retirement scans | Application/scripts/tests and active docs/configuration | Passed | No application `.py`, retired layout/manifests absent, no obsolete active commands |
| Live Azure/identity/Speech/model and production mount | Remote production behavior | Skipped | Not authorized; paid spending, production data and deployment were not exercised |

## Risks, Blockers, and Residual Work

* Initial blockers: none
* Remaining active work: none; session accepted
* Residual work: none required within the authorized migration
* Limits: local tests do not attest production deployment or musical/rights approval. Historical source evidence names retired files; the source backup is retained outside the application. Canvas diagrams fall back to source and report historical-citation warnings without blocking the canonical record.

## Review Record

### Scope and Evidence

* Task ID: retire-python
* Review date: 2026-11-15
* Review scope: full task, P01-P04 and all seven tasks
* Assessed boundary: FR-001 through FR-006, NFR-001 through NFR-004, critique PC-001, approved precision extension and local retirement
* Review depth and provenance: standard; first-task default
* Candidate identity: retire-python after final Python removal and 309 passing backend checks
* Review execution: Complete
* Helper use: none; direct marker-driven comparison of current plan, changes, critique, implementation reports and validation
* Plan: .copilot-tracking/plans/2026-11-15/retire-python-plan.md
* Plan critique: .copilot-tracking/reviews/plans/2026-11-15/retire-python-plan-critique.md
* Changes: .copilot-tracking/changes/2026-11-15/retire-python-changes.md
* Other evidence: .copilot-tracking/research/2026-11-15/retire-python-research.md; final tool outputs and owner reports

### Opening Review State

* Interpreted review goal: confirm the app no longer needs Python while preserving supported API/MCP, creative, private-data and safety behavior.
* Review scope: full plan
* Evidence readiness: reconciled completion markers, completed-work entries, final tests/build/images and explicit validation limits.
* Acceptance basis: plan task Requirements, FR/NFR acceptance, PC-001 and user-confirmed oversized-seed representation.
* First comparison boundary: implementation acceptance and evidence consistency; not a new independent security audit or live production attestation.
* Active read-only boundaries: only this review record may change during Review.
* Authority: parent owns comparison, findings, outcome, routes and continuation.
* Initial blockers: none

### Acceptance and Change Coverage

| Requirement or scope | Implementation and validation evidence | Assessment | Rationale |
|---|---|---|---|
| P01-T01; FR-001, FR-002; NFR-001 | package.json, package-lock.json, tsconfig.json, tsconfig.build.json, vitest.config.ts; final strict build/typecheck | Met | Node 24 ESM and shared Zod ownership replace Python tooling without replacing the frontend package |
| P02-T01; FR-002, FR-003, FR-004; NFR-002, NFR-004 | src/dsp.ts, src/melody.ts, src/similarity.ts, src/speech.ts, src/lyrics.ts, src/lyric_cloud.ts, src/lyric_service.ts; creative tests and platform PCM/MIDI/CLI tests | Met | Native generation, bounded screening, speech/lyric safety and repeatable supported seeds have behavioral evidence; historical byte identity is explicitly excluded |
| P02-T02; FR-002, FR-005; NFR-001, NFR-003, NFR-004 | src/persistence.ts, src/sqlite_files.ts, src/web_storage.ts, src/melody_service.ts, src/bootstrap_database.ts; 58 storage tests, dedicated PostgreSQL and actual cross-process SQLite | Met | Data schemas, operator commands, ownership, transaction locks, budgets, imports and idempotency remain supported without shared/production-store access |
| P03-T01; FR-001, FR-002, FR-004, FR-005; NFR-001, NFR-003, NFR-004 | src/web_app.ts, src/web_auth.ts, src/cloud_web.ts; 57 web/auth tests, actual offline render/download/evaluation, real lifetime flock, image/browser checks | Met within local boundary | Existing API and frontend behavior, issuer/subject authorization and fail-closed setup/paid handling are covered; live tenant and mounted-cloud effectiveness are not claimed |
| P03-T02; FR-001 through FR-004; NFR-001, NFR-002, NFR-004 | src/contracts.ts, src/platform_service.ts, src/lyric_mcp.ts, src/melody_mcp.ts, src/render.ts, src/cli.ts; tests-ts/platform.test.ts and actual CLI/schema execution | Met | Actual protocols/resources work, pending rights remain pending, paid preflight blocks, and production scaffolds still explicitly refuse integration |
| P04-T01; FR-006; NFR-001, NFR-003, NFR-004 | Dockerfile, Dockerfile.web, azure.yaml, .github/workflows/deploy-web.yml, scripts/deployment_gate.ts, tests-ts/deployment.test.ts, directly related docs | Met | Node runtime images preserve original UID and lock/CA dependencies; offline negative gates and workflow lint pass without Azure mutation |
| P04-T02; FR-001 through FR-006; NFR-001 through NFR-004 | Final 309 backend cases after removal, frontend checks, final images/runtime, source/config scans and changes P04-T02 | Met | Replacements were validated before removal; original uncommitted source backed up outside app; private data and unrelated changes were not deleted |
| User-approved oversized-seed extension; FR-002, FR-005 | Shared Seed/parse_seed; lossless historical numeric-token recovery/import; real MCP max-string round trips; unchanged-source tests | Met | Exact decimal strings preserve oversized identities; safe numbers remain numeric; unsafe numeric input is rejected rather than rounded |
| Dependency staging and final acceptance gates | Plan P02/P03/P04 dependencies and changes Implementation-Time Plan Updates | Met | Independent source preparation was separated from acceptance; all integrated checks passed before Python removal |

### Critique and Follow-Up Assessment

* Latest critique: Complete/Pass; PC-001 was resolved by binding positional/options conventions, shared schemas, disjoint ownership and the final strict integration typecheck.
* Material revisions: the precision gap was exposed before source removal, explicitly approved by the user, implemented across generation/storage/MCP, and revalidated. No unapproved required behavior was weakened.
* Dependent-work pause: original Python remained until the corrected replacements and integration tests passed. Affected seed acceptance resumed only after the user decision.
* Business Alignment: none required; no BRD/PRD/ADR source is cited.
* Plan and changes follow-ups: none. Live deployment/paid verification remain outside authorized scope, not hidden completion blockers.

### Reviewer Self-Check

* [x] All supplied requirements, in-scope markers, material updates, critique disposition, validation, blockers, remaining work and follow-ups assessed.
* [x] No substantive finding was invented from a coverage limitation or cosmetic artifact issue.
* [x] Execution, proposed outcome, validation and limits are internally consistent.
* [x] Acceptance coverage distinguishes local evidence from unperformed live production validation.
* [x] One standard marker-driven comparison; no duplicate helper assessment or independent security-audit claim.
* [x] Review changed only this record and ran no new validation.
* Checked boundary: full P01-P04, FR-001 through FR-006, NFR-001 through NFR-004, PC-001 and the confirmed seed decision.
* Limited evidence: live paid/provider/production deployment effectiveness and byte identity with historical NumPy output are not acceptance claims.
