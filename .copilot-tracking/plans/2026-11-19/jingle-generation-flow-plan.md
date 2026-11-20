<!-- markdownlint-disable-file -->
# RPI Plan: Jingle generation flow

## Task Metadata

Task ID and slug: `jingle-generation-flow`; date: 2026-11-19.

## Executive Summary

Deliver one annotated SVG of the current web path and an illustrative cost breakdown. Nothing changes in the app.

### What You May Not Know

The estimate will not assert a deployment-specific model or invoice amount.

## Phase Checklist

P01 adds one standalone SVG; no app parts or connections change.

<!-- rpi:phase id=P01 -->
### [x] P01: Deliver the illustrated flow

Goals: Explain generation and its cost in one view.

Dependencies: Completed research.

Changes in the map: Standalone SVG only.

<!-- rpi:task id=P01-T01 -->
#### [x] P01-T01: Draw and verify the diagram

Goals: Provide a readable, shareable overview.

Requirements: `FR-001`, `FR-002`, `NFR-001`.

Details: Use the browser's main path, two audio variants, explicit paid versus local work, worked cost and configured cap. Verify labels against researched source, parse and render the SVG, and recompute the example. Test ownership: these are artifact checks; no test additions, removals, or generated test files.

References: [.copilot-tracking/research/2026-11-19/jingle-generation-flow-research.md](../../research/2026-11-19/jingle-generation-flow-research.md), findings and evidence log.

Dependencies: None beyond the research and a local SVG renderer.

## User Decisions and Requirements

User requested an illustrated current-flow diagram with steps, APIs, and costs, and chose end-to-end progression. Planning decisions are agent-owned. No unresolved choice.

## Planning Readiness and Next Step

Ready. The initial standard critique completed and passed.

## Scope and Non-Goals

One persistent session SVG, no source changes or paid calls. Evidence: [research](../../research/2026-11-19/jingle-generation-flow-research.md).

## Functional Requirements

* `FR-001`: Diagram the web steps, APIs, stage outputs, and material retries or stops.
* `FR-002`: Provide stage costs, scenario assumptions, total, and configured estimate distinction.

## Non-Functional Requirements

* `NFR-001`: Standalone SVG with a text title/description, high contrast, and no external assets.

## Critique Disposition

Standard, initial, Complete; Pass without findings. The deployment is not identified and the example is not a bill.

## Follow-Up Items

None.
