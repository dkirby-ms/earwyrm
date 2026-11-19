<!-- markdownlint-disable-file -->
# RPI Changes: LLM MIDI Jingle Implementation

## Metadata

* Task ID: llm-midi-jingle-build
* Related plan: [.copilot-tracking/plans/2026-11-19/llm-midi-jingle-build-plan.md](../../plans/2026-11-19/llm-midi-jingle-build-plan.md)
* Implementation date: 2026-11-19

## Execution Status

* Status: Complete, required parent Review and surface follow-ups implemented and validated
* Declared invocation scope: Full plan
* Completed scope markers: P05-P12 and every task
* All remaining active-plan markers: None
* Status basis: P09-P11 pass full checks. P12 reproduced and repaired the surface finding; 172 affected API regressions and final workspace build/typecheck/whitespace passed. Surface refinement is Clean.

## Execution Summary

P05 establishes a strict, versioned score contract and deterministic compiler, then adds explicit tempo-aware output while preserving legacy whole-bar requests. MIDI tempo, audio frame counts, lyric alignment, score screening, and fractional result durations are supported. P06-T01 adds an injected-test score provider with strict output validation, minimized accepted-lyric input, and content-free OpenTelemetry API instrumentation. The user selected host-managed SDK/resources/exporter configuration; no SDK dependency or telemetry endpoint is added. P07 adds durable score-job recovery/reconciliation and enables the sampled renderer in the Azure-selected web image.

P07-T01 connects paid score reservations to one durable rendered job. Committed outcomes recover the same score and artifacts, rendering failures retry without another provider call, and uncertain provider outcomes remain blocked until an administrator records confirmed non-acceptance evidence.

P08-T02 completed full repository validation and rebuilt the web image locally. The non-root image rendered a known MIDI fixture to a valid, non-silent WAV; no live provider calls, paid samples, or deployment were performed.

## Completed Work

### P05-T01: Implementing the versioned arrangement DSL

* Added the strict `ArrangementScore` contract for fixed `retro-synth` 4/4 scores, 8-12 bars, 100-140 BPM, major/minor keys, four-chord progressions, bounded patterns, and supported renderer roles.
* Added `compile_score` to expand deterministic backing, chord voicings, and lyric-aligned vocal notes; validate timing coverage and bar boundaries; expose screening inputs; and reject melodies that fail the existing similarity screen.
* Added focused schema/compiler cases to [apps/api/tests/creative-audio.test.ts](../../../apps/api/tests/creative-audio.test.ts), using static inputs only.

### P05-T02: Rendering tempo-aware scores compatibly

* Added opt-in 100-140 BPM rendering for 8-12 bars, with tempo metadata and tick conversion in MIDI and sample-rounded fractional audio buffers.
* Kept legacy composition requests and renderer calls on the existing whole-bar, 120 BPM defaults; fractional score paths must supply tempo explicitly.
* Extended committed lyric alignment, spoken placement, and result-duration validation to accept explicit tempo-derived score lengths.
* Added regressions for declared MIDI tempo and end ticks, fractional audio/lyric buffers, and legacy request rejection of fractional durations.

### P06-T01: Adding the structured-output score provider

* Added `AzureScoreComposer` with injected transport and credentials, a 1,200-token cap, a 64 KiB serialized-request cap, strict JSON-schema output, local score validation, content-free provider failures, and oversized-output rejection.
* Added `score_prompt` to require accepted lyrics, re-run `validate_draft`, and send only selected brief fields, CTA, accepted lyrics, and v1 style. Contact details and creative direction are excluded.
* Added OpenTelemetry API client spans, W3C trace-context injection, and a duration histogram with bounded error dimensions. Per the user decision, the host supplies the SDK, exporter, and required service/SDK resources; runtime export is not verified in this offline implementation.
* Exported the existing strict-schema conversion helper for the score provider to reuse.
* Validation passed: API typecheck and 166 targeted creative audio/lyrics tests, including request minimization, refusal, truncation, malformed/oversized output, bounded telemetry, and legacy score behavior.

### P06-T02: Requiring consent and an idempotent budget reservation

* Added a distinct `/api/score/compose` action that requires literal paid consent and an owner-scoped accepted lyric option. It validates and minimizes input before reserving one model-call ceiling.
* Added an additive `score_reservations` ledger with a unique owner/action/logical-job key, serialized submit claim, committed result replay, and durable `outcome_unknown` blocking. Existing lyric and compose reservations now share the cumulative paid-text budget.
* Added per-option one-shot UI consent and maximum-cost disclosure; the deterministic MCP preview remains independently available without paid score consent.
* Validation passed: API and web typechecks; 266 targeted API tests passed with one optional PostgreSQL integration test skipped; all 27 web tests passed. No live provider calls or deployment.

### P07-T01: Persisting score jobs and uncertain outcomes safely

* Committed scores now render through the existing `render_jobs` store with tempo-aware MIDI/WAV output, score/provider provenance, and digest-checked artifacts. Replays recover the same job; changed requests conflict; failed renders can retry without another provider call.
* Ambiguous provider outcomes return a non-retryable `provider_outcome_unknown` response. The administrator-only reconciliation route records bounded evidence before allowing a new provider attempt; the route is registered independently of paid-render reconciliation.
* Added additive v2 reservation/provenance/reconciliation schema support, legacy SQLite import defaults, and PostgreSQL upgrade coverage without changing v1 job statuses.
* A floating-point boundary in ordered score lyric timing is accepted within a 1 ns tolerance, preventing valid adjacent syllables from being rejected due solely to binary rounding.
* Files: [apps/api/src/score_dsl.ts](../../../apps/api/src/score_dsl.ts), [apps/api/src/score_cloud.ts](../../../apps/api/src/score_cloud.ts), [apps/api/src/web_storage.ts](../../../apps/api/src/web_storage.ts), [apps/api/src/melody_service.ts](../../../apps/api/src/melody_service.ts), [apps/api/src/bootstrap_database.ts](../../../apps/api/src/bootstrap_database.ts), [apps/api/src/web_app.ts](../../../apps/api/src/web_app.ts), [apps/api/tests/creative-audio.test.ts](../../../apps/api/tests/creative-audio.test.ts), [apps/api/tests/storage-admin.test.ts](../../../apps/api/tests/storage-admin.test.ts), and [apps/api/tests/web_app.test.ts](../../../apps/api/tests/web_app.test.ts).
* Validation passed: API typecheck; 212 focused API tests passed with one opt-in real PostgreSQL integration test skipped, covering render recovery, conflict handling, digest integrity, screening, concurrent/uncertain retries, reconciliation, and legacy schema import/upgrade.

### P07-T02: Packaging the sampled renderer in the web image

* The web image now installs FluidSynth and `fluid-soundfont-gm`, sets the configured General MIDI SoundFont path, and verifies that the SoundFont and package copyright notice remain readable in the image.
* Files: [Dockerfile.web](../../../Dockerfile.web).
* Validation passed: `dpkg-query -L fluid-soundfont-gm` in the target Debian image identified `/usr/share/sounds/sf2/FluidR3_GM.sf2` and `/usr/share/doc/fluid-soundfont-gm/copyright`; the web image built successfully; a container running as UID 10001 rendered through FluidSynth and emitted a valid 768,044-byte WAV from 384,000 samples.

### P08-T01: Reconciling service and deployment documentation

* Documented deterministic arrangement previews and `/api/chat` composition separately from consented `/api/score/compose`, including the shared budget, one-shot consent, score recovery, ambiguous outcomes, and administrator reconciliation evidence.
* Updated deployment guidance to retain the normal shared voice/text PoC configuration, use the existing Foundry settings without a composer-specific switch or preview gate, and verify model pricing, budget ceilings, SoundFont readability, and package notices before live use.
* Files: [docs/service-contracts.md](../../../docs/service-contracts.md) and [docs/azure-deployment.md](../../../docs/azure-deployment.md).
* Validation passed: source/workflow/infrastructure cross-checks and `git diff --check`; no documentation test or Markdown lint command is defined in the repository scripts.

### P08-T02: Validating the implementation with injected providers

* Full `npm test` passed: 472 API tests passed with one opt-in PostgreSQL integration test skipped, and all 27 web tests passed.
* `npm run typecheck` and `npm run build` passed for the API, web, and root TypeScript workspaces.
* Rebuilt `earwyrm-web-p07-t02:local` from the current worktree. As UID 10001, the container read the SoundFont and package copyright notice and rendered a known MIDI fixture to a valid, non-silent RIFF/WAVE file (1,728,256 audio bytes).
* All provider tests use injected responses; no live provider calls, paid samples, or deployment occurred.
* No product files changed during P08-T02; the plan and changes record contain its completion and validation evidence.

### P09-T01: Publishing the paid score and preserving tempo through final vocals

* The paid route now publishes the existing committed score as an owner-scoped playable run using the deterministic compose publication path. The UI refreshes and opens that run, retaining the selected lyric option for vocal estimation.
* `CompositionResult` stores optional validated tempo only for score results. Final form, normalization, alignment, mixing and duration gates propagate it and round sample counts. Adjacent committed syllables share the compiler's 1 ns arithmetic tolerance.
* Files: [apps/api/src/dsp.ts](../../../apps/api/src/dsp.ts), [apps/api/src/render.ts](../../../apps/api/src/render.ts), [apps/api/src/speech.ts](../../../apps/api/src/speech.ts), [apps/api/src/melody_service.ts](../../../apps/api/src/melody_service.ts), [apps/api/src/web_app.ts](../../../apps/api/src/web_app.ts), [apps/api/tests/web_app.test.ts](../../../apps/api/tests/web_app.test.ts), [apps/web/src/App.tsx](../../../apps/web/src/App.tsx), and [apps/web/src/App.test.tsx](../../../apps/web/src/App.test.tsx).
* Validation passed: 9 guarded paid-score cases, including real offline final rendering at 137 BPM/9 bars, exact committed MIDI/backing identity, sample counts, passing numeric gates, owner-scoped playback, and simultaneous recovery after render/publication failures. The focused UI consent case proves vocal estimation selects the returned score. Workspace typecheck passed after completing tempo persistence.

### P10-T01: Preserving null provenance and cleaning artifacts after actual rollback

* Current-schema SQL NULL provider provenance now imports unchanged; malformed non-null JSON still fails validation before target access.
* Artifact cleanup belongs to the outer arrangement transaction through its actual COMMIT. Legacy and score failures remove only newly created directories; recovered jobs retain their artifacts.
* Files: [apps/api/src/bootstrap_database.ts](../../../apps/api/src/bootstrap_database.ts), [apps/api/src/melody_service.ts](../../../apps/api/src/melody_service.ts), [apps/api/tests/storage-admin.test.ts](../../../apps/api/tests/storage-admin.test.ts), and [apps/api/tests/creative-audio.test.ts](../../../apps/api/tests/creative-audio.test.ts).
* Validation: Helper reported 12 focused checks passed; parent targeted run passed both affected suites. No schema or dependency changes.

### P10-T02: Fencing interrupted attempts and covering current retry costs

* Administrators may reconcile a durable submitted claim only with explicit stopped-submitter attestation plus non-acceptance evidence. The audit evidence records that attestation; there is no elapsed-time reclamation. Score commit/failure writes match the claimed attempt number.
* Reconciled retries atomically retain the greater of stored/current ceilings and recheck all shared text spend against the current total. Unchanged reservations are neither duplicated nor refunded; committed replay requires no new paid claim.
* Extracted the shared Decimal reservation sum to avoid divergent accounting in lyric actions, first score submissions and score retries.
* Files: [apps/api/src/web_storage.ts](../../../apps/api/src/web_storage.ts), [apps/api/src/web_app.ts](../../../apps/api/src/web_app.ts), and [apps/api/tests/web_app.test.ts](../../../apps/api/tests/web_app.test.ts).
* Validation passed: Guarded paid-score cases cover process restart, rejected missing stop attestation, accepted explicit attestation, stale-worker result/failure fencing, provider-free replay, concurrent live claims, repricing increase and reduced total cap.

### P11-T01: Recording reported usage and validating the repaired contracts

* Existing GenAI spans now record validated nonnegative safe-integer provider-reported input/output token counts. Missing usage stays absent; malformed counts fail closed without exposing provider content.
* Documented host-owned SDK/exporter/context/resources, no-op instrumentation without host setup, unverified export and stopped-worker recovery. No SDK, exporter, runtime configuration or dependency was added.
* Files: [apps/api/src/score_cloud.ts](../../../apps/api/src/score_cloud.ts), [apps/api/tests/creative-lyrics.test.ts](../../../apps/api/tests/creative-lyrics.test.ts), [docs/service-contracts.md](../../../docs/service-contracts.md), and [docs/azure-deployment.md](../../../docs/azure-deployment.md).
* Validation passed: Full `npm test` produced 481 API passes, one optional real PostgreSQL skip and 27 web passes. Workspace build, typecheck and `git diff --check` passed. Full tests were warranted by shared final-render and reservation-accounting changes. Nine additional API cases across the loop stay below the 12-case cap; the UI case was extended.
* No container rebuild: Runtime packaging was unchanged in this loop; P08 image smoke remains historical. No paid/live inference, deployment, listening evaluation or exporter delivery was performed.

### P12-T01: Accepting floating bar-end arithmetic without accepting duration overflow

* Reproduced paid publication failing with HTTP 503 at 140 BPM/12 bars while 137 BPM/9 bars passed. The committed score reader's exact bound rejected valid last-bar addition already permitted by the DSP.
* The reader now uses the same 1 ns arithmetic tolerance as compiler/render validation. Both tempo cases publish and reach spoken/vocoded output with matching MIDI/backing identity and sample counts. An existing MCP-artifact regression additionally proves material duration overflow remains rejected.
* Files: [apps/api/src/jingle_tools.ts](../../../apps/api/src/jingle_tools.ts), [apps/api/tests/web_app.test.ts](../../../apps/api/tests/web_app.test.ts), and [apps/api/tests/creative-audio.test.ts](../../../apps/api/tests/creative-audio.test.ts).
* Validation passed: 172 affected API/MCP tests, workspace typecheck/build and whitespace. Total additions across follow-up work are 10 API cases, below 12. No repeat full review for this localized predicate fix; parent reconciles its resolution evidence.

## Implementation-Time Plan Updates

* Added Guidance to P05-T01 naming the new score schema/compiler as the P05-T02 input contract.
* Added Guidance to P05-T02 documenting the tempo-aware APIs P07-T01 must use and the unchanged legacy request contract.
* Added Guidance to P06-T02 documenting the reservation claim and recovery APIs P07-T01 must reuse.
* Recorded user decision D9: keep OpenTelemetry instrumentation API-only and rely on the host for SDK, exporter, and required resources. Updated P06-T01 and P08-T01, added host-configuration risk and documentation guidance, and avoided new SDK dependencies or an unconfigured telemetry destination.
* Appended P09-P11 under parent automatic follow-up selection D10/D11 for RV-001 through RV-005 and RF-001. Kept completed P05-P08 and the initial critique; no scope expansion or paid/live work.
* Appended P12 for surface review RV-001: reproduce the note-end arithmetic boundary and align the artifact reader with existing numeric tolerance only when confirmed. No new architecture or scope; no repeat critique/full review. P05-P11 stay checked.

## Business Alignment

* None

## Validation Record

| Check | Scope | Status | Evidence or reason |
|-------|-------|--------|--------------------|
| `npm run typecheck --workspace @earwyrm/api` | P05 | Passed | API source and tests typecheck |
| `npm run test --workspace @earwyrm/api -- tests/creative-audio.test.ts` | P05 | Passed | 70 tests passed, including schema/compiler, MIDI tempo, fractional timing, and legacy cases |
| `npm run typecheck --workspace @earwyrm/api` | P06-T01 | Passed | Provider and injected telemetry test types compile |
| `npm run test --workspace @earwyrm/api -- tests/creative-audio.test.ts tests/creative-lyrics.test.ts` | P06-T01 | Passed | 166 tests passed, including schema/compiler, request minimization, strict score output, refusal/truncation/malformed/oversized failures, bounded telemetry, and legacy behavior |
| `npm run typecheck --workspace @earwyrm/api` | P06-T02 | Passed | API route, reservation storage, and tests typecheck |
| `npm run typecheck --workspace @earwyrm/web` | P06-T02 | Passed | Consent and cost-disclosure UI typecheck |
| `npm run test --workspace @earwyrm/api -- tests/web_app.test.ts tests/storage-admin.test.ts tests/creative-audio.test.ts tests/creative-lyrics.test.ts` | P06-T02 | Passed | 266 tests passed; one opt-in real PostgreSQL integration test skipped |
| `npm run test --workspace @earwyrm/web -- --run src/App.test.tsx` | P06-T02 | Passed | 27 tests passed, including one-shot score consent and preview availability |
| `npm run test --workspace @earwyrm/api -- tests/storage-admin.test.ts tests/web_app.test.ts -t 'commits one score\|blocks concurrent and uncertain\|recreates the application tables\|resets known application data'` | P07-T01 interim | Failed | The initial run exposed a floating-point timing boundary rejection with the accepted 28-syllable fixture; fixed and covered by the final P07-T01 run |
| `npm run test --workspace @earwyrm/api -- tests/creative-audio.test.ts tests/storage.test.ts tests/storage-admin.test.ts tests/web_app.test.ts` | P07-T01 | Passed | 212 tests passed; one opt-in real PostgreSQL integration test skipped |
| `npm run typecheck --workspace @earwyrm/api` | P07-T01 | Passed | API source and focused tests typecheck |
| `dpkg-query -L fluid-soundfont-gm` | P07-T02 | Passed | Ran in the target Debian image; confirmed SoundFont and copyright notice paths |
| `docker build --progress=plain -f Dockerfile.web -t earwyrm-web-p07-t02:local .` | P07-T02 | Passed | Local web image built with FluidSynth and SoundFont |
| Non-root `Dockerfile.web` render smoke | P07-T02 | Passed | UID 10001 read the SoundFont and copyright notice; FluidSynth produced nonzero audio and a valid WAV |
| `git diff --check -- docs/service-contracts.md docs/azure-deployment.md` | P08-T01 | Passed | No whitespace errors in updated service/deployment guidance |
| `npm test` | P08-T02 | Passed | 472 API tests passed, one opt-in PostgreSQL integration test skipped; all 27 web tests passed. No live provider calls. |
| `npm run typecheck` | P08-T02 | Passed | API, web, and root TypeScript workspaces typechecked |
| `npm run build` | P08-T02 | Passed | API, web production bundle, and root TypeScript build succeeded |
| `docker build --progress=plain -f Dockerfile.web -t earwyrm-web-p07-t02:local .` | P08-T02 | Passed | Current local web image rebuilt with FluidSynth and SoundFont |
| Initial non-root WAV smoke assertion | P08-T02 interim | Failed | FluidSynth adds a non-silent release tail, so the exact-duration byte-count assertion was too strict; the final check validates the WAV structure, minimum duration, and non-silent samples |
| Non-root local web-image render smoke | P08-T02 | Passed | UID 10001 read the SoundFont and notice and rendered a known MIDI fixture to a valid, non-silent RIFF/WAVE file |
| `git diff --check` | Full plan | Passed | No whitespace errors in the completed worktree changes |
| Initial follow-up `npm run typecheck` | P09-P11 interim | Failed | Missing optional result tempo while the independent cleanup task owned its module; added validated tempo persistence, then workspace typecheck passed |
| Targeted four-suite API run | P09-P11 interim | Failed | 275 passed, one optional PostgreSQL test skipped; new tests accidentally nested in another test, corrected collection before guarded cases passed |
| Publication recovery regression, first run | P09 interim | Failed | Test referred to a nonexistent error class; replaced it with the existing storage-error code convention |
| `npm run test --workspace @earwyrm/api -- tests/web_app.test.ts -t 'guarded paid score composition'` | P09/P10 | Passed | 9 cases passed, including fractional final vocals and durable submitted/repriced retries |
| `npm run test --workspace @earwyrm/api -- tests/web_app.test.ts -t 'replays a committed score after rendering fails'` | P09 | Passed | Render failure followed by publication failure and concurrent retries recovers one output and one provider call |
| `npm run test --workspace @earwyrm/web -- --run src/App.test.tsx -t 'one-shot paid consent'` | P09 | Passed | Paid result becomes inspectable and selectable for vocal estimation |
| `npm run typecheck` | P09/P10 | Passed | API, web and root contracts compile |
| `npm test` | P09-P11 final | Passed | 481 API passed, one opt-in real PostgreSQL integration skipped; 27 web passed; providers injected |
| `npm run build` | P09-P11 final | Passed | API, web production bundle and root TypeScript build succeeded |
| `npm run typecheck` | P09-P11 final | Passed | API, web and root source/test contracts compile |
| `git diff --check` | P09-P11 final | Passed | No whitespace errors |
| Container smoke | P09-P11 | Skipped | No runtime packaging changes; prior P08 evidence retained without claiming rerun |
| Boundary paid-vocal regression before fix | P12 interim | Failed | 137 BPM/9 bars passed; 140 BPM/12 bars returned 503 Composition artifacts are unavailable, confirming the surface finding |
| `npm run test --workspace @earwyrm/api -- tests/web_app.test.ts tests/creative-audio.test.ts tests/platform.test.ts` | P12 final | Passed | 172 tests passed, including both fractional-tempo vocal paths and rejection of material duration overflow |
| `npm run typecheck` and `npm run build` | P12 final | Passed | All workspaces and root compile/build |
| `git diff --check` | P12 final | Passed | No whitespace errors |
| Repeat full tests/review/container | P12 | Skipped | One local numeric predicate; affected API/MCP suites rerun. No architecture/public-contract/runtime-packaging change after the surface review |

## Pre-Review Reconciliation

* Plan markers and task-local context: P05-P12 and every task are complete.
* Completed-work entries and handoff prose: All six required fixes, token usage and host guidance are recorded.
* Validation, blockers, remaining work, and follow-up items: Current; no implementation blockers or active-plan markers remain. Paid listening/export/deployment remain excluded.
* Review readiness: Surface acceptance/refinement completed; its local boundary finding is now reproduced, repaired and validated. No further review required.

## Blockers

* None for offline implementation. Operator-owned telemetry export remains unverified; configure the host SDK/resources/exporter and verify export before relying on telemetry. Live inference and deployment remain excluded.

## Remaining Work

* None in the active implementation plan.

## Follow-Up Items

* Canonical plan list: [.copilot-tracking/plans/2026-11-19/llm-midi-jingle-build-plan.md](../../plans/2026-11-19/llm-midi-jingle-build-plan.md), `## Follow-Up Items`
* The three-brief listening evaluation needs separate user consent and available paid budget; no live samples are authorized in this task.

## Return-to-Caller State

* Implementation execution status: Complete
* Declared scope and markers: Full plan; P05-P12 and every task complete
* Validation coverage: Full API/web tests at P11, final affected API/MCP tests at P12, final workspace build/typecheck and whitespace passed. Interim failures and corrections recorded. Prior P08 image smoke remains historical. Host telemetry export unverified.
* Blockers: None for offline implementation; the Operator must configure host telemetry SDK/resources/exporter and verify export before relying on it
* Current plan updates: P09-P12 address required original and surface findings within unchanged offline scope; all markers checked.
* Business alignment entries: None; the plan found no relevant BRD, PRD, or ADR
* Planning and critique state: Child plan is ready; this child skipped critique under the session limit, and the parent critique's findings are resolved
* Follow-up items: Paid listening evaluation requires separate consent and budget
* Review readiness or no-handoff reason: Initial and surface reviews completed; localized P12 validated without another review. Parent reconciles acceptance and stops with no required work remaining.
* Continuation owner: Parent automatic RPI session
