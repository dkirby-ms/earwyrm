<!-- markdownlint-disable-file -->
# RPI Changes: Jingle diagnostic tracing

* Task: `jingle-diagnostic-tracing`
* Plan: [.copilot-tracking/plans/2026-11-20/jingle-diagnostic-tracing-plan.md](../../plans/2026-11-20/jingle-diagnostic-tracing-plan.md)
* Date: 2026-11-20

## Execution Status

Complete for full plan `P01`, `P01-T01` and `P01-T02`; no remaining markers or blockers.

## Completed Work

### Correlated jingle diagnostics

* Marker: `P01-T01`. The jingle request issues a server-generated ID, and the browser displays it on failure. Server logs distinguish the request stage, upstream HTTP exchanges, lyric retries, and final outcomes using allowlisted metadata.
* Files: [apps/api/src/jingle_diagnostics.ts](../../../apps/api/src/jingle_diagnostics.ts), [apps/api/src/web_app.ts](../../../apps/api/src/web_app.ts), [apps/api/src/lyric_service.ts](../../../apps/api/src/lyric_service.ts), [apps/api/src/lyric_cloud.ts](../../../apps/api/src/lyric_cloud.ts), [apps/api/src/score_cloud.ts](../../../apps/api/src/score_cloud.ts), [apps/web/src/api.ts](../../../apps/web/src/api.ts), [apps/web/src/App.tsx](../../../apps/web/src/App.tsx).

### Troubleshooting and verification

* Marker: `P01-T02`. Four offline API cases and the existing UI test cover status and reason correlation, no extra moderation retries, redaction of arbitrary reasons, and the user-visible ID. Operator steps explain how to find and read the events.
* Files: [apps/api/tests/web_app.test.ts](../../../apps/api/tests/web_app.test.ts), [apps/web/src/App.test.tsx](../../../apps/web/src/App.test.tsx), [docs/azure-deployment.md](../../../docs/azure-deployment.md).

## Business Alignment

* None.

## Validation Record

| Check | Status | Evidence |
|---|---|---|
| `npm run test:api -- tests/web_app.test.ts tests/creative-lyrics.test.ts` | Passed | 174 tests; fixture transports, no Azure calls. |
| `npm run test:web -- src/App.test.tsx` | Passed | 18 tests. |
| `npm run typecheck` | Passed | API, web, root. |
| `git diff --check` | Passed | No whitespace errors. |
| Azure deployment and live generation | Skipped | Out of scope. |

## Pre-Review Reconciliation

Ready for review. Every plan marker is complete and linked to verification; no open decisions or business alignment entries.
