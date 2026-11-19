<!-- markdownlint-disable-file -->
# RPI Plan: Jingle musicality

## Task Metadata

Task ID and slug: `jingle-musicality`. Date: 2026-11-18.

## Executive Summary

Compose a hook for the guided preview rather than passing its lyric slots through the legacy melody cursor. Keep the existing backing pipeline, duration policy and preview-to-render contract.

### What You May Not Know

Versioning fresh jobs is necessary because existing logical IDs intentionally return the committed audio.

## Phase Checklist

The guided composer and its job version change; the preview-to-render connections remain the same.

<!-- rpi:phase id=P01 -->
### [x] P01: Deliver phrase-based guided previews locally

Goals: Turn the guided preview into a short musical form with an identifiable theme and ending.

Dependencies: Existing score, persistence and similarity paths.

Changes in the map: guided composer and guided job version.

<!-- rpi:task id=P01-T01 -->
#### [x] P01-T01: Compose and version guided previews

Goals: The listener can hear a hook, contrast, recall and a final CTA.

Requirements: `FR-001`, `FR-002`, `NFR-001`.

Details: Repeat a short rhythmic/pitch cell in phrases one and three; let the intervening phrase contrast. Keep syllable count and range valid even at minimum slack. Close the CTA on the fifth into the tonic tag, honoring the existing 25-second speech-window cap even on the longest scores. Keep the audible guide and timing sourced from the same events. Version the new job key and provenance without modifying stored results.

References: [apps/api/src/melody.ts](../../../apps/api/src/melody.ts), [apps/api/src/melody_service.ts](../../../apps/api/src/melody_service.ts), [apps/api/src/web_app.ts](../../../apps/api/src/web_app.ts).

Dependencies: None.

<!-- rpi:task id=P01-T02 -->
#### [x] P01-T02: Validate musical structure and continuity

Goals: Detect a regression to a non-returning theme or a broken preview-to-final link, and make the result auditionable.

Requirements: `FR-001`, `FR-002`, `NFR-001`.

Details: Add at most three focused tests in the existing audio/web suites; no removals or generated test files. Cover recall relative to phrase onset, minimum-slack fit, and cadential placement for both sparse and dense CTA lines. Exercise the existing route and screening regressions. Run a small sequential seed experiment carrying forward accepted interval history, with threshold and retry limit unchanged. Build API and run those suites. Render a matched local instrumental WAV pair with fixed meter, renderer, seed and duration; the pair is a listening aid, not proof of preference. Document the behavior.

References: [apps/api/tests/creative-audio.test.ts](../../../apps/api/tests/creative-audio.test.ts), [apps/api/tests/web_app.test.ts](../../../apps/api/tests/web_app.test.ts).

Dependencies: `P01-T01`.

## User Decisions and Requirements

Improve the music itself. Keep variable length and existing guided workflow. User selected end to end; planning decisions are agent-owned. Use a phrase change rather than a palette-only change (research F1–F3). No unresolved planning choice.

## Planning Readiness and Next Step

Implementation-ready. The standard critique is complete and its two findings are addressed in P01-T02.

## Scope and Non-Goals

Local guided composition, versioning, tests, documentation, and audition artifacts. No external generation, deployment, legacy rewrite or singing-model changes.

## Functional Requirements

* `FR-001`: A returning pitch/rhythm cell, a contrasting middle phrase and a CTA-to-tonic close.
* `FR-002`: Preserve all lyric slots, duration bounds, and committed preview/final continuity.

## Non-Functional Requirements

* `NFR-001`: Deterministic for the same score inputs, screened using the existing policy, and backward compatible with stored jobs and legacy callers.

## Risks and Open Questions

`P01-T01`: preserve diversity under interval-history screening and handle dense CTA fallback without clipping. `P01-T02`: structural tests cannot decide taste.

## Sources

[.copilot-tracking/research/2026-11-18/jingle-musicality-research.md](../../research/2026-11-18/jingle-musicality-research.md). No directly applicable BRD, PRD or ADR located.

## Critique Disposition

Standard, first-task default. Execution: Complete; original verdict Revise. `PC-001` resolved by the sparse/dense fit and cadence coverage. `PC-002` resolved by the bounded screening-history check with unchanged policy. Listening preference remains a residual uncertainty.

## Artifact Self-Check

Scope, order, evidence and focused test ownership recorded.

## Follow-Up Items

Optional: listen for hook recall and how well the finished vocal stresses the brand and CTA.

## Handoff

Changes record: `.copilot-tracking/changes/2026-11-18/jingle-musicality-changes.md`.
