import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { IPublicClientApplication } from '@azure/msal-browser'
import { apiBlob, apiJson } from './api'
import { initializeAuth } from './auth'
import type {
  Access,
  Brief,
  EvaluationDraft,
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

type WorkspaceView = 'select-view' | 'status-view' | 'outputs-view' | 'runs-view' | 'admin-view'

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
  const [view, setView] = useState<WorkspaceView>('select-view')
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

      setBriefs(currentBriefs)
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
        postLogoutRedirectUri: window.location.origin,
      })
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
      setView('select-view')
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
    setSelectedBriefIds((current) => {
      const next = new Set(current)
      if (selected) next.add(briefId)
      else next.delete(briefId)
      return next
    })
  }

  async function renderOffline(): Promise<void> {
    if (!client || !config || selectedBriefs.length === 0) return
    const briefIds = selectedBriefs.map((brief) => brief.brief_id)
    await runAction('Rendering instrumental preview', async () => {
      await apiJson<{ run_id: string }>(
        client,
        config,
        '/api/renders',
        apiScopes.render,
        { method: 'POST', body: { brief_ids: briefIds, mode: 'instrumental' } },
      )
      await loadWorkspaceData(client, config)
      setView('outputs-view')
      window.setTimeout(() => comparisonHeading.current?.focus(), 0)
      setAnnouncement(
        'Instrumental preview completed. Select Load protected audio, then press Play. Pending is evaluation status, not render progress.',
      )
    })
  }

  async function estimatePaidRender(): Promise<void> {
    if (!client || !config || selectedBriefs.length === 0 || !paidAvailable) return
    const briefIds = selectedBriefs.map((brief) => brief.brief_id)
    await runAction('Calculating Azure voice estimate', async () => {
      const result = await apiJson<RenderEstimate>(
        client,
        config,
        '/api/renders/estimate',
        apiScopes.render,
        { method: 'POST', body: { brief_ids: briefIds } },
      )
      setEstimate(result)
    })
  }

  async function startPaidRender(confirmedEstimate: RenderEstimate): Promise<void> {
    if (!client || !config || unresolvedCount > 0) return
    await runAction('Starting Azure voice render', async () => {
      setPaidStatusUncertain(true)
      try {
        await apiJson<{ run_id: string }>(
          client,
          config,
          '/api/renders',
          apiScopes.render,
          {
            method: 'POST',
            body: {
              brief_ids: confirmedEstimate.brief_ids,
              mode: 'azure',
              confirmation: {
                brief_ids: confirmedEstimate.brief_ids,
                estimated_cost_usd: confirmedEstimate.estimated_cost_usd,
              },
            },
          },
        )
        await loadWorkspaceData(client, config)
        setView('outputs-view')
        window.setTimeout(() => comparisonHeading.current?.focus(), 0)
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
        setView('select-view')
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
        <div>
          <p className="eyebrow">Local proof of concept</p>
          <h1>Earwyrm Audio Evaluation</h1>
        </div>
        {isSignedIn && (
          <div className="session-panel">
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
          {errorMessage && <p className="alert" role="alert">{errorMessage}</p>}

          {config && config.setup_status !== 'ready' && (
            <section className="panel" aria-labelledby="setup-heading">
              <p className="eyebrow">Configuration</p>
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
              <p className="eyebrow">Secure access</p>
              <h2 id="sign-in-heading">Sign in to your evaluation workspace</h2>
              <p>
                Your audio and evaluation evidence are private to your signed-in account on this local POC.
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
            <nav className="workspace-nav" aria-label="Workspace sections">
              {([
                ['select-view', 'Select briefs'],
                ['status-view', 'Evaluation status'],
                ['outputs-view', 'Rendered variants'],
                ['runs-view', 'Recent runs'],
                ['admin-view', 'Manage access'],
              ] as const).map(([viewId, label]) => (
                <button
                  key={viewId}
                  className="workspace-nav-button"
                  type="button"
                  data-view={viewId}
                  aria-pressed={view === viewId}
                  hidden={viewId === 'admin-view' && !access?.admin}
                  disabled={busy}
                  onClick={() => handleViewChange(viewId)}
                >
                  {label}
                </button>
              ))}
            </nav>

            {unresolvedCount > 0 && (
              <section className="panel" aria-labelledby="reconciliation-heading">
                <p className="eyebrow">Operator evidence</p>
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
              </section>
            )}

            <section
              id="select-view"
              className="panel workspace-view"
              aria-labelledby="brief-heading"
              hidden={view !== 'select-view'}
            >
              <div className="section-heading">
                <div>
                  <p className="eyebrow">1 · Select</p>
                  <h2 id="brief-heading">Choose synthetic briefs</h2>
                </div>
                <p className="muted">Expected answers are not shown before evaluation.</p>
              </div>
              <fieldset disabled={busy}>
                <legend>Select one or more briefs to render</legend>
                <div className="brief-list">
                  {briefs.map((brief) => (
                    <label className="brief-choice" key={brief.brief_id}>
                      <input
                        type="checkbox"
                        value={brief.brief_id}
                        checked={selectedBriefIds.has(brief.brief_id)}
                        onChange={(event) =>
                          updateSelectedBrief(brief.brief_id, event.currentTarget.checked)
                        }
                      />
                      <span>
                        <strong>{brief.name || brief.brief_id}</strong>
                        <span>{brief.description || brief.brief_id}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <p className="muted">
                {selectedBriefIds.size
                  ? `${selectedBriefIds.size} brief${selectedBriefIds.size === 1 ? '' : 's'} selected.`
                  : 'No briefs selected.'}
              </p>
              <div className="button-row">
                <button
                  className="button button-primary"
                  type="button"
                  disabled={busy || selectedBriefIds.size === 0}
                  onClick={() => void renderOffline()}
                >
                  Render instrumental preview
                </button>
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={busy || selectedBriefIds.size === 0 || !paidAvailable}
                  onClick={() => void estimatePaidRender()}
                >
                  Estimate and render Azure voice
                </button>
              </div>
              <p className="notice">
                Instrumental-only output is a workflow preview, not vocal proof. Azure voice rendering stays
                unavailable unless the server is explicitly configured.
              </p>
              <p className="muted">
                {renderOptionsMessage(options, unresolvedCount, paidStatusUncertain)}
              </p>
            </section>

            <section
              id="status-view"
              className="panel workspace-view"
              aria-labelledby="status-heading"
              hidden={view !== 'status-view'}
            >
              <div className="section-heading">
                <div>
                  <p className="eyebrow">2 · Evaluate</p>
                  <h2 id="status-heading">Three-brief evaluation status</h2>
                </div>
                <p className="status-badge" data-status={rollup?.status ?? 'Pending'}>
                  {rollup?.status ?? 'Pending'}
                </p>
              </div>
              <p className="muted">
                Pending means evaluation or evidence is incomplete, not that audio is still rendering.
                Instrumental previews are not vocal proof and remain Pending.
              </p>
              <ul className="status-list">
                {rollup?.briefs.map((brief) => (
                  <li key={brief.brief_id}>
                    {brief.brief_id}: {brief.status} ({brief.outputs.length} output
                    {brief.outputs.length === 1 ? '' : 's'})
                  </li>
                ))}
              </ul>
            </section>

            <section
              id="outputs-view"
              className="panel workspace-view"
              aria-labelledby="comparison-heading"
              hidden={view !== 'outputs-view'}
            >
              <div className="section-heading">
                <div>
                  <p className="eyebrow">3 · Compare</p>
                  <h2 id="comparison-heading" ref={comparisonHeading} tabIndex={-1}>
                    Rendered variants
                  </h2>
                </div>
                <p className="muted">{outputs.length} output{outputs.length === 1 ? '' : 's'}</p>
              </div>
              <p className="muted">
                For each completed output, select Load protected audio, then press Play in its audio controls.
                Evaluation status does not block playback.
              </p>
              <div className="table-wrap">
                <table>
                  <caption>Comparison of your rendered outputs</caption>
                  <thead>
                    <tr>
                      <th scope="col">Brief</th>
                      <th scope="col">Variant</th>
                      <th scope="col">Duration</th>
                      <th scope="col">Numeric gates</th>
                      <th scope="col">Evaluation status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outputs.map((output) => {
                      const brief = briefs.find((item) => item.brief_id === output.brief_id)
                      return (
                        <tr key={output.output_id}>
                          <td>{brief?.name || output.brief_id}</td>
                          <td>{output.variant}</td>
                          <td>{formatSeconds(output.duration_seconds)}</td>
                          <td>{evidenceValue(output.numeric_gates)}</td>
                          <td>{output.status}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="output-list">
                {outputs.map((output) => {
                  const brief = briefs.find((item) => item.brief_id === output.brief_id)
                  const isInstrumental =
                    Number(output.azure_usage.submitted_characters ?? 0) === 0
                  const audioUrl = audioUrls.current.get(output.output_id)?.url
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
                      <h3>{brief?.name || output.brief_id} · {output.variant}</h3>
                      <p className="notice">
                        {isInstrumental
                          ? 'Instrumental-only preview — not vocal proof. Evaluation remains Pending; playback is available.'
                          : 'Azure voice output.'}
                      </p>
                      <p className="status-badge" data-status={output.status}>
                        Evaluation: {output.status}
                      </p>
                      <audio
                        controls
                        preload="none"
                        aria-label={`Play ${brief?.name || output.brief_id}, ${output.variant}`}
                        src={audioUrl}
                        onError={() =>
                          setErrorMessage(
                            'Audio playback failed. Try Load protected audio again, or download the WAV.',
                          )
                        }
                        onEnded={() => releaseAudioUrl(output.output_id)}
                      />
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

            <section
              id="runs-view"
              className="panel workspace-view"
              aria-labelledby="runs-heading"
              hidden={view !== 'runs-view'}
            >
              <p className="eyebrow">Recovery</p>
              <h2 id="runs-heading">Recent render runs</h2>
              <p className="muted">
                Run and paid-attempt status is recovered from the API after a page reload or connection loss.
              </p>
              <ul className="run-list">
                {runs.map((run) => (
                  <li key={run.run_id}>
                    {run.mode} · {run.status} · {run.brief_ids.join(', ')}
                    {run.attempt ? ` · paid attempt ${run.attempt.status}` : ''}
                  </li>
                ))}
              </ul>
            </section>

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
          <p className="eyebrow">Separate spending decision</p>
          <h2 id="estimate-heading">Confirm this Azure voice estimate</h2>
          <p id="estimate-summary">
            {estimate &&
              `Selected briefs: ${estimate.brief_ids
                .map((id) => briefs.find((brief) => brief.brief_id === id)?.name || id)
                .join(', ')}. Estimated total: $${estimate.estimated_cost_usd} USD.`}
          </p>
          <p className="muted">
            Confirmation is bound to these exact briefs and the server-computed estimate. The server will
            re-check both before starting.
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
              onClick={() => estimateDialog.current?.close('confirm')}
            >
              Confirm and render
            </button>
          </div>
        </div>
      </dialog>

      <footer>
        <p>Local-only POC · No deployment, tenant changes, or paid requests are performed automatically.</p>
      </footer>
    </>
  )
}

export default App
