<!-- markdownlint-disable-file -->
# Review: Melody and Arrangement MCP

## Executive Summary

Full local scope P01-P03 is implemented and validated. Both fixed motifs were
replaced, the application uses the shared composer, and the standalone MCP
service returns screened MIDI/timing/backing/provenance with one durable job.
Review execution: Complete. Assessed outcome: Conformant with justified divergence
from the future deployed architecture, limited to the agreed local scope.
No substantive defects identified in the reviewed changes.

## What You May Not Know

The shared platform contract and cloud queue are not implemented in #4.
This assessment covers the documented provisional v1 contract and durable local
queue, not Azure deployment or final vocal-worker execution.

## Findings and Proposed Routes

None within P01-P03. No Critical, High, Medium or Low findings.
The provisional contract/local queue boundary is explicit in the plan and docs,
not an implementation of the absent #4 platform or #7 worker.

## Parent Decision Record

### Current Disposition

Based on RD-001 through RD-006: Review execution Complete; final outcome
Conformant with justified divergence for local scope. No finding decisions or
required corrective follow-up remain. No user decision needed.

### Decision History

| Event | Subject | Source | Status or value | Rationale |
|---|---|---|---|---|
| RD-001 | participation | user/agent | agent-owned | User selected end-to-end; first-task Review default |
| RD-002 | walkthrough | agent | skipped-auto | No findings; automatic participation |
| RD-003 | execution | agent | Complete | All material local contracts compared once |
| RD-004 | outcome | agent | Conformant with justified divergence | Local provisional scope met; no cloud/worker or legal-quality claims |
| RD-005 | continuation | agent | accepted Follow-up assessment | Check scope completion; leave #4/#7 out-of-scope |
| RD-006 | session acceptance | agent | complete; stop automatic session | All P01-P03 complete, 94 tests and live MCP/CLI evidence current; no required local findings remain. #4/#7 integration and human distribution review remain external follow-ups |

## Validation Evidence

Supplied implementation evidence: 94 Python tests, Node navigation, Ruff,
format check, lock verification and whitespace check passed. Live HTTP and
stdio negotiated MCP 2025-11-25 and verified tool/resource/retry behavior.
No new validation executed during Review.

## Risks, Blockers, and Residual Work

No local implementation blocker. Cloud #4/#7 work is an explicit non-goal.
Human listening and rights review remain necessary for distribution.

## Review Record

### Scope and Evidence

* Task ID: issue-6-melody-arrangement
* Review date: 2026-11-13
* Review scope: full P01-P03
* Review depth and provenance: standard, default
* Review execution: Complete
* Helpers: none; single direct comparison
* Plan: .copilot-tracking/plans/2026-11-13/issue-6-melody-arrangement-plan.md
* Critique: .copilot-tracking/reviews/plans/2026-11-13/issue-6-melody-arrangement-plan-critique.md
* Changes: .copilot-tracking/changes/2026-11-13/issue-6-melody-arrangement-changes.md
* Research: .copilot-tracking/research/2026-11-13/issue-6-melody-arrangement-research.md
* Source: current main working-tree diff plus full untracked source/test/docs
  content; lockfile excluded from code findings.

### Opening Review State

Goal: verify actual musical variation and #6's local MCP/timing/screening/queue
contracts against current plan and PC-001. Evidence ready. Review read-only
outside this record; parent owns state, outcome and continuation.
Initial blockers: none.

### Acceptance and Change Coverage

| Scope | Implementation and validation evidence | Assessment |
|---|---|---|
| FR-001, NFR-001, P01-T01 | audio_poc/dsp.py `musical_plan`, `compose`, `vocal_pitch`; tests/test_melody.py diversity over 24 seeds and exact PCM; tests/test_audio_poc.py same-brief regenerated lead/vocal intervals; persistent three-brief CLI run | Met |
| FR-002, P01-T01/P02-T01 | audio_poc/melody.py `LyricLine`, `CompositionRequest`, `arrange`; input completeness, finite/ordered/grid/window bounds; one note per syllable, exact windows, actual chord voicings; MCP typed output/resources | Met locally; provisional schema, not #4 adoption |
| FR-003, NFR-002, P01-T02 | audio_poc/similarity.py `screen`, `similarity`; known PD/legacy references and service/POC persisted pitch history; 0.85 threshold, key/rhythm-independent comparison; failure before queue creation | Met for declared corpus; no catalog/legal clearance |
| FR-004, P02-T01 | audio_poc/melody_service.py component ledger, DSP oscillator/noise only, retained seed and file checksums; provenance tests | Met; commercial_use_basis null and human review Pending |
| FR-005, NFR-003, P02-T01 | MelodyService._submit BEGIN IMMEDIATE; logical identity unique, request conflict, existing live status; history/assets/job transaction; concurrent/restart tests | Met for durable SQLite queue; no second workflow enqueue |
| NFR-003, PC-001 | read_artifact uses committed UUID and name allowlist plus checksum; injected write failure cleans partial directory, leaves zero jobs; MIME/base64 verified with real MCP sessions | Met |
| P03-T01 | render_brief uses fresh screened seeds; align derives shared motif; web supplies durable history; CLI supplies history; existing accounting/auth and navigation tests pass | Met; legacy alignment honestly word-level |
| Candidate-selection revision | select_screened bounded eight candidates, explicit seed single attempt; preflight history snapshot before Speech, final transactional recheck; tests cover replacement/exhaustion | Justified local correction from observed rejection, threshold unchanged |
| Test ownership and package changes | Three focused new test modules plus shared deterministic fixture; existing renderer/web tests extended; MCP/OTel dependencies locked; no tests removed | Met |
| Documentation and source alignment | docs/melody-mcp.md and audio guides explicitly document queue states/ownership, provisional contract, ref set/method/threshold and scope limits | Met |

### Critique and Follow-Up Assessment

PC-001 resolved against failure-injection test and committed-only resource
lookup. No human approval checkbox was completed by the agent. Research/plan
follow-ups remain outside local implementation and are not relabeled defects.
No BRD/PRD/ADR authority was supplied; the design/issue scope supplies criteria.

| Follow-up | Why outside immediate scope | Owner or next action |
|---|---|---|
| #4 shared schema/Azure deployment/APIM/queue adaptation | Dependency is open and absent; local schema/queue explicitly provisional | Platform implementation owner |
| #7 final vocal worker and distributed recovery | This service produces backing and enqueues once, does not claim queue execution | Render-service implementation owner |
| Listening/producer/rights approval | Tests cannot establish musical usefulness or legal rights | Human reviewer before distribution |

### Reviewer Self-Check

* [x] Every local requirement, marker, revision, critique finding and follow-up assessed.
* [x] Execution/outcome separated; limits and material divergence explicit.
* [x] No substantive finding invented from missing cloud infrastructure.
* [x] Comparison used cited source/tests and supplied validation, no helper lanes.
* [x] Review read-only outside this record; no new tests run in Review.
