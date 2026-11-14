---
title: Lyric and Hook Writer MCP
description: Run the independent Foundry lyric writer with strict English rules and mandatory safety gates.
---

## Scope

The `write_lyrics` tool produces a hook and lyrics for the 30-second retro-synth
spoken or vocoded path. It does not compose music, render audio, deploy Azure
resources, modify the web application or authorize broadcast.

The contracts are **provisional v1**, pending shared platform contracts in #4.
They reuse the [synthetic brief](audio-poc/protocol.md#synthetic-brief-contract)
and the strict-extra-field contract used by the
[melody service](melody-mcp.md). A lyric result is not a composition request:
the workflow must supply syllable text and timing windows separately.

## Setup and transport

```bash
uv sync --locked
az login
export LYRIC_FOUNDRY_ENDPOINT="https://YOUR-RESOURCE.openai.azure.com"
export LYRIC_MODEL_DEPLOYMENT="YOUR-STRUCTURED-OUTPUT-DEPLOYMENT"
export LYRIC_CONTENT_SAFETY_ENDPOINT="https://YOUR-SAFETY.cognitiveservices.azure.com"
uv run python -m audio_poc.lyric_mcp
```

Endpoints must be HTTPS resource roots, without paths, credentials, query strings
or fragments. The Foundry adapter uses Azure OpenAI's `/openai/v1/chat/completions`
API. Select a deployment supporting strict structured output, such as a compatible
GPT-4o deployment; an unsupported model returns an explicit unavailable outcome.

Use `DefaultAzureCredential`: Azure CLI credentials for local development or
managed identity on Azure. Grant the calling identity **Cognitive Services
OpenAI User** on the model resource and **Cognitive Services User** on the
Content Safety resource. Confirm model, region and protected-material access
before use. Resource provisioning, gateway authentication and release validation
remain separate platform work.

For local Streamable HTTP:

```bash
uv run python -m audio_poc.lyric_mcp --transport streamable-http --port 8002
```

The endpoint is `http://127.0.0.1:8002/mcp`. Do not expose this unauthenticated
local server publicly; use the authenticated gateway for a deployment.
Startup makes no paid calls. Invoking a configured tool uses paid Foundry and
Content Safety requests. There is no offline acceptance or mock fallback.

## Fixed request and output

```json
{
  "schema_version": 1,
  "brief": {
    "brief_id": "brief-001",
    "name": "Bright Bike",
    "offer": "Bike tune ups",
    "location": "Lakeview",
    "contact_details": {
      "email": "shop@example.com",
      "phone": "+1-202-555-0101"
    },
    "tone": "Friendly and practical",
    "approved_claims": [
      "Bike tune ups are available",
      "Call to plan a visit"
    ]
  },
  "product_path": "spoken",
  "cta": "Call Bright Bike to plan your next ride",
  "language": "en",
  "duration_seconds": 30,
  "style": "retro-synth",
  "pronunciations": {}
}
```

The six-field output is nested under a versioned outcome:

```json
{
  "schema_version": 1,
  "status": "accepted",
  "attempts": 1,
  "output": {
    "hook": "Bright Bike, a tune up for your ride",
    "lyrics": "Bright Bike, a tune up for your ride\nCall Bright Bike to plan your next ride",
    "syllables_per_line": [8, 8],
    "rhyme_scheme": "--",
    "brand_count": 2,
    "cta": "Call Bright Bike to plan your next ride"
  },
  "reasons": [],
  "ai_generated": true,
  "broadcast_approval_required": true
}
```

This is an illustrative original response, not evidence of live Azure screening.
`lyrics` is a newline-separated string, not an array. All six model fields are
required, unknown fields and type coercion are rejected, and metadata is
independently checked rather than trusted.

## Product rules

| Rule | Spoken | Vocoded |
|---|---|---|
| Lines | Exactly 2 | Exactly 4 |
| Syllables per line | 8-20 | 8-12 |
| Rhyme scheme | `--`, not required | `AABB`, two distinct rhyme families |
| Brand mentions | Exactly 2 full-token name occurrences | Exactly 2 full-token name occurrences |
| CTA | Exact supplied CTA, entire final line | Exact supplied CTA, entire final line |
| Hook | Equal to a complete non-CTA line | Equal to a complete non-CTA line |

The complete lyric is limited to 400 ASCII characters. Brief fields and CTA must
be single-line printable ASCII. Both input and output undergo English-language
assessment; ASCII alone does not establish English.

CMUdict's first pronunciation supplies syllable counts (vowel phones).
Vocoded line endings must rhyme from the final stressed vowel onward, ignoring
stress digits; identical end words do not count as a rhyme. Unknown words fail
with `unknown_pronunciation`, never an estimated count.
For brand names, supply a lowercase word-to-ARPABET override, for example
`"bright": ["B", "R", "AY1", "T"]`. Overrides are caller-owned pronunciation
directions, not factual sources; they require valid phonemes with a vowel.
Numbers and spoken symbols must be spelled out for pronunciation, not silently
stripped. Lyrics permit letters, spaces, apostrophes, hyphens and ordinary
sentence punctuation (`.,!?;:`), not ampersands, currency signs, slashes, email
addresses or domains. The brief's `name` and supplied CTA must also use this
spoken form; numeric/symbolic brand forms are rejected rather than matched as
a partial name. Contact facts retain their original structured representation.
Use an approved spoken CTA such as a request to call.

These are lexical meter limits, not a guarantee of musical stress or measured
duration. Composition and rendered-audio timing gates still apply.

## Acceptance and failure gates

1. Reject explicit artist-imitation phrasing locally; an independent Foundry
   preflight also checks the entire brief and CTA for implicit named-artist
   requests, English and risky content.
2. Foundry generates strict JSON from the structured brief, supplied CTA,
   pronunciation directions and fixed rules only. No websites, transcripts,
   expected-answer fixtures or conversation history are added.
3. Code checks line counts, syllables, phonetic rhyme, brand mentions, hook and
   CTA placement. An independent Foundry assessment checks **all** hook, lyric
   and CTA claims against factual brief fields, and checks output English/risk.
   Tone and CTA instructions are not approved fact sources.
4. Azure AI Content Safety moderation and English protected-material detection
   screen the complete lyric, including hook and CTA, using API `2024-09-01`.
   All four harm categories must be present at severity zero; protected material
   must explicitly report `detected=false`. Missing, malformed or unavailable
   safety evidence blocks acceptance.
5. Prices, superlatives, guarantees, regulated categories and other risk flagged
   by either assessment or local checks return `human_review_required`, not
   `accepted`, even if the underlying claim is approved.

| Status | Meaning |
|---|---|
| `accepted` | All technical gates passed; not broadcast approval |
| `human_review_required` | Screened draft held for risky-claim review; never automatically send downstream |
| `rejected` | Imitation, unsupported language, model refusal, moderation or protected-material block; no output |
| `retry_exhausted` | All four generation attempts failed; no output, final rule code in `reasons` |
| `unavailable` | Configuration, auth, provider or safety evidence failed; no output |

Candidate JSON/rule/grounding failures and transient generation errors permit
at most **three retries after the initial attempt**. Each attempt makes at most
one generation request. Safety failures, refusal and unavailable assessments
are terminal, not retried to evade a filter. There are no hidden HTTP/model SDK
retries or unbounded outer loops. The worst-case tool call makes one preflight,
four generation calls, four independent assessments and two safety requests.
Each HTTP call has a 30-second timeout (5-second connect timeout).

Protected-material detection covers known English material, not the complete
commercial catalog or trademark rights. Grounding and language assessments are
probabilistic and can miss problems. Every output remains AI-generated and
requires producer and advertiser approval before broadcast; the tool provides
no automatic human-approval override. Live model effectiveness and rights
clearance are not established by local mocked tests.

## Validation and observability

```bash
uv run pytest -q tests/test_lyrics.py tests/test_lyric_cloud.py tests/test_lyric_service.py tests/test_lyric_mcp.py
uv run ruff check audio_poc/lyric*.py tests/test_lyric*.py tests/conftest.py
```

OpenTelemetry emits a server span for `create.lyrics` and client spans for HTTP
calls. Application spans and logs omit brief text, model output, contacts and
tokens; failures use content-free outcome/error codes. HTTP library INFO logs
can include resource endpoints; configure library logging for your environment.
Configure an OTel SDK/exporter in the hosting process with `service.name`,
`service.version` and `deployment.environment` resource attributes. The local
server, like the existing melody service, does not install an exporter.

See Microsoft's [structured output guidance](https://learn.microsoft.com/azure/foundry/openai/how-to/structured-outputs),
[text moderation API](https://learn.microsoft.com/azure/ai-services/content-safety/quickstart-text)
and [English protected-material API](https://learn.microsoft.com/azure/ai-services/content-safety/quickstart-protected-material).
