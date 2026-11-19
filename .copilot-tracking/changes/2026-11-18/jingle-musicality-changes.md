<!-- markdownlint-disable-file -->
# RPI Changes: Jingle musicality

## Metadata

Task ID: `jingle-musicality`. [Plan](../../plans/2026-11-18/jingle-musicality-plan.md).

## Execution Status

Complete; full plan `P01`, `P01-T01`, and `P01-T02`. No remaining implementation markers or blockers.

## Completed Work

### Guided previews have a returning melody and a clear finish

* `P01-T01`: [apps/api/src/melody.ts](../../../apps/api/src/melody.ts), [apps/api/src/melody_service.ts](../../../apps/api/src/melody_service.ts), and [apps/api/src/web_app.ts](../../../apps/api/src/web_app.ts).
* The first and third phrases share a short pitch/rhythm cell, the second contrasts, and the CTA ends before the instrumental tonic. The new job key selects fresh previews without changing saved jobs.
* No new service boundary or telemetry emitter; routing, persisted screening and artifact integrity remain unchanged.

### Structural regressions and matched local audio

* `P01-T02`: [apps/api/tests/creative-audio.test.ts](../../../apps/api/tests/creative-audio.test.ts) tests recall, contrasting entry, matching guide events, and sparse and dense CTA endings. [docs/audio-poc/web-app.md](../../../docs/audio-poc/web-app.md) describes the guided form.
* Matched oscillator WAVs are in this Copilot session's files: `jingle-before.wav` and `jingle-after.wav`, both 18 seconds at seed `42`, meter `[10, 11, 10, 8]`. Baseline composer from `098ad02`.

## Implementation-Time Plan Updates

Boundary stress testing found that cadential placement beyond 25 seconds would violate existing speech alignment and timing contracts. The CTA now lands as late as the unchanged cap permits. A bounded history check also exposed exhaustion after 23 accepted candidates in the first contour draft; a wider contour with recovery after leaps passed the same 24-output check without altering screening.

## Business Alignment

* None.

## Validation Record

| Check | Status | Evidence |
|---|---|---|
| `npm run build --workspace apps/api` | Passed | TypeScript API build. |
| `npm run test --workspace apps/api -- tests/creative-audio.test.ts tests/web_app.test.ts` | Passed | 117 tests across both suites; committed preview is reused in the final mock render. |
| Sequential interval-history check | Passed | 24 accepted candidates, six rejected, policy unchanged. |
| Timing stress check | Passed | 1,000 score/meter/seed cases; timing schema and no overlap. |
| Matched audio generation | Passed | Both files verified as 24 kHz mono PCM; human preference not assessed. |
| `git diff --check` | Passed | No whitespace errors. |

## Pre-Review Reconciliation

Full plan checked, requirements backed by sources and validation. Review ready. No required human gate for the local change.

## Follow-Up Items

Optional: audition the matched instrumental pair, then assess natural word stress separately if vocal delivery still sounds stiff. No paid or deployed output was tested.
