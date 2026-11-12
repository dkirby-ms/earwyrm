<!-- markdownlint-disable-file -->
# Task Research: Issue #1 briefs and audio proof

| Field              | Value        |
|--------------------|--------------|
| Date               | 2026-11-11   |
| Researcher / agent | rpi-research |
| Output mode        | convergence  |

## Executive Summary

You chose a one-person POC evaluation: the user evaluates each of three synthetic outputs, and the provisional screen passes only if all three transcriptions identify both the brand and CTA and all three are rated “usable with minor edits.” Record this as self-evaluation, not independent-listener or production-professional evidence. The original 5+3 panel is retained only as deferred future validation. The $0.50 pass/fail threshold applies to metered per-render consumption; report fixed charges separately.

* Why this matters: it keeps this small POC decision distinct from the original multi-participant proof and prevents self-ratings from being reported as professional validation.
* Research status: both research cycles are complete, and the user-owned scope and cost decisions are recorded.
* Confidence and uncertainty: the 3/3 self-evaluation rule and metered-only cost basis are explicit user direction; the screen cannot establish broad listener or production-professional usability. Fixture formats and detailed record structures remain Planning choices.

## What You May Not Know

The user explicitly changed the POC evaluation scope from the issue's five-listener/three-professional panel to one participant. The original 15/9 and 12/15, 7/9 criteria are deferred future validation, not current POC criteria; a one-person POC cannot satisfy them. The proposal's “70%” label for 7/9 is mathematically inaccurate. Cost estimates remain estimates, and the user chose to compare metered per-render consumption to the $0.50 threshold while reporting fixed charges separately.

## Findings

### The human-evaluation threshold is seven of nine

The original multi-participant proof calls for at least seven of nine professional ratings to say “usable with minor edits.” The design proposal calls this 70%, but seven divided by nine is approximately 77.8%. Issue #1 and the project plan use the exact count; do not lower it by rounding. This original gate is retained as source history, but the user has directed a one-person POC screen instead.

* Questions: Q3
* Evidence state: evidence-backed finding, superseded as the active POC gate by user direction
* Evidence: W1, C4, C6
* Confidence and limits: high confidence in the arithmetic and controlling acceptance criteria; this does not change the required 7/9 threshold.

### The one-person POC uses a provisional 3/3 self-evaluation screen

You selected a provisional one-person rule: evaluate each of the three advertiser outputs, require the participant to transcribe both brand and CTA correctly for all three, and rate all three “usable with minor edits.” This creates three self-transcriptions and three self-usability ratings. It is an internal POC screen only; the user is not counted as five independent listeners or three production professionals, and the result does not establish general usability.

* Questions: Q3
* Evidence state: evidence-backed finding
* Evidence: user answer 2026-11-11; W1, C4, C5 establish the superseded source criteria
* Confidence and limits: the chosen 3/3 rule is explicit; it is not a validated substitute for the original independent/professional sample.

### Brief facts and evaluation answers need separate boundaries

The issue and proposal specify the brief facts and require expected brand/CTA answers, while the proposal places synthetic inputs behind an adapter that later connectors can replace. Use a normalized, provider-neutral brief containing the required facts, and keep expected evaluation answers separate from the adapter response so the scoring key is not returned to generation. IANA's example domains and NANPA's reserved fictitious phone range support non-operational contact placeholders in the fixtures.

* Questions: Q1, Q2
* Evidence state: evidence-backed finding
* Evidence: W1, W2, W3, C1, C2
* Confidence and limits: high confidence in the required fields and replacement boundary; serialization, validation rules, and fixture-file layout remain a Planning choice.

### Rights and cost must stay evidence-based and per-output

The original week-one gate requires documented commercial usage rights for every audio component, human scores, a render below five minutes, and cost below $0.50 per jingle. For this POC, the user replaced the multi-participant score with a 3/3 self-evaluation screen, while rights, render time, and cost remain distinct gates. Record component-level rights evidence and measured per-output usage; estimates in the proposal are not measurements. The user chose to compare metered per-render consumption to the $0.50 threshold and report fixed APIM/hosting charges separately.

* Questions: Q3, Q4
* Evidence state: evidence-backed finding
* Evidence: W1, C3, C4
* Confidence and limits: high confidence in the required cost and rights records and the user-selected metered-only threshold basis; actual render costs and rights evidence remain to be collected.

## Recommendation and Alternatives

* Recommendation or decision state: plan a provider-neutral brief contract and three synthetic fixtures, plus a one-person 3/3 self-evaluation record, an evaluation-only answer key, a component-rights record, per-render measurements, and separately reported fixed costs.
* Rationale: it implements your explicit POC direction, preserves a strict observable 3/3 screen, keeps the expected-answer key out of the adapter response, and avoids claiming independent/professional validation (user answer 2026-11-11; W1-W3, C1-C6).
* What could change this result: new user direction; Planning still selects fixture encoding and record formats, and should reconcile local docs with the unchanged live Issue #1.

| Option | Benefits | Costs and risks | Evidence | Disposition |
|--------|----------|-----------------|----------|-------------|
| User evaluates each of three outputs, with a provisional 3/3 self-evaluation rule | Fits the user's POC scope and creates a simple repeatable screen | Not independent or professional evidence; cannot support broad usability claims | User answer 2026-11-11; W1, C4-C5 | Recommended |
| Retain the original 5+3 full proof panel | Preserves independent listeners, professional ratings, and original issue thresholds | Requires participants beyond the user, which the user explicitly declined for this POC | W1, C4-C5 | Deferred for a future full proof |
| Descriptive-only one-person smoke run | Avoids an unsupported pass claim | Does not provide a binary POC gate as the user requested | User answer 2026-11-11 | Rejected by user direction |

## Scope and Questions

* Goal: establish evidence and decisions needed to plan Issue #1 without starting platform work.
* Audience and use: the Earwyrm product and engineering team preparing the week-one audio go/no-go.
* In scope: synthetic brief fields and expected answers, the replaceable advertiser adapter boundary, a one-person POC evaluation record, rights evidence, render timing and cost accounting.
* Out of scope: real advertiser data, participants beyond the user, actual recruitment or calendar changes, producing audio, cloud spending, platform implementation, and live tracker mutation.
* Decision and evidence criteria: user-directed provisional one-person screen requires all three outputs to have correct brand-and-CTA transcripts and “usable with minor edits” self-ratings. Preserve component rights and each-render-under-five-minute gates; compare metered per-render consumption to the under-$0.50 threshold and report fixed charges separately. The original 5+3 sample counts and 12/15, 7/9 gates are superseded for this POC.
* Requested output: evidence-backed recommendation and planning-ready open decisions.

| ID | Question | Source | Status |
|----|----------|--------|--------|
| Q1 | What brief facts and expected brand/CTA answers must be repeatable without real advertiser data? | Issue #1 and design proposal | Answered; exact expected-answer handling remains a Plan design |
| Q2 | What minimal adapter boundary lets synthetic fixtures and later connectors supply the same brief? | Design proposal and project plan | Answered at the boundary level; wire format remains a Plan decision |
| Q3 | How should this POC record evaluation results after reducing the evaluation to one participant? | User direction and issue #1 | Answered by user and revalidated: three outputs, with all three transcripts and self-ratings passing |
| Q4 | What cost record separates measured per-render consumption from fixed gateway and hosting charges? | Issue #1, design proposal, and user direction | Answered: compare metered per-render consumption with $0.50 and report fixed charges separately |
| Q5 | Are actual participant bookings needed for this POC? | User direction | Answered: no bookings or additional participants are needed |

## Decisions and Feedback

| Group | Decision or feedback item | Status | Owner | Rationale or input needed | Evidence | Impact of answer |
|-------|---------------------------|--------|-------|---------------------------|----------|------------------|
| D1 | The revised one-person POC gate | Confirmed | User | User selected three of three outputs correctly transcribed for both brand and CTA and rated “usable with minor edits”; classify results as self-evaluation, not independent or professional evidence | User answer 2026-11-11; W1, C4, C5 | Sets a provisional POC screen but does not meet the original multi-participant proof criteria |
| D2 | Whether the `<$0.50` gate covers only per-render metered consumption or also allocated fixed gateway/hosting costs | Confirmed: metered-only threshold | User | User chose to compare metered per-render consumption to $0.50 and report fixed charges separately. | User answer; C3, C4, W1 | Defines the pass/fail cost calculation and separate fixed-cost reporting |
| D3 | Whether briefs should be stored as machine-readable fixtures, human-readable documents, or both | Deferred | User / Plan | The proposal calls for structured briefs through a replaceable adapter but does not choose a fixture format | C2 | Determines the shape of the deliverable and validation |

### D2: Fixed-cost threshold basis

For the under-$0.50-per-jingle pass/fail check, the user chose to compare only metered per-render consumption and report fixed gateway/hosting costs separately.

* A: Compare metered per-render consumption to $0.50 and report fixed costs separately (recommended).
* B: Include an allocated share of fixed costs; name the usage-volume assumption for that allocation.
* C: Use another cost basis (specify it).

Selected: A, by user answer on 2026-11-11. The sources require the cost threshold and separate fixed-cost reporting but do not define whether an allocation enters the pass/fail calculation (C3-C4, W1). Issue #1 defines the protocol and does not yet measure actual render costs (C5).

## Risks and Open Questions

| Priority | Type | Risk, question, or research item | Impact | Smallest action or evidence needed | Owner |
|----------|------|----------------------------------|--------|------------------------------------|-------|
| High | Risk | One participant's self-evaluation replaces the issue's original 5+3 panel for this POC | The result cannot be presented as independent-listener or production-professional evidence | Label the result a provisional one-person screen; preserve full-panel evaluation as future work, not as completed evidence | User / Plan |
| Medium | Risk | Live Issue #1 retains its original 5+3 criteria while the user has revised the POC scope | Repository implementation may diverge from the live acceptance criteria | Reconcile local planning documents; do not mutate the live issue without separate authorization | Plan / User |
| Medium | Risk | Proposal cost estimates could be mistaken for measured per-jingle costs | Could incorrectly pass or fail the audio gate | Preserve measured usage, unit-cost calculation, and fixed-cost allocation as separate records | Research / Plan |
| Medium | Risk | The proposal's “70%” label does not match the exact 7/9 count | Rounding or copying the label could incorrectly lower the gate | Use the exact integer threshold of at least 7 of 9 | Resolved in protocol design |

## Planning Readiness and Next Step

| Field | Record |
|-------|--------|
| Research disposition | Executed; Wider, Deeper, and Contrarian waves completed |
| Decision participation | User-retained in automatic mode, from the user's “Keep going, but check with me” selection |
| Planning Readiness | Ready; user resolved D2 by selecting metered per-render consumption, with fixed charges reported separately |
| Research depth and helpers | Cycles 1 and 2 complete; no helper used |
| Blockers | None |
| Output mode and planning support | Convergence; supports planning when evidence and material decisions are resolved |
| Continuation owner | Confirmed automatic RPI Agent |
| Required gates or confirmations | D1 and D2 confirmed; Planning decision participation remains user-retained |
| Next action | Transition automatically to Plan |
| Primary evidence file | `.copilot-tracking/research/2026-11-11/issue-1-define-synthetic-advertiser-briefs-research.md`; date from current session date |

## Research Record

### Method and Boundaries

| Field | Record |
|-------|--------|
| Research posture and provenance | Balanced; default from rpi-research |
| Helper lane effort | Auto; no helper dispatched because the available repository evidence is small and directly inspectable |
| Completion basis | Both the original and revised-scope three-wave cycles are complete. The revised gate and its limitations are covered, and the user resolved the fixed-cost basis; no further research is needed for Planning. |
| Explicit limits or deadline | No deadline supplied |
| Codebase and external scope | Issue #1, `docs/design-proposal.md`, `docs/project-plan.md`, `docs/github-issues.md`, and repository artifact inventory; official IANA and NANPA references for fictional contact details |
| Initial candidate areas | Brief facts and claims, adapter contract, participant and scoring protocol, rights ledger, render timing, metered and fixed costs |
| Evidence root | `.copilot-tracking/research`; default codebase tracking root |
| Constraints and excluded sources | Synthetic advertiser data only; no external participant outreach or calendar changes, audio production, platform implementation, tracker mutation, or cloud spend |
| Prior knowledge | Supplied Issue #1 and project docs are starting evidence to verify. Existing project-plan RPI state belongs to a different task and is not reused. |

### Extensions and Participation

#### Extension Registry

| Kind | Candidate | Provenance and scoped contract | Selected or skipped reason |
|------|-----------|--------------------------------|----------------------------|
| Instruction | `copilot-tracking-location.instructions.md` | Applies to `.copilot-tracking/**`; fixes the tracking root at the codebase root and requires exact-path access for ignored files | Selected |
| Instruction | `copilot-tracking.instructions.md` | Applies to research tracking; defines research artifact location, ownership, and path conventions | Selected |
| Instruction | `markdown.instructions.md` | Applies to Markdown files; governs headings, links, tables, and formatting | Selected |
| Instruction | `writing-style.instructions.md` | Applies to Markdown files; governs voice and clarity | Selected |
| Instruction | `licensing-posture.instructions.md` | Applies to `.copilot-tracking/**`; requires paraphrase-first attribution for upstream materials | Selected |
| Instruction | `telemetry-overlay.instructions.md` | Its `applyTo` does not include `.copilot-tracking/research/**`; this research is not implementing production telemetry | Skipped as not applicable |
| Instruction | `disclaimer-language.instructions.md` | Its `applyTo` does not include `.copilot-tracking/research/**` | Skipped as not applicable |
| Skill | `experiment-design` | Experiment-design reference pack applies to product and UX experiments; use for repeatable test framing, not infrastructure | Selected |
| Skill | `evaluation-design` | Evaluation datasets and supporting documentation for conversational agents or retrieval-grounded systems | Skipped; this issue evaluates audio outputs with human listeners and producers |
| Skill | `telemetry-foundations` | Telemetry vocabulary and instrumentation conventions | Skipped; no production telemetry is being designed in Research |

#### Direction and Participation Log

| Checkpoint or change | Question, direction, or rationale | Answer or no-interaction reason | Result and revalidation effect |
|----------------------|-----------------------------------|--------------------------------|--------------------------------|
| Intake | Select progression and decision participation | User selected “Keep going, but check with me” | Automatic through Review; user-retained decisions in Research, Planning, Review, and Follow-up |
| Research opening | Whether supplied scope, criteria, or exclusions need clarification before evidence gathering | No question asked; the issue and proposal specify the inputs, thresholds, synthetic-data boundary, and task outcome. Participant scheduling ambiguity is preserved as D1 for synthesis. | Begin bounded research without widening the issue |
| Research decision D1 | Whether the 5+3 full panel remains required for this POC | User: “we are just building a POC and dont need to have real bookings or participants other than me” | User directed a one-participant POC gate. The original 15/9 panel is no longer the active design assumption; clarify the one-person success rule and label its evidence as self-evaluation, not independent/professional validation. |
| Research decision D1 follow-up | How to score the revised one-person screen | User selected “provisional_three_of_three” | Require all three outputs to have correct brand+CTA self-transcriptions and “usable with minor edits” self-ratings; classify as provisional self-evaluation, not professional or independent validation. Cycle 2 completed to revalidate the revised criteria. |
| Research decision D2 | Whether allocated fixed gateway/hosting costs count toward the `$0.50` threshold | User chose metered-only pass/fail; report fixed charges separately | User answer 2026-11-11 resolves the source ambiguity identified in C3-C4 and W1; Planning can proceed. |

### Research Cycle Log

#### Cycle 1

* Active posture, controls, and limits: balanced; use supplied Issue #1 and project documents; no actual scheduling, data collection, audio proof, or platform work.

##### Wave 1: Wider

* Focus and questions: compare Issue #1, the project plan, and proposal for input fields, adapter context, evaluation counts, thresholds, rights, render time, and costs.
* Evidence:
  * W1: the live issue confirms three synthetic briefs, an adapter contract, five listeners, three production professionals, and the exact gates.
  * W2: IANA reserves `example.com` and `example.org` for documentation examples without prior coordination.
  * W3: NANPA states that 555-0100 through 555-0199 are fictitious, non-working numbers reserved for entertainment/advertising.
  * C1: `docs/design-proposal.md` `1. Overview` and `2. Problem Clarity and Customer Relevance` place synthetic briefs in the MVP and describe the advertiser facts needed to ground a jingle.
  * C2: `docs/design-proposal.md` `4. Innovation and Differentiation` and `Core architectural components (MVP unless marked pilot)` identify brief fields, the same adapter interface for synthetic MVP inputs and a later connector, and the distinct later CRM/website connector.
  * C3: `docs/design-proposal.md` `3. Business Impact and Value Potential` and `9. Suggested Pilot` distinguish estimated consumption and fixed APIM/hosting costs and state the human and operational thresholds.
  * C4: `docs/project-plan.md` `Week-1 decision gate` and `Decisions to close during delivery` preserve the 12/15, 7/9, rights, under-$0.50, and under-five-minute gates and require missing ratings or rights to leave the gate pending.
  * C5: `docs/github-issues.md` `1. Define synthetic briefs and the audio evaluation protocol` and the dependent issues distinguish this definition task from audio generation and the later go/no-go decision.
* Reflection: the required facts, sample counts, thresholds, and synthetic-only boundary are consistent across the issue and project documents. Official IANA and NANPA guidance supports non-operational contact placeholders for the fictional fixtures. The remaining evidence gap is how to operationalize the adapter, sample assignment, schedule record, rating form, rights ledger, and cost split without modifying any gate.

##### Wave 2: Deeper

* Focus and questions: translate requirements into a repeatable fixture/adapter model, full participant-by-sample assignment, scoring records, rights evidence, and measured-versus-fixed cost accounting.
* Evidence:
  * C1-C2 establish the minimal business facts and that future CRM/website connectors are a later extension. A connector-neutral normalized brief should therefore remain separate from any provider-specific data source.
  * W1 and C4 require expected brand/CTA answers, but the answer key should not be returned by the production adapter to the generator or exposed to listeners before transcription. Keeping evaluation-only answers out of the adapter payload avoids contaminating the test.
  * W1 and C4 give counts that can be made repeatable by evaluating each of the three brief outputs with all five listeners and all three professionals: `3 × 5 = 15` transcriptions and `3 × 3 = 9` usability ratings. The issue states totals but does not expressly specify this complete-crossing assignment.
  * C4 says rights evidence and human ratings are gate inputs and missing evidence leaves the decision pending. C2 and C3 support a component-level rights record for generated music and the selected voice, with commercial-use evidence recorded rather than inferred from code generation.
  * C3 and C4 separate measured, per-render consumption from fixed gateway/hosting charges. A repeatable cost record needs a usage quantity, unit rate, currency, source/date, per-attempt attribution, and render duration; fixed monthly costs should remain visible separately and any allocation must name its volume assumption.
  * C3's published Azure figures and example volumes are estimates, not measured results; they can be labeled as assumptions, but cannot satisfy the cost gate.
  * W2 and W3 support using `example.com` and numbers in 555-0100 through 555-0199 for fictional contact details in future fixtures.
* Reflection: a full crossing is the simplest assignment that reconciles the required totals with exactly three brief outputs. Separate answer-key metadata from the adapter response; score a listener's hook as correct only when both brand and CTA are correct. Rights and rating evidence remain hard gates, not optional fields. Evidence does not authorize actual participant scheduling, and the issue leaves the cost threshold's treatment of fixed-cost allocations open.

##### Wave 3: Contrarian

* Focus and questions: test whether the full-crossing assignment, hidden answer key, minimum adapter, schedule record, component-rights evidence, and cost separation could conceal bias, leakage, a missing gate, or a false completion claim.
* Evidence:
  * C6: `docs/design-proposal.md` `9. Suggested Pilot` labels 7 of 9 ratings as 70%, while W1, C4, and `docs/project-plan.md` `Week-1 decision gate` specify the integer threshold of 7/9. Since 7/9 is about 77.8%, the percentage label is inaccurate; the issue and exact project-plan rule control.
  * C4: missing human ratings or rights evidence leaves the audio decision pending; the protocol cannot infer participant completion, rights, or a pass from fixture and form creation.
  * C3-C4: the `$0.50` per-jingle phrase and fixed operating costs coexist, while the documents explicitly request separate reporting but do not say whether fixed-cost allocation enters the threshold. Neither interpretation can be asserted as settled.
  * C4-C5: the listener and professional counts are small, and the docs frame them as a week-one gate rather than a population-wide market study. Report raw counts and treat the result as a scoped proof, not a general claim about all listeners or producers.
* Reflection: the contrarian check confirms that issue wording and the project's explicit decision rule should govern over the incorrect “70%” parenthetical. The exact rating count is fixed. Missing actual sessions or rights evidence cannot be replaced by a completed template. The test's small fixed sample supports only the scoped week-one decision, not a population-wide claim. The allocation basis for fixed costs and the meaning of “scheduled” still need user direction.

##### Synthesis and Re-entry

| Material or claim | Evidence | Disposition | Rationale | User-facing effect |
|-------------------|----------|-------------|-----------|---------------------|
| Required brief fields and connector replacement boundary | W1, C1, C2 | Accepted | Explicit in issue and proposal; no exact serialization is mandated | Use a normalized, provider-neutral brief; leave wire format to Planning |
| Evaluation assignment and exact thresholds | W1, C4, C5, C6 | Accepted | Full crossing yields the required counts; exact integer thresholds control over the proposal's inaccurate percentage label | Keep 12/15, 7/9, documented rights, strictly under $0.50, and each render strictly under five minutes |
| Safe fictional contact placeholders | W2, W3 | Accepted | Official sources designate the example domains and 555-0100 to 555-0199 as fictional/non-working | Use only reserved examples in the synthetic fixtures |
| Fixed-cost inclusion in the $0.50 decision | W1, C3, C4 | Deferred | The sources require fixed charges to be reported separately but do not settle whether an allocation changes the pass/fail threshold | Ask the user before planning the cost decision rule |
| Meaning of “scheduled” | W1; user direction 2026-11-11 | Resolved for this POC | User said no real bookings or additional participants are needed for this POC; this supersedes the original panel's scheduling language here | No bookings or external outreach; preserve the original panel only as future full validation |
| Population-wide usability or intelligibility claim | C4, C5 | Rejected | Five listeners and three professionals assess a scoped proof, not a representative population | Report raw counts and avoid generalizing beyond this proof |

* Another complete three-wave cycle needed: No for the original brief
* Trigger or stop basis: The original brief was covered; the later user-directed change from the 5+3 panel to a one-person screen requires the separate Cycle 2 below.
* Readiness or revalidation effect: Cycle 1 is retained as the original-source analysis; the current POC gate is being revalidated in Cycle 2.

#### Cycle 2

* Active posture, controls, and limits: balanced; apply the user-approved one-participant POC scope and provisional 3/3 rule. No external participants, bookings, actual audio production, or platform implementation.

##### Wave 1: Wider

* Focus and questions: compare the revised POC rule with every source criterion and dependent planning statement; identify what changed and what remains unchanged.
* Evidence:
  * User direction on 2026-11-11 replaces the 5+3 panel with one participant and a provisional 3/3 rule for this POC.
  * C7: repository documents still specify the original 5+3 panel and 15/9 measurements in the proposal, project plan, and issue drafts; the local plan also says missing panel feedback blocks the audio decision.
  * C3-C4 show that rights, under-five-minute render timing, and under-$0.50 cost are separate acceptance conditions and were not changed by the user's participant-scope decision.
* Reflection: the one-person rule is an explicit scope change, not an interpretation of the existing issue. Local proposal, project plan, and issue draft text must be reconciled in the implementation plan, while the actual GitHub issue remains outside the write boundary. The original panel may remain as future validation only if clearly marked as deferred; it must not be described as a completed requirement for this POC.

##### Wave 2: Deeper

* Focus and questions: examine the 3/3 sample math, scoring boundaries, claim limitations, and the difference between self-evaluation and independent/professional evidence.
* Evidence:
  * For three outputs and one participant, the revised record has three transcripts and three self-usability ratings. The chosen 3/3 rule is 100% of these three observations, not a rescaled estimate of the original 12/15 listener or 7/9 professional thresholds.
  * C4 and C7 show that all non-participant gates remain separate: documented commercial rights for every component, each render under five minutes, and the under-$0.50 cost target. At the time of this research wave, fixed-cost inclusion was unresolved; the user later selected a metered-only threshold and separate fixed-cost reporting (Research D2 above).
  * C5 keeps actual audio creation and the downstream product-path decision in later issues. Issue #1 can define inputs and records, but cannot claim the audio evidence or cost/rights measurements already exist.
  * A repeated listen or multiple entries by the same participant would not create additional independent listeners or production professionals. Preserve one participant identity and one outcome per output for this revised POC screen.
* Reflection: 3/3 is a strict, simple internal screen but has no external validation power; record the exact three outcomes and describe them as the user's self-evaluation. Keep rights, duration, and cost as independent pass conditions. Planning must update local project documents while clearly marking that the live issue still has original criteria.

##### Wave 3: Contrarian

* Focus and questions: challenge whether a one-person 3/3 result can justify the intended audio gate, whether it can be reported as professional usability, and whether it changes rights, timing, or cost criteria.
* Evidence:
  * W1 was rechecked with `gh issue view` after the scope change: Issue #1 remains open and still states the original five-listener/three-professional panel, 15 transcriptions, nine ratings, 12/15 and 7/9 thresholds, rights, cost, and render-time conditions.
  * A fresh search of `docs/design-proposal.md`, `docs/project-plan.md`, and `docs/github-issues.md` confirms the local source documents also retain the original panel and gates (C3-C7). The user-directed POC screen is therefore not yet reflected in those documents.
  * Neither the issue nor the local documents specified whether an allocated share of fixed gateway/hosting costs was included in the under-$0.50 pass/fail calculation (C3-C4, W1). The user later resolved this by selecting the metered-only threshold and separate fixed-cost reporting (Research D2 above).
  * The scope change supports an internal one-person POC screen, but cannot be reported as satisfying the issue's independent-listener or production-professional criteria. It also does not waive rights, render-time, or cost evidence.
* Reflection: the counter-evidence confirms a gap between the user's approved POC scope and the unchanged issue/repository criteria, not a reason to reinterpret the user's direction. Treat the one-person result only as a POC self-screen; carry local-document reconciliation into Planning and keep the live issue unchanged absent separate authorization. The only remaining research-stage decision that changes the cost gate is the user's fixed-cost basis.

##### Synthesis and Re-entry

| Material or claim | Evidence | Disposition | Rationale | User-facing effect |
|-------------------|----------|-------------|-----------|---------------------|
| One-person POC screen: three correct brand+CTA self-transcriptions and three “usable with minor edits” self-ratings | User direction; C4-C5, C7 | Accepted for this POC | Explicit user direction is bounded to one participant; it does not satisfy the original independent/professional sample | Record three outcomes as self-evaluation only; do not claim independent or professional validation |
| Rights, per-render duration, and cost conditions remain separate from the human screen | C3-C5, C7, W1 | Accepted | The user changed only participant scope; source documents retain the other conditions | Keep component rights, under-five-minute renders, and the under-$0.50 cost test as separate gates |
| Local planning documents still show the original panel, while live Issue #1 remains open and unchanged | C3-C7, W1 | Accepted as a reconciliation need | Direct recheck confirms the scope change has not propagated; tracker mutation is outside this research task | Reconcile local documents during Planning; do not alter the live issue without separate authorization |
| Whether allocated fixed charges count toward the $0.50 test | C3-C4, W1; user answer 2026-11-11 | Accepted | User selected the metered-only threshold and separate reporting of fixed charges | Compare metered usage to the target; disclose fixed charges separately |

* Another complete three-wave cycle needed: No
* Trigger or stop basis: The revised participant scope and all remaining criteria were checked across the issue and local documents, and the counter-evidence did not weaken the bounded 3/3 rule. The user resolved the remaining cost ambiguity, so another cycle would not change the result.
* Readiness or revalidation effect: The one-person gate is revalidated for this POC, and D2 is resolved. Planning Readiness is Ready.

### Subsequent Planning decision

The user later confirmed that the original five-listener/three-professional panel should remain in local project documents only as clearly labeled deferred future validation. It is not a current POC acceptance gate, and the live GitHub issue remains unchanged. This Planning decision is separate from Research D2, which concerns whether fixed gateway/hosting costs enter the `$0.50` pass/fail threshold.

### Evidence Log

* Helpers: none.

| ID | Claim or finding | Source or location | Retrieved and version | Tool | Confidence | Notes |
|----|------------------|-------------------|-----------------------|------|------------|-------|
| W1 | Issue #1 acceptance criteria define the inputs, evaluation counts, and gates | [Issue #1: Define synthetic advertiser briefs and audio proof criteria](https://github.com/dkirby-ms/earwyrm/issues/1) | 2026-11-11; issue state `OPEN` | `gh issue view` | High | Live body verified against the supplied attachment |
| W2 | `example.com` and `example.org` are reserved for documentation examples and can be used without prior coordination | [IANA-managed Reserved Domains](https://www.iana.org/domains/reserved) | 2026-11-11; page has no version | `web_fetch` | High | Official source checked directly |
| W3 | 555-0100 through 555-0199 are fictitious, non-working numbers reserved for entertainment/advertising | [555 Line Numbers](https://www.nanpa.com/numbering/555-line-numbers) | 2026-11-11; page has no version | `web_fetch` | High | Official NANPA source checked directly |
| C1 | The MVP uses structured synthetic advertiser facts; the audio proof addresses whether the vocoded vocal is commercially usable | `docs/design-proposal.md` `1. Overview`; `2. Problem Clarity and Customer Relevance` | not applicable | `view` | High | Proposal describes the intended user and purpose |
| C2 | Brief fields are name, offer, location, contact details, tone, and approved claims; MVP fixtures and future connectors should share an adapter boundary | `docs/design-proposal.md` `4. Innovation and Differentiation`; `Core architectural components (MVP unless marked pilot)` | not applicable | `view` | High | The source describes a replaceable connector, not a particular interface or serialization |
| C3 | Cost estimates are not measurements; variable consumption is distinct from fixed APIM and warm-hosting costs; evaluation requires rights, human ratings, cost, and render-time evidence | `docs/design-proposal.md` `3. Business Impact and Value Potential`; `9. Suggested Pilot` | not applicable | `view` | High | Cost amounts are proposal estimates, not measured outcomes |
| C4 | Week-one gate is conjunctive; exact human-rating thresholds and missing-evidence behavior must not be relaxed | `docs/project-plan.md` `Week-1 decision gate`; `Decisions to close during delivery` | not applicable | `view` | High | Project plan explicitly says missing ratings or rights leave the gate pending |
| C5 | Issue #1 defines inputs and protocol; later issues own audio production and the product-path decision | `docs/github-issues.md` `1. Define synthetic briefs and the audio evaluation protocol`; `2. Build the local audio proof`; `3. Decide the product path` | not applicable | `view` | High | Confirms phase boundary and no audio production in this task |
| C6 | The proposal's parenthetical 70% is inconsistent with 7/9; the exact count is controlling | `docs/design-proposal.md` `9. Suggested Pilot`; `docs/project-plan.md` `Week-1 decision gate`; `docs/github-issues.md` `1. Define synthetic briefs and the audio evaluation protocol` | not applicable | `rg`, `view` | High | 7/9 is approximately 77.8%; issue and project-plan threshold remains 7/9 |
| C7 | The repository's proposal, project plan, and issue drafts still define the 5+3 panel and its 15/9 records; missing panel feedback blocks the original audio decision | `docs/design-proposal.md` `9. Suggested Pilot`; `docs/project-plan.md` `Week-1 decision gate` and `Main risks`; `docs/github-issues.md` `1. Define synthetic briefs and the audio evaluation protocol` and `3. Decide the product path` | not applicable | `rg` | High | User direction supersedes those criteria for this POC, but no repository or live tracker document has been revised yet |

#### Contradictions and Conflicts

`docs/design-proposal.md` labels 7/9 as 70%; the exact 7/9 count in Issue #1 and `docs/project-plan.md` controls. The issue's phrase “scheduled” and per-jingle cost target do not define appointment evidence or fixed-cost inclusion; the user later resolved the POC scope and cost basis.

### Artifact Self-Check

* [x] User-facing sections explain the result, scope, findings, alternatives, decisions, risks, readiness, and next action.
* [x] Every question is answered or tied to the smallest missing evidence.
* [x] Material findings distinguish evidence from inference and uncertainty.
* [x] Codebase evidence uses `C#` IDs and stable workspace-relative locations.
* [x] The executed cycle records Wider, Deeper, and Contrarian waves, reflections, synthesis, and re-entry decision.
* [x] Method, extensions, participation, evidence root, boundaries, and prior knowledge are recorded.
* [x] Convergence selects a scoped recommendation and preserves unresolved choices.
* [x] User-retained material decisions are resolved before handoff.
* [x] Readiness, blockers, gates, next action, and evidence path are recorded.
* [x] Research remained read-only outside its tracking root.
* Checked sections: all applicable sections
* Missing or limited sections: none
