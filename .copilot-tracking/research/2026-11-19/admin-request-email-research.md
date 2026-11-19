<!-- markdownlint-disable-file -->
# Task Research: Admin request email

Date: 2026-11-19. Output mode: convergence. Researcher: RPI Agent.

## Executive Summary

Research complete. Requests currently persist only issuer and subject. Capture optional email from validated token claims, persist it, and display it beside the subject.

## What You May Not Know

Historical requests have no email. They must show an explicit unavailable state until the requester submits again with an email claim.

## Findings

C1 (evidence-backed, high confidence): apps/api/src/web_app.ts `identity` and POST access-requests use validated claims but discard email.
C2 (evidence-backed, high confidence): apps/api/src/web_storage.ts `request_access` persists identity and timestamps only; pending submissions are idempotent.
C3 (evidence-backed, high confidence): apps/web/src/App.tsx `admin-view` displays only subject. Its existing flat list accommodates a labeled email line without redesign.
C4 (evidence-backed, high confidence): apps/api/src/bootstrap_database.ts `import_sqlite` validates exact column lists; old SQLite imports must remain compatible after adding email.

## Recommendation and Alternatives

Preserve subject-based authorization; use email as additional identifying information.
Choose an optional nullable column, not a directory lookup or client-supplied identity. Use token `email`, then `emails` when supplied as a string array; do not assume `preferred_username` is an email.

## Scope and Questions

Goal: let admins identify requesting users by email as well as subject.
Audience: administrators. Scope: requester identity through grant UI, tests, related docs.
Excludes deployment, identity-provider lookup services, and unrelated UI redesign.
Q1: Where is email captured? Q2: Where is it lost? Q3: How are absent emails handled?

## Decisions and Feedback

D1: Agent-owned decisions authorized by user selecting end-to-end. No intake ambiguity.

## Risks and Open Questions

Email is display metadata, not proof of mailbox ownership or an authorization key. No remaining research blocker.

## Planning Readiness and Next Step

Research disposition: executed. Readiness: Ready (C1-C4). Participation: agent-owned automatic mode. Next: Plan, no user action needed.

## Research Record

### Method and Boundaries

Focused posture, selected for a bounded internal identity-display change.
Evidence root: .copilot-tracking/research/2026-11-19; date from user-supplied current date.
Prior knowledge: none reused. Initial candidates: apps/web/src and apps/api/src auth/storage.
No external research or helpers needed. No explicit deadline.

### Extensions and Participation

Selected: tracking, markdown, writing style instructions; Impeccable for existing UI preservation.
Skipped: security assessment and accessibility planner, neither requested nor needed for intake.
Automatic agent-owned participation; no unresolved user decision.

### Research Cycle Log

Cycle 1:
* Wider: traced UI, API, auth and storage (C1-C3). Reflection: email is absent throughout persistence, not merely hidden.
* Deeper: examined schema creation, explicit PostgreSQL upgrades and immutable SQLite import validation (C2,C4). Reflection: migration and legacy import compatibility are required.
* Contrarian: examined absent claims, existing pending requests, and permission tests. Reflection: do not infer email from subject or use it for grants. Refresh pending metadata without rotating request identity.
* Synthesis: accept nullable email storage and display; reject Graph lookup and client body email. No additional cycle: source contracts cover scope and edge cases.

### Evidence Log

C1: apps/api/src/web_app.ts `identity`, access-request routes; apps/api/src/web_auth.ts `require_scope`.
C2: apps/api/src/web_storage.ts `_create_access_request_schema`, `request_access`, `decide_access_request_as_admin`.
C3: apps/web/src/App.tsx `admin-view`; apps/web/src/types.ts `AdminAccessRequest`; apps/web/src/App.test.tsx admin tests.
C4: apps/api/src/bootstrap_database.ts `WEB_TABLE_COLUMNS`, `validate_source`, `import_sqlite`, `upgrade_postgres_store`; apps/api/tests/storage-admin.test.ts PostgreSQL adapter.
All evidence read directly; no external sources, helpers, contradictions, or unverified claims.
Self-check: scope, findings, alternatives, participation, evidence, full wave cycle, readiness and source-only boundaries verified.
