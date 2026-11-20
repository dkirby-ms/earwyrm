import type {
  AccountInfo,
  AuthenticationResult,
  IPublicClientApplication,
} from '@azure/msal-browser'
import type { PublicConfig } from './types'

declare global {
  interface Window {
    msal?: typeof import('@azure/msal-browser')
  }
}

/** An initialized MSAL client and the account selected for this session. */
export interface AuthContext {
  readonly client: IPublicClientApplication
  readonly account: AccountInfo | null
}

/**
 * Initializes the vendored MSAL client using the API's public identity settings.
 *
 * @throws When the MSAL asset or required public settings are unavailable, or
 *   the configured authority does not use HTTPS.
 */
export async function initializeAuth(config: PublicConfig): Promise<AuthContext> {
  const msal = window.msal
  if (!msal || !config.client_id || !config.authority || !config.scope_prefix) {
    throw new Error('The pinned MSAL client or public identity configuration is unavailable.')
  }

  const authority = new URL(config.authority)
  if (authority.protocol !== 'https:') {
    throw new Error('The configured identity authority must use HTTPS.')
  }

  const client = new msal.PublicClientApplication({
    auth: {
      clientId: config.client_id,
      authority: config.authority,
      knownAuthorities: [authority.host],
      redirectUri: `${window.location.origin}/auth-callback.html`,
    },
    cache: { cacheLocation: msal.BrowserCacheLocation.SessionStorage },
  })

  await client.initialize()
  const redirectResult: AuthenticationResult | null = await client.handleRedirectPromise()
  if (redirectResult?.account) client.setActiveAccount(redirectResult.account)

  const account = client.getActiveAccount() ?? client.getAllAccounts()[0] ?? null
  if (account) client.setActiveAccount(account)

  return { client, account }
}

/**
 * Gets an API access token, prompting only when silent acquisition requires interaction.
 *
 * @param scopeSuffix - One of the delegated API scope names configured by the service.
 * @param interactive - Whether this request can prompt if silent acquisition requires interaction.
 * @throws When no account is signed in or token acquisition fails.
 */
export async function getAccessToken(
  client: IPublicClientApplication,
  config: PublicConfig,
  scopeSuffix: string,
  interactive = true,
): Promise<string> {
  const account = client.getActiveAccount() ?? client.getAllAccounts()[0]
  if (!account) throw new Error('Sign in before using the workspace.')
  client.setActiveAccount(account)

  const request = { scopes: [`${config.scope_prefix}/${scopeSuffix}`], account }
  try {
    return (await client.acquireTokenSilent(request)).accessToken
  } catch (error) {
    const msal = window.msal
    if (!interactive || !msal || !(error instanceof msal.InteractionRequiredAuthError)) throw error
    return (await client.acquireTokenPopup(request)).accessToken
  }
}
