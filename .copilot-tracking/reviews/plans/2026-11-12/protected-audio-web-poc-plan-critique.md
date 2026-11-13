<!-- markdownlint-disable-file -->
# RPI Plan Critique: Protected audio web POC

## Metadata

* Task ID: `protected-audio-web-poc`
* Critique date: 2026-11-12
* Plan: .copilot-tracking/plans/2026-11-12/protected-audio-web-poc-plan.md
* Critique execution: Complete
* Critique depth: standard
* Depth provenance: first-task default
* Critique type: initial
* Earlier critique: not applicable

## Inputs and Criterion Boundary

* Task context and caller requirements: Build a local web POC using the existing Entra External ID tenant, protected OAuth API permissions, private audio and evaluation storage, and browser workflows to select briefs, render, compare, evaluate, and download. Do not deploy, change tenant configuration, or submit paid Speech requests.
* Research and evidence considered: .copilot-tracking/research/2026-11-12/protected-audio-web-poc-research.md; docs/audio-poc/protocol.md; docs/audio-poc/rendering.md; audio_poc/__main__.py; audio_poc/speech.py; renders/speech-evidence.json.
* Decisions, dependencies, task Goals, and task Requirements considered: Same-origin Python API/static SPA; exact External ID issuer, audience, JWKS and route scopes from configuration; local private storage; explicit paid-render cap and per-run confirmation; phases P01-P03 and tasks P01-T01, P01-T02, P02-T01, P03-T01; requirements FR-001 through FR-007 and NFR-001 through NFR-006.
* Assessment boundary: Initial standard assessment of the complete supplied plan and listed evidence. No implementation, tenant inspection, deployment, paid requests, or open-ended research.

## Lens Assessments

| Lens          | Scope                    | Reasoning effort and source                          | Status | Candidates |
|---------------|--------------------------|------------------------------------------------------|--------|------------|
| Coverage      | All requirements and P01-P03 tasks | low (selected; standard lens default)       | Complete | 8 adopted; 0 rejected |
| Evidence      | All phases and supplied evidence   | medium (selected; standard lens default)    | Complete | 13 adopted; 0 rejected |
| Executability | All phases and dependencies         | medium (selected; standard lens default)    | Complete | 11 adopted; 0 rejected |
| Risk          | All phases and user boundaries      | medium (selected; standard lens default)    | Complete | 13 adopted; 0 rejected |

## Coverage Assessment

| Requirement, research, phase, or task ID | Coverage | Evidence or concern |
|------------------------------------------|----------|---------------------|
| FR-001, P01-T01, P03-T01 | Partial | Invalid-token and configuration failures are planned, but no configured sign-in success check or explicit live-tenant setup-pending status is defined. |
| FR-002, FR-003, NFR-006, P02-T01, P03-T01 | Partial | Browser workflow and accessibility checks are required but the runnable scenario and pass evidence are unspecified. |
| FR-003, FR-005, P01-T02 | Partial | Per-output transcript and rating are covered; component rights, metered usage, and the protocol's three-output rollup are not explicitly stored or derived. |
| FR-007, NFR-002, NFR-003, P01-T02 | Partial | Placeholder rejection, no retry, secret/log isolation, offline no-network behavior, and server-checked render confirmation lack named tests or contract detail. |
| P01-T01, P03-T01 | Partial | Dependency additions, `uv.lock` update, and exact lock validation are absent from task details. |
| FR-004, FR-006, FR-005, NFR-001, NFR-004, NFR-005 | Covered | Protected endpoints, route scopes, user ownership, private storage, and fake-provider/token tests are named. |

## Verdict

* Verdict: Revise
* Rationale: The plan has multiple High findings: browser acceptance, secret/log verification, protocol evidence and rollup, cumulative paid-render controls, and user-owned spending enablement. These require plan corrections before implementation readiness.

## Findings

<!-- rpi:critique id=PC-001 -->
### PC-001 [High]: Browser workflow and accessibility checks lack pass criteria

* Related IDs: `FR-002`, `FR-003`, `NFR-006`, `P02-T01`, `P03-T01`
* Evidence: `.copilot-tracking/plans/2026-11-12/protected-audio-web-poc-plan.md`, P02-T01 and P03-T01; Test Ownership and Validation.
* Concern: The plan requires a browser check but does not name its sequence or pass conditions for selecting, rendering, comparing, evaluating, downloading, keyboard traversal, visible focus, and status announcements.
* Impact: The browser workflow and accessibility requirements could be declared complete without verifying the requested user path.
* Smallest useful change: Add a local browser validation checklist for the complete offline workflow, expected-answer non-disclosure, protected playback/download, setup-needed state, and keyboard/focus/status behavior; record its results.
* Action owner: Planning parent.
* Exact resolving evidence: Updated P03-T01 and validation section naming the scenarios and expected results, followed by recorded browser-check results in the changes record.
* Decision route: Direct planner correction.

<!-- rpi:critique id=PC-002 -->
### PC-002 [High]: Credential and evaluator-data log protection has no check

* Related IDs: `NFR-002`, `P01-T01`, `P01-T02`
* Evidence: `.copilot-tracking/plans/2026-11-12/protected-audio-web-poc-plan.md`, P01-T01 and P01-T02 Details and test list.
* Concern: The plan prohibits returning or logging Speech credentials and evaluator answers, but its tests do not check response bodies or logs for those values.
* Impact: A route or exception path could disclose secrets or expected answers while the requirements appear covered.
* Smallest useful change: Add tests that render/evaluation responses and captured logs contain neither Speech secrets nor expected-answer strings.
* Action owner: Planning parent.
* Exact resolving evidence: Focused API tests exercising success and error paths with sentinel secret/answer values and asserting they are absent from responses and logs.
* Decision route: Direct planner correction.

<!-- rpi:critique id=PC-003 -->
### PC-003 [Medium]: Configured sign-in success has no acceptance check

* Related IDs: `FR-001`, `P01-T01`, `P02-T01`, `P03-T01`
* Evidence: `.copilot-tracking/plans/2026-11-12/protected-audio-web-poc-plan.md`, P01-T01 and P03-T01 validation details.
* Concern: The planned tests cover invalid tokens and missing configuration, while live tenant requests are excluded; no check verifies the configured MSAL scope request and successful token-to-protected-API path.
* Impact: The primary sign-in capability could be incomplete despite the failure-path tests passing.
* Smallest useful change: Add a fake-issuer/MSAL contract test for configured sign-in and scoped API access, and explicitly label live tenant verification as pending local setup.
* Action owner: Planning parent.
* Exact resolving evidence: Test showing configured MSAL requests the required scope and a valid test token reaches the protected endpoint, plus documented live-tenant setup status.
* Decision route: Direct planner correction.

<!-- rpi:critique id=PC-004 -->
### PC-004 [High]: Protocol evidence and overall status are not covered

* Related IDs: `FR-003`, `FR-005`, `P01-T02`
* Evidence: `docs/audio-poc/protocol.md`, Evaluation Procedure, Component Rights Evidence, Metered Usage Evidence, and Pass, Fail, and Pending; `.copilot-tracking/plans/2026-11-12/protected-audio-web-poc-plan.md`, P01-T02.
* Concern: The task covers a transcript/rating result but does not explicitly persist per-component rights and metered-usage evidence or derive the protocol's overall three-output status when users select only some briefs.
* Impact: Users could mistake a partial or transcript-only result for the POC result, or the app could not preserve the evidence required to determine Pass, Fail, or Pending.
* Smallest useful change: Extend P01-T02 and the requirements to preserve per-output evaluation plus component/usage evidence and derive a three-brief rollup; keep it Pending whenever evidence is missing.
* Action owner: Planning parent.
* Exact resolving evidence: Updated requirement and task detail specifying retained evidence, partial-selection rollup, and tests for Pass/Fail/Pending and incomplete sets.
* Decision route: Direct planner correction.

<!-- rpi:critique id=PC-005 -->
### PC-005 [Medium]: Paid-render safety gates lack focused tests

* Related IDs: `FR-007`, `NFR-003`, `P01-T02`, `P02-T01`
* Evidence: `.copilot-tracking/plans/2026-11-12/protected-audio-web-poc-plan.md`, P01-T02 and P02-T01.
* Concern: Tests are planned for spend preflight, but not for rejecting the sample placeholder, ensuring a failed request is never retried, requiring an explicit confirmation before the provider is invoked, or ensuring a credentialed test environment cannot instantiate the live Azure provider.
* Impact: Core safeguards could regress without a failing test.
* Smallest useful change: Name tests for each gate, assert the fake provider is not called when a prerequisite is missing, and isolate tests by clearing Speech credentials and patching the live provider.
* Action owner: Planning parent.
* Exact resolving evidence: Tests for placeholder evidence, missing confirmation, single-attempt failure behavior, and a test fixture that prevents live Speech calls even when developer credentials are present.
* Decision route: Direct planner correction.

<!-- rpi:critique id=PC-006 -->
### PC-006 [Medium]: Dependency and lock-file updates are not executable as written

* Related IDs: `P01-T01`, `P03-T01`
* Evidence: `.copilot-tracking/plans/2026-11-12/protected-audio-web-poc-plan.md`, P01 change map and P03-T01 validation; `pyproject.toml`.
* Concern: The map names `pyproject.toml` but not `uv.lock`; no task names the required web/JWT/runtime/test dependencies or defines the dependency-lock validation command.
* Impact: The existing documented `uv sync --locked` workflow can fail after dependencies are introduced.
* Smallest useful change: Name FastAPI, Uvicorn, PyJWT with crypto support, and the test HTTP client; include `uv.lock` in the map and define `uv lock`/`uv sync --locked` validation.
* Action owner: Planning parent.
* Exact resolving evidence: Updated P01 details and change map with the dependency/lock steps and P03-T01 with executable lock-validation commands.
* Decision route: Direct planner correction.

<!-- rpi:critique id=PC-007 -->
### PC-007 [Medium]: Offline rendering has no explicit zero-network acceptance

* Related IDs: `FR-002`, `FR-007`, `NFR-004`, `P01-T02`, `P03-T01`
* Evidence: `.copilot-tracking/plans/2026-11-12/protected-audio-web-poc-plan.md`, P01-T02 and Test Ownership and Validation; `docs/audio-poc/rendering.md`, What this produces.
* Concern: The plan offers an offline instrumental preview but does not require evidence that it makes no provider/network call or is labeled as not satisfying the vocal proof.
* Impact: A preview could be mistaken for the requested vocal proof or unexpectedly contact Speech.
* Smallest useful change: Add a zero-call fake-provider test and a user-visible/manifest label that instrumental-only output is not vocal proof.
* Action owner: Planning parent.
* Exact resolving evidence: Test and browser/manifest check asserting the instrumental path never invokes a provider and is labeled instrumental-only, not vocal proof.
* Decision route: Direct planner correction.

<!-- rpi:critique id=PC-008 -->
### PC-008 [Medium]: Paid-render confirmation is not part of the API contract

* Related IDs: `NFR-003`, `P01-T02`, `P02-T01`
* Evidence: `.copilot-tracking/plans/2026-11-12/protected-audio-web-poc-plan.md`, P01-T02 ("render-specific UI confirmation") and P02-T01.
* Concern: The plan describes confirmation only in the UI and does not specify a request contract the API validates before invoking Speech.
* Impact: The backend has no check that a paid request was deliberately confirmed for the selected briefs.
* Smallest useful change: Define a required confirmation field bound to the selected brief set and current estimate, reject its absence or mismatch before any provider call, and test that the provider remains unused.
* Action owner: Planning parent.
* Exact resolving evidence: Request schema and API test demonstrating missing/mismatched confirmation is rejected before the provider is invoked.
* Decision route: Direct planner correction.

<!-- rpi:critique id=PC-009 -->
### PC-009 [Medium]: Runtime metadata and signing algorithm are not cross-checked

* Related IDs: `NFR-001`, `P01-T01`, `P03-T01`
* Evidence: `.copilot-tracking/research/2026-11-12/protected-audio-web-poc-research.md`, Findings and Contradictions and Conflicts; `.copilot-tracking/plans/2026-11-12/protected-audio-web-poc-plan.md`, P01-T01.
* Concern: The research resolves issuer naming variants by consuming tenant OpenID metadata and comparing its issuer, but the plan directly configures issuer and JWKS values without a metadata consistency check. It also names RS256 without a supplied source establishing the tenant's signing algorithm.
* Impact: A mismatch between configured issuer, JWKS endpoint, and tenant metadata can prevent valid sign-in or use a key endpoint inconsistent with the intended tenant.
* Smallest useful change: Configure the tenant metadata URL, validate its exact issuer and JWKS endpoint against the API configuration, and accept RS256 only when the metadata supports it; fail closed on disagreement.
* Action owner: Planning parent.
* Exact resolving evidence: Updated auth task/config contract and tests for metadata issuer/JWKS/algorithm agreement and mismatch rejection.
* Decision route: Direct planner correction.

<!-- rpi:critique id=PC-010 -->
### PC-010 [Medium]: Route scopes are named without labeling them as a proposed contract

* Related IDs: `NFR-001`, `P01-T01`, `P02-T01`, `P03-T01`
* Evidence: `.copilot-tracking/plans/2026-11-12/protected-audio-web-poc-plan.md`, P01-T01 and the Risks table; `.copilot-tracking/research/2026-11-12/protected-audio-web-poc-research.md`, W3-W4 and Risks.
* Concern: The five route-scope suffixes are presented as fixed names while the research says actual registered scopes are unknown. If the tenant's app registration uses different scopes, MSAL requests and API authorization will disagree.
* Impact: Configured users can be unable to call routes even with a valid token.
* Smallest useful change: Label the suffixes as the POC's proposed API contract, document that tenant registration must expose matching delegated scopes, and configure the exact full scope URI used by both MSAL and the API.
* Action owner: Planning parent.
* Exact resolving evidence: Updated P01/P02/P03 details and tests proving the configured full scope URI maps to the route's `scp` requirement.
* Decision route: Direct planner correction.

<!-- rpi:critique id=PC-011 -->
### PC-011 [Medium]: A null commercial-use basis is conflated with the invalid placeholder resource

* Related IDs: `FR-007`, `NFR-003`, `P01-T02`, `P03-T01`
* Evidence: `docs/audio-poc/rendering.md`, Configure a live render; `audio_poc/__main__.py`, `load_evidence`; `renders/speech-evidence.json`; `.copilot-tracking/plans/2026-11-12/protected-audio-web-poc-plan.md`, P01-T02.
* Concern: The plan says the sample has both a placeholder resource reference and no commercial-use basis "so it must not enable Azure rendering." Existing rendering guidance permits a null basis for local experimentation, while the actual placeholder resource reference is independently invalid; without clarification, the plan changes the existing spend gate.
* Impact: The API could unnecessarily block an explicitly authorized local experiment or treat missing rights as a valid basis for distribution.
* Smallest useful change: State that the placeholder resource reference blocks the sample, a null rights basis keeps output status Pending and prohibits distribution, and any paid run remains disabled until the user separately enables it.
* Action owner: Planning parent.
* Exact resolving evidence: Updated risk and render details distinguishing Speech spend authorization from rights evidence and preserving Pending semantics.
* Decision route: Direct planner correction.

<!-- rpi:critique id=PC-012 -->
### PC-012 [High]: Repeated paid attempts are not bounded or reconciled across runs

* Related IDs: `FR-007`, `NFR-003`, `P01-T02`, `P02-T01`
* Evidence: `docs/audio-poc/rendering.md`, Configure a live render and Evidence and evaluation; `audio_poc/__main__.py`, `render_brief` and `main`; `audio_poc/speech.py`, `AzureSpeech.synthesize`; `.copilot-tracking/plans/2026-11-12/protected-audio-web-poc-plan.md`, P01-T02 and Risks.
* Concern: The plan enforces only a per-request cap and says failed requests are not retried. It does not record cumulative attempts, account for unknown charges, reconcile before another attempt, or serialize concurrent paid renders.
* Impact: Repeated or concurrent calls can exceed the user's total spending decision, and a timed-out request may still be billable while another request starts.
* Smallest useful change: Default paid rendering off; require an explicit user-configured cumulative cap and allowlisted subject; persist/reserve each estimate before dispatch, count failed/unknown attempts, serialize paid requests, and block new requests while an attempt is unreconciled.
* Action owner: Planning parent.
* Exact resolving evidence: Updated settings, ledger, concurrency, synchronous request-duration, and reconciliation contract plus tests for repeated, unknown, and concurrent attempts.
* Decision route: Direct planner correction.

<!-- rpi:critique id=PC-013 -->
### PC-013 [Medium]: MSAL asset source and CSP are unspecified

* Related IDs: `P02-T01`, `P03-T01`, `NFR-006`
* Evidence: `.copilot-tracking/plans/2026-11-12/protected-audio-web-poc-plan.md`, P02-T01; `.copilot-tracking/research/2026-11-12/protected-audio-web-poc-research.md`, W3-W4.
* Concern: The plan refers to a pinned MSAL asset and restrictive CSP but does not state whether it is vendored or loaded from a CDN, where it is obtained, or how the CSP permits it.
* Impact: The browser authentication dependency may not load under the intended policy, or an unpinned remote asset may weaken the frontend supply-chain boundary.
* Smallest useful change: Specify a pinned MSAL Browser version, delivery source, integrity/checksum evidence, and matching script-src policy.
* Action owner: Planning parent.
* Exact resolving evidence: Updated P02 details and setup/validation that the pinned asset loads under the documented CSP.
* Decision route: Direct planner correction.

<!-- rpi:critique id=PC-014 -->
### PC-014 [Medium]: Selected renders can change the existing deterministic score

* Related IDs: `FR-002`, `P01-T02`
* Evidence: `audio_poc/__main__.py`, `load_inputs`, `render_brief`, and `main`; `.copilot-tracking/plans/2026-11-12/protected-audio-web-poc-plan.md`, P01-T02.
* Concern: The renderer's `index` parameter controls the score, noise seed, and root note, and the CLI passes the canonical full-list index. The plan does not specify how a selected subset retains that canonical index.
* Impact: A brief selected alone or in a different order can produce a different render from the existing CLI proof.
* Smallest useful change: Preserve each brief's original index from `load_inputs()` and assign output IDs from a unique run ID; test selected renders against their canonical brief index.
* Action owner: Planning parent.
* Exact resolving evidence: Updated P01-T02 details and regression test showing a selected brief uses the same canonical index and produces the expected deterministic score.
* Decision route: Direct planner correction.

<!-- rpi:critique id=PC-015 -->
### PC-015 [Medium]: The local evidence database and storage boundary are unnamed

* Related IDs: `FR-005`, `NFR-005`, `P01-T02`
* Evidence: `.copilot-tracking/plans/2026-11-12/protected-audio-web-poc-plan.md`, P01-T02 and change map; `pyproject.toml`.
* Concern: P01-T02 says "database ownership lookups" but does not select a database or name its file, resolve the default root, specify owner-only permissions, or define the retention/deletion boundary; `.gitignore` appears in the map without an implementation or verification step.
* Impact: Storage, retention, privacy, and ownership tests cannot be built against a stable local contract, and generated evidence could be committed accidentally.
* Smallest useful change: Choose a standard-library SQLite database under a repository-root-resolved private directory, specify owner-only permissions and manual deletion, add the ignore rule, and verify it.
* Action owner: Planning parent.
* Exact resolving evidence: Updated P01-T02, P03-T01, and the map naming the store, root, owner key, access modes, retention/deletion boundary, `.gitignore` step, and ignore check.
* Decision route: Direct planner correction.

<!-- rpi:critique id=PC-016 -->
### PC-016 [Low]: The Speech evidence sample is described as checked in without tracking evidence

* Related IDs: `P01-T02`
* Evidence: `.copilot-tracking/plans/2026-11-12/protected-audio-web-poc-plan.md`, P01-T02; `git ls-files --error-unmatch renders/speech-evidence.json` returned no tracked path.
* Concern: The plan calls the local Speech evidence "checked-in," but Git does not track the file.
* Impact: A reader may assume the invalid sample is part of the repository rather than a local artifact.
* Smallest useful change: Describe it as the current local sample, not checked-in evidence.
* Action owner: Planning parent.
* Exact resolving evidence: Updated wording and a follow-up read of the plan.
* Decision route: Direct planner correction.

<!-- rpi:critique id=PC-017 -->
### PC-017 [Low]: The architecture decision cites evidence that does not establish its trade-off

* Related IDs: `P01-T01`, `P02-T01`
* Evidence: `.copilot-tracking/plans/2026-11-12/protected-audio-web-poc-plan.md`, D1; `.copilot-tracking/research/2026-11-12/protected-audio-web-poc-research.md`, C5 and W3.
* Concern: D1 cites absence of a web framework and an MSAL sample as support for a same-origin FastAPI choice, but neither compares hosting options. The research recommendation does choose this direction, but the plan does not distinguish it as an implementation decision.
* Impact: A supported design choice is presented as more evidence-determined than it is.
* Smallest useful change: Cite the Python renderer and research recommendation, and label same-origin/FastAPI as the chosen local POC design rather than a Microsoft requirement.
* Action owner: Planning parent.
* Exact resolving evidence: Updated D1 rationale and references.
* Decision route: Direct planner correction.

<!-- rpi:critique id=PC-018 -->
### PC-018 [Medium]: The local run and smoke-check contract is undefined

* Related IDs: `P01-T01`, `P03-T01`
* Evidence: `.copilot-tracking/plans/2026-11-12/protected-audio-web-poc-plan.md`, P03-T01 and Test Ownership and Validation.
* Concern: The plan requires setup/run commands and smoke checks but does not state the ASGI module, default host/port, command, or expected unconfigured-auth result. It also mixes an offline-render smoke check with the exclusion of live tenant requests without specifying a test identity.
* Impact: A maintainer cannot reproduce the local checks or write a precise setup guide without making undocumented choices.
* Smallest useful change: Name the local Uvicorn command and loopback address, define health/config/protected-route responses without tenant settings, and run offline API checks with local test tokens.
* Action owner: Planning parent.
* Exact resolving evidence: Updated P03-T01 with the command, expected status codes, and local-token test path.
* Decision route: Direct planner correction.

<!-- rpi:critique id=PC-019 -->
### PC-019 [High]: Paid-render enablement is treated as an agent decision

* Related IDs: `FR-007`, `NFR-003`, `P01-T02`, `P02-T01`, D4
* Evidence: User request and `.copilot-tracking/plans/2026-11-12/protected-audio-web-poc-plan.md`, Confirmed User Direction and D4.
* Concern: The user kept spending as a separate decision, but D4 is marked decided by the Agent and the plan does not state that paid rendering defaults to disabled or identify who may enable it.
* Impact: A local configuration or broad tenant scope could enable paid requests without the user's separate spending decision.
* Smallest useful change: Default paid rendering to disabled; require the user/operator to explicitly enable it later with a configured total and per-run cap and an allowlisted subject; keep code and tests unable to make paid calls.
* Action owner: Planning parent.
* Exact resolving evidence: Updated D4, settings contract, and tests showing paid rendering remains unavailable unless the explicit user-owned prerequisites are supplied.
* Decision route: Direct planner correction.

<!-- rpi:critique id=PC-020 -->
### PC-020 [Medium]: Protected playback and downloads could expose bearer tokens

* Related IDs: `FR-004`, `NFR-001`, `NFR-002`, `NFR-005`, `P02-T01`
* Evidence: `.copilot-tracking/plans/2026-11-12/protected-audio-web-poc-plan.md`, P02-T01 protected audio and download actions.
* Concern: The plan does not specify how browser media and downloads send bearer authorization. Direct audio or download URLs cannot attach an Authorization header; putting the token in a URL would expose it to history and logs.
* Impact: A developer may weaken the token boundary to make protected audio play or download.
* Smallest useful change: Require fetch requests with Authorization and short-lived object URLs for playback/download; forbid access tokens in query strings and test that URLs contain none.
* Action owner: Planning parent.
* Exact resolving evidence: Updated P02 details and browser/API validation demonstrating protected fetch, object-URL playback/download, and no token in any URL.
* Decision route: Direct planner correction.

<!-- rpi:critique id=PC-021 -->
### PC-021 [Medium]: Evaluation submissions can be changed after answer feedback

* Related IDs: `FR-003`, `P01-T02`, `P02-T01`
* Evidence: `docs/audio-poc/protocol.md`, Evaluation Procedure steps 2-3; `.copilot-tracking/plans/2026-11-12/protected-audio-web-poc-plan.md`, P01-T02.
* Concern: The plan returns match results but does not say whether a user may resubmit a transcript after seeing that feedback.
* Impact: A participant could revise a transcription after consulting the expected answer, invalidating the protocol's unblinded self-evaluation.
* Smallest useful change: Make the first transcript/rating submission per output immutable; any later attempt must be a separate, clearly labeled re-evaluation that cannot replace the original evidence.
* Action owner: Planning parent.
* Exact resolving evidence: Updated API/UI contract and test proving an answer-feedback response cannot overwrite the original evaluation record.
* Decision route: Direct planner correction.

<!-- rpi:critique id=PC-022 -->
### PC-022 [Medium]: The local API exposure and long render request are unspecified

* Related IDs: `P01-T01`, `P01-T02`, `P02-T01`, `P03-T01`
* Evidence: `audio_poc/speech.py`, `AzureSpeech.synthesize`; `audio_poc/__main__.py`, `render_brief`; `.copilot-tracking/plans/2026-11-12/protected-audio-web-poc-plan.md`, host and render details.
* Concern: The plan does not specify a loopback-only bind or explain that an Azure request may occupy the render request for up to 60 seconds per selected brief.
* Impact: A default non-loopback bind could expose a paid endpoint to the local network, while a three-brief request can exceed unstated client timeouts.
* Smallest useful change: Specify the loopback host and local port, one active paid render at a time, synchronous request bounds of up to 60 seconds per brief, and a visible busy state with no client retry/cancel that could hide an unknown attempt.
* Action owner: Planning parent.
* Exact resolving evidence: Updated run/render contract and browser check demonstrating the loopback local setup, disabled concurrent paid calls, and clear long-running status.
* Decision route: Direct planner correction.

## Strengths and Residual Risk

* End-to-end scope is limited to a local POC; no deployment, tenant mutation, or live paid calls are authorized.
* Token issuer, audience, tenant scopes, tenant metadata, and Speech credentials remain unknown configuration inputs; the plan must fail closed rather than invent values.

## Questions or Blocking Evidence Gaps

No immediate response is required. Tenant values remain local setup prerequisites, and paid rendering must remain disabled until a later user-owned configuration decision.

## Limitations

This is an initial standard critique limited to the supplied plan and evidence. It does not validate live tenant configuration or authorize external actions.

## Recommended Next Action

* Highest-impact findings: `PC-001`, `PC-002`, `PC-004`, `PC-012`, and `PC-019`
* Action owner: Planning parent
* Smallest next action: Revise the plan to resolve all High findings and directly disposition the remaining actionable findings before implementation.
* User response required: no
