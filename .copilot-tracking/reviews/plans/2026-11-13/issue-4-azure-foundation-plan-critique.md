<!-- markdownlint-disable-file -->
# RPI Plan Critique: Azure foundation

## Metadata

* Task ID: issue-4-azure-foundation
* Critique date: 2026-11-13
* Plan: .copilot-tracking/plans/2026-11-13/issue-4-azure-foundation-plan.md
* Critique execution: Complete
* Critique depth: standard
* Depth provenance: first-task default
* Critique type: initial

## Inputs and Criterion Boundary

Issue 4, the plan, research C1-C6/W1-W7, explicit user audio-proof confirmation, and local tooling evidence. No new research or source implementation belongs to this assessment. The full supplied boundary fits direct assessment; no subagents are used under the host's direct-work rule.

## Lens Assessments

| Lens | Scope | Reasoning effort and source | Status | Candidates |
|---|---|---|---|---|
| Coverage | FR-001 through FR-005, all task requirements | direct | Complete | 0 adopted; live deployment explicitly remains incomplete rather than being omitted |
| Evidence | Research and architectural choices | direct | Complete | 0 adopted; user attestation is correctly bounded |
| Executability | Ordering, deployment and validation | direct | Complete | 1 adopted: bootstrap image must be compatible with probes and launch settings |
| Risk | Billing, credentials, data loss and claims | direct | Complete | 0 adopted; consent, no queue acknowledgement and no independent rights claims are explicit |

## Coverage Assessment

FR-001/FR-002 map to P01; FR-003/FR-004 map to P02; FR-005 and all local/live validation evidence map to P03. The foundation boundary is consistent with issue 4. No requirement coverage finding.

## Verdict

* Verdict: Revise.
* Rationale: PC-001 is a bounded planner-owned correction. No Critical or High findings. One Medium.

## Findings

### PC-001 [Medium]: Make bootstrap provisioning independently runnable

* Related IDs: P02-T01, FR-003, NFR-003.
* Evidence: plan P02-T01 requires a placeholder image during provision and replacement during deployment; W5 separates these stages.
* Concern: the bootstrap image must start with the configured container command and probe port before the application image exists.
* Impact: mismatched commands or readiness probes can prevent azd provision from reaching deploy.
* Smallest useful change: specify a compatible bootstrap image/port and TCP probes, with no application-specific command override in infrastructure.
* Action owner: planning parent.
* Exact resolving evidence: plan requires bootstrap-compatible probes and command configuration; Bicep/template verification checks them.
* Decision route: direct planner correction.

## Strengths and Residual Risk

The plan preserves local behavior, separates scaffold capability from generation, and retains billing consent and live deployment evidence as distinct gates. Preview MCP management and subscription-specific model access remain explicit operator risks.

## Questions or Blocking Evidence Gaps

None preventing local implementation after PC-001 is addressed. Cloud acceptance remains unverified.

## Limitations

Live Azure access and azd up are not established by this plan critique.

## Recommended Next Action

Planning parent addresses PC-001 directly, then continues. No user response is required for the correction. This is the only critique; no repeat assessment is requested.
