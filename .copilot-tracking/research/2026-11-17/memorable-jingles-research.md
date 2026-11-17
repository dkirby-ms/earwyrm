<!-- markdownlint-disable-file -->
# Task Research: Memorable jingles

| Field | Value |
|---|---|
| Date | 2026-11-17 |
| Researcher / agent | rpi-research |
| Output mode | convergence |

## Executive Summary

Research is complete. Improve the shared composer with a recurring question/answer motif, chord-aware phrase endings and sectional orchestration. New web/CLI renders should use whole-bar verse/hook/cadence forms, usually around 14-20 seconds, extending only when complete speech requires it. Do not enforce 15 seconds. Source evidence is strong; perceived musical quality remains a listening judgment.

## What You May Not Know

The web/CLI renderer bypasses the MCP syllable service (C3). A fix confined to MCP would not change the audio heard in the web app. Synthetic oscillators and vocoded stock speech remain demo instruments, not natural singing.

## Findings

### Melodies vary between seeds but lack development within a jingle

The random-walk motif is shifted by the chord and inverted at a fixed time, while bass and kick repeat every beat. Variation across seeds is not the same as a memorable recurring hook. Use purposeful motif recurrence, an answering phrase and a tonic resolution with sparse verse and fuller hook.

* Questions: Q1
* Evidence state: evidence-backed finding
* Evidence: C1, C2
* Confidence: high for score structure; aesthetic improvement needs listening.

### Duration is a pipeline invariant, not a display setting

PCM, MIDI end time, speech windows, normalization, MCP schemas and quality gates assume 30 seconds. The web UI already shows measured seconds. Coordinate these internals while keeping default helper calls and stored historical results readable.

* Questions: Q2
* Evidence state: evidence-backed finding
* Evidence: C1-C5
* Confidence: high; directly read call sites and schemas.

### Speech must remain complete and honestly described

Source word events are checked for coverage. Keep that invariant; reserve separate phrase windows for verse and brand/CTA hook. Extend the musical form for natural speech instead of cropping. Automated checks can establish duration, motif recurrence, pitch range, sectional density and integrity, but not listener recall.

* Questions: Q3
* Evidence state: evidence-backed finding
* Evidence: C3, C4, C6
* Confidence: high for technical constraints; perceived authenticity unresolved until listening.

## Recommendation and Alternatives

Selected: improve the current local composer and phrase-aware timing. Keep explicit 30-second MCP requests and default legacy DSP/speech helper durations compatible, but make new web/CLI outputs phrase-led. Update directly related docs and narrow regressions.

Rejected: crop a 30-second file (cuts phrases), enforce exactly 15 seconds (contradicts user), or add an external music provider (new cost/rights/infrastructure outside request). Preserve lyric screening and fixture script content; those contracts need not change to improve the music.

## Scope and Questions

* Goal: improve memorable melodic identity, phrase development, arrangement contrast and concise verse/chorus-hook form.
* Audience and use: repository maintainers and jingle listeners.
* In scope: melody, arrangement, lyrics, rendering, duration contracts, directly dependent UI and tests.
* Out of scope: deployment, paid external generation, tracker writes, unrelated cleanup.
* Criteria: repeatable musical structure, bounded event timing, lyric fit, phrase-led shorter duration, regression preservation and locally inspectable audio.
* Output: evidence-supported implementation recommendation.

| ID | Question | Source | Status |
|---|---|---|---|
| Q1 | What currently makes composition and arrangement repetitive? | User request | answered C1-C2 |
| Q2 | Which duration and lyric contracts require coordinated changes? | User clarification | answered C1-C5 |
| Q3 | What can automated checks establish, and what still needs listening? | Acceptance inference | answered C4-C6 |

## Decisions and Feedback

| Group | Decision or feedback item | Status | Owner | Rationale | Evidence | Impact |
|---|---|---|---|---|---|---|
| D1 | End-to-end automatic work | confirmed | user | User selected Handle it end to end | Conversation | Automatic progression |
| D2 | Do not enforce exactly 15 seconds | confirmed | user | User clarification | Conversation | Phrase-led duration |
| D3 | Improve shared local composer; no provider change | confirmed | agent | Directly reaches web/CLI and MCP | C1-C4 | Ready |
| D4 | Keep legacy helper defaults and explicit 30-second requests | confirmed | agent | Avoid breaking old integrations; new render path chooses its form | C1-C5 | Ready |

## Risks and Open Questions

Perceived memorability requires listening; objective tests cannot prove aesthetic success.

## Planning Readiness and Next Step

| Field | Record |
|---|---|
| Research disposition | executed, complete |
| Decision participation | agent-owned; automatic user authorization |
| Planning Readiness | Ready; C1-C6 cover shared composer, callers and validation |
| Research depth and helpers | Wider, Deeper, Contrarian complete; no helpers |
| Blockers | None |
| Output mode and planning support | convergence; supports planning when ready |
| Continuation owner | confirmed automatic RPI parent |
| Required gates or confirmations | Passed for local planning; no paid calls authorized |
| Next action | Parent automatically activates Plan |
| Primary evidence file | .copilot-tracking/research/2026-11-17/memorable-jingles-research.md; date from session 2026-11-17 |

## Research Record

### Method and Boundaries

* Posture: balanced, default; investigate composition plus dependent lyric/rendering contracts.
* Helper effort: auto; none selected.
* Root: /home/saitcho/earwyrm/.copilot-tracking; no alternate root.
* Initial candidate areas: apps/api/src/melody.ts, dsp.ts, render.ts, lyrics.ts, contracts.ts, apps/web/src and creative-audio tests.
* External sources: only if internal evidence leaves a material technical question.
* Limits: research-only source access; workflow state writes permitted. No explicit deadline.
* Prior knowledge: completed issue-6-melody-arrangement state is related historical work, not authorization to reopen its finished task.

### Extensions and Participation

| Kind | Candidate | Disposition |
|---|---|---|
| instruction | Tracking location/conventions, Markdown/writing, licensing | Selected for artifact ownership and prose |
| instruction | TypeScript TSDoc | Relevant to later implementation, not research writes |
| skill | Domain-specific research extension | None applicable; not an incident, EDA, architecture or provider-research request |

No intake questionnaire needed: agent-owned decisions and explicit duration clarification suffice.

### Research Cycle Log

#### Cycle 1

##### Wave 1: Wider

Inspected DSP, composition service, web dispatch, lyric policy and render contracts. The web/CLI renderer composes independently of the syllable-based MCP service. Both ultimately use the same DSP composer. Duration is fixed in several independently validated layers, not a UI-only setting.

Reflection: prioritize the shared composer and actual web/CLI render path, then keep MCP requests/artifacts consistent. Changing only MCP cannot fix what the user hears in the web app.

##### Wave 2: Deeper

The current motif is a random walk; harmony is applied by adding the entire chord degree, with a timed inversion at seconds 14-22. Every bar repeats identical bass/kick patterns. Speech is packed from second 3 without verse/hook separation. The fixture script has three sentences that naturally provide a verse and brand/CTA hook.

Reflection: use a short recurring motif with question/answer development, chord-aware contour, intentional cadence and sectional orchestration. Align script phrases to the verse/hook boundary while preserving complete words.

##### Wave 3: Contrarian

Existing tests deliberately preserve exact score hashes and 30-second proof gates. Historical artifacts and stored identities must remain readable, but new scores can change intentionally. The public web UI already displays measured duration dynamically. Natural speech may exceed a short target and must extend a phrase-aligned form or fail explicitly, never truncate. Oscillator synthesis and a vocoder cannot honestly promise natural singing.

Reflection: retain legacy 30-second DSP call defaults and support explicit 30-second composition, while new web renders choose shorter phrase-led durations. Do not change providers, moderation or approval workflows. Numeric musical checks supplement, not replace, listening.

### Evidence Log

| ID | Claim | Source or location | Retrieval | Tool | Confidence |
|---|---|---|---|---|---|
| C1 | Motif, fixed arrangement, PCM and MIDI assumptions | apps/api/src/dsp.ts `musical_plan`, `compose`, `normalize`, `write_midi` | not applicable | view | high |
| C2 | Syllable timing, chord mapping and durable artifacts | apps/api/src/melody.ts `arrange`, `CompositionRequest`; apps/api/src/melody_service.ts `submit` | not applicable | view | high |
| C3 | Actual web/CLI render uses independent composer | apps/api/src/render.ts `render_brief`; apps/api/src/web_app.ts `selected_inputs` | not applicable | view | high |
| C4 | Complete word coverage and fixed target window | apps/api/src/speech.ts `align`, `place_spoken`, `validate_utterance` | not applicable | view | high |
| C5 | Fixed quality limits and regression expectations | apps/api/src/contracts.ts `QualityReport`; apps/api/tests/platform.test.ts; apps/api/tests/creative-audio.test.ts | not applicable | view | high |
| C6 | Fixtures provide brand/offer/CTA; display uses measured duration | docs/audio-poc/generation-scripts.json; apps/web/src/App.tsx `formatSeconds`; docs/audio-poc/rendering.md | not applicable | view/rg | high |

Helpers: none. External claims/sources: none. Synthesis accepts C1-C6, rejects cropping/provider replacement, defers listener aesthetic judgment. No additional cycle: all technical questions answered; further source reads would not settle perception.

### Artifact Self-Check

Artifact self-check complete: scope, findings, alternatives, decisions, risks, readiness, extensions, three ordered waves, reflections and evidence IDs checked. No unsupported aesthetic acceptance claim; no source writes or paid requests. No unresolved planning blocker.
