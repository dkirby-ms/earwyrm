---
title: Earwyrm POC GitHub issue drafts
description: Copy-ready task titles, scope, acceptance criteria and dependencies for the four-week MVP.
---

## How to use

All 14 tasks were created in [dkirby-ms/earwyrm](https://github.com/dkirby-ms/earwyrm/issues)
on 2026-11-11 after checking for existing issues. Each section links its live issue.
The issue bodies preserve the acceptance criteria and link their dependencies.
Milestones and labels remain suggested metadata in the bodies where matching
repository metadata did not exist; only the existing `documentation` label was applied.

Keep this backlog flat for the POC. Each issue includes implementation and its
focused tests; do not create a separate testing hierarchy.
All tasks use synthetic data and follow the product path selected by the audio gate.
See the [project plan](./project-plan.md) for shared completion criteria.
Source references identify sections of the [design proposal](./design-proposal.md).

## 1. Define synthetic briefs and the audio evaluation protocol

Title: Define synthetic advertiser briefs and audio proof criteria

Issue: [#1](https://github.com/dkirby-ms/earwyrm/issues/1)

Milestone: Week 1: Prove the audio

Suggested labels: `poc`, `audio`

### Summary

Create the repeatable inputs and evaluation protocol needed to make the audio
go/no-go decision before platform work.

### Scope

* Create three synthetic briefs with name, offer, location, contact details, tone and approved claims.
* Define the brief adapter contract so real connectors can replace fixtures later.
* Arrange the listener and production-professional evaluations and cost measurements.

### Acceptance criteria

* [ ] Three synthetic briefs and expected brand/CTA answers are available without real advertiser data.
* [ ] Five independent listeners and three production professionals are scheduled.
* [ ] The protocol records 15 hook transcriptions and nine usability ratings.
* [ ] Pass criteria preserve 12/15 correct brand-and-CTA responses, 7/9 usable-with-minor-edits ratings, documented component rights, cost below $0.50 per jingle and renders below five minutes.
* [ ] Cost accounting records metered usage and states how fixed hosting/gateway costs will be reported.

### Dependencies

None.

Source: proposal sections 5, 6 and 9.

## 2. Build the local audio proof

Title: Build local retro-synth audio proof and spoken-tagline alternative

Issue: [#2](https://github.com/dkirby-ms/earwyrm/issues/2)

Milestone: Week 1: Prove the audio

Suggested labels: `poc`, `audio`

### Summary

Test the highest-risk capability locally before investing in the platform.

### Scope

* Compose MIDI melody/chords and synthesize instruments in code.
* Use Azure AI Speech timing to align speech to notes and vocode the vocal.
* Mix a 30-second demo and an instrumental-bed or sonic-logo alternative with a spoken tagline.

### Acceptance criteria

* [ ] A repeatable local command produces audio for each of the three briefs.
* [ ] Vocoded and spoken-tagline samples are available for comparison.
* [ ] No third-party samples, SoundFonts, voice cloning or named-artist imitation are used.
* [ ] Every component has recorded origin and commercial usage-rights evidence.
* [ ] Duration, render time, Azure usage and calculated cost are recorded per output.

### Dependencies

* Define synthetic advertiser briefs and audio proof criteria

Source: proposal sections 4, 5, 6 and 9.

## 3. Decide the product path

Title: Evaluate the audio proof and record the go-no-go decision

Issue: [#3](https://github.com/dkirby-ms/earwyrm/issues/3)

Milestone: Week 1: Prove the audio

Suggested labels: `poc`, `audio`, `decision`

### Summary

Use the planned human evaluation and measurements to choose the remaining build path.

### Acceptance criteria

* [ ] Five listeners complete all 15 hook transcriptions and three professionals complete all nine ratings.
* [ ] Actual results for every week-1 criterion are recorded alongside the evaluated samples.
* [ ] Missing evidence leaves the decision pending rather than being counted as a pass.
* [ ] Vocoded jingles proceed only if every criterion passes, including at least seven positive professional ratings.
* [ ] If any criterion fails, the spoken-tagline pivot is recorded and evaluated before it is treated as usable.
* [ ] The selected path and its implications for the remaining issues are documented.

### Dependencies

* Build local retro-synth audio proof and spoken-tagline alternative

Source: proposal section 9.

## 4. Establish contracts and deployment

Title: Scaffold service contracts and reproducible Azure deployment

Issue: [#4](https://github.com/dkirby-ms/earwyrm/issues/4)

Milestone: Week 2: Establish the platform

Suggested labels: `poc`, `platform`

### Summary

Create the deployment foundation only after the audio decision.

### Scope

* Choose the runtime and define brief, lyric, composition, job, quality-report and manifest schemas.
* Add `azd`, Bicep and service/container scaffolding.
* Provision Container Apps, a render queue, Blob Storage, APIM, Foundry/model access,
  paid-tier Speech, Content Safety, Application Insights and required identity resources.
* Use managed identities and Key Vault for any remaining secrets.

### Acceptance criteria

* [ ] Runtime, regional availability, APIM tier, model access, permissions and prerequisites are documented.
* [ ] Contracts define job/version identity, status, errors, syllable timing, provenance and approval records.
* [ ] MCP uses a supported version, at least 2025-06-18, and an APIM-supported transport.
* [ ] A clean environment deploys the scaffolding with `azd up` after documented prerequisite setup.
* [ ] Configuration contains no committed credentials, and deployment outputs identify service endpoints.
* [ ] Local setup, smoke-check and resource teardown instructions are available.

### Dependencies

* Evaluate the audio proof and record the go-no-go decision

Source: proposal sections 5, 6 and 8.

## 5. Build lyric generation

Title: Implement the Lyric and Hook Writer MCP server

Issue: [#5](https://github.com/dkirby-ms/earwyrm/issues/5)

Milestone: Week 2: Establish the platform

Suggested labels: `poc`, `mcp`, `generation`

### Summary

Turn a structured brief into grounded, rule-checked lyrics or a spoken tagline.

### Scope

* Use a Microsoft Foundry model and the agreed fixed JSON contract.
* Validate syllables/meter, rhyme, brand mentions, CTA placement and approved facts.
* Integrate lyric moderation and English protected-material screening.

### Acceptance criteria

* [ ] The tool returns hook, lyrics, syllables per line, rhyme scheme, brand count and CTA in the agreed schema.
* [ ] Applicable meter, rhyme, brand and CTA rules are documented for the selected product path.
* [ ] Unsupported claims, malformed model output and rule failures cannot become accepted lyrics.
* [ ] Moderation and protected-material screening run before lyrics are accepted; regulated or risky claims require human review.
* [ ] Named-artist imitation requests are rejected and generation uses only the structured brief's facts.
* [ ] Retryable lyric failures are bounded to at most three retries; exhausted attempts produce an explicit outcome.
* [ ] Focused tests cover valid output, unsupported claims, malformed output, moderation outcomes and retry exhaustion.

### Dependencies

* Scaffold service contracts and reproducible Azure deployment

Source: proposal sections 5 and 6.

## 6. Build composition

Title: Implement the Melody and Arrangement MCP server

Issue: [#6](https://github.com/dkirby-ms/earwyrm/issues/6)

Milestone: Week 2: Establish the platform

Suggested labels: `poc`, `mcp`, `audio`

### Summary

Expose the proven local composition capability as an independent MCP service.

### Acceptance criteria

* [ ] The tool accepts the agreed lyric/timing contract and selected product path.
* [ ] It returns MIDI, chords, a syllable-to-note timing map and backing-track references for one 30-second retro-synth arrangement.
* [ ] Instruments are synthesized in code, with component origins available for the rights ledger.
* [ ] Invalid or unfit syllable/timing inputs produce explicit errors.
* [ ] Melody-similarity screening uses a documented reference set of known tunes and earlier Earwyrm output, method and threshold.
* [ ] Similarity failures prevent delivery and do not claim commercial-catalog or legal clearance.
* [ ] Queue ownership is explicit: this service submits one logical render job and returns its identity; the workflow does not enqueue a second copy.
* [ ] Tests cover timing fit, similarity outcomes and repeated submission of the same logical job.

### Dependencies

* Scaffold service contracts and reproducible Azure deployment

Source: proposal sections 4, 5 and 6.

## 7. Govern MCP access

Title: Add Entra ID authentication and APIM MCP policies

Issue: [#7](https://github.com/dkirby-ms/earwyrm/issues/7)

Milestone: Week 2: Establish the platform

Suggested labels: `poc`, `identity`, `platform`

### Summary

Make APIM the governed entry point for both MCP servers using seller identity.

### Acceptance criteria

* [ ] Entra ID registration supports web sign-in and the delegated `Jingle.Create` scope.
* [ ] APIM validates tenant, audience and delegated scope for both MCP servers.
* [ ] The backend can call MCP through APIM using the authenticated seller context.
* [ ] Requests without valid identity or scope are denied, and direct access cannot bypass the intended gateway controls.
* [ ] Rate limits use the seller's object ID and are verified with two synthetic test sellers.
* [ ] Gateway logs correlate tool calls without exposing access tokens.
* [ ] Allowed, denied and rate-limited MCP calls are demonstrated.

### Dependencies

* Scaffold service contracts and reproducible Azure deployment
* Implement the Lyric and Hook Writer MCP server
* Implement the Melody and Arrangement MCP server

Source: proposal sections 5 and 6.

## 8. Build the queued renderer

Title: Run idempotent audio renders in queue-triggered Container Apps jobs

Issue: [#8](https://github.com/dkirby-ms/earwyrm/issues/8)

Milestone: Week 3: Complete generation

Suggested labels: `poc`, `audio`, `platform`

### Summary

Move the selected audio path from the local proof into an asynchronous render service.

### Acceptance criteria

* [ ] A queued composition starts a Container Apps render job using the existing proof components.
* [ ] The job performs Speech synthesis/timing, alignment and vocoding when selected, mixing, normalization and export.
* [ ] Audio, brief references, job status and a per-component provenance/rights manifest are persisted in Blob Storage.
* [ ] Audio metadata identifies the asset as AI-generated and records the selected voice and generation inputs.
* [ ] Duplicate queue delivery or worker retry does not create duplicate completed renders.
* [ ] Failed jobs are visible and recoverable under a documented bounded retry policy.
* [ ] Tests exercise successful rendering, duplicate delivery, interrupted work and storage/service failure.

### Dependencies

* Implement the Melody and Arrangement MCP server

Source: proposal sections 5 and 6.

## 9. Enforce audio quality

Title: Enforce audio quality gates and validated spoken-tagline fallback

Issue: [#9](https://github.com/dkirby-ms/earwyrm/issues/9)

Milestone: Week 3: Complete generation

Suggested labels: `poc`, `audio`, `quality`

### Summary

Deliver a checked demo or a checked fallback, never an unchecked success-shaped result.

### Acceptance criteria

* [ ] One review loudness target/tolerance, word-error-rate threshold and similarity policy are recorded before implementation.
* [ ] Export duration is checked inclusively against 29.5 to 30.0 seconds.
* [ ] Loudness, speech-to-text intelligibility and melody-similarity outcomes are stored in the quality report.
* [ ] Failed vocal quality allows at most one re-render before switching to instrumental audio with a spoken tagline.
* [ ] A week-1 pivot uses the spoken-tagline path directly rather than attempting an unapproved vocal path.
* [ ] Fallback output passes applicable duration, loudness, intelligibility, content and similarity gates.
* [ ] Failed fallback and unavailable infrastructure produce explicit failed status, not approved or shareable audio.
* [ ] Tests cover duration boundaries, each gate failure, re-render exhaustion, fallback success and fallback failure.

### Dependencies

* Run idempotent audio renders in queue-triggered Container Apps jobs

Source: proposal sections 5 and 6.

## 10. Connect the workflow

Title: Orchestrate generation with a deterministic Agent Framework workflow

Issue: [#10](https://github.com/dkirby-ms/earwyrm/issues/10)

Milestone: Week 3: Complete generation

Suggested labels: `poc`, `workflow`

### Summary

Run fixed steps from synthetic brief to quality-checked audio and human review.

### Acceptance criteria

* [ ] The workflow loads briefs through the advertiser adapter and calls both MCP servers through APIM.
* [ ] Only allowlisted, version-pinned tools are callable.
* [ ] The workflow tracks the render job submitted by Melody and Arrangement without duplicate queue submission.
* [ ] The web-facing API exposes job/version identity, pending, running, review-required and failed states.
* [ ] Lyric retries, quality re-render limits and per-job token/cost budgets are enforced and observable.
* [ ] Workflow state survives the asynchronous render boundary and stops at human approval.
* [ ] No failed, unchecked or unapproved candidate is represented as approved.
* [ ] Integration tests cover the normal, rejected lyric, budget exhaustion, fallback and failed-job paths.

### Dependencies

* Implement the Lyric and Hook Writer MCP server
* Add Entra ID authentication and APIM MCP policies
* Enforce audio quality gates and validated spoken-tagline fallback

Source: proposal sections 5 and 6.

## 11. Build the seller experience

Title: Build the seller brief picker and audio review experience

Issue: [#11](https://github.com/dkirby-ms/earwyrm/issues/11)

Milestone: Week 4: Complete the demo

Suggested labels: `poc`, `web`

### Summary

Let a signed-in seller generate and review demos without developer tools.

### Acceptance criteria

* [ ] The seller signs in, selects one of three synthetic advertisers and requests the fixed 30-second retro-synth product.
* [ ] The app displays queued/running progress and explicit failure or fallback information.
* [ ] The seller can play candidates, inspect lyrics and quality results, and regenerate a new candidate.
* [ ] Earlier candidates remain distinguishable for comparison; regeneration does not overwrite approval identity.
* [ ] The interface labels audio as AI-generated and review-ready, not broadcast-cleared.
* [ ] The deployed app uses the real workflow API rather than mock generation data.

### Dependencies

* Orchestrate generation with a deterministic Agent Framework workflow

Source: proposal sections 1 and 5.

## 12. Add approval and sharing

Title: Record seller approval and share demos for advertiser sign-off

Issue: [#12](https://github.com/dkirby-ms/earwyrm/issues/12)

Milestone: Week 4: Complete the demo

Suggested labels: `poc`, `web`, `approval`

### Summary

Bind review and approval to an exact candidate before any broadcast handoff.

### Acceptance criteria

* [ ] Review-link access, expiry and advertiser sign-off behavior are decided and documented.
* [ ] Seller approval records the approver, timestamp and immutable candidate/version in Blob Storage.
* [ ] Only a quality-passed candidate approved by the seller can be shared for advertiser review.
* [ ] The review page plays the selected candidate, discloses AI generation and records advertiser sign-off separately.
* [ ] Regeneration creates an unapproved candidate and cannot inherit an older approval.
* [ ] Expired/unauthorized links and unauthorized approval attempts fail explicitly; Blob containers are not made public for convenience.
* [ ] The page states that producer rights, pronunciation, loudness and outlet checks are still required before airing.
* [ ] Tests cover version binding, access checks, repeat approval submission and regeneration after approval.

### Dependencies

* Build the seller brief picker and audio review experience

Source: proposal sections 5 and 6.

## 13. Verify tracing and operating measurements

Title: Verify end-to-end tracing and per-job timing and cost reports

Issue: [#13](https://github.com/dkirby-ms/earwyrm/issues/13)

Milestone: Week 4: Complete the demo

Suggested labels: `poc`, `operations`

### Summary

Connect operational evidence already emitted by the services into a usable job report.

### Acceptance criteria

* [ ] One correlation trail connects request, workflow, gateway calls, queue delivery, rendering, quality results and approval.
* [ ] Application Insights distinguishes retries, rejected content, quality failures, fallback and terminal failures.
* [ ] Each job reports brief-to-demo time, render time, token/Speech usage and calculated Azure consumption.
* [ ] Reports distinguish per-job consumption from allocated APIM and warm-hosting costs.
* [ ] Logs and traces contain no credentials, access tokens or bearer review links.
* [ ] An operator can locate a deliberately failed demo job and identify the failed stage.

### Dependencies

* Orchestrate generation with a deterministic Agent Framework workflow
* Record seller approval and share demos for advertiser sign-off

Source: proposal sections 3, 5 and 6.

## 14. Validate and package the POC

Title: Validate the deployed MVP and publish the demo package

Issue: [#14](https://github.com/dkirby-ms/earwyrm/issues/14)

Milestone: Week 4: Complete the demo

Suggested labels: `poc`, `demo`, `documentation`

### Summary

Make the selected product path repeatable for a partner demonstration.
Publishing here means preparing repository deliverables; external distribution
requires the project owner's approval.

### Acceptance criteria

* [ ] A fresh deployment completes using documented prerequisites and `azd up`.
* [ ] All three synthetic advertisers complete the deployed select/generate/play/approve/share/sign-off flow.
* [ ] Failed token/scope, moderation rejection, duplicate queue delivery, failed quality and exhausted fallback scenarios are demonstrated or covered by automated integration tests.
* [ ] Successful outputs include quality reports, AI disclosure and complete component rights/provenance manifests.
* [ ] Measured brief-to-demo times are reported against the 15-minute objective; render time and cost are reported against the under-five-minute and under-$0.50 targets without treating estimates as results.
* [ ] Failed targets remain visible as limitations or blockers, with no silent relaxation of quality gates.
* [ ] Setup/deployment/teardown guidance, architecture overview, demo script, recording and known limitations are available.
* [ ] The handoff distinguishes review-ready demos from broadcast masters and lists pilot legal/output-rights prerequisites.

### Dependencies

* Record seller approval and share demos for advertiser sign-off
* Verify end-to-end tracing and per-job timing and cost reports

Source: proposal sections 1, 5, 6, 8 and 9.
