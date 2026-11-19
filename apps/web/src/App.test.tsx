import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { AccessRequestStatus } from './types'

const account = {
  homeAccountId: 'home-id',
  environment: 'example.test',
  tenantId: 'tenant-id',
  username: 'operator@example.test',
  localAccountId: 'local-id',
}
const originalDialogMethods = {
  showModal: Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal'),
  close: Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close'),
}
const originalAudioUrlMethods = {
  createObjectURL: Object.getOwnPropertyDescriptor(URL, 'createObjectURL'),
  revokeObjectURL: Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL'),
}

const output = {
  output_id: 'output-1',
  run_id: 'run-1',
  brief_id: 'brief-001',
  variant: 'variant-a',
  duration_seconds: 12.5,
  render_seconds: 1.25,
  numeric_gates: { duration: true },
  components: [],
  azure_usage: { submitted_characters: 0 },
  evaluation: null,
  status: 'Pending',
  audio_url: '/api/outputs/output-1/audio',
  evidence_url: '/api/outputs/output-1/evidence',
}

function installMocks(
  denyAccess = false,
  capabilities: { lyrics?: boolean; vocals?: boolean } = {},
  initialAccessRequestStatus: AccessRequestStatus = 'none',
  isAdmin = true,
  failAccessDecision = false,
) {
  let accessDenied = denyAccess
  let accessRequestStatus = initialAccessRequestStatus
  let pendingRequests = [{
    request_id: 'request-1',
    subject: 'requester-1',
    created_at: '2026-11-18T12:00:00.000Z',
  }]
  const adminUsers = [
    {
      issuer: 'https://identity.example.test/tenant/v2.0',
      subject: 'existing-user',
      enabled: true,
      admin: true,
      paid_speech: true,
    },
    {
      issuer: 'https://identity.example.test/tenant/v2.0',
      subject: 'current-user',
      enabled: true,
      admin: true,
      paid_speech: true,
    },
  ]
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  const logoutPopup = vi.fn(async (_request: {
    account: typeof account
    postLogoutRedirectUri: string
  }) => undefined)
  class FakePublicClientApplication {
    activeAccount: typeof account | null = null
    settings: unknown

    constructor(settings: unknown) {
      this.settings = settings
    }

    initialize = vi.fn(async () => undefined)
    handleRedirectPromise = vi.fn(async () => null)
    getActiveAccount = (): typeof account | null => this.activeAccount
    getAllAccounts = (): typeof account[] => (this.activeAccount ? [this.activeAccount] : [])
    setActiveAccount = (nextAccount: typeof account | null): void => {
      this.activeAccount = nextAccount
    }
    loginPopup = vi.fn(async () => ({ account }))
    logoutPopup = logoutPopup
    acquireTokenSilent = vi.fn(async () => ({ accessToken: 'test-access-token' }))
    acquireTokenPopup = vi.fn(async () => ({ accessToken: 'test-access-token' }))
  }

  class FakeInteractionRequiredAuthError extends Error {}

  Object.defineProperty(window, 'msal', {
    configurable: true,
    value: {
      PublicClientApplication: FakePublicClientApplication,
      BrowserCacheLocation: { SessionStorage: 'sessionStorage' },
      InteractionRequiredAuthError: FakeInteractionRequiredAuthError,
    },
  })

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), window.location.origin).pathname
    const payloads: Record<string, unknown> = {
      '/api/config': {
        setup_status: 'ready',
        client_id: 'client-id',
        authority: 'https://identity.example.test/tenant',
        scope_prefix: 'api://service',
      },
      '/api/identity': {
        issuer: 'https://identity.example.test/tenant/v2.0',
        subject: 'current-user',
      },
      '/api/access-requests': { status: accessRequestStatus },
      '/api/access': {
        issuer: 'https://identity.example.test/tenant/v2.0',
        subject: 'current-user',
        admin: isAdmin,
        paid_speech: false,
      },
      '/api/briefs': [
        {
          brief_id: 'brief-001',
          name: 'Cedar Loop Bike Repair',
          description: 'A seasonal repair offer',
        },
        { brief_id: 'brief-002', name: 'Mosslight Garden Supply', offer: 'Seed kits' },
      ],
      '/api/briefs/validate': {
        brief_id: `custom-${'a'.repeat(32)}`, name: 'Bright Bike', offer: 'Bike tune ups',
        location: 'Lakeview', tone: 'Friendly', contact_details: { email: 'shop@example.com', phone: 'Call today' },
        approved_claims: ['Bike tune ups are available'], cta: 'Call Bright Bike to plan your next ride', source: 'custom',
      },
      '/api/lyrics/options': init?.method === 'POST'
        ? {
            brief_id: 'brief-001',
            options: [
              { option_id: 'accepted-option', brief_id: 'brief-001', status: 'accepted', output: { hook: 'Original hook', lyrics: 'Original hook\nCall today' }, reasons: [], ai_generated: true, broadcast_approval_required: true },
              { option_id: 'held-option', brief_id: 'brief-001', status: 'human_review_required', output: { hook: 'Another hook', lyrics: 'Another hook\nCall today' }, reasons: ['risky_claims_require_human_review'], ai_generated: true, broadcast_approval_required: true },
              { option_id: 'unavailable-option', brief_id: 'brief-001', status: 'unavailable', output: null, reasons: ['duplicate_option'], ai_generated: true, broadcast_approval_required: true },
            ],
          }
        : { available: Boolean(capabilities.lyrics), option_count: 3 },
      '/api/render-options': {
        instrumental_available: true,
        speech_status: capabilities.vocals ? 'available' : 'disabled',
      },
      '/api/renders/estimate': {
        brief_ids: ['brief-001'], estimated_cost_usd: '0.1',
        ...(init?.body && JSON.parse(String(init.body)).composition_selections
          ? { composition_selections: JSON.parse(String(init.body)).composition_selections } : {}),
        ...(init?.body && JSON.parse(String(init.body)).lyric_selections
          ? { lyric_selections: JSON.parse(String(init.body)).lyric_selections, input_fingerprint: 'a'.repeat(64) } : {}),
      },
      '/api/renders': {
        runs: [
          {
            run_id: 'run-1',
            mode: 'instrumental',
            brief_ids: ['brief-001'],
            status: 'completed',
          },
        ],
      },
      '/api/outputs': { outputs: [output] },
      '/api/poc/status': {
        status: 'Pending',
        briefs: [
          {
            brief_id: 'brief-001',
            status: 'Pending',
            outputs: [output],
          },
        ],
      },
      '/api/admin/users': { users: adminUsers },
    }

    if (path === '/api/access-requests' && init?.method === 'POST') {
      accessRequestStatus = 'pending'
      return Response.json({ status: accessRequestStatus })
    }

    if (path === '/api/access-requests' && accessRequestStatus === 'approved') {
      accessDenied = false
    }

    if (path === '/api/access' && accessDenied) {
      return new Response(JSON.stringify({ detail: 'Application access denied' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (path === '/api/admin/access-requests' && init?.method !== 'POST') {
      return Response.json({ requests: pendingRequests })
    }

    if (path.startsWith('/api/admin/access-requests/') && init?.method === 'POST') {
      const requestId = path.split('/').at(-2)
      const requested = pendingRequests.find((request) => request.request_id === requestId)
      pendingRequests = pendingRequests.filter((request) => request.request_id !== requestId)
      if (failAccessDecision) {
        return new Response(JSON.stringify({ detail: 'The request was already decided' }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      const body = JSON.parse(String(init.body)) as { decision: 'approved' | 'denied' }
      if (body.decision === 'approved' && requested) {
        adminUsers.push({
          issuer: 'https://identity.example.test/tenant/v2.0',
          subject: requested.subject,
          enabled: true,
          admin: false,
          paid_speech: false,
        })
      }
      return Response.json({ status: body.decision })
    }

    const payload = payloads[path]
    if (payload === undefined) {
      return new Response(JSON.stringify({ detail: `Unexpected request: ${path}` }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const responsePayload =
      path === '/api/renders' && init?.method === 'POST'
        ? { run_id: 'new-run' }
        : path === '/api/admin/users' && init?.method === 'PUT'
          ? { status: 'updated' }
          : payload
    return new Response(JSON.stringify(responsePayload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })

  vi.stubGlobal('fetch', fetchMock)
  return { fetchMock, logoutPopup }
}

function installDialogMock(): void {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: function (this: HTMLDialogElement) { this.open = true } },
    close: { configurable: true, value: function (this: HTMLDialogElement, result?: string) {
      this.returnValue = result ?? ''
      this.open = false
      this.dispatchEvent(new Event('close'))
    } },
  })
}

afterEach(() => {
  cleanup()
  window.sessionStorage.clear()
  vi.restoreAllMocks()
  for (const [name, descriptor] of Object.entries(originalDialogMethods)) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor)
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name)
  }
  for (const [name, descriptor] of Object.entries(originalAudioUrlMethods)) {
    if (descriptor) Object.defineProperty(URL, name, descriptor)
    else Reflect.deleteProperty(URL, name)
  }
  vi.unstubAllGlobals()
  Reflect.deleteProperty(window, 'msal')
})

describe('React workspace', () => {
  it.each(['sample', 'custom'])('guides a %s brief from instrumental playback to the exact paid demo', async source => {
    const user = userEvent.setup()
    installDialogMock()
    const { fetchMock } = installMocks(false, { lyrics: true, vocals: true })
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: () => 'blob:preview' })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
    const respond = fetchMock.getMockImplementation()!
    const briefId = source === 'sample' ? 'brief-001' : `custom-${'a'.repeat(32)}`
    fetchMock.mockImplementation(async (input, init) => {
      const path = new URL(String(input), window.location.origin).pathname
      if (path === '/api/arrangements') return Response.json({
        arrangements: ['Bright', 'Warm', 'Bold'].map((label, index) => ({
          label, job_id: `job-${index}`, output: { ...output, brief_id: briefId, output_id: `preview-${index}`, audio_url: `/api/outputs/preview-${index}/audio` },
        })),
      })
      if (path === '/api/outputs/preview-1/audio') return new Response(new Blob(['audio'], { type: 'audio/wav' }))
      if (path === '/api/lyrics/options' && init?.method === 'POST') return Response.json({
        options: [
          { option_id: 'fitted', brief_id: briefId, arrangement_job_id: 'job-1', status: 'accepted', output: { hook: 'On your way', lyrics: 'On your way\nRide today' }, reasons: [] },
          { option_id: 'held', brief_id: briefId, arrangement_job_id: 'job-1', status: 'human_review_required', output: null, reasons: [] },
        ],
      })
      if (path === '/api/renders/estimate') {
        return Response.json({ ...JSON.parse(String(init?.body)), estimated_cost_usd: '0.1', input_fingerprint: 'a'.repeat(64) })
      }
      return respond(input, init)
    })
    const posts = (path: string) => fetchMock.mock.calls
      .filter(([input, init]) => String(input).endsWith(path) && init?.method === 'POST')
      .map(([, init]) => JSON.parse(String(init?.body)))

    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Sign in with Entra External ID' }))
    if (source === 'custom') {
      await user.click(screen.getByRole('button', { name: 'Enter or upload brief' }))
      await user.upload(screen.getByLabelText('Upload brief JSON'), new File(['{"name":"Bright Bike"}'], 'brief.json', { type: 'application/json' }))
      expect(await screen.findByRole('heading', { name: 'Bright Bike' })).toBeVisible()
    }
    await user.click(screen.getByRole('button', { name: 'Continue to music' }))
    expect(screen.queryByRole('button', { name: /Generate 3 lyric drafts/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Generate 3 arrangements' }))
    expect(await screen.findAllByRole('radio')).toHaveLength(3)
    expect(posts('/api/arrangements')).toMatchObject([{ brief_ids: [briefId], custom_briefs: source === 'sample' ? [] : [{ brief: { name: 'Bright Bike' } }] }])
    expect(screen.getByRole('button', { name: 'Continue to lyrics' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Play Warm' }))
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('radio', { name: 'Warm' }))
    await user.click(screen.getByRole('button', { name: 'Continue to lyrics' }))
    expect(screen.getByRole('button', { name: 'Generate 3 lyric drafts' })).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: /I authorize paid Foundry/ }))
    await user.click(screen.getByRole('button', { name: 'Generate 3 lyric drafts' }))
    expect(await screen.findByRole('radio', { name: 'Draft 2' })).toBeDisabled()
    expect(posts('/api/lyrics/options')).toMatchObject([{ brief_ids: [briefId], arrangement_job_id: 'job-1', confirm_paid_generation: true }])
    await user.click(screen.getByRole('radio', { name: 'Draft 1: On your way' }))
    await user.click(screen.getByRole('button', { name: 'Back to music' }))
    await user.click(screen.getByRole('radio', { name: 'Bold' }))
    await user.click(screen.getByRole('button', { name: 'Continue to lyrics' }))
    expect(screen.queryByRole('radio', { name: /Draft 1/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Back to music' }))
    await user.click(screen.getByRole('radio', { name: 'Warm' }))
    await user.click(screen.getByRole('button', { name: 'Continue to lyrics' }))
    expect(screen.getByRole('radio', { name: 'Draft 1: On your way' })).not.toBeChecked()
    await user.click(screen.getByRole('radio', { name: 'Draft 1: On your way' }))
    await user.click(screen.getByRole('button', { name: 'Continue to voice demo' }))
    await user.click(screen.getByRole('button', { name: 'Estimate voice demo' }))
    const dialog = await screen.findByRole('dialog')
    expect(posts('/api/renders')).toHaveLength(0)
    await user.click(within(dialog).getByRole('button', { name: 'Confirm and render' }))
    expect(posts('/api/renders')).toMatchObject([{
      brief_ids: [briefId], lyric_selections: [{ brief_id: briefId, option_id: 'fitted' }],
      composition_selections: [{ brief_id: briefId, job_id: 'job-1' }],
    }])
  })

  it('preserves form state across navigation and clears permissions when the subject changes', async () => {
    const user = userEvent.setup()
    const { fetchMock } = installMocks()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Sign in with Entra External ID' }))
    await user.click(screen.getByText('Batch tools', { selector: 'summary' }))
    const briefCheckbox = await screen.findByRole('checkbox', {
      name: /Cedar Loop Bike Repair/,
    })
    expect(briefCheckbox).not.toBeChecked()
    await user.click(briefCheckbox)
    expect(briefCheckbox).toBeChecked()

    const outputsButton = screen.getByRole('button', { name: 'Listen & review' })
    outputsButton.focus()
    await user.keyboard('{Enter}')
    expect(outputsButton).toHaveAttribute('aria-pressed', 'true')

    const brandInput = await screen.findByLabelText('Brand transcription')
    await user.type(brandInput, 'Cedar Loop')
    await user.click(screen.getByRole('button', { name: 'Create' }))
    await user.click(outputsButton)
    expect(screen.getByLabelText('Brand transcription')).toHaveValue('Cedar Loop')
    await user.click(screen.getByRole('button', { name: 'Render instrumental preview' }))
    expect(screen.getByLabelText('Brand transcription')).toBeVisible()
    expect(screen.getByLabelText('Brand transcription')).toHaveValue('Cedar Loop')

    await user.click(screen.getByRole('button', { name: 'Manage access' }))
    const editButton = await screen.findByRole('button', { name: 'Edit existing-user' })
    await user.click(editButton)
    expect(screen.getByLabelText('Administrator')).toBeChecked()
    expect(screen.getByLabelText('Paid Speech access')).toBeChecked()

    const subjectInput = screen.getByLabelText('Verified subject')
    await user.clear(subjectInput)
    await user.type(subjectInput, 'new-user')
    expect(screen.getByLabelText('Enabled')).not.toBeChecked()
    expect(screen.getByLabelText('Administrator')).not.toBeChecked()
    expect(screen.getByLabelText('Paid Speech access')).not.toBeChecked()

    const protectedRequest = fetchMock.mock.calls.find(
      ([input]) => new URL(String(input), window.location.origin).pathname === '/api/identity',
    )
    expect(new Headers(protectedRequest?.[1]?.headers).get('Authorization')).toBe(
      'Bearer test-access-token',
    )
  })

  it('shows a request action instead of identity details when application access is denied', async () => {
    const user = userEvent.setup()
    installMocks(true)
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Sign in with Entra External ID' }))
    expect(await screen.findByRole('heading', { name: 'Request access' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Request access' })).toBeEnabled()
    expect(screen.queryByText('current-user')).not.toBeInTheDocument()
    expect(screen.queryByText('https://identity.example.test/tenant/v2.0')).not.toBeInTheDocument()
  })

  it('submits an access request by keyboard and announces pending status', async () => {
    const user = userEvent.setup()
    const { fetchMock } = installMocks(true)
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Sign in with Entra External ID' }))
    const requestButton = await screen.findByRole('button', { name: 'Request access' })
    requestButton.focus()
    await user.keyboard('{Enter}')

    expect(await screen.findByRole('status')).toHaveTextContent('Your request is pending review.')
    expect(screen.getByText('Access request submitted. An administrator will review it.'))
      .toHaveAttribute('aria-live', 'polite')
    const request = fetchMock.mock.calls.find(([input, init]) =>
      new URL(String(input), window.location.origin).pathname === '/api/access-requests' &&
      init?.method === 'POST')
    expect(request?.[1]?.body).toBeUndefined()
    expect(new Headers(request?.[1]?.headers).get('Authorization')).toBe('Bearer test-access-token')
  })

  it('allows a denied request to be submitted again', async () => {
    const user = userEvent.setup()
    const { fetchMock } = installMocks(true, {}, 'denied')
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Sign in with Entra External ID' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Your request was denied.')
    await user.click(screen.getByRole('button', { name: 'Request access again' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Your request is pending review.')
    expect(fetchMock.mock.calls.some(([input, init]) =>
      new URL(String(input), window.location.origin).pathname === '/api/access-requests' &&
      init?.method === 'POST')).toBe(true)
  })

  it('reloads the workspace after access has been approved', async () => {
    const user = userEvent.setup()
    installMocks(true, {}, 'approved')
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Sign in with Entra External ID' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Your request was approved.')
    await user.click(screen.getByRole('button', { name: 'Reload workspace' }))

    expect(await screen.findByRole('heading', { name: 'Advertisers' })).toBeVisible()
  })

  it('keeps sign-in available before a user is authenticated', async () => {
    installMocks()
    render(<App />)

    expect(await screen.findByRole('button', { name: 'Sign in with Entra External ID' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Request access' })).not.toBeInTheDocument()
  })

  it('keeps the workspace available when the current user removes administrator access', async () => {
    const user = userEvent.setup()
    installMocks()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Sign in with Entra External ID' }))
    await user.click(await screen.findByRole('button', { name: 'Manage access' }))
    await user.click(await screen.findByRole('button', { name: 'Edit current-user' }))
    await user.click(screen.getByLabelText('Administrator'))
    await user.click(screen.getByRole('button', { name: 'Save user access' }))

    expect(await screen.findByRole('heading', { name: 'Advertisers' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Manage access' })).not.toBeInTheDocument()
  })

  it('lists pending requests with a read-only identity reference', async () => {
    const user = userEvent.setup()
    installMocks()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Sign in with Entra External ID' }))
    await user.click(await screen.findByRole('button', { name: 'Manage access' }))

    const queue = await screen.findByRole('region', { name: 'Pending access requests' })
    expect(within(queue).getByText('requester-1')).toBeVisible()
    expect(within(queue).getByRole('button', { name: 'Grant access to requester-1' })).toBeVisible()
    expect(within(queue).getByRole('button', { name: 'Deny request from requester-1' })).toBeVisible()
    expect(within(queue).queryByLabelText('Verified subject')).not.toBeInTheDocument()
  })

  it('grants baseline access by keyboard and announces the decision', async () => {
    const user = userEvent.setup()
    const { fetchMock } = installMocks()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Sign in with Entra External ID' }))
    await user.click(await screen.findByRole('button', { name: 'Manage access' }))
    const grantButton = await screen.findByRole('button', { name: 'Grant access to requester-1' })
    grantButton.focus()
    await user.keyboard('{Enter}')

    expect(await screen.findByText(/requester-1: enabled, not administrator, paid Speech denied/)).toBeVisible()
    expect(screen.getByText(
      'Access granted to requester-1. Baseline application access is enabled. Administrator and paid Speech permissions remain off.',
    )).toHaveAttribute('aria-live', 'polite')
    const decision = fetchMock.mock.calls.find(([input, init]) =>
      new URL(String(input), window.location.origin).pathname.endsWith('/request-1/decision') &&
      init?.method === 'POST')
    expect(JSON.parse(String(decision?.[1]?.body))).toEqual({ decision: 'approved' })
  })

  it('denies a request by keyboard and announces the decision', async () => {
    const user = userEvent.setup()
    const { fetchMock } = installMocks()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Sign in with Entra External ID' }))
    await user.click(await screen.findByRole('button', { name: 'Manage access' }))
    const denyButton = await screen.findByRole('button', { name: 'Deny request from requester-1' })
    denyButton.focus()
    await user.keyboard('{Enter}')

    expect(await screen.findByRole('status')).toHaveTextContent('No pending access requests.')
    expect(screen.getByText('Access request for requester-1 denied.'))
      .toHaveAttribute('aria-live', 'polite')
    const decision = fetchMock.mock.calls.find(([input, init]) =>
      new URL(String(input), window.location.origin).pathname.endsWith('/request-1/decision') &&
      init?.method === 'POST')
    expect(JSON.parse(String(decision?.[1]?.body))).toEqual({ decision: 'denied' })
  })

  it('hides admin access controls from non-administrators', async () => {
    const user = userEvent.setup()
    const { fetchMock } = installMocks(false, {}, 'none', false)
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Sign in with Entra External ID' }))

    expect(screen.queryByRole('button', { name: 'Manage access' })).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([input]) =>
      new URL(String(input), window.location.origin).pathname.startsWith('/api/admin/'))).toBe(false)
  })

  it('announces a decision error and refreshes the pending queue', async () => {
    const user = userEvent.setup()
    const { fetchMock } = installMocks(false, {}, 'none', true, true)
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Sign in with Entra External ID' }))
    await user.click(await screen.findByRole('button', { name: 'Manage access' }))
    await user.click(await screen.findByRole('button', { name: 'Grant access to requester-1' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('The request was already decided')
    expect(await screen.findByRole('status')).toHaveTextContent('No pending access requests.')
    expect(screen.getByText('Granting access for requester-1 failed.'))
      .toHaveAttribute('aria-live', 'polite')
    expect(fetchMock.mock.calls.filter(([input]) =>
      new URL(String(input), window.location.origin).pathname === '/api/admin/access-requests'))
      .toHaveLength(2)
  })

  it('keeps inspected briefs, batch selection and recent-run inspection independent', async () => {
    const user = userEvent.setup()
    installMocks()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Sign in with Entra External ID' }))
    await user.click(screen.getByText('Batch tools', { selector: 'summary' }))
    const selected = await screen.findByRole('checkbox', { name: 'Select Cedar Loop Bike Repair' })
    await user.click(selected)
    await user.click(screen.getByRole('button', { name: /Mosslight Garden Supply/ }))
    expect(screen.getByRole('heading', { name: 'Mosslight Garden Supply' })).toBeVisible()
    expect(selected).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Select Mosslight Garden Supply' })).not.toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Render instrumental preview' }))
    expect(screen.getByRole('heading', { name: 'Mosslight Garden Supply' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Start with a brief' })).toBeVisible()
    await user.click(screen.getByText('Generation history', { selector: 'summary' }))
    await user.click(screen.getByRole('button', { name: /instrumental · completed/ }))
    expect(screen.getByRole('heading', { name: 'Cedar Loop Bike Repair' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Your jingle versions' })).toBeVisible()
    expect(selected).toBeChecked()
    expect(screen.getAllByText('Evaluation: Pending', { selector: 'p.status-badge' })[0]).toBeVisible()
  })

  it('validates manually entered facts, loads the brief and submits its exact snapshot with the selected batch', async () => {
    const user = userEvent.setup()
    const { fetchMock } = installMocks()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Sign in with Entra External ID' }))
    await user.click(await screen.findByRole('button', { name: 'Enter or upload brief' }))
    for (const [label, value] of [
      ['Brand name', 'Bright Bike'], ['Offer', 'Bike tune ups'], ['Location', 'Lakeview'],
      ['Tone', 'Friendly'], ['Contact email', 'shop@example.com'], ['Contact phone', 'Call today'],
      ['Call to action', 'Call Bright Bike to plan your next ride'], ['Approved claims (one per line)', 'Bike tune ups are available'],
    ]) await user.type(screen.getByLabelText(label!), value!)
    await user.click(screen.getByRole('button', { name: 'Validate and load brief' }))
    expect(await screen.findByRole('heading', { name: 'Bright Bike' })).toBeVisible()
    await user.click(screen.getByText('Batch tools', { selector: 'summary' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select Bright Bike' }))
    await user.click(screen.getByRole('button', { name: 'Render instrumental preview' }))
    const submitted = fetchMock.mock.calls.find(([input, init]) =>
      new URL(String(input), window.location.origin).pathname === '/api/renders' && init?.method === 'POST')
    const body = JSON.parse(String(submitted?.[1]?.body))
    expect(body).toMatchObject({
      mode: 'instrumental', brief_ids: [`custom-${'a'.repeat(32)}`],
      custom_briefs: [{ brief: { name: 'Bright Bike', approved_claims: ['Bike tune ups are available'] }, cta: 'Call Bright Bike to plan your next ride' }],
    })
    expect(body.custom_briefs[0].brief.source).toBeUndefined()
  })

  it('reports malformed uploads without losing selection or an unfinished manual form', async () => {
    const user = userEvent.setup()
    const { fetchMock } = installMocks()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Sign in with Entra External ID' }))
    await user.click(screen.getByText('Batch tools', { selector: 'summary' }))
    await user.click(await screen.findByRole('checkbox', { name: 'Select Cedar Loop Bike Repair' }))
    await user.click(screen.getByRole('button', { name: 'Enter or upload brief' }))
    await user.type(screen.getByLabelText('Brand name'), 'Unfinished brand')
    await user.upload(screen.getByLabelText('Upload brief JSON'), new File(['{bad'], 'brief.json', { type: 'application/json' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('not valid JSON')
    expect(screen.getByLabelText('Brand name')).toHaveValue('Unfinished brand')
    expect(screen.getByRole('checkbox', { name: 'Select Cedar Loop Bike Repair' })).toBeChecked()
    expect(fetchMock.mock.calls.some(([input]) => new URL(String(input), window.location.origin).pathname === '/api/briefs/validate')).toBe(false)
  })

  it('requires explicit lyric consent and shows screened, held and unavailable options without rendering audio', async () => {
    const user = userEvent.setup()
    const { fetchMock } = installMocks(false, { lyrics: true })
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Sign in with Entra External ID' }))
    await user.click(await screen.findByRole('button', { name: 'Open advanced lyric tools' }))
    const generate = screen.getByRole('button', { name: 'Generate 3 lyric options' })
    expect(generate).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: /I authorize paid Foundry/ }))
    await user.click(generate)
    expect(await screen.findByRole('heading', { name: 'Option 3' })).toBeVisible()
    expect(screen.getByText('human review required', { selector: 'p.status-badge' })).toBeVisible()
    expect(screen.getByText('duplicate option')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Use option 2' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Use option 3' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Generate 3 lyric options' })).toBeDisabled()
    const sent = fetchMock.mock.calls.filter(([input, init]) =>
      new URL(String(input), window.location.origin).pathname === '/api/lyrics/options' && init?.method === 'POST')
    expect(sent).toHaveLength(1)
    expect(JSON.parse(String(sent[0]?.[1]?.body))).toMatchObject({ brief_ids: ['brief-001'], confirm_paid_generation: true })
    expect(fetchMock.mock.calls.some(([input, init]) =>
      new URL(String(input), window.location.origin).pathname === '/api/renders' && init?.method === 'POST')).toBe(false)
  })

  it('collaborates per advertiser and confirms paid vocals on the exact MCP preview', async () => {
    const user = userEvent.setup()
    installDialogMock()
    const { fetchMock } = installMocks(false, { lyrics: true, vocals: true })
    const respond = fetchMock.getMockImplementation()!
    const draft = { option_id: 'chat-option', brief_id: 'brief-001', status: 'accepted', output: { hook: 'A warm hook', lyrics: 'A warm hook\nCall today' }, reasons: [], ai_generated: true, broadcast_approval_required: true }
    let written = false, built = false
    const preview = { ...output, run_id: 'mcp-job', variant: 'instrumental', lyric_source: { ...draft.output, option_id: draft.option_id }, composition_source: { job_id: 'mcp-job', option_id: draft.option_id, backing_sha256: 'b'.repeat(64) } }
    fetchMock.mockImplementation(async (input, init) => {
      const path = new URL(String(input), window.location.origin).pathname
      if (path === '/api/chat') {
        const body = JSON.parse(String(init?.body))
        if (body.action === 'discuss') return Response.json({ reply: 'Try a warm hook.', creative_direction: 'Warm and rhythmic' })
        if (body.action === 'write') { written = true; return Response.json({ option: draft }) }
        built = true
        return Response.json({ job_id: 'mcp-job' })
      }
      if (path === '/api/lyrics/options' && init?.method !== 'POST') return Response.json({ available: true, options: written ? [draft] : [] })
      if (path === '/api/outputs' && built) return Response.json({ outputs: [preview] })
      return respond(input, init)
    })
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Sign in with Entra External ID' }))
    const openAdvanced = () => user.click(screen.getByRole('button', { name: 'Open advanced lyric tools' }))
    await openAdvanced()
    const consent = () => screen.getByRole('checkbox', { name: /I authorize paid requests for the next chat/ })
    await user.type(screen.getByLabelText('Your message'), 'Make it warm')
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()
    await user.click(consent())
    await user.click(screen.getByRole('button', { name: 'Send message' }))
    expect(await screen.findByText('Try a warm hook.')).toBeVisible()
    expect(consent()).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Write a lyric draft' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: /Mosslight Garden Supply/ }))
    await openAdvanced()
    expect(screen.queryByText('Try a warm hook.')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Creative direction')).toHaveValue('')
    await user.click(within(screen.getByRole('complementary', { name: 'Advertisers' })).getByRole('button', { name: /Cedar Loop Bike Repair/ }))
    await openAdvanced()
    expect(screen.getByText('Try a warm hook.')).toBeVisible()
    await user.click(consent())
    await user.click(screen.getByRole('button', { name: 'Write a lyric draft' }))
    await user.click(await screen.findByRole('button', { name: 'Build MCP music preview' }))
    expect(await screen.findByRole('heading', { name: 'Your jingle versions' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Make it together.' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Estimate vocals on this arrangement' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('exact backing and syllable timing')
    const renderCalls = () => fetchMock.mock.calls.filter(([input, init]) => String(input).endsWith('/api/renders') && init?.method === 'POST')
    expect(renderCalls()).toHaveLength(0)
    await user.click(within(dialog).getByRole('button', { name: 'Confirm and render' }))
    expect(JSON.parse(String(renderCalls()[0]?.[1]?.body))).toMatchObject({
      lyric_selections: [{ brief_id: 'brief-001', option_id: 'chat-option' }],
      composition_selections: [{ brief_id: 'brief-001', job_id: 'mcp-job' }],
      confirmation: { input_fingerprint: 'a'.repeat(64) },
    })
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    await user.click(await screen.findByRole('button', { name: 'Sign in with Entra External ID' }))
    await openAdvanced()
    expect(screen.queryByText('Try a warm hook.')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Creative direction')).toHaveValue('')
  })

  it('reports a refused chat action, keeps the unsent message, and requires fresh consent', async () => {
    const user = userEvent.setup()
    const { fetchMock } = installMocks(false, { lyrics: true })
    const respond = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (input, init) => String(input).endsWith('/api/chat')
      ? Response.json({ detail: 'The MCP tool refused this request. Revise your message.' }, { status: 503 })
      : respond(input, init))
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Sign in with Entra External ID' }))
    await user.click(screen.getByRole('button', { name: 'Open advanced lyric tools' }))
    await user.type(screen.getByLabelText('Your message'), 'A new direction')
    await user.click(screen.getByRole('checkbox', { name: /I authorize paid requests for the next chat/ }))
    await user.click(screen.getByRole('button', { name: 'Send message' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Revise your message')
    expect(screen.getByLabelText('Your message')).toHaveValue('A new direction')
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()
    expect(screen.queryByText('Jingle advisor · MCP suggest_jingle')).not.toBeInTheDocument()
  })

  it('restores uploaded custom briefs within the identity session and clears them on sign-out', async () => {
    const user = userEvent.setup()
    const { logoutPopup } = installMocks()
    const first = render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Sign in with Entra External ID' }))
    await user.click(await screen.findByRole('button', { name: 'Enter or upload brief' }))
    await user.upload(screen.getByLabelText('Upload brief JSON'), new File(['{"name":"Bright Bike"}'], 'brief.json', { type: 'application/json' }))
    expect(await screen.findByRole('heading', { name: 'Bright Bike' })).toBeVisible()
    first.unmount()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Sign in with Entra External ID' }))
    expect(await screen.findByRole('button', { name: /Bright Bike/ })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(logoutPopup).toHaveBeenCalledExactlyOnceWith({
      account,
      postLogoutRedirectUri: `${window.location.origin}/auth-callback.html`,
    })
    expect(await screen.findByRole('button', { name: 'Sign in with Entra External ID' })).toBeVisible()
    expect(window.sessionStorage.length).toBe(0)
  })

  it('reports sign-out failures without presenting a signed-out workspace', async () => {
    const user = userEvent.setup()
    const { logoutPopup } = installMocks()
    logoutPopup.mockRejectedValueOnce(new Error('The sign-out window could not be opened.'))
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Sign in with Entra External ID' }))
    await user.click(await screen.findByRole('button', { name: 'Sign out' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('The sign-out window could not be opened.')
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Sign in with Entra External ID' })).not.toBeInTheDocument()
  })

  it('estimates optional vocals without dispatching until the user confirms the exact batch', async () => {
    const user = userEvent.setup()
    const show = vi.fn(function (this: HTMLDialogElement) { this.open = true })
    const close = vi.fn(function (this: HTMLDialogElement, result?: string) {
      this.returnValue = result ?? ''
      this.open = false
      this.dispatchEvent(new Event('close'))
    })
    Object.defineProperties(HTMLDialogElement.prototype, {
      showModal: { configurable: true, value: show },
      close: { configurable: true, value: close },
    })
    const { fetchMock } = installMocks(false, { vocals: true })
    const respond = fetchMock.getMockImplementation()
    if (!respond) throw new Error('Missing API test adapter')
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Sign in with Entra External ID' }))
    await user.click(screen.getByText('Batch tools', { selector: 'summary' }))
    await user.click(await screen.findByRole('checkbox', { name: 'Select Cedar Loop Bike Repair' }))
    await user.click(screen.getByRole('checkbox', { name: 'Include vocals (paid Azure voice)' }))
    await user.click(screen.getByRole('button', { name: 'Estimate vocal render' }))
    expect(await screen.findByRole('dialog')).toBeVisible()
    expect(show).toHaveBeenCalledOnce()
    const renderCalls = () => fetchMock.mock.calls.filter(([input, init]) =>
      new URL(String(input), window.location.origin).pathname === '/api/renders' && init?.method === 'POST')
    expect(renderCalls()).toHaveLength(0)
    fetchMock.mockImplementation(async (input, init) => {
      if (new URL(String(input), window.location.origin).pathname === '/api/renders' && init?.method !== 'POST') {
        return new Response(JSON.stringify({
          runs: [{
            run_id: 'paid-run', brief_ids: ['brief-001'], mode: 'azure', status: 'completed',
            attempt: { attempt_id: 'paid-attempt', status: 'submitted', estimated_cost_usd: '0.1' },
          }],
        }), { headers: { 'Content-Type': 'application/json' } })
      }
      return respond(input, init)
    })
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm and render' }))
    expect(renderCalls()).toHaveLength(1)
    expect(JSON.parse(String(renderCalls()[0]?.[1]?.body))).toMatchObject({
      brief_ids: ['brief-001'], mode: 'azure', confirmation: { brief_ids: ['brief-001'], estimated_cost_usd: '0.1' },
    })
    expect(await screen.findByRole('button', { name: 'Estimate vocal render' })).toBeDisabled()
    const vocals = screen.getByRole('checkbox', { name: 'Include vocals (paid Azure voice)' })
    expect(vocals).toBeChecked()
    expect(vocals).not.toBeDisabled()
    await user.click(vocals)
    await user.click(screen.getByRole('button', { name: 'Render instrumental preview' }))
    expect(renderCalls()).toHaveLength(2)
    expect(JSON.parse(String(renderCalls()[1]?.[1]?.body))).toMatchObject({ mode: 'instrumental' })
  })

  it('creates audio from the selected eligible lyric without applying the independent batch selection', async () => {
    const user = userEvent.setup()
    installDialogMock()
    const { fetchMock } = installMocks(false, { lyrics: true, vocals: true })
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Sign in with Entra External ID' }))
    await user.click(screen.getByText('Batch tools', { selector: 'summary' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select Mosslight Garden Supply' }))
    await user.click(screen.getByRole('button', { name: 'Open advanced lyric tools' }))
    expect(screen.getByRole('button', { name: 'Estimate voice + music' })).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: /I authorize paid Foundry/ }))
    await user.click(screen.getByRole('button', { name: 'Generate 3 lyric options' }))
    await user.click(await screen.findByRole('button', { name: 'Use option 1' }))
    expect(screen.getByRole('button', { name: 'Selected lyrics' })).toHaveAttribute('aria-pressed', 'true')
    const estimateButton = screen.getByRole('button', { name: 'Estimate voice + music' })
    expect(estimateButton.closest('.lyric-card')).toContainElement(screen.getByRole('button', { name: 'Selected lyrics' }))
    await user.click(estimateButton)
    const estimated = fetchMock.mock.calls.find(([input, init]) =>
      new URL(String(input), window.location.origin).pathname === '/api/renders/estimate' && init?.method === 'POST')
    expect(JSON.parse(String(estimated?.[1]?.body))).toMatchObject({
      brief_ids: ['brief-001'], lyric_selections: [{ brief_id: 'brief-001', option_id: 'accepted-option' }],
    })
    expect(screen.getByRole('dialog')).toHaveTextContent('selected lyric draft')
    expect(screen.getByRole('dialog')).toHaveTextContent('Option 1: Original hook')
    expect(screen.getByRole('dialog')).toHaveTextContent('Call today')
    expect(fetchMock.mock.calls.filter(([input, init]) =>
      new URL(String(input), window.location.origin).pathname === '/api/renders' && init?.method === 'POST')).toHaveLength(0)
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm and render' }))
    const rendered = fetchMock.mock.calls.find(([input, init]) =>
      new URL(String(input), window.location.origin).pathname === '/api/renders' && init?.method === 'POST')
    expect(JSON.parse(String(rendered?.[1]?.body))).toMatchObject({
      mode: 'azure', brief_ids: ['brief-001'],
      lyric_selections: [{ brief_id: 'brief-001', option_id: 'accepted-option' }],
      confirmation: { input_fingerprint: 'a'.repeat(64) },
    })
  })

  it('loads protected audio from a version row and reports playback failures explicitly', async () => {
    const user = userEvent.setup()
    const { fetchMock } = installMocks()
    const respond = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (input, init) => {
      if (new URL(String(input), window.location.origin).pathname === output.audio_url) return new Response(new Blob(['test audio'], { type: 'audio/wav' }))
      return respond(input, init)
    })
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:test-audio') })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Sign in with Entra External ID' }))
    await user.click(screen.getByRole('button', { name: 'Listen & review' }))
    const sourceChanges: MutationRecord[] = []
    const observer = new MutationObserver(changes => sourceChanges.push(...changes))
    observer.observe(screen.getByLabelText(/^Play version 1,/), {
      attributes: true, attributeFilter: ['src'],
    })
    await user.click(screen.getByRole('button', { name: 'Listen to version 1' }))
    observer.disconnect()
    expect(sourceChanges).toHaveLength(1)
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce()
    const audioRequest = fetchMock.mock.calls.find(([input]) => new URL(String(input), window.location.origin).pathname === output.audio_url)
    expect(new Headers(audioRequest?.[1]?.headers).get('Authorization')).toBe('Bearer test-access-token')
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new Error('Playback blocked; use the audio controls.'))
    await user.click(screen.getByRole('button', { name: 'Listen to version 1' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Playback blocked')
  })
})
