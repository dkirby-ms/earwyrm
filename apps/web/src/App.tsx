import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import type { IPublicClientApplication } from '@azure/msal-browser'
import { ApiError, apiBlob, apiJson } from './api'
import { initializeAuth } from './auth'
import type {
  Access, AccessRequestStatus, AdminAccessRequest, BudgetOverview, EvaluationDraft, JingleHistory, LyricReservation,
  Output, PaidAttempt, PublicConfig, RenderRun, TextBudgetBalance, UserAccess, UserAccessDraft,
} from './types'

const scopes = {
  identity: 'briefs.read', read: 'renders.read', write: 'renders.write',
  output: 'outputs.read', evaluate: 'evaluations.write',
} as const

interface Identity { readonly issuer: string; readonly subject: string }
type View = 'workspace' | 'admin'
const emptyDraft: UserAccessDraft = { issuer: '', subject: '', enabled: false, admin: false, paid_speech: false }
const emptyEvaluation: EvaluationDraft = { brand_transcription: '', cta_transcription: '', self_rating: '' }
const generationSteps = [
  { stage: 'brief', title: 'Check the brief', detail: 'Check the budget and read the business description.', service: 'Earwyrm' },
  { stage: 'lyrics', title: 'Write the lyrics', detail: 'Extract the brand, offer, and call to action; draft lyrics and check the claims.', service: 'Azure OpenAI' },
  { stage: 'safety', title: 'Screen the lyrics', detail: 'Check for harmful content and protected material.', service: 'Azure Content Safety' },
  { stage: 'score', title: 'Compose the score', detail: 'Turn the accepted lyrics into notes and timing.', service: 'Azure OpenAI' },
  { stage: 'backing', title: 'Render the backing track', detail: 'Check the melody and render the instrumental track.', service: 'Earwyrm' },
  { stage: 'voice', title: 'Synthesize the voice', detail: 'Generate one vocal for both versions.', service: 'Azure Speech' },
  { stage: 'mix', title: 'Mix and save two versions', detail: 'Align the voice and save spoken and vocoded WAVs.', service: 'Earwyrm' },
] as const

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

// Keep dollar amounts exact rather than rounding provider decimals through floating point.
function combinedCost(speech: string | null | undefined, ai: string | null | undefined): string | null {
  if (speech == null || ai == null || !/^\d+(?:\.\d+)?$/.test(speech) || !/^\d+(?:\.\d+)?$/.test(ai)) return null
  const places = Math.max(speech.split('.')[1]?.length ?? 0, ai.split('.')[1]?.length ?? 0, 2)
  const units = (amount: string) => {
    const [whole, fraction = ''] = amount.split('.')
    return BigInt(whole + fraction.padEnd(places, '0'))
  }
  const total = (units(speech) + units(ai)).toString().padStart(places + 1, '0')
  return `${total.slice(0, -places)}.${total.slice(-places)}`
}

function App() {
  const [config, setConfig] = useState<PublicConfig | null>(null)
  const [client, setClient] = useState<IPublicClientApplication | null>(null)
  const [accountName, setAccountName] = useState('')
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [access, setAccess] = useState<Access | null>(null)
  const [requestStatus, setRequestStatus] = useState<AccessRequestStatus | null>(null)
  const [history, setHistory] = useState<JingleHistory | null>(null)
  const [historyUncertain, setHistoryUncertain] = useState(false)
  const [description, setDescription] = useState('')
  const [pronunciationHints, setPronunciationHints] = useState('')
  const [generation, setGeneration] = useState<{ status: 'idle' | 'running' | 'failed' | 'done'; step: number; delayed?: boolean }>({ status: 'idle', step: -1 })
  const [adminUsers, setAdminUsers] = useState<readonly UserAccess[]>([])
  const [adminRequests, setAdminRequests] = useState<readonly AdminAccessRequest[]>([])
  const [budget, setBudget] = useState<TextBudgetBalance | null>(null)
  const [adminBudgets, setAdminBudgets] = useState<BudgetOverview | null>(null)
  const [budgetDraft, setBudgetDraft] = useState<{ scope: 'text' | 'speech' | 'user'; owner: string; limit_usd: string } | null>(null)
  const [userDraft, setUserDraft] = useState<UserAccessDraft>(emptyDraft)
  const [evaluations, setEvaluations] = useState<Readonly<Record<string, EvaluationDraft>>>({})
  const [evidence, setEvidence] = useState<Readonly<Record<string, string>>>({})
  const [audioSources, setAudioSources] = useState<Readonly<Record<string, string>>>({})
  const [view, setView] = useState<View>('workspace')
  const [booting, setBooting] = useState(true)
  const [workspaceLoading, setWorkspaceLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const bootStarted = useRef(false)
  const busyRef = useRef(false)
  const audioUrls = useRef(new Map<string, { url: string; timer: number }>())
  const adminHeading = useRef<HTMLHeadingElement>(null)
  const budgetDialog = useRef<HTMLDialogElement>(null)
  const budgetEditing = budgetDraft !== null

  useLayoutEffect(() => {
    const dialog = budgetDialog.current
    if (!dialog) return
    if (budgetEditing) dialog.showModal()
    else if (dialog.open) dialog.close()
  }, [budgetEditing])

  function releaseAudio(outputId: string): void {
    const item = audioUrls.current.get(outputId)
    if (!item) return
    window.clearTimeout(item.timer)
    URL.revokeObjectURL(item.url)
    audioUrls.current.delete(outputId)
    setAudioSources(current => {
      const next = { ...current }
      delete next[outputId]
      return next
    })
  }

  async function refreshHistory(authClient: IPublicClientApplication, publicConfig: PublicConfig): Promise<void> {
    const [result, balance] = await Promise.all([
      apiJson<JingleHistory>(authClient, publicConfig, '/api/jingles', scopes.read),
      apiJson<TextBudgetBalance>(authClient, publicConfig, '/api/budget', scopes.read),
    ])
    setHistory(result)
    setBudget(balance)
    setHistoryUncertain(false)
  }

  async function loadWorkspace(authClient: IPublicClientApplication, publicConfig: PublicConfig): Promise<'ready' | 'access-denied'> {
    setWorkspaceLoading(true)
    try {
      const currentIdentity = await apiJson<Identity>(authClient, publicConfig, '/api/identity', scopes.identity)
      setIdentity(currentIdentity)
      let currentAccess: Access
      try {
        currentAccess = await apiJson<Access>(authClient, publicConfig, '/api/access', scopes.identity)
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 403 || error.message !== 'Application access denied') throw error
        const status = await apiJson<{ status: AccessRequestStatus }>(authClient, publicConfig, '/api/access-requests', scopes.identity)
        setAccess(null)
        setRequestStatus(status.status)
        setAnnouncement(accessRequestAnnouncement(status.status))
        return 'access-denied'
      }
      setAccess(currentAccess)
      setRequestStatus(null)
      setUserDraft(current => ({ ...current, issuer: currentIdentity.issuer }))
      try {
        await refreshHistory(authClient, publicConfig)
      } catch (error) {
        setHistoryUncertain(true)
        throw error
      }
      return 'ready'
    } finally {
      setWorkspaceLoading(false)
    }
  }

  useEffect(() => {
    if (bootStarted.current) return
    bootStarted.current = true
    async function boot(): Promise<void> {
      try {
        const response = await fetch('/api/config', { cache: 'no-store', credentials: 'same-origin' })
        if (!response.ok) throw new Error(`Configuration request failed (${response.status}).`)
        const publicConfig = await response.json() as PublicConfig
        setConfig(publicConfig)
        if (publicConfig.setup_status !== 'ready') return
        const auth = await initializeAuth(publicConfig)
        setClient(auth.client)
        if (!auth.account) return
        setAccountName(auth.account.username || 'Signed-in account')
        const result = await loadWorkspace(auth.client, publicConfig)
        setAnnouncement(result === 'ready' ? 'Signed-in workspace loaded.' : 'Signed in. Request access to continue.')
      } catch (error) {
        setErrorMessage(errorText(error, 'The application could not start.'))
      } finally {
        setBooting(false)
      }
    }
    void boot()
  }, [])

  useEffect(() => {
    const releaseAll = () => {
      for (const item of audioUrls.current.values()) {
        window.clearTimeout(item.timer)
        URL.revokeObjectURL(item.url)
      }
      audioUrls.current.clear()
      setAudioSources({})
    }
    window.addEventListener('pagehide', releaseAll)
    return () => {
      window.removeEventListener('pagehide', releaseAll)
      releaseAll()
    }
  }, [])

  async function runAction(label: string, action: () => Promise<void>): Promise<void> {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setErrorMessage('')
    setAnnouncement(`${label}…`)
    try { await action() }
    catch (error) {
      setErrorMessage(errorText(error, 'The request failed.'))
      setAnnouncement(`${label} failed.`)
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  async function signIn(): Promise<void> {
    if (!client || !config) return
    await runAction('Signing in', async () => {
      const result = await client.loginPopup({ scopes: [`${config.scope_prefix}/${scopes.identity}`] })
      client.setActiveAccount(result.account)
      setAccountName(result.account.username || 'Signed-in account')
      const loaded = await loadWorkspace(client, config)
      setAnnouncement(loaded === 'ready' ? 'Signed-in workspace loaded.' : 'Signed in. Request access to continue.')
    })
  }

  async function signOut(): Promise<void> {
    if (!client) return
    const account = client.getActiveAccount()
    if (!account) return
    await runAction('Signing out', async () => {
      await client.logoutPopup({ account, postLogoutRedirectUri: `${window.location.origin}/auth-callback.html` })
      for (const id of audioUrls.current.keys()) releaseAudio(id)
      client.setActiveAccount(null)
      setAccountName('')
      setIdentity(null)
      setAccess(null)
      setRequestStatus(null)
      setHistory(null)
      setBudget(null)
      setAdminBudgets(null)
      setBudgetDraft(null)
      setHistoryUncertain(false)
      setDescription('')
      setPronunciationHints('')
      setGeneration({ status: 'idle', step: -1 })
      setEvidence({})
      setEvaluations({})
      setAdminUsers([])
      setAdminRequests([])
      setUserDraft(emptyDraft)
      setView('workspace')
      setAnnouncement('Signed out.')
    })
  }

  async function requestAccess(): Promise<void> {
    if (!client || !config) return
    await runAction('Sending access request', async () => {
      const result = await apiJson<{ status: 'pending' | 'already_enabled' }>(client, config, '/api/access-requests', scopes.identity, { method: 'POST' })
      if (result.status === 'already_enabled') {
        await loadWorkspace(client, config)
        setAnnouncement('Application access is ready. Your workspace has loaded.')
      } else {
        setRequestStatus('pending')
        setAnnouncement('Access request submitted. An administrator will review it.')
      }
    })
  }

  async function reloadWorkspace(): Promise<void> {
    if (!client || !config) return
    await runAction('Refreshing workspace', async () => {
      const result = await loadWorkspace(client, config)
      setAnnouncement(result === 'ready' ? 'Application access is ready. Your workspace has loaded.' : 'Access has not been enabled yet. You can return and reload later.')
    })
  }

  async function generate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!client || !config || !history?.estimate || historyUncertain || !description.trim()) return
    await runAction('Generating jingle', async () => {
      const progressId = crypto.randomUUID()
      const controller = new AbortController()
      setGeneration({ status: 'running', step: -1 })
      let lastStep = -1
      let timer: ReturnType<typeof setTimeout>
      const poll = async () => {
        try {
          const { stage } = await apiJson<{ stage: string | null }>(client, config, `/api/jingles/${progressId}/progress`, scopes.read, {
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(4000)]),
            interactive: false,
          })
          if (controller.signal.aborted) return
          const step = generationSteps.findIndex(item => item.stage === stage)
          if (step > lastStep) {
            lastStep = step
            setAnnouncement(`Step ${step + 1} of ${generationSteps.length}: ${generationSteps[step]!.title}.`)
          }
          setGeneration(current => ({ ...current, step: lastStep, delayed: stage === null && lastStep >= 0 }))
        } catch {
          if (!controller.signal.aborted) setGeneration(current => ({ ...current, delayed: true }))
        } finally {
          if (!controller.signal.aborted) timer = setTimeout(() => void poll(), 500)
        }
      }
      timer = setTimeout(() => void poll(), 300)
      let result: RenderRun
      try {
        result = await apiJson<RenderRun>(client, config, '/api/jingles', scopes.write, {
          method: 'POST', body: {
            description: description.trim(), progress_id: progressId,
            ...(pronunciationHints.trim() ? { pronunciation_hints: pronunciationHints.trim() } : {}),
          },
        })
      } catch (error) {
        controller.abort()
        clearTimeout(timer)
        setGeneration(current => ({ ...current, status: 'failed' }))
        let refreshMessage = ''
        try { await refreshHistory(client, config) }
        catch {
          setHistoryUncertain(true)
          refreshMessage = ' Run status could not be refreshed; reload it before generating again.'
        }
        const diagnostic = error instanceof ApiError && error.diagnosticId ? ` Diagnostic ID: ${error.diagnosticId}.` : ''
        throw new Error(`${errorText(error, 'The jingle could not be generated.')} Partial provider calls may be charged. Check history before trying again.${refreshMessage}${diagnostic}`)
      }
      controller.abort()
      clearTimeout(timer)
      setGeneration({ status: 'done', step: generationSteps.length })
      setHistory(current => current ? { ...current, runs: [result, ...current.runs.filter(run => run.run_id !== result.run_id)] } : current)
      setDescription('')
      setPronunciationHints('')
      setAnnouncement('Jingle generated. Review and listen below.')
      try { await refreshHistory(client, config) }
      catch {
        setHistoryUncertain(true)
        setErrorMessage('Jingle generated, but status could not be refreshed. Reload status before generating again.')
      }
    })
  }

  async function reconcile(event: FormEvent<HTMLFormElement>, attempt: PaidAttempt): Promise<void> {
    event.preventDefault()
    if (!client || !config) return
    const form = event.currentTarget
    const data = new FormData(form)
    const ai = String(data.get('ai_actual_cost_usd') ?? '').trim()
    const body = {
      actual_cost_usd: String(data.get('actual_cost_usd') ?? '').trim(),
      evidence_reference: String(data.get('evidence_reference') ?? '').trim(),
      ...(ai ? { ai_actual_cost_usd: ai } : {}),
    }
    await runAction('Recording metered usage', async () => {
      await apiJson(client, config, `/api/attempts/${encodeURIComponent(attempt.attempt_id)}/reconcile`, scopes.write, { method: 'POST', body })
      try { await refreshHistory(client, config) }
      catch {
        setHistoryUncertain(true)
        throw new Error('Usage was recorded, but status could not be refreshed. Reload status before generating again.')
      }
      setAnnouncement('Metered usage was reconciled.')
    })
  }

  async function loadAudio(output: Output): Promise<void> {
    if (!client || !config) return
    await runAction('Loading protected audio', async () => {
      const blob = await apiBlob(client, config, output.audio_url, scopes.output)
      releaseAudio(output.output_id)
      const url = URL.createObjectURL(blob)
      const timer = window.setTimeout(() => releaseAudio(output.output_id), 120_000)
      audioUrls.current.set(output.output_id, { url, timer })
      setAudioSources(current => ({ ...current, [output.output_id]: url }))
      setAnnouncement('Audio is ready. Use the audio controls to play it.')
    })
  }

  async function loadEvidence(output: Output): Promise<void> {
    if (!client || !config) return
    await runAction('Loading protected evidence', async () => {
      const result = await apiJson<unknown>(client, config, output.evidence_url, scopes.output)
      setEvidence(current => ({ ...current, [output.output_id]: JSON.stringify(result, null, 2) }))
      setAnnouncement('Protected evidence loaded.')
    })
  }

  async function submitEvaluation(event: FormEvent<HTMLFormElement>, output: Output): Promise<void> {
    event.preventDefault()
    if (!client || !config) return
    await runAction('Submitting evaluation', async () => {
      await apiJson(client, config, `/api/outputs/${encodeURIComponent(output.output_id)}/evaluation`, scopes.evaluate, {
        method: 'POST', body: evaluations[output.output_id] ?? emptyEvaluation,
      })
      await refreshHistory(client, config)
      setAnnouncement('Evaluation saved.')
    })
  }

  async function loadAdmin(): Promise<void> {
    if (!client || !config) return
    const [users, requests, budgets] = await Promise.all([
      apiJson<{ users: UserAccess[] }>(client, config, '/api/admin/users', scopes.read),
      apiJson<{ requests: AdminAccessRequest[] }>(client, config, '/api/admin/access-requests', scopes.read),
      apiJson<BudgetOverview>(client, config, '/api/admin/budgets', scopes.read),
    ])
    setAdminUsers(users.users)
    setAdminRequests(requests.requests)
    setAdminBudgets(budgets)
  }

  function editBudget(trigger: HTMLButtonElement, scope: 'text' | 'speech' | 'user', limit: string | null, owner = ''): void {
    // Clicks don't focus buttons in every browser; set the native dialog's return target.
    trigger.focus({ preventScroll: true })
    setErrorMessage('')
    setBudgetDraft({ scope, owner, limit_usd: limit ?? '' })
  }

  function cancelBudgetEdit(): void {
    if (busyRef.current) return
    setErrorMessage('')
    setBudgetDraft(null)
  }

  async function saveBudget(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!client || !config || !budgetDraft || busyRef.current) return
    const submitted = budgetDraft.scope === 'user' ? budgetDraft : { scope: budgetDraft.scope, limit_usd: budgetDraft.limit_usd }
    let saved = false
    await runAction('Saving budget limit', async () => {
      await apiJson(client, config, '/api/admin/budgets', scopes.write, { method: 'PUT', body: submitted })
      saved = true
      setAnnouncement('Budget limit saved. Refreshing balances.')
      try {
        await Promise.all([loadAdmin(), refreshHistory(client, config)])
      } catch (error) {
        throw new Error(`The budget limit was saved, but balances could not be refreshed: ${errorText(error, 'Reload to check current balances.')}`)
      }
      setAnnouncement('Budget limit saved. Existing usage has not changed.')
    })
    if (saved) setBudgetDraft(null)
  }

  async function updateLyricReservation(
    event: FormEvent<HTMLFormElement>,
    reservation: LyricReservation,
    action: 'settle' | 'correct' | 'reopen',
  ): Promise<void> {
    event.preventDefault()
    if (!client || !config) return
    const form = event.currentTarget
    const values = new FormData(form)
    const reason = String(values.get('reason') ?? '')
    const body = action === 'reopen' ? { reason } : {
      actual_cost_usd: String(values.get('actual_cost_usd') ?? ''),
      evidence_reference: String(values.get('evidence_reference') ?? ''),
      reason,
    }
    let saved = false
    const label = action === 'settle' ? 'Recording lyric settlement'
      : action === 'correct' ? 'Correcting lyric settlement' : 'Reopening lyric settlement'
    await runAction(label, async () => {
      await apiJson<{ reservation: LyricReservation }>(
        client, config,
        `/api/admin/lyric-reservations/${encodeURIComponent(reservation.reservation_id)}/${action}`,
        scopes.write, { method: 'POST', body },
      )
      saved = true
      setAnnouncement(`${label} saved. Refreshing balances and history.`)
      try { await Promise.all([loadAdmin(), refreshHistory(client, config)]) }
      catch (error) {
        throw new Error(`The lyric settlement was saved, but budget data could not be refreshed: ${errorText(error, 'Reload to check current balances.')}`)
      }
      setAnnouncement('Lyric budget data refreshed.')
    })
    if (saved) form.reset()
  }

  function openAdmin(): void {
    setView('admin')
    window.setTimeout(() => adminHeading.current?.focus(), 0)
    void runAction('Loading application access', async () => {
      await loadAdmin()
      setAnnouncement('Application access loaded.')
    })
  }

  async function decideRequest(request: AdminAccessRequest, decision: 'approved' | 'denied'): Promise<void> {
    if (!client || !config) return
    const label = `${decision === 'approved' ? 'Granting' : 'Denying'} access for ${request.subject}`
    await runAction(label, async () => {
      try {
        await apiJson(client, config, `/api/admin/access-requests/${encodeURIComponent(request.request_id)}/decision`, scopes.write, { method: 'POST', body: { decision } })
      } catch (error) {
        try { await loadAdmin() }
        catch (refreshError) { throw new Error(`The decision failed: ${errorText(error, 'The request could not be decided.')}. The pending request list could not be refreshed: ${errorText(refreshError, 'Refresh failed.')}`) }
        throw error
      }
      await loadAdmin()
      setAnnouncement(decision === 'approved'
        ? `Access granted to ${request.subject}. Baseline application access is enabled. Administrator and paid Speech permissions remain off.`
        : `Access request for ${request.subject} denied.`)
    })
  }

  async function saveUserAccess(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!client || !config) return
    const submitted = { ...userDraft }
    await runAction('Saving user access', async () => {
      await apiJson(client, config, '/api/admin/users', scopes.write, { method: 'PUT', body: submitted })
      if (identity && submitted.issuer === identity.issuer && submitted.subject === identity.subject && (!submitted.enabled || !submitted.admin)) {
        setAdminUsers([])
        setAdminRequests([])
        setAdminBudgets(null)
        setAccess(submitted.enabled ? { ...identity, admin: false, paid_speech: submitted.paid_speech } : null)
        setView('workspace')
        setAnnouncement('Access saved. Your administrator access has been removed.')
        return
      }
      await loadAdmin()
      setAnnouncement('User access saved.')
    })
  }

  const signedIn = Boolean(client && accountName)
  const unresolved = history?.runs.filter(run => run.attempt && run.attempt.status !== 'reconciled') ?? []

  return (
    <>
      <a className="skip-link" href="#main">Skip to main content</a>
      <header className="site-header">
        <a className="wordmark" href="#main" aria-label="Earwyrm home">earwyrm<span>Jingle workspace</span></a>
        {signedIn && <div className="session-panel">
          <nav className="workspace-nav" aria-label="Workspace sections">
            <button className="workspace-nav-button" type="button" aria-pressed={view === 'workspace'} disabled={busy} onClick={() => setView('workspace')}>Workspace</button>
            {access?.admin && <button className="workspace-nav-button" type="button" aria-pressed={view === 'admin'} disabled={busy} onClick={openAdmin}>Manage access</button>}
          </nav>
          <span>{accountName}</span>
          <button className="button button-secondary" type="button" disabled={busy} onClick={() => void signOut()}>Sign out</button>
        </div>}
      </header>
      <main id="main" tabIndex={-1} aria-busy={booting || workspaceLoading}>
        <p className="visually-hidden" aria-live="polite" aria-atomic="true">{announcement}</p>
        {(booting || workspaceLoading) && <p className="loading-message" role="status">Loading your workspace…</p>}
        {busy && !budgetEditing && generation.status !== 'running' && <p className="working-message">{announcement}</p>}
        {errorMessage && !budgetEditing && <p className="alert" role="alert">{errorMessage}</p>}
        {config && config.setup_status !== 'ready' && <section className="panel sign-in-panel">
          <h2>Sign-in setup required</h2>
          <p>{config.setup_status === 'setup-needed' ? 'Configure the existing Entra External ID tenant values on the API, then reload this page.' : 'The API could not validate the External ID configuration. Check the server setup and reload this page.'}</p>
        </section>}
        {config?.setup_status === 'ready' && !signedIn && !booting && <section className="panel sign-in-panel">
          <h1>A few words. Your next jingle.</h1>
          <p>Describe your idea and create an AI-generated music and voice demo.</p>
          <button className="button button-primary" type="button" disabled={busy} onClick={() => void signIn()}>Sign in with Entra External ID</button>
        </section>}
        {identity && !access && !workspaceLoading && <section className="panel sign-in-panel" aria-labelledby="access-heading">
          <h2 id="access-heading">Request access</h2>
          <p>You’re signed in, but this account hasn’t been enabled for Earwyrm. Request access and an administrator will review it.</p>
          {requestStatus === 'pending' && <p className="notice" role="status">Your request is pending review. You can return later.</p>}
          {requestStatus === 'denied' && <p className="alert" role="status">Your request was denied. You can submit a new request if you still need access.</p>}
          {requestStatus === 'approved' && <p className="notice" role="status">Your request was approved. Reload the workspace to continue.</p>}
          {requestStatus === null && <p className="muted" role="status">We couldn’t check your request status. Reload the page to try again.</p>}
          {(requestStatus === 'none' || requestStatus === 'denied') && <button className="button button-primary" type="button" disabled={busy} onClick={() => void requestAccess()}>{requestStatus === 'denied' ? 'Request access again' : 'Request access'}</button>}
          {requestStatus === 'approved' && <button className="button button-primary" type="button" disabled={busy} onClick={() => void reloadWorkspace()}>Reload workspace</button>}
        </section>}
        {signedIn && access && <div id="workspace">
          <div className="jingle-workspace" hidden={view !== 'workspace'}>
            <section className="jingle-create" aria-labelledby="create-heading">
              <div className="jingle-create-banner">
                <div>
                  <h1 id="create-heading">Create a jingle</h1>
                  <p>From a business description to two playable mixes.</p>
                </div>
                <svg viewBox="0 0 165 64" aria-hidden="true" focusable="false">
                  <path d="M2 32h24l10-15 9 29 13-43 13 58 13-39 11 19 10-9h58" />
                </svg>
              </div>
              <div className="jingle-create-grid">
              <form onSubmit={event => void generate(event)}>
                <label htmlFor="description">Describe your jingle</label>
                <p id="description-help" className="description-help">Include the business or product name and the sound you want. Add an offer or a call to action if you have one.</p>
                <textarea id="description" value={description} onChange={event => setDescription(event.currentTarget.value)} maxLength={400} required disabled={busy} placeholder="An upbeat jingle for Cedar Loop Bike Repair, with a bright synth hook for spring tune-ups." aria-describedby="description-help" />
                <p className="character-count">{description.length} / 400 characters</p>
                <details>
                  <summary>Brand pronunciation hints (optional)</summary>
                  <label htmlFor="pronunciation-hints">Pronunciation hints</label>
                  <p id="pronunciation-help" className="description-help">For an unfamiliar brand word, use familiar words to check its syllables: zyvox = zee fox. One hint per line. Your lyrics keep the original spelling; listen to check the voice pronunciation.</p>
                  <textarea id="pronunciation-hints" value={pronunciationHints} onChange={event => setPronunciationHints(event.currentTarget.value)} maxLength={2000} disabled={busy} aria-describedby="pronunciation-help" rows={2} />
                </details>
                {budget && <>
                  <p className="budget-balance">Lifetime allowance: ${budget.limit_usd}. Charged or reserved: ${budget.charged_usd}. Remaining: ${budget.remaining_usd}. Contact an administrator to adjust your allowance.</p>
                  <p className="budget-balance">Lyric reserve: ${budget.lyric_reserved_usd}. Administrator-recorded verified lyric actual: ${budget.lyric_actual_usd}.</p>
                  <p className="muted">Pending lyric reservations continue to count against your allowance until attributable billing evidence supports an actual cost.</p>
                </>}
                {history?.estimate && <div className="estimate-summary">
                  <strong>Maximum estimated cost: ${history.estimate.total_max_usd}</strong>
                  <p>AI and safety: ${history.estimate.model_and_safety_max_usd} · Speech: ${history.estimate.speech_max_usd}. Hosting is not included.</p>
                  <p>Generate starts paid provider calls. Actual charges may differ.</p>
                </div>}
                {history?.unavailable_reason && <p className="notice" role="status">Generation unavailable: {history.unavailable_reason}</p>}
                {historyUncertain && <p className="notice" role="status">Run status is unavailable. Reload status before generating.</p>}
                <div className="button-row">
                  <button className="button button-primary" type="submit" disabled={busy || !description.trim() || !history?.estimate || Boolean(history.unavailable_reason) || historyUncertain}>Generate jingle</button>
                  {historyUncertain && <button className="button button-secondary" type="button" disabled={busy} onClick={() => void reloadWorkspace()}>Reload status</button>}
                </div>
              </form>
              <section className="generation-flow" aria-labelledby="generation-flow-heading">
                <h2 id="generation-flow-heading">How your jingle gets made</h2>
                <p className="generation-summary">
                  {generation.status === 'idle' && 'Steps light up as the server reports progress.'}
                  {generation.status === 'running' && (generation.delayed ? 'Live updates are temporarily unavailable.' : generation.step < 0 ? 'Waiting for the server to start.' : `Step ${generation.step + 1} of ${generationSteps.length}`)}
                  {generation.status === 'failed' && 'Generation did not complete. Check the message above before trying again.'}
                  {generation.status === 'done' && 'Both mixes are ready in Your jingles.'}
                </p>
                <ol role="list" aria-labelledby="generation-flow-heading" className="generation-steps">
                  {generationSteps.map((step, index) => {
                    const state = index < generation.step ? 'complete'
                      : index === generation.step && generation.status === 'running' && !generation.delayed ? 'active'
                        : index === generation.step ? 'last' : 'waiting'
                    return <li key={step.stage} data-state={state} aria-current={state === 'active' ? 'step' : undefined}>
                      <span className="generation-number" aria-hidden="true">{index + 1}</span>
                      <div>
                        <h3>{step.title}</h3>
                        <p>{step.detail}</p>
                        <span className="generation-service">{step.service}</span>
                      </div>
                      {state !== 'waiting' && <span className="generation-label">{state === 'active' ? 'In progress' : state === 'complete' ? 'Done' : 'Last reported'}</span>}
                    </li>
                  })}
                </ol>
              </section>
              </div>
            </section>
            {unresolved.length > 0 && <section className="jingle-reconciliation" aria-labelledby="reconciliation-heading">
              <h2 id="reconciliation-heading">Usage awaiting reconciliation</h2>
              <p>Record provider billing evidence for each unresolved attempt. Do not retry an uncertain attempt.</p>
              {unresolved.map(run => {
                const attempt = run.attempt!
                return <details key={attempt.attempt_id}>
                  <summary>Attempt {attempt.attempt_id} · {attempt.status}</summary>
                  <p>Speech estimate: ${attempt.estimated_cost_usd}</p>
                  <form onSubmit={event => void reconcile(event, attempt)}>
                    <label>Actual Speech cost in USD<input type="text" inputMode="decimal" name="actual_cost_usd" maxLength={64} required disabled={busy} /></label>
                    <label>Billing evidence reference<input type="text" name="evidence_reference" maxLength={500} required disabled={busy} /></label>
                    {attempt.jingle_estimate && <label>Verified AI services cost in USD (optional)<input type="text" inputMode="decimal" name="ai_actual_cost_usd" maxLength={64} disabled={busy} /></label>}
                    <button className="button button-secondary" type="submit" disabled={busy}>Record reconciliation</button>
                  </form>
                </details>
              })}
            </section>}
            <section className="jingle-history" aria-labelledby="history-heading">
              <h2 id="history-heading">Your jingles</h2>
              {!history && <p className="muted">History is unavailable until status is loaded.</p>}
              {history && history.runs.length === 0 && <p className="muted">Your generated jingles will appear here, ready to listen to and review.</p>}
              {history?.runs.map(run => {
                const attempt = run.attempt
                const total = combinedCost(attempt?.actual_cost_usd, attempt?.jingle_ai_actual_cost_usd)
                const isJingle = run.mode === 'jingle' || Boolean(attempt?.jingle_estimate)
                const playable = isJingle ? [...(run.outputs ?? [])].filter(output => output.variant === 'spoken' || output.variant === 'vocoded').sort((a, b) => Number(a.variant !== 'spoken') - Number(b.variant !== 'spoken')) : []
                return <article className="jingle-run" key={run.run_id}>
                  <div className="run-heading">
                    <h3>{isJingle ? 'Jingle' : 'Earlier Speech attempt'}</h3>
                    {run.created_at && <time dateTime={run.created_at}>{new Date(run.created_at).toLocaleString()}</time>}
                  </div>
                  {run.status !== 'completed' && <p className="muted">{run.status === 'rendering' ? 'Generation in progress' : 'Generation failed or could not be confirmed'}</p>}
                  {attempt?.jingle_estimate && <p className="run-cost">Estimated max: ${attempt.jingle_estimate.total_max_usd} · Speech estimate after generation: ${attempt.estimated_cost_usd}</p>}
                  {attempt && <p className="run-cost">Actual cost: {total === null ? 'Pending or unknown' : `$${total} (AI services and Speech; hosting excluded)`}</p>}
                  {attempt && total === null && attempt.actual_cost_usd != null && <p className="run-cost">Recorded Speech cost: ${attempt.actual_cost_usd}{isJingle ? ' · AI service charges not recorded' : ''}</p>}
                  {isJingle && playable.length === 0 && <p className="muted">No audio is available for this run.</p>}
                  {playable.map(output => <div className="jingle-output" key={output.output_id}>
                    <h4>{output.variant === 'spoken' ? 'Voice and music' : 'Vocoded voice and music'}</h4>
                    <div className="output-playback">
                      <button className="button button-secondary" type="button" disabled={busy} onClick={() => void loadAudio(output)}>{audioSources[output.output_id] ? 'Reload protected audio' : 'Load protected audio'}</button>
                      {audioSources[output.output_id] && <audio controls src={audioSources[output.output_id]} aria-label={`${output.variant} audio for ${run.run_id}`} />}
                    </div>
                    <details>
                      <summary>Review and evidence</summary>
                      <p>AI-generated demo; human review is required before broadcast.</p>
                      {output.lyric_source && <p className="lyric-text">{output.lyric_source.lyrics}</p>}
                      <p>Review status: {output.status}</p>
                      <button className="button button-secondary" type="button" disabled={busy} onClick={() => void loadEvidence(output)}>Load protected evidence</button>
                      {evidence[output.output_id] && <pre>{evidence[output.output_id]}</pre>}
                      <form onSubmit={event => void submitEvaluation(event, output)}>
                        <label>Brand transcription<input type="text" required value={(evaluations[output.output_id] ?? emptyEvaluation).brand_transcription} onChange={event => { const value = event.currentTarget.value; setEvaluations(current => ({ ...current, [output.output_id]: { ...emptyEvaluation, ...current[output.output_id], brand_transcription: value } })) }} disabled={busy} /></label>
                        <label>Call to action transcription<input type="text" required value={(evaluations[output.output_id] ?? emptyEvaluation).cta_transcription} onChange={event => { const value = event.currentTarget.value; setEvaluations(current => ({ ...current, [output.output_id]: { ...emptyEvaluation, ...current[output.output_id], cta_transcription: value } })) }} disabled={busy} /></label>
                        <label>Self rating<select required value={(evaluations[output.output_id] ?? emptyEvaluation).self_rating} onChange={event => { const value = event.currentTarget.value; setEvaluations(current => ({ ...current, [output.output_id]: { ...emptyEvaluation, ...current[output.output_id], self_rating: value } })) }} disabled={busy}><option value="">Select a rating</option><option value="usable with minor edits">Usable with minor edits</option><option value="usable with major edits">Usable with major edits</option><option value="not usable">Not usable</option></select></label>
                        <button className="button button-secondary" type="submit" disabled={busy}>Save review</button>
                      </form>
                    </details>
                  </div>)}
                </article>
              })}
            </section>
          </div>
          <section className="panel workspace-view" aria-labelledby="admin-heading" hidden={view !== 'admin' || !access.admin}>
            <h2 id="admin-heading" ref={adminHeading} tabIndex={-1}>Manage application access</h2>
            <p>Granting enables baseline access. Jingle generation also depends on service and budget settings. Paid Speech access applies only to legacy endpoints.</p>
            <section className="budget-admin" aria-labelledby="budgets-heading">
              <div className="section-heading">
                <h3 id="budgets-heading">Budgets and usage</h3>
                <button className="button button-secondary" type="button" disabled={busy} onClick={() => void runAction('Refreshing budgets', loadAdmin)}>Refresh budgets</button>
              </div>
              <p>All amounts are USD. Limits are lifetime totals, not additional credits. Lowering a limit never removes usage; zero stops new spending.</p>
              {adminBudgets ? <>
                <dl className="budget-summary">
                  <div><dt>Shared AI and safety</dt><dd>Limit: {adminBudgets.text.limit_usd === null ? 'Not configured' : `$${adminBudgets.text.limit_usd}`}. Charged or reserved: ${adminBudgets.text.charged_usd}. Remaining: {adminBudgets.text.remaining_usd === null ? 'Unavailable' : `$${adminBudgets.text.remaining_usd}`}.</dd>
                    <dd>Lyric reserve: ${adminBudgets.text.lyric_reserved_usd}. Administrator-recorded verified lyric actual: ${adminBudgets.text.lyric_actual_usd}.</dd>
                    <dd><button className="button button-secondary" type="button" aria-haspopup="dialog" disabled={busy} onClick={event => editBudget(event.currentTarget, 'text', adminBudgets.text.limit_usd)}>Edit AI budget</button></dd></div>
                  <div><dt>Shared Speech</dt><dd>Limit: {adminBudgets.speech.limit_usd === null ? 'Not configured' : `$${adminBudgets.speech.limit_usd}`}. Charged or reserved: ${adminBudgets.speech.charged_usd}. Remaining: {adminBudgets.speech.remaining_usd === null ? 'Unavailable' : `$${adminBudgets.speech.remaining_usd}`}.</dd>
                    <dd><button className="button button-secondary" type="button" aria-haspopup="dialog" disabled={busy} onClick={event => editBudget(event.currentTarget, 'speech', adminBudgets.speech.limit_usd)}>Edit Speech budget</button></dd></div>
                </dl>
                <p>Recorded actual charges: Speech ${adminBudgets.actuals.speech_usd}; AI and safety ${adminBudgets.actuals.ai_usd}. Speech attempts awaiting reconciliation: {adminBudgets.actuals.unreconciled_speech_attempts}.</p>
                <p className="muted">Lyric actuals are recorded from administrator-provided evidence; Earwyrm does not fetch Azure billing data. Score calls remain reserved. Full-jingle AI actuals are listed separately and are not added to lyric actuals. Unattributed text amount counted toward the shared AI budget: ${adminBudgets.unattributed_text_usd}.</p>
                <section aria-labelledby="lyric-reservations-heading">
                  <h4 id="lyric-reservations-heading">Lyric reservations</h4>
                  <p>Keep entries pending when cost cannot be attributed. Settlement records evidence and a reason; corrections and reopenings remain in the history.</p>
                  {adminBudgets.lyric_reservations.length === 0
                    ? <p className="muted">No lyric reservations have been recorded.</p>
                    : <ul className="lyric-reservation-list">{adminBudgets.lyric_reservations.map(reservation => <li key={reservation.reservation_id}>
                      <p className="lyric-reservation-summary">
                        <strong>{reservation.settlement_status === 'pending' ? 'Pending' : 'Settled'}</strong>
                        {' · '}{reservation.action}{' · '}<code>{reservation.reservation_id}</code>
                        {' · '}{reservation.owner === null ? 'Unattributed legacy reservation' : `Owner ${reservation.owner}`}
                        {' · '}Reserved ${reservation.reserved_usd}
                        {reservation.actual_cost_usd !== null && <> · Administrator-recorded actual ${reservation.actual_cost_usd}</>}
                        {' · '}Created <time dateTime={reservation.created_at}>{new Date(reservation.created_at).toLocaleString()}</time>
                      </p>
                      {reservation.events.length > 0 && <details className="lyric-reservation-history">
                        <summary>Transition history ({reservation.events.length})</summary>
                        <ol>{reservation.events.map(item => <li key={item.event_id}>
                          <p><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString()}</time>
                            {' · '}{item.event_type} by <code>{item.actor_subject}</code>
                            {' · '}{item.previous_status === 'pending' ? `Previous hold: $${reservation.reserved_usd}` : `Previous actual: $${item.previous_actual_usd}`}
                            {' · '}{item.new_status === 'pending' ? `Current hold: $${reservation.reserved_usd}` : `Current actual: $${item.new_actual_usd}`}</p>
                          <p>{item.reason}{item.evidence_reference ? ` · Evidence: ${item.evidence_reference}` : ''}</p>
                        </li>)}</ol>
                      </details>}
                      {reservation.settlement_status === 'pending'
                        ? <form className="lyric-settlement-form" aria-label={`Settle lyric reservation ${reservation.reservation_id}`} onSubmit={event => void updateLyricReservation(event, reservation, 'settle')}>
                          <label>Verified actual lyric cost (USD)<input name="actual_cost_usd" type="text" inputMode="decimal" pattern="[0-9]+(\.[0-9]+)?" maxLength={64} required disabled={busy} /></label>
                          <label>Billing evidence reference<input name="evidence_reference" type="text" maxLength={500} required disabled={busy} /></label>
                          <label>Settlement reason<input name="reason" type="text" maxLength={1000} required disabled={busy} /></label>
                          <button className="button button-secondary" type="submit" disabled={busy}>Record verified lyric cost</button>
                        </form>
                        : <div className="lyric-settlement-actions">
                          <form className="lyric-settlement-form" aria-label={`Correct lyric reservation ${reservation.reservation_id}`} onSubmit={event => void updateLyricReservation(event, reservation, 'correct')}>
                            <label>Corrected actual lyric cost (USD)<input name="actual_cost_usd" type="text" inputMode="decimal" pattern="[0-9]+(\.[0-9]+)?" maxLength={64} required disabled={busy} /></label>
                            <label>Replacement billing evidence reference<input name="evidence_reference" type="text" maxLength={500} required disabled={busy} /></label>
                            <label>Correction reason<input name="reason" type="text" maxLength={1000} required disabled={busy} /></label>
                            <button className="button button-secondary" type="submit" disabled={busy}>Correct recorded cost</button>
                          </form>
                          <form className="lyric-settlement-form" aria-label={`Reopen lyric reservation ${reservation.reservation_id}`} onSubmit={event => void updateLyricReservation(event, reservation, 'reopen')}>
                            <label>Reopening reason<input name="reason" type="text" maxLength={1000} required disabled={busy} /></label>
                            <button className="button button-secondary" type="submit" disabled={busy}>Reopen reservation</button>
                          </form>
                        </div>}
                    </li>)}</ul>}
                </section>
                <h4>User lifetime allowances</h4>
                <p>Users start with a $5 trial allowance shared across paid features. Existing attributable usage counts. Allowances do not reset automatically.</p>
                <ul className="stack budget-users">{adminBudgets.users.map(user => <li key={`${user.issuer}:${user.subject}`}>
                  <p><code>{user.subject}</code>: limit ${user.limit_usd}; charged or reserved ${user.charged_usd}; remaining ${user.remaining_usd}; lyric reserve ${user.lyric_reserved_usd}; verified lyric actual ${user.lyric_actual_usd}.</p>
                  <button className="button button-secondary" type="button" aria-haspopup="dialog" disabled={busy} onClick={event => editBudget(event.currentTarget, 'user', user.limit_usd, user.subject)}>Edit budget for {user.subject}</button>
                </li>)}</ul>
              </> : <p role="status">Budget data has not loaded. Use Refresh budgets to retry.</p>}
              <dialog
                ref={budgetDialog}
                aria-labelledby="budget-dialog-title"
                aria-describedby="budget-limit-target"
                onCancel={event => { event.preventDefault(); cancelBudgetEdit() }}
                onKeyDown={event => {
                  if (event.key === 'Escape' && !event.nativeEvent.isComposing && !event.defaultPrevented) {
                    event.preventDefault()
                    cancelBudgetEdit()
                  }
                }}
              >
                {budgetDraft && <div className="dialog-content">
                  <h4 id="budget-dialog-title">Edit budget limit</h4>
                  <p id="budget-limit-target" className="budget-target">Editing: {budgetDraft.scope === 'user' ? `Lifetime allowance for ${budgetDraft.owner}` : budgetDraft.scope === 'text' ? 'Shared AI and safety' : 'Shared Speech'}</p>
                  <form className="budget-limit-form" onSubmit={event => void saveBudget(event)}>
                    <label>Budget limit (USD)<input type="text" inputMode="decimal" pattern="[0-9]{1,8}(\.[0-9]{1,12})?" maxLength={21} required readOnly={busy} value={budgetDraft.limit_usd} aria-describedby="budget-limit-help" onChange={event => setBudgetDraft({ ...budgetDraft, limit_usd: event.currentTarget.value })} /></label>
                    <p id="budget-limit-help">Enter the new total limit, for example 5 or 10.50. Raising a shared limit does not enable disabled services or change per-action caps.</p>
                    {busy && <p role="status">{announcement}</p>}
                    {errorMessage && <p className="alert" role="alert">{errorMessage}</p>}
                    <div className="button-row">
                      <button className="button button-primary" type="submit" aria-disabled={busy}>Save budget limit</button>
                      <button className="button button-secondary" type="button" aria-disabled={busy} onClick={cancelBudgetEdit}>Cancel</button>
                    </div>
                  </form>
                </div>}
              </dialog>
            </section>
            <section aria-labelledby="access-requests-heading">
              <h3 id="access-requests-heading">Pending access requests</h3>
              {adminRequests.length ? <ul className="stack">{adminRequests.map(request => <li key={request.request_id}>
                <p>{request.email ? <>Email: {request.email}</> : 'Email unavailable'}</p>
                <p>Subject: <code>{request.subject}</code></p>
                <p className="muted">Requested <time dateTime={request.created_at}>{new Date(request.created_at).toLocaleString()}</time></p>
                <div className="button-row">
                  <button className="button button-primary" type="button" disabled={busy} aria-label={`Grant access to ${request.subject}`} onClick={() => void decideRequest(request, 'approved')}>Grant</button>
                  <button className="button button-secondary" type="button" disabled={busy} aria-label={`Deny request from ${request.subject}`} onClick={() => void decideRequest(request, 'denied')}>Deny</button>
                </div>
              </li>)}</ul> : <p className="muted" role="status">No pending access requests.</p>}
            </section>
            <h3>Current users</h3>
            <ul className="stack">{adminUsers.map(user => <li key={`${user.issuer}:${user.subject}`}>
              <span>{user.subject}: {user.enabled ? 'enabled' : 'disabled'}, {user.admin ? 'administrator' : 'not administrator'}, {user.paid_speech ? 'paid Speech allowed' : 'paid Speech denied'}</span>
              <button className="button button-secondary" type="button" disabled={busy} onClick={() => setUserDraft({ ...user })}>Edit {user.subject}</button>
            </li>)}</ul>
            <h3>Set user access</h3>
            <form onSubmit={event => void saveUserAccess(event)}>
              <label>Verified issuer<input type="text" maxLength={1024} required readOnly disabled={busy} value={userDraft.issuer} /></label>
              <label>Verified subject<input type="text" maxLength={1024} aria-describedby="subject-help" required disabled={busy} value={userDraft.subject} onChange={event => { const subject = event.currentTarget.value; setUserDraft(current => ({ ...current, subject, enabled: false, admin: false, paid_speech: false })) }} /></label>
              <p id="subject-help" className="muted">Changing the subject clears selected permissions.</p>
              <fieldset disabled={busy}>
                <legend>Application permissions</legend>
                <label><input type="checkbox" checked={userDraft.enabled} onChange={event => { const enabled = event.currentTarget.checked; setUserDraft(current => ({ ...current, enabled })) }} />Enabled</label>
                <label><input type="checkbox" checked={userDraft.admin} onChange={event => { const admin = event.currentTarget.checked; setUserDraft(current => ({ ...current, admin })) }} />Administrator</label>
                <label><input type="checkbox" checked={userDraft.paid_speech} onChange={event => { const paid_speech = event.currentTarget.checked; setUserDraft(current => ({ ...current, paid_speech })) }} />Paid Speech access</label>
              </fieldset>
              <button className="button button-primary" type="submit" disabled={busy}>Save user access</button>
            </form>
          </section>
        </div>}
      </main>
    </>
  )
}

export default App
