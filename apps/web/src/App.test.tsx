import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

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

function installMocks(denyAccess = false, capabilities: { lyrics?: boolean; vocals?: boolean } = {}) {
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
    logoutPopup = vi.fn(async () => undefined)
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
      '/api/access': {
        issuer: 'https://identity.example.test/tenant/v2.0',
        subject: 'current-user',
        admin: true,
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
              { status: 'accepted', output: { hook: 'Original hook', lyrics: 'Original hook\nCall today' }, reasons: [], ai_generated: true, broadcast_approval_required: true },
              { status: 'human_review_required', output: { hook: 'Another hook', lyrics: 'Another hook\nCall today' }, reasons: ['risky_claims_require_human_review'], ai_generated: true, broadcast_approval_required: true },
              { status: 'unavailable', output: null, reasons: ['duplicate_option'], ai_generated: true, broadcast_approval_required: true },
            ],
          }
        : { available: Boolean(capabilities.lyrics), option_count: 3 },
      '/api/render-options': {
        instrumental_available: true,
        speech_status: capabilities.vocals ? 'available' : 'disabled',
      },
      '/api/renders/estimate': { brief_ids: ['brief-001'], estimated_cost_usd: '0.1' },
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
      '/api/admin/users': {
        users: [
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
        ],
      },
    }

    if (path === '/api/access' && denyAccess) {
      return new Response(JSON.stringify({ detail: 'Application access denied' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })
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
  return { fetchMock }
}

afterEach(() => {
  cleanup()
  window.sessionStorage.clear()
  vi.restoreAllMocks()
  for (const [name, descriptor] of Object.entries(originalDialogMethods)) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor)
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name)
  }
  vi.unstubAllGlobals()
  Reflect.deleteProperty(window, 'msal')
})

describe('React workspace', () => {
  it('preserves form state across navigation and clears permissions when the subject changes', async () => {
    const user = userEvent.setup()
    const { fetchMock } = installMocks()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Sign in with Entra External ID' }))
    const briefCheckbox = await screen.findByRole('checkbox', {
      name: /Cedar Loop Bike Repair/,
    })
    expect(briefCheckbox).not.toBeChecked()
    await user.click(briefCheckbox)
    expect(briefCheckbox).toBeChecked()

    const outputsButton = screen.getByRole('button', { name: 'Variants' })
    outputsButton.focus()
    await user.keyboard('{Enter}')
    expect(outputsButton).toHaveAttribute('aria-pressed', 'true')

    const brandInput = await screen.findByLabelText('Brand transcription')
    await user.type(brandInput, 'Cedar Loop')
    await user.click(screen.getByRole('button', { name: 'Brief' }))
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

  it('shows an access error and the verified identity when enrollment is denied', async () => {
    const user = userEvent.setup()
    installMocks(true)
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Sign in with Entra External ID' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Application access denied')
    expect(
      await screen.findByRole('heading', { name: 'Application access required' }),
    ).toBeInTheDocument()
    expect(screen.getByText('current-user')).toBeInTheDocument()
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

    expect(await screen.findByRole('heading', { name: 'Loaded briefs' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Manage access' })).not.toBeInTheDocument()
  })

  it('keeps inspected briefs, batch selection and recent-run inspection independent', async () => {
    const user = userEvent.setup()
    installMocks()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Sign in with Entra External ID' }))
    const selected = await screen.findByRole('checkbox', { name: 'Select Cedar Loop Bike Repair' })
    await user.click(selected)
    await user.click(screen.getByRole('button', { name: /Mosslight Garden Supply/ }))
    expect(screen.getByRole('heading', { name: 'Mosslight Garden Supply' })).toBeVisible()
    expect(selected).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Select Mosslight Garden Supply' })).not.toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Render instrumental preview' }))
    expect(screen.getByRole('heading', { name: 'Mosslight Garden Supply' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Brief details' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: /instrumental · completed/ }))
    expect(screen.getByRole('heading', { name: 'Cedar Loop Bike Repair' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Rendered variants' })).toBeVisible()
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
    await user.click(await screen.findByRole('button', { name: 'Lyrics' }))
    const generate = screen.getByRole('button', { name: 'Generate 3 lyric options' })
    expect(generate).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: /I authorize paid Foundry/ }))
    await user.click(generate)
    expect(await screen.findByRole('heading', { name: 'Option 3' })).toBeVisible()
    expect(screen.getByText('human review required', { selector: 'p.status-badge' })).toBeVisible()
    expect(screen.getByText('duplicate option')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Generate 3 lyric options' })).toBeDisabled()
    const sent = fetchMock.mock.calls.filter(([input, init]) =>
      new URL(String(input), window.location.origin).pathname === '/api/lyrics/options' && init?.method === 'POST')
    expect(sent).toHaveLength(1)
    expect(JSON.parse(String(sent[0]?.[1]?.body))).toMatchObject({ brief_ids: ['brief-001'], confirm_paid_generation: true })
    expect(fetchMock.mock.calls.some(([input, init]) =>
      new URL(String(input), window.location.origin).pathname === '/api/renders' && init?.method === 'POST')).toBe(false)
  })

  it('restores uploaded custom briefs within the identity session and clears them on sign-out', async () => {
    const user = userEvent.setup()
    installMocks()
    const first = render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Sign in with Entra External ID' }))
    await user.click(await screen.findByRole('button', { name: 'Enter or upload brief' }))
    await user.upload(screen.getByLabelText('Upload brief JSON'), new File(['{"name":"Bright Bike"}'], 'brief.json', { type: 'application/json' }))
    expect(await screen.findByRole('heading', { name: 'Bright Bike' })).toBeVisible()
    first.unmount()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Sign in with Entra External ID' }))
    expect(await screen.findByRole('checkbox', { name: 'Select Bright Bike' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('button', { name: 'Sign in with Entra External ID' })).toBeVisible()
    expect(window.sessionStorage.length).toBe(0)
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
})
