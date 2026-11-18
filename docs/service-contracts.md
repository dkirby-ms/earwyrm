---
title: Services and contracts
description: Find the local tools, their runtime boundaries, and the canonical schemas.
---

[Back to the README](../README.md)

## Overview

The [web app](audio-poc/web-app.md) uses real Model Context Protocol (MCP)
calls for collaborative chat, screened lyric writing and arrangement previews.
The API connects MCP SDK clients to its lyric and melody servers over linked
in-process transports, closes both ends after each operation, and independently
checks resource digests. No public MCP endpoint or separate deployment is needed.
The fifteen-minute MCP operation deadline covers the writer's existing bounded
provider stages; individual credential/HTTP waits and retry counts are unchanged.
Existing non-chat rendering and the [CLI](audio-poc/rendering.md) remain direct.
There is no general queue worker.

## Run the MCP tools locally

With the [local prerequisites](../README.md#try-it-without-azure) installed,
run `npm ci` and `npm run build` at the repository root. For stdio, configure
your MCP client to run `node` with one of these arguments and set its working
directory to the repository root. Use `node` directly to avoid npm banners
on the protocol stream.

| Service | Stdio argument | Tool names |
|---|---|---|
| Lyric and Hook Writer | `apps/api/dist/lyric_mcp.js` | `suggest_jingle`, `write_lyrics` |
| Melody and Arrangement | `apps/api/dist/melody_mcp.js` | `compose_arrangement`, `get_render_job` |

For Streamable HTTP, run `npm run lyric-mcp -- --transport streamable-http --port 8002`
or `npm run melody-mcp -- --transport streamable-http --port 8003` and connect
to `/mcp` on `127.0.0.1` at that port. These loopback endpoints are
unauthenticated; do not expose them publicly.

### Lyric writer

`suggest_jingle` accepts a lyric `request` and one to twelve bounded `messages`
ending with a user message. It screens conversation context and returns advice
plus a creative direction, not approved lyrics or instructions to execute tools.
It never invokes another tool automatically. The writer accepts an optional
`creative_direction`, which is screened and cannot replace advertiser facts.

`write_lyrics` takes a `request` object with a brief, spoken or vocoded product
path, and English lyric constraints for a 30-second spot. See the
[lyric schemas](../apps/api/src/lyrics.ts) for exact fields and statuses.
It returns screened lyrics or an explicit held, rejected, or unavailable
outcome. It does not compose or render audio.

Set `LYRIC_FOUNDRY_ENDPOINT`, `LYRIC_MODEL_DEPLOYMENT`, and
`LYRIC_CONTENT_SAFETY_ENDPOINT` for paid generation. Both endpoints must be
HTTPS resource roots. Use a model deployment supporting strict structured
output and a `DefaultAzureCredential` identity with Cognitive Services OpenAI
User and Cognitive Services User on the respective resources. Startup makes
no paid calls; a configured tool invocation does. Do not retry around
screening or send held lyrics to audio automatically.

### Melody and arrangement

`compose_arrangement` takes a `request` object with a `logical_job_id`, lyrics
and syllable timing, and optional duration and seed. See the
[composition schema](../apps/api/src/melody.ts) for exact fields. The tool
screens the melody, writes backing WAV and MIDI, and commits one queued job.
It does not call Speech. Asset references are private MCP resources.

Retry a lost response using the same normalized request and `logical_job_id`.
The tool returns the existing job; a changed payload under that ID conflicts.
Use `get_render_job` for status rather than publishing a second job. A
similarity pass covers only the [bounded references](../apps/api/src/similarity.ts)
and history in the selected store, not copyright clearance.

### Browser chat and exact vocals

Authenticated `/api/chat` exposes explicit `discuss`, `write`, and `compose`
actions. Discussion and writing require paid entitlement, `LYRIC_ENABLED=true`
and literal per-action consent. They share the lyric model and Content Safety
configuration above; their charges are separate from Speech estimates.

The web API also requires `LYRIC_MODEL_CALL_MAX_USD`,
`LYRIC_SAFETY_CALL_MAX_USD`, `LYRIC_PER_ACTION_CAP_USD`, and
`LYRIC_TOTAL_BUDGET_USD`. Use positive USD decimals approved for the exact
deployment and screening configuration. The first two amounts upper-bound one
model and one Content Safety request, respectively. For the model, include the
deployment's full input context at uncached pricing and up to 1,200 output
tokens, including reasoning tokens if applicable. For Content Safety, cover
the more expensive of moderation and protected-material detection and all
billable units in that request. Use metered deployments with verifiable prices.

| Action | Max model requests | Max safety requests |
|---|---:|---:|
| Discuss | 2 | 2 |
| Write a draft | 9 | 2 |
| Generate 3 lyric options | 27 | 6 |

The API reserves the entire action cost before contacting either provider.
Requests larger than 64 KiB after serialization are blocked by the web
adapter. Failed and partial actions keep their reservation. The cumulative
allowance is shared by all users of the database, persists across restarts,
and does not automatically reset or credit unused calls. It is an app-side
upper-bound ledger, not Azure invoice tracking or a subscription-wide cap.
Standalone MCP does not use this web ledger.

Composition accepts only an owner-scoped, accepted, immutable lyric option.
Its stable logical ID recovers one private music preview after a lost response,
including partially published runs. The web preview's completed status means
its backing is available, not that the composition queue job delivered vocals.
That queue row stays queued; this flow consumes committed artifacts synchronously.

Paid vocal rendering selects the published job with `composition_selections`
and its accepted option with `lyric_selections`. The existing estimate and
confirmation bind the exact brief, lyric, job and backing digest. The renderer
loads protected MCP WAV, MIDI and score resources; it does not recompose, resize,
or compare the arrangement against its own history. Both spoken and vocoded
mixes fit complete Speech word intervals to committed syllable notes and retain
the original duration. Mixing ducks and normalizes the backing; the final mix
is not byte-identical to the instrumental WAV.

Syllables use dictionary counts and orthographic slices, not phoneme alignment.
Sung output is an approximate demo, not natural singing. All results retain
human broadcast review and paid usage reconciliation. Transcripts are bounded
page memory per advertiser and clear on sign-out or reload; accepted options
and protected previews persist in existing storage.

## Look up schemas

Run `npm run contracts` to print the versioned JSON Schema catalog. The
[contract source](../apps/api/src/contracts.ts) composes the canonical Zod
definitions, including render messages, job status, quality, provenance, and
approval. The catalog is not a single request body, and a validated quality
report is not a broadcast approval.

The separate [platform scaffold](../apps/api/src/platform_service.ts) exposes
contracts and health but does not integrate generation: `POST /jobs` returns
`501`. For the browser API, use [the web server source](../apps/api/src/web_app.ts)
and [its tests](../apps/api/tests/web_app.test.ts) as the current reference.
