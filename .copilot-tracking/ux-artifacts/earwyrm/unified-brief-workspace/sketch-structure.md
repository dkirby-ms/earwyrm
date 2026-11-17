<!-- markdownlint-disable-file -->
# UX Artifact: Unified brief workspace

## Artifact Context

* Project: earwyrm
* Subject: Unified brief workspace
* Mode: sketch-structure
* Status: partial; requested capabilities captured, proposed arrangement awaits practitioner approval
* Sources: User request and choice to receive a proposal first on 2026-11-16; [web-app documentation](../../../../../docs/audio-poc/web-app.md), especially listening, evaluation storage, and optional paid Speech sections
* Boundary: Documentation-informed proposal, not a running-interface review, implementation plan, or validated usability finding

## Observed

* The supplied documentation describes separate Select briefs, Evaluation status, Rendered variants, and Recent runs views. This is an observation of the documentation, not of user behavior.
* No running UI, source implementation, participant sessions, or analytics were examined.

## Reported

* The user describes the current UX as disjointed and requests a single screen rather than one long column.
* The user requests pre-populated sample briefs, uploading or entering custom brief details, selecting one or more loaded briefs for rendering, optional vocals, and several lyric options per brief.
* The documentation reports that selection and unfinished evaluations survive view changes.
* The documentation distinguishes completed rendering from Pending evaluation; instrumental previews remain Pending and are not vocal proof.
* The documentation reports protected audio loading, playback, WAV downloads, output evaluation, recent runs, and paid usage reconciliation.
* The documentation requires explicit paid confirmation bound to selected brief IDs and an estimate. Paid requests are not automatically retried or canceled.

## Assumed

* A brief-led workspace will reduce context switching because briefs connect lyrics, outputs, and evaluations. Validate through practitioner review and subsequent task-based usability testing.
* A compact brief list, a primary work area, and complementary run history are candidate regions, not approved layout decisions.
* Separating the active brief from the batch selection will support inspecting one brief without accidentally changing the next render batch. Validate whether this distinction is understandable.
* Local Brief, Lyrics, and Variants sections within the active work area may keep detail manageable without recreating four disconnected application destinations.
* Lyrics can be explored independently of starting a render. This is a proposed interaction, not a verified API capability.

## Unresolved

* The practitioner must approve or revise the candidate region arrangement and local section approach. Exact sizing, scroll containment, and narrow-screen treatment remain undecided.
* Product and engineering must distinguish brief-content validation, lyric checks, and output evaluation. Do not invent a new automated brief-evaluation service or describe a render's Pending evaluation as a brief error.
* Engineering must verify custom-brief creation, upload formats, required fields, limits, and persistence. The supplied documentation establishes synthetic brief selection, not custom-brief support.
* Engineering must verify lyric-generation support, costs, and whether a selected lyric can be bound to a render. Existing Speech rendering must not be presented as a verified singing capability.
* Product must choose how many lyric options constitute "a few." Three is a candidate for review, not an accepted default or limit.
* Product must decide whether vocal inclusion applies to the whole selected batch or individual briefs, and whether rendering multiple lyric alternatives creates separate paid outputs. No brief-by-lyric multiplication is authorized by this proposal.
* Product must decide whether edits create brief revisions, how older outputs retain their original brief and lyric context, and whether drafts survive reload.
* No user research or access-needs coverage was supplied. Technical accessibility and runtime verification belong to the accessibility capability.

## Surface Scope

| Surface | Intended user outcome | Entry context | Source boundary |
|---------|-----------------------|---------------|-----------------|
| Unified brief workspace | Load briefs, develop lyrics, render a selected batch, and review results without leaving the workspace | Signed-in application with sample briefs or existing runs | User-requested consolidation; administration and deployment setup are outside this proposal |

## Surface Composition

All Assumed rows below are candidates for review, not decided structure. Order indicates interaction sequence rather than dimensions or breakpoints.

| Surface | Region | Order | Content purpose | Control or content element | Visible label or affordance | Applies in state | Basis and source |
|---------|--------|-------|-----------------|----------------------------|-----------------------------|------------------|------------------|
| Unified brief workspace | Banner | Before workspace tasks | Keep identity and blocking paid-usage conditions visible | Existing account context and paid reconciliation notice | Existing signed-in identity; unresolved usage message | All applicable states | Reported: documentation describes signed-in workspace and persistent paid-usage visibility |
| Unified brief workspace | Brief collection | Start | Bring samples or custom briefs into the loaded collection | Sample selection, upload, and manual-entry entry points | Use sample brief; Upload brief; Enter brief | Loading briefs | Reported: user requests all three input paths; wording proposed |
| Unified brief workspace | Brief collection | After loading | Select the batch independently of the brief being inspected | Loaded brief list, batch selection, active brief indication | Brief name, source, selected state | Briefs loaded | Reported: batch selection requested; Assumed: distinct active and selected states |
| Unified brief workspace | Brief collection | Persistent context | Keep selection close to the active brief instead of creating another page | Compact collection complementary to the main work area | Loaded briefs; selected count | Briefs loaded | Assumed: candidate composition for user-requested non-columnar consolidation |
| Unified brief workspace | Main work area | Inspect active brief | Review or enter brief details and identify missing information | Brief details and associated validation messages | Brief | Inspecting or entering details | Reported: user requests entry and evaluation; Unresolved: fields and brief-evaluation meaning |
| Unified brief workspace | Main work area | Develop active brief | Review distinct lyric options associated with this brief | Per-brief generation action and lyric alternatives | Lyrics; Generate lyric options | Active brief available | Reported: user requests several options for each brief; Unresolved: count and render binding |
| Unified brief workspace | Main work area | Review outputs | Listen, compare variants, and evaluate an output beside its context | Output variants, protected audio controls, download, evaluation | Variants; Load protected audio; Download WAV; evaluation status | Rendered output exists | Reported: user requests consolidation; documentation describes playback, comparison, and evaluation |
| Unified brief workspace | Main work area | Within active context | Avoid expanding brief details, every lyric, and every output at once | Local Brief, Lyrics, and Variants section choices | Brief; Lyrics; Variants | Active brief available | Assumed: candidate progressive disclosure; not separate application destinations |
| Unified brief workspace | Batch action region | Before submission | Make the exact batch and vocal mode clear before rendering | Selected-brief summary, vocal inclusion, render action | Selected briefs; Include vocals; Render selected briefs | Selection exists | Reported: user requests selected batch rendering and optional vocals; Unresolved: batch-level versus per-brief mode |
| Unified brief workspace | Batch action region | When vocals incur spending | Preserve the documented authorization boundary | Estimate and exact selected-brief confirmation | Estimated cost; explicit paid confirmation | Paid estimate available | Reported: optional paid Speech documentation; no submission from toggling vocals alone |
| Unified brief workspace | Complementary run history | During and after submission | Track rendering and revisit runs without replacing the collection | Compact recent-run list with render state and brief association | Recent runs; render status | Run history available | Reported: user requests run consolidation; Assumed: complementary placement rather than a full-width bottom history |
| Unified brief workspace | Output context | Alongside each output | Prevent evaluation state from masquerading as render progress | Separate render and evaluation labels | Render complete; Evaluation pending | Output exists | Reported: documentation explicitly distinguishes these statuses; exact display wording proposed |

## Interaction States

| Surface | State | Entry condition | Available controls | Information conveyed | Exit condition | Basis and source |
|---------|-------|-----------------|--------------------|----------------------|----------------|------------------|
| Unified brief workspace | No brief loaded | No loaded brief is available | Sample, upload, manual-entry paths | How to start without constructing a brief from scratch | At least one brief loads | Reported: requested input paths; Assumed: empty-state presentation |
| Unified brief workspace | Brief input needs attention | Entered or uploaded details are incomplete or invalid | Input correction within the active brief | Specific issue; no success or readiness implied | Input passes the agreed validation | Assumed: necessary candidate state for new inputs; Unresolved: validation contract |
| Unified brief workspace | Briefs ready for selection | Loaded briefs are available | Inspect a brief; select one or more for rendering | Active brief and selected batch are distinct | Selection or active context changes | Reported: requested multi-brief selection; Assumed: active-context distinction |
| Unified brief workspace | Lyric exploration | Active brief supports lyric generation | Generate and inspect lyric options | Options belong to this brief; generation is separate from rendering | Options return or generation fails | Reported: requested options; Assumed: independent generation |
| Unified brief workspace | Lyrics unavailable or failed | Generation cannot begin or completes unsuccessfully | Preserve brief details and existing options | Explicit reason rather than empty content implying success | Capability becomes available or user revises the request | Assumed: candidate failure presentation; technical behavior remains unverified |
| Unified brief workspace | Ready to render | One or more eligible briefs selected | Review batch, choose vocal mode, render | Exact submission scope | User submits or changes selection | Reported: user request; Unresolved: readiness rules |
| Unified brief workspace | Paid confirmation required | Vocal mode needs paid Speech | Review estimate and explicitly confirm | Paid scope and estimate apply only to the current selection | Valid confirmation and submission | Reported: paid Speech documentation |
| Unified brief workspace | Rendering | Submission accepted | View run state and existing results | Render progress is not evaluation progress | Run completes, fails, or usage becomes unknown | Reported: run-status and paid-attempt documentation; no invented percentage progress |
| Unified brief workspace | Results available | Outputs exist | Load protected audio, play, download, compare, evaluate | Each result's brief context and evaluation status | User inspects another output or submits evaluation | Reported: playback and evaluation documentation |
| Unified brief workspace | Paid usage unresolved | Attempt needs reconciliation, including failed or unknown usage | Existing reconciliation path and run inspection | Paid dispatch remains blocked; no automatic retry or cancellation | Actual metered cost reconciled with evidence | Reported: paid Speech documentation |

## State Transitions

| Surface | From state | User action or event | To state | Surface change or feedback | Unresolved behavior | Basis and source |
|---------|------------|----------------------|----------|----------------------------|---------------------|------------------|
| Unified brief workspace | No brief loaded | Choose a sample | Briefs ready for selection | Show sample details in the existing workspace | Initial batch selection is not decided; do not silently select every sample | Reported: user request; Assumed: in-place presentation |
| Unified brief workspace | Loading or editing input | Upload or enter custom details | Brief input needs attention or Briefs ready for selection | Show validation next to the relevant input | Format, schema, persistence, duplicate handling, and validation rules | Reported: requested custom inputs; Assumed: candidate validation feedback |
| Unified brief workspace | Briefs ready for selection | Inspect a different brief | Briefs ready for selection | Replace active detail context without changing batch selection | Unsaved-edit treatment | Assumed: candidate active-versus-selected interaction |
| Unified brief workspace | Briefs ready for selection | Select or deselect a brief | Ready to render or Briefs ready for selection | Update batch summary without moving away from active content | Mixed-validity batch policy | Reported: requested multi-selection; Assumed: candidate summary behavior |
| Unified brief workspace | Active brief available | Generate lyric options | Lyric exploration | Show generation state within this brief's Lyrics context | Count, costs, retention, and whether generation is batch-capable | Reported: requested lyric options; Assumed: local generation state |
| Unified brief workspace | Lyric exploration | Generation returns or fails | Lyric exploration or Lyrics unavailable or failed | Show returned alternatives or an explicit failure | Choosing a render lyric is not yet specified | Assumed: candidate outcomes; generation contract unverified |
| Unified brief workspace | Ready to render | Request instrumental rendering | Rendering after accepted submission | Update the run region; keep loaded brief context present | New custom-brief readiness rules | Reported: offline instrumental workflow; Assumed: consolidated region update |
| Unified brief workspace | Ready to render | Include vocals | Paid confirmation required when paid mode is available | Reveal applicable estimate and confirmation; do not start a render | Show explicit unavailability when entitlement or configuration is missing | Reported: paid Speech prerequisites; Assumed: in-place presentation |
| Unified brief workspace | Paid confirmation required | Change selected brief IDs or estimate | Paid confirmation required | Previous confirmation no longer authorizes dispatch | Custom brief revisions and lyric changes need an agreed confirmation contract | Reported: documented binding to exact brief IDs and estimate |
| Unified brief workspace | Rendering | Run completes | Results available | Make variants discoverable in the same workspace | Automatic section switching must not discard an edit or evaluation | Reported: completed outputs currently open in Rendered variants; Assumed: no page navigation |
| Unified brief workspace | Results available | Open a recent run | Results available | Show that run's outputs and their brief context | Proposal: preserve current drafts and batch selection; practitioner approval needed | Reported: recent-run requirement; Assumed: non-destructive context switching |
| Unified brief workspace | Results available | Submit an output evaluation | Results available | Update evaluation state, not render state | Existing evaluation fields and eligibility require source verification before implementation | Reported: documented evaluation workflow |
| Unified brief workspace | Rendering | Paid attempt disconnects, fails, or has unknown usage | Paid usage unresolved | Keep reconciliation notice visible; recover run status on reload | No automatic retry or cancel; draft recovery remains undecided | Reported: optional paid Speech documentation |

## Existing Design Intent References

| Surface | Existing record or intent identifier | Relationship to this structure |
|---------|--------------------------------------|--------------------------------|
| Unified brief workspace | None supplied | No intent identifier or build-checkable record is invented |

## Review Disposition

* Recommended direction: approve the brief-led composition before specifying visual dimensions or implementation.
* Keep long content scoped to the active task rather than mounting every brief, lyric alternative, result, evaluation form, and run in one expanding document.
* Avoid a second top-level Evaluation status destination. Retain evaluation beside its output, and keep run progress in the run region.
* Do not interpret candidate structure as evidence that custom briefs or lyric-to-audio binding already work.
* This asset is partial because layout decisions and new capability contracts are not yet approved. The next explicit action is practitioner review of the proposed composition and unresolved product decisions.
* No production code, existing documentation, deployment configuration, external destination, or paid service was changed.

## Human Review

> [!CAUTION]
> **Disclaimer:** This agent is an assistive coaching tool only. It does not conduct user research, observe stakeholders, or speak for the people whose problems you are designing for, and it does not replace primary research, direct stakeholder contact, design review, or product and strategy decision authority. Personas, problem statements, journey maps, empathy maps, concept tests, and other Design Thinking artifacts produced with this tool are scaffolding for your own research and synthesis — not substitutes for real stakeholder voice or observed behavior. Validate all AI-generated assumptions, personas, themes, and insights against actual stakeholders before treating any Design Thinking artifact as a basis for product, design, or strategy commitments. Outputs from this tool do not constitute validated research findings or design approval.

- [ ] Reviewed and validated by a qualified human reviewer
