---
title: Earwyrm architecture and Azure AI integration
description: System architecture, Azure AI components, and operational controls for the Earwyrm jingle proof of concept.
---

## Overview

Earwyrm turns an advertiser's description into a short jingle demo with original
lyrics, AI-composed music, and a synthetic voice. Azure AI generates the content;
application code validates it, controls musical timing, renders and mixes the
audio, and enforces spending limits. Outputs are intended for human review, not
as broadcast-ready masters.

## System architecture

A React/Vite web workspace and Node.js/Express API run in a single Azure
Container App, sharing one HTTPS origin and container image. The generation
pipeline extracts advertiser facts and a closing line, writes and screens
lyrics, composes a structured musical score, renders the backing track locally
with MIDI and FluidSynth, and mixes it with Azure Speech audio. If a stage fails,
the application reports the failure rather than substituting fallback music.

PostgreSQL stores structured records, permissions, generation jobs, and budget
reservations. Azure Files holds private audio and working artifacts. Local
operation can use SQLite and supports instrumental rendering without paid
Azure calls.

Model Context Protocol (MCP) connects collaborative chat, lyric tools, and
deterministic arrangement previews through linked in-process clients and
servers. Artifact digests are checked before use. The main generation workflow
also calls services directly; there is no public MCP endpoint or general
background queue worker.

## Azure AI components

### Microsoft Foundry

One shared OpenAI-compatible model deployment extracts creative direction,
supports chat, writes and independently assesses lyrics, and produces musical
scores as strict JSON. Application validation and local rendering translate
those scores into audio. The model name, version, deployment SKU, and capacity
are configurable.

### Azure AI Content Safety

Separate moderation and protected-material checks screen generated lyrics.
Moderation must return severity zero for hate, self-harm, sexual content, and
violence. Application checks additionally enforce factual grounding, syllable
counts, brand placement, and exact closing wording. Screening does not replace
human review or copyright clearance.

### Azure AI Speech

The stock `en-US-JennyNeural` voice supplies speech audio and word timing.
Local digital signal processing aligns the voice with the committed score and
produces spoken and vocoded mixes. This is speech synthesis combined with local
audio processing, not a dedicated singing-generation model.

The normal deployment enables voice and text together on a shared `AIServices`
account. Runtime requests use managed identity, and key-based authentication is
disabled on that account.

## Operational highlights

* Microsoft Entra External ID authenticates users. The API validates access
  tokens and delegated scopes, while application approval and permissions
  determine access after sign-in.
* PostgreSQL uses Private Link and private DNS with public access disabled.
  Its password is supplied through Azure Key Vault; the application retains
  public HTTPS ingress.
* Shared budgets, per-operation caps, and a default $5 lifetime user allowance
  constrain paid generation. Costs are reserved before provider calls.
  Estimates and reservations are not invoices; uncertain outcomes require
  evidence-backed reconciliation.
* Stable score-job identities recover committed results without another model
  call. Ambiguous provider outcomes block resubmission to reduce duplicate-charge
  risk.
* Manually dispatched GitHub Actions deploys through OpenID Connect (OIDC)
  federation. Builds run separately from the Azure-credentialed job, the
  deployment artifact checksum is verified, and writers are stopped during
  maintenance.
* Diagnostic IDs correlate generation stages and provider-status logs without
  logging prompts or lyrics. `/healthz` checks process health only.
  OpenTelemetry instrumentation requires host SDK and exporter configuration.

## Proof-of-concept limitations

The deployment runs one replica with 0.5 CPU and 1 GiB RAM, and PostgreSQL has
no high-availability configuration. Azure Files managed-identity mounting is a
preview feature, and the writer lock is not a proven distributed exclusion
mechanism. These are deliberate proof-of-concept constraints, not production
availability guarantees. The architecture summary does not establish live
deployment health.

## Technical references

* [Azure infrastructure](../infra/platform.bicep)
* [API and generation orchestration](../apps/api/src/web_app.ts)
* [Deployment and maintenance runbook](azure-deployment.md)

This documentation was revised with AI assistance.
