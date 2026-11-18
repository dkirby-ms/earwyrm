<!-- markdownlint-disable-file -->
# Review: Jingle chat

## Executive Summary

* Assessment: The full local chat-to-exact-vocals flow meets its functional contracts, with one paid-operation lifetime defect.
* Review execution: Complete.
* Assessed outcome: Defects found.
* Validation coverage: 212 targeted API/audio tests, 14 workspace UI tests, root typecheck/build and mocked desktop/mobile browser workflow passed before Review.
* Confidence and limitations: No live paid calls, tenant changes, deployment or human broadcast approval.

Parent Decision Record owns the final outcome and next actions.

## What You May Not Know

The browser uses real in-process MCP clients, not public MCP endpoints or an autonomous spending loop. Composition queue status remains distinct from completed private backing previews. Committed spoken and vocoded mixes both use approximate syllable timing, while ordinary spoken rendering retains its original placement.

## Findings and Proposed Routes

<!-- rpi:review id=RV-001 -->
### RV-001 [Medium]: MCP deadline can release the paid-operation guard before the writer finishes

The MCP adapter uses a four-minute tool deadline, shorter than a valid bounded
writer flow. A timeout closes transports and releases the API guard, but does
not make the underlying provider work stop.

* Related scope: P01-T01, P02-T01, NFR-002 and NFR-003.
* Expected behavior: bounded paid work remains serialized for its actual lifetime; a transport deadline must not leave requests running after the API permits another paid action.
* Observed evidence: `apps/api/src/jingle_tools.ts` `call` sets `timeout: 240000`; `connected` closes SDK transports in `finally`. `apps/api/src/lyric_service.ts` `LyricWriter.write_candidate` allows preflight, four generation/assessment attempts and successful safety screening. `apps/api/src/lyric_cloud.ts` `post` permits separate 30-second credential and HTTP waits. The supported writer flow can exceed four minutes. The lyric tool does not consume MCP request cancellation. Installed SDK `shared/protocol.js` `close` closes the transport and `_onclose` signals handler cancellation without awaiting callback completion. `apps/api/src/web_app.ts` then clears `lyrics_active` in `finally`.
* Impact: a slow but bounded paid write can report failure while continuing provider calls; a subsequent explicitly authorized action can overlap it.
* Resolution condition: the in-process MCP operation cannot release its API guard while its underlying paid handler is still running. A focused regression must cover a slow bounded writer crossing the current four-minute deadline.
* Proposed destination: `rpi-implement`, required in-scope follow-up.
* Smallest useful next action: preserve handler lifetime through transport deadline/teardown, or establish an operation deadline consistent with all bounded provider stages and prove slow valid operations stay serialized. No arbitrary retry or additional provider call is authorized by remediation.

## Parent Decision Record

### Current Disposition

* Based on events: RD-001 through RD-009.
* Review execution: Complete.
* Final outcome: Conformant after validated RV-001 remediation. The original
  assessed outcome remains Defects found; no second Review was performed.
* Finding decisions and next actions: RV-001 resolved against child implementation
  and validation evidence. Child changes were validated but not reviewed.
* Decisions still needed: none. Local session acceptance is established, with no
  remaining required follow-up; stop the automatic session. Live-provider and
  broadcast approval limitations remain unchanged.

### Decision History

| Event | Subject | Decision source | Status or value | Proposed destination | Final destination | Owner | More information needed | Smallest next action | Rationale |
|-------|---------|-----------------|-----------------|----------------------|-------------------|-------|-------------------------|----------------------|-----------|
| RD-001 | participation | user direction via automatic RPI | agent-owned | none | none | parent | none | Compare full task | User selected end-to-end; standard depth is the default |
| RD-002 | walkthrough | agent | skipped-auto | none | none | parent | none | Decide RV-001 | Agent-owned participation; no routine question needed |
| RD-003 | RV-001 | agent | accepted | rpi-implement | rpi-implement | parent | Slow-handler regression | Correct lifetime in a bounded child task | Evidence demonstrates deadline and handler lifetime mismatch |
| RD-004 | execution | agent | Complete | none | none | parent | none | Continue to follow-up | Every material requirement and supplied marker assessed once |
| RD-005 | outcome | agent | Defects found | follow-up | follow-up | parent | RV-001 resolution | Select required remediation | Functional flow passes, but paid serialization must survive its actual handler lifetime |
| RD-006 | continuation | agent | required in-scope correction selected | rpi-implement | child jingle-chat-timeout | parent | Slow bounded writer regression | Create .copilot-tracking/rpi-sessions/2026-11-18/jingle-chat/jingle-chat-timeout-state.json; reuse source evidence | Fix operation deadline to cover the existing bounded writer; no optional scope or second Review |
| RD-007 | RV-001 | agent, child implementation evidence | resolved | child jingle-chat-timeout | none | parent | none | Retain regression evidence | .copilot-tracking/changes/2026-11-18/jingle-chat-timeout-changes.md records a real-MCP regression failing under the old four-minute deadline and passing under fifteen minutes; eleven bounded provider stages finish without early release, extra attempts or longer individual waits |
| RD-008 | outcome | agent, completed Review plus child validation | Conformant | follow-up | none | parent | none | Accept local session scope | All parent functional criteria retain passing evidence; affected checks re-run with 213 API tests, 14 UI tests, root typecheck/build and whitespace check passing. Original assessed defect remains recorded; child changes validated but not reviewed |
| RD-009 | continuation | agent | session acceptance complete | follow-up | stop automatic session | parent | none | Persist stopped parent and child states | RV-001 is resolved, no required findings or completion blockers remain, and no optional work is manufactured. No live paid calls, tenant changes, deployment, push, commit or broadcast approval claimed |

## Validation Evidence

| Command or evidence | Scope | Status | Summary |
|---------------------|-------|--------|---------|
| `npm run typecheck` | Root and both workspaces | Passed | No type errors |
| Targeted API tests | Platform, creative audio, web API, creative lyrics | Passed | 212 tests; protocol, consent, ownership, held drafts, interrupted publication, missing/changed preview and exact audio |
| `npm run test:web -- src/App.test.tsx` | Existing workspace test file | Passed | 14 tests; conversation, advertiser/sign-out isolation, refusal consent and paid exact selection |
| `npm run build` | Root and both workspaces | Passed | Production artifacts built |
| Browser workflow and screenshots | 1440px desktop and 390px mobile | Passed | Injected API/auth; chat, draft, preview, exact estimate; no page exceptions or horizontal overflow |
| Live Azure and producer listening | Production behavior and quality | Skipped | No paid calls, tenant changes or broadcast approval authorized |
| Slow paid-operation lifetime | New MCP deadline boundary | Not previously covered | Required RV-001 regression |

## Risks, Blockers, and Residual Work

* Blockers: none at opening.
* Remaining active work: RV-001 required implementation and regression.
* Residual work: natural-singing quality and broadcast approval remain operator review, not an accepted production attestation. No optional scope expansion selected.

## Review Record

### Scope and Evidence

* Task ID: `jingle-chat`.
* Review date: 2026-11-18.
* Review scope: full task, P01-T01, P02-T01 and P03-T01.
* Assessed boundary: FR-001 through FR-004 and NFR-001 through NFR-003, local implementation and supplied validation.
* Review depth and provenance: standard, first-task default.
* Candidate identity: current uncommitted `jingle-chat` implementation.
* Review execution: Complete.
* Helper use: none; connected flow fits direct review.
* Plan: .copilot-tracking/plans/2026-11-18/jingle-chat-plan.md.
* Critique: .copilot-tracking/reviews/plans/2026-11-18/jingle-chat-plan-critique.md.
* Changes: .copilot-tracking/changes/2026-11-18/jingle-chat-changes.md.
* Research: .copilot-tracking/research/2026-11-18/jingle-chat-research.md.

### Opening Review State

* Goal: compare the shipped local chat-to-exact-vocals flow with the accepted plan.
* Scope: full task.
* Evidence readiness: every plan marker checked, changes and validation reconciled, critique PC-001 resolved by explicit retry contract.
* Acceptance basis: plan FR/NFR IDs and user-selected exact MCP vocals.
* Comparison boundary: changed production source, relevant tests and docs; no production readiness or live-provider attestation.
* Active read-only boundaries: Review may write only this record; parent may update orchestration state.
* Authority: parent owns assessment, findings, outcome, routes and continuation.
* Initial blockers: none.

### Acceptance and Change Coverage

| Requirement or scope | Implementation and validation evidence | Assessment | Finding or rationale |
|----------------------|----------------------------------------|------------|----------------------|
| P01-T01, FR-001 | `jingle_chat.ts` strict contracts; `lyric_mcp.ts` suggestion tool; `lyric_cloud.ts` full conversation preflight; `platform.test.ts` real multi-turn protocol and protected/imitation rejection | Met | Bounded suggestions are real MCP, not lyric approval or a spending loop |
| P01-T01, FR-002 | Optional direction enters `lyric_service.ts` risk input and cloud writer; `jingle_tools.ts` real client; `web_app.ts` saves accepted/held outcomes | Met | Existing writer validation remains authoritative |
| P02-T01, FR-003, PC-001 | `web_app.ts` stable owner/option logical identity and existing run/output repair; `web_app.test.ts` interrupted publication and completed-status retry | Met | Existing output is recovered without another publication or queue submission |
| P02-T01, FR-004 | `render_inputs` owner/lyric/job/digest checks; `render_fingerprint`; `render.ts` exact resources; `speech.ts` committed alignment; `creative-audio.test.ts` original MIDI/score, note timing, fixed duration and spoken mix comparison | Met | Neither committed voice variant recomposes music; mixing intentionally changes final WAV |
| P03-T01, FR-001 through FR-004 | `App.tsx` Create chat, immutable draft actions, private preview and exact estimate; `App.test.tsx` consent, isolation, sign-out, failures and exact paid handoff | Met | Existing direct three-option and ordinary-render paths remain |
| NFR-001 | Existing `authorized` and enabled-user gates, paid availability and literal true consent; `jingle_tools.ts` fixed resources/digests; `web_app.test.ts` denial cases | Met | No public MCP or credential exposure added |
| NFR-002 | Existing reservation/reconciliation and non-chat renderer branches retained; exact binding tested | Gap | RV-001: tool deadline can outlive guard serialization |
| NFR-003 | Strict inputs/results, closed transports, safe errors, labelled controls, log/live announcement, browser viewport checks and passing builds | Gap | RV-001: closing a transport does not await paid handler completion |
| Implementation updates and user decisions | Full conversation passed separately from brief tone; both committed voice variants use note timing; P03 concrete API guidance | Met | Evidence-backed clarifications preserve exact-vocal user direction |
| Design exception and documentation | Value-specific inherited Helvetica exception; `docs/service-contracts.md`, `docs/audio-poc/web-app.md`, `.env.example` | Met | No redesign; settings and synchronous queue/status limitations disclosed |
| Completion claims | Plan markers checked and changes summarize delivered behavior and supplied checks | Met with review finding | Implementation ran; final session acceptance still requires RV-001 |

### Critique and Follow-Up Assessment

* PC-001 is resolved by tests of publication failure and completed-status repair for the same stable job.
* All material local plan updates preserve the confirmed architecture, scope and exact-arrangement requirement.
* No significant divergent decision or paused dependent work resumed without authorization.
* No task-specific external BRD/PRD/ADR owns additional acceptance IDs; Business Alignment is not applicable.
* Plan and changes declare no residual follow-up; this Review introduces only the required RV-001 correction, not optional scope.

### Reviewer Self-Check

* [x] Every supplied requirement, marker, material update, critique disposition, validation result and completion claim has an assessment.
* [x] One substantive, evidence-grounded finding has severity, expected/observed behavior, resolution and route.
* [x] Complete execution is distinct from Defects found; passing checks do not substitute for the missing deadline regression.
* [x] Standard review assessed the bounded flow once, without cosmetic findings or production claims.
* [x] Review changed only this record; no validation executed or production source changed during Review.
* Checked boundary: P01-P03, FR-001 through FR-004, NFR-001 through NFR-003 and PC-001.
* Limited evidence: no live cloud latency, production deployment, natural-singing quality or broadcast approval.
