<!-- markdownlint-disable-file -->

# Whole-Repository Code Review

## Metadata

| Field | Value |
|---|---|
| Reviewer | code-review |
| Target | Whole-repository baseline at `main`, commit `6f4ec3b85bcf4899f8c0a8eaa185de17b53abb8c` |
| Working tree | Clean before review artifacts were written |
| Reviewed | 2026-11-19 |
| Profile and depth | Full profile; comprehensive depth confirmed by the user |
| Verdict | Request changes |
| Findings | 0 Critical, 2 High, 4 Medium, 0 Low |

This is a user-confirmed baseline audit, not a patch review. It covered current application code, tests, frontend, deployment automation, infrastructure, configuration, and directly related product/operator documentation. Generated renders, installed dependencies, build output, and historical tracking records were not primary review targets.

## Changed Files Overview

There is no code diff: the checkout was clean at the reviewed commit. The table below describes the audited surface, not changed files.

| Area | Audited surface | Risk | Findings |
|---|---|---:|---:|
| Authentication and API | Browser token flow, API routes, authorization, owner scoping | High | 0 |
| Paid generation | Lyric/chat and Speech consent, budgets, estimates, provider calls | High | 1 |
| Persistence and migration | SQLite/PostgreSQL adapters, media, jobs, imports and reset | High | 1 |
| Azure deployment | Workflows, Bicep, deployment/bootstrap scripts, runbooks | High | 1 |
| Frontend and service integration | React/API contracts, MCP, status reporting, accessibility | Medium | 2 |
| Validation and delivery | Tests, builds, deployment gates, docs | Medium | 1 |

## Merged Findings

### 1. Dependency installation runs with Azure OIDC permission

**Severity:** High  
**Category:** Supply chain / deployment credentials  
**Location:** `.github/workflows/deploy-web.yml:18,59`; `.github/workflows/bootstrap-web.yml:42,83`

Both workflows grant `id-token: write` to the job that runs `npm ci`. npm installation can execute dependency lifecycle scripts, and GitHub exposes the OIDC request capability to steps in a job with this permission. A compromised install-time dependency can therefore request a GitHub OIDC token and attempt to exchange it for the federated Azure identity before the workflow's deployment gates run. Environment approval and branch protection limit who can start a run, but do not isolate the install process once the approved job starts. GitHub documents the permission and request mechanism at <https://docs.github.com/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-cloud-providers>.

**Current code:** Both privileged jobs run `npm ci --no-audit --no-fund`.

**Suggested fix:** Move dependency installation and build execution to a job without `id-token: write`; pass a verified, immutable artifact to a narrowly scoped Azure job that does not execute dependency lifecycle scripts. Apply the same isolation to the bootstrap workflow.

### 2. Unique arrangement previews can grow persistent storage without a bound

**Severity:** High  
**Category:** Resource consumption / persistence  
**Location:** `apps/api/src/web_app.ts:613-635,649-658`; `apps/api/src/melody_service.ts:130-158`; `apps/api/src/web_storage.ts:472-488`; `infra/platform.bicep:282`

An enabled user with `renders.write` can repeatedly submit distinct valid custom briefs. The brief digest contributes to three deterministic job identities per request, so changed brief contents create new committed melody artifacts and output audio. `render_active` serializes concurrent work but resets after each request; it does not cap cumulative requests or stored bytes. The Azure Files share is provisioned with a 100-GiB quota, and no application quota or artifact/output pruning path was found. Filling the share would make persistent writes fail for the service, not just for the requesting user.

**Current code:** The route creates three arrangement jobs per selected brief and persists each output; successful melody submissions write artifacts and a render-job row.

**Suggested fix:** Enforce server-side per-owner request and durable-storage quotas before job creation, and define retention or approved deletion for expired preview artifacts and outputs. A concurrency guard alone does not bound cumulative storage.

### 3. A valid long custom script fails after its paid attempt is marked submitted

**Severity:** Medium  
**Category:** Functional edge case / paid-operation recovery  
**Location:** `apps/api/src/workspace_briefs.ts:18-19`; `apps/api/src/web_app.ts:893,896`; `apps/api/src/render.ts:149-151`; `apps/api/src/dsp.ts:46-49`

Custom brief validation allows a render script up to 400 characters but does not bound its word count. At 81 words, `render_brief` computes a 30.25-second minimum; the duration schema rejects values above the 30-second ceiling. In the paid route, the attempt is already marked submitted before local rendering reaches this check, so the catch path records `failed_or_unknown` even though no Speech request was made. The user must reconcile the attempt before retrying.

**Suggested fix:** Validate the computed minimum duration during brief validation or estimate/preflight, before reserving or marking a paid attempt submitted. Reject scripts that cannot fit the supported duration with a clear client error.

### 4. The output `Pass` state is unreachable through supported application flows

**Severity:** Medium  
**Category:** Contract / workflow completeness  
**Location:** `apps/api/src/web_app.ts:202-214,1015-1024`; `apps/api/src/render.ts:94-109`; `apps/api/src/melody_service.ts:27-29`

`output_status` returns `Pending` unless every component status is exactly `Pass`. Current component creation uses `Pending`, `Pending human rights review`, or `Recorded basis; human review required`; the web API exposes evaluation and paid-attempt reconciliation but no action to record a component review or change its status. Consequently, even an otherwise passing evaluation and reconciled cost cannot produce `Pass` or a passing `/api/poc/status` rollup through supported flows. This conflicts with the documented POC criteria that describe `Pending`, `Pass`, and `Fail` outcomes, while the product correctly distinguishes technical acceptance from broadcast approval.

**Suggested fix:** Align the state contract with the intended review model: either add an auditable component-review action with explicit evidence and authorization, or revise the rollup so it only depends on states users can reach. Do not equate technical `Pass` with broadcast or rights approval.

### 5. Default secondary-button borders do not meet non-text contrast

**Severity:** Medium  
**Category:** Accessibility / perceivable controls  
**Location:** `apps/web/src/index.css:102`

The default `.button-secondary` border is `#aaa09e` on a white fill. Its measured contrast against white is 2.551:1, below the 3:1 minimum for visual information needed to identify a user-interface component. The hover state changes the border, but the default state is what users encounter before interaction.

**Suggested fix:** Darken the default border to a color that maintains at least 3:1 contrast against both the button fill and its surrounding surface.

### 6. The approved deployment path does not run the available test suites

**Severity:** Medium  
**Category:** Validation evidence / release readiness  
**Location:** `.github/workflows/deploy-web.yml:58-123`; `package.json:11-13`

The manually dispatched deployment workflow installs dependencies and proceeds to writer quiescence, provisioning, and deployment without running `npm test`. The Docker build type-checks/builds the workspaces but does not run the API or browser suites. A test failure can therefore reach the Azure mutation path despite the repository providing and documenting those suites.

**Suggested fix:** Run the root test command before the first Azure mutation, or require an equivalent passing CI gate before an approved deployment can proceed.

## Positive Changes and Validation

* The API verifies token issuer, audience, signature, scope, and enabled-user status, and storage operations are owner-scoped.
* Paid actions use explicit consent and server-side estimates/reservations; the deployment runbook documents recovery, backup, and destructive-reset boundaries.
* The separate platform scaffold and its `POST /jobs` 501 response are explicitly documented; they were not treated as stale or silently active generation paths.
* `npm run build` passed for both workspaces and the root TypeScript project.
* `npm test` passed: 11 API test files (427 passed, 1 skipped) and 1 web test file (26 passed).
* Bicep compilation of `infra/main.bicep` succeeded.

The build and test commands validate the checked-out baseline only; they do not prove live Azure networking, managed-identity SMB behavior, or a successful deployment.

## Recommended Actions

1. Isolate dependency installation from OIDC-enabled jobs in both deployment workflows.
2. Bound per-owner arrangement generation and storage; add a retention/deletion lifecycle.
3. Reject custom scripts whose required duration exceeds the renderer limit before paid reservation/submission.
4. Make the output status contract reachable without weakening the distinction between technical, rights, and broadcast approval.
5. Add a required test gate before deployment mutations.
6. Correct the default secondary-button border contrast.

## Out-of-Scope Observations

* No live Azure deployment or data-plane test was run; the infrastructure check was Bicep compilation only.
* The standards perspective could not complete a repository-specific convention review because no matching coding-standards skill was available in its runtime. No standards clearance is implied.
* The repository's documented platform scaffold and legacy SQLite/Python compatibility paths appear intentional; they were not reported as stale code.
* Pull-request metadata, merge state, and inline-comment checks do not apply to this whole-repository baseline target.

## Recommended Specialist Follow-Up

* **Supply chain:** The deployment-identity finding touches dependency lifecycle execution and GitHub OIDC. A focused supply-chain assessment is available through `hve-core:supply-chain-skill-assessor`; prioritize workflow privilege isolation and dependency provenance.
* **Responsible AI:** Paid model and screening paths are present. `hve-core:rai-skill-assessor` is available for an optional framework-specific follow-up beyond this code review.
* **Privacy:** User identities, transcripts, lyrics, and audio are persisted. No dedicated privacy reviewer was available in this review run; consider a manual privacy/retention assessment.

## Risk Assessment and Verdict

**Overall risk: High.** Two High findings concern Azure deployment-identity exposure from install-time code and unbounded persistent storage that can disrupt the shared service. Four Medium findings affect paid-operation recovery, a dead-end output-status contract, default control contrast, and deployment validation. The full test/build checks pass, but they do not mitigate these design gaps.

**Verdict: Request changes.** Address both High findings before relying on the deployment and persistent preview service; resolve the Medium findings as follow-up readiness work.

## Disclaimer and Human Review

> [!CAUTION]
> **Disclaimer:** This agent is an assistive review tool only. It does not provide engineering sign-off, security certification, or compliance approval and does not replace qualified human code review, security review boards, or other professional reviewers. The output consists of AI-assisted findings, observations, and suggested remediations to support a reviewer's own analysis and decision-making. All code-review findings — including functional, standards, and accessibility observations — generated by this tool must be independently reviewed and validated by a qualified human reviewer before acting on them, merging changes, or treating any finding as resolved. Outputs from this tool do not constitute engineering approval, merge authorization, or compliance certification.

- [ ] Reviewed and validated by a qualified human reviewer
