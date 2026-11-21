<!-- markdownlint-disable-file -->
# RPI Plan Critique: Admin job diagnostics

## Metadata

* Task ID: admin-job-diagnostics
* Critique date: 2026-11-20
* Plan: .copilot-tracking/plans/2026-11-20/admin-job-diagnostics-plan.md
* Critique execution: Complete
* Critique depth: standard, initial-pass default
* Critique type: initial
* Earlier critique: not applicable

## Inputs and Criterion Boundary

* User requested a reliable job-inspection workflow, sanitized provider metadata, and an Impeccable-reviewed admin redesign that preserves existing operations.
* Evidence: .copilot-tracking/research/2026-11-20/admin-job-diagnostics-research.md and its named code sources.
* Assess all plan goals, requirements, decisions, dependencies, phases and tasks against the supplied boundary. No live calls or deployment.

## Lens Assessments

| Lens | Scope | Reasoning effort and source | Status | Candidates |
|------|-------|-----------------------------|--------|------------|
| Coverage | All requirements and tasks | host default | Complete | Adopted PC-004; remaining details merged or existing requirements cover them. |
| Evidence | All phases and research | host default | Complete | Adopted PC-001 and PC-005; rejected claim that a new diagnostic ID is introduced, since it already exists. |
| Executability | All phases and dependencies | host default | Complete | Adopted PC-001, PC-002 and PC-003; merged legacy-import and status candidates. |
| Risk | All phases and privacy | host default | Complete | Adopted PC-003, PC-004 and PC-005; merged related candidates. |

## Coverage Assessment

FR-001 through FR-005 and NFR-001 through NFR-003 are assigned, but PC-001 through PC-005 identify material execution and verification gaps.

## Verdict

Revise: migration and browser validation need executable mechanisms; failure, retention and sanitization policies need explicit contracts.

## Findings

<!-- rpi:critique id=PC-001 -->
### PC-001 [High]: Database upgrade and import compatibility need explicit contracts

* Related IDs: P01-T01, P03-T02, NFR-002.
* Evidence: apps/api/src/bootstrap_database.ts `upgrade_postgres_store`, `import_sqlite`; apps/api/src/persistence.ts `REQUIRED_TABLES`; apps/api/src/cloud_web.ts.
* Concern: the upgrade requires existing required tables before creating additional ones; legacy SQLite imports omit only named optional tables.
* Impact: a new required diagnostics table could prevent existing deployments from upgrading or importing.
* Smallest useful change: specify schema creation, required-table exemption and legacy optional import, including pre-change fixtures and no live upgrades.
* Action owner: planning parent.
* Exact resolving evidence: P01-T01 and P03-T02 specify these contracts and tests.
* Decision route: direct planner correction.

<!-- rpi:critique id=PC-002 -->
### PC-002 [High]: Visual verification needs an executable authenticated fixture

* Related IDs: P03-T01, P03-T02, NFR-003.
* Evidence: apps/web/src/App.test.tsx uses jsdom mocks; apps/web/package.json starts Vite without a mock authenticated backend.
* Concern: jsdom cannot prove layout and the plan does not name a browser fixture.
* Impact: the required desktop and mobile review cannot be reproduced.
* Smallest useful change: specify isolated browser interception with synthetic authentication and API data, viewports and review evidence.
* Action owner: planning parent.
* Exact resolving evidence: P03-T01 describes browser fixture, captures and controls.
* Decision route: direct planner correction.

<!-- rpi:critique id=PC-003 -->
### PC-003 [Medium]: Persistence and interrupted states lack contracts

* Related IDs: P01-T01, FR-001, FR-002, NFR-002.
* Evidence: plan P01-T01; research F1 and risks.
* Concern: initial and later persistence failures, status vocabulary, and restart ambiguity have no defined behavior.
* Impact: the system may incur paid calls without evidence or show a stale job as successful or currently running.
* Smallest useful change: decide failure semantics and status rules, and test them.
* Action owner: planning parent.
* Exact resolving evidence: P01-T01 and P03-T02 specify behavior and tests.
* Decision route: direct planner correction.

<!-- rpi:critique id=PC-004 -->
### PC-004 [Medium]: Retention and provider field sources are underspecified

* Related IDs: P01-T01, P02-T01, NFR-001.
* Evidence: research F2 and risks; plan P01-T01 and P02-T01.
* Concern: durable records lack identity minimization and retention policy; provider fields have no named sources or allowlist contract.
* Impact: unnecessary long-lived data or unsafe and unusable metadata can be stored.
* Smallest useful change: specify bounded retention, fields, sources and negative tests.
* Action owner: planning parent.
* Exact resolving evidence: P01-T01, P02-T01 and P03-T02 state privacy and validation boundaries.
* Decision route: direct planner correction.

<!-- rpi:critique id=PC-005 -->
### PC-005 [Medium]: Verification misses material regression and rollout paths

* Related IDs: P03-T02, NFR-002, NFR-003.
* Evidence: plan P03-T02; apps/api/src/bootstrap_database.ts; research F3-F4.
* Concern: fresh, reset and validation paths, persistence failures and retry/spend invariants are not specifically tested.
* Impact: important compatibility and accounting regressions may go undetected.
* Smallest useful change: name cases, test ownership and safe rollout documentation.
* Action owner: planning parent.
* Exact resolving evidence: P03-T02 names targeted tests and safe migration boundary.
* Decision route: direct planner correction.

## Strengths and Residual Risk

The plan preserves the existing admin operations and rules out raw error bodies. No residual risk accepted yet.

## Questions or Blocking Evidence Gaps

No user-owned decision identified; unsupported historical evidence remains unavailable.

## Limitations

Lenses did not run tests or interact with a live deployment. Returned candidates were checked against the plan and cited code.

## Recommended Next Action

* Highest-impact findings: PC-001 and PC-002.
* Action owner: planning parent.
* Smallest next action: revise plan and record dispositions.
* User response required: no.
