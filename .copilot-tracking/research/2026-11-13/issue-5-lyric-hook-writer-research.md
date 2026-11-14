<!-- markdownlint-disable-file -->
# Task Research: Lyric and Hook Writer

| Field | Value |
|---|---|
| Date | 2026-11-13 |
| Agent | RPI |
| Output mode | convergence |

## Executive Summary

Implement an independent local MCP server using Foundry structured generation,
independent semantic checks, deterministic prosody checks and mandatory Azure
Content Safety APIs. Research complete; planning can start.

## What You May Not Know

Issue #4 remains open: there is no shared lyric schema yet. Like the melody
service, this implementation must document a provisional v1 contract rather
than claim platform deployment or a previously agreed schema exists.
Protected-material screening is English-only and is not legal clearance.

## Findings

### Existing contracts support an independent Python MCP service

The brief fixture has seven provider-neutral fields; the melody service already
uses strict-extra Pydantic contracts and FastMCP with local transports.
Questions Q1; evidence-backed finding, high confidence: C1, C2, C3.
No shared lyric result schema was found in the tracked tree or semantic search;
issue #4 is still open. Define the six specified result fields in provisional v1.

### Safety needs separate checks rather than generator self-certification

Strict JSON constrains shape, not factual accuracy. Use independent Foundry
preflight and grounding/risk assessments, mandatory moderation and English
protected-material calls. Missing, malformed and unavailable safety results
must block acceptance. Do not retry safety refusals. Q2, Q3;
evidence-backed finding: C4, W1, W2, W3; high confidence about API contracts,
limited confidence about semantic detection (model-based, not proof).

### Pronunciation dictionaries are safer than guessed syllables and suffix rhymes

Use CMU pronunciations for vowel counts and last-stressed-vowel rhyme tails;
unknown words need explicit ARPABET overrides, never silent heuristic guesses.
Apply per-path fixed line/count/rhyme rules and recompute model metadata.
Q2; design recommendation supported by C3's explicit timing requirements.
Counts are lexical, not measured performance or a stress-perfect musical meter.

## Recommendation and Alternatives

Select Python + FastMCP, HTTPX REST clients and DefaultAzureCredential, with
CMUdict for deterministic English pronunciation. Use existing Contract/ProductPath.
Choose independent Foundry verification over relying on model-reported facts.
Reject suffix-based rhyming and regex-only grounding as insufficient.
Avoid the retiring Content Safety groundedness preview; Foundry verification
keeps grounding independent of that preview. UI, deployment and orchestration deferred.

## Scope and Questions

Build the existing application's Lyric and Hook Writer MCP service, not a new application.
Audience: repository contributors. Criteria: all issue #5 acceptance criteria.
Exclude deployment, tracker writes, unrelated UI, commits and pushes.

| ID | Question | Status |
|---|---|---|
| Q1 | What fixed contracts and service conventions apply? | answered: C1-C3 |
| Q2 | How can claims, prosody and safety fail closed? | answered: C3-C4, W1-W3 |
| Q3 | Which Foundry and screening APIs fit existing dependencies? | answered: W1-W3 |

## Decisions and Feedback

| Group | Decision or feedback item | Status | Owner | Evidence |
|---|---|---|---|---|
| D1 | Provisional strict v1 schema; no claim that #4 is done | confirmed | agent | C1-C3, live issue #4 |
| D2 | Support spoken and vocoded fixed policies, retain human approval | confirmed | agent | C3-C4 |
| D3 | One initial generation plus at most three retries; no SDK hidden retries | confirmed | agent | C4 |
| D4 | Fail closed on all missing safety evidence | confirmed | agent | W1-W3 |

Automatic, agent-owned decisions authorized by the user's end-to-end selection.
No unresolved material choice needs a walkthrough.

## Risks and Open Questions

Live cloud validation depends on explicit paid-call consent and configured
resources; use HTTP transport fakes to verify adapters without cloud calls.
Independent semantic review can have false negatives; human approval remains
mandatory before broadcast. Prices, superlatives and regulated claims must
be held for human review, never returned as accepted.

## Planning Readiness and Next Step

| Field | Record |
|---|---|
| Research disposition | executed |
| Execution status | complete |
| Decision participation | agent-owned; automatic user selection |
| Planning Readiness | Ready |
| Research depth and helpers | Wider, Deeper, Contrarian complete; no helpers |
| Blockers | none for local implementation; live Azure validation deferred |
| Output mode and planning support | convergence; yes |
| Continuation owner | automatic RPI Agent |
| Next action | rpi-plan |
| Primary evidence file | .copilot-tracking/research/2026-11-13/issue-5-lyric-hook-writer-research.md |

## Research Record

### Method and Boundaries

Balanced posture, default. Root: .copilot-tracking/research/.
Date supplied by user: 2026-11-13. Primary path: .copilot-tracking/research/2026-11-13/issue-5-lyric-hook-writer-research.md.
Prior-knowledge gate: no matching lyric session; existing melody service is a candidate pattern, not yet verified.
Candidate areas: contracts, audio_poc/melody_service.py, audio_poc/melody_mcp.py, docs/design-proposal.md, pyproject.toml; official Microsoft Foundry and Content Safety APIs.

### Extensions and Participation

Tracking, Markdown, writing-style and licensing instructions selected for evidence authoring.
Domain security assessment skills skipped: implementing specified safety gates, not a security audit.
No helpers required for a continuous contract-to-service trace.
No unresolved intake decision: issue #5 supplies scope and acceptance criteria.

### Research Cycle Log

#### Cycle 1

##### Wave 1: Wider

Read design, dependency issue, package manifest, existing MCP service and brief.
Reflection: no new application or deployment scaffold is needed; provisional
lyric schema is necessary because #4 has not landed.

##### Wave 2: Deeper

Read melody contracts and MCP tests, official structured-output and Content
Safety API documentation. Reflection: all-field-required JSON schema, explicit
finish/refusal handling and complete safety responses are essential.

##### Wave 3: Contrarian

Challenged prompt-only validation, guessed syllables, model-reported metadata
and accepting incomplete moderation arrays. These alternatives fail closed
requirements. Foundry verification is probabilistic; retain human approval.
Retiring groundedness preview is unnecessary.

##### Synthesis and Re-entry

Accept strict contracts, independent verification, dictionary prosody and
mandatory screening. Reject shape-only validation and implicit safety defaults.
No further cycle required: API details and scoped implementation choices are
covered. Live service effectiveness is a later deployment validation, not
evidence that can be invented here.

### Evidence Log

| ID | Claim or finding | Source or location | Retrieved |
|---|---|---|---|
| C1 | Seven-field brief | docs/audio-poc/protocol.md, Synthetic Brief Contract | not applicable |
| C2 | Existing package and MCP service pattern | pyproject.toml; audio_poc/melody_mcp.py, create_server | not applicable |
| C3 | Provisional strict contracts; spoken/vocoded | audio_poc/melody.py, Contract and CompositionRequest | not applicable |
| C4 | Required safety and bounded retries | docs/design-proposal.md, sections 5-6; supplied issue #5 | not applicable |
| W1 | Strict schema and refusals | https://learn.microsoft.com/azure/foundry/openai/how-to/structured-outputs | 2026-11-13 |
| W2 | Four-category severities and REST version | https://learn.microsoft.com/azure/ai-services/content-safety/quickstart-text | 2026-11-13; 2024-09-01 |
| W3 | English protected material detection | https://learn.microsoft.com/azure/ai-services/content-safety/quickstart-protected-material | 2026-11-13; 2024-09-01 |

Helpers: none. Contradictions: shared schema expected by issue #5 is not yet
available from #4; resolve with explicitly provisional versioning, matching C3.

### Artifact Self-Check

All questions answered; three waves completed and reflected; alternatives,
provenance, decisions, limitations and continuation recorded. No secrets or
protected lyric excerpts copied. Research-only write boundary held.
