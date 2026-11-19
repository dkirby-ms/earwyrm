<!-- markdownlint-disable-file -->
# Task Research: Jingle musicality

## Executive Summary

The guided path borrows pitches from the legacy composer but discards its composed hook rhythm and most of its lead. Write a short hook for the actual lyric phrases, then bring it back before the CTA resolves.

## What You May Not Know

The strong call-and-response assertions in the current tests exercise the legacy instrumental composer, not the guided melody people select in the web app.

## Findings

**F1 — The guided tune is not organized around lyric phrases.** Verified in C1–C2: `arrange_preview` makes four lyric windows, but `arrange_lines` randomly distributes spare duration among syllables. Its pitch cursor continues across line boundaries, so adding a syllable shifts the next line's melodic entry. The generated pitches are not wholly random; the issue is how the seed motif and rhythm are applied.

**F2 — Preview and final are intentionally linked.** Verified in C3–C4: the server checks stored score, backing, MIDI and timing hashes and binds syllables to the existing notes. A new guided generation version can improve newly generated previews without rewriting prior selections.

**F3 — Delivery matters, but is not the first lever.** Verified in C5–C6: an instrumental preview is already rendered before any speech synthesis. A palette-only change could affect warmth and voice audibility, but cannot create rhythmic recall or a recurring melodic phrase. Sound quality of the vocoded mix remains a separate listening question.

## Recommendation and Alternatives

Use a seeded, phrase-aware composer for guided previews while keeping the legacy caller-specified path intact. Establish a short motif in phrase one, contrast in phrase two, recall it in phrase three independently of intervening syllable count, and end with the CTA resolving into a tonic tag. Keep the existing accompaniment underneath and reuse the exact preview timing and lead in the final.

Defer production polish and lyrics-first stress mapping. The first would leave phrase identity unchanged; the second could improve natural word stress but would change the preview-first product contract and needs a separate design.

## Scope and Questions

Q1. What does the actual guided path do for melodic identity, rhythm, harmony, and closure?
Q2. What local improvement preserves meter, preview/final continuity, and similarity checks?
Q3. What can automated evidence establish, and where is listening needed?

## Decisions and Feedback

D1: User selected end to end, so the session owns decisions. D2: Implement the guided phrase approach (F1–F3). Use local test and audio evidence only; no deployment or paid external generation.

## Risks and Open Questions

Subjective quality is not established by passing structural tests. Short or very dense phrases may not support the full rhythmic shape; preserve the lyric slots rather than truncate words. Motif repetition must not bypass cross-job similarity screening.

## Planning Readiness and Next Step

Ready for Planning. Research disposition: executed. A local matched before/after listening pair can support user judgment; no external evidence is needed to choose the first change.

## Research Record

Workspace root .copilot-tracking/research; date 2026-11-18 from task state. Balanced convergence; previous duration repair was the prior-knowledge input. Read-only source/test inspection directly; no helper for the continuous trace. Tracking location and conventions, Markdown and licensing guidance apply. No external sources or human decisions needed in this cycle.

### Cycle 1

1. Wider: located the guided preview and legacy rendering entries, and separated their test coverage.
2. Deeper: traced the guided random duration allocation, global motif cursor, committed artifacts and old-job return.
3. Contrarian: examined the audio delivery and existing musical assertions; rejected production-only changes for this round, and retained listening as the test for subjective quality. No additional cycle is needed to decide the contained approach.

### Evidence

| ID | Source and locator | Observation |
|---|---|---|
| C1 | apps/api/src/melody.ts, arrange_preview and arrange_lines | Replaces middle lead with the global pitch cursor and randomly allocated syllable lengths. |
| C2 | apps/api/src/dsp.ts, compose and vocal_pitch | Legacy instrumental uses explicit rhythmic call and answer; pitch helper cycles by ordinal. |
| C3 | apps/api/src/web_app.ts, guided_preview and render_inputs | Exact committed score and backing are checked and reused; only syllable labels are bound. |
| C4 | apps/api/src/melody_service.ts, submit | Existing logical IDs return prior results; new jobs screen guide pitches against references/history before commit. |
| C5 | apps/api/src/render.ts, render_brief | Instrumental path exists without a speech provider; vocoded speech uses the committed backing. |
| C6 | apps/api/tests/creative-audio.test.ts, phrase composer cases | Strong hook tests target compose; guided case focuses on CTA length and ending bounds. |
