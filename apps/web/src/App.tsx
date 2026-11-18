import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { IPublicClientApplication } from '@azure/msal-browser'
import { apiBlob, apiJson } from './api'
import { initializeAuth } from './auth'
import BriefEditor from './BriefEditor'
import type {
  Access,
  Brief,
  EvaluationDraft,
  LyricOption,
  Output,
  PaidAttempt,
  PublicConfig,
  RenderEstimate,
  RenderRun,
  StatusRollup,
  UserAccess,
  UserAccessDraft,
} from './types'

const apiScopes = {
  briefs: 'briefs.read',
  reads: 'renders.read',
  render: 'renders.write',
  evaluate: 'evaluations.write',
  output: 'outputs.read',
} as const

type WorkspaceView = 'workspace-view' | 'admin-view'
type BriefSection = 'brief' | 'lyrics' | 'variants'

interface Identity {
  readonly issuer: string
  readonly subject: string
}

interface RenderOptions {
  readonly instrumental_available: boolean
  readonly speech_status: 'available' | 'busy' | 'disabled' | 'unavailable'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function evidenceValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not recorded'
  if (Array.isArray(value)) return value.map(evidenceValue).join('; ')
  if (isRecord(value)) {
    return Object.entries(value)
      .map(([key, item]) => `${key}: ${evidenceValue(item)}`)
      .join('; ')
  }
  return String(value)
}

function formatSeconds(value: number): string {
  return `${Number(value).toFixed(2)} seconds`
}

function renderOptionsMessage(
  options: RenderOptions | null,
  unresolvedCount: number,
  paidStatusUncertain: boolean,
): string {
  if (paidStatusUncertain) {
    return 'The last paid-render result could not be confirmed. Paid rendering is paused until run status is recovered.'
  }
  if (options?.speech_status === 'available' && unresolvedCount === 0) {
    return 'Azure voice is server-enabled for this account. A fresh estimate and explicit confirmation are still required for every paid run.'
  }
  if (options?.speech_status === 'busy') {
    return 'Azure voice is blocked while any paid attempt awaits metered-usage reconciliation.'
  }
  if (unresolvedCount > 0) {
    return 'Azure voice is blocked while a previous paid attempt awaits metered-usage reconciliation.'
  }
  if (options?.speech_status === 'disabled') {
    return 'Azure voice is disabled on the server. Offline instrumental previews remain available.'
  }
  if (options?.speech_status === 'unavailable') {
    return 'Azure voice is unavailable because server-side spending prerequisites are incomplete.'
  }
  return 'Render options are loading.'
}

function attemptNeedsReconciliation(attempt: PaidAttempt | undefined): boolean {
  return Boolean(attempt && attempt.status !== 'reconciled')
}

function customPayload(brief: Brief) {
  const { brief_id, name, offer, location, contact_details, tone, approved_claims, cta } = brief
  return { brief: { brief_id, name, offer, location, contact_details, tone, approved_claims }, cta }
}

function isCustomBrief(value: unknown): value is Brief {
  return isRecord(value) && value.source === 'custom' &&
    typeof value.brief_id === 'string' && /^custom-[a-f0-9]{32}$/.test(value.brief_id) &&
    ['name', 'offer', 'location', 'tone', 'cta'].every(key => typeof value[key] === 'string') &&
    isRecord(value.contact_details) && typeof value.contact_details.email === 'string' &&
    typeof value.contact_details.phone === 'string' &&
    Array.isArray(value.approved_claims) && value.approved_claims.every(item => typeof item === 'string')
}

function briefSessionKey(value: Identity): string {
  return `earwyrm:briefs:${JSON.stringify([value.issuer, value.subject])}`
}

function readBriefFile(file: File): Promise<unknown> {
  if (file.size > 24_000) return Promise.reject(new Error('Brief JSON must be no larger than 24 KB.'))
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('The brief file could not be read.'))
    reader.onload = () => {
      try { resolve(JSON.parse(String(reader.result)) as unknown) }
      catch (error) {
        if (error instanceof SyntaxError) reject(new Error('The uploaded brief is not valid JSON.'))
        else reject(error)
      }
    }
    reader.readAsText(file)
  })
}

function App() {
  const [config, setConfig] = useState<PublicConfig | null>(null)
  const [client, setClient] = useState<IPublicClientApplication | null>(null)
  const [accountName, setAccountName] = useState('')
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [access, setAccess] = useState<Access | null>(null)
  const [briefs, setBriefs] = useState<readonly Brief[]>([])
  const [options, setOptions] = useState<RenderOptions | null>(null)
  const [runs, setRuns] = useState<readonly RenderRun[]>([])
  const [outputs, setOutputs] = useState<readonly Output[]>([])
  const [rollup, setRollup] = useState<StatusRollup | null>(null)
  const [adminUsers, setAdminUsers] = useState<readonly UserAccess[]>([])
  const [selectedBriefIds, setSelectedBriefIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  )
  const [evaluationDrafts, setEvaluationDrafts] = useState<
    Readonly<Record<string, EvaluationDraft>>
  >({})
  const [userDraft, setUserDraft] = useState<UserAccessDraft>({
    issuer: '',
    subject: '',
    enabled: false,
    admin: false,
    paid_speech: false,
  })
  const [view, setView] = useState<WorkspaceView>('workspace-view')
  const [section, setSection] = useState<BriefSection>('lyrics')
  const [activeBriefId, setActiveBriefId] = useState('')
  const [activeRunId, setActiveRunId] = useState('')
  const [activeOutputId, setActiveOutputId] = useState('')
  const [editingBrief, setEditingBrief] = useState(false)
  const [includeVocals, setIncludeVocals] = useState(false)
  const [lyricAvailable, setLyricAvailable] = useState(false)
  const [lyricConsent, setLyricConsent] = useState(false)
  const [lyricOptions, setLyricOptions] = useState<Readonly<Record<string, readonly LyricOption[]>>>({})
  const [selectedLyricIds, setSelectedLyricIds] = useState<Readonly<Record<string, string>>>({})
  const [estimate, setEstimate] = useState<RenderEstimate | null>(null)
  const [evidence, setEvidence] = useState<Readonly<Record<string, string>>>({})
  const [audioRevision, setAudioRevision] = useState(0)
  const [booting, setBooting] = useState(true)
  const [workspaceLoading, setWorkspaceLoading] = useState(false)
  const [workspaceReady, setWorkspaceReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [paidStatusUncertain, setPaidStatusUncertain] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const bootStarted = useRef(false)
  const busyRef = useRef(false)
  const estimateDialog = useRef<HTMLDialogElement>(null)
  const adminHeading = useRef<HTMLHeadingElement>(null)
  const comparisonHeading = useRef<HTMLHeadingElement>(null)
  const evaluationHeading = useRef<HTMLHeadingElement>(null)
  const audioElements = useRef(new Map<string, HTMLAudioElement>())
  const audioUrls = useRef(new Map<string, { url: string; timer: number }>())

  async function loadWorkspaceData(
    authClient: IPublicClientApplication,
    publicConfig: PublicConfig,
  ): Promise<void> {
    setWorkspaceReady(false)
    setWorkspaceLoading(true)
    try {
      const currentIdentity = await apiJson<Identity>(
        authClient,
        publicConfig,
        '/api/identity',
        apiScopes.briefs,
      )
      setIdentity(currentIdentity)

      const currentAccess = await apiJson<Access>(
        authClient,
        publicConfig,
        '/api/access',
        apiScopes.briefs,
      )
      setAccess(currentAccess)
      setUserDraft((current) => ({ ...current, issuer: currentIdentity.issuer }))

      const currentBriefs = await apiJson<Brief[]>(
        authClient,
        publicConfig,
        '/api/briefs',
        apiScopes.briefs,
      )
      const currentOptions = await apiJson<RenderOptions>(
        authClient,
        publicConfig,
        '/api/render-options',
        apiScopes.reads,
      )
      const lyricAvailability = await apiJson<{ available: boolean; options?: LyricOption[] }>(
        authClient, publicConfig, '/api/lyrics/options', apiScopes.reads,
      )
      const runResponse = await apiJson<{ runs: RenderRun[] }>(
        authClient,
        publicConfig,
        '/api/renders',
        apiScopes.reads,
      )
      const outputResponse = await apiJson<{ outputs: Output[] }>(
        authClient,
        publicConfig,
        '/api/outputs',
        apiScopes.reads,
      )
      const currentRollup = await apiJson<StatusRollup>(
        authClient,
        publicConfig,
        '/api/poc/status',
        apiScopes.reads,
      )

      let sessionBriefs: Brief[] = []
      try {
        const saved = window.sessionStorage.getItem(briefSessionKey(currentIdentity))
        if (saved) {
          const parsed: unknown = JSON.parse(saved)
          if (!Array.isArray(parsed) || !parsed.every(isCustomBrief)) {
            throw new SyntaxError('Stored brief data has an invalid shape.')
          }
          sessionBriefs = parsed
        }
      } catch (error) {
        if (!(error instanceof SyntaxError) && !(error instanceof DOMException)) throw error
        setErrorMessage('Session briefs could not be restored. Server-saved briefs are available; upload the draft again.')
      }
      const loaded = [...currentBriefs, ...sessionBriefs.filter(brief => !currentBriefs.some(item => item.brief_id === brief.brief_id))]
      setBriefs(loaded)
      setActiveBriefId(current => loaded.some(brief => brief.brief_id === current) ? current : loaded[0]?.brief_id ?? '')
      setLyricAvailable(lyricAvailability.available)
      if (lyricAvailability.options) {
        const grouped: Record<string, LyricOption[]> = {}
        for (const option of lyricAvailability.options) (grouped[option.brief_id] ??= []).push(option)
        setLyricOptions(grouped)
      }
      setOptions(currentOptions)
      setRuns(runResponse.runs)
      setOutputs(outputResponse.outputs)
      setRollup(currentRollup)
      setPaidStatusUncertain(false)
      setWorkspaceReady(true)
    } finally {
      setWorkspaceLoading(false)
    }
  }

  useEffect(() => {
    if (bootStarted.current) return
    bootStarted.current = true

    async function initializeApplication(): Promise<void> {
      try {
        const response = await fetch('/api/config', {
          cache: 'no-store',
          credentials: 'same-origin',
        })
        if (!response.ok) {
          throw new Error(`Configuration request failed (${response.status}).`)
        }

        const publicConfig = (await response.json()) as PublicConfig
        setConfig(publicConfig)
        if (publicConfig.setup_status !== 'ready') return

        const auth = await initializeAuth(publicConfig)
        setClient(auth.client)
        if (!auth.account) return

        setAccountName(auth.account.username || 'Signed-in account')
        await loadWorkspaceData(auth.client, publicConfig)
        setAnnouncement('Signed-in workspace loaded.')
      } catch (error) {
        setErrorMessage(errorText(error, 'The application could not start.'))
      } finally {
        setBooting(false)
      }
    }

    void initializeApplication()
  }, [])

  useEffect(() => {
    const releaseAllAudio = (): void => {
      for (const [outputId, item] of audioUrls.current) {
        window.clearTimeout(item.timer)
        URL.revokeObjectURL(item.url)
        audioUrls.current.delete(outputId)
      }
    }

    window.addEventListener('pagehide', releaseAllAudio)
    return () => {
      window.removeEventListener('pagehide', releaseAllAudio)
      releaseAllAudio()
    }
  }, [])

  useEffect(() => {
    if (estimate && estimateDialog.current && !estimateDialog.current.open) {
      estimateDialog.current.showModal()
    }
  }, [estimate])

  const unresolvedCount = runs.filter((run) =>
    attemptNeedsReconciliation(run.attempt),
  ).length
  const selectedBriefs = briefs.filter((brief) => selectedBriefIds.has(brief.brief_id))
  const activeBrief = briefs.find(brief => brief.brief_id === activeBriefId)
  const selectedLyric = lyricOptions[activeBriefId]?.find(option =>
    option.option_id === selectedLyricIds[activeBriefId] && option.status === 'accepted' && option.output)
  const activeStatus = rollup?.briefs.find(brief => brief.brief_id === activeBriefId)?.status ?? 'Pending'
  const visibleOutputs = outputs.filter(output => output.brief_id === activeBriefId && (!activeRunId || output.run_id === activeRunId))
  const inspectedOutput = visibleOutputs.find(output => output.output_id === activeOutputId) ?? visibleOutputs.at(-1)
  const batchTooLarge = selectedBriefs.length > 3
  const paidAvailable =
    options?.speech_status === 'available' &&
    unresolvedCount === 0 &&
    !paidStatusUncertain

  async function runAction(label: string, action: () => Promise<void>): Promise<void> {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setErrorMessage('')
    setAnnouncement(`${label}…`)
    try {
      await action()
    } catch (error) {
      setErrorMessage(errorText(error, 'The request failed.'))
      setAnnouncement(`${label} failed.`)
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  async function signIn(): Promise<void> {
    if (!client || !config || busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setErrorMessage('')
    try {
      const result = await client.loginPopup({
        scopes: [`${config.scope_prefix}/${apiScopes.briefs}`],
      })
      client.setActiveAccount(result.account)
      setAccountName(result.account.username || 'Signed-in account')
      await loadWorkspaceData(client, config)
      setAnnouncement('Signed in. Briefs and run status are ready.')
    } catch (error) {
      setErrorMessage(errorText(error, 'Sign-in failed.'))
      setAnnouncement('Sign-in failed.')
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  async function signOut(): Promise<void> {
    if (!client || busyRef.current) return
    const account = client.getActiveAccount()
    if (!account) return

    busyRef.current = true
    setBusy(true)
    setErrorMessage('')
    try {
      await client.logoutPopup({
        account,
        postLogoutRedirectUri: `${window.location.origin}/auth-callback.html`,
      })
      if (identity) {
        try { window.sessionStorage.removeItem(briefSessionKey(identity)) }
        catch (error) {
          if (!(error instanceof DOMException)) throw error
          setErrorMessage('Signed out, but session drafts could not be removed. Close this browser tab to discard its session data.')
        }
      }
      for (const outputId of audioUrls.current.keys()) releaseAudioUrl(outputId)
      client.setActiveAccount(null)
      setAccountName('')
      setIdentity(null)
      setAccess(null)
      setBriefs([])
      setOptions(null)
      setRuns([])
      setOutputs([])
      setRollup(null)
      setAdminUsers([])
      setSelectedBriefIds(new Set())
      setEvaluationDrafts({})
      setEvidence({})
      setUserDraft({
        issuer: '',
        subject: '',
        enabled: false,
        admin: false,
        paid_speech: false,
      })
      setWorkspaceReady(false)
      setPaidStatusUncertain(false)
      setView('workspace-view')
      setActiveBriefId('')
      setActiveRunId('')
      setActiveOutputId('')
      setSection('lyrics')
      setEditingBrief(false)
      setIncludeVocals(false)
      setLyricAvailable(false)
      setLyricConsent(false)
      setLyricOptions({})
      setSelectedLyricIds({})
      setAnnouncement('Signed out.')
    } catch (error) {
      setErrorMessage(errorText(error, 'Sign-out failed.'))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  async function loadAdminUsers(): Promise<void> {
    if (!client || !config) return
    const result = await apiJson<{ users: UserAccess[] }>(
      client,
      config,
      '/api/admin/users',
      apiScopes.reads,
    )
    setAdminUsers(result.users)
  }

  function handleViewChange(nextView: WorkspaceView): void {
    setView(nextView)
    if (nextView !== 'admin-view' || !access?.admin) return

    window.setTimeout(() => adminHeading.current?.focus(), 0)
    void runAction('Loading application users', async () => {
      await loadAdminUsers()
      setAnnouncement('Application users loaded.')
    })
  }

  function updateSelectedBrief(briefId: string, selected: boolean): void {
    setEstimate(null)
    setSelectedBriefIds((current) => {
      const next = new Set(current)
      if (selected) next.add(briefId)
      else next.delete(briefId)
      return next
    })
  }

  function inspectBrief(briefId: string): void {
    setActiveBriefId(briefId)
    setActiveOutputId('')
    setActiveRunId('')
    setEditingBrief(false)
    setLyricConsent(false)
    setEstimate(null)
    setSection('lyrics')
    for (const audio of audioElements.current.values()) audio.pause()
  }

  async function addBriefDetails(details: unknown): Promise<void> {
    if (!client || !config || !identity) return
    const added = await apiJson<Brief>(client, config, '/api/briefs/validate', apiScopes.render, { method: 'POST', body: details })
    const loaded = [...briefs.filter(brief => brief.brief_id !== added.brief_id), added]
    setBriefs(loaded)
    inspectBrief(added.brief_id)
    setSection('lyrics')
    try {
      window.sessionStorage.setItem(briefSessionKey(identity), JSON.stringify(loaded.filter(brief => brief.source === 'custom')))
    } catch (error) {
      if (!(error instanceof DOMException)) throw error
      throw new Error('Brief loaded, but this browser could not save the session draft. Render it now or keep your JSON to upload again.')
    }
    setAnnouncement('Brief loaded. Generate lyrics or listen to an instrumental preview.')
  }

  async function generateLyrics(): Promise<void> {
    if (!client || !config || !activeBrief || !lyricConsent) return
    const brief = activeBrief
    await runAction('Generating three screened lyric options', async () => {
      const result = await apiJson<{ brief_id: string; options: LyricOption[] }>(client, config, '/api/lyrics/options', apiScopes.render, {
        method: 'POST',
        body: {
          brief_ids: [brief.brief_id],
          custom_briefs: brief.source === 'custom' ? [customPayload(brief)] : [],
          confirm_paid_generation: true,
        },
      })
      setLyricOptions(current => ({ ...current, [brief.brief_id]: [...(current[brief.brief_id] ?? []), ...result.options] }))
      setLyricConsent(false)
      setAnnouncement('Lyric generation finished. Review each option’s status and any required human review.')
    })
  }

  /** Reveal completed work only when it belongs to the active brief and will not replace a draft. */
  function inspectCompletedRun(runId: string, briefIds: readonly string[]): void {
    if (editingBrief || (inspectedOutput && evaluationDrafts[inspectedOutput.output_id])) {
      if (inspectedOutput) setActiveOutputId(inspectedOutput.output_id)
      return
    }
    if (!briefIds.includes(activeBriefId)) return
    setActiveRunId(runId)
    setActiveOutputId('')
    setSection('variants')
    window.setTimeout(() => comparisonHeading.current?.focus(), 0)
  }

  async function renderOffline(renderBriefs: readonly Brief[] = selectedBriefs): Promise<void> {
    if (!client || !config || renderBriefs.length === 0) return
    const briefIds = renderBriefs.map((brief) => brief.brief_id)
    await runAction('Rendering instrumental preview', async () => {
      const result = await apiJson<{ run_id: string }>(
        client,
        config,
        '/api/renders',
        apiScopes.render,
        { method: 'POST', body: {
          brief_ids: briefIds, mode: 'instrumental',
          custom_briefs: renderBriefs.filter(brief => brief.source === 'custom').map(customPayload),
        } },
      )
      await loadWorkspaceData(client, config)
      inspectCompletedRun(result.run_id, briefIds)
      setAnnouncement(
        'Instrumental preview completed. Select Load protected audio, then press Play. Pending is evaluation status, not render progress.',
      )
    })
  }

  async function estimatePaidRender(renderBriefs: readonly Brief[] = selectedBriefs, lyric?: LyricOption): Promise<void> {
    if (!client || !config || renderBriefs.length === 0 || !paidAvailable) return
    const briefIds = renderBriefs.map((brief) => brief.brief_id)
    await runAction('Calculating Azure voice estimate', async () => {
      const result = await apiJson<RenderEstimate>(
        client,
        config,
        '/api/renders/estimate',
        apiScopes.render,
        { method: 'POST', body: {
          brief_ids: briefIds,
          custom_briefs: renderBriefs.filter(brief => brief.source === 'custom').map(customPayload),
          ...(lyric ? { lyric_selections: [{ brief_id: lyric.brief_id, option_id: lyric.option_id }] } : {}),
        } },
      )
      setEstimate(result)
    })
  }

  async function startPaidRender(confirmedEstimate: RenderEstimate): Promise<void> {
    if (!client || !config || unresolvedCount > 0) return
    await runAction('Starting Azure voice render', async () => {
      setPaidStatusUncertain(true)
      try {
        const result = await apiJson<{ run_id: string }>(
          client,
          config,
          '/api/renders',
          apiScopes.render,
          {
            method: 'POST',
            body: {
              brief_ids: confirmedEstimate.brief_ids,
              custom_briefs: briefs.filter(brief => confirmedEstimate.brief_ids.includes(brief.brief_id) && brief.source === 'custom').map(customPayload),
              mode: 'azure',
              ...(confirmedEstimate.lyric_selections ? { lyric_selections: confirmedEstimate.lyric_selections } : {}),
              confirmation: {
                brief_ids: confirmedEstimate.brief_ids,
                estimated_cost_usd: confirmedEstimate.estimated_cost_usd,
                input_fingerprint: confirmedEstimate.input_fingerprint,
              },
            },
          },
        )
        await loadWorkspaceData(client, config)
        inspectCompletedRun(result.run_id, confirmedEstimate.brief_ids)
        setAnnouncement(
          'Azure voice render completed. Reconcile actual metered usage before another paid attempt.',
        )
      } catch (error) {
        try {
          await loadWorkspaceData(client, config)
        } catch {
          setPaidStatusUncertain(true)
          throw new Error(
            'The paid render outcome is unknown. Paid rendering is paused until run status is recovered; reload before any further attempt.',
          )
        }
        throw error
      }
    })
  }

  function handleEstimateDialogClose(): void {
    const result = estimateDialog.current?.returnValue
    const confirmedEstimate = estimate
    setEstimate(null)
    if (result === 'confirm' && confirmedEstimate) {
      void startPaidRender(confirmedEstimate)
    } else {
      setAnnouncement('Azure voice render was not started.')
    }
  }

  async function saveUserAccess(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!client || !config) return
    const submittedUser = { ...userDraft }
    await runAction('Saving user access', async () => {
      await apiJson<{ status: string }>(
        client,
        config,
        '/api/admin/users',
        apiScopes.render,
        { method: 'PUT', body: submittedUser },
      )
      if (
        identity &&
        submittedUser.issuer === identity.issuer &&
        submittedUser.subject === identity.subject &&
        (!submittedUser.enabled || !submittedUser.admin)
      ) {
        setAdminUsers([])
        if (submittedUser.enabled) {
          setAccess({
            issuer: identity.issuer,
            subject: identity.subject,
            admin: false,
            paid_speech: submittedUser.paid_speech,
          })
          setWorkspaceReady(true)
        } else {
          setAccess(null)
          setWorkspaceReady(false)
        }
        setView('workspace-view')
        setAnnouncement('Access saved. Your administrator access has been removed.')
        return
      }
      await loadAdminUsers()
      setAnnouncement('User access saved.')
    })
  }

  function updateEvaluationDraft(
    outputId: string,
    field: keyof EvaluationDraft,
    value: string,
  ): void {
    setEvaluationDrafts((current) => ({
      ...current,
      [outputId]: {
        brand_transcription: '',
        cta_transcription: '',
        self_rating: '',
        ...current[outputId],
        [field]: value,
      },
    }))
  }

  async function submitEvaluation(
    event: FormEvent<HTMLFormElement>,
    output: Output,
  ): Promise<void> {
    event.preventDefault()
    if (!client || !config) return
    const draft = evaluationDrafts[output.output_id] ?? {
      brand_transcription: '',
      cta_transcription: '',
      self_rating: '',
    }
    await runAction('Submitting evaluation', async () => {
      await apiJson<unknown>(
        client,
        config,
        `/api/outputs/${encodeURIComponent(output.output_id)}/evaluation`,
        apiScopes.evaluate,
        { method: 'POST', body: draft },
      )
      await loadWorkspaceData(client, config)
      setAnnouncement('Evaluation saved. Match results and status have been updated.')
    })
  }

  async function reconcileAttempt(
    event: FormEvent<HTMLFormElement>,
    attempt: PaidAttempt,
  ): Promise<void> {
    event.preventDefault()
    if (!client || !config) return
    const formData = new FormData(event.currentTarget)
    const body = {
      actual_cost_usd: String(formData.get('actual_cost_usd') ?? ''),
      evidence_reference: String(formData.get('evidence_reference') ?? ''),
    }
    await runAction('Recording metered usage', async () => {
      await apiJson<{ status: string }>(
        client,
        config,
        `/api/attempts/${encodeURIComponent(attempt.attempt_id)}/reconcile`,
        apiScopes.render,
        { method: 'POST', body },
      )
      await loadWorkspaceData(client, config)
      setAnnouncement('Metered usage was reconciled. The paid-render gate has been refreshed.')
    })
  }

  function storeAudioUrl(outputId: string, blob: Blob): string {
    releaseAudioUrl(outputId)
    const url = URL.createObjectURL(blob)
    const timer = window.setTimeout(() => releaseAudioUrl(outputId), 120_000)
    audioUrls.current.set(outputId, { url, timer })
    setAudioRevision((revision) => revision + 1)
    return url
  }

  function releaseAudioUrl(outputId: string): void {
    const item = audioUrls.current.get(outputId)
    if (!item) return
    window.clearTimeout(item.timer)
    URL.revokeObjectURL(item.url)
    audioUrls.current.delete(outputId)
    setAudioRevision((revision) => revision + 1)
  }

  function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.hidden = true
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  async function loadEvidence(output: Output): Promise<void> {
    if (!client || !config) return
    await runAction('Loading protected evidence', async () => {
      const result = await apiJson<unknown>(
        client,
        config,
        output.evidence_url,
        apiScopes.output,
      )
      setEvidence((current) => ({
        ...current,
        [output.output_id]: JSON.stringify(result, null, 2),
      }))
      setAnnouncement('Protected evidence loaded.')
    })
  }

  async function downloadEvidence(output: Output): Promise<void> {
    if (!client || !config) return
    await runAction('Downloading protected evidence', async () => {
      const result = await apiJson<unknown>(
        client,
        config,
        output.evidence_url,
        apiScopes.output,
      )
      downloadBlob(
        new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }),
        `${output.output_id}-evidence.json`,
      )
      setAnnouncement('Evidence download started.')
    })
  }

  async function loadAudio(output: Output): Promise<void> {
    if (!client || !config) return
    await runAction('Loading protected audio', async () => {
      const blob = await apiBlob(client, config, output.audio_url, apiScopes.output)
      storeAudioUrl(output.output_id, blob)
      setAnnouncement('Audio is ready. Use the audio controls to play it.')
    })
  }

  async function listenToOutput(output: Output): Promise<void> {
    if (!client || !config) return
    await runAction('Loading audio version', async () => {
      for (const audio of audioElements.current.values()) audio.pause()
      const blob = await apiBlob(client, config, output.audio_url, apiScopes.output)
      const url = storeAudioUrl(output.output_id, blob)
      const audio = audioElements.current.get(output.output_id)
      if (!audio) throw new Error('Audio controls are unavailable. Open Listen & review and try again.')
      audio.src = url
      await audio.play()
      setActiveOutputId(output.output_id)
      setAnnouncement('Playing audio. This is an AI-generated demo, not broadcast-approved.')
    })
  }

  async function downloadAudio(output: Output): Promise<void> {
    if (!client || !config) return
    await runAction('Downloading protected audio', async () => {
      const blob = await apiBlob(client, config, output.audio_url, apiScopes.output)
      downloadBlob(blob, `${output.output_id}.wav`)
      setAnnouncement('Audio download started.')
    })
  }

  const ready = config?.setup_status === 'ready'
  const isSignedIn = Boolean(client && accountName)

  return (
    <>
      <a className="skip-link" href="#main">Skip to main content</a>
      <header className="site-header">
        <a className="wordmark" href="#main" aria-label="Earwyrm home">earwyrm<span>Jingle workspace</span></a>
        {isSignedIn && (
          <div className="session-panel">
            <nav className="workspace-nav" aria-label="Workspace sections">
              <button className="workspace-nav-button" type="button" aria-pressed={view === 'workspace-view'} disabled={busy} onClick={() => handleViewChange('workspace-view')}>Workspace</button>
              {access?.admin && <button className="workspace-nav-button" type="button" aria-pressed={view === 'admin-view'} disabled={busy} onClick={() => handleViewChange('admin-view')}>Manage access</button>}
            </nav>
            <span>{accountName}</span>
            <button
              className="button button-secondary"
              type="button"
              disabled={busy}
              onClick={() => void signOut()}
            >
              Sign out
            </button>
          </div>
        )}
      </header>

      <main id="main" tabIndex={-1} aria-busy={busy || booting || workspaceLoading}>
          <p className="visually-hidden" aria-live="polite" aria-atomic="true">
            {announcement}
          </p>
          {(booting || workspaceLoading) && <p className="loading-message" role="status">Loading your workspace…</p>}
          {busy && <p className="working-message" role="status">{announcement}</p>}
          {errorMessage && <p className="alert" role="alert">{errorMessage}</p>}

          {config && config.setup_status !== 'ready' && (
            <section className="panel" aria-labelledby="setup-heading">
              <h2 id="setup-heading">Sign-in setup required</h2>
              <p>
                {config.setup_status === 'setup-needed'
                  ? 'Configure the existing Entra External ID tenant values on the API, then reload this page.'
                  : 'The API could not validate the External ID configuration. Check the server setup and reload this page.'}
              </p>
              <p className="muted">This page does not create or change tenant registrations.</p>
            </section>
          )}

          {ready && !isSignedIn && !booting && (
            <section className="panel sign-in-panel" aria-labelledby="sign-in-heading">
              <h2 id="sign-in-heading">A brief. A hook. Your next jingle.</h2>
              <p>
                Create audio for an advertiser, compare versions, and keep every lyric choice connected to the sound.
              </p>
              <button
                className="button button-primary"
                type="button"
                disabled={busy}
                onClick={() => void signIn()}
              >
                Sign in with Entra External ID
              </button>
            </section>
          )}

          {identity && !access && !workspaceLoading && (
            <section className="panel" aria-labelledby="identity-heading">
              <h2 id="identity-heading">Application access required</h2>
              <p>Ask an administrator to verify and enroll this identity. Do not share your access token.</p>
              <p>Issuer: <code>{identity.issuer}</code></p>
              <p>Subject: <code>{identity.subject}</code></p>
            </section>
          )}

          <div
            id="workspace"
            hidden={!isSignedIn || !access || !workspaceReady}
            aria-busy={workspaceLoading}
          >
            {unresolvedCount > 0 && (
              <details className="panel reconciliation-panel">
                <summary>Paid voice is paused: {unresolvedCount} attempt{unresolvedCount === 1 ? '' : 's'} awaiting usage reconciliation</summary>
                <h2 id="reconciliation-heading">Paid usage awaiting reconciliation</h2>
                <p className="notice">
                  A paid attempt remains reserved until actual metered usage is recorded. Do not retry it.
                  Enter the actual cost and the evidence reference from the provider&apos;s billing record.
                </p>
                <div className="stack">
                  {runs.filter((run) => attemptNeedsReconciliation(run.attempt)).map((run) => {
                    const attempt = run.attempt
                    if (!attempt) return null
                    return (
                      <article className="reconciliation-card" key={attempt.attempt_id}>
                        <h3>Attempt {attempt.attempt_id}</h3>
                        <p className="muted">
                          Status: {attempt.status}. Estimated cost: ${attempt.estimated_cost_usd}.
                        </p>
                        <form onSubmit={(event) => void reconcileAttempt(event, attempt)}>
                          <label>
                            Actual metered cost in USD
                            <input
                              type="text"
                              inputMode="decimal"
                              name="actual_cost_usd"
                              maxLength={64}
                              required
                              disabled={busy}
                            />
                          </label>
                          <label>
                            Billing evidence reference
                            <input
                              type="text"
                              name="evidence_reference"
                              maxLength={500}
                              required
                              disabled={busy}
                            />
                          </label>
                          <button className="button button-primary" type="submit" disabled={busy}>
                            Record reconciliation
                          </button>
                        </form>
                      </article>
                    )
                  })}
                </div>
              </details>
            )}

            <div className="studio-layout" hidden={view !== 'workspace-view'}>
              <aside className="panel collection-panel" aria-labelledby="brief-heading">
                <h2 id="brief-heading">Advertisers</h2>
                <p className="collection-intro">Every brief, hook, and version in one place.</p>
                <label className="mobile-advertiser">
                  Active advertiser
                  <select value={activeBriefId} disabled={busy} onChange={event => inspectBrief(event.currentTarget.value)}>
                    {!briefs.length && <option value="">No advertisers yet</option>}
                    {briefs.map(brief => <option value={brief.brief_id} key={brief.brief_id}>{brief.name || brief.brief_id}</option>)}
                  </select>
                </label>
                <div className="button-row">
                  <button
                    className="button button-secondary"
                    type="button"
                    disabled={busy || !briefs.some(brief => brief.source !== 'custom')}
                    onClick={() => {
                      const sample = briefs.find(brief => brief.source !== 'custom')
                      if (sample) inspectBrief(sample.brief_id)
                      setSection('lyrics')
                    }}
                  >
                    Use sample brief
                  </button>
                  <button
                    className="button button-secondary"
                    type="button"
                    disabled={busy}
                    onClick={() => { setEditingBrief(true); setSection('brief'); setEstimate(null) }}
                  >
                    Enter or upload brief
                  </button>
                </div>
                  <div className="brief-collection" aria-label="Advertiser briefs">
                    {briefs.map(brief => (
                      <div className="collection-item" key={brief.brief_id} data-active={activeBriefId === brief.brief_id && !editingBrief}>
                        <button
                          type="button"
                          className="brief-inspect"
                          disabled={busy}
                          aria-pressed={activeBriefId === brief.brief_id && !editingBrief}
                          onClick={() => inspectBrief(brief.brief_id)}
                        >
                          <strong>{brief.name || brief.brief_id}</strong>
                          <span>{brief.source === 'custom' ? 'Your brief' : 'Sample brief'}</span>
                          <span>{outputs.filter(output => output.brief_id === brief.brief_id).length} audio versions</span>
                        </button>
                      </div>
                    ))}
                  </div>
                {!briefs.length && <p>No briefs loaded. Enter or upload a brief to begin.</p>}
                <p className="collection-footnote">AI-generated demos.<br />Human review before broadcast.</p>
              </aside>

              <section className="panel work-panel" aria-labelledby="active-brief-heading">
                <div className="section-heading">
                  <div>
                    <h1 id="active-brief-heading">{editingBrief ? 'Add your brief' : activeBrief?.name || 'Start with an advertiser'}</h1>
                    {!editingBrief && activeBrief && <p className="advertiser-summary">{[activeBrief.offer || activeBrief.description, activeBrief.location].filter(Boolean).join(' · ')}</p>}
                  </div>
                  {!editingBrief && activeBrief && (
                    <button className="button button-secondary brief-toggle" type="button" disabled={busy} aria-expanded={section === 'brief'} onClick={() => setSection(section === 'brief' ? 'lyrics' : 'brief')}>View brief</button>
                  )}
                </div>
                <nav className="workspace-nav detail-nav" aria-label="Active brief sections" hidden={editingBrief || !activeBrief}>
                  {(['lyrics', 'variants'] as const).map(item => (
                    <button
                      className="workspace-nav-button"
                      type="button"
                      key={item}
                      disabled={busy}
                      aria-pressed={item === 'lyrics' ? section !== 'variants' : section === item}
                      onClick={() => setSection(item)}
                    >
                      {item === 'lyrics' ? 'Create' : 'Listen & review'}
                    </button>
                  ))}
                </nav>
                <div className="work-content">
                  <div hidden={!editingBrief}>
                    <BriefEditor
                      disabled={busy}
                      onAdd={details => runAction('Validating brief', () => addBriefDetails(details))}
                      onUpload={file => runAction('Loading brief JSON', async () => addBriefDetails(await readBriefFile(file)))}
                    />
                  </div>
                  <section hidden={editingBrief || section !== 'brief' || !activeBrief} aria-label="Brief details">
                    <h3>Brief details</h3>
                    <p className="notice">Input ready. This is not a claims assessment or broadcast approval.</p>
                    <dl>
                      <dt>Brand</dt><dd>{activeBrief?.name || activeBriefId}</dd>
                      <dt>Offer</dt><dd>{activeBrief?.offer || activeBrief?.description || 'Not recorded'}</dd>
                      <dt>Location</dt><dd>{activeBrief?.location || 'Not recorded'}</dd>
                      <dt>Tone</dt><dd>{activeBrief?.tone || 'Not recorded'}</dd>
                      <dt>Contact email</dt><dd>{activeBrief?.contact_details?.email || 'Not recorded'}</dd>
                      <dt>Contact phone</dt><dd>{activeBrief?.contact_details?.phone || 'Not recorded'}</dd>
                      <dt>Approved claims</dt><dd>{activeBrief?.approved_claims?.join('; ') || 'Not recorded'}</dd>
                      {activeBrief?.cta && <><dt>Call to action</dt><dd>{activeBrief.cta}</dd></>}
                    </dl>
                    <p className="muted">To revise a loaded custom brief, enter a new one. Its original facts remain attached to existing audio.</p>
                  </section>
                  <section className="create-section" hidden={editingBrief || section === 'variants' || !activeBrief} aria-labelledby="lyrics-heading">
                    <div className="section-heading">
                      <div><h2 id="lyrics-heading">Find your hook.</h2><p className="muted">Choose the words, then bring them to life.</p></div>
                      <button className="button button-secondary" type="button" disabled={busy || !activeBrief || !options?.instrumental_available} onClick={() => void renderOffline(activeBrief ? [activeBrief] : [])}>Preview music only</button>
                    </div>
                    <p className="muted">
                      Generate three screened lyric options for this advertiser. Select an accepted draft to use its exact words in a voice-and-music version.
                      Music-only previews do not include lyrics or prove vocal quality.
                    </p>
                    <p className="notice">AI-generated lyrics require producer and advertiser approval before broadcast. A held option is not approved.</p>
                    {!lyricAvailable && <p className="notice">Paid lyric generation is disabled or unavailable for this account. Server configuration and paid access are required.</p>}
                    <label className="check-label">
                      <input
                        type="checkbox"
                        disabled={busy || !lyricAvailable}
                        checked={lyricConsent}
                        onChange={event => setLyricConsent(event.currentTarget.checked)}
                      />
                      I authorize paid Foundry and Content Safety requests for three lyric options, including the writer&apos;s bounded retries. Cost is not estimated here.
                    </label>
                    <button className="button button-primary" type="button" disabled={busy || !lyricAvailable || !lyricConsent} onClick={() => void generateLyrics()}>
                      Generate 3 lyric options
                    </button>
                    <div className="lyric-options">
                      {!lyricOptions[activeBriefId]?.length && <div className="empty-state"><h3>Your next hook starts here.</h3><p>Generate lyric options above, or preview the music before adding a voice.</p></div>}
                      {lyricOptions[activeBriefId]?.map((option, index) => (
                        <article className="lyric-card" key={option.option_id} data-selected={selectedLyric?.option_id === option.option_id}>
                          <div className="section-heading"><h3>Option {index + 1}</h3>{selectedLyric?.option_id === option.option_id && <span className="selection-label">Selected for audio</span>}</div>
                          <p className="status-badge">{option.status.replaceAll('_', ' ')}</p>
                          {option.output && <><h4>{option.output.hook}</h4><p className="lyric-text">{option.output.lyrics}</p></>}
                          {option.reasons.length > 0 && <p>{option.reasons.map(reason => reason.replaceAll('_', ' ')).join('; ')}</p>}
                          <div className="button-row lyric-actions"><button
                            className="button button-secondary" type="button"
                            disabled={busy || option.status !== 'accepted' || !option.output}
                            aria-pressed={selectedLyric?.option_id === option.option_id}
                            onClick={() => { setSelectedLyricIds(current => ({ ...current, [activeBriefId]: option.option_id })); setEstimate(null); setAnnouncement(`Lyric option ${index + 1} selected for audio.`) }}
                          >{selectedLyric?.option_id === option.option_id ? 'Selected lyrics' : `Use option ${index + 1}`}</button>
                          {selectedLyric?.option_id === option.option_id && <button className="button button-primary" type="button" disabled={busy || !paidAvailable || !activeBrief} onClick={() => void estimatePaidRender(activeBrief ? [activeBrief] : [], selectedLyric)}>Estimate voice + music</button>}</div>
                          {selectedLyric?.option_id === option.option_id && <p className="muted">{renderOptionsMessage(options, unresolvedCount, paidStatusUncertain)}</p>}
                          {option.status === 'human_review_required' && <p className="muted">Held for human review. This draft cannot be rendered.</p>}
                        </article>
                      ))}
                    </div>
                    {!selectedLyric && <section className="render-choice" aria-labelledby="audio-create-heading">
                      <div><h3 id="audio-create-heading">Bring your lyrics to life.</h3>
                        <p>Choose an accepted lyric option above to create a voice-and-music version.</p>
                        <p className="muted">{renderOptionsMessage(options, unresolvedCount, paidStatusUncertain)}</p>
                      </div>
                      <button className="button button-primary" type="button" disabled>Estimate voice + music</button>
                    </section>}
                  </section>

            <section
              id="outputs-view"
              className="variants-section"
              aria-labelledby="comparison-heading"
              hidden={editingBrief || section !== 'variants' || !activeBrief}
            >
              <div className="section-heading">
                <div>
                  <h2 id="comparison-heading" ref={comparisonHeading} tabIndex={-1}>
                    Your jingle versions
                  </h2>
                </div>
                <button className="button button-primary" type="button" disabled={busy} onClick={() => setSection('lyrics')}>Create another version</button>
              </div>
              <p className="muted review-guidance">AI-generated demos. Human approval required before broadcast.</p>
              <details className="review-options">
              <summary>Review filters and status</summary>
              <label>
                Results from
                <select value={activeRunId} disabled={busy} onChange={event => { setActiveRunId(event.currentTarget.value); setActiveOutputId('') }}>
                  <option value="">All runs for this brief</option>
                  {runs.filter(run => run.brief_ids.includes(activeBriefId)).map(run => (
                    <option key={run.run_id} value={run.run_id}>{run.run_id} · {run.status}</option>
                  ))}
                </select>
              </label>
              <p className="muted">Listen first. Compare versions, then record your review. Evaluation status never blocks playback.</p>
              <p className="muted">Overall evaluation: {activeStatus}. AI-generated demos require human approval before broadcast.</p>
              </details>
              {!visibleOutputs.length && <div className="empty-state"><h3>No audio in this view yet.</h3><p>Create a version, or choose another run above. Your brief and lyric options stay in Create.</p><button className="button button-secondary" type="button" onClick={() => setSection('lyrics')}>Go to Create</button></div>}
              <div className="version-list" aria-label="Audio versions">
                {visibleOutputs.map((output, index) => (
                  <article className="version-row" key={output.output_id} data-selected={inspectedOutput?.output_id === output.output_id}>
                    <div className="version-playback">
                      <button className="button button-secondary" type="button" disabled={busy} onClick={() => void listenToOutput(output)}>Listen to version {index + 1}</button>
                      <audio
                        controls preload="none" aria-label={`Play version ${index + 1}, ${output.variant}`}
                        ref={node => {
                          if (!node) {
                            audioElements.current.delete(output.output_id)
                            return
                          }
                          audioElements.current.set(output.output_id, node)
                          const url = audioUrls.current.get(output.output_id)?.url
                          if (url && node.getAttribute('src') !== url) node.src = url
                          else if (!url) node.removeAttribute('src')
                        }}
                        onPlay={event => { for (const audio of audioElements.current.values()) if (audio !== event.currentTarget) audio.pause() }}
                        onError={() => setErrorMessage('Audio playback failed. Load this version again or download its WAV.')}
                      />
                    </div>
                    <div className="version-description">
                      <h3>Version {index + 1} <span>{inspectedOutput?.output_id === output.output_id ? '/ Selected' : ''}</span></h3>
                      <p>{output.variant.replaceAll('_', ' ')} · {formatSeconds(output.duration_seconds)}</p>
                      <p className="muted">{output.lyric_source ? `Lyrics: ${output.lyric_source.hook}` : 'Original brief script; no selected lyric draft'}</p>
                      <p className="review-state">Audio ready · {output.evaluation ? 'Human review recorded' : 'Human review not recorded'}</p>
                    </div>
                    <button className="button button-secondary" type="button" disabled={busy} onClick={() => { setActiveOutputId(output.output_id); window.setTimeout(() => evaluationHeading.current?.focus(), 0) }}>Review this version</button>
                  </article>
                ))}
              </div>

              <div className="output-list">
                {(inspectedOutput ? [inspectedOutput] : []).map((output) => {
                  const isInstrumental =
                    Number(output.azure_usage.submitted_characters ?? 0) === 0
                  void audioRevision
                  const draft = evaluationDrafts[output.output_id] ?? {
                    brand_transcription: '',
                    cta_transcription: '',
                    self_rating: '',
                  }
                  const components = output.components.map((component) => {
                    const name =
                      component.component ||
                      component.name ||
                      component.component_id ||
                      'Audio component'
                    return `${name} — ${component.status}; source: ${evidenceValue(component.origin)}; rights evidence: ${evidenceValue(component.evidence)}; commercial-use basis: ${evidenceValue(component.commercial_use_basis)}`
                  })
                  const usage = output.azure_usage
                  const meteredEvidence =
                    Number(usage.submitted_characters ?? 0) === 0
                      ? 'No Azure request; instrumental-only.'
                      : [
                          `${usage.submitted_characters} submitted characters`,
                          `attempt: ${evidenceValue(usage.attempt_id)}`,
                          `rate evidence: ${evidenceValue(usage.rate_evidence)}`,
                          usage.billing_reconciled
                            ? `actual allocated cost: $${usage.actual_allocated_cost_usd}; reconciliation reference: ${evidenceValue(usage.reconciliation_reference)}`
                            : 'Actual metered usage has not been reconciled.',
                        ].join('; ')

                  return (
                    <article className="output-card" key={output.output_id}>
                      <h3 ref={evaluationHeading} tabIndex={-1}>Review: {output.variant.replaceAll('_', ' ')}</h3>
                      <p className="notice">
                        {isInstrumental
                          ? 'Instrumental-only preview — not vocal proof. Evaluation remains Pending; playback is available.'
                          : 'Azure voice output.'}
                      </p>
                      <p className="status-badge" data-status={output.status}>
                        Evaluation: {output.status}
                      </p>
                      {output.lyric_source && <section className="lyric-source" key={output.lyric_source.option_id}><h4>Lyrics behind this version</h4><p className="lyric-text">{output.lyric_source.lyrics}</p><p className="muted">Server-screened draft · AI-generated · Broadcast approval still required</p></section>}
                      <div className="button-row">
                        <button
                          className="button button-secondary"
                          type="button"
                          disabled={busy}
                          onClick={() => void loadAudio(output)}
                        >
                          Load protected audio
                        </button>
                        <button
                          className="button button-secondary"
                          type="button"
                          disabled={busy}
                          onClick={() => void downloadAudio(output)}
                        >
                          Download WAV
                        </button>
                      </div>
                      <details>
                        <summary>Technical and usage evidence</summary>
                      <dl>
                        <dt>Duration</dt>
                        <dd>{formatSeconds(output.duration_seconds)}</dd>
                        <dt>Render time</dt>
                        <dd>{formatSeconds(output.render_seconds)}</dd>
                        <dt>Numeric gates</dt>
                        <dd>{evidenceValue(output.numeric_gates)}</dd>
                        <dt>Component and rights evidence</dt>
                        <dd style={{ whiteSpace: 'pre-wrap' }}>
                          {components.join('\n') || 'Unavailable'}
                        </dd>
                        <dt>Metered usage evidence</dt>
                        <dd>{meteredEvidence}</dd>
                      </dl>
                      </details>

                      {output.evaluation ? (
                        <section className="evaluation" aria-label="Evaluation">
                          <h4>Evaluation</h4>
                          <p className="muted">Evaluation submitted; this record is immutable.</p>
                          <dl>
                            <dt>Brand transcription</dt>
                            <dd>{output.evaluation.brand_transcription}</dd>
                            <dt>Brand match</dt>
                            <dd>{output.evaluation.brand_match ? 'Match' : 'No match'}</dd>
                            <dt>Call-to-action transcription</dt>
                            <dd>{output.evaluation.cta_transcription}</dd>
                            <dt>Call-to-action match</dt>
                            <dd>{output.evaluation.cta_match ? 'Match' : 'No match'}</dd>
                            <dt>Self-rating</dt>
                            <dd>{output.evaluation.self_rating}</dd>
                          </dl>
                        </section>
                      ) : (
                        <form onSubmit={(event) => void submitEvaluation(event, output)}>
                          <label>
                            Brand transcription
                            <textarea
                              name="brand_transcription"
                              maxLength={1000}
                              required
                              disabled={busy}
                              value={draft.brand_transcription}
                              onChange={(event) =>
                                updateEvaluationDraft(
                                  output.output_id,
                                  'brand_transcription',
                                  event.currentTarget.value,
                                )
                              }
                            />
                          </label>
                          <label>
                            Call-to-action transcription
                            <textarea
                              name="cta_transcription"
                              maxLength={2000}
                              required
                              disabled={busy}
                              value={draft.cta_transcription}
                              onChange={(event) =>
                                updateEvaluationDraft(
                                  output.output_id,
                                  'cta_transcription',
                                  event.currentTarget.value,
                                )
                              }
                            />
                          </label>
                          <label>
                            Usability rating
                            <select
                              name="self_rating"
                              required
                              disabled={busy}
                              value={draft.self_rating}
                              onChange={(event) =>
                                updateEvaluationDraft(
                                  output.output_id,
                                  'self_rating',
                                  event.currentTarget.value,
                                )
                              }
                            >
                              <option value="">Choose a rating</option>
                              <option value="usable with minor edits">usable with minor edits</option>
                              <option value="usable with major edits">usable with major edits</option>
                              <option value="not usable">not usable</option>
                            </select>
                          </label>
                          <button className="button button-primary" type="submit" disabled={busy}>
                            Submit evaluation
                          </button>
                        </form>
                      )}

                      <div className="button-row">
                        <button
                          className="button button-secondary"
                          type="button"
                          disabled={busy}
                          onClick={() => void loadEvidence(output)}
                        >
                          Load evidence
                        </button>
                        <button
                          className="button button-secondary"
                          type="button"
                          disabled={busy}
                          onClick={() => void downloadEvidence(output)}
                        >
                          Download evidence JSON
                        </button>
                      </div>
                      {evidence[output.output_id] && (
                        <pre aria-label={`Evidence for ${output.output_id}`}>
                          {evidence[output.output_id]}
                        </pre>
                      )}
                    </article>
                  )
                })}
              </div>
            </section>
                </div>
              </section>

            <details
              id="runs-view"
              className="panel history-panel"
              aria-labelledby="runs-heading"
            >
              <summary>Generation history</summary>
              <h2 id="runs-heading">Recent render runs</h2>
              <p className="muted">
                Run and paid-attempt status is recovered from the API after a page reload or connection loss.
              </p>
              <button
                className="button button-secondary"
                type="button"
                disabled={busy}
                onClick={() => void runAction('Refreshing workspace', async () => {
                  if (client && config) await loadWorkspaceData(client, config)
                  setAnnouncement('Run status refreshed.')
                })}
              >
                Refresh runs
              </button>
              {!runs.length && <p>No runs yet. Select briefs and render your first preview.</p>}
              <ul className="run-list">
                {runs.map((run) => (
                  <li key={run.run_id}>
                    <button
                      className="run-inspect"
                      type="button"
                      disabled={busy}
                      aria-pressed={activeRunId === run.run_id}
                      onClick={() => {
                        if (!run.brief_ids.includes(activeBriefId)) setActiveBriefId(run.brief_ids[0] ?? '')
                        setActiveRunId(run.run_id)
                        setActiveOutputId('')
                        setEditingBrief(false)
                        setSection('variants')
                        setLyricConsent(false)
                      }}
                    >
                      <strong>{run.mode} · {run.status}</strong>
                      <span>{run.brief_ids.map(id => briefs.find(brief => brief.brief_id === id)?.name || id).join(', ')}</span>
                      <span className="run-id">{run.run_id}</span>
                      {run.attempt && <span>Paid attempt: {run.attempt.status}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </details>

              <details className="panel batch-panel">
                <summary>Batch tools</summary>
                <div className="batch-content">
                <div>
                  <h2 id="batch-heading">Render selected briefs</h2>
                  <p className="muted">Advanced: render up to three briefs using their original scripts, not the lyric choice in Create.</p>
                  <fieldset disabled={busy}>
                    <legend>Briefs in this batch</legend>
                    {briefs.map(brief => (
                      <label className="check-label" key={brief.brief_id}>
                        <input type="checkbox" aria-label={`Select ${brief.name || brief.brief_id}`} checked={selectedBriefIds.has(brief.brief_id)} onChange={event => updateSelectedBrief(brief.brief_id, event.currentTarget.checked)} />
                        {brief.name || brief.brief_id}
                      </label>
                    ))}
                  </fieldset>
                  <p>{selectedBriefs.length} selected{selectedBriefs.length ? `: ${selectedBriefs.map(brief => brief.name || brief.brief_id).join(', ')}` : '. Check a brief in the collection to begin.'}</p>
                  {batchTooLarge && <p className="alert">Select at most three briefs per render.</p>}
                </div>
                <div className="batch-controls">
                  <label className="check-label">
                    <input type="checkbox" checked={includeVocals} disabled={busy || (!paidAvailable && !includeVocals)} onChange={event => { setIncludeVocals(event.currentTarget.checked); setEstimate(null) }} />
                    Include vocals (paid Azure voice)
                  </label>
                  <button
                    className="button button-primary"
                    type="button"
                    disabled={busy || !selectedBriefs.length || batchTooLarge || (includeVocals && !paidAvailable)}
                    onClick={() => void (includeVocals ? estimatePaidRender() : renderOffline())}
                  >
                    {busy ? 'Working…' : includeVocals ? 'Estimate vocal render' : 'Render instrumental preview'}
                  </button>
                </div>
                <p className="muted batch-help">{renderOptionsMessage(options, unresolvedCount, paidStatusUncertain)} Instrumental previews are not vocal proof.</p>
                </div>
              </details>
            </div>

            <section
              id="admin-view"
              className="panel workspace-view"
              aria-labelledby="admin-heading"
              hidden={view !== 'admin-view' || !access?.admin}
            >
              <h2 id="admin-heading" ref={adminHeading} tabIndex={-1}>
                Manage application access
              </h2>
              <p>Enroll only an issuer and subject verified with the user. Changes do not modify External ID accounts.</p>
              <h3>Current users</h3>
              <ul className="stack">
                {adminUsers.map((user) => (
                  <li key={`${user.issuer}:${user.subject}`}>
                    <span>
                      {user.subject}: {user.enabled ? 'enabled' : 'disabled'},{' '}
                      {user.admin ? 'administrator' : 'not administrator'},{' '}
                      {user.paid_speech ? 'paid Speech allowed' : 'paid Speech denied'}
                    </span>
                    <button
                      className="button button-secondary"
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        setUserDraft({
                          issuer: user.issuer,
                          subject: user.subject,
                          enabled: user.enabled,
                          admin: user.admin,
                          paid_speech: user.paid_speech,
                        })
                      }
                    >
                      Edit {user.subject}
                    </button>
                  </li>
                ))}
              </ul>
              <h3>Set user access</h3>
              <form onSubmit={(event) => void saveUserAccess(event)}>
                <label>
                  Verified issuer
                  <input
                    type="text"
                    maxLength={1024}
                    required
                    readOnly
                    disabled={busy}
                    value={userDraft.issuer}
                      onChange={(event) => {
                        const issuer = event.currentTarget.value
                      setUserDraft((current) => ({
                        ...current,
                          issuer,
                      }))
                      }}
                  />
                </label>
                <label>
                  Verified subject
                  <input
                    type="text"
                    maxLength={1024}
                    aria-describedby="subject-help"
                    required
                    disabled={busy}
                    value={userDraft.subject}
                    onChange={(event) => {
                      const subject = event.currentTarget.value
                      setUserDraft((current) => ({
                        ...current,
                        subject,
                        enabled: false,
                        admin: false,
                        paid_speech: false,
                      }))
                    }}
                  />
                </label>
                <p id="subject-help" className="muted">
                  Changing the subject clears selected permissions.
                </p>
                <fieldset disabled={busy}>
                  <legend>Application permissions</legend>
                  <label>
                    <input
                      type="checkbox"
                      checked={userDraft.enabled}
                      onChange={(event) => {
                        const enabled = event.currentTarget.checked
                        setUserDraft((current) => ({
                          ...current,
                          enabled,
                        }))
                      }}
                    />
                    Enabled
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={userDraft.admin}
                      onChange={(event) => {
                        const admin = event.currentTarget.checked
                        setUserDraft((current) => ({
                          ...current,
                          admin,
                        }))
                      }}
                    />
                    Administrator
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={userDraft.paid_speech}
                      onChange={(event) => {
                        const paidSpeech = event.currentTarget.checked
                        setUserDraft((current) => ({
                          ...current,
                          paid_speech: paidSpeech,
                        }))
                      }}
                    />
                    Paid Speech access
                  </label>
                </fieldset>
                <p className="muted">
                  Paid rendering also requires server spending controls and explicit confirmation.
                </p>
                <button className="button button-primary" type="submit" disabled={busy}>
                  Save user access
                </button>
              </form>
            </section>
          </div>
      </main>

      <dialog
        ref={estimateDialog}
        aria-labelledby="estimate-heading"
        aria-describedby="estimate-summary"
        onClose={handleEstimateDialogClose}
      >
        <div className="dialog-content">
          <h2 id="estimate-heading">Confirm this Azure voice estimate</h2>
          <p id="estimate-summary">
            {estimate &&
              `Selected briefs: ${estimate.brief_ids
                .map((id) => briefs.find((brief) => brief.brief_id === id)?.name || id)
                .join(', ')}. Estimated total: $${estimate.estimated_cost_usd} USD.`}
          </p>
          {estimate?.lyric_selections?.map(selection => {
            const choices = lyricOptions[selection.brief_id] ?? []
            const index = choices.findIndex(option => option.option_id === selection.option_id)
            const draft = choices[index]?.output
            return draft
              ? <div className="estimate-lyric" key={selection.option_id}><p><strong>Option {index + 1}: {draft.hook}</strong></p><p className="lyric-text">{draft.lyrics}</p></div>
              : <p className="notice" role="alert" key={selection.option_id}>This saved lyric draft could not be loaded. Cancel and reload the workspace to verify it before rendering.</p>
          })}
          <p className="muted">
            Confirmation is bound to these exact briefs{estimate?.lyric_selections?.length ? ', the selected lyric draft,' : ''} and the server-computed estimate. The server will
            re-check the contents before starting.
          </p>
          <div className="button-row">
            <button
              className="button button-secondary"
              type="button"
              onClick={() => estimateDialog.current?.close('cancel')}
            >
              Do not render
            </button>
            <button
              className="button button-primary"
              type="button"
              disabled={estimate?.lyric_selections?.some(selection => !lyricOptions[selection.brief_id]?.some(option => option.option_id === selection.option_id && option.output))}
              onClick={() => estimateDialog.current?.close('confirm')}
            >
              Confirm and render
            </button>
          </div>
        </div>
      </dialog>

      <footer>
        <p>Earwyrm proof of concept · AI-generated demos, not broadcast masters. Paid requests require your explicit confirmation.</p>
      </footer>
    </>
  )
}

export default App
