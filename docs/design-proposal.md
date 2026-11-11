---
title: Earwyrm
description: Design proposal for an AI-powered jingle workflow and partner solution accelerator.
---

## Executive summary

Earwyrm is an AI jingle workflow that turns a local advertiser's brief into a custom, review-ready jingle demo in minutes.
Radio, podcast and streaming-audio ad sellers can play the advertiser's own jingle during the sales conversation instead of waiting on a separate production cycle.
A deterministic workflow calls two Model Context Protocol (MCP) servers governed by Azure API Management: Lyric & Hook Writer, which uses a Microsoft Foundry model, and Melody & Arrangement.
A render job vocodes an Azure AI Speech neural voice to the melody for a signature retro-synth sound.
Because Azure AI Speech produces speech, not singing, a week-1 audio proof gates the build, with a sonic-logo and spoken-tagline product as the fallback.
Earwyrm will ship as a partner solution accelerator that media-tech partners can deploy, brand and extend.
## 1. Overview

A jingle gives a local business a memorable sound of its own, but custom music traditionally requires a songwriter, a composer, studio time and singers. Earwyrm puts a first-draft jingle studio in the hands of the people who sell local audio advertising.
### How it works

The seller picks the advertiser, spot lengths, genre and mood.
Earwyrm builds a brief from the seller's CRM and the advertiser's website, writes a hook and lyrics that meet meter, rhyme and brand rules, composes a melody and backing track to the exact spot length, and renders a review-ready demo.
The seller compares versions side by side, approves one, and shares it with the advertiser for sign-off before anything airs.

Why MCP: Each capability is a standalone MCP server. Partners can reuse the servers from any MCP-compatible agent, or swap in their own melody engine, voices or CRM connector, without rewriting the agent.
### Hackathon deliverable (4-week build)

A week-1 audio proof with go/no-go criteria, then a review-ready MVP on synthetic advertiser briefs: web app, deterministic workflow, Foundry lyric generation, one composition and render service, a queue-triggered Container Apps job and Blob Storage, with two MCP servers behind API Management.
The MVP produces one 30-second version in one style (retro-synth), with duration, loudness and intelligibility gates, human approval, and a fallback to an instrumental bed with a spoken tagline.

## 2. Problem Clarity and Customer Relevance

Problem statement: Local radio, podcast and streaming-audio ad sellers have no fast, affordable way to include a custom jingle in a small or mid-size advertiser's package. Custom production takes a songwriter, a composer, studio time and singers, plus rounds of revisions: a cost and timeline that don't fit a local ad budget or a sales conversation.
### Who is affected

* Primary persona: the local media account executive who sells radio, podcast and streaming-audio packages to small and mid-size local businesses.
* Secondary persona: the station production director who produces the spots and absorbs every revision and version request.
* Beneficiary: the local advertiser, such as a restaurant, car dealership or home-services company, that wants a memorable sound of its own.

### Pain points

* Cost: paying a writer, composer, studio and singers is hard to justify inside a small ad package.
* Turnaround: brief, demo and revisions form a production cycle, so a custom jingle can't help close the deal in the meeting where it matters.
* Versions at scale: each campaign needs 15-, 30- and 60-second cuts plus seasonal and promo versions that stay on-brand, multiplying cost and production time.

### Evidence

The idea grew out of my own music-technology and vocoding experimentation: pairing neural text-to-speech with a vocoder can produce a stylized sung vocal without singers or studio time, which makes a same-day first demo practical. Whether that vocal is commercially usable, not just interesting, is the open question the week-1 audio proof answers.

## 3. Business Impact and Value Potential

### Business impact

* Brief-to-demo time (KPI 1): target a reviewable jingle demo within 15 minutes of the brief, so the seller can play it during the pitch. The current baseline will be measured with pilot stations.
* Versions per advertiser (KPI 2): target at least five on-brand versions (15/30/60-second, seasonal, promo) from a single brief, with no additional studio session (a pilot KPI; the hackathon MVP produces one 30-second version).
* Azure consumption and unit economics: every jingle uses Foundry model tokens, Azure AI Speech, Container Apps and storage, so consumption grows with each partner deployment, seller and jingle.
  At list prices, Azure cost is about $0.05 per 30-second jingle, or $0.16 with three lyric attempts and three renders.
  API Management sets the fixed floor, because its MCP features need a dedicated tier rather than Consumption: Developer ($48.04 a month, no SLA) for the hackathon, or Basic ($147.17) plus about $33 for three warm Container Apps, roughly $181 a month per partner deployment.
  Shared across stations, all-in cost is about $3.77 per jingle at 50 jingles a month and $1.07 at 200, so an illustrative $25 price leaves an 85–96% gross margin before producer review time.
* Partner pipeline and co-sell: each media-tech partner that deploys the accelerator for a station group creates a co-sell opportunity built on Foundry and API Management (target partners are listed under Reusability and GTM Potential).

### Value proposition

* Media ad sellers: walk into the meeting with the advertiser's own jingle: a differentiated pitch and a new upsell.
* Local advertisers: an affordable, on-brand jingle and a consistent family of versions they review and approve before anything airs.
* Production directors: first drafts and versioning are automated, so people focus on final polish or re-record a winning demo with station talent.
* Partners: a deployable, extensible accelerator that opens a new creative-services line on a governed MCP architecture.
* Microsoft: a repeatable showcase of an agentic Foundry workflow with API Management–governed MCP servers in a creative-industry scenario that drives Azure consumption.

## 4. Innovation and Differentiation

General-purpose AI music tools generate a song from a free-text prompt. Earwyrm generates an advertising asset from the advertiser's own data and each outlet's delivery requirements:

* Grounded in the advertiser through MCP: lyrics use the advertiser's name, offer, location, phone number or web address, tone and approved claims, pulled from the seller's CRM and the advertiser's website rather than typed into a prompt (synthetic briefs in the MVP, CRM data from the pilot onward).
* Composable MCP toolchain: Lyric & Hook Writer and Melody & Arrangement are independent MCP servers in the MVP, and Advertiser Context joins in the pilot. Any MCP-compatible agent can reuse them, and partners can swap in their own melody engine, voices or CRM connector without changing the agent.
* Spec-checked by design: code, not the prompt, enforces exact spot length, syllables that fit the melody, the number of brand mentions, call-to-action placement and a loudness target. The output is a review-ready demo, not a broadcast master: a producer verifies loudness, rights, pronunciation and outlet requirements before anything airs.
* Signature sound: singing through a vocoder turns a known weakness of synthetic voices into a deliberate retro-synth style, and the MVP ships only this style; a more natural pitch-mapped option waits until the audio proof shows it is worth the effort.
* Explainable composition: melodies and backing tracks are composed as notes and chords (MIDI) and rendered with instruments synthesized in code (no third-party samples), so every note can be inspected, edited and checked for similarity to known melodies before delivery.

## 5. Technical Feasibility and Architecture Approach

Target architecture after the pilot. The hackathon MVP builds a subset: web app, deterministic workflow, the Lyric & Hook Writer and Melody & Arrangement MCP servers behind API Management, a queue-triggered render job and Blob Storage.

### Approach

Earwyrm separates reasoning from rendering.
A deterministic workflow built with Microsoft Agent Framework runs fixed steps: it loads the brief, calls the Lyric & Hook Writer MCP server (a Foundry model plus validators), calls the Melody & Arrangement MCP server and queues the render job, then stops at a human approval gate.
The model is used only where creativity is needed, and code validates every output.
The MVP deploys with one `azd` command onto the same architecture a partner would extend.

### Feasibility

Microsoft Agent Framework workflows combine code-defined steps, model-driven steps and human approval gates in one explicit graph.
API Management can expose and govern existing MCP servers that implement MCP version 2025-06-18 or later over Streamable HTTP or SSE.
Azure AI Speech provides neural voices with word-level timing but produces speech, not singing: the sung effect comes from aligning that speech to the melody and vocoding it, which is why a week-1 audio proof gates the build.
Open-source MIDI tooling (for example, music21) composes the melody, and instruments are synthesized in code.

### Scalability

MCP servers and the web app scale out on Azure Container Apps. Render work runs as queue-triggered Container Apps jobs, so a burst of requests queues instead of failing.

### Main technical risk

The vocal itself. Azure AI Speech produces speech, not singing, so a vocoded vocal can be intelligible and still not sound like a memorable, commercially usable jingle.
Mitigations: a week-1 audio proof with go/no-go criteria ([section 9](#9-suggested-pilot)), one style built around the vocoder, tempo and syllable limits, an automated intelligibility check (Azure AI Speech transcribes the rendered vocal and compares it with the lyrics), and a fallback, or a full pivot if the proof fails, to an instrumental bed or sonic logo with a spoken tagline.

### Path beyond the hackathon

The pilot adds the Advertiser Context MCP server (CRM access on behalf of the seller), 15- and 60-second cuts, more styles, Cosmos DB and Foundry evaluations.
v2 adds a conversational Foundry agent for revisions, a Voice & Mix MCP server and a Compliance & Provenance MCP server (trademark check, commercial-catalog melody screening, content credentials), publishes to Microsoft 365 Copilot and Teams, and registers every server in Azure API Center for discovery and reuse.

### Core architectural components (MVP unless marked pilot)

* Earwyrm web app (Azure Container Apps): Microsoft Entra ID sign-in, synthetic-advertiser picker, audio player, regenerate, approval and a shareable review link.
* Earwyrm workflow (Microsoft Agent Framework): runs fixed, code-defined steps, calls the two MCP servers through API Management, applies rule checks with bounded retries, queues the render and waits at the human approval gate.
* Azure API Management (MCP gateway): a single governed entry point for every MCP server, with Entra ID token validation, per-seller rate limits and central logging.
* Advertiser Context MCP server (read-only): added in the pilot over Dynamics 365 Sales (Dataverse) or another CRM, plus the advertiser's website. In the MVP, synthetic briefs (name, offer, location, contact details, tone and approved claims) load through the same adapter interface.
* Lyric & Hook Writer MCP server: a Foundry model plus validators; returns the hook, lyrics, syllables per line, rhyme scheme, brand-mention count and call to action in a fixed JSON schema, after Azure AI Content Safety moderation and protected-material checks on the lyric.
* Melody & Arrangement MCP server: composes a melody and chords (MIDI) that fit the syllables and the exact 30-second length, synthesizes the backing track in code, checks the melody for similarity to known tunes and queues the render job.
* Render service (Container Apps jobs): Azure AI Speech neural voice with word-level timing, alignment to the melody, classic carrier/modulator vocoder, mix, loudness normalization and a 30-second export with a provenance manifest; 15- and 60-second cuts and stems follow in the pilot.
* Data and operations: Blob Storage for audio, briefs, approvals and provenance manifests; managed identities; Azure AI Content Safety; Application Insights with tracing. Cosmos DB and Foundry evaluations join in the pilot.

### Reference flow (MVP)

1. The seller signs in, picks a synthetic advertiser and requests a 30-second retro-synth jingle.
2. The workflow loads that advertiser's structured brief through the advertiser adapter.
3. The workflow calls Lyric & Hook Writer through API Management; validators check syllables, rhyme, brand mentions, call to action and content safety, with up to three retries.
4. The workflow calls Melody & Arrangement, which returns MIDI, chords, a syllable-to-note timing map and the backing track, and queues a render job.
5. A queue-triggered Container Apps job synthesizes the vocal, aligns and vocodes it, mixes it, normalizes loudness and writes the 30-second audio and its provenance manifest to Blob Storage.
6. An automated quality gate checks duration (29.5 to 30.0 seconds), loudness against one review target, intelligibility and melody similarity; a failed version is re-rendered once or falls back to an instrumental bed with a spoken tagline.
7. The seller approves the demo and shares a review link with the advertiser; every approval is logged, and a producer verifies loudness, rights, pronunciation and outlet requirements before anything airs.

## 6. Security, Governance, and Reliability Considerations

### Data handling and privacy

* The hackathon build uses synthetic advertiser data only; pilot data stays in the partner's Azure tenant.
* Advertiser data is business information (name, offer, location, contact details); Earwyrm collects no consumer personal data.
* Azure OpenAI models in Foundry do not use customer prompts or outputs to train base models.

### Identity and access

* Sellers sign in with Microsoft Entra ID; API Management validates each seller's token (tenant, audience and a delegated `Jingle.Create` scope), rate-limits on the seller's object ID and logs every MCP call; the MVP demonstrates this flow end to end.
* CRM access in the pilot uses an explicit on-behalf-of flow: API Management passes the seller's token through to the read-only Advertiser Context server, which exchanges it for a Dataverse token (`user_impersonation` scope), so Dataverse security roles limit each seller to their own accounts. Because the workflow runs in the app backend, no agent service has to relay the seller's token.
* Services use managed identities; any remaining secrets live in Key Vault, never in code.
* API Management policies apply to all tools on an MCP server, so the read-only CRM server stays separate from the content-generation servers and each gets its own policy.

### Grounding and prompt-injection defense

* Website text (pilot) is treated as untrusted: Azure AI Content Safety Prompt Shields screen it before it reaches the lyric writer.
* The workflow can call only an allowlisted, version-pinned set of tools.
* Lyrics may use only facts from the structured brief; a groundedness check flags any claim that is not in the brief.

### Responsible AI, rights and provenance

* Content Safety screens every lyric; superlatives, prices and regulated-category claims (for example alcohol, health or financial services) are flagged for human review.
  Protected-material detection (English only) also screens every lyric, and each melody is compared with a reference set of well-known melodies and earlier Earwyrm output, so similarity checks start in the MVP rather than v2; commercial-catalog screening and trademark checks follow in the pilot.
* No prompts that imitate a named artist; stock neural voices only, with no voice cloning. Voice output comes from a paid-tier Speech resource, with output rights and synthetic-voice disclosure confirmed against the Microsoft Product Terms and AI Code of Conduct before the pilot.
* Every file is labeled as AI-generated, in its metadata and on the review page. Each render also carries a provenance manifest (rights ledger) listing every audio component and its license; the MVP keeps that list short by generating melody, arrangement and instruments in code, with no third-party samples or SoundFonts.
* Human in the loop: the seller and the advertiser approve before anything airs. Because purely AI-generated material is not copyrightable under the US Copyright Office's current position, the offer is framed as an exclusive-use license unless a producer's edits add human authorship; legal review confirms advertiser and broadcast terms before the pilot.

### Reliability

* Deterministic validators with bounded retries; asynchronous, idempotent render jobs; a token and cost budget for each job.
* End-to-end tracing of every workflow step and MCP call; Foundry evaluations for groundedness and content safety run before each release from the pilot onward.
* Graceful degradation: if a vocal fails the quality gate, Earwyrm returns the instrumental with a spoken tagline instead of an error.

## 7. Microsoft Technology Alignment

Each Microsoft service has a specific job in Earwyrm:

* Microsoft Foundry: a Foundry model writes the lyrics and hook inside a deterministic Microsoft Agent Framework workflow, with tracing on every run; evaluations arrive in the pilot, and a conversational Foundry agent for revisions in v2.
* Azure API Management: MCP gateway for authentication, authorization, rate limiting and monitoring of every MCP server.
* Azure AI Speech: neural voices with word-level timing for the sung vocal, and speech-to-text for the intelligibility check.
* Azure AI Content Safety: lyric moderation and protected-material detection in the MVP; Prompt Shields for website content in the pilot.
* Azure Container Apps: hosts the MCP servers and web app and runs render jobs.
* Microsoft Entra ID, managed identities and Key Vault: identity, access and secrets.
* Dynamics 365 Sales (Dataverse): advertiser and ad-order data in the pilot, behind the Advertiser Context adapter.
* Azure Cosmos DB, Blob Storage and Application Insights: audio, state and observability (Blob Storage and Application Insights in the MVP; Cosmos DB in the pilot).
* GitHub Copilot, GitHub Actions and Azure Developer CLI (`azd`): built with Hypervelocity Engineering (HVE) practices and deployed with one command.

Agentic pattern: a deterministic workflow that uses a model only where creativity is needed, with composable, governed MCP tools and a human approval gate, the same pattern partners can apply in other industries.
## 8. Reusability and GTM Potential

Earwyrm will be packaged as a partner solution accelerator:
* Repository: GitHub repo with one-command deployment (`azd` and Bicep), synthetic sample advertisers, a demo script and architecture documentation.
* Reusable MCP servers: two independently deployable servers in the MVP (Lyric & Hook Writer, Melody & Arrangement) and Advertiser Context in the pilot, registered in Azure API Center for discovery and reuse.
* Extension points: CRM and ad-sales adapters, voice and style presets, licensed instrument libraries, brand rule packs and an alternative melody engine.
* Target partners: media-tech ISVs and systems integrators serving radio, podcast and streaming-audio groups, who can rebrand Earwyrm as a managed creative service for station groups.
* Path to market: accelerator, then a partner-packaged offer for station groups, then a potential Azure Marketplace offer, with Azure consumption through co-sell.
* Pattern reuse: the same brief → grounded context → rule-checked generation → render → human approval pattern fits radio scripts, podcast host-read ads, sonic logos and video voice-overs.

## 9. Suggested Pilot

### Hackathon build (4 weeks)

* Week 1: audio proof before any platform work. Produce jingles for three synthetic advertisers with the composer, Azure AI Speech and the vocoder running locally.
  Go only if at least 12 of 15 hook transcriptions by five independent listeners get the brand name and call to action right, at least 7 of 9 ratings from three production professionals (70%) say usable with minor edits, every audio component has a documented commercial license, and Azure cost stays under $0.50 per jingle with renders under five minutes.
* Week 2: Lyric & Hook Writer and Melody & Arrangement MCP servers behind API Management; Entra ID sign-in and token validation; `azd` deployment from day one.
* Week 3: Agent Framework workflow, queue-triggered render job, quality gates (duration, loudness, intelligibility, melody similarity) and the instrumental-plus-tagline fallback.
* Week 4: web app (pick, play, approve, share), Content Safety, tracing, provenance manifest and demo recording.
* Pivot rule: if the week-1 proof fails, weeks 2 to 4 build the safer sonic-logo or instrumental-bed product with a spoken tagline on the same architecture; it still solves the seller's problem and keeps most of the Microsoft stack.

### Post-hackathon pilot (60 days)

One media-tech partner and one station group or podcast network, with 3–5 account executives and 20–30 local advertisers. The pilot adds CRM access on behalf of the seller, 15- and 60-second cuts, more styles and Foundry evaluations.

### Proposed success criteria

* Median brief-to-demo time of 15 minutes or less, at under $0.50 of Azure cost per jingle.
* At least five approved versions per participating advertiser.
* At least 70% of demos rated usable as-is or with minor edits by production directors.
* Intelligibility of rendered vocals above an agreed threshold, measured by speech-to-text word error rate.
* Zero unapproved or unsupported claims aired, and a complete rights ledger for every aired jingle.
The pilot will also measure jingle attach rate and average package size against sellers not using Earwyrm, to size the revenue impact.
## 10. Conclusion

Earwyrm turns the custom jingle from a slow, expensive production into a governed, minutes-long workflow that local media sellers can use at the moment of the sale.

It also demonstrates a reusable Microsoft pattern: a deterministic workflow using Foundry models and composable MCP servers behind API Management, grounded in business data, checked by code and approved by people.
The hackathon build first proves the audio, then delivers a review-ready MVP on the architecture a partner would extend; the pilot will prove the two outcomes that matter most, speed to demo and on-brand versions at scale, and the path to Azure consumption through media-tech partners.
