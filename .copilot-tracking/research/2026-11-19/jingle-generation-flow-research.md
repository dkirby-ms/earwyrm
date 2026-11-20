<!-- markdownlint-disable-file -->
# Task Research: Jingle generation flow

| Field | Value |
|---|---|
| Date | 2026-11-19 |
| Researcher | rpi-research |
| Output mode | Analysis, preparing planning |

## Executive Summary

The current web generator calls Azure for text, safety, and one spoken vocal. Earwyrm renders the music and mixes two WAV variants on its own server. Scenario estimate: $0.01952 for one first-pass success, not a quote or measured bill.

## What You May Not Know

The app's upfront maximum is a configured allowance, not a prediction. A vocoded variant reuses the same Speech response.

## Findings

### The browser makes one generation request

GET /api/jingles supplies the estimate and history; POST /api/jingles generates the jingle. The server extracts advertiser facts, preflights the brief, drafts lyrics, checks them locally, and assesses grounding before two Content Safety calls. Accepted lyrics feed a structured score model call. The API does not invoke its separate chat/MCP route to do this. Evidence-backed, high confidence for the checked-out web path (Q1, C1–C3).

### The score is not generated audio

Earwyrm validates lyric timing and melody similarity, renders MIDI and backing WAV locally, synthesizes the lyric text once, aligns it and makes spoken and vocoded mixes. Failed or blocked runs can stop early; the paid path does not substitute offline audio. Evidence-backed (Q1/Q3, C1, C4).

### A first-pass example is about two cents

Assume an illustrative GPT-4.1-mini Global model at $0.40/$1.60 per million input/output tokens, not the verified deployment. Four text calls at 1,500 input and 300 output each cost $0.00432; score at 2,500 input and 900 output costs $0.00244; two single-record safety calls at $0.38/1,000 cost $0.00076; 250 voice characters at the repository sample $48/M cost $0.012. Total $0.01952; hosting/storage excluded. Evidence-backed call structure; token counts, model and indicative rates are assumptions, not billing evidence (Q2, C2–C5, W1–W3).

## Recommendation and Alternatives

Show the browser path with provider call and price annotations, not the older independent endpoints. Document the illustrative total separately from the configuration-based app ceiling and reconcile actuals only with usage and billing evidence.

## Scope and Questions

Trace the current web preview for a reader who wants a diagram of what the system actually does. Identify the steps and API calls (Q1), a reproducible illustrative price (Q2), and skipped, fallback, or repeated calls that affect cost (Q3). No live paid calls or app changes.

## Decisions and Feedback

Use the main Create flow and a worked estimate; the brief does not require the deployment's invoice. No user decision needed.

## Risks and Open Questions

Actual model, token usage, Speech rate and billed charges depend on deployment and usage records.

## Planning Readiness and Next Step

Executed; Ready for planning a standalone diagram. Three waves complete; no helper or blocker. Next: automatic Plan. Primary evidence: .copilot-tracking/research/2026-11-19/jingle-generation-flow-research.md.

## Research Record

### Method and Boundaries

Balanced posture; initial candidates are apps/web/src, apps/api/src, infrastructure defaults, and official provider pricing. Resolve to the workspace tracking root .copilot-tracking/research, using the user-supplied current date and the jingle-generation-flow slug. Verify implementation against any older notes before reuse.

### Extensions and Participation

Shared tracking and location instructions selected. RPI walkthrough informs source navigation; no sequential tutoring requested. No helper needed for the contiguous trace. Agent-owned on the user's “Handle it end to end” selection; the brief supplies enough direction to begin.

### Research Cycle Log

1. Wider: found the web create/history path and adjacent chat, score, and legacy render routes. Reflection: adjacent routes should not be mistaken for browser calls.
2. Deeper: traced paid adapters, local render, safety gates and pricing. Reflection: separate public example rates, configured allowance and reconciled billed usage.
3. Contrarian: checked for additional Speech calls, a fallback, retry behavior, score resubmission and model pinning. One voice call feeds both outputs, candidates retry at most three times, and the score API claims or reuses committed jobs; the checked-in infrastructure takes the model as configuration. No further cycle needed at illustrative precision.

### Evidence Log

| ID | Source | Supports |
|---|---|---|
| C1 | apps/web/src/App.tsx `generateJingle` and jingle history; apps/api/src/web_app.ts `/api/jingles` | Browser and web orchestration |
| C2 | apps/api/src/lyric_service.ts `write_candidate`; apps/api/src/lyric_cloud.ts `complete`, `screen` | Candidate retry and API requests |
| C3 | apps/api/src/web_app.ts `compose_score`; apps/api/src/score_cloud.ts `AzureScoreComposer`; infra/platform.bicep model configuration | Score call, validation, reuse and configurable model |
| C4 | apps/api/src/melody_service.ts `submit_score`; apps/api/src/render.ts `render_brief`; apps/api/src/speech.ts `AzureSpeech` | Local backing/mixes, single voice synthesis |
| C5 | apps/api/src/web_app.ts `jingle_quote`; apps/api/src/lyric_budget.ts `lyric_allowance`; renders/speech-evidence.json | Ceiling formula and sample voice rate |
| W1 | [Azure OpenAI pricing](https://azure.microsoft.com/en-gb/pricing/details/azure-openai/) (2026-11-19) | Example Global token rates |
| W2 | [Azure Content Safety pricing](https://azure.microsoft.com/en-us/pricing/details/content-safety/) (2026-11-19) | Example Standard rate from indexed price and record size from page |
| W3 | [Azure Speech pricing](https://azure.microsoft.com/en-us/pricing/details/speech/) (2026-11-19) | Character-based billing; not verification of the repo sample rate |

### Artifact Self-Check

All three questions answered at scenario precision; checked scope, provenance, retries and pricing caveats. No paid calls made.
