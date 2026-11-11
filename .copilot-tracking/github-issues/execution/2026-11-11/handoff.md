<!-- markdownlint-disable-file -->
<!-- markdown-table-prettify-ignore-start -->
---
description: Pending GitHub issue creation from the reviewed Earwyrm issue drafts.
---

# Earwyrm issue creation handoff

## Destination Binding

* Platform: GitHub, explicitly requested by the user.
* Proposed destination: `dkirby-ms/earwyrm`, verified against workspace origin and `gh repo view`.
* Authenticated account: `dkirby-ms`.
* Confirmed destination: `dkirby-ms/earwyrm`. After the response explicitly named
  this destination and the pending 14-issue batch, the user repeated "create these
  as github issues now." This confirms the stated batch and destination.
* Autonomy: partial; user approved this creation batch.
* Write surface: GitHub issue create/update tool available; prefer `gh` after approval.
* Source: [docs/github-issues.md](../../../../docs/github-issues.md).
* Human-review checkboxes: none; source checkboxes describe implementation acceptance criteria.
* Duplicate preflight: all-state issue listing returned no issues.
* Existing milestones: none.
* Existing suggested labels: only `documentation`.

## Execution Instructions

After explicit destination and batch approval:

1. Recheck existing issues and any live execution log to avoid duplicate creation.
2. Create the 14 flat issues in source order using each Title and Summary through
   Dependencies, including its Source citation.
3. Use level-two issue-body headings and repository links for proposal references.
4. Resolve dependency titles to the issue numbers already returned by prior creates.
   Every source dependency precedes its consumer, so no additional dependency
   update operations are needed.
5. Keep suggested week and labels in the issue body when matching metadata does not
   exist; do not create labels or milestones without additional authorization.
   Apply the existing `documentation` label to the final issue if approved.
6. Do not assign users or set an organization issue type.
7. Sanitize each outgoing title/body and record each successful live Create with its
   resulting issue number in `handoff-logs.md` before starting the next operation.
8. Verify the created titles, acceptance criteria and resolved dependency references.

No secrets, local tracking references, planning IDs, temporary IDs, incidental
mentions or external image embeds belong in outbound issue content.

## Planned Operations

* [x] IS001 - Create - Define synthetic advertiser briefs and audio proof criteria
* [x] IS002 - Create - Build local retro-synth audio proof and spoken-tagline alternative
* [x] IS003 - Create - Evaluate the audio proof and record the go-no-go decision
* [x] IS004 - Create - Scaffold service contracts and reproducible Azure deployment
* [x] IS005 - Create - Implement the Lyric and Hook Writer MCP server
* [x] IS006 - Create - Implement the Melody and Arrangement MCP server
* [x] IS007 - Create - Add Entra ID authentication and APIM MCP policies
* [x] IS008 - Create - Run idempotent audio renders in queue-triggered Container Apps jobs
* [x] IS009 - Create - Enforce audio quality gates and validated spoken-tagline fallback
* [x] IS010 - Create - Orchestrate generation with a deterministic Agent Framework workflow
* [x] IS011 - Create - Build the seller brief picker and audio review experience
* [x] IS012 - Create - Record seller approval and share demos for advertiser sign-off
* [x] IS013 - Create - Verify end-to-end tracing and per-job timing and cost reports
* [x] IS014 - Create - Validate the deployed MVP and publish the demo package

## Execution Summary

* Attempted: 14
* Created: 14, issues #1 through #14
* Failed: 0
* Pending: 0
* Skipped: 0
* Updated, closed, commented or hierarchy-linked: 0
* Dependencies: resolved in issue bodies at creation
* No new labels or milestones created; existing `documentation` applied to #14
* Verification: all 14 fetched individually and matched against expected payloads

<!-- markdown-table-prettify-ignore-end -->
