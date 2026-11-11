<!-- markdownlint-disable-file -->
---
title: Earwyrm planning deliverables
description: Bounded planning work for a local project plan and GitHub-ready task breakdown.
---

## Task Metadata

* Task ID: `earwyrm-project-plan`
* Date: 2026-11-11
* This task produces planning documents, not the application.

## Executive Summary

Produce a four-week MVP plan and flat issue drafts from the supplied proposal.
Keep the audio proof as a hard gate, preserve its fallback, and separate pilot work.
Drafting is in progress; application implementation is not authorized.

### What You May Not Know

The week-1 listener and producer tests require people. They cannot be replaced by
automated transcription. Loudness and automated intelligibility thresholds are not
specified in the proposal and must remain decisions before quality-gate implementation.

## Phase Checklist

This work adds two documents, `docs/project-plan.md` and `docs/github-issues.md`,
without changing application connections.

<!-- rpi:phase id=P01 -->
### [ ] P01: Prepare planning deliverables

Goals:
* Make the proposed MVP actionable without expanding its scope.

Dependencies:
* Supplied design proposal; no remote repository required for local documents.

Changes in the map: Two local planning documents; no architecture changes.

<!-- rpi:task id=P01-T01 -->
#### [ ] P01-T01: Draft the project plan

Goals:
* Establish scope, milestones, proof gates, risks and completion conditions.

Requirements:
* `FR-001`, `FR-003`, `NFR-001`

Details:
* Use relative weeks, not invented dates or staffing estimates.
* Preserve the distinct proof, MVP and pilot criteria.

References:
* [docs/design-proposal.md](../../../docs/design-proposal.md), sections 1, 5, 6 and 9.

Dependencies:
* None.

<!-- rpi:task id=P01-T02 -->
#### [ ] P01-T02: Draft issue-ready tasks

Goals:
* Give contributors bounded work with testable completion conditions and dependencies.

Requirements:
* `FR-002`, `FR-003`, `NFR-001`

Details:
* Keep one flat task list with suggested weekly milestones.
* Leave issue numbers, owners and dates unassigned.
* Include human proof evaluation, deployment, identity, generation, rendering,
  quality gates, approvals, sharing, tracing and demo validation.

References:
* [docs/design-proposal.md](../../../docs/design-proposal.md), sections 5, 6, 8 and 9.

Dependencies:
* `P01-T01` for milestone and scope consistency.

## User Decisions and Requirements

### Confirmed User Direction

* Create a simple project plan and task breakdown suitable for GitHub issues.
* Use the supplied proof-of-concept design proposal.

### Planning Decisions and Feedback

* Local-only output is the conservative default after the question tool reported
  the user unavailable. No issue creation, repo setup or app implementation.
* Runtime, numeric quality thresholds and review-link access policy are downstream
  decisions, not reasons to invent requirements while drafting.

## Planning Readiness and Next Step

* Participation: user-retained; unanswered material implementation decisions stay open.
* Draft readiness: sufficient evidence for planning documents.
* Implementation readiness: not assessed; the request ends at planning.
* Critique: standard, not yet started.
* Next action: author and critique the requested documents, then stop in Plan.

## Scope and Non-Goals

* Scope: local project plan and GitHub-ready issue bodies.
* Non-goals: app code, cloud resources, live tracker planning, issue creation,
  estimates presented as commitments, or added pilot capabilities.

## Functional Requirements

* `FR-001`: Include four weekly milestones, MVP scope and a measurable week-1 gate.
* `FR-002`: Provide issue titles, scope, acceptance checkboxes and dependencies.
* `FR-003`: Preserve the proposal's fallback, safeguards and pilot exclusions.

## Non-Functional Requirements

* `NFR-001`: Keep documents concise and traceable to proposal sections. State gaps
  explicitly, with no invented numerical quality thresholds.

## Sources

* [docs/design-proposal.md](../../../docs/design-proposal.md): sole supplied design
  evidence; this is a proposal, not an approved BRD, PRD or ADR.
* Workspace contains only `docs/`; no BRD, PRD, ADR or test tooling was found.

## Critique Disposition

* Setting: standard, default.
* Status: not started.
* Boundary: coverage and consistency of the local planning deliverables.

## Artifact Self-Check

* Test ownership: planning parent checks document coverage and dependencies.
* Removals: none. Maximum additions: two user-facing Markdown documents plus
  required workflow state, plan and critique evidence.
* Canonical targets: requested documents; no generated application targets.
* Semantic coverage: proposal requirements, gates and exclusions.
* Regression coverage: design proposal remains unchanged.
* Validation: no build or runtime tests needed for documentation-only changes;
  no documentation test tooling exists.

## Follow-Up Items

* None.

## Handoff

Stop after planning. GitHub publication requires a destination and separate
authorization; application implementation requires a new explicit request.
