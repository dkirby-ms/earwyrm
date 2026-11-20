<!-- markdownlint-disable-file -->
# Task Research: Jingle diagnostic tracing

| Date | Researcher | Output mode |
|---|---|---|
| 2026-11-20 | rpi-research | convergence |

## Executive Summary

The route collapses multiple lyric outcomes into one response. A server-generated diagnostic ID can join that response to bounded server log events, without changing screening or requiring an exporter. Research is complete for planning; earlier requests cannot be reconstructed.

## What You May Not Know

A successful provider HTTP response is not a successful generation. Schema validation, domain rules, assessment and safety can still fail.

## Findings

### F1: Preserve both retry evidence and the terminal outcome

Evidence-backed (Q1, C1–C2). The writer retains only the last retry reason on exhaustion; emit an event as each retry is decided and another for the writer outcome. The HTTP handler can report a separate terminal stage and status.

### F2: Keep correlation opaque and server-owned

Evidence-backed (Q2, C1, C3). The browser progress ID is caller-controlled and optional. A new server UUID in a response header preserves existing error bodies. Internals should use fixed operation labels, status numbers, bounded reason codes and timings, never exception strings.

### F3: Use existing process logs rather than requiring tracing infrastructure

Evidence-backed (Q3, C4–C5). Azure and the local API already use process logs. Existing OTel spans are insufficient without a configured SDK/exporter and can remain unchanged. Injected adapters and transport fixtures can validate behavior offline.

## Recommendation and Alternatives

Select structured process logs scoped to the jingle request. Reject using only OTel because it does not work out of the box here, and reject provider payload logging because those bodies contain advertiser and generated content. Revisit export only if an operator needs aggregate telemetry later.

## Scope and Questions

Help Earwyrm operators explain failed paid browser jingles using correlated, content-free evidence. Exclude live paid calls, deployment, raw transcripts, and changes to screening or billing.

| ID | Question | Status |
|---|---|---|
| Q1 | Where does the jingle failure lose its reason? | Answered F1 |
| Q2 | Which evidence can be correlated without exposing user or provider content? | Answered F2 |
| Q3 | What is the smallest dependable emission and validation path? | Answered F3 |

## Decisions and Feedback

D1 (agent, confirmed): server-owned correlation and allowlisted diagnostics in process logs, per F1–F3. No walkthrough needed for the selected end-to-end mode.

## Risks and Open Questions

Log visibility after deployment depends on the operator's configured retention and permissions. Do not query or change Azure or generate a live jingle for this task.

## Planning Readiness and Next Step

Research disposition `executed`; ready for Plan based on C1–C5. Convergence, agent-owned participation, automatic continuation. No research blockers. Wider, deeper and contrarian waves completed without helpers.

## Research Record

### Method and Boundaries

Focused, repo-only extension of the earlier read-only walkthrough. Workspace root `.copilot-tracking` and session date 2026-11-20 determine `.copilot-tracking/research/2026-11-20/jingle-diagnostic-tracing-research.md`. No helper is needed for this continuous trace.

### Extensions and Participation

Selected tracking conventions and telemetry-foundations for the artifact and content-free telemetry criteria. User chose end-to-end; no unresolved intake choice.

### Research Cycle Log

1. Wider: traced browser response, progress polling, route, writer and score; prioritized writer reasons over the existing generic score log.
2. Deeper: traced retry branches, transport, score catch and fixtures; separated HTTP status from application outcomes.
3. Contrarian: evaluated progress ID reuse, OTel-only and raw payload logs; rejected for trust, availability and privacy. No separate cycle warranted because the alternatives do not expose an unresolved implementation dependency.

### Evidence Log

| ID | Source and symbol | Evidence |
|---|---|---|
| C1 | apps/api/src/web_app.ts, paid jingle route and error middleware | Discards lyric reasons; existing status/detail response. |
| C2 | apps/api/src/lyric_service.ts, `write_candidate` | Bounded retries with mutable feedback; terminal reason codes. |
| C3 | apps/web/src/api.ts, `requestApi`; apps/web/src/App.tsx, generate | Error handling can add a header-based support reference. |
| C4 | apps/api/src/lyric_cloud.ts, `post`; apps/api/src/score_cloud.ts, `compose`; docs/azure-deployment.md, score telemetry | Observable status and safe error boundaries; exporter is not installed. |
| C5 | apps/api/tests/web_app.test.ts, paid jingle suite; apps/web/src/App.test.tsx, generation failure test | Existing offline seams and expectations. |

Self-check: all questions mapped, three waves recorded, no customer content or live calls used.
