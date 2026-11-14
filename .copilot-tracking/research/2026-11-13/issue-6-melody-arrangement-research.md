<!-- markdownlint-disable-file -->
# Task Research: Melody and Arrangement MCP

| Field | Value |
|---|---|
| Date | 2026-11-13 |
| Researcher | RPI Agent, direct |
| Output mode | convergence |

## Executive Summary

Research complete. Both backing and vocal melodies are hard-coded, so changing
the brief merely rotates/transposes fixed motifs. Replace both, not just the
instrumental. No platform contracts or render queue from dependency #4 exist yet.

## What You May Not Know

Issue #4 is still open. A versioned local contract and durable SQLite queue can
make #6 independently runnable, but cannot claim deployment or cross-service
agreement that has not happened. The current web renderer is synchronous.

## Findings

### Two independent static melodies must change

C1: audio_poc/dsp.py `compose` fixes the progression, rhythm and eight-note motif.
C2: audio_poc/speech.py `align` fixes a separate vocal motif. Evidence-backed,
high confidence from complete source reads. Changing one leaves audible repetition.

### There is no agreed platform contract to reuse

C3: pyproject.toml and tracked file inventory contain only local POC services.
W1: issue #4 remains open and requests contracts, queue, deployment and transport.
Use a documented provisional v1 lyric-window/syllable contract, vocoded/spoken
product path, durable identity and explicit local-only queue owner.

### Existing rendering and rights controls can be preserved

C4: audio_poc/__main__.py `render_brief` owns both CLI and web rendering;
audio_poc/web_app.py `create_render` calls it synchronously and never queues.
C5: audio_poc/dsp.py already exports MIDI and oscillator/noise WAVs; ledgers
correctly retain Pending human rights review. Reuse these instead of samples.

### MCP SDK supplies protocol and transport

W2: Official Python SDK supports typed tools, binary resources, stdio and
Streamable HTTP. Use the supported 1.x API with an explicit upper bound rather
than hand-writing JSON-RPC. Protocol handshake must be tested, not inferred.

## Recommendation and Alternatives

Select seeded phrase-level composition with varying contour, rhythm, chords,
voicing and sections. Preserve seed reproducibility; generate a fresh seed for
new renders. Couple the vocal to the same score. Screen interval sequences,
independent of key, against a documented public-domain reference set, legacy
Earwyrm motifs and persisted delivered output; reject before delivery/queueing.
Prefer explicit failure to silent fallback or unlimited regeneration.

Reject pure random independent notes (not structured jingles), transposition
only (reported defect), and external music generation (unnecessary dependencies
and provenance). Defer cloud queue/deployment to #4/#7.

## Scope and Questions

Goal: implement issue #6 and replace static transposition with actual musical variation.
Audience: Earwyrm maintainers. Scope: local composer, synthesis, timing, MCP,
similarity controls, logical job ownership, directly related application integration.
Non-goals: deploying Azure, legal clearance, unrelated service scaffolding or UI work.
Acceptance criteria: attached issue #6, preserving existing speech and web behavior.

* Q1: What fixes the static melody at its shared source?
* Q2: Which lyric/timing, product-path, queue and MCP contracts already exist?
* Q3: How can screening block transposed/repeated tunes before delivery?
* Q4: Which measurable tests establish timing fit, variety and durable idempotency?

## Decisions and Feedback

D1: User selected end-to-end automatic progression. Ordinary decisions agent-owned.
No acknowledgment walkthrough required.

## Risks and Open Questions

Dependency #4 is not implemented. Local queue is a single-host implementation,
not an Azure substitute. Screening is limited to declared references, not
commercial-catalog or legal clearance. Quality remains a human listening gate.

## Planning Readiness and Next Step

Research disposition: executed. Planning Readiness: Ready (C1-C5, W1-W2).
Agent-owned decisions from confirmed end-to-end mode. Wider, deeper and
contrarian waves complete without helpers. No unresolved material decision.
Parent continues to Plan automatically.

## Research Record

### Method and Boundaries

Focused posture, narrowed from balanced because this is a bounded repository issue
with named acceptance criteria and failure evidence. No arbitrary deadline.
Evidence root: .copilot-tracking/research/2026-11-13/; user-supplied current date.
Primary evidence: .copilot-tracking/research/2026-11-13/issue-6-melody-arrangement-research.md.
Candidate areas: audio_poc, tests, pyproject.toml, docs design and audio contracts,
issue #4. No source edits in Research. Existing unrelated task states left alone.
Prior-knowledge gate: no matching issue-6 state exists.

### Extensions and Participation

Selected tracking location/conventions, Markdown/writing, licensing, telemetry
overlay for their matching artifact boundaries. Research-only writes.
Skipped broad RCA and standalone code review: this request is implementation with
bounded prerequisite investigation, not incident or diff review.
Python guidance will govern implementation. Helpers: none.

### Research Cycle Log

Cycle 1:

1. Wider: inspected source inventory, design sections 4-6 and issue #4. Reflection:
   local DSP and synchronous web exist; no MCP/platform implementation.
2. Deeper: traced compose -> render_brief -> web plus align, MIDI, synthesis,
   tests, storage and provenance. Reflection: independent fixed vocal motif is
   equally important; preserve paid-Speech accounting and authentication.
3. Contrarian: challenged sufficiency of changing keys/bed only, in-memory
   idempotency, exact-pitch-only screening, and implicit cloud claims. Source
   inspection disproves these approaches. Reflection: shared composition and
   durable transactional screening/queue history are required.

Synthesis accepts C1-C5/W1-W2, rejects melody rotation as variation, defers cloud
deployment. No further cycle needed: contracts are absent by full inventory,
local design supplies required boundaries and SDK documentation supplies API.

### Evidence Log

| ID | Source | Claim or finding | Confidence |
|---|---|---|---|
| C1 | audio_poc/dsp.py `compose` | Fixed score and code-only synthesis | High |
| C2 | audio_poc/speech.py `align` | Separate fixed vocal melody | High |
| C3 | pyproject.toml; tracked file inventory | No platform/MCP contracts | High |
| C4 | audio_poc/__main__.py `render_brief`; audio_poc/web_app.py `create_render` | Shared synchronous renderer | High |
| C5 | tests/test_audio_poc.py; audio_poc/__main__.py `component_ledger` | Existing timing/accounting/rights invariants | High |
| W1 | https://github.com/dkirby-ms/earwyrm/issues/4 | Foundation remains open | Retrieved 2026-11-13 |
| W2 | https://raw.githubusercontent.com/modelcontextprotocol/python-sdk/v1.x/README.md; docs/testing.md | SDK tools, transport and in-memory protocol testing | Retrieved 2026-11-13 |

### Artifact Self-Check

All questions answered; evidence, alternatives, boundaries, decisions and
continuation covered. No helpers or secrets. Research-only write boundary held.
