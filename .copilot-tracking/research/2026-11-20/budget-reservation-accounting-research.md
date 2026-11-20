<!-- markdownlint-disable-file -->
# Task Research: Budget Reservation and Actual Cost

| Field              | Value      |
|--------------------|------------|
| Date               | 2026-11-20 |
| Researcher / agent | rpi-research |
| Output mode        | convergence |

## Executive Summary

* Bottom line: Keep the upfront jingle cap, display outstanding reservation separately from verified actual cost, and release only the unused amount after an authorized reconciliation.
* Why this matters: The lyric reservation is made before provider calls and currently remains in the ledger after failure. The app has no request-level lyric dollar evidence, while the existing general reconciliation route accepts an owner-submitted amount and reference without independently verifying the reference.
* Research status: Complete; the reservation, provider, failure, persistence, UI, and reconciliation paths were traced, including counterevidence.
* Confidence and uncertainty: High confidence in current repository behavior and the documented Azure data limits. Account-specific charges for the two reported failures remain unverified and out of scope.

## What You May Not Know

The reported `$0.686` quote, `$0.62` lyric reservation, and "a few cents" of Azure charges do not establish that either logged failure incurred a reservation or that Azure billed a particular amount. Microsoft documents token counts in successful chat responses, not billed dollars, and Cost Management data is delayed and meter-oriented (W1-W3). Research did not inspect live Azure billing.

## Findings

### F1: Lyric reservations stay charged at the full cap

The full-jingle route reserves the configured worst-case lyric amount before it asks the provider to extract the brief or generate lyrics. The persisted lyric ledger stores the reservation amount but has no status, actual-cost field, or settlement operation. Budget balances continue summing every lyric reservation, so an early failure leaves the full amount counted. The service contract explicitly describes failed and partial actions as retaining their reservation.

* Questions: Q1, Q3
* Evidence state: Evidence-backed finding
* Evidence: C1-C3, C8
* Confidence and limits: High confidence from the reservation call path, schema, aggregation, and service contract. This establishes application accounting behavior, not whether either reported failure was charged by Azure.

### F2: The app does not receive verified lyric-call charges in its current provider path

The lyric adapter returns validated response content and does not expose provider usage or a cost amount. Request diagnostics record operation, HTTP status, duration, and allowlisted failure reasons, not billable usage. The current manual billing-evidence workflow is attached to a paid render attempt, which is created only after accepted lyrics and score composition. It therefore does not reconcile a lyric reservation for a request that fails before rendering.

* Questions: Q2
* Evidence state: Evidence-backed finding
* Evidence: C4-C6, C9
* Confidence and limits: High confidence for the inspected lyric and jingle paths. This does not establish that Azure account-level records cannot identify charges; those records were not supplied and live billing is out of scope.

### F3: Budget balances combine held amounts while some actuals are recorded separately

The user's budget view labels its aggregate as “Charged or reserved.” The administrator overview and jingle history can show recorded Speech and AI actuals separately, but the AI amount is entered on a paid attempt and does not reduce the separate lyric reservation. The general reconciliation endpoint checks that an owner supplies a non-empty reference; it does not independently verify the reference. For full jingles, reconciled Speech remains charged at least at its prior estimate, preserving the existing cap behavior.

* Questions: Q3, Q4
* Evidence state: Evidence-backed finding
* Evidence: C5-C7
* Confidence and limits: High confidence for current code and documented behavior. The evidence supports release after verification; the detailed persistence and operator workflow belong in Plan.

### F4: Provider token usage is not an immediate Azure dollar charge

The Azure chat completion response can include prompt and completion token counts, but not a billed dollar amount. The current lyric adapter discards those usage fields. Microsoft documents Foundry cost data as appearing 8 to 24 hours after usage, and Azure Cost Details as daily, meter-based records. Token usage could support a usage-priced calculation, but it should not be labeled or treated as a verified invoice charge.

* Questions: Q2, Q4
* Evidence state: Evidence-backed finding
* Evidence: C4, W1-W3
* Confidence and limits: High confidence for the cited API and billing documentation. The exact account charge and whether a particular Azure export can attribute a cost to one failed jingle remain unverified.

### F5: Existing reconciliation is not a verified-cost release gate

The general paid-attempt reconciliation endpoint is available to the attempt owner with `renders.write` permission. It accepts a non-empty evidence-reference string alongside the reported amount; it does not check the reference against Azure billing data. A normal owner can reconcile an attempt using a test-only reference, while a different owner is rejected. The separate score-reservation reconciliation endpoint demonstrates an admin check, but its evidence is a confirmed non-acceptance outcome and it does not release the reserved text amount.

* Questions: Q4
* Evidence state: Evidence-backed finding
* Evidence: C13-C14
* Confidence and limits: High confidence from the route authorization, request validation, and tests. The findings do not establish who currently has Azure billing access; they show that the app itself does not verify the submitted evidence.

## Recommendation and Alternatives

* Recommendation or decision state: Keep each lyric reservation as a pending hold until an application administrator records a verified actual and its evidence reference. Then show pending reservation and settled actual separately; count settled actual plus outstanding holds against the guard, releasing no more than `max(reserved - actual, 0)`. Keep actual pending when evidence is unavailable, and do not infer zero cost from failure or token usage.
* Rationale: The current lyric provider path returns no dollar cost, Azure billing data is delayed and meter-oriented, and the general attempt endpoint does not verify owner-submitted evidence. Existing jingle Speech and score reconciliation paths retain their conservative reservations rather than serving as refund precedents (C1-C6, C9, C13-C14, W1-W3).
* What could change this result: A reliable, request-attributable billing source that the app can consume and verify. Any actual above the original reservation should be recorded and surfaced as an over-cap charge, not converted into a negative release.

| Option | Benefits | Costs and risks | Evidence | Disposition |
|--------|----------|-----------------|----------|-------------|
| Keep reservation accounting unchanged | Preserves current behavior and spending guard | Continues to combine held estimates with actual usage in budget balances | C2-C3, C8 | Rejected by the user's stated goal |
| Separate reservation from verified actual cost and reconcile unused funds only after verification | Matches the requested distinction while preserving the cap | Requires attributable evidence, durable settlement state, and an admin-authorized failure-path reconciliation route | C1-C6, C8, C13-C14, W1-W3 | Selected for planning with evidence-gated settlement |

## Scope and Questions

* Goal: Determine how to retain the upfront jingle cap while separating reserved amounts from verified actual cost and releasing only verified unused reservation.
* Audience and use: The user and downstream planning and implementation phases.
* In scope: Local lyric and jingle cost estimation, budget reservation and release, provider result/error handling, persisted budget records, relevant UI, tests, and directly related documentation.
* Out of scope: Live Azure billing or account inspection/mutation, deployment, subscription billing, unrelated budget administration, and claiming the two reported failures incurred specific charges.
* Decision and evidence criteria: Trace reservation lifecycle and actual-cost source through code and persistence; determine when failures can be reconciled safely; identify user-visible presentation and tests that establish separate reserved and actual values; preserve the upfront spending cap.
* Requested output: Evidence-backed convergence research supporting a local implementation plan.

| ID | Question | Source | Status |
|----|----------|--------|--------|
| Q1 | Where and when does the app reserve, retain, or release budget for lyric and full-jingle generation? | User-provided context and codebase | Answered: C1-C3 |
| Q2 | What provider result or persisted data can establish actual cost, and when is that evidence available on success or failure? | Inferred from user goal | Answered for the current app: C4-C6, C11, W1-W3; exact per-failure Azure cost attribution remains unverified and out of scope |
| Q3 | How are reserved and consumed amounts represented in persistence and shown to the user or operator? | Inferred from user goal | Answered: C3, C5-C8 |
| Q4 | What tests and safeguards are needed to preserve the upfront cap while releasing only verified unused reservation? | Inferred from user goal | Answered at the contract level: C6, C13-C14; plan durable pending state, admin authorization, immutable/idempotent settlement, and failure/ownership/cap tests |

## Decisions and Feedback

| Group | Decision or feedback item | Status | Owner | Rationale or input needed | Evidence | Impact of answer |
|-------|---------------------------|--------|-------|---------------------------|----------|-------------------|
| D1 | Retain the upfront spending cap while displaying reserved and verified actual amounts separately; release unused reservation after cost verification | Confirmed | User | Explicitly stated in the task request | User request, 2026-11-20 | Sets the research goal and acceptance direction |
| D2 | Verify whether the two logged failures each incurred a `$0.62` reservation | Deferred | Evidence | Account-level evidence was not supplied, and live billing inspection is out of scope | User request, 2026-11-20 | Do not attribute the reported `$1.24` drop to those failures; this does not block local code research |
| D3 | Do not treat a failed result, diagnostic event, or token-derived amount as verified Azure dollars | Confirmed | Agent | Provider results expose usage counts but not charges; billing data is delayed and meter-oriented | C4, C9, W1-W3 | Keep actual unknown and reservation held until supported evidence is recorded |
| D4 | Reconciliation that releases shared budget must use an admin-authorized, evidence-backed path | Confirmed | Agent | The current general endpoint accepts a non-empty user-submitted reference without verifying it; a release would affect shared budget | C13-C14 | Plan must define evidence and authorization explicitly; do not reuse the owner-only endpoint as a verification gate |

## Risks and Open Questions

| Priority | Type | Risk, question, or research item | Impact | Smallest action or evidence needed | Owner |
|----------|------|----------------------------------|--------|------------------------------------|-------|
| High | Evidence gap | Account-specific charges for the two failures are unverified | Could misstate the cause of the reported balance drop | Keep the failures and `$1.24` explanation labeled unverified; live billing is out of scope | User / downstream |
| High | Reconciliation risk | Azure billing data is delayed and meter/day-oriented; current request diagnostics and provider responses do not record actual dollar charges | A cost may not be attributable to one failed lyric request at the time its reservation is held | Keep the reservation until an authorized reconciliation has trustworthy evidence; do not settle from HTTP status or token-derived cost | Planning |
| High | Authority gap | The existing paid-attempt endpoint accepts an owner-submitted amount and any non-empty reference, without independent verification | Reusing it for shared lyric holds could let an owner free budget without verified cost evidence | Use an admin-authorized settlement path and persist the evidence reference and settlement outcome | Planning |
| Medium | Above-reservation cost | A verified actual could exceed the original reservation | Treating the difference as a release would understate actual spend | Record the actual, release zero, and surface the over-cap amount explicitly | Planning |

## Planning Readiness and Next Step

| Field | Record |
|-------|--------|
| Research disposition | Executed |
| Decision participation | Agent-owned, from the user's end-to-end RPI selection |
| Planning Readiness | Ready for a local evidence-gated reconciliation design; not ready for automatic per-request invoice settlement because no request-attributable billing source is available in the app |
| Research depth and helpers | One complete Wider, Deeper, Contrarian cycle; no helpers used |
| Blockers | None; live account-specific charge verification is explicitly out of scope |
| Output mode and planning support | Convergence; supports planning when readiness is Ready |
| Continuation owner | Confirmed automatic RPI Agent |
| Required gates or confirmations | Preserve local-only write scope; no live billing or deployment actions |
| Next action | Automatic RPI Agent continues to Plan with admin-authorized, evidence-gated settlement as the design boundary |
| Primary evidence file | .copilot-tracking/research/2026-11-20/budget-reservation-accounting-research.md; date from active session |

## Research Record

### Method and Boundaries

| Field | Record |
|-------|--------|
| Research posture and provenance | Balanced; default. The task is bounded, but adjacent persistence, provider outcomes, and UI evidence may materially affect safe reconciliation. |
| Helper lane effort | Auto; no helper used because the local code paths are tightly coupled and suitable for direct tracing. |
| Completion basis | One complete three-wave cycle, final evidence mapping, counterevidence assessment, and readiness synthesis. |
| Explicit limits or deadline | Read-only research; local repository evidence only. No live Azure billing inspection or mutation, deployment, or subscription billing. |
| Codebase and external scope | Local code, tests, and directly related documentation; official Microsoft Foundry API and Azure Cost Management documentation to distinguish usage counts from billed charges. |
| Initial candidate areas | apps/api/src/lyric_budget.ts, lyric_service.ts, lyric_cloud.ts, cloud_web.ts, web_storage.ts, web_app.ts, apps/web/src/, API tests, and directly related documentation. |
| Evidence root | /home/saitcho/earwyrm/.copilot-tracking/research; date 2026-11-20 from the active RPI session; artifact .copilot-tracking/research/2026-11-20/budget-reservation-accounting-research.md. |
| Constraints and excluded sources | No account data, credentials, or live Azure charges. Preserve the upfront spending guard. Treat user-provided charge figures as unverified. |
| Prior knowledge | Reviewed active session state and the supplied user request. The completed budget-administration session has a different scope and is not reused. The supplied $0.686, $0.62, and few-cents values remain unverified. |

### Extensions and Participation

#### Extension Registry

| Kind | Candidate | Provenance and scoped contract | Selected or skipped reason |
|------|-----------|--------------------------------|----------------------------|
| Instruction | copilot-tracking-location.instructions.md | Applies to .copilot-tracking; resolves tracking root and ignored-file handling | Selected; tracking root is repository root |
| Instruction | copilot-tracking.instructions.md | Applies to research and RPI session artifacts; defines paths and artifact conventions | Selected |
| Instruction | markdown.instructions.md | Applies to Markdown artifacts; defines authoring conventions | Selected; research template begins with markdownlint disable marker |
| Instruction | writing-style.instructions.md | Applies to Markdown artifacts; defines voice and clarity | Selected |
| Instruction | licensing-posture.instructions.md | Applies to .copilot-tracking; requires paraphrase-first treatment of upstream material | Selected; no upstream text planned |
| Instruction | content-policy-citation.instructions.md | Applies to agent, prompt, instruction, workflow, and hook files | Skipped; does not match this research artifact |
| Skill | rpi-research | Explicitly activated for the current phase | Selected; owns this research artifact and evidence |
| Skill | rpi-plan, rpi-implement, rpi-review, rpi-refine | RPI phase entrypoints | Not activated during Research; downstream phases only |
| Skill | impeccable, accessibility | Available skill catalog | Skipped for Research; the request changes budget semantics and existing labels, not visual direction or interaction accessibility |
| Skill | telemetry-foundations, dataops, outcome-hypothesis | Available skill catalog | Skipped; this is not a telemetry, data-pipeline, or outcome-measurement investigation |
| Instruction | typescript-doc-comments.instructions.md | Applies to reusable TypeScript API changes | Skipped; no TypeScript was authored or modified during read-only Research |

#### Direction and Participation Log

| Checkpoint or change | Question, direction, or rationale | Answer or no-interaction reason | Result and revalidation effect |
|----------------------|-----------------------------------|---------------------------------|---------------------------------|
| Intake | Select RPI progression and decision participation | User selected “Handle it end to end” | Automatic progression through Review; phase decisions agent-owned, with material uncertainty recorded as a blocker rather than guessed |
| Research intake | Clarify goal, boundary, criteria, or output mode | No additional question; user specified separate reservation and actual values, release after cost verification, preservation of the upfront cap, and uncertainty about whether two failures reserved funds | Proceed with balanced, convergence research within local repository boundaries |

### Research Cycle Log

#### Cycle 1

* Active posture, controls, and limits: Balanced default; investigate connected estimate, reservation, actual-cost evidence, persistence, user-facing presentation, and failure paths without broadening to live billing or deployment.

##### Wave 1: Wider

* Focus and questions: Locate the reservation and cost flows, supporting storage, user-facing budget views, tests, and related docs. Questions Q1-Q4.
* Evidence: C1-C8. The route reserves a full worst-case lyric allowance before provider calls. The text ledger persists and aggregates the reservation without actual-cost or settlement fields. A separate paid-render reconciliation accepts manually supplied billing evidence for full-jingle AI actuals but begins only after accepted lyrics and score composition. User-facing budgets combine charged and reserved text amounts; docs state failed/partial actions retain the reservation.
* Reflection: Q1 and Q3 are answered. Q2 is partially answered: the inspected lyric provider response and diagnostic events do not expose billable cost; the existing actual-cost form cannot represent an early lyric failure. Prioritize whether any request-attributable cost evidence or durable failure identity exists, and examine safeguards needed before a verified settlement could release budget. Do not equate failure status with zero actual cost.

##### Wave 2: Deeper

* Focus and questions: Trace the exact quote versus reserved components, failure identity, persistence, manual billing-evidence route, available provider usage, and budget-source granularity. Questions Q2 and Q4.
* Evidence: C10-C12, W1-W3. The full jingle quote adds lyric writing, score composition, and Speech; the early lyric reservation covers only its lyric action. Failed lyric requests have a content-free diagnostic ID but no durable generation run or paid-attempt row to reconcile. The completion API can return token counts, while the Azure billing documentation describes delayed meter/resource costs and daily cost detail records.
* Reflection: A verified actual cannot be inferred immediately from token counts, provider status, or the current diagnostic ID. A local evidence-gated settlement can be planned, but the actor, cost attribution, and handling of requests that fail before a completion response must be explicit. The upfront cap must remain reserved while actual evidence is pending.

##### Wave 3: Contrarian

* Focus and questions: Challenge whether post-request cost is sufficiently reliable to release funds; look for failure, retry, duplicate-settlement, and cap-bypass risks or an existing alternative accounting contract.
* Evidence: C4-C6, C13-C14, W1-W3. Token usage is not a billed dollar charge, and Cost Management is delayed and meter-oriented. Failed lyric requests lack a durable paid-attempt row. The general reconciliation endpoint accepts owner-submitted amounts with any non-empty reference but does not independently verify it; the score reconciliation endpoint requires admin access and non-acceptance evidence, while both score and full-jingle Speech retain their reservations.
* Reflection: Releasing on request failure, token-derived prices, or an unverified owner-submitted reference would weaken the shared spending guard. The bounded safe alternative is a durable lyric reservation with pending/settled states and admin-authorized reconciliation from external billing evidence. Keep the actual pending when evidence cannot be attributed; never release more than the unused portion.

##### Synthesis and Re-entry

| Material or claim | Evidence | Disposition | Rationale | User-facing effect |
|-------------------|----------|-------------|-----------|--------------------|
| Lyric reservations persist as charged upper bounds with no settlement operation | C1-C3, C8 | Accepted | Directly documented and confirmed by source | Explains why an early failure can leave the entire amount held |
| Current lyric calls do not return cost evidence to the app | C4, C9 | Accepted with scope limit | Response parsing and diagnostics do not surface usage or charges | Actual charge must not be inferred from logs or outcome status |
| Existing manual AI-cost reconciliation settles early lyric failures | C5-C6 | Rejected | A paid attempt and reconciliation form are created only after lyrics and score succeed | Failure-path settlement is not currently available through this route |
| Token usage provides verified per-request Azure dollar charges | W1-W3 | Rejected | The API reports token counts, while billing documentation describes delayed meter-level billed costs | Usage can be shown separately from Azure actuals; it cannot safely release a reservation by itself |
| The existing owner reconciliation route verifies external billing evidence well enough to release a shared lyric hold | C5, C13-C14 | Rejected | It validates a non-empty reference, not the evidence itself; an attempt owner can submit a test-only reference | Use a separate admin-authorized settlement path and retain the hold until verified evidence is recorded |
| A verified amount above the original cap can be netted as a negative release | User's stated cap and release condition | Rejected | Only unused reservation can be released; an over-cap actual is additional spend, not unused funds | Record and surface actual above reservation, with zero release |

* Another complete three-wave cycle needed: No.
* Trigger or stop basis: The executed cycle covers the current local behavior, credible refund shortcuts, existing reconciliation counterexamples, and the official provider/billing contracts. Remaining account-specific charge attribution is explicitly outside scope, and no additional in-scope source is likely to change the design boundary.
* Readiness or revalidation effect: Planning can specify a local evidence-gated workflow; automatic invoice-level settlement is unsupported.

### Evidence Log

* Helpers: None; direct code-path research.

| ID | Claim or finding | Source or location | Retrieved and version | Tool | Confidence | Notes |
|----|------------------|-------------------|-----------------------|------|------------|-------|
| C1 | `jingle_write` computes a whole-action worst-case reservation from configured per-call upper bounds and fixed model/safety request ceilings | apps/api/src/lyric_budget.ts `lyric_allowance`, `lyric_budget` | not applicable | view | High | `jingle_write` uses the write ceiling plus direction extraction |
| C2 | The jingle route reserves before direction extraction and lyric generation; request failures do not remove the reservation | apps/api/src/web_app.ts `paid_lyric_backend`, `/api/jingles` | not applicable | view, rg | High | The helper writes first and the route has no matching lyric release call |
| C3 | Lyric reservation rows contain amount/action/time/owner and are always summed into text and user charged balances; there is no actual or settlement field | apps/api/src/web_storage.ts `_create_lyric_budget_schema`, `reserve_lyric_action`, `reserved_text_cost`, `user_budget`, `budgets_as_admin` | not applicable | view, rg | High | Text reservations are persistent and cumulative |
| C4 | The Azure lyric adapter validates the completion envelope and returns content without exposing provider usage or charge fields | apps/api/src/lyric_cloud.ts `Completion`, `post`, `complete` | not applicable | view | High | No live provider response was requested |
| C5 | A paid Speech attempt and the actual-cost reconciliation route exist only after accepted lyrics and score composition | apps/api/src/web_app.ts `render_selection`, `/api/jingles`, `/api/attempts/:attempt_id/reconcile` | not applicable | view | High | Manual cost values require an evidence reference |
| C6 | Full-jingle Speech reconciliation records Speech and optional AI actuals separately, while charged jingle Speech remains at least the estimate | apps/api/src/web_storage.ts `speech_usage`, `reconcile_attempt`, `check_speech_budget` | not applicable | view | High | Existing cap behavior is intentionally conservative |
| C7 | The user budget UI combines amounts as “Charged or reserved”; the jingle UI reports pending/unknown actuals and offers manual reconciliation for existing attempts | apps/web/src/App.tsx `Jingle workspace`, `jingle reconciliation` | not applicable | rg, view | High | Identifies the existing combined label and reconciliation surface; detailed presentation belongs in Plan |
| C8 | The service contract describes worst-case lyric reservations as retained after failed/partial actions and not as invoice tracking | docs/service-contracts.md “Browser chat and exact vocals”; docs/audio-poc/web-app.md “Understand costs”, “Manage budgets” | not applicable | rg, view | High | This is documented existing behavior, not a unit-conversion defect |
| C9 | Jingle diagnostics record operation, HTTP status, duration, and allowlisted reasons, but no billable amount | apps/api/src/jingle_diagnostics.ts `DiagnosticEvent`, `trace_jingle_provider` | not applicable | view | High | Diagnostic IDs do not prove billing |
| C10 | Full-jingle quotes combine writing, score composition, and Speech; the lyric reserve is only the writing action | apps/api/src/web_app.ts `jingle_quote`, `/api/jingles`; apps/api/src/lyric_budget.ts `lyric_allowance` | not applicable | view | High | User-provided amounts are not independently verified |
| C11 | A failed lyric-only jingle has no durable paid attempt; the durable attempt is created later by render selection | apps/api/src/web_app.ts `/api/jingles`, `render_selection`, `/api/attempts/:attempt_id/reconcile` | not applicable | view | High | Existing reconciliation cannot identify or settle early failures |
| C12 | Failed/partial lyric action retention and actual-cost distinctions are specified in service and app documentation | docs/service-contracts.md “Browser chat and exact vocals”; docs/audio-poc/web-app.md “Understand costs” | not applicable | view | High | Directly related product contract; user request changes that policy |
| C13 | Score reconciliation requires explicit non-acceptance evidence but retains the full shared reservation; full-jingle Speech also retains at least its estimate after reconciliation | apps/api/src/web_storage.ts `reconcile_score_compose`, `reserved_text_cost`, `check_speech_budget`; docs/service-contracts.md “Browser chat and exact vocals” | not applicable | view | High | Counterevidence to treating any existing reconcile operation as a refund precedent |
| C14 | General paid-attempt reconciliation accepts an owner-submitted amount and non-empty evidence-reference string without independently verifying it; the owner can reconcile with a test-only reference, while a separate score route checks application-admin status | apps/api/src/web_app.ts `/api/attempts/:attempt_id/reconcile`, `/api/admin/score-reservations/reconcile`; apps/api/tests/web_app.test.ts paid-attempt reconciliation test | not applicable | view | High | Do not reuse the general endpoint as verification for releasing a shared lyric reservation |
| W1 | [Analyze Microsoft Foundry costs in Azure Cost Management](https://learn.microsoft.com/en-us/azure/foundry/how-to/analyze-costs-cost-management) | Azure Foundry resource/group/subscription cost analysis | 2026-11-20; page dated 2026-11-09 | web search, fetch | High | Billed cost appears 8-24 hours after usage and is organized by resource and meter |
| W2 | [Ingest cost details data](https://learn.microsoft.com/en-us/azure/cost-management-billing/automate/automation-ingest-usage-details-overview) | Azure Cost Details data shape and reconciliation | 2026-11-20; page dated 2025-06-26, updated 2026-03-25 | web search, fetch | High | Cost records are daily and meter-based, not per API call |
| W3 | [Microsoft Foundry REST Reference - Azure OpenAI - Chat](https://learn.microsoft.com/en-us/rest/api/microsoft-foundry/azureopenai/chat) | `POST /openai/v1/chat/completions` response | 2026-11-20; page dated 2026-05-27, updated 2026-07-09 | web search, fetch | High | Successful responses can contain prompt/completion token counts; no dollar actual is returned |

#### Contradictions and Conflicts

No material source conflict identified. The apparent difference between owner reconciliation for paid attempts and admin reconciliation for score reservations is an intentional boundary distinction in the code and informs the proposed settlement authority.

### Artifact Self-Check

* [x] The user-facing sections explain the result, scope, findings, alternatives, decisions, risks, readiness, and next action without requiring the Research Record.
* [x] Every question is answered or names the smallest missing evidence, and every material result has one canonical evidence state.
* [x] Findings keep their explanation, supporting detail, evidence state, confidence basis, and counter-evidence together.
* [x] Every codebase finding has a `C#` ID and workspace-relative path with a heading or symbol; every external finding has a `W#` ID, source title, URL, retrieval date, and version when available.
* [x] The executed cycle records Wider, Deeper, and Contrarian waves in order, reflections, dispositions, and an evidence-based re-entry decision.
* [x] Method, posture, candidate areas, evidence root, constraints, extensions, participation, direction changes, helpers, and prior-knowledge treatment are recorded.
* [x] Convergence selects and justifies one recommendation; other modes preserve decision state without forcing one.
* [x] Decision groups, participation mode, and provenance are recorded; agent-owned choices have evidence-backed rationales or honest blockers.
* [x] Research disposition, Planning Readiness, blockers, continuation owner, gates, next action, further research, and residual uncertainty are complete and evidence-backed.
* [x] The stop reason is documented, speculation is labeled, untrusted content remained inert, no secrets were recorded, and the research-only write boundary held.
* Checked sections: Complete primary synthesis, scope/questions, method/boundaries, extensions, all three waves, evidence log, decisions, risks, readiness, and artifact self-check.
* Missing or limited sections: Account-specific charge verification remains intentionally out of scope; implementation test design belongs to Plan.
