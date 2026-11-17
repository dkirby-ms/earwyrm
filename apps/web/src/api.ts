import type { IPublicClientApplication } from '@azure/msal-browser'
import { getAccessToken } from './auth'
import type { PublicConfig } from './types'

interface ApiRequestOptions {
  readonly method?: string
  readonly body?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

async function requestApi(
  client: IPublicClientApplication,
  config: PublicConfig,
  path: string,
  scopeSuffix: string,
  options: ApiRequestOptions = {},
): Promise<Response> {
  const endpoint = new URL(path, window.location.origin)
  if (endpoint.origin !== window.location.origin || !endpoint.pathname.startsWith('/api/')) {
    throw new Error('Refusing to send an API token outside this origin.')
  }

  const accessToken = await getAccessToken(client, config, scopeSuffix)
  const headers = new Headers({ Authorization: `Bearer ${accessToken}` })
  const request: RequestInit = {
    method: options.method ?? 'GET',
    headers,
    credentials: 'same-origin',
    cache: 'no-store',
  }

  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json')
    request.body = JSON.stringify(options.body)
  }

  const response = await fetch(endpoint, request)
  if (!response.ok) {
    let detail = `Request failed (${response.status}).`
    try {
      const payload: unknown = await response.json()
      if (isRecord(payload) && typeof payload.detail === 'string') {
        detail = payload.detail
      } else if (
        isRecord(payload) &&
        isRecord(payload.detail) &&
        typeof payload.detail.message === 'string'
      ) {
        detail = payload.detail.message
      } else if (isRecord(payload) && Array.isArray(payload.detail)) {
        const issues = payload.detail
          .filter(isRecord)
          .map(issue => typeof issue.msg === 'string' ? issue.msg : '')
          .filter(Boolean)
        if (issues.length) detail = issues.join('; ')
      }
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error
    }
    throw new Error(detail)
  }

  return response
}

/**
 * Sends an authenticated, no-store JSON request to a same-origin `/api/` path.
 *
 * @throws When the path leaves the same-origin API, token acquisition fails,
 *   the request fails, or the API returns a non-success status.
 */
export async function apiJson<T>(
  client: IPublicClientApplication,
  config: PublicConfig,
  path: string,
  scopeSuffix: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const response = await requestApi(client, config, path, scopeSuffix, options)
  const payload: unknown = await response.json()
  return payload as T
}

/**
 * Downloads a protected same-origin API resource as a Blob.
 *
 * @throws When the path leaves the same-origin API, token acquisition fails,
 *   the request fails, or the API returns a non-success status.
 */
export async function apiBlob(
  client: IPublicClientApplication,
  config: PublicConfig,
  path: string,
  scopeSuffix: string,
): Promise<Blob> {
  return (await requestApi(client, config, path, scopeSuffix)).blob()
}
