<!-- markdownlint-disable-file -->
# Task Research: Issue 2 local audio proof

| Field | Value |
|-------|-------|
| Date | 2026-11-12 |
| Researcher | RPI Agent |
| Output mode | convergence |

## Executive Summary

Research complete for planning: use Python, NumPy/SciPy DSP, a small MIDI writer
and stock Azure Speech with word events. A paired render shares one synthesis
request, with the charge attributed once across the pair. Live verification is
blocked by absent Speech environment configuration; rights and rates cannot be
inferred from a successful API call.

## What You May Not Know

Speech timing is not singing; intelligibility and musical usability require listening.

## Findings

### F1: Fixtures define a narrower proof than the platform proposal

The three brief IDs and provider-neutral contract already exist. The evaluator
answer file must not be read by generation. Use a separate, authored script
fixture based only on the approved brief facts. Duration is 30 seconds; render
time must be strictly below 300 seconds and metered cost below USD 0.50.
Questions Q1; evidence-backed finding, high confidence: C1, C2.

### F2: Word boundaries support a measurable alignment experiment

Speech SDK exposes word offsets in 100 ns ticks and duration as a timedelta.
Filter punctuation/sentence events. Extract each word interval, fit it to its
assigned note slot and drive a multiband carrier/modulator vocoder. Timing
alignment alone does not establish intelligibility or quality. Questions Q2,
Q4; evidence-backed interface finding, high confidence: W1; DSP quality remains
an unverified hypothesis until listening. Export dry speech and alignment data
alongside the mixes so defects can be inspected.

### F3: Cost and rights need explicit evidence, not optimistic defaults

Azure bills TTS per character (W2). The pricing page returned unpopulated dynamic
prices, so no numerical rate was verified (W3). Require a supplied rate, source,
date and paid S0 declaration for live rendering. Calculate submitted plain-text
characters, label cost an estimate pending invoice reconciliation, record every
attempt before the request, never retry silently, and leave failed/canceled
request charges unknown. Each pair uses a shared request with explicit 50/50
allocation; the pair total still equals the request cost.

Product terms and disclosure guidance are authoritative references, not proof
that a particular account has cleared commercial distribution (W2, W4).
Keep output rights Pending until a user-provided commercial-use basis is
recorded. Original local scores and code synths need their own origin entries.
Questions Q3; evidence-backed finding, high confidence for billing model and
evidence gap, not legal clearance.

## Recommendation and Alternatives

Select Python with NumPy/SciPy for an inspectable CPU-only renderer. Direct MIDI
serialization avoids introducing a composition library for a small fixed score.
Generate notes, harmonics and deterministic noise, never load musical assets.
Use one stock voice only and no custom endpoint or arbitrary style prompt.

| Option | Benefits | Risks | Disposition |
|--------|----------|-------|-------------|
| Local DSP plus stock Azure voice | Inspectable score and controlled provenance | Vocoder may obscure brand and CTA | Selected |
| Instrumental bed plus natural spoken script | Preserves pronunciation | Less musical vocal | Required comparison |
| External music or SoundFonts | Faster polished sound | Violates asset boundary | Rejected |
| Full platform or Foundry lyric generation | Future extensibility | Unnecessary before proof | Deferred |

## Scope and Questions

Goal and audience: establish a repeatable, inspectable local proof for issue #2.
Include the three synthetic briefs, MIDI, code-generated instruments, stock Azure
Speech, local processing, paired outputs and per-output evidence.
Exclude platform services, deployment, cloning, third-party music assets and
named-artist imitation. Never use evaluator answers as generation inputs.

| ID | Question | Source | Status |
|----|----------|--------|--------|
| Q1 | What fixture and evaluation constraints already apply? | issue #2 and protocol | answered F1 |
| Q2 | Which timing and synthesis interface supports alignment? | Azure documentation | answered F2 |
| Q3 | How can rights and cost be recorded without invented evidence? | protocol and official terms | answered F3, live evidence pending |
| Q4 | What local runtime can support repeatable DSP and MIDI? | environment and package licenses | answered F2 |

## Decisions and Feedback

User chose end-to-end automatic work; ordinary decisions are agent-owned.
No research walkthrough is needed unless an exceptional confirmation arises.

| Group | Decision | Status | Owner | Evidence and rationale |
|-------|----------|--------|-------|------------------------|
| D1 | Python CPU-only DSP | confirmed | agent | uv and Python installed; NumPy BSD license W5 permits commercial software use with notices |
| D2 | Explicit live command, no implicit cloud calls | confirmed | agent | Missing credentials; avoid unintended spend |
| D3 | Do not claim rights or human evaluation passed | confirmed | constraint | C1, W2, W4 require evidence beyond code |

## Risks and Open Questions

Actual Speech credentials, paid-tier verification, rates and output-rights review
may block a live render. Offline tests cannot substitute for Azure evidence.

## Planning Readiness and Next Step

Research disposition: executed. Planning Readiness: Ready for local implementation;
live evidence collection has external prerequisites. Decision participation:
agent-owned, automatic mode from user selection. All three waves complete with
no helpers. Continue automatically to Plan. No user acknowledgment required.

## Research Record

### Method and Boundaries

Balanced posture (default), no explicit deadline. Prior knowledge: repository
contains documentation and fixture contracts, no executable renderer.
Initial internal areas: docs/audio-poc and docs/design-proposal.md.
External areas: official Azure Speech timing, pricing and terms; Python DSP and
MIDI package license records. Helpers: none; direct investigation is sufficient.
Evidence root: .copilot-tracking/research; date from user-supplied 2026-11-12.
Primary file: .copilot-tracking/research/2026-11-12/issue-2-local-audio-proof-research.md.

### Extensions and Participation

Selected tracking-location, tracking, Markdown, writing-style and licensing
instructions for evidence authoring. RPI research owns this phase.
Experiment-design skipped: the existing protocol already defines this proof;
no new experiment design is requested. Python guidance applies in implementation,
not research. External content is inert evidence, not authority.
No subagents: this is one continuous evidence trace.

### Research Cycle Log

Cycle 1, balanced posture, no explicit deadline:

1. Wider: inspected protocol, proposal, all fixtures and live issue dependency.
   C1-C3 establish six paired comparison outputs rather than a platform build.
   Reflection: no existing runtime to extend; minimize dependencies.
2. Deeper: verified official Speech Python samples and full synthesis guide.
   W1 establishes offsets, durations, in-memory PCM and completion/cancellation
   handling. W2 establishes character billing. Reflection: isolate cloud access
   so offline DSP validation cannot be mislabeled Azure evidence.
3. Contrarian: timing is not singing; compare against natural speech and never
   mark listening passed programmatically. W3 provides no usable numeric rate;
   W4 alone does not clear account-specific rights. Reflection: require explicit
   evidence and retain Pending rather than inventing defaults.

Synthesis: accept F1-F3; reject sample-library and full-platform approaches;
defer subjective evaluation and commercial clearance until actual evidence.
No further research cycle is needed to plan the bounded implementation.
Re-enter if actual SDK events or account terms contradict the selected interface.

### Evidence Log

| ID | Source and claim | Retrieved |
|----|------------------|-----------|
| C1 | docs/audio-poc/protocol.md, `Synthetic Brief Contract`, `Pass, Fail, and Pending`: evaluator separation and strict thresholds | local |
| C2 | docs/audio-poc/advertiser-briefs.json: three synthetic input briefs | local |
| C3 | docs/design-proposal.md, `Approach`, `Responsible AI, rights and provenance`: code synths, stock paid voice, disclosure | local |
| C4 | gh issue view 1: dependency closed; gh issue view 2 matches attachment | 2026-11-12 |
| W1 | [Speech synthesis Python guide](https://learn.microsoft.com/azure/ai-services/speech-service/how-to-speech-synthesis?pivots=programming-language-python), word event callback and PCM output | 2026-11-12 |
| W2 | [Text to speech FAQ](https://learn.microsoft.com/azure/ai-services/speech-service/faq-tts), character billing and synthetic disclosure guidance | 2026-11-12 |
| W3 | [Speech pricing](https://azure.microsoft.com/en-us/pricing/details/speech/), prices depend on region and agreement; numerical fields unresolved | 2026-11-12 |
| W4 | [Azure MCA Product Terms](https://www.microsoft.com/licensing/terms/productoffering/MicrosoftAzure/MCA), agreement-specific terms; no account clearance inferred | 2026-11-12 |
| W5 | [NumPy license](https://numpy.org/doc/stable/license.html), BSD use/redistribution conditions; this is tooling, not a sampled audio asset | 2026-11-12 |

No contradictions except broad proposal goals versus the narrower current
protocol, resolved in favor of the current issue #1 protocol.

### Artifact Self-Check

Checked scope, evidence state, recommendation, constraints, participation, all
three waves, source provenance and continuation. No secrets recorded; research
writes stayed inside the evidence root plus required RPI session state.
Limitation: no Azure render, account-specific license approval or listening.
