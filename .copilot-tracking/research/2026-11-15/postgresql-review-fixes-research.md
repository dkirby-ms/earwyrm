<!-- markdownlint-disable-file -->
# Task Research: PostgreSQL review fixes

| Field | Value |
|-------|-------|
| Date | 2026-11-15 |
| Researcher / agent | RPI Research, child task postgresql-review-fixes |
| Output mode | convergence |

## Executive Summary

* Bottom line: The two PostgreSQL Review findings are confirmed. The smallest supported resolution is to reconcile app-owned firewall rules after infrastructure provisioning and enforce `verify-full` plus a trusted CA for every non-local explicit database URL.
* Why this matters: Removed egress addresses must not retain public database access, and remote database URLs must verify both the server certificate and hostname.
* Research status: Complete; both findings have evidence-supported resolution criteria and are ready for a focused Plan.
* Confidence and uncertainty: High for the root causes and platform behavior. The actual PostgreSQL test URL settings and live Azure firewall inventory were unavailable; preserve them as validation gates, not assumptions.

## What You May Not Know

The firewall rules are separate Azure child resources, not a list property that is replaced with the server configuration. PostgreSQL's documented deletion command is available, but firewall changes may take up to five minutes to apply, so a successful inventory check is not proof of immediate data-plane propagation. The repository's PostgreSQL integration tests reuse an environment-provided URL in the app, but the test fixture does not establish whether that server uses TLS; its actual configuration was not inspected.

## Findings

### F5: Allowlist reductions can leave obsolete public firewall access

The template names each PostgreSQL firewall rule by its position in the submitted list. A shorter list omits the former higher-index rules, and the current deployment path does not enumerate or remove them. ARM's recommended incremental mode keeps existing resources that are absent from the next template; that matters because Azure PostgreSQL uses individual server-level firewall rules to decide which public IPs can connect.

* Questions: Q4
* Evidence state: evidence-backed finding
* Evidence: C8, C9, C13, W6, W7
* Confidence and limits: High that template omission alone does not remove a rule. The repository has no live Azure inventory, so deployed rule state and network propagation remain unverified.

### F6: Explicit database URLs bypass the verified-TLS contract

The field-based PostgreSQL configuration sets `sslmode=verify-full` and a CA bundle, but the explicit URL branch returns its text without checking the effective TLS mode or trust configuration. PostgreSQL documents that `verify-full` validates the server certificate chain and hostname; weaker modes such as `require` do not guarantee the same identity check. The operator guide already tells URL users to use full verification, but neither the application nor the current URL tests enforce it.

* Questions: Q5
* Evidence state: evidence-backed finding
* Evidence: C10, C11, C12, W8
* Confidence and limits: High for configuration-path behavior and libpq's documented verification semantics. The review did not exercise a live URL connection. PostgreSQL integration tests pass their environment-provided test URL into the same app setting without declaring its TLS mode, so a blanket rule may break local test use; the actual URL and its TLS behavior are not known and must not be inferred.

## Recommendation and Alternatives

* Recommendation or decision state: Use narrowly scoped, post-provision firewall reconciliation in the existing approved deployment path, and require verified TLS for every non-local explicit PostgreSQL URL. Preserve a non-TLS option only for connections proven to be loopback or Unix sockets; do not treat an arbitrary test URL as local.
* Rationale: Incremental deployment behavior and the current gate explain the stale rules; Azure CLI supports individual rule inventory and deletion. Whole-resource-group complete mode is not recommended and is unavailable for the nested deployment. `verify-full` is the documented mode that checks both trusted certificate chain and hostname, while existing integration tests demonstrate a shared URL configuration but do not disclose the test server's TLS settings. C8-C15, W6-W12.
* What could change this result: A verified local test setup that needs a different narrowly scoped compatibility boundary, or evidence that deployment-stack ownership can be introduced without broadening the resource lifecycle.

| Option | Benefits | Costs and risks | Evidence | Disposition |
|--------|----------|-----------------|----------|-------------|
| Reconcile the expected firewall-rule inventory after provisioning, within the existing OIDC-gated path and managed rule namespace. | Removes stale app-owned rules without changing all infrastructure ownership; allows exact post-update inventory checks. | Requires safe server identification, Ready-state handling, strict treatment of unknown rules, and allowance for Azure propagation delay. | C8, C9, C13, C15, W6, W7, W11, W12 | Selected |
| Move PostgreSQL firewall resources to a deployment stack with deletion on unmanage. | Uses Azure's supported resource lifecycle mechanism for removed template resources. | Changes provisioning and ownership semantics for resources currently managed by `azd`/Bicep; adoption and stack scope need careful review. | W9 | Viable, deferred |
| Use complete-mode deployment to delete omitted firewall rules. | Could appear to make template omission delete resources. | Not recommended, applies at root scope only, and is unsupported for the nested template; risks unrelated resource deletion. | W10 | Rejected |
| Enforce `verify-full` and a trusted CA for every non-local URL; allow weaker settings only for explicit loopback/socket targets. | Closes the external-URL bypass while preserving local-only PostgreSQL test workflows. | The current test URL's actual host and TLS mode are unknown; tests must prove the boundary and remote test targets must use verified TLS. | C10-C15, W8 | Selected |
| Rely only on operator documentation or accept any test URL as exempt. | Requires little code change and may appear compatible with local tests. | Leaves executable URL configuration able to disable or weaken TLS verification. | C10-C14, W8 | Rejected |

## Scope and Questions

* Goal: Prepare a planning-ready, minimal resolution scope for accepted findings RV-001 and RV-002.
* Audience and use: The automatic RPI parent and the child Plan and Implement phases.
* In scope: PostgreSQL firewall-rule lifecycle in the Bicep deployment, gate and documentation; TLS validation of explicit PostgreSQL URLs; focused tests and operator guidance.
* Out of scope: Live Azure provisioning, live database connectivity, data cutover, credentials, broad network redesign, and unrelated application changes.
* Decision and evidence criteria: Removed IPv4 entries no longer retain PostgreSQL reachability after an approved update; every hosted connection path uses certificate and hostname verification or fails closed; local workflows remain supported without weakening hosted safeguards.
* Requested output: Convergent evidence synthesis and a planning handoff.

| ID | Question | Source | Status |
|----|----------|--------|--------|
| Q4 | What deployment behavior can retain PostgreSQL firewall rules after the allowlist shrinks, and what observable result demonstrates that removed addresses are no longer permitted? | Accepted finding RV-001 and P05-T01 | Answered; post-update inventory must match the allowlist, with actual network propagation kept as a deployment gate: C8, C9, W6, W7, W11, W12 |
| Q5 | Does the explicit database URL path enforce full certificate and hostname verification, and what supported configuration boundary can do so without weakening local workflows? | Accepted finding RV-002 and P05-T01 | Answered; enforce full verification for remote URLs and constrain any non-TLS allowance to proven local targets: C10-C15, W8 |

## Decisions and Feedback

| Group | Decision or feedback item | Status | Owner | Rationale or input needed | Evidence | Impact of answer |
|-------|---------------------------|--------|-------|---------------------------|----------|------------------|
| D5 | Firewall-rule reconciliation boundary | Selected | Agent | Reconcile individual rules after Bicep provisioning using the existing OIDC-gated deployment path; manage only the app-owned namespace, detect unknown rules, and require post-update inventory equality. | C8, C9, C13, C15, W6, W7, W11, W12 | Resolves RV-001 without changing whole-resource-group deployment mode or requiring an immediate stack migration. |
| D6 | URL-based TLS enforcement boundary | Selected | Agent | Require effective `sslmode=verify-full` and trusted CA for every non-local URL; permit a non-TLS exception only for proven loopback or Unix-socket connections. | C10-C15, W8 | Resolves RV-002 while keeping a narrow local-test boundary; remote test databases must use verified TLS. |
| D7 | Full TypeScript migration scope | Deferred to downstream research | Downstream | The user suggested moving everything to TypeScript; determine whether that includes the Python API, CLI/MCP and audio runtime, and whether the earlier `src/audio_poc/` decision still applies. | User direction 2026-11-15; parent state | Affects the queued `react-vite-web` research only; does not change this child’s PostgreSQL fix scope or order. |

## Risks and Open Questions

| Priority | Type | Risk, question, or research item | Impact | Smallest action or evidence needed | Owner |
|----------|------|----------------------------------|--------|------------------------------------|-------|
| Medium | Validation gate | Azure firewall changes may take up to five minutes to apply, and no live server was inspected. | The control-plane inventory may be correct before the network data plane has applied the change. | Keep app writers stopped through reconciliation; verify inventory, respect server readiness and propagation, and leave live connectivity verification to the approved deployment gate. | Implementer / deployment owner |
| Medium | Validation gate | The `EARWYRM_TEST_DATABASE_URL` host and TLS configuration are environment-supplied and not established by repository evidence. | A blanket URL rule could break local integration tests, while a broad test exception could weaken remote TLS. | Test strict remote URLs and a proven local target; if the configured test DB is remote, require its full TLS mode and trusted CA. | Implementer |
| Low | Further research | The user suggested a full TypeScript migration for the queued React/Vite work. | It may supersede the earlier mixed Python/TypeScript boundary and `src/audio_poc/` decision. | Include full-runtime TypeScript versus a bounded hybrid option in `react-vite-web` Research. | Downstream RPI |

## Planning Readiness and Next Step

| Field | Record |
|-------|--------|
| Research disposition | Executed |
| Decision participation | Agent-owned; inherited from the confirmed automatic RPI session |
| Planning Readiness | Ready; D5 and D6 select evidence-supported remediation boundaries for RV-001 and RV-002. Actual test-server TLS settings and live Azure state remain implementation/deployment validation gates. |
| Research depth and helpers | One complete focused Wider, Deeper, and Contrarian cycle; no helper used. |
| Blockers | None to repository planning. Live Azure provisioning, rule propagation, and data cutover remain outside this child task. |
| Output mode and planning support | Convergence; supports planning when readiness is Ready. |
| Continuation owner | Confirmed automatic RPI Agent |
| Required gates or confirmations | No live Azure operations or secret access; use mock-based repository validation. Confirm the test database's TLS/host boundary only through a safe, non-secret test configuration. |
| Next action | Transition automatically to Plan after persisting the completed Research state. |
| Primary evidence file | .copilot-tracking/research/2026-11-15/postgresql-review-fixes-research.md; date from the parent session directory. |

## Research Record

### Method and Boundaries

| Field | Record |
|-------|--------|
| Research posture and provenance | Focused; brief-based because the parent selected two bounded findings with named code and documentation targets. |
| Helper lane effort | Auto; no helper used because the evidence boundary is small enough to inspect directly. |
| Completion basis | Verify each finding against source and official platform/library behavior, compare viable resolution boundaries, and identify checkable implementation acceptance criteria. Remaining uncertainty is limited to live or environment-supplied deployment/test configuration that is out of this research boundary. |
| Explicit limits or deadline | No live Azure provisioning, data cutover, secrets, or changes outside the two findings. |
| Codebase and external scope | PostgreSQL deployment and connection settings, focused tests and operator guidance; official Azure Resource Manager and PostgreSQL documentation. |
| Initial candidate areas | infra/postgresql.bicep; scripts/deployment_gate.py; audio_poc/persistence.py; tests/test_postgres_storage.py; deployment and web-app guides; ARM incremental deployment and libpq TLS documentation. |
| Evidence root | Repository .copilot-tracking/research/. |
| Constraints and excluded sources | Research-only writes; no credentials; no live resource access; no broad security audit or network redesign. |
| Prior knowledge | Reused the parent plan, research, changes record, and completed Review. Continue the parent's questions and evidence IDs: Q4-Q5, F5-F6, C8 onward, W6 onward, and D5 onward. The accepted findings remain unresolved. |

### Extensions and Participation

#### Extension Registry

| Kind | Candidate | Provenance and scoped contract | Selected or skipped reason |
|------|-----------|--------------------------------|----------------------------|
| Instruction | copilot-tracking-location.instructions.md | Installed HVE Core instruction; resolves the repository tracking root and ignored files. | Selected for the research artifact path. |
| Instruction | copilot-tracking.instructions.md | Installed HVE Core instruction; controls tracking artifact paths and plain-text path references. | Selected for the research artifact. |
| Instruction | markdown.instructions.md and writing-style.instructions.md | Installed HVE Core instructions; govern Markdown format and clear writing. | Selected for the research artifact. |
| Instruction | licensing-posture.instructions.md | Installed HVE Core instruction; requires paraphrase-first use of sourced material. | Selected; no external prose will be reproduced. |
| Skill | secure-by-design | SBD-08, SBD-09, and SBD-10 references; scoped to attack-surface reduction, layered controls, and focused regression evidence. | Selected because stale network access and TLS bypass concern security control boundaries. |
| Skill | telemetry-foundations | Shared telemetry vocabulary. | Skipped; the findings do not add or change telemetry. |
| Skill | security-planning | Security planning and plan-drift reference. | Skipped; no security model or standards mapping is requested. |
| Skill | OWASP infrastructure | Infrastructure security assessment reference. | Skipped; the scope is two accepted implementation findings, not a framework assessment. |
| Skill | DataOps | Data pipeline and data-science validation guidance. | Skipped; this is transactional application storage and deployment configuration. |
| Skill | RPI lifecycle phase skills | RPI parent and phase-entrypoint skills. | Skipped as research extensions; they coordinate rather than supply the scoped security or database evidence. |

#### Direction and Participation Log

| Checkpoint or change | Question, direction, or rationale | Answer or no-interaction reason | Result and revalidation effect |
|----------------------|-----------------------------------|---------------------------------|--------------------------------|
| Intake | Parent selected RV-001 and RV-002 as required findings and approved a focused implementation child loop. | No question; decision participation is agent-owned, and scope and acceptance conditions are already stated in the review record. | Research remains limited to the two findings; React/Vite stays queued after this child. |
| Caller direction | The user suggested moving everything to TypeScript rather than mixing Python and TypeScript. | The current child scope and automatic RPI ordering remain confirmed; the suggestion concerns the separate, queued React/Vite migration and broadens its architecture decision beyond the browser UI. | Keep PostgreSQL fixes in scope. Carry full TypeScript versus retaining Python runtime components as a decision for `react-vite-web` Research; no current finding or evidence boundary changes. |

### Research Cycle Log

#### Cycle 1

* Active posture, controls, and limits: Focused, brief-based; investigate only the two accepted findings and their resolution conditions. No live Azure actions, secrets, or unrelated redesign.

##### Wave 1: Wider

* Focus and questions: Establish the Azure template deployment lifecycle for firewall-rule lists and the PostgreSQL client behavior for explicit URLs. Consider minimally different implementation boundaries for cleanup and TLS enforcement.
* Evidence: C8 shows index-named firewall child resources in `infra/postgresql.bicep`; C9 shows the deployment gate checks submitted IPv4 syntax but does not inventory server firewall rules; C10 shows the explicit URL returns unchanged while the field-based path enables full verification; C11 records that operator URLs are already expected to use `verify-full` and a trusted CA; C13 shows the workflow provisions through `azd` after its OIDC and writer gates. W6 says incremental ARM deployments retain existing resources omitted from the template, W7 confirms firewall rules control public IP access to the server, and W8 says libpq `verify-full` checks both the certificate chain and server hostname.
* Reflection: Both review defects are reproduced by current code and match their platform contracts. Further work must compare a narrowly scoped post-provision reconciliation with deployment-stack ownership, reject unsafe broad deletion, and specify URL validation and CA behavior against actual URL uses and tests.

##### Wave 2: Deeper

* Focus and questions: Trace the workflow's deployment and app configuration, inspect existing URL-based integration tests, and verify available Azure cleanup mechanisms and their constraints.
* Evidence: C14 shows PostgreSQL integration tests create a unique schema using `EARWYRM_TEST_DATABASE_URL` and pass that URL into the app as `EARWYRM_DATABASE_URL`; the fixture does not prescribe TLS settings. C15 shows the hosted Bicep configuration currently supplies the four database fields rather than an explicit URL, while the shared URL parser is used by cloud startup and web app setup. W9 documents deployment stacks as Azure's supported template lifecycle for deleting resources removed from a template; W10 says complete mode is not recommended and is supported only at the root deployment, while linked or nested templates must use incremental mode. W11 documents Azure CLI list/delete commands for individual Flexible Server firewall rules; W12 documents that deletion requires a Ready server and that rule names and public-network operations have constraints.
* Reflection: The narrowest deployment candidate is an explicit reconciliation attached to the existing approved provision path, scoped only to rules the Earwyrm template owns and verified by comparing the post-update inventory with the allowlist. Deployment stacks are viable but change resource ownership and provisioning semantics; complete mode is not a safe nested-module shortcut. For TLS, existing tests confirm a shared setting boundary, so either the secure policy must preserve test-only local PostgreSQL usage or the URL path needs a clearly isolated local-test boundary. Actual test-server configuration is unavailable and should remain an implementation-time validation item.

##### Wave 3: Contrarian

* Focus and questions: Challenge targeted firewall reconciliation with Azure-native lifecycle alternatives and unsafe broad modes; challenge strict URL TLS enforcement with libpq compatibility behavior and the test/local integration boundary.
* Evidence: W9 confirms deployment stacks can delete resources removed from their managed template, so targeted cleanup is not the only Azure-supported route. W10 rejects complete mode as a nested-template shortcut. W11 and W12 confirm list/delete operations are scoped to a named server and rule, but deletion requires a Ready server; W7 warns propagation can take up to five minutes. W8 records a compatibility quirk where `sslmode=require` may behave like `verify-ca` when a root file exists, but PostgreSQL discourages relying on it; it does not supply the hostname check of `verify-full`. C14 shows tests share the same URL setting, but the actual test target is unavailable.
* Reflection: The counter-evidence does not weaken F5: either explicit reconciliation or a deployment stack must delete omitted rules, while complete mode is unsafe and unsupported for this nested deployment. It does refine F6: do not claim `require` can never verify a certificate in every environment, but reject it as a substitute because its behavior is conditional and it does not guarantee hostname verification. A verified local-only exception preserves intended local use without allowing arbitrary remote/test URLs to bypass TLS.

##### Synthesis and Re-entry

| Material or claim | Evidence | Disposition | Rationale | User-facing effect |
|-------------------|----------|--------------|-----------|--------------------|
| Omitted indexed firewall child resources may remain after allowlist reductions. | C8, C9, W6, W7 | Accepted | ARM incremental mode retains omitted resources; the deployment gate does not reconcile the server's firewall rules. | Plan a narrowly scoped post-provision inventory and deletion gate; do not rely on Bicep omission. |
| Azure-native deletion alternatives. | W9-W12 | Accepted / rejected | A deployment stack is viable but broader; complete mode is not a safe nested-template solution; explicit rule list/delete is available. | Prefer targeted reconciliation in the existing approved deployment flow. |
| Explicit remote URLs can bypass required TLS checks. | C10-C13, C15, W8 | Accepted | Shared URL parsing returns unchecked configuration; `verify-full` supplies hostname as well as certificate verification. | Enforce strict remote URL policy and trusted CA. |
| Local PostgreSQL integration may use the same URL setting. | C14 | Accepted as a compatibility constraint | The code path is shared, but actual test URL settings are not available. | Keep any insecure exception provably local; require remote test targets to use full TLS. |
| Full TypeScript migration suggestion. | User direction 2026-11-15; parent state | Deferred | It concerns the separately queued React/Vite child, not these accepted PostgreSQL findings. | Carry the architecture boundary into `react-vite-web` Research without widening this child. |

* Another complete three-wave cycle needed: No.
* Trigger or stop basis: The three waves covered both root causes, viable platform mechanisms, the unsafe broad alternative, PostgreSQL TLS semantics, and the known local-test compatibility boundary. Remaining unknowns are user-environment/deployment validation gates; no in-scope source can establish them without accessing live resources or environment secrets.
* Readiness or revalidation effect: Ready for planning; preserve live Azure and actual test-server validation as explicit implementation/deployment gates.

### Evidence Log

* Helpers: None; evidence sources are directly accessible and the scope is bounded.

| ID | Claim or finding | Source or location | Retrieved and version | Tool | Confidence | Notes |
|----|------------------|--------------------|-----------------------|------|------------|-------|
| C8 | The template creates one firewall child resource per address and names it by list index. | infra/postgresql.bicep `firewallRules` | not applicable | Read | High | A reduced array omits former higher-index names. |
| C9 | The gate validates allowlist syntax and deployment identity but does not list or reconcile existing PostgreSQL firewall rules. | scripts/deployment_gate.py `validate_outbound_ipv4s`, `deployment_target`, `run` | not applicable | Read | High | The rule list is not part of current target inventory. |
| C10 | An explicit database URL is returned unchanged; the field-based path adds `sslmode=verify-full` and a system CA bundle. | audio_poc/persistence.py `database_url_from_environment` | not applicable | Read | High | The two configuration paths do not enforce the same TLS contract. |
| C11 | Operator guidance requires URL users to set `sslmode=verify-full` and a trusted CA. | docs/audio-poc/web-app.md `Configure hosted PostgreSQL` | not applicable | Search and read | High | Guidance is not enforced by the URL parser. |
| C12 | Storage tests verify TLS for field-built connection info and URL/field ambiguity, but do not validate URL TLS settings. | tests/test_postgres_storage.py `test_given_database_fields_when_building_connection_then_require_verified_tls`; `test_given_url_and_database_fields_when_building_connection_then_reject_ambiguity` | not applicable | Read | High | Existing regression coverage leaves the URL bypass untested. |
| C13 | The deployment workflow provisions through `azd` after OIDC and writer-exclusion gates; no post-provision firewall cleanup is configured. | .github/workflows/deploy-web.yml `Provision approved resources`; azure.yaml `preprovision` | not applicable | Read | High | A cleanup mechanism must fit this approved deployment boundary. |
| C14 | PostgreSQL integration tests use `EARWYRM_TEST_DATABASE_URL` and pass the resulting URL through the app's `EARWYRM_DATABASE_URL` configuration without setting a TLS mode in the fixture. | tests/conftest.py `postgres_url`; tests/test_web_app.py `test_given_postgres_store_when_rendering_then_use_postgres_for_both_histories` | not applicable | Read | High | The actual URL is an environment value and was not inspected; local-use assumptions remain unverified. |
| C15 | The hosted Bicep service currently uses field-based PostgreSQL settings, while cloud startup and web app creation share `database_url_from_environment`. | infra/service.bicep `app`; audio_poc/cloud_web.py `main`; audio_poc/web_app.py `create_app` | not applicable | Search and read | High | The explicit URL path remains a supported runtime configuration even though the current Bicep deployment uses fields. |
| W6 | Incremental deployments retain existing resources omitted from the template; stacks are the recommended deletion mechanism instead of complete mode. | [Azure Resource Manager deployment modes](https://learn.microsoft.com/en-us/azure/azure-resource-manager/templates/deployment-modes) | 2026-11-15; current Microsoft Learn page | Microsoft Docs fetch | High | Official source confirms RV-001's deployment behavior. |
| W7 | PostgreSQL Flexible Server public firewall rules allow or reject connections by source IP; rule changes can take up to five minutes. | [Firewall rules in Azure Database for PostgreSQL flexible server](https://learn.microsoft.com/en-us/azure/postgresql/security/security-firewall-rules) | 2026-11-15; current Microsoft Learn page | Microsoft Docs fetch | High | Resource inventory and effective network propagation are distinct checks. |
| W8 | `verify-full` validates the certificate chain and server hostname; a trusted root certificate is required for verification. | [SSL Support](https://www.postgresql.org/docs/current/libpq-ssl.html) | 2026-11-15; PostgreSQL 18 documentation, updated 2026-11-12 | Web search; direct fetch unavailable | High | A search result from the official PostgreSQL documentation was used; direct page fetch failed due proxy resolution. |
| W9 | Deployment stacks can manage an explicit resource set and delete resources when they are removed from the stack template. | [Create and deploy Azure deployment stacks in Bicep](https://learn.microsoft.com/en-us/azure/azure-resource-manager/bicep/deployment-stacks) | 2026-11-15; current Microsoft Learn page | Microsoft Docs fetch | High | This is a supported but broader ownership alternative to targeted cleanup. |
| W10 | Complete mode is not recommended for deletion and is unavailable for linked or nested templates. | [Azure Resource Manager deployment modes](https://learn.microsoft.com/en-us/azure/azure-resource-manager/templates/deployment-modes) | 2026-11-15; current Microsoft Learn page | Microsoft Docs fetch | High | Rejects complete mode as a cleanup shortcut for the nested PostgreSQL module. |
| W11 | Azure CLI supports listing and deleting individual Flexible Server firewall rules by server, resource group, and rule name. | [az postgres flexible-server firewall-rule](https://learn.microsoft.com/en-us/cli/azure/postgres/flexible-server/firewall-rule?view=azure-cli-latest) | 2026-11-15; current Azure CLI reference | Microsoft Docs fetch | High | Provides a narrow available mechanism for an OIDC-gated reconciler. |
| W12 | Firewall-rule deletion requires a Ready server; the CLI operation is explicit and scoped to one named rule. | [Delete firewall rules in Azure Database for PostgreSQL flexible server](https://learn.microsoft.com/en-us/azure/postgresql/network/how-to-networking-servers-deployed-public-access-delete-firewall-rules) | 2026-11-15; current Microsoft Learn page | Microsoft Docs fetch | High | A reconciler must stop on CLI failures and verify its post-delete inventory. |

#### Contradictions and Conflicts

W8 describes a compatibility behavior where `sslmode=require` may validate a certificate as `verify-ca` when a root certificate file exists. This does not contradict F6: the behavior is conditional and does not provide the hostname verification required by `verify-full`.

### Artifact Self-Check

* [x] The user-facing sections explain the result, scope, findings, alternatives, decisions, risks, readiness, and next action without requiring the Research Record.
* [x] Every question is answered or names the smallest missing evidence, and every material result has one canonical evidence state.
* [x] Findings keep their explanation, supporting detail, evidence state, confidence basis, and counter-evidence together.
* [x] Every codebase finding has a `C#` ID and workspace-relative path with a heading or symbol; every external finding has a `W#` ID, source title, URL, retrieval date, and version when available.
* [x] The executed cycle records Wider, Deeper, and Contrarian waves in order, reflections, dispositions, synthesis, and an evidence-based re-entry decision.
* [x] Method, posture and provenance, candidate areas, evidence root, constraints, extensions, participation, helper use, and prior-knowledge treatment are recorded with their limits.
* [x] Convergence selects and justifies recommendations for the two findings; the unrelated TypeScript scope is explicitly deferred.
* [x] Decision groups, participation mode, and provenance are recorded; agent-owned decisions have evidence-backed rationales or honest blockers.
* [x] Research disposition, Planning Readiness, blockers, continuation owner, gates, next action, and residual uncertainty are complete and evidence-backed.
* [x] Untrusted source content remained inert, no secrets were recorded, and the research-only write boundary held.
* Checked sections: Executive summary, findings, scope, decisions, alternatives, risks, readiness, method, extension registry, direction log, all three waves, evidence log, conflicts, and self-check.
* Missing or limited sections: The actual test database configuration and live Azure inventory/propagation remain unavailable and are recorded as validation gates.
