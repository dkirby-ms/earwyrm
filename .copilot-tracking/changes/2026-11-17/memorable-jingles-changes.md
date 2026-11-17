<!-- markdownlint-disable-file -->
# RPI Changes: Memorable jingles

## Metadata

* Task ID: `memorable-jingles`
* Plan: [.copilot-tracking/plans/2026-11-17/memorable-jingles-plan.md](../../plans/2026-11-17/memorable-jingles-plan.md)
* Date: 2026-11-17

## Execution Status

Complete; full-plan scope. Completed: `P01`, `P01-T01`, `P01-T02`, `P01-T03`. No remaining active-plan markers.

## Execution Summary

Delivered developed melodic phrases, sectional arrangement and phrase-led web/CLI duration. Explicit short MCP requests and legacy 30-second defaults both work. All automated checks pass; offline examples are saved, with subjective listening approval still pending.

## Completed Work

### P01-T01: Developed motif and sectional orchestration

* File: [apps/api/src/dsp.ts](../../../apps/api/src/dsp.ts).
* Seeded motifs now have rhythmic recurrence, answering endings, chord-aware phrase targets and tonic cadence. Verse is sparse; hook adds snare/backbeat, denser hats, syncopated bass and stronger lead. Pad inversions minimize voice movement; instrument envelopes separate pluck, bass and pad behavior.
* Shared form/duration helpers choose whole bars. Legacy helper defaults remain 30 seconds; short PCM/MIDI lengths are supported.
* Validation: direct smoke check seeds `0`, `1`, `2`, `42`, `"9223372036854775807"`; finite short PCM and unchanged similarity screening passed (maximum similarities 0.429-0.714).

### P01-T02: Complete speech and matching variable-length artifacts

* Files: [apps/api/src/render.ts](../../../apps/api/src/render.ts), [apps/api/src/speech.ts](../../../apps/api/src/speech.ts), [apps/api/src/melody.ts](../../../apps/api/src/melody.ts), [apps/api/src/melody_service.ts](../../../apps/api/src/melody_service.ts), [apps/api/src/contracts.ts](../../../apps/api/src/contracts.ts), [apps/api/src/melody_mcp.ts](../../../apps/api/src/melody_mcp.ts).
* Web/CLI now choose whole-bar forms from seed and script fit. Full speech extends the form when needed, never crops; word events are grouped into verse and CTA-hook windows, with breathing gaps and final resolution.
* Short MCP requests render exact requested PCM/MIDI and report the same duration. Omitted duration remains 30 seconds for stored retry identity compatibility. Quality schemas support phrase-led or legacy bounds.
* New artifacts record `earwyrm-phrase-v2` and duration/form metadata. History, screening, paid consent and saved jobs are unchanged.
* Validation: targeted creative-audio/platform/web-app suites passed, 122 tests including 16-second MCP resources, protected short web audio, exact MIDI/WAV lengths and 21-second mock natural speech extending to 24 seconds. Typecheck passed. A 100-seed lead sample passed unchanged screening for all 100.

### P01-T03: Verified exports, regressions and saved listening examples

* Files: [apps/api/tests/creative-audio.test.ts](../../../apps/api/tests/creative-audio.test.ts), [apps/api/tests/platform.test.ts](../../../apps/api/tests/platform.test.ts), [apps/api/tests/web_app.test.ts](../../../apps/api/tests/web_app.test.ts).
* Docs: [docs/audio-poc/rendering.md](../../../docs/audio-poc/rendering.md), [docs/melody-mcp.md](../../../docs/melody-mcp.md), [docs/service-contracts.md](../../../docs/service-contracts.md).
* Exact PRNG fixtures retained; previous generator score hashes intentionally replaced by deterministic new-score and musical-structure assertions. Existing diversity threshold retained. Seven net test cases added, none removed.
* Offline previews: [renders/20261117-phrase-v2-preview-747579a7](../../../renders/20261117-phrase-v2-preview-747579a7), seeds `42`, `9`, `23`; actual durations `16`, `16`, `18` seconds, each exact WAV length and numeric Pass. No paid calls made.
* Documentation distinguishes structural checks from listening, rights, natural-singing and original fixed-30-second protocol approval.
* Validation: API 376 passed, 1 skipped; web 9 passed; build, typecheck and whitespace checks passed.

## Implementation-Time Plan Updates

Ordinary local judgment only: whole-bar bounds are 8-30 seconds, with normal automatic forms around 14-20 seconds. Legacy helper/request defaults remain 30 seconds. No scope or business-source change. Standard critique remains Complete/Pass.

## Business Alignment

* None; no BRD/PRD/ADR cited as binding.

## Validation Record

| Check | Scope | Status | Evidence |
|---|---|---|---|
| Targeted Vitest | creative-audio/platform/web-app | Passed | 122/122 |
| `npm test` | API and web | Passed | 376 API + 9 web; 1 existing API skip |
| `npm run build` | all workspaces/scripts | Passed | TypeScript and Vite |
| `npm run typecheck` | all workspaces/scripts | Passed | no diagnostics |
| `git diff --check` | patch whitespace | Passed | no diagnostics |
| 100-seed sample | independent lead screening | Passed | 100/100, unchanged threshold/corpus |
| Offline previews | 3 synthetic briefs | Passed | 16/16/18 s, exact PCM data lengths |
| Live Azure/listening judgment | paid voice and perceived quality | Skipped | No paid calls authorized; no claim of subjective approval |

Initial expected fixed-score/fixed-duration regressions were updated for the intentional generator change; a mock speech sample was scaled to valid PCM. No new telemetry emitter or service boundary; existing observability unchanged. Duration evidence is local artifact metadata, not a new metric.

## Pre-Review Reconciliation

Plan checklist, current requirements, completed entries and test evidence reconciled. No binding business source divergence, blockers or remaining implementation. Ready for the session's one Review.

## Blockers

None.

## Remaining Work

None.

## Follow-Up Items

None.

## Return-to-Caller State

Automatic parent; implementation Complete and Ready for Review. No paid calls, deployment or tracker mutations. Listening examples are available; aesthetic approval is not inferred.
