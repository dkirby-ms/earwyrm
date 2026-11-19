<!-- markdownlint-disable-file -->
# Review: Admin request email

## Executive Summary

Review execution: Complete. Assessed outcome: Conformant. Full P01 boundary:
signed email capture, storage, upgrade/import compatibility, admin queue display,
and unchanged grants. No substantive findings.

## What You May Not Know

Live identity-provider claim issuance and live PostgreSQL were not exercised.
The nullable contract explicitly supports tokens without email.

## Findings and Proposed Routes

No substantive findings identified within the assessed boundary.

## Parent Decision Record

### Current Disposition

Based on RD-001 through RD-005: execution Complete, final outcome Conformant.
No finding routes, pending decisions, blockers, or required follow-ups.

### Decision History

| Event | Subject | Source | Status | Rationale |
|---|---|---|---|---|
| RD-001 | participation | user selection | agent-owned | End-to-end automatic mode |
| RD-002 | walkthrough | agent | skipped-auto | No findings require questions |
| RD-003 | execution | agent | Complete | All material requirements compared |
| RD-004 | outcome | agent | Conformant | Source and validation support FR/NFR acceptance |
| RD-005 | continuation | agent | complete session | No required in-scope work remains |

## Validation Evidence

135 affected API tests passed; one opt-in live PostgreSQL test skipped.
26 frontend App tests passed. Repository typecheck and whitespace check passed.
Browser desktop/mobile verification passed with synthetic fixtures.

## Risks, Blockers, and Residual Work

No implementation blockers reported.

## Review Record

### Scope and Evidence

Task ID: admin-request-email. Date: 2026-11-19. Depth: standard (default).
Full task, no helpers.
Plan: .copilot-tracking/plans/2026-11-19/admin-request-email-plan.md.
Critique: .copilot-tracking/reviews/plans/2026-11-19/admin-request-email-plan-critique.md.
Changes: .copilot-tracking/changes/2026-11-19/admin-request-email-changes.md.
Research: .copilot-tracking/research/2026-11-19/admin-request-email-research.md.

### Opening Review State

Available source changes, tests and rendered observations are ready for a
marker-driven comparison against FR-001 through FR-003 and NFR-001 through NFR-002.
Review is read-only except for this record; parent owns outcome and continuation.
No initial blocker.

### Acceptance and Change Coverage

| Scope | Implementation and evidence | Assessment |
|---|---|---|
| FR-001, P01-T02 | apps/web/src/App.tsx `admin-view`, nullable type and App tests; desktop/mobile render | Met: email and subject remain visible |
| FR-002, P01-T01 | apps/api/src/web_app.ts POST access-requests; web_storage.ts `request_access`; signed-token and restart tests | Met: trusted claims persist and pending identity/order stay stable |
| FR-002 migration | web_storage.ts `_create_access_request_schema`; bootstrap_database.ts import schema validation and `_copy_sqlite_table`; storage-admin tests | Met: old/current imports preserve source bytes, nullable migration preserves requests |
| FR-003 | App email fallback and missing-email test | Met: explicit unavailable state |
| NFR-001 | Existing admin guards and subject-based `decide_access_request_as_admin`; API permission regression tests | Met: email is not used for grants |
| NFR-002, P01 | 135 API tests, 26 App tests, typecheck, whitespace and 390px/1440px render | Met within local validation boundary |

No material plan changes, follow-up work, or business-source divergences.

### Critique and Follow-Up Assessment

Standard critique passed with no findings. No material plan changes or follow-ups.

### Reviewer Self-Check

Compared every requirement, completed marker, critique disposition, changed
contract, validation result and limitation. No helpers or new validation executed
during review. No source, plan or changes mutations during comparison.
Live PostgreSQL and tenant-issued email claims remain explicitly unassessed.
