import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { AccessRequestStatus, JingleHistory } from './types'

type MockLyricEvent = {
  event_id: string
  reservation_id: string
  event_type: 'settled' | 'corrected' | 'reopened'
  previous_status: 'pending' | 'settled'
  new_status: 'pending' | 'settled'
  previous_actual_usd: string | null
  new_actual_usd: string | null
  actor_issuer: string
  actor_subject: string
  evidence_reference: string | null
  reason: string
  created_at: string
}
type MockLyricReservation = {
  reservation_id: string
  action: 'discuss' | 'write' | 'options'
  owner: string | null
  reserved_usd: string
  settlement_status: 'pending' | 'settled'
  actual_cost_usd: string | null
  evidence_reference: string | null
  settled_by: { issuer: string; subject: string } | null
  settled_at: string | null
  created_at: string
  events: MockLyricEvent[]
}

// jsdom does not implement dialog methods; native keyboard behavior is checked in the browser.
const dialogTriggers = new WeakMap<HTMLDialogElement, HTMLElement>()
Object.defineProperties(HTMLDialogElement.prototype, {
  showModal: { configurable: true, value(this: HTMLDialogElement) {
    const active = document.activeElement
    if (active instanceof HTMLElement) dialogTriggers.set(this, active)
    this.open = true
    this.querySelector('input')?.focus()
  } },
  close: { configurable: true, value(this: HTMLDialogElement) {
    this.open = false
    dialogTriggers.get(this)?.focus()
  } },
})

const account = { homeAccountId: 'home', environment: 'example.test', tenantId: 'tenant', username: 'operator@example.test', localAccountId: 'local' }
const estimate = { model_and_safety_max_usd: '0.03', speech_max_usd: '0.02', total_max_usd: '0.05' }
const output = {
  output_id: 'output-1', run_id: 'run-1', brief_id: 'brief-1', variant: 'spoken',
  duration_seconds: 12, render_seconds: 1, numeric_gates: {}, components: [],
  azure_usage: {}, evaluation: null, status: 'Pending',
  audio_url: '/api/outputs/output-1/audio', evidence_url: '/api/outputs/output-1/evidence',
}
const run = {
  run_id: 'run-1', mode: 'azure', brief_ids: ['brief-1'], status: 'completed',
  created_at: '2026-11-18T12:00:00Z', outputs: [output],
  attempt: { attempt_id: 'attempt-1', status: 'awaiting_reconciliation', estimated_cost_usd: '0.02', actual_cost_usd: null, jingle_estimate: estimate, jingle_ai_actual_cost_usd: null },
}

function installMocks(options: {
  denied?: boolean
  status?: AccessRequestStatus
  admin?: boolean
  history?: JingleHistory
  failDecision?: boolean
  failGenerate?: boolean
  waitForGeneration?: Promise<void>
  progressStage?: () => string | null
  failRefreshAfterGenerate?: boolean
  email?: string | null
  failBudgetSave?: boolean
  failBudgetLoad?: boolean
  failLyricAction?: boolean
} = {}) {
  let denied = Boolean(options.denied)
  let status = options.status ?? 'none'
  let history: JingleHistory = options.history ?? { estimate, unavailable_reason: null, runs: [] }
  let generated = false
  let requests = [{ request_id: 'request-1', subject: 'requester-1', email: options.email === undefined ? 'requester@example.test' : options.email, created_at: '2026-11-18T12:00:00Z' }]
  const users = [
    { issuer: 'https://identity.example.test/tenant/v2.0', subject: 'existing-user', enabled: true, admin: true, paid_speech: true },
    { issuer: 'https://identity.example.test/tenant/v2.0', subject: 'current-user', enabled: true, admin: true, paid_speech: true },
  ]
  const balance = {
    limit_usd: '5', charged_usd: '1.25', remaining_usd: '3.75',
    lyric_reserved_usd: '0.62', lyric_actual_usd: '0.05',
  }
  const lyricReservations: MockLyricReservation[] = [
    {
      reservation_id: 'reservation-pending', action: 'write', owner: 'current-user', reserved_usd: '0.62',
      settlement_status: 'pending', actual_cost_usd: null, evidence_reference: null, settled_by: null, settled_at: null,
      created_at: '2026-11-18T12:00:00Z', events: [],
    },
    {
      reservation_id: 'reservation-settled', action: 'discuss', owner: 'current-user', reserved_usd: '0.2',
      settlement_status: 'settled', actual_cost_usd: '0.05', evidence_reference: 'TEST-ONLY verified reference',
      settled_by: { issuer: users[0]!.issuer, subject: 'current-user' }, settled_at: '2026-11-18T12:30:00Z',
      created_at: '2026-11-18T11:00:00Z', events: [{
        event_id: 'event-settled', reservation_id: 'reservation-settled', event_type: 'settled',
        previous_status: 'pending', new_status: 'settled', previous_actual_usd: null, new_actual_usd: '0.05',
        actor_issuer: users[0]!.issuer, actor_subject: 'current-user',
        evidence_reference: 'TEST-ONLY verified reference', reason: 'Verified lyric cost',
        created_at: '2026-11-18T12:30:00Z',
      }],
    },
  ]
  const budgets = {
    text: { limit_usd: '20', charged_usd: '1', remaining_usd: '19', lyric_reserved_usd: '0.62', lyric_actual_usd: '0.05' },
    speech: { limit_usd: '10', charged_usd: '0.25', remaining_usd: '9.75' },
    actuals: { speech_usd: '0.1', ai_usd: '0', unreconciled_speech_attempts: 1 },
    unattributed_text_usd: '0.5',
    lyric_reservations: lyricReservations,
    users: users.map(user => ({ issuer: user.issuer, subject: user.subject, ...balance })),
  }
  const logoutPopup = vi.fn(async () => undefined)
  class Client {
    activeAccount: typeof account | null = null
    initialize = vi.fn(async () => undefined)
    handleRedirectPromise = vi.fn(async () => null)
    getActiveAccount = () => this.activeAccount
    getAllAccounts = () => this.activeAccount ? [this.activeAccount] : []
    setActiveAccount = (next: typeof account | null) => { this.activeAccount = next }
    loginPopup = vi.fn(async () => ({ account }))
    logoutPopup = logoutPopup
    acquireTokenSilent = vi.fn(async () => ({ accessToken: 'test-access-token' }))
    acquireTokenPopup = vi.fn(async () => ({ accessToken: 'test-access-token' }))
  }
  Object.defineProperty(window, 'msal', { configurable: true, value: {
    PublicClientApplication: Client, BrowserCacheLocation: { SessionStorage: 'sessionStorage' },
    InteractionRequiredAuthError: class extends Error {},
  } })
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), window.location.origin).pathname
    if (path === '/api/config') return Response.json({ setup_status: 'ready', client_id: 'client', authority: 'https://identity.example.test/tenant', scope_prefix: 'api://service' })
    if (path === '/api/identity') return Response.json({ issuer: users[0]!.issuer, subject: 'current-user' })
    if (path === '/api/access') {
      if (denied) return Response.json({ detail: 'Application access denied' }, { status: 403 })
      return Response.json({ issuer: users[0]!.issuer, subject: 'current-user', admin: options.admin !== false, paid_speech: false })
    }
    if (path === '/api/budget') return Response.json(balance)
    if (path === '/api/admin/budgets') {
      if (init?.method === 'PUT') {
        if (options.failBudgetSave) return Response.json({ detail: 'Administrator access is required' }, { status: 403 })
        const body = JSON.parse(String(init.body)) as { scope: 'user' | 'text' | 'speech'; owner?: string; limit_usd: string }
        const target = body.scope === 'user' ? budgets.users.find(user => user.subject === body.owner)! : budgets[body.scope]
        target.limit_usd = body.limit_usd
        return Response.json({ status: 'updated' })
      }
      if (options.failBudgetLoad) return Response.json({ detail: 'Persistent storage is unavailable' }, { status: 503 })
      return Response.json(budgets)
    }
    if (/^\/api\/admin\/lyric-reservations\/[^/]+\/(?:settle|correct|reopen)$/.test(path)) {
      if (options.failLyricAction) return Response.json({ detail: 'Billing evidence could not be verified' }, { status: 409 })
      const [, , , , reservationId, action] = path.split('/')
      const reservation = lyricReservations.find(item => item.reservation_id === reservationId)
      if (!reservation) return Response.json({ detail: 'Lyric reservation was not found' }, { status: 404 })
      const body = JSON.parse(String(init?.body)) as { actual_cost_usd?: string; evidence_reference?: string; reason: string }
      const previousStatus = reservation.settlement_status
      const previousActual = reservation.actual_cost_usd
      const oldEffective = previousStatus === 'pending' ? Number(reservation.reserved_usd) : Number(previousActual)
      if (action === 'settle' || action === 'correct') {
        reservation.settlement_status = 'settled'
        reservation.actual_cost_usd = body.actual_cost_usd ?? '0'
        reservation.evidence_reference = body.evidence_reference ?? null
        reservation.settled_by = { issuer: users[0]!.issuer, subject: 'current-user' }
        reservation.settled_at = new Date().toISOString()
      } else {
        reservation.settlement_status = 'pending'
        reservation.actual_cost_usd = null
        reservation.evidence_reference = null
        reservation.settled_by = null
        reservation.settled_at = null
      }
      const newEffective = reservation.settlement_status === 'pending'
        ? Number(reservation.reserved_usd) : Number(reservation.actual_cost_usd)
      const delta = newEffective - oldEffective
      const adjust = (target: { charged_usd: string; remaining_usd: string | null }) => {
        target.charged_usd = (Number(target.charged_usd) + delta).toFixed(2)
        if (target.remaining_usd !== null) target.remaining_usd = (Number(target.remaining_usd) - delta).toFixed(2)
      }
      adjust(budgets.text)
      adjust(balance)
      for (const user of budgets.users) if (user.subject === 'current-user') adjust(user)
      budgets.text.lyric_reserved_usd = lyricReservations
        .filter(item => item.settlement_status === 'pending').reduce((total, item) => total + Number(item.reserved_usd), 0).toFixed(2)
      budgets.text.lyric_actual_usd = lyricReservations
        .filter(item => item.settlement_status === 'settled').reduce((total, item) => total + Number(item.actual_cost_usd), 0).toFixed(2)
      balance.lyric_reserved_usd = budgets.text.lyric_reserved_usd
      balance.lyric_actual_usd = budgets.text.lyric_actual_usd
      const user = budgets.users.find(item => item.subject === 'current-user')
      if (user) {
        user.lyric_reserved_usd = budgets.text.lyric_reserved_usd
        user.lyric_actual_usd = budgets.text.lyric_actual_usd
      }
      reservation.events.push({
        event_id: `event-${reservation.events.length + 1}`, reservation_id: reservation.reservation_id,
        event_type: action === 'settle' ? 'settled' : action === 'correct' ? 'corrected' : 'reopened',
        previous_status: previousStatus, new_status: reservation.settlement_status,
        previous_actual_usd: previousActual, new_actual_usd: reservation.actual_cost_usd,
        actor_issuer: users[0]!.issuer, actor_subject: 'current-user',
        evidence_reference: reservation.settlement_status === 'pending' ? null : body.evidence_reference ?? null,
        reason: body.reason, created_at: new Date().toISOString(),
      })
      return Response.json({ reservation })
    }
    if (path === '/api/access-requests') {
      if (init?.method === 'POST') status = 'pending'
      else if (status === 'approved') denied = false
      return Response.json({ status })
    }
    if (path === '/api/jingles') {
      if (init?.method === 'POST') {
        await options.waitForGeneration
        generated = true
        history = { estimate: null, unavailable_reason: 'Awaiting reconciliation', runs: [run] }
        return options.failGenerate ? Response.json({ detail: 'Provider failed' }, {
          status: 502, headers: { 'X-Earwyrm-Diagnostic-Id': 'a08940a6-6b20-42b0-98ab-66b98b51e013' },
        }) : Response.json(run)
      }
      if (generated && options.failRefreshAfterGenerate) return Response.json({ detail: 'Status unavailable' }, { status: 503 })
      return Response.json(history)
    }
    if (/^\/api\/jingles\/[^/]+\/progress$/.test(path)) {
      if (!options.progressStage) return Response.json({ detail: 'Unavailable' }, { status: 503 })
      return Response.json({ stage: options.progressStage() })
    }
    if (path === '/api/attempts/attempt-1/reconcile') {
      history = { estimate, unavailable_reason: null, runs: [{ ...run, attempt: { ...run.attempt, status: 'reconciled', actual_cost_usd: '0.015', jingle_ai_actual_cost_usd: '0.025' } }] }
      return Response.json({ status: 'reconciled' })
    }
    if (path === '/api/outputs/output-1/audio') return new Response(new Blob(['audio'], { type: 'audio/wav' }))
    if (path === '/api/outputs/output-1/evidence') return Response.json({ source: 'AI' })
    if (path === '/api/outputs/output-1/evaluation') return Response.json({ status: 'Pass' })
    if (path === '/api/admin/users') return Response.json(init?.method === 'PUT' ? { status: 'updated' } : { users })
    if (path === '/api/admin/access-requests') return Response.json({ requests })
    if (path === '/api/admin/access-requests/request-1/decision') {
      const request = requests[0]
      requests = []
      if (options.failDecision) return Response.json({ detail: 'The request was already decided' }, { status: 409 })
      if (request && JSON.parse(String(init?.body)).decision === 'approved') users.push({ issuer: users[0]!.issuer, subject: request.subject, enabled: true, admin: false, paid_speech: false })
      return Response.json({ status: 'saved' })
    }
    return Response.json({ detail: `Unexpected request: ${path}` }, { status: 404 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return { fetchMock, logoutPopup }
}

async function signIn(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Sign in with Entra External ID' }))
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(window, 'msal')
})

describe('Jingle workspace', () => {
  it('creates one paid jingle directly from text and plays protected audio', async () => {
    const user = userEvent.setup()
    const { fetchMock } = installMocks()
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:audio'), revokeObjectURL: vi.fn() }))
    render(<App />)
    await signIn(user)
    expect(await screen.findByText('Maximum estimated cost: $0.05')).toBeVisible()
    expect(screen.getByText(/Generate starts paid provider calls/)).toBeVisible()
    const prompt = screen.getByLabelText('Describe your jingle')
    expect(prompt).toHaveAttribute('maxLength', '400')
    await user.type(prompt, 'A cheerful bike shop jingle')
    await user.click(screen.getByRole('button', { name: 'Generate jingle' }))
    const request = fetchMock.mock.calls.find(([input, init]) => String(input).endsWith('/api/jingles') && init?.method === 'POST')
    expect(JSON.parse(String(request?.[1]?.body))).toEqual({
      description: 'A cheerful bike shop jingle', progress_id: expect.stringMatching(/^[a-f0-9-]{36}$/),
    })
    expect(new Headers(request?.[1]?.headers).get('Authorization')).toBe('Bearer test-access-token')
    expect(await screen.findByText('Actual cost: Pending or unknown')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Load protected audio' }))
    expect(await screen.findByLabelText('spoken audio for run-1')).toHaveAttribute('src', 'blob:audio')
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith('/api/renders/estimate'))).toBe(false)
  })

  it('highlights only reported stages and keeps the last reported step on failure', async () => {
    const user = userEvent.setup()
    let finish!: () => void
    const pending = new Promise<void>(resolve => { finish = resolve })
    let stage = 'lyrics'
    installMocks({ waitForGeneration: pending, progressStage: () => stage, failGenerate: true })
    render(<App />)
    await signIn(user)
    await user.type(await screen.findByLabelText('Describe your jingle'), 'Bike shop')
    await user.click(screen.getByRole('button', { name: 'Generate jingle' }))
    const list = screen.getByRole('list', { name: 'How your jingle gets made' })
    const [brief, lyrics, safety, score] = within(list).getAllByRole('listitem')
    await waitFor(() => expect(lyrics).toHaveAttribute('aria-current', 'step'))
    expect(brief).toHaveTextContent('Done')
    expect(safety).not.toHaveAttribute('aria-current')
    stage = 'safety'
    await waitFor(() => expect(safety).toHaveAttribute('aria-current', 'step'))
    finish()
    expect(await screen.findByRole('alert')).toHaveTextContent('Provider failed')
    expect(screen.getByRole('alert')).toHaveTextContent('Diagnostic ID: a08940a6-6b20-42b0-98ab-66b98b51e013')
    expect(safety).toHaveTextContent('Last reported')
    expect(safety).not.toHaveAttribute('aria-current')
    expect(score).not.toHaveTextContent('Done')
  })

  it('refreshes history on failure without resubmitting or losing the prompt', async () => {
    const user = userEvent.setup()
    const { fetchMock } = installMocks({ failGenerate: true })
    render(<App />)
    await signIn(user)
    await user.type(await screen.findByLabelText('Describe your jingle'), 'Bike shop')
    await user.click(screen.getByRole('button', { name: 'Generate jingle' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Partial provider calls may be charged')
    expect(screen.getByLabelText('Describe your jingle')).toHaveValue('Bike shop')
    expect(screen.getByText('Actual cost: Pending or unknown')).toBeVisible()
    expect(fetchMock.mock.calls.filter(([input, init]) => String(input).endsWith('/api/jingles') && init?.method === 'POST')).toHaveLength(1)
  })

  it('pauses generation if status refresh fails after a paid error', async () => {
    const user = userEvent.setup()
    installMocks({ failGenerate: true, failRefreshAfterGenerate: true })
    render(<App />)
    await signIn(user)
    await user.type(await screen.findByLabelText('Describe your jingle'), 'Bike shop')
    await user.click(screen.getByRole('button', { name: 'Generate jingle' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Run status could not be refreshed')
    expect(screen.getByRole('button', { name: 'Generate jingle' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Reload status' })).toBeVisible()
  })

  it('explains service unavailability without offering a paid action', async () => {
    const user = userEvent.setup()
    installMocks({ history: { estimate: null, unavailable_reason: 'Budget exhausted', runs: [] } })
    render(<App />)
    await signIn(user)
    expect(await screen.findByText('Generation unavailable: Budget exhausted')).toBeVisible()
    await user.type(screen.getByLabelText('Describe your jingle'), 'Bike shop')
    expect(screen.getByRole('button', { name: 'Generate jingle' })).toBeDisabled()
  })

  it('reconciles verified costs and never plays legacy seeded outputs', async () => {
    const user = userEvent.setup()
    const legacy = { ...run, run_id: 'legacy', attempt: { attempt_id: 'attempt-legacy', status: 'failed_or_unknown', estimated_cost_usd: '0.1' }, outputs: [output] }
    const { fetchMock } = installMocks({ history: { estimate: null, unavailable_reason: 'Awaiting reconciliation', runs: [run, legacy] } })
    render(<App />)
    await signIn(user)
    expect(await screen.findByText('Earlier Speech attempt')).toBeVisible()
    expect(screen.getAllByRole('button', { name: 'Load protected audio' })).toHaveLength(1)
    const summary = screen.getByText('Attempt attempt-1 · awaiting_reconciliation')
    await user.click(summary)
    const form = within(summary.parentElement!)
    await user.type(form.getByLabelText('Actual Speech cost in USD'), '0.015')
    await user.type(form.getByLabelText('Billing evidence reference'), 'invoice-1')
    await user.type(form.getByLabelText('Verified AI services cost in USD (optional)'), '0.025')
    await user.click(form.getByRole('button', { name: 'Record reconciliation' }))
    expect(await screen.findByText('Actual cost: $0.040 (AI services and Speech; hosting excluded)')).toBeVisible()
    const request = fetchMock.mock.calls.find(([input]) => String(input).endsWith('/api/attempts/attempt-1/reconcile'))
    expect(JSON.parse(String(request?.[1]?.body))).toEqual({ actual_cost_usd: '0.015', evidence_reference: 'invoice-1', ai_actual_cost_usd: '0.025' })
  })

  it('allows review and protected evidence for generated output', async () => {
    const user = userEvent.setup()
    const { fetchMock } = installMocks({ history: { estimate, unavailable_reason: null, runs: [run] } })
    render(<App />)
    await signIn(user)
    await user.click(await screen.findByText('Review and evidence'))
    await user.click(screen.getByRole('button', { name: 'Load protected evidence' }))
    expect(await screen.findByText(/"source": "AI"/)).toBeVisible()
    await user.type(screen.getByLabelText('Brand transcription'), 'Bike shop')
    await user.type(screen.getByLabelText('Call to action transcription'), 'Come in')
    await user.selectOptions(screen.getByLabelText('Self rating'), 'usable with minor edits')
    await user.click(screen.getByRole('button', { name: 'Save review' }))
    await vi.waitFor(() => expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith('/evaluation'))).toBe(true))
  })

  it('omits optional AI cost when reconciling a legacy attempt', async () => {
    const user = userEvent.setup()
    const legacy = { ...run, attempt: { attempt_id: 'attempt-1', status: 'awaiting_reconciliation', estimated_cost_usd: '0.02' }, outputs: [] }
    const { fetchMock } = installMocks({ history: { estimate: null, unavailable_reason: 'Awaiting reconciliation', runs: [legacy] } })
    render(<App />)
    await signIn(user)
    await user.click(await screen.findByText('Attempt attempt-1 · awaiting_reconciliation'))
    expect(screen.queryByLabelText('Verified AI services cost in USD (optional)')).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('Actual Speech cost in USD'), '0.01')
    await user.type(screen.getByLabelText('Billing evidence reference'), 'invoice')
    await user.click(screen.getByRole('button', { name: 'Record reconciliation' }))
    await vi.waitFor(() => expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith('/reconcile'))).toBe(true))
    const request = fetchMock.mock.calls.find(([input]) => String(input).endsWith('/reconcile'))
    expect(JSON.parse(String(request?.[1]?.body))).toEqual({ actual_cost_usd: '0.01', evidence_reference: 'invoice' })
  })
})

describe('Authentication and access administration', () => {
  it('shows pending lyric reserves separately from administrator-recorded verified actuals', async () => {
    const user = userEvent.setup()
    installMocks()
    render(<App />)
    await signIn(user)
    expect(await screen.findByText(/Lyric reserve: \$0\.62\. Administrator-recorded verified lyric actual: \$0\.05\./)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Manage access' }))
    expect(await screen.findByRole('heading', { name: 'Lyric reservations' })).toBeVisible()
    const pending = screen.getAllByRole('listitem').find(item => item.textContent?.includes('reservation-pending'))
    const settled = screen.getAllByRole('listitem').find(item => item.textContent?.includes('reservation-settled'))
    expect(pending).toBeVisible()
    expect(pending).toHaveTextContent('Pending')
    expect(pending).toHaveTextContent('Reserved $0.62')
    expect(settled).toBeVisible()
    expect(settled).toHaveTextContent('Settled')
    expect(settled).toHaveTextContent('Administrator-recorded actual $0.05')
    expect(settled).toHaveTextContent('Current actual: $0.05')
    expect(within(pending!).getByRole('button', { name: 'Record verified lyric cost' })).toBeVisible()
    expect(within(settled!).getByRole('button', { name: 'Correct recorded cost' })).toBeVisible()
    expect(within(settled!).getByRole('button', { name: 'Reopen reservation' })).toBeVisible()
  })

  it('settles, corrects, and reopens lyric reservations while refreshing remaining budget', async () => {
    const user = userEvent.setup()
    const { fetchMock } = installMocks()
    render(<App />)
    await signIn(user)
    await user.click(screen.getByRole('button', { name: 'Manage access' }))
    await screen.findByRole('heading', { name: 'Lyric reservations' })
    const settlementForm = screen.getByRole('form', { name: 'Settle lyric reservation reservation-pending' })
    await user.type(within(settlementForm).getByLabelText('Verified actual lyric cost (USD)'), '0.04')
    await user.type(within(settlementForm).getByLabelText('Billing evidence reference'), 'TEST-ONLY meter record')
    await user.type(within(settlementForm).getByLabelText('Settlement reason'), 'Verified lyric-call cost')
    await user.click(screen.getByRole('button', { name: 'Record verified lyric cost' }))
    await user.click(screen.getByRole('button', { name: 'Workspace' }))
    expect(await screen.findByText(/Lifetime allowance: \$5\. Charged or reserved: \$0\.67\. Remaining: \$4\.33\./)).toBeVisible()
    const settlementCall = fetchMock.mock.calls.find(([input]) => String(input).endsWith('/reservation-pending/settle'))
    expect(JSON.parse(String(settlementCall?.[1]?.body))).toEqual({
      actual_cost_usd: '0.04', evidence_reference: 'TEST-ONLY meter record', reason: 'Verified lyric-call cost',
    })

    await user.click(screen.getByRole('button', { name: 'Manage access' }))
    await screen.findByRole('heading', { name: 'Lyric reservations' })
    const correctionForm = screen.getByRole('form', { name: 'Correct lyric reservation reservation-pending' })
    await user.type(within(correctionForm).getByLabelText('Corrected actual lyric cost (USD)'), '0.03')
    await user.type(within(correctionForm).getByLabelText('Replacement billing evidence reference'), 'TEST-ONLY corrected meter')
    await user.type(within(correctionForm).getByLabelText('Correction reason'), 'Corrected after review')
    await user.click(within(correctionForm).getByRole('button', { name: 'Correct recorded cost' }))
    await user.click(screen.getByRole('button', { name: 'Workspace' }))
    expect(await screen.findByText(/Lifetime allowance: \$5\. Charged or reserved: \$0\.66\. Remaining: \$4\.34\./)).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Manage access' }))
    await screen.findByRole('heading', { name: 'Lyric reservations' })
    const reopenForm = screen.getByRole('form', { name: 'Reopen lyric reservation reservation-pending' })
    await user.type(within(reopenForm).getByLabelText('Reopening reason'), 'Evidence needs another review')
    await user.click(within(reopenForm).getByRole('button', { name: 'Reopen reservation' }))
    await user.click(screen.getByRole('button', { name: 'Workspace' }))
    expect(await screen.findByText(/Lifetime allowance: \$5\. Charged or reserved: \$1\.25\. Remaining: \$3\.75\./)).toBeVisible()
    const reopenCall = fetchMock.mock.calls.find(([input]) => String(input).endsWith('/reservation-pending/reopen'))
    expect(JSON.parse(String(reopenCall?.[1]?.body))).toEqual({ reason: 'Evidence needs another review' })
    const workspace = screen.getByRole('region', { name: 'Create a jingle' })
    expect(within(workspace).getByText(/Lyric reserve: \$0\.62\./)).toBeVisible()
  })

  it('retains settlement inputs and shows the server error when evidence is rejected', async () => {
    const user = userEvent.setup()
    installMocks({ failLyricAction: true })
    render(<App />)
    await signIn(user)
    await user.click(screen.getByRole('button', { name: 'Manage access' }))
    await screen.findByRole('heading', { name: 'Lyric reservations' })
    const form = screen.getByRole('form', { name: 'Settle lyric reservation reservation-pending' })
    await user.type(within(form).getByLabelText('Verified actual lyric cost (USD)'), '0.04')
    await user.type(within(form).getByLabelText('Billing evidence reference'), 'TEST-ONLY unverified reference')
    await user.type(within(form).getByLabelText('Settlement reason'), 'Needs verification')
    await user.click(screen.getByRole('button', { name: 'Record verified lyric cost' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Billing evidence could not be verified')
    expect(within(form).getByLabelText('Verified actual lyric cost (USD)')).toHaveValue('0.04')
    expect(within(form).getByLabelText('Billing evidence reference')).toHaveValue('TEST-ONLY unverified reference')
    expect(within(form).getByLabelText('Settlement reason')).toHaveValue('Needs verification')
  })

  it('opens the AI budget dialog by keyboard and cancels without saving', async () => {
    const user = userEvent.setup()
    const { fetchMock } = installMocks()
    render(<App />)
    await signIn(user)
    await user.click(screen.getByRole('button', { name: 'Manage access' }))
    const edit = await screen.findByRole('button', { name: 'Edit AI budget' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    edit.focus()
    await user.keyboard('{Enter}')
    const dialog = screen.getByRole('dialog', { name: 'Edit budget limit' })
    expect(dialog).toHaveAccessibleDescription('Editing: Shared AI and safety')
    const amount = within(dialog).getByRole('textbox', { name: 'Budget limit (USD)' })
    expect(amount).toHaveValue('20')
    expect(amount).toHaveFocus()
    await user.clear(amount)
    await user.type(amount, '21')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(edit).toHaveFocus()
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false)
    await user.click(edit)
    expect(screen.getByRole('textbox', { name: 'Budget limit (USD)' })).toHaveValue('20')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(edit).toHaveFocus()
  })

  it('displays the lifetime balance and saves an exact per-user allowance without changing usage', async () => {
    const user = userEvent.setup()
    const { fetchMock } = installMocks()
    render(<App />)
    await signIn(user)
    expect(await screen.findByText(/Lifetime allowance: \$5.*Remaining: \$3.75/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Manage access' }))
    await user.click(await screen.findByRole('button', { name: 'Edit budget for existing-user' }))
    expect(screen.getByText('Editing: Lifetime allowance for existing-user')).toBeVisible()
    await user.clear(screen.getByLabelText('Budget limit (USD)'))
    await user.type(screen.getByLabelText('Budget limit (USD)'), '12.500000000001')
    await user.click(screen.getByRole('button', { name: 'Save budget limit' }))
    expect(await screen.findByText('Budget limit saved. Existing usage has not changed.')).toBeVisible()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit budget for existing-user' })).toHaveFocus()
    const call = fetchMock.mock.calls.find(([input, init]) => String(input).endsWith('/api/admin/budgets') && init?.method === 'PUT')
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ scope: 'user', owner: 'existing-user', limit_usd: '12.500000000001' })
    expect(screen.getByText(/limit \$12.500000000001; charged or reserved \$1.25/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Edit Speech budget' }))
    await user.clear(screen.getByLabelText('Budget limit (USD)'))
    await user.type(screen.getByLabelText('Budget limit (USD)'), '0')
    await user.click(screen.getByRole('button', { name: 'Save budget limit' }))
    await waitFor(() => expect(fetchMock.mock.calls.filter(([input, init]) => String(input).endsWith('/api/admin/budgets') && init?.method === 'PUT')).toHaveLength(2))
    const last = fetchMock.mock.calls.filter(([input, init]) => String(input).endsWith('/api/admin/budgets') && init?.method === 'PUT').at(-1)
    expect(JSON.parse(String(last?.[1]?.body))).toEqual({ scope: 'speech', limit_usd: '0' })
  })

  it('surfaces a rejected budget save without claiming success or dropping the entered value', async () => {
    const user = userEvent.setup()
    installMocks({ failBudgetSave: true })
    render(<App />)
    await signIn(user)
    await user.click(await screen.findByRole('button', { name: 'Manage access' }))
    await user.click(await screen.findByRole('button', { name: 'Edit AI budget' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit budget limit' })
    const input = await screen.findByLabelText('Budget limit (USD)')
    await user.clear(input)
    await user.type(input, '25')
    await user.click(screen.getByRole('button', { name: 'Save budget limit' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Administrator access is required')
    expect(input).toHaveValue('25')
    expect(screen.queryByText('Budget limit saved. Existing usage has not changed.')).not.toBeInTheDocument()
  })

  it('offers retry rather than showing zero when budget loading fails', async () => {
    const user = userEvent.setup()
    installMocks({ failBudgetLoad: true })
    render(<App />)
    await signIn(user)
    await user.click(await screen.findByRole('button', { name: 'Manage access' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Persistent storage is unavailable')
    expect(screen.getByText('Budget data has not loaded. Use Refresh budgets to retry.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Refresh budgets' })).toBeEnabled()
    expect(screen.queryByLabelText('Budget limit (USD)')).not.toBeInTheDocument()
  })

  it('requests access, including resubmission after denial', async () => {
    const user = userEvent.setup()
    const { fetchMock } = installMocks({ denied: true, status: 'denied' })
    render(<App />)
    await signIn(user)
    expect(await screen.findByRole('heading', { name: 'Request access' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Request access again' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Your request is pending review.')
    expect(fetchMock.mock.calls.some(([input, init]) => String(input).endsWith('/api/access-requests') && init?.method === 'POST')).toBe(true)
    expect(screen.queryByText('current-user')).not.toBeInTheDocument()
  })

  it('reloads approved access and hides administration for non-admins', async () => {
    const user = userEvent.setup()
    installMocks({ denied: true, status: 'approved', admin: false })
    render(<App />)
    await signIn(user)
    await user.click(await screen.findByRole('button', { name: 'Reload workspace' }))
    expect(await screen.findByRole('heading', { name: 'Create a jingle' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Manage access' })).not.toBeInTheDocument()
  })

  it('grants baseline access and clears permissions when editing another subject', async () => {
    const user = userEvent.setup()
    const { fetchMock } = installMocks()
    render(<App />)
    await signIn(user)
    await user.click(await screen.findByRole('button', { name: 'Manage access' }))
    const queue = await screen.findByRole('region', { name: 'Pending access requests' })
    expect(within(queue).getByText('Email: requester@example.test')).toBeVisible()
    const grant = within(queue).getByRole('button', { name: 'Grant access to requester-1' })
    grant.focus()
    await user.keyboard('{Enter}')
    expect(await screen.findByText(/requester-1: enabled, not administrator, paid Speech denied/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Edit existing-user' }))
    expect(screen.getByLabelText('Paid Speech access')).toBeChecked()
    await user.clear(screen.getByLabelText('Verified subject'))
    await user.type(screen.getByLabelText('Verified subject'), 'new-user')
    expect(screen.getByLabelText('Enabled')).not.toBeChecked()
    expect(screen.getByLabelText('Administrator')).not.toBeChecked()
    expect(screen.getByLabelText('Paid Speech access')).not.toBeChecked()
    const decision = fetchMock.mock.calls.find(([input]) => String(input).endsWith('/request-1/decision'))
    expect(JSON.parse(String(decision?.[1]?.body))).toEqual({ decision: 'approved' })
  })

  it('refreshes a failed access decision and keeps requests without email actionable', async () => {
    const user = userEvent.setup()
    installMocks({ failDecision: true, email: null })
    render(<App />)
    await signIn(user)
    await user.click(await screen.findByRole('button', { name: 'Manage access' }))
    expect(await screen.findByText('Email unavailable')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Deny request from requester-1' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The request was already decided')
    expect(screen.getByText('No pending access requests.')).toBeVisible()
  })

  it('keeps the workspace when the current user removes their admin permission', async () => {
    const user = userEvent.setup()
    installMocks()
    render(<App />)
    await signIn(user)
    await user.click(await screen.findByRole('button', { name: 'Manage access' }))
    await user.click(await screen.findByRole('button', { name: 'Edit current-user' }))
    await user.click(screen.getByLabelText('Administrator'))
    await user.click(screen.getByRole('button', { name: 'Save user access' }))
    expect(await screen.findByRole('heading', { name: 'Create a jingle' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Manage access' })).not.toBeInTheDocument()
  })

  it('keeps the session when sign-out fails', async () => {
    const user = userEvent.setup()
    const { logoutPopup } = installMocks()
    logoutPopup.mockRejectedValueOnce(new Error('Sign-out failed'))
    render(<App />)
    await signIn(user)
    await user.click(await screen.findByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign-out failed')
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeEnabled()
  })
})
