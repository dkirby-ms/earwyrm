<!-- markdownlint-disable-file -->
# RPI Plan Critique: PostgreSQL migration

## Metadata

* Task ID: `postgresql-migration`
* Critique date: 2026-11-15
* Plan: .copilot-tracking/plans/2026-11-15/postgresql-migration-plan.md
* Critique execution: Complete
* Critique depth: standard
* Depth provenance: first-task default
* Critique type: initial
* Earlier critique: not applicable

## Inputs and Criterion Boundary

* Task context: migrate hosted SQLite stores to dedicated low-cost PostgreSQL, Key Vault password, manage users via web and operator tools, bootstrap requester with sole paid Speech access.
* Evidence: .copilot-tracking/research/2026-11-15/postgresql-migration-research.md and its supplied repository sources.
* Boundary: supplied plan and evidence; no live environment inspection or new research.

## Lens Assessments

| Lens | Scope | Reasoning effort and source | Status | Candidates |
|------|-------|-----------------------------|--------|------------|
| Coverage | Requirements and tasks | Direct; host review guidance | Complete | 1 adopted; none rejected |
| Evidence | Claims and references | Direct; host review guidance | Complete | 1 adopted; none rejected |
| Executability | Dependencies and checks | Direct; host review guidance | Complete | 1 adopted; none rejected |
| Risk | Safety and user decisions | Direct; host review guidance | Complete | 1 adopted; none rejected |

## Coverage Assessment

Requirements FR-001 through FR-007 and tasks P01-T01 through P05-T01 are represented. Coverage is partial where PC-001 through PC-004 identify implementation-critical gaps.

## Verdict

* Verdict: Revise
* Rationale: Four high-severity gaps affect identity binding, safe network connectivity, credential lifecycle and migration cutover.

## Findings

<!-- rpi:critique id=PC-001 -->
### PC-001 [High]: The initial owner and user-management lifecycle are underspecified

* Related IDs: `FR-003`, `FR-004`, `P02-T01`, `P03-T01`
* Evidence: .copilot-tracking/plans/2026-11-15/postgresql-migration-plan.md, P02-T01 and P03-T01; audio_poc/web_auth.py `require_scope`.
* Concern: The plan requires verified subject bootstrap and web management but does not define how an operator obtains the correct API-bound subject, how a new user is bound to that subject, or what access a newly signed-in user has before an administrator acts.
* Impact: An implementation can grant the wrong identity or leave user administration unusable despite meeting the stated interface requirements.
* Smallest useful change: Specify fail-closed provisioning and subject-binding flows, operator prerequisites, and required positive and negative end-to-end cases without collecting tokens in chat.
* Action owner: planning parent
* Exact resolving evidence: P02 and P03 task contracts define bootstrap and new-user lifecycle and test them.
* Decision route: direct planner correction.

<!-- rpi:critique id=PC-004 -->
### PC-004 [High]: The cutover does not bind source and target after import

* Related IDs: `FR-006`, `NFR-001`, `P04-T01`, `P05-T01`
* Evidence: .copilot-tracking/plans/2026-11-15/postgresql-migration-plan.md P04-T01; audio_poc/cloud_web.py `prepare_databases`.
* Concern: The plan requires an empty target and verified import but does not state how startup distinguishes an intentionally fresh database from a missed import or how rollback avoids divergence after writes.
* Impact: An apparently successful deployment could start with missing historical data or revert to stale data after PostgreSQL receives writes.
* Smallest useful change: Define explicit fresh-versus-import initialization, a durable migration completion marker, cutover checks and a no-divergence rollback procedure.
* Action owner: planning parent
* Exact resolving evidence: P04 specifies startup gating, cutover and rollback tests.
* Decision route: direct planner correction.

<!-- rpi:critique id=PC-002 -->
### PC-002 [High]: The deployment does not specify a reachable restricted database network

* Related IDs: `FR-007`, `NFR-005`, `P05-T01`
* Evidence: .copilot-tracking/research/2026-11-15/postgresql-migration-research.md W3; infra/platform.bicep `containerEnvironment`; .copilot-tracking/plans/2026-11-15/postgresql-migration-plan.md P05-T01.
* Concern: The current environment has no customer VNet, and the task requires restricted access without selecting or validating a connectivity approach.
* Impact: An implementation could produce a server the app cannot reach or silently use the broad all-Azure firewall exception.
* Smallest useful change: Identify an implementable restricted connectivity approach and its environment, cost and migration implications; explicitly fail closed when inputs are missing.
* Action owner: planning parent
* Exact resolving evidence: P05-T01 contains the chosen network boundary and measurable deployment verification.
* Decision route: direct planner correction if supported; otherwise a deployment-input blocker.

<!-- rpi:critique id=PC-003 -->
### PC-003 [High]: The database password lifecycle is not tied to server provisioning

* Related IDs: `FR-007`, `NFR-003`, `P05-T01`
* Evidence: .copilot-tracking/plans/2026-11-15/postgresql-migration-plan.md P05-T01; research W2; infra/service.bicep `app`.
* Concern: The plan requires a Key Vault secret but does not state how the initial PostgreSQL credential and Container Apps reference are guaranteed to use the same secret or how updates are coordinated.
* Impact: Deployment may expose credentials or start with mismatched password versions, and naive rotation can cause an outage.
* Smallest useful change: Specify an existing secure Key Vault reference for provisioning and runtime, identity permissions, coordinated rotation and fail-closed behavior.
* Action owner: planning parent
* Exact resolving evidence: P05-T01 specifies the secure credential flow and a rotation/runbook validation.
* Decision route: direct planner correction.

## Strengths and Residual Risk

The plan preserves existing External ID and Speech safeguards, requires concurrent database testing and retains a separate live deployment approval.

## Questions or Blocking Evidence Gaps

The deployment owner must provide a verified API subject, vault and actual network inputs before live provisioning; the plan should define a safe local implementation boundary.

## Limitations

Direct assessment used because supplied evidence fits a single review context; no live deployment was inspected.

## Recommended Next Action

* Highest-impact finding: PC-001
* Action owner: planning parent
* Smallest next action: revise the plan for all four required findings.
* User response required: no for the identified corrections; deployment inputs and live approval remain separate.
