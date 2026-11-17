<!-- markdownlint-disable-file -->
# Review: Memorable jingles

## Executive Summary

Review Complete for the full local implementation. Assessed outcome: Defects found. The normal 14-20-second path meets the plan, but newly accepted 8/10-second explicit forms cannot contain the complete returning-and-answering hook promised for every score. One Medium finding requires a bounded correction. Full tests, typecheck, build and three preview exports passed.

## What You May Not Know

New generator scores intentionally differ from historical seed outputs. Historical committed jobs are unchanged. No live Azure audio or subjective listening acceptance is claimed.

## Findings and Proposed Routes

### RV-001 [Medium]: Shortest accepted forms omit the answering hook

The new duration schema accepts 8 and 10 seconds, but those forms leave only four or six seconds between hook start and cadence. The composer uses a four-second hook phrase and only changes its ending after four seconds; an eight-second form contains no answer, and a ten-second form stops before the answer's changed ending.

* Related scope: FR-001, P01-T01, P01-T02.
* Expected: Each supported score has a recurring hook with a distinct answering ending and final cadence.
* Observed evidence: apps/api/src/dsp.ts `ScoreDuration`, `musical_form`, `vocal_pitch`, `compose`; short-form tests cover 14/18/30 seconds, not the new lowest accepted lengths.
* Impact: Publicly accepted durations can contradict the central musical-structure requirement even though generated notes remain valid.
* Resolution condition: Every accepted form has room for a complete verse, two four-second hook phrases and cadence; schema, quality bounds, docs and lower-bound tests agree.
* Proposed destination: rpi-implement in a distinct required follow-up.
* Smallest useful action: Raise the newly introduced minimum to 12 seconds, preserving normal 14-20-second generation and legacy 30-second defaults. No user request requires 8/10-second support.

## Parent Decision Record

### Current Disposition

Based on RD-001 through RD-009: agent-owned; walkthrough skipped-auto; Review execution Complete; assessed outcome Defects found. RV-001 subsequently resolved by child implementation and validation. Session accepted and stopped with no required work remaining; child changes were not reviewed a second time. No user decision needed.

### Decision History

| Event | Subject | Decision source | Status or value | Proposed destination | Final destination | Owner | More information needed | Smallest next action | Rationale |
|---|---|---|---|---|---|---|---|---|---|
| RD-001 | participation | user/automatic default | agent-owned | none | none | RPI parent | none | Compare evidence | User selected Handle it end to end |
| RD-002 | walkthrough | agent | skipped-auto | none | none | RPI parent | none | Decide from evidence | Agent-owned participation |
| RD-003 | RV-001 | agent | accepted | rpi-implement | child implementation | RPI parent | lower-bound validation | Enforce complete-hook form minimum | Current user intent does not require sub-12-second forms |
| RD-004 | execution | agent | Complete | none | none | RPI parent | none | Follow-up assessment | Entire supplied material boundary compared once |
| RD-005 | outcome | agent | Defects found | follow-up | follow-up | RPI parent | RV-001 resolution | Select bounded correction | Central structure gap affects only shortest newly accepted forms |
| RD-006 | continuation | agent | selected required in-scope RV-001 | child complete-hook-minimum | child complete-hook-minimum | RPI parent | lower-bound checks | Create .copilot-tracking/rpi-sessions/2026-11-17/memorable-jingles/complete-hook-minimum-state.json | Distinct corrective approach: require sufficient form length; no optional work selected |
| RD-007 | RV-001 resolution | agent | resolved | none | none | RPI parent | .copilot-tracking/changes/2026-11-17/complete-hook-minimum-changes.md | Prune required follow-up | Minimum 12-second structure across four seeds; rejected 8/10-second forms; exact 12-second PCM/MIDI; 123 affected tests plus build/typecheck/whitespace passed. Validated, not reviewed again |
| RD-008 | session acceptance and continuation | agent | accepted; stop intended | none | none | RPI parent | root Review plus child validation | Stop automatic session | All scoped melody/arrangement, flexible duration, complete speech, artifact consistency and regression/safety criteria supported. No required findings, blockers or optional work selected. Subjective listening, live Azure and optional database integration remain unclaimed |
| RD-009 | session stop | agent | completed/stopped | none | none | RPI parent | both task states persisted | No user action required | One plan critique and one Review completed; one required child correction validated without another Review. No commit, push, deployment, dependency addition or paid call |

## Validation Evidence

Available: 376 API tests passed, one PostgreSQL integration test skipped because no `EARWYRM_TEST_DATABASE_URL`; 9 web tests passed; typecheck/build passed; short preview PCM lengths verified.

## Risks, Blockers, and Residual Work

RV-001 is required in-scope corrective work. Listening judgment and live paid speech remain explicitly unassessed; they are not represented as automated approval. No destructive or external action is required.

## Review Record

### Scope and Evidence

* Task: memorable-jingles, full plan P01 and all three tasks.
* Date: 2026-11-17
* Depth: standard, default.
* Review execution: Complete.
* Helpers: none; single coherent comparison fits direct review.
* Plan: .copilot-tracking/plans/2026-11-17/memorable-jingles-plan.md
* Critique: .copilot-tracking/reviews/plans/2026-11-17/memorable-jingles-plan-critique.md, Complete/Pass.
* Changes: .copilot-tracking/changes/2026-11-17/memorable-jingles-changes.md
* Research: .copilot-tracking/research/2026-11-17/memorable-jingles-research.md
* Candidate: current local source/test/docs changes and saved renders/20261117-phrase-v2-preview-747579a7.

### Opening Review State

Compare FR-001 through FR-003 and NFR-001 through NFR-003 against source, tests, validation and exact artifact behavior. All plan markers complete, no unresolved critique findings. Read-only review except this record and parent workflow state. Parent owns acceptance/routing.

### Acceptance and Change Coverage

| Requirement or scope | Evidence | Assessment | Rationale |
|---|---|---|---|
| FR-001, P01-T01 | dsp.ts motif, vocal_pitch and compose; structural test | Gap at new 8/10-second lower bound | RV-001; normal automatic forms met |
| FR-002, P01-T02 | render.ts candidate/form extension; speech.ts alignment; 24-second mocked pair | Met | No fixed 15 seconds, no cropping |
| FR-003, P01-T02 | melody service duration; exact MIDI/PCM and word-map tests | Met | Artifacts and metadata agree |
| NFR-001 | retained PRNG fixtures; deterministic audio and oversized-seed tests | Met | Score version intentionally changes, identity unchanged |
| NFR-002 | unchanged screening and persistence; 100-seed sample; paid/auth regressions | Met | No new providers/dependencies or weakened screening |
| NFR-003, P01-T03 | npm test/build/typecheck and 3 saved previews | Met with stated limits | No live voice or aesthetic acceptance claim |
| Plan decisions/updates | automatic scope, duration clarification, helper defaults, critique Pass | Met | No unapproved direction change; lower bound correction now required |
| Documentation | renderer, MCP and service contract diffs | Met apart from RV-001 follow-up | Correctly discloses generator change and listening limits |

### Critique and Follow-Up Assessment

No critique findings; no distinct plan follow-ups. No binding business source cited.

### Reviewer Self-Check

Checked all requirements, markers, changed source/test/docs, critique disposition, validation and follow-up lists in one direct comparison. No source or earlier artifact mutation and no new validation executed during Review. No helper used. No other substantive findings supported. Missing evidence: live Azure vocal quality, listener preference and optional real PostgreSQL integration; all disclosed rather than claimed passed.
