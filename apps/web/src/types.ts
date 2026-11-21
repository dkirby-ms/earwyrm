/** Non-secret settings returned by the TypeScript `/api/config` endpoint. */
export interface PublicConfig {
  readonly setup_status: 'ready' | 'setup-needed' | 'unavailable'
  readonly client_id: string | null
  readonly authority: string | null
  readonly scope_prefix: string | null
}

/** A sample or immutable custom brief; unrendered custom drafts live in the browser session. */
export interface Brief {
  readonly brief_id: string
  readonly name?: string
  readonly description?: string
  readonly offer?: string
  readonly location?: string
  readonly contact_details?: { readonly email: string; readonly phone: string }
  readonly tone?: string
  readonly approved_claims?: readonly string[]
  readonly cta?: string
  readonly source?: 'custom'
}

/** Server-owned writer outcomes; only accepted options can be selected for audio. */
export interface LyricOption {
  /** Identifies the instrumental arrangement these lyrics were fitted to, if any. */
  readonly arrangement_job_id?: string
  readonly option_id: string
  readonly brief_id: string
  readonly status: 'accepted' | 'human_review_required' | 'rejected' | 'retry_exhausted' | 'unavailable'
  readonly output: { readonly hook: string; readonly lyrics: string } | null
  readonly reasons: readonly string[]
  readonly ai_generated: true
  readonly broadcast_approval_required: true
}

/** The current permissions for the signed-in application identity. */
export interface Access {
  readonly issuer: string
  readonly subject: string
  readonly admin: boolean
  readonly paid_speech: boolean
}

/** Current access-request state for the signed-in identity. */
export type AccessRequestStatus = 'none' | 'pending' | 'approved' | 'denied'

/** A pending request shown to an enabled administrator. */
export interface AdminAccessRequest {
  readonly request_id: string
  readonly subject: string
  /** Display metadata only; older requests and tokens without email have no value. */
  readonly email: string | null
  readonly created_at: string
}

/** Administrator-only lifecycle and provider evidence for one browser jingle. */
export interface JingleDiagnostic {
  readonly diagnostic_id: string
  readonly stage: 'brief' | 'lyrics' | 'safety' | 'score' | 'backing' | 'voice' | 'mix'
  readonly status: 'running' | 'completed' | 'failed' | 'outcome_unknown'
  readonly created_at: string
  readonly updated_at: string
  readonly failure_reasons: readonly { readonly code: string; readonly explanation: string }[] | null
  readonly provider_events: readonly {
    readonly stage: string
    readonly operation: string
    readonly http_status: number | null
    readonly error_code: string | null
    readonly parameter: string | null
    readonly request_id: string | null
    readonly model_exchange?: {
      readonly request: { readonly status: 'captured' | 'too_large' | 'unreadable'; readonly text: string | null }
      readonly response: { readonly status: 'captured' | 'too_large' | 'unreadable'; readonly text: string | null }
    }
  }[]
}

/** An identity and its application-scoped permissions. */
export interface UserAccess {
  readonly issuer: string
  readonly subject: string
  readonly enabled: boolean
  readonly admin: boolean
  readonly paid_speech: boolean
}

/** Exact USD budget values; shared limits can be unconfigured, but user limits are lifetime allowances. */
export interface BudgetBalance {
  readonly limit_usd: string | null
  readonly charged_usd: string
  readonly remaining_usd: string | null
}

/** Budget totals with lyric holds and administrator-recorded verified lyric actuals separated. */
export interface TextBudgetBalance extends BudgetBalance {
  readonly lyric_reserved_usd: string
  readonly lyric_actual_usd: string
}

/** An immutable admin-recorded transition in a lyric reservation's settlement history. */
export interface LyricReservationEvent {
  readonly event_id: string
  readonly reservation_id: string
  readonly event_type: 'settled' | 'corrected' | 'reopened'
  readonly previous_status: 'pending' | 'settled'
  readonly new_status: 'pending' | 'settled'
  readonly previous_actual_usd: string | null
  readonly new_actual_usd: string | null
  readonly actor_issuer: string
  readonly actor_subject: string
  readonly evidence_reference: string | null
  readonly reason: string
  readonly created_at: string
}

/** Current lyric hold or settled actual, plus its append-only transition history. */
export interface LyricReservation {
  readonly reservation_id: string
  readonly action: 'discuss' | 'write' | 'options'
  readonly owner: string | null
  readonly reserved_usd: string
  readonly settlement_status: 'pending' | 'settled'
  readonly actual_cost_usd: string | null
  readonly evidence_reference: string | null
  readonly settled_by: { readonly issuer: string; readonly subject: string } | null
  readonly settled_at: string | null
  readonly created_at: string
  readonly events: readonly LyricReservationEvent[]
}

/** Admin-only usage separates conservative holds from administrator-recorded actuals. */
export interface BudgetOverview {
  readonly text: TextBudgetBalance
  readonly speech: BudgetBalance
  readonly actuals: { readonly speech_usd: string; readonly ai_usd: string; readonly unreconciled_speech_attempts: number }
  readonly unattributed_text_usd: string
  readonly lyric_reservations: readonly LyricReservation[]
  readonly users: readonly (TextBudgetBalance & { readonly issuer: string; readonly subject: string })[]
}

/** A component and its rights or provenance evidence. */
export interface AudioComponent {
  readonly component?: string
  readonly name?: string
  readonly component_id?: string
  readonly status: string
  readonly origin?: unknown
  readonly evidence?: unknown
  readonly commercial_use_basis?: unknown
}

/** Provider usage and reconciliation fields included in output metadata. */
export interface AzureUsage {
  readonly submitted_characters?: number
  readonly attempt_id?: string | null
  readonly rate_evidence?: unknown
  readonly billing_reconciled?: boolean
  readonly actual_allocated_cost_usd?: string | number | null
  readonly reconciliation_reference?: string | null
}

/** A submitted evaluation attached to a rendered output. */
export interface Evaluation {
  readonly brand_transcription: string
  readonly cta_transcription: string
  readonly self_rating: string
  readonly brand_match: boolean
  readonly cta_match: boolean
  readonly created_at?: string
}

/** A rendered output, including links that remain protected by the API. */
export interface Output {
  readonly output_id: string
  readonly run_id: string
  readonly brief_id: string
  readonly variant: string
  readonly duration_seconds: number
  readonly render_seconds: number
  readonly numeric_gates: unknown
  readonly components: readonly AudioComponent[]
  readonly azure_usage: AzureUsage
  readonly evaluation: Evaluation | null
  readonly status: string
  readonly audio_url: string
  readonly evidence_url: string
  readonly lyric_source?: {
    readonly option_id: string
    readonly hook: string
    readonly lyrics: string
    readonly status: 'accepted'
    readonly broadcast_approval_required: true
  } | null
  readonly composition_source?: {
    readonly job_id: string
    readonly label?: string
    readonly option_id?: string
    readonly backing_sha256: string
  } | null
}

/** A paid attempt that may require usage reconciliation. */
export interface PaidAttempt {
  readonly attempt_id: string
  readonly status: string
  readonly estimated_cost_usd: string
  readonly actual_cost_usd?: string | null
  readonly jingle_estimate?: JingleEstimate | null
  readonly jingle_ai_actual_cost_usd?: string | null
}

export interface JingleEstimate {
  readonly model_and_safety_max_usd: string
  readonly speech_max_usd: string
  readonly total_max_usd: string
}

export interface JingleHistory {
  readonly estimate: JingleEstimate | null
  readonly unavailable_reason: string | null
  readonly runs: readonly RenderRun[]
}

/** A user-owned render run and its optional paid attempt. */
export interface RenderRun {
  readonly run_id: string
  readonly mode: string
  readonly brief_ids: readonly string[]
  readonly status: string
  readonly created_at: string
  readonly outputs: readonly Output[]
  readonly attempt?: PaidAttempt | null
}

/** The per-brief and overall evaluation rollup. */
export interface StatusRollup {
  readonly status: string
  readonly briefs: readonly {
    readonly brief_id: string
    readonly status: string
    readonly outputs: readonly Output[]
  }[]
}

/** The server-computed paid-render estimate that the user must confirm. */
export interface RenderEstimate {
  readonly brief_ids: readonly string[]
  readonly estimated_cost_usd: string
  readonly input_fingerprint?: string
  readonly lyric_selections?: readonly { readonly brief_id: string; readonly option_id: string }[]
  readonly composition_selections?: readonly { readonly brief_id: string; readonly job_id: string }[]
}

/** Draft values for an output evaluation form. */
export interface EvaluationDraft {
  readonly brand_transcription: string
  readonly cta_transcription: string
  readonly self_rating: string
}

/** Draft values for application access administration. */
export interface UserAccessDraft {
  readonly issuer: string
  readonly subject: string
  readonly enabled: boolean
  readonly admin: boolean
  readonly paid_speech: boolean
}
