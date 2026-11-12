<!-- markdownlint-disable-file -->
# RPI Plan: Issue #1 briefs and audio proof

## Task Metadata

* Task ID: issue-1-define-synthetic-advertiser-briefs
* Task slug: issue-1-define-synthetic-advertiser-briefs
* Plan date: 2026-11-11

## Executive Summary

* Bottom line: Create synthetic brief fixtures and an honest one-person audio POC protocol, then align the local project criteria.
* Why this matters: It gives the local audio proof repeatable inputs and a bounded decision gate without implying independent or professional validation.
* Planning result: Complete and implementation-ready after resolving all planner-owned critique findings; the original critique verdict remains Revise, with every finding now closed by direct correction.
* Confidence and uncertainty: The POC scope, cost basis, JSON representation with a separate answer key, and deferred-future-validation treatment of the original panel are confirmed.

### What You May Not Know

* The live Issue #1 still requires five listeners and three production professionals. The user's one-person scope applies to this POC; the plan will not update the live issue.
* The workspace currently contains project documents but no application source, package manifest, or test harness. Planning should not introduce production infrastructure or a test framework for this documentation-and-fixture task.

## Phase Checklist

```mermaid
flowchart LR
    accTitle: After: local project documents point to the audio POC protocol and fixtures
    accDescr: Three updated project documents link to a new protocol, which describes the synthetic briefs and separate expected-answer file.
    subgraph project_docs["`<code>docs/</code>`"]
        proposal["`**<code>design-proposal.md</code>**
        aligns the POC criteria
        changed · P02`"]
        project_plan["`**<code>project-plan.md</code>**
        aligns the POC gate
        changed · P02`"]
        issues["`**<code>github-issues.md</code>**
        aligns the local Issue #1 draft
        changed · P02`"]
    end
    subgraph poc_docs["`<code>docs/audio-poc/</code>`
    new directory · P01"]
        protocol["`**<code>protocol.md</code>**
        defines the contract and POC evidence
        new · P01`"]
        briefs["`**<code>advertiser-briefs.json</code>**
        provides three synthetic inputs
        new · P01`"]
        answers["`**<code>expected-brand-cta.json</code>**
        keeps answers evaluator-only
        new · P01`"]
    end
    proposal -.->|links to| protocol
    project_plan -.->|links to| protocol
    issues -.->|links to| protocol
    protocol -.->|describes| briefs
    protocol -.->|separates| answers
    classDef new stroke-dasharray: 6 4,stroke-width:2px
    classDef changed stroke-width:3px
    class poc_docs,protocol,briefs,answers new
    class proposal,project_plan,issues changed
```

Key: dotted arrows, documents that describe or link to a part; dashed border, new; thick border, changed; each tag names the phase that makes the change.

The three local project documents link to the new protocol in P02. The protocol and fixture files are created in P01, with the expected brand and CTA answers kept separate from generation inputs.

<!-- rpi:phase id=P01 -->
### [x] P01: Define synthetic briefs and POC protocol

Goals:
* Establish a provider-neutral brief contract, repeatable synthetic inputs, and a bounded POC evaluation protocol that keeps evaluation answers separate from generation inputs.

Dependencies:
* None.

Changes in the map: adds the protocol and two separate JSON files for synthetic briefs and expected answers.

<!-- rpi:task id=P01-T01 -->
#### [x] P01-T01: Define the brief contract and evaluation protocol

Goals:
* Provide a provider-neutral brief contract and an evidence record that can determine the one-person POC result without overstating self-evaluation.

Requirements:
* FR-001, FR-003, FR-004, NFR-002, and NFR-003.
* `research Q1-Q5, C1-C5` and confirmed user decisions must remain traceable in the protocol.

Details:
* Create `docs/audio-poc/protocol.md` with `title` and `description` frontmatter and no H1. Define a unique `brief_id` and the generation-facing fields `name`, `offer`, `location`, `contact_details`, `tone`, and `approved_claims`; the adapter response excludes expected brand and CTA answers.
* Define an empty three-output result template. For each output, record `brief_id`, `output_id`, brand and CTA transcription, self-usability rating, component-level rights evidence, measured duration, and per-render metered usage.
* For each metered component used by a render, record provider/resource, quantity and unit, unit rate and currency, source/date, and attempt attribution. Explicitly list any excluded or unavailable meter rather than treating it as zero. Report fixed gateway/hosting charges separately from the metered-only threshold, and state a volume assumption if any allocation is shown.
* For each audio component, record the component, asset/source, license or usage terms, commercial-use basis, evidence reference, and date checked. Missing or unverified rights or measurement evidence leaves the output row pending. The duration condition passes only below five minutes and the metered cost condition only below $0.50.
* Record each transcription before consulting the separate expected-answer file. Normalize only case and surrounding whitespace; list any accepted CTA variants in the answer key before evaluation. Label the outcome as unblinded self-evaluation, not independent-listener or production-professional evidence.
* The provisional self-screen passes only when all three of three outputs pass both self-evaluation measures. State that the original 5+3 panel is deferred future validation, not a current POC gate; live GitHub issues remain unchanged.
* Assign an output Fail when any evidenced criterion fails; otherwise assign Pending while required evidence is missing; assign Pass only when transcription, self-rating, rights, duration, and metered-cost criteria are all evidenced as passing. The overall POC is Fail if any output fails, Pending if none fail but at least one output remains pending, and Pass only when all three outputs pass.
* This task defines the blank record only. It does not produce audio, record output observations, or assert measured costs or rights; rows remain pending until supported evidence exists.
* Validation owner: check the contract fields, empty/pending result rows, exact thresholds, rights and cost record fields, self-evaluation label, deferred panel treatment, and missing-evidence behavior. This is a semantic documentation check; no test files are removed, the maximum test additions are zero, and there are no generated targets.

References:
* [design-proposal.md](../../../docs/design-proposal.md): brief fields and replaceable adapter concept.
* [github-issues.md](../../../docs/github-issues.md): local Issue #1 brief and adapter requirements.
* [issue-1-define-synthetic-advertiser-briefs-research.md](../../research/2026-11-11/issue-1-define-synthetic-advertiser-briefs-research.md):
  * Q1-Q5 under `## Scope and Questions`; findings on the POC screen and separate cost/rights conditions.
  * C1-C5 under `## Evidence Log`; the POC and cost decisions under `## Decisions and Feedback`.

Dependencies:
* None.

<!-- rpi:task id=P01-T02 -->
#### [x] P01-T02: Create synthetic brief and answer-key fixtures

Goals:
* Provide three repeatable synthetic brief inputs and matching expected brand/CTA answers, with the answer key unavailable to generation.

Requirements:
* FR-002 and NFR-001.
* research Q1, Q2, C1, and C2, plus confirmed Planning D1.

Details:
* Create `docs/audio-poc/advertiser-briefs.json` with three distinct briefs matching the protocol's provider-neutral contract.
* Create `docs/audio-poc/expected-brand-cta.json` as a separate evaluator-only artifact keyed by the same `brief_id`; include the expected brand and CTA and any accepted CTA variants. Each answer must correspond unambiguously to one brief and must not be included in the generation-facing adapter response.
* Use non-operational synthetic contacts only: email addresses under `example.com` or `example.org`, and phone numbers in NANPA's fictitious `202-555-0100` through `202-555-0199` range. Do not include real personal contact details.
* No parser, runtime adapter, test framework, or other application infrastructure is in scope.
* Validation owner: run one-off JSON syntax checks with `python3 -m json.tool docs/audio-poc/advertiser-briefs.json` and `python3 -m json.tool docs/audio-poc/expected-brand-cta.json`; check required fields, three distinct briefs and IDs, placeholder domains/numbers, answer-key separation, and exact matching of each brief to its expected brand and CTA. These commands are validation only, not delivered runtime tooling. No test files are removed, the maximum test additions are zero, and there are no generated targets.

References:
* [design-proposal.md](../../../docs/design-proposal.md): structured brief fields and the replaceable advertiser adapter.
* [issue-1-define-synthetic-advertiser-briefs-research.md](../../research/2026-11-11/issue-1-define-synthetic-advertiser-briefs-research.md):
  * Q1 and Q2 under `## Scope and Questions`; findings on reserved placeholders and answer-key separation.
  * C1 and C2 under `## Evidence Log`; the research findings supporting Planning D1 under `## Decisions and Feedback`.
    * W2 and W3 under `## Evidence Log` support the reserved email domains and fictitious phone-number range.
* `docs/audio-poc/protocol.md`: contract and fixture boundary defined by P01-T01.

Dependencies:
* P01-T01.

<!-- rpi:phase id=P02 -->
### [x] P02: Align local project documents

Goals:
* Make the proposal, project plan, and local issue draft consistently describe the confirmed POC while preserving the original panel only as deferred future validation.

Dependencies:
* P01.

Changes in the map: updates the proposal, project plan, and local Issue #1 draft to link the protocol and fixture files.

<!-- rpi:task id=P02-T01 -->
#### [x] P02-T01: Reconcile local POC criteria

Goals:
* Make every local reference to the original panel accurately describe the one-person POC and its limits, with no implication that the live GitHub issue has changed.

Requirements:
* FR-003, FR-004, FR-005, NFR-002, and NFR-003.
* research C3-C7; research decision D1 and its follow-up define the one-person POC, research D2 defines the metered-only cost threshold, and Planning D2 defers the original panel.

Details:
* Update every local full-panel reference found by searching `docs/`, including the Week 1 audio-proof criteria in `docs/design-proposal.md`, the Week-1 decision gate and related risk in `docs/project-plan.md`, the local Issue #1 entry, and the deferred Issue #3 follow-on criteria in `docs/github-issues.md`.
* State the one-person, 3/3 unblinded self-evaluation screen and its consequences: an evidenced failed criterion makes that output Fail; otherwise missing required evidence makes it Pending; Pass requires all applicable output criteria and evidence. Overall POC status is Fail if any output fails, Pending if none fail but one or more remain pending, and Pass only if all three outputs pass. Keep rights, duration, and metered cost as separate conditions, and report fixed gateway/hosting charges separately.
* Label the original 5+3 panel only as deferred future validation, not a POC acceptance gate. Correct any retained 7/9 percentage to approximately 77.8%. Keep live GitHub Issue #1 unchanged and its original criteria reference-only.
* Add a link to `docs/audio-poc/protocol.md` in each affected local document, with fixture links where they support later audio work. Do not write to the live tracker.
* Validation owner: search all local `docs/` references to the original panel, then compare each affected section against the protocol for participant count, pass/fail/pending consequences, 3/3 self-evaluation, cost basis, rights, timing, deferred-panel wording, and protocol links. Verify that no live tracker mutation is part of the task. This is a semantic documentation check; no test files are removed, the maximum test additions are zero, and there are no generated targets.

References:
* [project-plan.md](../../../docs/project-plan.md): original conjunctive week-one gate and missing-evidence behavior.
* [design-proposal.md](../../../docs/design-proposal.md): rights, costs, and original pilot criteria.
* [github-issues.md](../../../docs/github-issues.md): local Issue #1 scope and acceptance criteria.
  * Issue #3 contains the follow-on full-panel decision and must remain clearly deferred from the one-person POC.
* [issue-1-define-synthetic-advertiser-briefs-research.md](../../research/2026-11-11/issue-1-define-synthetic-advertiser-briefs-research.md):
  * C3-C7 under `## Evidence Log`; the POC and cost decisions under `## Decisions and Feedback`.
* [Issue #1](https://github.com/dkirby-ms/earwyrm/issues/1): live criteria for reference only; no tracker mutation is authorized.

Dependencies:
* P01-T01 and P01-T02.

## User Decisions and Requirements

### Confirmed User Direction

* Build a POC. Do not book or recruit anyone beyond the user.
* Evaluate three synthetic outputs. The provisional screen requires correct brand-and-CTA self-transcriptions and “usable with minor edits” self-ratings for all three outputs.
* Use one JSON file for the three synthetic briefs and a separate JSON file for the expected brand/CTA answers.
* Describe the outcome as self-evaluation, not independent-listener or production-professional evidence.
* Preserve the original 5+3 panel only as clearly labeled deferred future validation, not as a one-person POC gate.
* Compare metered per-render consumption to the under-$0.50 target and report fixed gateway/hosting charges separately.
* Preserve documented component-rights evidence and the under-five-minute render gate.
* Keep live Issue #1 unchanged unless separately authorized. No real advertiser data, external outreach, cloud spending, audio production, or platform implementation is in this task.
* Planning decisions remain user-retained in automatic RPI mode. The standard plan critique and post-implementation Review are enabled.

### Planning Decisions and Feedback

| Group | Decision or feedback item | Status | Owner | Rationale or input needed | Evidence | Planning impact |
|-------|---------------------------|--------|-------|---------------------------|----------|-----------------|
| D1 | Representation of the synthetic briefs and evaluation-only answer key | Confirmed: JSON with separate answer key | User | User selected machine-readable JSON briefs and a separate JSON answer-key file. | User answer; research Q1-Q2, C1-C2 | P01-T02 |
| D2 | Treatment of the original 5+3 evaluation panel in local documents | Confirmed: retain only as deferred future validation | User | Preserves the original full-proof option without making it a one-person POC gate. | User answer: retain_deferred; research C4, C7 | P02-T01 |

## Planning Readiness and Next Step

| Field | Record |
|-------|--------|
| Planning execution and readiness | Complete; Ready. All 11 planner-owned findings from the standard critique have exact resolving changes and are closed in Critique Disposition. The initial critique verdict remains Revise; no follow-up critique was requested or run. |
| Decision participation | User-retained in automatic mode, from “Keep going, but check with me” |
| Blockers | None |
| Latest critique | [.copilot-tracking/reviews/plans/2026-11-11/issue-1-define-synthetic-advertiser-briefs-plan-critique.md](../../reviews/plans/2026-11-11/issue-1-define-synthetic-advertiser-briefs-plan-critique.md): Revise |
| Relevant research | [issue-1-define-synthetic-advertiser-briefs-research.md](../../research/2026-11-11/issue-1-define-synthetic-advertiser-briefs-research.md) |
| Plan | `.copilot-tracking/plans/2026-11-11/issue-1-define-synthetic-advertiser-briefs-plan.md` |
| Changes-record role | `.copilot-tracking/changes/2026-11-11/issue-1-define-synthetic-advertiser-briefs-changes.md` is implementation evidence |
| Continuation owner | Confirmed automatic RPI Agent |
| Required gates or confirmations | All findings PC-001 through PC-011 are resolved; no further user decision is required |
| Next action | Implementation is complete; automatic RPI transition to Review uses the changes record as implementation evidence |

## Goals

* Create three repeatable synthetic advertiser briefs, a provider-neutral contract, and an honest POC evaluation and cost/rights evidence record.
* Reconcile local project documents with the user's one-person POC scope while keeping the live GitHub issue unchanged.

## Scope and Non-Goals

### In Scope

* Three synthetic advertiser briefs with name, offer, location, contact details, tone, and approved claims.
* A brief adapter contract and separate expected brand/CTA answers.
* A protocol template for one participant to evaluate three outputs, with a provisional 3/3 threshold for both self-transcription and self-usability ratings; actual evaluation is deferred until outputs exist.
* Per-output rights evidence, render duration, metered cost, and separately reported fixed charges.
* Add `docs/audio-poc/protocol.md`, `docs/audio-poc/advertiser-briefs.json`, and `docs/audio-poc/expected-brand-cta.json`.
* Update [docs/design-proposal.md](../../../docs/design-proposal.md), [docs/project-plan.md](../../../docs/project-plan.md), and the local Issue #1 draft in [docs/github-issues.md](../../../docs/github-issues.md).

### Non-Goals

* Updating the live GitHub issue or any external tracker.
* Recruiting or booking participants, collecting real advertiser data, or claiming independent/professional validation.
* Producing audio, spending cloud resources, building an application adapter, or starting platform work.
* Relaxing the rights or render-time gates.

## Functional Requirements

* FR-001: Provide a provider-neutral brief contract with the required advertiser facts.
* FR-002: Provide three synthetic briefs and expected brand/CTA answers without real advertiser data; keep the answer key out of the generation-facing adapter response.
* FR-003: Define blank fields to capture one participant's brand-and-CTA transcription and usability rating for each of three outputs once they exist; the provisional self-evaluation screen passes only at 3/3 for both measures.
* FR-004: Define fields for per-output component-rights evidence, measured render duration, and metered usage; report fixed charges separately from the metered-only under-$0.50 threshold. Missing rights or measurement evidence leaves the output pending.
* FR-005: Align the local proposal, project plan, and issue draft with the confirmed POC scope without mutating the live issue.

## Non-Functional Requirements

* NFR-001: Synthetic fixtures use non-operational contact placeholders and contain no real advertiser data.
* NFR-002: The evaluation record preserves exact output-level observations and describes the result as unblinded self-evaluation, not independent or professional evidence.
* NFR-003: The evaluation gate remains pending when required rights or measurement evidence is missing; a render passes the duration condition only when it is below five minutes.

## Risks and Open Questions

| Priority | Type | Risk, question, or planning item | Affected work | Impact | Smallest action or evidence needed | Owner |
|----------|------|----------------------------------|---------------|--------|------------------------------------|-------|
| Medium | Risk | The live issue retains the original full-panel criteria while local documents describe a one-person POC | P02-T01 | Readers could confuse local POC scope with live tracker acceptance criteria | Label the distinction clearly and do not claim the live issue was updated | Planner |
| Low | Evidence limitation | No application source or existing test harness was found | P01-T01, P01-T02 | Integration behavior cannot be validated in this issue | Keep deliverables documentation/fixture focused; validate the protocol and parse the fixture JSON directly | Planner |

## Dependencies

* Research readiness: the completed research artifact establishes the POC scope, exact self-evaluation rule, rights/time gates, cost basis, and live-tracker exclusion.

## Sources

* [design-proposal.md](../../../docs/design-proposal.md): proposal brief fields, adapter concept, original full-panel gate, rights, and cost separation.
* [project-plan.md](../../../docs/project-plan.md): week-one decision gate, missing-evidence behavior, and original project sequence.
* [github-issues.md](../../../docs/github-issues.md): local Issue #1 and dependent issue boundaries; local draft remains distinct from the live issue.
* [issue-1-define-synthetic-advertiser-briefs-research.md](../../research/2026-11-11/issue-1-define-synthetic-advertiser-briefs-research.md): Cycle 2, findings, Research decisions D1, D1 follow-up, and D2, and Planning Readiness.
* `docs/audio-poc/protocol.md`: planned protocol and measurement record.
* `docs/audio-poc/advertiser-briefs.json` and `docs/audio-poc/expected-brand-cta.json`: planned separate input and answer-key artifacts.
* [Issue #1](https://github.com/dkirby-ms/earwyrm/issues/1): live issue remains open with original criteria; it is reference-only and outside the write boundary.
* Business-source search: searched `docs/` for advertiser briefs, audio evaluation, adapter, and decision terms; searched for `.adr-config.yml`, `brd_id`, `prd_id`, and BRD/PRD/ADR identifiers. No relevant BRD, PRD, or ADR sources were found.

## Critique Disposition

* Critique setting and provenance: standard; default for the first task.
* Critique status: Complete.
* Latest critique and verdict: [.copilot-tracking/reviews/plans/2026-11-11/issue-1-define-synthetic-advertiser-briefs-plan-critique.md](../../reviews/plans/2026-11-11/issue-1-define-synthetic-advertiser-briefs-plan-critique.md): Revise.
* Earlier critiques: none.
* Limitations: none.

| Critique run and finding | Disposition | Action owner | Exact resolving evidence | Decision route | Plan response or residual risk |
|--------------------------|--------------|--------------|--------------------------|---------------|--------------------------------|
| PC-001 | Resolved | Planning parent | P01-T01 now specifies component rights, metered usage, fixed charges, and pending behavior | Direct correction | Reproducible record fields are in the protocol scope |
| PC-002 | Resolved | Planning parent | P02-T01 now searches and updates every local `docs/` full-panel reference, including the three identified source documents, and keeps live Issue #1 unchanged | Direct correction | Local references are in scope; live tracker remains excluded |
| PC-003 | Resolved | Planning parent | P02-T01 requires correcting any retained 7/9 percentage to approximately 77.8% | Direct correction | Removes the inaccurate percentage |
| PC-004 | Resolved | Planning parent | P01-T01 defines `brief_id` and generation-facing response fields; P01-T02 applies the key to both JSON files | Direct correction | Expected answers remain outside the generation-facing response |
| PC-005 | Resolved | Planning parent | Plan references now distinguish Planning D1/D2 from Research D1, D1 follow-up, and D2 | Direct correction | Decision citations identify their source and scope |
| PC-006 | Resolved | Planning parent | P01-T01 defines pending output evidence; P02-T01 mirrors Pass/Fail/Pending consequences and excludes live tracker writes | Direct correction | POC consequences and tracker boundary are explicit |
| PC-007 | Resolved | Planning parent | P01-T01 requires transcription before answer-key comparison and labels the result unblinded self-evaluation | Direct correction | Avoids prior answer-key exposure without overstating independence |
| PC-008 | Resolved | Planning parent | P01-T02 specifies `example.com`/`example.org` email domains and the NANPA 202-555-0100 through 0199 range, with explicit validation | Direct correction | Synthetic contacts are checkable and non-operational |
| PC-009 | Resolved | Planning parent | P01-T01 defines a blank template whose rows remain pending until supported evidence exists | Direct correction | No audio or evaluation result is fabricated in this task |
| PC-010 | Resolved | Planning parent | P02-T01 requires a protocol link in each affected local document | Direct correction | Protocol remains discoverable from each local source |
| PC-011 | Resolved | Planning parent | P01-T02 specifies two one-off `python -m json.tool` commands as validation only | Direct correction | No parser infrastructure is added |

## Artifact Self-Check

* [x] Executive Summary, What You May Not Know, and the Phase Checklist are complete and synchronized.
* [x] Planning D1 and Planning D2 are resolved and reflected in every affected section.
* [x] Every phase and task has its required blocks and accurate IDs.
* [x] The change map reflects the final artifacts and their connections.
* [x] Source evidence, risks, critique setting, readiness, and next action are complete.
* Checked sections: executive summary, phase checklist, tasks, decisions, requirements, risks, sources, and critique configuration.
* Missing or limited sections: the Mermaid map has not been previewed in light and dark themes; this is a presentation limitation, not an implementation blocker.

## Follow-Up Items

* None

## Handoff

* Authoritative implementation handoff: Planning Readiness and Next Step
