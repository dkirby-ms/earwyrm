import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { IPublicClientApplication } from '@azure/msal-browser'
import { ApiError, apiBlob, apiJson } from './api'
import { initializeAuth } from './auth'
import BriefEditor from './BriefEditor'
import type {
  Access,
  AccessRequestStatus,
  AdminAccessRequest,
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
const creationSteps = [
  ['brief', 'Brief'],
  ['arrangements', 'Music'],
  ['fitted-lyrics', 'Lyrics'],
  ['finish', 'Voice'],
] as const
type CreationStep = typeof creationSteps[number][0]
type BriefSection = CreationStep | 'lyrics' | 'variants'

interface ArrangementPreview {
  readonly job_id: string
  readonly label: string
  readonly output: Output
}

interface ChatMessage {
  readonly role: 'user' | 'assistant'
  readonly content: string
}

interface ChatSession {
  readonly messages: readonly ChatMessage[]
  readonly message: string
  readonly direction: string
  readonly productPath: 'spoken' | 'vocoded'
}

const emptyChat: ChatSession = { messages: [], message: '', direction: '', productPath: 'spoken' }

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

function accessRequestAnnouncement(status: AccessRequestStatus): string {
  switch (status) {
    case 'none': return 'No access request has been submitted. You can request access.'
    case 'pending': return 'Your access request is pending administrator review.'
    case 'approved': return 'Your access request was approved. Reload the workspace to continue.'
    case 'denied': return 'Your access request was denied. You can submit a new request.'
  }
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
  const [accessRequestStatus, setAccessRequestStatus] = useState<AccessRequestStatus | null>(null)
  const [briefs, setBriefs] = useState<readonly Brief[]>([])
  const [options, setOptions] = useState<RenderOptions | null>(null)
  const [runs, setRuns] = useState<readonly RenderRun[]>([])
  const [outputs, setOutputs] = useState<readonly Output[]>([])
  const [rollup, setRollup] = useState<StatusRollup | null>(null)
  const [adminUsers, setAdminUsers] = useState<readonly UserAccess[]>([])
  const [adminAccessRequests, setAdminAccessRequests] = useState<readonly AdminAccessRequest[]>([])
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
  const [section, setSection] = useState<BriefSection>('brief')
  const [activeBriefId, setActiveBriefId] = useState('')
  const [activeRunId, setActiveRunId] = useState('')
  const [activeOutputId, setActiveOutputId] = useState('')
  const [editingBrief, setEditingBrief] = useState(false)
  const [includeVocals, setIncludeVocals] = useState(false)
  const [lyricAvailable, setLyricAvailable] = useState(false)
  const [lyricConsent, setLyricConsent] = useState(false)
  const [chatConsent, setChatConsent] = useState(false)
  const [chatSessions, setChatSessions] = useState<Readonly<Record<string, ChatSession>>>({})
  const [lyricOptions, setLyricOptions] = useState<Readonly<Record<string, readonly LyricOption[]>>>({})
  const [selectedLyricIds, setSelectedLyricIds] = useState<Readonly<Record<string, string>>>({})
  const [arrangements, setArrangements] = useState<readonly ArrangementPreview[]>([])
  const [arrangementId, setArrangementId] = useState('')
  const [fittedLyricId, setFittedLyricId] = useState('')
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
  const stepHeading = useRef<HTMLHeadingElement>(null)
  const evaluationHeading = useRef<HTMLHeadingElement>(null)
  const audioElements = useRef(new Map<string, HTMLAudioElement>())
  const audioUrls = useRef(new Map<string, { url: string; timer: number }>())
  const chatContext = useRef(activeBriefId)
  chatContext.current = activeBriefId

  async function loadWorkspaceData(
    authClient: IPublicClientApplication,
    publicConfig: PublicConfig,
  ): Promise<'ready' | 'access-denied'> {
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

      let currentAccess: Access
      try {
        currentAccess = await apiJson<Access>(
          authClient,
          publicConfig,
          '/api/access',
          apiScopes.briefs,
        )
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 403 || error.message !== 'Application access denied') throw error
        const requestStatus = await apiJson<{ status: AccessRequestStatus }>(
          authClient, publicConfig, '/api/access-requests', apiScopes.briefs,
        )
        setAccess(null)
        setAccessRequestStatus(requestStatus.status)
        setErrorMessage('')
        setAnnouncement(accessRequestAnnouncement(requestStatus.status))
        return 'access-denied'
      }
      setAccess(currentAccess)
      setAccessRequestStatus(null)
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
      return 'ready'
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
        const result = await loadWorkspaceData(auth.client, publicConfig)
        setAnnouncement(result === 'ready'
          ? 'Signed-in workspace loaded.'
          : 'Signed in. Request access to continue.')
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
  const chatSession = chatSessions[activeBriefId] ?? emptyChat
  const selectedLyric = lyricOptions[activeBriefId]?.find(option =>
    option.option_id === selectedLyricIds[activeBriefId] && option.status === 'accepted' && option.output)
  const selectedArrangement = arrangements.find(item => item.job_id === arrangementId)
  const fittedLyrics = selectedArrangement
    ? (lyricOptions[activeBriefId] ?? []).filter(option => option.arrangement_job_id === selectedArrangement.job_id)
    : []
  const fittedLyric = fittedLyrics.find(option => option.option_id === fittedLyricId && option.status === 'accepted' && option.output)
  const currentStep = creationSteps.findIndex(([id]) => id === section)
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
      const workspaceResult = await loadWorkspaceData(client, config)
      setAnnouncement(workspaceResult === 'ready'
        ? 'Signed in. Briefs and run status are ready.'
        : 'Signed in. Request access to continue.')
    } catch (error) {
      setErrorMessage(errorText(error, 'Sign-in failed.'))
      setAnnouncement('Sign-in failed.')
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  async function requestApplicationAccess(): Promise<void> {
    if (!client || !config) return
    await runAction('Sending access request', async () => {
      const result = await apiJson<{ status: 'pending' | 'already_enabled' }>(
        client, config, '/api/access-requests', apiScopes.briefs, { method: 'POST' },
      )
      if (result.status === 'already_enabled') {
        const loadResult = await loadWorkspaceData(client, config)
        setAnnouncement(loadResult === 'ready'
          ? 'Application access is ready. Your workspace has loaded.'
          : 'Application access is enabled. Reload the workspace to continue.')
        return
      }
      setAccessRequestStatus('pending')
      setAnnouncement('Access request submitted. An administrator will review it.')
    })
  }

  async function reloadApprovedAccess(): Promise<void> {
    if (!client || !config) return
    await runAction('Refreshing application access', async () => {
      const result = await loadWorkspaceData(client, config)
      setAnnouncement(result === 'ready'
        ? 'Application access is ready. Your workspace has loaded.'
        : 'Access has not been enabled yet. You can return and reload later.')
    })
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
      setAccessRequestStatus(null)
      setBriefs([])
      setOptions(null)
      setRuns([])
      setOutputs([])
      setRollup(null)
      setAdminUsers([])
      setAdminAccessRequests([])
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
      setSection('brief')
      setArrangements([])
      setArrangementId('')
      setFittedLyricId('')
      setEditingBrief(false)
      setIncludeVocals(false)
      setLyricAvailable(false)
      setLyricConsent(false)
      setChatConsent(false)
      setChatSessions({})
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

  async function loadAdminAccessRequests(): Promise<void> {
    if (!client || !config) return
    const result = await apiJson<{ requests: AdminAccessRequest[] }>(
      client,
      config,
      '/api/admin/access-requests',
      apiScopes.reads,
    )
    setAdminAccessRequests(result.requests)
  }

  function handleViewChange(nextView: WorkspaceView): void {
    setView(nextView)
    if (nextView !== 'admin-view' || !access?.admin) return

    window.setTimeout(() => adminHeading.current?.focus(), 0)
    void runAction('Loading application access', async () => {
      await Promise.all([loadAdminUsers(), loadAdminAccessRequests()])
      setAnnouncement('Application access loaded.')
    })
  }

  async function decideAccessRequest(
    request: AdminAccessRequest,
    decision: 'approved' | 'denied',
  ): Promise<void> {
    if (!client || !config) return
    const action = decision === 'approved' ? 'Granting access' : 'Denying access'
    await runAction(`${action} for ${request.subject}`, async () => {
      try {
        await apiJson<{ status: string }>(
          client,
          config,
          `/api/admin/access-requests/${encodeURIComponent(request.request_id)}/decision`,
          apiScopes.render,
          { method: 'POST', body: { decision } },
        )
      } catch (decisionError) {
        try {
          await loadAdminAccessRequests()
        } catch (refreshError) {
          throw new Error(
            `The decision failed: ${errorText(decisionError, 'The request could not be decided.')}. ` +
            `The pending request list could not be refreshed: ${errorText(refreshError, 'Refresh failed.')}`,
          )
        }
        throw decisionError
      }

      try {
        await Promise.all([loadAdminUsers(), loadAdminAccessRequests()])
      } catch (refreshError) {
        throw new Error(
          `The decision was saved, but application access could not be refreshed: ${errorText(refreshError, 'Refresh failed.')}`,
        )
      }

      setAnnouncement(decision === 'approved'
        ? `Access granted to ${request.subject}. Baseline application access is enabled. Administrator and paid Speech permissions remain off.`
        : `Access request for ${request.subject} denied.`)
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
    chatContext.current = briefId
    setActiveBriefId(briefId)
    setActiveOutputId('')
    setActiveRunId('')
    setEditingBrief(false)
    setLyricConsent(false)
    setChatConsent(false)
    setEstimate(null)
    if (briefId !== activeBriefId) {
      setArrangements([])
      setArrangementId('')
      setFittedLyricId('')
    }
    goToStep('brief')
    for (const audio of audioElements.current.values()) audio.pause()
  }

  async function addBriefDetails(details: unknown): Promise<void> {
    if (!client || !config || !identity) return
    const added = await apiJson<Brief>(client, config, '/api/briefs/validate', apiScopes.render, { method: 'POST', body: details })
    const loaded = [...briefs.filter(brief => brief.brief_id !== added.brief_id), added]
    setBriefs(loaded)
    inspectBrief(added.brief_id)
    try {
      window.sessionStorage.setItem(briefSessionKey(identity), JSON.stringify(loaded.filter(brief => brief.source === 'custom')))
    } catch (error) {
      if (!(error instanceof DOMException)) throw error
      throw new Error('Brief loaded, but this browser could not save the session draft. Render it now or keep your JSON to upload again.')
    }
    setAnnouncement('Brief loaded. Continue to music.')
  }

  function goToStep(step: CreationStep): void {
    for (const audio of audioElements.current.values()) audio.pause()
    setLyricConsent(false)
    setSection(step)
    window.setTimeout(() => stepHeading.current?.focus(), 0)
  }

  async function generateArrangements(): Promise<void> {
    if (!client || !config || !activeBrief) return
    const brief = activeBrief
    await runAction('Creating instrumental arrangements', async () => {
      const result = await apiJson<{ arrangements: ArrangementPreview[] }>(client, config, '/api/arrangements', apiScopes.render, {
        method: 'POST',
        body: {
          brief_ids: [brief.brief_id],
          custom_briefs: brief.source === 'custom' ? [customPayload(brief)] : [],
        },
      })
      setArrangements(result.arrangements)
      setArrangementId('')
      setFittedLyricId('')
      setOutputs(current => [
        ...current.filter(output => !result.arrangements.some(item => item.output.output_id === output.output_id)),
        ...result.arrangements.map(item => item.output),
      ])
      setRuns(current => [
        ...result.arrangements.filter(item => !current.some(run => run.run_id === item.job_id)).map(item => ({
          run_id: item.job_id, mode: 'instrumental', brief_ids: [brief.brief_id], status: 'completed',
        })),
        ...current,
      ])
      setAnnouncement('Instrumental arrangements are ready to compare.')
    })
  }

  async function generateLyrics(arrangementJobId?: string): Promise<void> {
    if (!client || !config || !activeBrief || !lyricConsent) return
    const brief = activeBrief
    setLyricConsent(false)
    await runAction('Generating three screened lyric options', async () => {
      const result = await apiJson<{ brief_id: string; options: LyricOption[] }>(client, config, '/api/lyrics/options', apiScopes.render, {
        method: 'POST',
        body: {
          brief_ids: [brief.brief_id],
          custom_briefs: brief.source === 'custom' ? [customPayload(brief)] : [],
          ...(arrangementJobId ? { arrangement_job_id: arrangementJobId } : {}),
          confirm_paid_generation: true,
        },
      })
      setLyricOptions(current => ({ ...current, [brief.brief_id]: [...(current[brief.brief_id] ?? []), ...result.options] }))
      setAnnouncement('Lyric generation finished. Review each option’s status and any required human review.')
    })
  }

  function updateChat(patch: Partial<ChatSession>): void {
    setChatSessions(current => ({ ...current, [activeBriefId]: { ...(current[activeBriefId] ?? emptyChat), ...patch } }))
  }

  async function chatAction(action: 'discuss' | 'write'): Promise<void> {
    if (!client || !config || !activeBrief || !chatConsent) return
    const brief = activeBrief
    const messages: readonly ChatMessage[] = [...chatSession.messages.slice(-10), { role: 'user', content: chatSession.message.trim() }]
    setChatConsent(false)
    await runAction(action === 'discuss' ? 'Asking the jingle MCP advisor' : 'Writing a screened draft through MCP', async () => {
      const body = {
        action, brief_ids: [brief.brief_id],
        custom_briefs: brief.source === 'custom' ? [customPayload(brief)] : [],
        confirm_paid_generation: true,
      }
      if (action === 'discuss') {
        const result = await apiJson<{ reply: string; creative_direction: string }>(client, config, '/api/chat', apiScopes.render, {
          method: 'POST', body: { ...body, messages },
        })
        if (chatContext.current !== brief.brief_id) return
        updateChat({ messages: [...messages, { role: 'assistant', content: result.reply }], message: '', direction: result.creative_direction })
        setAnnouncement('MCP suggestion ready. Refine the direction or authorize a lyric draft.')
      } else {
        const result = await apiJson<{ option: LyricOption }>(client, config, '/api/chat', apiScopes.render, {
          method: 'POST', body: { ...body, creative_direction: chatSession.direction.trim(), product_path: chatSession.productPath },
        })
        if (chatContext.current !== brief.brief_id) return
        setLyricOptions(current => ({ ...current, [brief.brief_id]: [...(current[brief.brief_id] ?? []), result.option] }))
        if (result.option.status === 'accepted') setSelectedLyricIds(current => ({ ...current, [brief.brief_id]: result.option.option_id }))
        setAnnouncement(`MCP write_lyrics finished: ${result.option.status.replaceAll('_', ' ')}. Review the draft below.`)
      }
    })
  }

  async function buildMusicPreview(option: LyricOption): Promise<void> {
    if (!client || !config || !activeBrief) return
    const brief = activeBrief
    await runAction('Building the exact MCP music preview', async () => {
      const result = await apiJson<{ job_id: string }>(client, config, '/api/chat', apiScopes.render, {
        method: 'POST', body: {
          action: 'compose', brief_ids: [brief.brief_id], option_id: option.option_id,
          custom_briefs: brief.source === 'custom' ? [customPayload(brief)] : [],
        },
      })
      if (chatContext.current !== brief.brief_id) return
      await loadWorkspaceData(client, config)
      inspectCompletedRun(result.job_id, [brief.brief_id])
      setAnnouncement('MCP arrangement ready. Listen, then estimate vocals on this exact arrangement. Retrying this lyric recovers the same preview.')
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

  async function estimatePaidRender(
    renderBriefs: readonly Brief[] = selectedBriefs,
    lyric?: Pick<LyricOption, 'brief_id' | 'option_id'>,
    compositionJobId?: string,
  ): Promise<void> {
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
          ...(lyric && compositionJobId ? { composition_selections: [{ brief_id: lyric.brief_id, job_id: compositionJobId }] } : {}),
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
              ...(confirmedEstimate.composition_selections ? { composition_selections: confirmedEstimate.composition_selections } : {}),
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

  async function listenToOutput(output: Output, preview = false): Promise<void> {
    if (!client || !config) return
    await runAction('Loading audio version', async () => {
      for (const audio of audioElements.current.values()) audio.pause()
      const blob = await apiBlob(client, config, output.audio_url, apiScopes.output)
      const url = storeAudioUrl(output.output_id, blob)
      const audio = audioElements.current.get(preview ? `preview:${output.output_id}` : output.output_id)
      if (!audio) throw new Error('Audio controls are unavailable. Open Listen & review and try again.')
      audio.src = url
      await audio.play()
      if (!preview) setActiveOutputId(output.output_id)
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
            <section className="panel sign-in-panel" aria-labelledby="access-heading">
              <h2 id="access-heading">Request access</h2>
              <p>You’re signed in, but this account hasn’t been enabled for Earwyrm. Request access and an administrator will review it.</p>
              {accessRequestStatus === 'pending' && (
                <p className="notice" role="status">Your request is pending review. You can return later.</p>
              )}
              {accessRequestStatus === 'denied' && (
                <p className="alert" role="status">Your request was denied. You can submit a new request if you still need access.</p>
              )}
              {accessRequestStatus === 'approved' && (
                <p className="notice" role="status">Your request was approved. Reload the workspace to continue.</p>
              )}
              {accessRequestStatus === null && (
                <p className="muted" role="status">We couldn’t check your request status. Reload the page to try again.</p>
              )}
              {(accessRequestStatus === 'none' || accessRequestStatus === 'denied') && (
                <button className="button button-primary" type="button" disabled={busy} onClick={() => void requestApplicationAccess()}>
                  {accessRequestStatus === 'denied' ? 'Request access again' : 'Request access'}
                </button>
              )}
              {accessRequestStatus === 'approved' && (
                <button className="button button-primary" type="button" disabled={busy} onClick={() => void reloadApprovedAccess()}>
                  Reload workspace
                </button>
              )}
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
                <p className="collection-intro">Choose a brief to start a jingle.</p>
                <label className="mobile-advertiser">
                  Active advertiser
                  <select value={activeBriefId} disabled={busy} onChange={event => inspectBrief(event.currentTarget.value)}>
                    {!briefs.length && <option value="">No advertisers yet</option>}
                    {briefs.map(brief => <option value={brief.brief_id} key={brief.brief_id}>{brief.name || brief.brief_id}</option>)}
                  </select>
                </label>
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
                    <h1 id="active-brief-heading">{currentStep >= 0 ? 'Create a jingle' : activeBrief?.name || 'Jingle workspace'}</h1>
                    {!editingBrief && activeBrief && section !== 'brief' && <p className="advertiser-summary">{currentStep >= 0 ? activeBrief.name : [activeBrief.offer || activeBrief.description, activeBrief.location].filter(Boolean).join(' · ')}</p>}
                  </div>
                </div>
                <nav className="workspace-nav detail-nav" aria-label="Active brief sections" hidden={editingBrief || !activeBrief}>
                  <button className="workspace-nav-button" type="button" disabled={busy} aria-pressed={currentStep >= 0} onClick={() => goToStep('brief')}>Create</button>
                  <button className="workspace-nav-button" type="button" disabled={busy} aria-pressed={section === 'variants'} onClick={() => { for (const audio of audioElements.current.values()) audio.pause(); setSection('variants') }}>Listen &amp; review</button>
                </nav>
                <div className="work-content">
                  {currentStep >= 0 && (
                    <ol className="creation-steps" aria-label="Jingle creation progress">
                      {creationSteps.map(([id, label], index) => (
                        <li key={id} aria-current={index === currentStep ? 'step' : undefined} data-complete={index < currentStep}>
                          <span>{index + 1}</span> {label}
                        </li>
                      ))}
                    </ol>
                  )}
                  {section === 'brief' && (
                    <section className="guided-step" aria-labelledby="brief-step-heading">
                      <h2 id="brief-step-heading" ref={stepHeading} tabIndex={-1}>{editingBrief ? 'Add your brief' : 'Start with a brief'}</h2>
                      {!editingBrief && <>
                        <p className="muted">Choose a sample advertiser or add your own brief. Both follow the same steps.</p>
                        {activeBrief && <div className="brief-selection">
                          <h3>{activeBrief.name || activeBrief.brief_id}</h3>
                          <p>{[activeBrief.offer || activeBrief.description, activeBrief.location].filter(Boolean).join(' · ')}</p>
                          {activeBrief.cta && <p><strong>Call to action:</strong> {activeBrief.cta}</p>}
                          <details>
                            <summary>View brief details</summary>
                            <dl>
                              <dt>Tone</dt><dd>{activeBrief.tone || 'Not recorded'}</dd>
                              <dt>Contact email</dt><dd>{activeBrief.contact_details?.email || 'Not recorded'}</dd>
                              <dt>Contact phone</dt><dd>{activeBrief.contact_details?.phone || 'Not recorded'}</dd>
                              <dt>Approved claims</dt><dd>{activeBrief.approved_claims?.join('; ') || 'Not recorded'}</dd>
                            </dl>
                          </details>
                        </div>}
                        <div className="button-row">
                          <button className="button button-primary" type="button" disabled={busy || !activeBrief} onClick={() => goToStep('arrangements')}>Continue to music</button>
                          <button className="button button-secondary" type="button" disabled={busy} onClick={() => { setEditingBrief(true); setEstimate(null); goToStep('brief') }}>Enter or upload brief</button>
                        </div>
                      </>}
                      {editingBrief && <button className="button button-secondary" type="button" disabled={busy} onClick={() => { setEditingBrief(false); goToStep('brief') }}>Cancel</button>}
                    </section>
                  )}
                  <div hidden={!editingBrief}>
                    <BriefEditor
                      disabled={busy}
                      onAdd={details => runAction('Validating brief', () => addBriefDetails(details))}
                      onUpload={file => runAction('Loading brief JSON', async () => addBriefDetails(await readBriefFile(file)))}
                    />
                  </div>
                  {section === 'arrangements' && activeBrief && (
                    <section className="guided-step" aria-labelledby="music-step-heading">
                      <h2 id="music-step-heading" ref={stepHeading} tabIndex={-1}>Choose the music</h2>
                      <p className="muted">Listen to three instrumental arrangements, then pick the one you want to write lyrics for.</p>
                      {!arrangements.length ? (
                        <button className="button button-primary" type="button" disabled={busy || !options?.instrumental_available} onClick={() => void generateArrangements()}>Generate 3 arrangements</button>
                      ) : (
                        <fieldset className="guided-choices">
                          <legend className="visually-hidden">Instrumental arrangements</legend>
                          {arrangements.map(item => (
                            <div className="arrangement-choice" key={item.job_id} data-selected={arrangementId === item.job_id}>
                              <label className="choice-label">
                                <input name="arrangement" type="radio" checked={arrangementId === item.job_id} disabled={busy} onChange={() => { setArrangementId(item.job_id); setFittedLyricId('') }} />
                                <strong>{item.label}</strong>
                              </label>
                              <p className="muted">{formatSeconds(item.output.duration_seconds)} · Instrumental</p>
                              <div className="arrangement-playback">
                                <button className="button button-secondary" type="button" disabled={busy} onClick={() => void listenToOutput(item.output, true)}>Play {item.label}</button>
                                <audio controls preload="none" aria-label={`${item.label} playback`}
                                  ref={node => {
                                    const key = `preview:${item.output.output_id}`
                                    if (node) {
                                      audioElements.current.set(key, node)
                                      const url = audioUrls.current.get(item.output.output_id)?.url
                                      if (url && node.getAttribute('src') !== url) node.src = url
                                      else if (!url && node.hasAttribute('src')) node.removeAttribute('src')
                                    } else audioElements.current.delete(key)
                                  }}
                                  onPlay={event => { for (const audio of audioElements.current.values()) if (audio !== event.currentTarget) audio.pause() }}
                                  onError={() => setErrorMessage('This preview could not play. Select Play to reload it.')}
                                />
                              </div>
                            </div>
                          ))}
                        </fieldset>
                      )}
                      <div className="step-actions">
                        <button className="button button-secondary" type="button" disabled={busy} onClick={() => goToStep('brief')}>Back to brief</button>
                        {arrangements.length > 0 && <button className="button button-primary" type="button" disabled={busy || !selectedArrangement} onClick={() => goToStep('fitted-lyrics')}>Continue to lyrics</button>}
                      </div>
                    </section>
                  )}
                  {section === 'fitted-lyrics' && selectedArrangement && (
                    <section className="guided-step" aria-labelledby="fitted-lyrics-heading">
                      <h2 id="fitted-lyrics-heading" ref={stepHeading} tabIndex={-1}>Choose the lyrics</h2>
                      <p className="muted">Compare rhyming drafts written to fit <strong>{selectedArrangement.label}</strong>.</p>
                      {!lyricAvailable && <p className="notice">Lyric generation is unavailable for this account. You can still listen to instrumental previews.</p>}
                      <label className="check-label">
                        <input type="checkbox" checked={lyricConsent} disabled={busy || !lyricAvailable} onChange={event => setLyricConsent(event.currentTarget.checked)} />
                        I authorize paid Foundry and Content Safety requests for three drafts, including retries. Cost is not estimated here.
                      </label>
                      <button className={`button ${fittedLyrics.length ? 'button-secondary' : 'button-primary'}`} type="button" disabled={busy || !lyricAvailable || !lyricConsent} onClick={() => void generateLyrics(selectedArrangement.job_id)}>
                        {fittedLyrics.length ? 'Generate 3 more lyric drafts' : 'Generate 3 lyric drafts'}
                      </button>
                      {fittedLyrics.length > 0 && (
                        <fieldset className="guided-choices">
                          <legend className="visually-hidden">Lyric drafts for {selectedArrangement.label}</legend>
                          {fittedLyrics.map((option, index) => (
                            <div className="lyric-card" data-selected={fittedLyric?.option_id === option.option_id} key={option.option_id}>
                              <label className="choice-label">
                                <input name="fitted-lyric" type="radio" disabled={busy || option.status !== 'accepted' || !option.output} checked={fittedLyric?.option_id === option.option_id} onChange={() => setFittedLyricId(option.option_id)} />
                                <strong>Draft {index + 1}{option.output ? `: ${option.output.hook}` : ''}</strong>
                              </label>
                              <p className="status-badge">{option.status === 'accepted' ? 'Ready to select' : option.status.replaceAll('_', ' ')}</p>
                              {option.output && <p className="lyric-text">{option.output.lyrics}</p>}
                              {option.reasons.length > 0 && <p className="muted">{option.reasons.map(reason => reason.replaceAll('_', ' ')).join('; ')}</p>}
                            </div>
                          ))}
                        </fieldset>
                      )}
                      <div className="step-actions">
                        <button className="button button-secondary" type="button" disabled={busy} onClick={() => goToStep('arrangements')}>Back to music</button>
                        {fittedLyrics.length > 0 && <button className="button button-primary" type="button" disabled={busy || !fittedLyric} onClick={() => goToStep('finish')}>Continue to voice demo</button>}
                      </div>
                    </section>
                  )}
                  {section === 'finish' && activeBrief && selectedArrangement && fittedLyric?.output && (
                    <section className="guided-step" aria-labelledby="voice-step-heading">
                      <h2 id="voice-step-heading" ref={stepHeading} tabIndex={-1}>Create your voice demo</h2>
                      <p className="muted">Add your selected lyrics to <strong>{selectedArrangement.label}</strong>. This is a demo, not broadcast approval.</p>
                      <div className="estimate-lyric">
                        <h3>{fittedLyric.output.hook}</h3>
                        <p className="lyric-text">{fittedLyric.output.lyrics}</p>
                      </div>
                      <p className="muted">{renderOptionsMessage(options, unresolvedCount, paidStatusUncertain)}</p>
                      <div className="step-actions">
                        <button className="button button-secondary" type="button" disabled={busy} onClick={() => goToStep('fitted-lyrics')}>Back to lyrics</button>
                        <button className="button button-primary" type="button" disabled={busy || !paidAvailable} onClick={() => void estimatePaidRender([activeBrief], fittedLyric, selectedArrangement.job_id)}>Estimate voice demo</button>
                      </div>
                    </section>
                  )}
                  {section === 'brief' && !editingBrief && activeBrief && (
                    <div className="legacy-entry">
                      <button className="workspace-nav-button" type="button" disabled={busy} onClick={() => setSection('lyrics')}>Open advanced lyric tools</button>
                    </div>
                  )}
                  <section className="create-section" hidden={editingBrief || section !== 'lyrics' || !activeBrief} aria-labelledby="lyrics-heading">
                    <div className="section-heading">
                      <div><h2 id="lyrics-heading">Find your hook.</h2><p className="muted">Choose the words, then bring them to life.</p></div>
                      <button className="button button-secondary" type="button" disabled={busy || !activeBrief || !options?.instrumental_available} onClick={() => void renderOffline(activeBrief ? [activeBrief] : [])}>Preview music only</button>
                    </div>
                    <section className="jingle-chat" aria-labelledby="chat-heading" aria-busy={busy}>
                      <h3 id="chat-heading">Make it together.</h3>
                      <p className="muted">Talk through a direction, write a screened draft, then build its music with MCP. Each paid action needs your consent.</p>
                      {!lyricAvailable && <p className="notice">Chat is disabled or unavailable. Enable lyric generation and paid access on the server. Existing accepted lyrics can still build music.</p>}
                      <div role="log" aria-label={`Conversation for ${activeBrief?.name || activeBriefId}`} className="chat-transcript">
                        {!chatSession.messages.length && <p className="chat-prompt">What should listeners feel? Try a warm local welcome, a playful hook, or a more confident delivery.</p>}
                        {chatSession.messages.map((message, index) => <div className="chat-message" data-role={message.role} key={index}><strong>{message.role === 'user' ? 'You' : 'Jingle advisor · MCP suggest_jingle'}</strong><p>{message.content}</p></div>)}
                      </div>
                      <p className="muted chat-help">The latest 12 messages stay in this page, separately for each advertiser. They clear on sign-out or reload. Suggestions are not approved lyrics.</p>
                      <form onSubmit={event => { event.preventDefault(); void chatAction('discuss') }}>
                        <label htmlFor="chat-message">Your message</label>
                        <textarea id="chat-message" value={chatSession.message} maxLength={2000} disabled={busy || !lyricAvailable} onChange={event => updateChat({ message: event.currentTarget.value })} placeholder="Describe the mood, pace, or what you would change." />
                        <label className="check-label">
                          <input type="checkbox" checked={chatConsent} disabled={busy || !lyricAvailable} onChange={event => setChatConsent(event.currentTarget.checked)} />
                          <span>I authorize paid requests for the next chat or lyric action. Foundry and Content Safety costs are not estimated here; lyric writing includes bounded retries.</span>
                        </label>
                        <div><button className="button button-primary" type="submit" disabled={busy || !lyricAvailable || !chatConsent || !chatSession.message.trim()}>Send message</button></div>
                      </form>
                      <div className="chat-direction">
                        <label htmlFor="chat-direction">Creative direction</label>
                        <textarea id="chat-direction" value={chatSession.direction} maxLength={400} disabled={busy || !lyricAvailable} onChange={event => updateChat({ direction: event.currentTarget.value })} placeholder="Use the advisor's suggestion, or write your own direction." />
                        <label htmlFor="chat-product-path">Lyric style</label>
                        <select id="chat-product-path" value={chatSession.productPath} disabled={busy || !lyricAvailable} onChange={event => updateChat({ productPath: event.currentTarget.value === 'vocoded' ? 'vocoded' : 'spoken' })}>
                          <option value="spoken">Spoken · two lines</option><option value="vocoded">Sung demo · four rhyming lines</option>
                        </select>
                        <div><button className="button button-secondary" type="button" disabled={busy || !lyricAvailable || !chatConsent || !chatSession.direction.trim()} onClick={() => void chatAction('write')}>Write a lyric draft</button></div>
                      </div>
                    </section>
                    <h3>Or start with three options.</h3>
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
                      {lyricOptions[activeBriefId]?.filter(option => !option.arrangement_job_id).map((option, index) => (
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
                          {selectedLyric?.option_id === option.option_id && <div className="button-row"><button className="button button-secondary" type="button" disabled={busy} onClick={() => void buildMusicPreview(option)}>Build MCP music preview</button><p className="muted">No cloud requests. Builds once per draft; then add vocals to that exact arrangement in Listen &amp; review.</p></div>}
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
                <button className="button button-primary" type="button" disabled={busy} onClick={() => goToStep('brief')}>Create another version</button>
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
              {!visibleOutputs.length && <div className="empty-state"><h3>No audio in this view yet.</h3><p>Create a version, or choose another run above.</p><button className="button button-secondary" type="button" onClick={() => goToStep('brief')}>Go to Create</button></div>}
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
                      <p className="muted">{output.lyric_source ? `Lyrics: ${output.lyric_source.hook}` : output.composition_source?.label ? `${output.composition_source.label} · No vocals` : 'Original brief script; no selected lyric draft'}</p>
                      {output.composition_source && <p className="muted">Arrangement · {output.composition_source.job_id}</p>}
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
                  const committedSelection = output.composition_source?.option_id
                    ? { brief_id: output.brief_id, option_id: output.composition_source.option_id, job_id: output.composition_source.job_id }
                    : null
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
                      {isInstrumental && committedSelection && <div>
                        <p className="muted">Vocals will use this exact backing and syllable timing. Sung demos use approximate word slicing, not natural singing. Producer listening is required.</p>
                        <button className="button button-primary" type="button" disabled={busy || !paidAvailable} onClick={() => void estimatePaidRender(activeBrief ? [activeBrief] : [], committedSelection, committedSelection.job_id)}>Estimate vocals on this arrangement</button>
                      </div>}
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
                        if (!run.brief_ids.includes(activeBriefId)) inspectBrief(run.brief_ids[0] ?? '')
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
              <p>Review requests below. Granting enables baseline access only; use the permission editor to assign administrator or paid Speech access separately.</p>
              <section aria-labelledby="access-requests-heading">
                <h3 id="access-requests-heading">Pending access requests</h3>
                {adminAccessRequests.length > 0 ? (
                  <ul className="stack">
                    {adminAccessRequests.map((request) => (
                      <li key={request.request_id}>
                        <p>{request.email ? <>Email: {request.email}</> : 'Email unavailable'}</p>
                        <p>Subject: <code>{request.subject}</code></p>
                        <p className="muted">
                          Requested <time dateTime={request.created_at}>{new Date(request.created_at).toLocaleString()}</time>
                        </p>
                        <div className="button-row">
                          <button
                            className="button button-primary"
                            type="button"
                            disabled={busy}
                            aria-label={`Grant access to ${request.subject}`}
                            onClick={() => void decideAccessRequest(request, 'approved')}
                          >
                            Grant
                          </button>
                          <button
                            className="button button-secondary"
                            type="button"
                            disabled={busy}
                            aria-label={`Deny request from ${request.subject}`}
                            onClick={() => void decideAccessRequest(request, 'denied')}
                          >
                            Deny
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted" role="status">No pending access requests.</p>
                )}
              </section>
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
          {Boolean(estimate?.composition_selections?.length) && <p className="notice">Vocals will use the selected arrangement&apos;s exact backing and syllable timing, without recomposing the music. Sung demo quality is approximate.</p>}
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
