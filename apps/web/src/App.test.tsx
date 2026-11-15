import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
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

function installMocks(denyAccess = false) {
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
      ],
      '/api/render-options': {
        instrumental_available: true,
        speech_status: 'disabled',
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

    const outputsButton = screen.getByRole('button', { name: 'Rendered variants' })
    outputsButton.focus()
    await user.keyboard('{Enter}')
    expect(outputsButton).toHaveAttribute('aria-pressed', 'true')

    const brandInput = await screen.findByLabelText('Brand transcription')
    await user.type(brandInput, 'Cedar Loop')
    await user.click(screen.getByRole('button', { name: 'Evaluation status' }))
    await user.click(outputsButton)
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

    expect(await screen.findByRole('heading', { name: 'Choose synthetic briefs' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Manage access' })).not.toBeInTheDocument()
  })
})
