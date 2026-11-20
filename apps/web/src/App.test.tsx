import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { AccessRequestStatus, JingleHistory } from './types'

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
  failRefreshAfterGenerate?: boolean
  email?: string | null
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
    if (path === '/api/access-requests') {
      if (init?.method === 'POST') status = 'pending'
      else if (status === 'approved') denied = false
      return Response.json({ status })
    }
    if (path === '/api/jingles') {
      if (init?.method === 'POST') {
        generated = true
        history = { estimate: null, unavailable_reason: 'Awaiting reconciliation', runs: [run] }
        return options.failGenerate ? Response.json({ detail: 'Provider failed' }, { status: 502 }) : Response.json(run)
      }
      if (generated && options.failRefreshAfterGenerate) return Response.json({ detail: 'Status unavailable' }, { status: 503 })
      return Response.json(history)
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
    expect(JSON.parse(String(request?.[1]?.body))).toEqual({ description: 'A cheerful bike shop jingle' })
    expect(new Headers(request?.[1]?.headers).get('Authorization')).toBe('Bearer test-access-token')
    expect(await screen.findByText('Actual cost: Pending or unknown')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Load protected audio' }))
    expect(await screen.findByLabelText('spoken audio for run-1')).toHaveAttribute('src', 'blob:audio')
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith('/api/renders/estimate'))).toBe(false)
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
