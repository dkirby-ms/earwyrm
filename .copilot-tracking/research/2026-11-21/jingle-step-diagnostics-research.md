<!-- markdownlint-disable-file -->
# Task Research: Jingle step diagnostics

| Field              | Value         |
|--------------------|---------------|
| Date               | 2026-11-21    |
| Researcher / agent | rpi-research  |
| Output mode        | convergence   |

## Executive Summary

* Bottom line: Add server-measured elapsed time for each generation stage to the existing user-owned progress response and timeline. Do not display token counts: they are not consistently available across the stages.
* Why this matters: Server stage boundaries can accurately time short steps that browser polling may miss, while partial token data could imply misleading or incomplete usage totals.
* Research status: Complete; the progress contract, stage transitions, token instrumentation, and relevant tests were traced.
* Confidence and uncertainty: High confidence in the selected measurement and scope. The implementation must preserve owner isolation and expose the final stage measurement after success or failure.

## What You May Not Know

The existing server records a total request duration and selected provider durations, but the live progress response currently contains only a stage. Score-token usage is recorded in telemetry separately and is not part of that response. Browser polling is every 500 ms, so it can miss short stages entirely.

## Findings

### F1: Server stage timings are the reliable per-step measure

The server already owns the stage transitions. Adding elapsed time at each transition provides actual stage durations even when a step starts and finishes between browser polls. Repeated stage assignments should not reset its timer, and repeated visits to a stage should accumulate rather than overwrite its duration. Keep the final active stage long enough for the browser to retrieve its terminal duration after either success or failure.

* Questions: Q1, Q2, Q3
* Evidence state: Evidence-backed finding
* Evidence: C1, C2, C5, C6
* Confidence and limits: High; the pipeline's stage transitions are server-owned and currently polled at 500 ms. The precise cache lifetime for terminal progress is an implementation detail for Plan.

### F2: Token counts are not a complete per-step diagnostic

The score provider records optional input and output token counts on telemetry spans. The lyric provider does not expose usage through the current lyric service contract, and Speech and internal render steps do not have model token counts. Provider request and response bodies are separately retained for administrator diagnostics and may contain private customer or generated content; they are not a substitute for user-facing metrics.

* Questions: Q1, Q2
* Evidence state: Evidence-backed finding
* Evidence: C3, C4, C5
* Confidence and limits: High for the inspected providers and browser route. Provider usage contracts may change later; this task should not add token metrics selectively.

## Recommendation and Alternatives

* Recommendation or decision state: Extend the owner-scoped progress response with accumulated stage durations and current-stage elapsed time, measured at server stage transitions; display completed and active durations in the timeline.
* Rationale: The API controls stage transitions (C2), and current client polling can miss short steps (C1, C6). Token data is partial and belongs to separate telemetry (C3-C5).
* What could change this result: A requirement to avoid progress API changes, or a future consistent and explicitly approved token-usage contract for all relevant stages.

| Option                                 | Benefits | Costs and risks | Evidence | Disposition |
|----------------------------------------|----------|-----------------|----------|-------------|
| Browser-side timing                    | No API change | Polling can miss short stages and misattribute elapsed time | C1, C2, C6 | Rejected |
| Server-reported stage durations        | Accurate stage-boundary timing; covers brief and completed steps | Requires a small progress contract change and terminal-result retention | C2, C7 | Selected |
| Token counts shown only for model steps | Useful for some model calls | Incomplete across steps and currently unavailable through the browser contract | C3-C5 | Deferred |

## Scope and Questions

* Goal: Show useful diagnostic information for each step of the browser jingle-generation flow.
* Audience and use: Signed-in users watching their generation request.
* In scope: Existing generation timeline, its progress API contract, directly related types, tests, and directly needed user-facing help.
* Out of scope: Live paid generation, deployment, provider or billing behavior, changes to lyrics or safety checks, administrator-only provider exchange details, and unrelated UI work.
* Decision and evidence criteria: Measures must reflect observed work, be correctly attributed to a step, remain safe for the current user-facing surface, and degrade honestly when unavailable.
* Requested output: Evidence-backed recommendation and planning handoff for a small implementation.

| ID | Question                                                        | Source             | Status |
|----|-----------------------------------------------------------------|--------------------|--------|
| Q1 | What metrics are already available at each stage?               | Codebase           | Answered: F1, F2 |
| Q2 | Which metrics can the current API expose reliably and safely?   | Codebase and tests | Answered: F1, F2 |
| Q3 | What presentation and validation preserve accurate UX behavior? | UI and tests       | Answered: F1 |

## Decisions and Feedback

| Group | Decision or feedback item | Status    | Owner | Rationale or input needed | Evidence | Impact of answer |
|-------|---------------------------|-----------|-------|---------------------------|----------|------------------|
| D1    | Metric and transport scope | Confirmed | Agent | Use server stage duration; exclude incomplete token counts and private provider exchanges | C1-C7 | Ready for a bounded plan |

## Risks and Open Questions

| Priority | Type          | Risk, question, or research item                                  | Impact                                        | Smallest action or evidence needed                  | Owner |
|----------|---------------|--------------------------------------------------------------------|-----------------------------------------------|-----------------------------------------------------|-------|
| L        | Risk | Terminal progress is currently cleared before a post-request poll | The last stage could lack its completed duration | Keep one owner-scoped terminal progress result briefly or return equivalent final metrics | Plan |
| L        | Deferred | Uniform token counts across stages | Users could mistake incomplete model-only usage for a full job total | Revisit only when all relevant providers expose an approved, consistent usage contract | Follow-up |

## Planning Readiness and Next Step

| Field                            | Record |
|----------------------------------|--------|
| Research disposition             | Executed |
| Decision participation           | Agent-owned, based on the user's end-to-end choice |
| Planning Readiness               | Ready; F1 and F2 resolve Q1-Q3, and a minimal API/UI path is identified |
| Research depth and helpers       | Cycle 1 complete: Wider, Deeper, and Contrarian; no helpers used |
| Blockers                         | None |
| Output mode and planning support | Convergence; supports planning when evidence-backed and Ready |
| Continuation owner               | Automatic RPI session |
| Required gates or confirmations  | None identified |
| Next action                      | Draft and critique the implementation plan |
| Primary evidence file            | .copilot-tracking/research/2026-11-21/jingle-step-diagnostics-research.md; date from current session date |

## Research Record

### Method and Boundaries

| Field                            | Record |
|----------------------------------|--------|
| Research posture and provenance  | Balanced; default |
| Helper lane effort               | Auto; default |
| Completion basis                 | All questions are source-verified; remaining token completeness is a separate deferred requirement, not a blocker for duration diagnostics |
| Explicit limits or deadline      | No live paid calls or deployment |
| Codebase and external scope      | Browser jingle UI, its progress API, relevant provider telemetry, tests, and directly related help; no external sources planned |
| Initial candidate areas          | apps/web/src/App.tsx, apps/web/src/types.ts, apps/web/src/App.test.tsx, apps/api/src/web_app.ts, apps/api/src/jingle_diagnostics.ts, apps/api/src/score_cloud.ts, docs/audio-poc/web-app.md |
| Evidence root                    | Workspace .copilot-tracking; date from the current session |
| Constraints and excluded sources | No secrets, paid requests, cloud changes, or edits outside the research root during this phase |
| Prior knowledge                  | Inspected the completed jingle-diagnostic-tracing research artifact and verified relevant source contracts; used only as prior context |

### Extensions and Participation

#### Extension Registry

| Kind        | Candidate                           | Provenance and scoped contract | Selected or skipped reason |
|-------------|-------------------------------------|--------------------------------|----------------------------|
| Skill       | rpi-research                        | Active phase contract           | Selected; owns this research |
| Instruction | TypeScript doc comments             | Applies to *.ts and *.tsx       | Selected for any changed declarations |
| Instruction | Markdown instructions               | Applies to Markdown files       | Selected for this artifact and directly related help |
| Instruction | Copilot Tracking Conventions        | Applies to .copilot-tracking/** | Selected for artifact and state placement |
| Instruction | Copilot Tracking Location           | Applies to .copilot-tracking/** | Selected for tracking root and ignored-file conventions |
| Skill       | impeccable                          | Frontend interface task         | Selected as design guidance; preserve the existing Operate UI and scope |
| Skill       | telemetry-foundations               | User-facing diagnostics metrics | Selected for metric naming, accuracy, cardinality, and privacy guidance |
| Skill       | accessibility                      | Accessibility framework review  | Skipped; no accessibility audit requested; normal accessible UI practices remain in scope |
| Instruction | Content policy and citation         | Applies to agent/prompt/instruction/skill/workflow output | Skipped; this tracking artifact is outside its `applyTo` scope |

#### Direction and Participation Log

| Checkpoint or change | Question, direction, or rationale | Answer or no-interaction reason | Result and revalidation effect |
|----------------------|-----------------------------------|---------------------------------|--------------------------------|
| Intake               | User asked to show helpful diagnostics in every generation step, with duration or token counts as examples | User selected “Handle it end to end”; agent-owned research and planning decisions | Proceed automatically through review; required gates still apply |
| Research scope       | Prefer accurate available measures; don't assume all examples are supported | Agent-owned choice: assess server timing, token coverage, and UI progress contracts before selecting | Server durations selected; partial token counts deferred |

### Research Cycle Log

#### Cycle 1

* Active posture, controls, and limits: Balanced; user-facing step diagnostics; no live generation, deployment, or changes outside the stated scope.

##### Wave 1: Wider

* Focus and questions: Inspect the browser flow, progress API, provider diagnostics, telemetry, tests, and existing product guidance.
* Evidence: App.tsx polls a stage-only progress response and renders static per-stage content (C1). The API owns stage transitions and returns only the current stage (C2). Provider request durations are logged, but not included in the live or durable user progress contract (C3). Score token usage is recorded only on telemetry spans; lyric responses do not expose usage, and speech is priced by submitted characters (C4-C5).
* Reflection: Server stage transitions can support accurate per-step durations. Need to verify the final-stage lifecycle and compare against client polling and selectively displaying available token counts.

##### Wave 2: Deeper

* Focus and questions: Trace every jingle stage boundary, repeat behavior, finalization, and existing tests for progress ownership and cleanup.
* Evidence: `set_stage` is called before each server-owned stage; same-stage calls occur more than once, and `score` can recur after a later stage (C2, C7). The active progress record is cleared when the request exits, and tests assert it becomes `{ stage: null }` after a failed request (C2, C8). The client polls every 500 ms and documentation explicitly says short steps may pass between updates (C1, C6).
* Reflection: The server must accumulate time when the stage changes, avoid resetting on repeated same-stage assignments, and preserve a short-lived terminal result so the final stage can be read after success or failure. Client-only durations cannot meet the accuracy criterion.

##### Wave 3: Contrarian

* Focus and questions: Challenge server timing, check whether token counts or raw diagnostic exchanges offer a better per-step metric, and verify the terminal retention trade-off.
* Evidence: Browser-side measurements cannot detect intermediate stages missed by polling (C1, C6). Token counts exist for score telemetry only, while lyric usage is not returned and later render stages have no token count (C3-C5). Provider model exchanges may contain customer prompts and generated content and are stored for administrator diagnostics, not the end-user timeline (C3, C9). A one-entry terminal progress record is already naturally bounded by the current single active progress slot and can retain the same owner check (C2, C8).
* Reflection: Counter-evidence rules out polling-derived durations and partial token counts for the timeline. Owner-scoped, ephemeral server timings are the smallest path that satisfies the request without exposing provider content or changing billing.

##### Synthesis and Re-entry

| Material or claim | Evidence | Disposition | Rationale | User-facing effect |
|-------------------|----------|-------------|-----------|--------------------|
| Server stage boundaries can provide accurate elapsed time | C1, C2, C6, C7 | Accepted | Server owns the transitions; browser polling is too coarse | Show stage duration and active elapsed time without relying on poll cadence |
| Token counts are not uniformly available at each step | C3-C5 | Accepted | Only score token fields are currently recorded on telemetry spans | Omit token counts rather than show incomplete usage |
| Terminal results must remain briefly retrievable | C2, C8 | Accepted | The route clears progress on exit; the browser needs the final stage measurement | Plan a short-lived owner-scoped terminal result or an equivalent final response |

* Another complete three-wave cycle needed: No
* Trigger or stop basis: The available progress, stage, telemetry, token, and test contracts resolve all questions; remaining design details are implementation-level choices
* Readiness or revalidation effect: Ready for Plan; no evidence gap blocks a bounded implementation

### Evidence Log

* Helpers: None used.

| ID | Claim or finding | Source or location | Retrieved and version | Tool | Confidence | Notes |
|----|------------------|--------------------|-----------------------|------|------------|-------|
| C1 | The browser polls for the latest stage and renders static step details | apps/web/src/App.tsx, `generationSteps`, `generate`, generation timeline | Not applicable | Semantic search and read | High | Poll interval is 500 ms |
| C2 | The owner-scoped progress endpoint returns `{ stage }`; stage transitions are server-controlled and progress is cleared after the request | apps/api/src/web_app.ts, `/api/jingles/:id/progress`, `set_stage`, `jingle_progress` | Not applicable | Search and read | High | Current response and request lifecycle verified |
| C3 | Request/provider durations are logged but not exposed through the progress or durable provider diagnostic schema | apps/api/src/jingle_diagnostics.ts, `trace_jingle`, `trace_jingle_provider`, `ProviderDiagnostic` | Not applicable | Search and read | High | Durations are content-free; provider bodies are separate |
| C4 | Score input/output token counts are optional and attached to OTel spans, not sent to the browser | apps/api/src/score_cloud.ts, `Completion`, `request_score` | Not applicable | Search and read | High | The API does not include them in the jingle response |
| C5 | Lyric model completion parses response text but the lyric response contract does not expose token usage | apps/api/src/lyric_cloud.ts, `complete`, `Completion` | Not applicable | Search and read | High | `usage` is not present in the lyric completion path |
| C6 | Generation progress documentation warns that short steps can pass between updates | docs/audio-poc/web-app.md, Create and review a jingle step 3 | Not applicable | Read | High | Matches the 500 ms client poll |
| C7 | Server stage setters can be repeated or revisit a prior stage; render reports voice and mix starts | apps/api/src/web_app.ts, jingle `set_stage`; apps/api/src/render.ts, `render_brief` | Not applicable | Search and read | High | Timing should accumulate by stage and keep same-stage calls from resetting |
| C8 | Existing tests verify owner isolation and expect progress to clear after failure | apps/api/tests/web_app.test.ts, paid jingle progress test | Not applicable | Search and read | High | Terminal response behavior needs focused test coverage |
| C9 | Administrator model exchanges can contain private prompts and model outputs | apps/api/src/jingle_diagnostics.ts, `ModelExchange`; apps/web/src/types.ts, `JingleDiagnostic` | Not applicable | Read | High | Do not expose exchange bodies in the user timeline |

#### Contradictions and Conflicts

None identified in the initial review.

### Artifact Self-Check

* [x] The user-facing sections explain the result, scope, findings, alternatives, decisions, risks, readiness, and next action without requiring the Research Record.
* [x] Every question is answered and every material result has one canonical evidence state.
* [x] Findings keep their explanation, supporting detail, evidence state, confidence basis, and counter-evidence together.
* [x] Every codebase finding has a C# ID and workspace-relative path with a heading or symbol.
* [x] The executed cycle records Wider, Deeper, and Contrarian waves, reflections, dispositions, synthesis, and re-entry decision.
* [x] Method, posture, constraints, extensions, participation, helper use, and prior knowledge are recorded.
* [x] Convergence selects and justifies one recommendation.
* [x] Research disposition, Planning Readiness, blockers, continuation owner, gates, next action, and evidence path are complete.
* [x] Research stayed within its write boundary; no secrets or external instructions were trusted.
* Checked sections: All sections; Cycle 1 complete and Planning Readiness is Ready.
* Missing or limited sections: None.
