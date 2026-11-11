---
title: Earwyrm proof-of-concept project plan
description: Four-week MVP milestones, scope, decision gates and delivery criteria.
---

## Goal

Demonstrate that a seller can turn a synthetic advertiser brief into a review-ready
30-second retro-synth audio demo, approve it and share it for advertiser review.
Prove the audio first, then build the governed workflow.

Source: [design proposal](./design-proposal.md), especially sections 1, 5, 6 and 9.
Implementation work is broken down in [GitHub issue drafts](./github-issues.md).
This is a proposed delivery sequence, not a staffing or completion-date commitment.

## MVP scope

* Three synthetic advertiser briefs behind a replaceable advertiser adapter
* One 30-second version per generation, one retro-synth style and stock neural voices
* Lyric & Hook Writer and Melody & Arrangement as independent MCP servers
* A deterministic Microsoft Agent Framework workflow calling both servers through Azure API Management
* Microsoft Foundry lyrics, Azure AI Speech vocals, code-generated MIDI and instruments
* Queue-triggered Container Apps rendering, Blob Storage and provenance manifests
* Entra ID sign-in, seller-scoped gateway policies, managed identities and tracing
* Duration, loudness, intelligibility, content and melody-similarity checks
* Web app for selecting an advertiser, generating, playing, regenerating, approving and sharing
* Instrumental bed or sonic logo with a spoken tagline when the vocal approach fails
* Reproducible `azd` and Bicep deployment, setup instructions and a recorded demo

The output is a review-ready demo, not a cleared broadcast master.
Regeneration creates another candidate; multi-length version families are not required.

## Milestones

| Milestone                     | Work                                                          | Exit condition                                             |
|-------------------------------|---------------------------------------------------------------|------------------------------------------------------------|
| Week 1: Prove the audio        | Local composer, Speech, vocoder, fallback and human evaluation | Recorded go/no-go decision with audio and measurements      |
| Week 2: Establish the platform | Deployable services, MCP contracts, lyrics, Entra ID and APIM   | Both MCP servers callable through the authenticated gateway |
| Week 3: Complete generation    | Workflow, queued rendering, storage, quality gates and retries | Brief produces validated audio or a validated fallback      |
| Week 4: Complete the demo      | Web experience, approval, sharing, tracing and demo validation | Repeatable deployed demonstration with documented limits    |

Implement Content Safety with the lyric service in week 2, not as a last-week
add-on. Add provenance with rendering and tracing as services are integrated.
Week 4 verifies these controls end to end.

## Week-1 decision gate

Produce local audio for all three synthetic advertisers before platform work starts.
Use five independent listeners for 15 hook transcriptions, and three production
professionals for nine usability ratings.

Continue with vocoded jingles only when all proposal criteria pass:

* At least 12 of 15 transcriptions correctly identify both the brand and call to action
* At least 7 of 9 professional ratings say usable with minor edits
* Every audio component has a documented commercial license or applicable usage rights
* Azure cost is below $0.50 per jingle
* Each measured render takes less than five minutes

Keep the exact seven-of-nine threshold; do not round it down to six ratings.
Record render timings, resource usage, cost assumptions, rights evidence and human
scores. Missing human ratings or rights evidence leave the gate pending.

If any criterion fails, weeks 2 to 4 target the instrumental-bed or sonic-logo
product with a spoken tagline on the same architecture. Recheck that product's
intelligibility, quality and rights; do not assume the pivot automatically passes.

## Work sequence

1. Define synthetic briefs and the evaluation protocol.
2. Build and evaluate the local audio proof, including a spoken-tagline alternative.
3. Record the go/no-go decision and freeze the selected product path.
4. Establish deployment and shared contracts, then build the two MCP services.
5. Add Entra ID and APIM governance before integrating the workflow.
6. Connect queued rendering, quality gates, bounded retries and fallback.
7. Complete the web app, human approval and advertiser review flow.
8. Run end-to-end checks and package the demo.

After the audio decision, deployment/contracts, lyric generation and composition
can progress in parallel against agreed interfaces. Render service work can reuse
the proof. UI work can proceed against contracts while backend integration finishes.
The [issue drafts](./github-issues.md) list each task's actual prerequisites.

## Decisions to close during delivery

* Before platform scaffolding: choose the implementation language/runtime and
  validate regional service availability, model access, APIM tier and deployment permissions.
* Before the audio evaluation: agree on cost accounting, including how fixed
  APIM and warm-hosting costs are reported separately from per-render consumption.
  The proposal's unit-cost estimates are hypotheses, not measured results.
* Before quality-gate implementation: choose one demo loudness target and tolerance,
  a speech-to-text word-error-rate threshold, and a melody-similarity method,
  reference set and threshold. These numbers are not supplied in the proposal.
* Before generation integration: specify meter, rhyme, brand-mention and CTA rules,
  retry budgets and per-job token/cost limits. Preserve the proposal's limit of
  up to three lyric retries and one quality-driven re-render.
* Before sharing: choose review-link access, expiry and advertiser sign-off behavior.
  A shareable link does not imply a public storage container.

Record decisions in the owning issues before affected work begins. Do not select
thresholds after seeing results merely to make the demo pass.

## Definition of done

* The week-1 human evaluation and go/no-go or pivot decision are recorded.
* All MVP issues satisfy their acceptance criteria on the selected product path.
* An authorized seller can generate, play, regenerate, approve and share a demo;
  advertiser sign-off is recorded separately from seller approval.
* Both MCP calls go through APIM with token validation and per-seller rate limiting.
* Accepted exports are 29.5 to 30.0 seconds, meet the agreed loudness,
  intelligibility and similarity rules, and carry AI disclosure and a rights ledger.
* A failed vocal gets at most one re-render before a validated spoken-tagline
  fallback. A failed fallback or infrastructure failure is reported explicitly.
* Duplicate queue delivery does not create duplicate completed renders or approvals.
* Traces connect the request, MCP calls, render, checks and approval without
  recording credentials or bearer review links.
* The demo records brief-to-demo time against the 15-minute objective and reports
  measured render time and cost against the proposal's targets.
* A fresh deployment works using documented prerequisites and one `azd up` command.
* The demo script, recording, setup guide and known limitations are available.

No POC output airs automatically. A producer must verify rights, pronunciation,
loudness and outlet requirements before broadcast. Legal and Speech output-rights
review remain prerequisites for a real advertiser pilot.

## Main risks

* Vocoded speech may not be usable: evaluate in week 1 and retain the spoken-tagline pivot.
* Human reviewers may be unavailable: arrange five listeners and three production
  professionals at the start; missing feedback blocks the audio decision.
* Service access or deployment setup may delay week 2: validate prerequisites
  before starting platform work; do not replace the required gateway silently.
* Melody checks do not establish legal clearance: use a documented limited
  reference set and retain human review and pilot legal checks.
* A four-week schedule may exceed team capacity: keep one style and duration,
  and replan rather than dropping approval, identity or quality safeguards.

## Deferred beyond the POC

* Live CRM and website ingestion, Advertiser Context MCP and on-behalf-of Dataverse access
* 15- and 60-second cuts, stems, multiple styles and five-version advertiser families
* Cosmos DB, Foundry evaluation suites and commercial-catalog/trademark screening
* Conversational revisions, additional MCP servers and Copilot/Teams publishing
* Marketplace packaging and commercial pilot rollout

## GitHub tracking

The 14 tasks are tracked as [GitHub issues](https://github.com/dkirby-ms/earwyrm/issues),
with acceptance criteria and linked dependencies. The [issue drafts](./github-issues.md)
link each live issue. Week names and suggested labels are retained in issue bodies;
no new milestones or labels were created.
