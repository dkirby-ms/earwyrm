<!-- markdownlint-disable-file -->
# Review: LLM MIDI Jingle Implementation

## Executive Summary

* Assessment: The compiler and guarded provider exist, but the paid output is not connected to the listening/final-render workflow; durable recovery and import also have concrete gaps.
* Review execution: Complete
* Assessed outcome: Defects found
* Review depth: standard, initial parent Review
* Validation coverage: Prior implementation reports offline tests, typecheck, build, and non-root container render passed. Not independently re-executed during review.
* Limits: No deployment, live inference, paid listening evaluation, real PostgreSQL integration, or telemetry export verification.

## What You May Not Know

The child skipped Review, but the parent retained its initial acceptance and refinement reviews. This record assesses the child implementation for that parent; it does not restart implementation or authorize paid work.

## Findings and Proposed Routes

<!-- rpi:review id=RV-001 -->
### RV-001 [High]: Paid arrangements cannot be heard or used for final audio

* Related scope: P06-T02, P07-T01, P08-T02; parent FR-003 and child FR-009/FR-010
* Expected behavior: A paid score produces an owner-visible preview and preserves its exact arrangement through vocal rendering.
* Observed evidence: apps/api/src/web_app.ts `/api/score/compose` returns a MelodyService job but never creates a run/output. `render_inputs` requires that run and its option/backing metadata. apps/web/src/App.tsx `composeScore` discards the job and only announces bars/BPM. apps/api/src/render.ts `render_brief` still calls legacy `musical_form`/`normalize`/`mix` without tempo and compares frames without sample rounding; CompositionResult does not retain tempo.
* Impact: Successful paid generation leaves no playable result, and valid fractional-duration scores cannot reach final vocal audio even if selected.
* Resolution condition: Injected score generation publishes one owner-scoped playable run, UI exposes it, retries recover it, and a non-120-BPM committed score reaches both vocal variants with verified MIDI/backing identity and sample-rounded duration.
* Proposed destination: rpi-implement
* Smallest useful next action: Complete existing preview publication and tempo propagation; retain deterministic legacy behavior and trust checks.

<!-- rpi:review id=RV-002 -->
### RV-002 [Medium]: Valid uncertain score reservations prevent SQLite import

* Related scope: P07-T01; NFR-009
* Expected behavior: Additive migration/import preserves valid submitted, unknown, and legacy reservations.
* Observed evidence: apps/api/src/bootstrap_database.ts adds nullable `provider_json` to JSON_COLUMN_TYPES, but `validate_source` rejects JSON null as a non-object before `validate_web` applies its null-aware checks. New submitted/unknown rows necessarily have SQL NULL provenance. The existing legacy import test removes the column, so misses this case.
* Impact: Normal uncertain-provider state makes an otherwise valid store impossible to migrate.
* Resolution condition: Current-schema null provenance imports without changing state/identity; non-null malformed provenance still fails before target writes.
* Proposed destination: rpi-implement
* Smallest useful next action: Handle the documented nullable column explicitly and cover valid-null and invalid non-null imports.

<!-- rpi:review id=RV-003 -->
### RV-003 [High]: Interrupted submit claims have no reconciliation path

* Related scope: P07-T01; FR-009, parent NFR-003
* Expected behavior: An interrupted remote attempt remains non-resubmittable but can be reconciled by an administrator with evidence.
* Observed evidence: apps/api/src/web_storage.ts `claim_score_compose` durably writes `submitted`; only the live route catch calls `finish_score_compose`. A process exit between claim and result leaves `submitted` forever. `reconcile_score_compose` only accepts `outcome_unknown`, so provider/billing evidence cannot resolve that row. Route retries only return an in-progress 409.
* Impact: A restart can permanently strand a paid action, even after confirmed provider non-acceptance.
* Resolution condition: An abandoned submit claim has a bounded, explicit operator recovery path that cannot race a live request or authorize automatic resubmission; offline restart/concurrency tests demonstrate this.
* Proposed destination: rpi-plan
* Smallest useful next action: Define safe handling of stale claims and retain evidence-backed admin reconciliation.

<!-- rpi:review id=RV-004 -->
### RV-004 [Medium]: Provider usage is discarded and host telemetry guidance is absent

* Related scope: P06-T01, P08-T01; parent NFR-002/NFR-007; child NFR-010
* Expected behavior: Record provider-reported token usage when supplied; document host-owned telemetry setup under D9 without exporting content.
* Observed evidence: apps/api/src/score_cloud.ts Completion parses choices only; request_score returns only the score, with no usage recorded. docs/service-contracts.md and docs/azure-deployment.md contain no score telemetry SDK/exporter guidance despite P08-T01 Guidance and the completion claim.
* Impact: Operators lack the accepted usage evidence and can mistakenly rely on no-op instrumentation.
* Resolution condition: Injected provider usage is validated and recorded using content-free GenAI attributes, absence remains unknown rather than estimated, and docs identify host-owned resources/exporter and unverified export.
* Proposed destination: rpi-implement
* Smallest useful next action: Capture bounded provider usage in the existing span and add the missing host-configuration paragraph.

<!-- rpi:review id=RV-005 -->
### RV-005 [Medium]: Reconciled retries reuse a stale monetary reservation

* Related scope: P06-T02/P07-T01; parent FR-004
* Expected behavior: Every permitted remote submission is covered by the current maximum cost and shared cap.
* Observed evidence: apps/api/src/web_storage.ts `claim_score_compose` reopens a reconciled failed row and increments attempt_count without checking current aggregate spend or comparing/updating reserved_usd. Its `options.cost` may differ after operator pricing changes, and options.total may have been lowered.
* Impact: A newly authorized provider call can exceed the remaining shared budget or its durable reserved ceiling.
* Resolution condition: Reconciled retry accounts conservatively for the current call ceiling and total budget before claiming; unchanged-cost retries neither duplicate nor refund reservations.
* Proposed destination: rpi-implement
* Smallest useful next action: Revalidate/rebase the existing reservation atomically, retaining spent upper bounds.

## Parent Decision Record

### Current Disposition

* Based on events: RD-001 through RD-017
* Review execution: Complete
* Final outcome: Conformant within the authorized offline increment, after recorded implementation and surface-finding resolution
* Finding decisions and next actions: RV-001 through RV-005 resolved in P09-P12; no required offline work remains
* Decisions still needed: None; agent-owned walkthrough skipped-auto

### Decision History

| Event | Subject | Decision source | Status or value | Proposed destination | Final destination | Owner | More information needed | Smallest next action | Rationale |
|-------|---------|-----------------|-----------------|----------------------|-------------------|-------|-------------------------|----------------------|-----------|
| RD-001 | participation | Recovered automatic parent state | agent-owned | none | none | Parent RPI | comparison | Assess P05-P08 | Parent retains initial Review; child skip is preserved |
| RD-002 | walkthrough | Agent | skipped-auto | none | none | Parent RPI | none | Decide findings | Saved automatic participation |
| RD-003 | RV-001 | Agent | accepted | rpi-implement | rpi-plan | Parent RPI | none | Plan end-to-end publication and timing | Required user-visible outcome missing |
| RD-004 | RV-002 | Agent | accepted | rpi-implement | rpi-plan | Parent RPI | none | Plan nullable import regression | Valid durable state must migrate |
| RD-005 | RV-003 | Agent | accepted | rpi-plan | rpi-plan | Parent RPI | safe stale-claim design | Define bounded operator recovery | Live submissions must not be stolen |
| RD-006 | RV-004 | Agent | accepted | rpi-implement | rpi-plan | Parent RPI | none | Plan usage attributes and docs | Explicit requirements omitted |
| RD-007 | RV-005 | Agent | accepted | rpi-implement | rpi-plan | Parent RPI | none | Plan atomic current-cost coverage | Preserve existing paid limits |
| RD-008 | execution | Agent | Complete | none | none | Parent RPI | none | Reconcile refinement | All material contracts assessed once |
| RD-009 | outcome | Agent | Defects found | none | none | Parent RPI | none | Remediate accepted findings | Five verified gaps |
| RD-010 | continuation | Agent | selected | rpi-plan | rpi-plan | Parent RPI | none | Append P09 onward | Required in-scope findings, no optional expansion |
| RD-011 | RV-001 | Parent follow-up | resolved | rpi-implement | none | Parent RPI | none | none | P09 playable preview/UI and tempo-aware final vocals; P12 reproduces/fixes 140 BPM end-bound arithmetic, matching artifacts and both variants |
| RD-012 | RV-002 | Parent follow-up | resolved | rpi-implement | none | Parent RPI | none | none | Current-schema NULL import and malformed-value regressions pass |
| RD-013 | RV-003 | Parent follow-up | resolved | rpi-plan | none | Parent RPI | none | none | D11 explicit stopped-worker attestation, durable restart and old-attempt fencing pass; no timed reclaim |
| RD-014 | RV-004 | Parent follow-up | resolved | rpi-implement | none | Parent RPI | none | none | Provider-reported usage validated on existing span, absent usage unknown, host SDK/resources/export caveat documented |
| RD-015 | RV-005 | Parent follow-up | resolved | rpi-implement | none | Parent RPI | none | none | Atomic max reservation and aggregate current-total checks pass repricing/reduced-cap cases |
| RD-016 | outcome | Parent follow-up | Conformant | none | none | Parent RPI | none | none | P05-P12 complete; P11 full tests/build/typecheck and P12 final affected regressions/build/typecheck/whitespace passed |
| RD-017 | continuation | Parent follow-up | complete | none | none | Parent RPI | none | Stop automatic session | No required findings remain; paid listening/deployment/export remain excluded and unclaimed |

## Validation Evidence

| Check | Status | Evidence and scope |
|-------|--------|--------------------|
| Prior `npm test` | Reported passed | Changes record: 472 API, 27 web; opt-in PostgreSQL skipped |
| Prior typecheck/build | Reported passed | Changes record P08-T02 |
| Prior non-root image smoke | Reported passed | Changes record P07-T02/P08-T02; valid non-silent WAV |
| Current comparison | Complete | Source and test assertions inspected; no checks executed during review |
| Paid/listening/export | Skipped | Explicit no-live boundary; no subjective quality or telemetry-export claim |

## Risks, Blockers, and Residual Work

* Review blockers: None; accepted implementation gaps remain required work.
* Outside scope: paid listening evaluation and deployment
* Host-managed telemetry export is unverified.

## Review Record

### Scope and Evidence

* Task ID: llm-midi-jingle-build; coordinating parent llm-midi-jingle
* Review date: 2026-11-19
* Scope: Full child plan P05-P08, parent requirements and critique dispositions
* Depth and provenance: standard, initial Review default
* Candidate identity: Existing working-tree implementation, not committed by this review
* Review execution: Complete
* Helpers: None
* Plan: .copilot-tracking/plans/2026-11-19/llm-midi-jingle-build-plan.md
* Parent requirements: .copilot-tracking/plans/2026-11-19/llm-midi-jingle-plan.md
* Critique: .copilot-tracking/reviews/plans/2026-11-19/llm-midi-jingle-plan-critique.md
* Changes: .copilot-tracking/changes/2026-11-19/llm-midi-jingle-build-changes.md
* Research: .copilot-tracking/research/2026-11-19/llm-midi-jingle-research.md

### Opening Review State

* Goal: Determine whether the bounded score compiler, paid compose, durable recovery, runtime packaging, and compatibility satisfy the approved increment.
* Evidence readiness: All P05-P08 markers checked; changes record reconciles completion and offline validation.
* Acceptance basis: Parent FR-001 through FR-006 and NFR-001 through NFR-007; child FR-007 through FR-010 and NFR-008 through NFR-010.
* Comparison boundary: Source, tests, contracts, implementation-time decisions, critique, and reported validation; excludes paid/live and deployment claims.
* Authority: Parent compares evidence, owns final decisions, routes and continuation.
* Read-only boundaries: Only this review record is writable during acceptance review; session state remains orchestrator-owned.
* Initial blockers: None

### Acceptance and Change Coverage

| Scope | Implementation and validation evidence | Assessment |
|-------|----------------------------------------|------------|
| P05-T01; FR-001/FR-002/FR-007; NFR-001/NFR-008 | score_dsl.ts ArrangementScore/compile_score; creative-audio.test.ts DSL cases | Met: bounded strict fields, deterministic expansion, lyric coverage, similarity before render job publication |
| P05-T02; FR-003/FR-006 | dsp.ts timing/MIDI and speech.ts/backing.ts; tempo helper tests | Gap RV-001 at final-render caller; helper behavior and legacy defaults covered |
| P06-T01; FR-001/FR-002/FR-008; NFR-002/NFR-007/NFR-010 | score_cloud.ts prompt/provider; creative-lyrics.test.ts injected provider, cap, failure, telemetry assertions | Gap RV-004; input minimization, strict output and bounded content-free telemetry otherwise met |
| P06-T02; FR-004/FR-008; NFR-005 | web_app.ts guards, lyric_budget.ts, web_storage.ts claims; guarded paid score tests | Gap RV-005 on reconciled retry repricing; consent/ownership/initial shared reserve and concurrent live claims covered |
| P07-T01; FR-003/FR-009; NFR-003/NFR-004/NFR-009 | MelodyService.submit_score, reservation/reconciliation methods, bootstrap import; creative-audio/web_app/storage-admin cases | RV-001/RV-002/RV-003; score replay, render retry, digest tampering, ordinary timeout and admin gates covered |
| P07-T02; FR-005/FR-010 | Dockerfile.web package/path checks; prior non-root image smoke | Met within offline evidence; no deployed-runtime claim |
| P08-T01; FR-004/FR-005/FR-006/FR-010 | service and deployment docs diff against existing paths; no infrastructure/workflow changes | Gap RV-004 host guidance; existing shared deployment settings and operator gates preserved |
| P08-T02; all child FR/NFR | Recorded tests/typecheck/build/image smoke and test assertion inspection | Reported checks passed but do not cover the demonstrated integration/recovery/import gaps |
| D9 host-owned telemetry | score_cloud.ts uses existing API only; no dependency/exporter config added | Justified scoped divergence from host-export verification; docs incomplete RV-004 |
| Implementation-time Guidance/timing tolerance | Named APIs and shared claim reuse match changes record; 1 ns tolerance addresses floating arithmetic | Met, except final-render call-site propagation RV-001 |
| NFR-006 listening | Explicitly deferred by child P08-T02 and user no-live scope | Not run, justified exclusion; no quality claim |

### Critique and Follow-Up Assessment

* PC-001: Paid listening remains separate and unauthorized; child explicitly defers it.
* PC-002: Ordinary timeout reconciliation implemented; interrupted process gap RV-003 remains.
* PC-003: Idea extensions remain deferred in both plans.
* PC-004: Provider selected brief/CTA/accepted-lyrics subset and retro-synth are explicit.
* PC-005/PC-009: Existing shared Foundry gate reused; workflows and billing/maintenance controls unchanged.
* PC-006: Initial reservation/caps/consent implemented; usage RV-004 and retry repricing RV-005 remain.
* PC-007/PC-008: Direct dependencies and deployment source references retained.
* PC-010: Versioned additive tables and compatibility tests exist; nullable-import gap RV-002 remains.
* PC-011: Package path/notices and offline non-root smoke recorded.
* PC-012: Strict accepted input, score schema, compiler and screening tests exist.
* Material revisions: Child P05-P08 preserves parent requirements and D9; no new critique warranted. Parent P01-P04 remain historical design markers, not duplicate active implementation.
* Follow-ups: Listening requires explicit paid consent/budget. Humanization, second producer pass and custom synth hardware remain optional/out of scope. Host export setup remains operator-owned.
* Business alignment: None, per plan/changes; no BRD/PRD/ADR cited as acceptance authority.

### Reviewer Self-Check

* [x] Every supplied marker, requirement, critique disposition, material revision and follow-up assessed or explicitly bounded.
* [x] Findings are demonstrated gaps, not cosmetic feedback or unsupported quality claims.
* [x] Complete execution is distinct from Defects found outcome.
* [x] Source, plan, critique, research and changes remained unmodified during review; only this record authored.
* [x] No validation executed during acceptance review; prior evidence distinguished from current observation.
* Limits: No real PostgreSQL, live model, deployment, listening or exporter observation.
