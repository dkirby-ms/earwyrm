<!-- markdownlint-disable-file -->
# Task Research: Generation validation

| Field | Value |
|-------|-------|
| Date | 2026-11-20 (user current date) |
| Researcher | rpi-research |
| Output mode | convergence |

## Executive Summary

All four failures are supported by source evidence. A fixed closing line cannot be repaired by opening-only retries. The existing pronunciation override contract can support explicit browser hints without guessing pronunciations. Contextual preflight and assessment already protect ambiguous wording. Punctuation can normalize in lexical/speech copies while stored and displayed lyrics remain unchanged.

## What You May Not Know

Existing uncommitted generation-flow changes must be preserved.

## Findings

### Fixed text must be checked before retries

Q1, evidence-backed finding (C1): lyric_service generates only a hook in browser mode; lyrics validates every line against an eight-syllable minimum. Short CTAs therefore exhaust retries. Preserve opening limits and require a 16-40 syllable total with a 1-20 syllable closing line. Invalid fixed CTAs should return an explicit rejection with zero generation attempts. Guided exact meter remains unchanged.

### Missing dictionary entries need explicit input, not a guess

Q2, evidence-backed finding (C2): pronunciation throws unknown_pronunciation for dictionary misses. LyricRequest already permits validated ARPABET overrides, but browser requests do not expose them. Accept word-to-spoken-spelling hints using dictionary pronunciations; store derived overrides with the request. Never estimate guided pronunciation. These hints verify meter; Azure voice pronunciation remains subject to listening review, as with existing overrides.

### Context already has independent safety evidence

Q3, evidence-backed finding (C3): IMITATION rejects ordinary sound comparisons before contextual preflight; RISK matches free in feel free to. Narrow deterministic rules to clear cases and retain preflight, independent assessment, moderation, protected-material screening and human holds.

### Display and lexical/speech copies can differ only in punctuation

Q4, evidence-backed finding (C4): ASCII checks reject curly apostrophes. Normalize apostrophes, quotes, dash variants, nonbreaking spaces and ellipses only for validation/tokenization and render input. Exact hook/CTA comparisons and saved lyric metadata retain originals.

## Recommendation and Alternatives

Select shared lexical helpers plus explicit browser hints and targeted error messages. Reject guessed syllable counts or weakening guided checks. Rejected alternative: repairing exact CTAs automatically, contrary to the user's wording-preservation requirement.

## Scope and Questions

Goal: resolve all four supplied failures while preserving safeguards, guided-vocal precision and exact user wording.
Audience: repository maintainers. Scope: lyric validation/generation, API input, supporting browser inputs if required, tests and related docs.
Exclusions: deployment, paid calls, push and unrelated changes.

| ID | Question | Status |
|----|----------|--------|
| Q1 | Can closing-line defects be detected before retries and short spoken CTAs fit safely? | Answered C1 |
| Q2 | What pronunciation mechanism can browser requests safely expose? | Answered C2 |
| Q3 | How can false-positive keyword rules defer to contextual checks without removing safeguards? | Answered C3 |
| Q4 | Where should speech punctuation normalize while display wording stays exact? | Answered C4 |

## Decisions and Feedback

Agent-owned research under user-selected end-to-end mode; no unsettled scope decision.

## Risks and Open Questions

Dirty source files may contain unfinished generation-flow work; integrate rather than replace.

## Planning Readiness and Next Step

Ready: C1-C4 cover all requested fixes. Research disposition: executed. No blockers or unsettled material decisions; agent-owned selection is supported by existing contracts. Continue automatically to Plan.
Primary evidence: .copilot-tracking/research/2026-11-20/generation-validation-research.md.

## Research Record

### Method and Boundaries

Focused posture selected for named internal failures and supplied reproductions. No external sources or helpers needed.
Root: .copilot-tracking/research; date: user current date; prior knowledge: supplied docs/generation-issues.md, not yet verified.
Candidate areas: lyric_service, lyrics, lyric_cloud, jingle_prompt, web_app and existing tests.

### Extensions and Participation

Selected: tracking location/conventions, Markdown/writing and licensing instructions; each applies to evidence only.
Skipped: frontend design skill unless UI changes prove necessary; root-cause-analysis full workflow is unnecessary for bounded fixes with supplied failures.
User confirmed four-finding scope and end-to-end mode; decisions are agent-owned.

### Research Cycle Log

### Cycle 1

1. Wider: inspected lyric contracts, writer, cloud adapter, browser route, existing tests and dirty diff. Reflection: existing closing-only flow and overrides explain the failures.
2. Deeper: traced saved lyric revalidation, score timing and render inputs. Reflection: meter changes must also survive saved-result validation; speech copies can normalize without changing lyric_source.
3. Contrarian: checked guided fixtures, schema bounds, screening order and retry tests. Reflection: no unknown-word fallback is safe for guided timing; explicit hints are appropriate. Opening minimum and total spoken budget prevent tiny jingles. Strict symbols/control characters must remain invalid.

Synthesis: accepted C1-C4; rejected pronunciation estimates and rewriting exact CTAs. No further cycle needed: bounded contract questions answered with direct source evidence. No helpers used.

### Evidence Log

| ID | Claim or finding | Source or location |
|----|----------|----------|
| C1 | Opening-only retries and per-line meter | apps/api/src/lyric_service.ts `parse_candidate`, `write_candidate`; apps/api/src/lyrics.ts `validate_draft` |
| C2 | Validated overrides and browser omission | apps/api/src/lyrics.ts `LyricRequest`, `pronunciation`; apps/api/src/web_app.ts POST /api/jingles |
| C3 | Local keyword gates plus contextual checks | apps/api/src/lyric_service.ts `IMITATION`, `RISK`; apps/api/src/lyric_cloud.ts `preflight`, `assess`, `screen` |
| C4 | Exact comparisons and separate render provenance | apps/api/src/lyrics.ts `words`, `validate_draft`; apps/api/src/web_app.ts `render_inputs`; apps/api/src/render.ts `render_brief` |

### Artifact Self-Check

User-facing synthesis, evidence IDs, all three waves, alternatives, scope, extension authority, no-helper provenance and readiness checked. Source-only evidence; live cloud pronunciation quality is not verified and remains listening-review territory.
