---
title: Earwyrm
description: Try the Earwyrm jingle proof of concept locally or in the browser.
---

Earwyrm turns sample advertiser briefs into short jingle demos. Start with an
offline instrumental render, or use the signed-in web workspace to create,
compare, and review versions. These are review demos, not broadcast-ready audio.

## Try it without Azure

From the repository root, use Node.js 24, npm, and Linux with util-linux
`flock` installed:

```bash
npm ci
npm run render -- --instrumental-only
```

Open `brief-001/instrumental.wav` inside the new run directory printed under
`renders/`. The command renders all three sample briefs and also writes MIDI
scores and a `summary.json`. This path needs no sign-in, Azure credentials, or
paid API calls.

## Open the web workspace

After `npm ci`, start the API and web client in separate terminals:

```bash
npm run dev:api
```

```bash
npm run dev:web
```

Open [http://localhost:8000/](http://localhost:8000/). Without configured
Microsoft Entra External ID, the page starts in setup mode and you can't
render from the browser. Follow the [web workspace guide](docs/audio-poc/web-app.md)
to configure sign-in and the AI services. Describe the jingle and select
**Generate jingle**. The page shows an estimate before generation and keeps
playback and billing status alongside the result.

## Find the right guide

| Goal | Guide |
|---|---|
| Sign in, enter a brief, or review audio in the browser | [Web workspace](docs/audio-poc/web-app.md) |
| Change the backing sound, run paid Speech from the CLI, or evaluate output | [Audio rendering and evaluation](docs/audio-poc/rendering.md) |
| Run a Model Context Protocol (MCP) tool or look up a schema | [Services and contracts](docs/service-contracts.md) |
| Deploy or maintain the Azure web POC | [Azure operator runbook](docs/azure-deployment.md) |

## Work on the project

The Node API and audio tooling live in [apps/api](apps/api), the React/Vite
client in [apps/web](apps/web), and Azure infrastructure in [infra](infra).
Run `npm run typecheck`, `npm test`, and `npm run build` from the root to check
both workspaces.

This documentation was revised with AI assistance.
