---
title: Services and contracts
description: Find the local tools, their runtime boundaries, and the canonical schemas.
---

[Back to the README](../README.md)

## Overview

The [web app](audio-poc/web-app.md) and [CLI](audio-poc/rendering.md) render
directly. The independent Model Context Protocol (MCP) tools expose lyric
generation and queued composition separately. The
[Azure web deployment](azure-deployment.md) does not deploy those MCP tools,
and no integrated queue worker delivers final vocal mixes.

## Run the MCP tools locally

With the [local prerequisites](../README.md#try-it-without-azure) installed,
run `npm ci` and `npm run build` at the repository root. For stdio, configure
your MCP client to run `node` with one of these arguments and set its working
directory to the repository root. Use `node` directly to avoid npm banners
on the protocol stream.

| Service | Stdio argument | Tool names |
|---|---|---|
| Lyric and Hook Writer | `apps/api/dist/lyric_mcp.js` | `write_lyrics` |
| Melody and Arrangement | `apps/api/dist/melody_mcp.js` | `compose_arrangement`, `get_render_job` |

For Streamable HTTP, run `npm run lyric-mcp -- --transport streamable-http --port 8002`
or `npm run melody-mcp -- --transport streamable-http --port 8003` and connect
to `/mcp` on `127.0.0.1` at that port. These loopback endpoints are
unauthenticated; do not expose them publicly.

### Lyric writer

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
