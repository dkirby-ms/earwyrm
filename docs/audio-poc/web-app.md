---
title: Run the protected audio web POC
description: Configure and run the local Entra External ID web workflow without changing the tenant or enabling paid Speech requests
ms.date: 2026-11-13
ms.topic: how-to
---

## Scope and boundaries

The web POC adds a same-origin browser workflow to the local audio proof. It
supports Entra External ID sign-in, synthetic brief selection, offline
instrumental rendering, comparison, unblinded evaluation, and protected audio
and evidence downloads. The Python API validates access tokens and delegated
permissions; Speech credentials, evaluator answers, audio, and evaluation
records remain server-side.

This is a local proof, not a production deployment. It does not create or
modify app registrations, provision Azure resources, deploy services, or submit
paid Speech requests. Each of those actions remains a separate decision.
Instrumental-only output is a workflow preview, not vocal proof.

## Install and start locally

From the repository root, install the locked dependencies and start Uvicorn on
loopback:

```bash
uv sync --locked
uv run uvicorn audio_poc.web_app:app --host localhost --port 8000
```

Open `http://localhost:8000/` in your browser. The app uses the browser's
current origin for its sign-in callback, so use `localhost` rather than an IP
address. Register `http://localhost:8000/auth-callback.html` in Entra.

The process reads configuration from its environment. It does not automatically
load `.env` files. Supply tenant values through your local shell or an approved
secret-management tool, and do not put credentials in command arguments, source
control, or chat.

To use the secret-free [example](../../.env.example), copy it without
overwriting an existing `.env`, restrict its permissions, and edit it locally:

```bash
cp -n .env.example .env
chmod 600 .env
```

The example identity values and domain are fictional. Replace all six Entra
values with the actual registration and discovery metadata values; the example
does not authenticate and reports identity as unavailable. Leave all six empty
instead to run in setup-needed mode. Copying does not update an existing `.env`.

In a shell, load the trusted file before starting the server:

```bash
set -a
source .env
set +a
uv run uvicorn audio_poc.web_app:app --host localhost --port 8000
```

`source` executes shell syntax, so load only a file you trust and quote values
containing shell-special characters. `.env` and `.env.*` are ignored by Git,
except for `.env.example`; ignoring a file is not a secret-management system.

Without External ID configuration, the page displays **Sign-in setup
required**, `/api/config` reports `setup-needed`, and protected API routes
return `503`. Partial or invalid configuration fails closed as unavailable.
`/healthz` is a local process-health check and does not contact the tenant.

## Configure the existing External ID registrations

Use the existing tenant and its tenant-specific CIAM authority. Copy values from
the app registrations and that tenant's OpenID Connect discovery metadata.
Do not substitute a workforce, `common`, or guessed issuer. No tenant values or
registration changes are included in this repository.

The usual separation is two app registrations in the external tenant:

* The browser SPA registration identifies the app that signs users in and
  requests delegated access to the API. Use its **Application (client) ID**
  for `ENTRA_CLIENT_ID`. In **Authentication**, its SPA redirect URI must
  match the browser origin followed by `/auth-callback.html`, for example
  `http://localhost:8000/auth-callback.html` for the local command above.
  This callback is required for MSAL Browser 5 popup and silent flows.
* The web API registration identifies the protected resource. Its **Expose an
  API** settings provide the Application ID URI and delegated scopes. The
  browser registration needs permission and consent for those scopes.

These are distinct roles, not a confirmation that two registrations already
exist in your tenant. The app does not check the number of registrations. If
the current configuration uses separate registrations, do not put the API's
client ID in `ENTRA_CLIENT_ID`. Find each application under **App
registrations** in the external tenant and use its **Overview** page for its
Application (client) ID, not its object ID or the directory (tenant) ID.
Creating or changing registrations, redirect URIs, scopes, permissions, or
consent requires separate approval.

| Environment variable | Source and contract |
|----------------------|---------------------|
| `ENTRA_CLIENT_ID` | Application (client) ID from the browser SPA registration's **Overview** page |
| `ENTRA_AUTHORITY` | The existing tenant's HTTPS CIAM authority |
| `ENTRA_METADATA_URL` | The HTTPS OpenID Connect discovery document for that tenant |
| `ENTRA_EXPECTED_ISSUER` | The exact `issuer` value published by that discovery document |
| `ENTRA_AUDIENCE` | Exact `aud` expected in access tokens for the API. For v2.0 access tokens, this is the API registration's Application (client) ID; v1.0 token audiences can differ |
| `ENTRA_API_SCOPE_PREFIX` | Application ID URI from the API registration's **Expose an API** page, without a trailing slash |

For example, with fictional SPA ID `11111111-1111-1111-1111-111111111111`
and API ID `22222222-2222-2222-2222-222222222222`, a v2.0 configuration
could use:

```text
ENTRA_CLIENT_ID=11111111-1111-1111-1111-111111111111
ENTRA_AUDIENCE=22222222-2222-2222-2222-222222222222
ENTRA_API_SCOPE_PREFIX=api://22222222-2222-2222-2222-222222222222
```

The API's actual Application ID URI need not use that example format. Use the
registered value and configure the expected audience for the access-token
version your API receives. Never paste access tokens or secrets into chat or
online token decoders. See Microsoft's
[access token claims reference](https://learn.microsoft.com/en-us/entra/identity-platform/access-token-claims-reference)
and [API scope configuration guide](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-configure-app-expose-web-apis).

The authority and discovery document must use the same HTTPS origin. The
published JWKS URI must also use that origin. The issuer must be an HTTPS URL
and match discovery metadata and token claims exactly, but its host can differ
from the authority. Copy the `issuer` value directly from the discovery
document rather than constructing it from the authority.

The configured API reads discovery metadata to build its CSP and validate
readiness and tokens; it fetches signing keys for readiness and token
validation. The browser uses the client ID, authority, and scope prefix; the
API keeps issuer, audience, and metadata validation server-side.

The POC expects these delegated API scope suffixes:

| Scope suffix | Protected operation |
|--------------|---------------------|
| `briefs.read` | List synthetic briefs |
| `renders.read` | Read run, render-option, output, and POC status |
| `renders.write` | Render, estimate, and reconcile a paid attempt |
| `evaluations.write` | Submit an output evaluation |
| `outputs.read` | Fetch protected audio and evidence |

Expose and grant the exact delegated scopes in the existing registration only
if that change is separately approved. The SPA requests the full configured
scope URI for each operation. It uses MSAL Browser authorization-code/PKCE
flow, session storage, and a same-origin redirect URI. Tokens are sent in
`Authorization` headers, never in URLs.

The vendored `@azure/msal-browser` assets are version `5.29.0`, from the npm
package's `lib/msal-browser.min.js` and
`lib/redirect-bridge/msal-redirect-bridge.min.js`, with the package MIT license at
[`audio_poc/web/vendor/LICENSE`](../../audio_poc/web/vendor/LICENSE). Its
SHA-384 checksums are:

```text
fb5be8a8da24358b1aa885dec45d24288ddcf56e0e1745cd72078cf484f489e87923edde744be924efaf4017c82e884d
a0cbfc7c857fa442839e4abb4eaf0eb47d073f3192a7dabf39368660baace44e88045e71eef26d14a9099101005c12e4
```

Verify the vendored file with:

```bash
sha384sum audio_poc/web/vendor/msal-browser.min.js audio_poc/web/vendor/msal-redirect-bridge.min.js
```

The Content Security Policy serves scripts, styles, and default resources from
the same origin. It allows identity `connect-src` and `frame-src` origins only
from the configured HTTPS authority and validated discovery metadata. It
disallows objects and framing by other sites. The callback alone permits
same-origin framing for silent token renewal and is served with `no-store`.
The app does not load scripts from a CDN.

## Local audio and evaluation storage

By default, the API stores its SQLite database and audio under
`.earwyrm-data/` at the repository root, regardless of the current working
directory:

* `.earwyrm-data/earwyrm.sqlite3` stores run, ownership, evaluation, and paid
  attempt records.
* `.earwyrm-data/audio/` stores generated WAV files.
* `.earwyrm-data/work/` holds temporary render work.

Set `EARWYRM_DATA_DIR` to an absolute path to select another local data root.
The API creates the root, `audio/`, and `work/` directories with owner-only
`0700` permissions and the database and audio files with owner-only `0600`
permissions. The default root is listed in `.gitignore`; verify it with:

```bash
git check-ignore -v .earwyrm-data/earwyrm.sqlite3
```

Storage is local to this POC. There is no cloud storage, automatic expiry,
backup, or production retention policy. Stop the local server and manually
delete the selected data root when its records are no longer needed. Deletion
does not guarantee secure erasure on every filesystem or backup system.

## Optional paid Speech rendering

Paid Speech rendering is disabled by default with `SPEECH_ENABLED=false`.
Offline instrumental rendering does not construct the Speech provider or make
provider/network calls. Do not enable the paid path until a separate
user/operator decision explicitly authorizes spending and configures all
server-side prerequisites.

The paid path requires:

* `SPEECH_ENABLED=true`
* `SPEECH_ALLOWED_SUBJECT` set to the one permitted access-token `sub`
* `SPEECH_KEY` and `SPEECH_REGION` in the server environment
* `SPEECH_PER_RUN_CAP_USD` and `SPEECH_TOTAL_BUDGET_USD` set to finite,
  positive limits
* Valid resource and rate evidence, optionally selected with
  `SPEECH_EVIDENCE_PATH`

Keep the Speech key on the server. Never add it to the static client, browser
configuration, logs, or evidence files. See the [rendering guide](rendering.md)
for the evidence fields and rights considerations. The committed sample
evidence contains placeholders and cannot authorize a paid render.

Before dispatch, the API recomputes the selected briefs' estimate and requires
an explicit confirmation bound to those exact brief IDs and that estimate. It
reserves cumulative budget durably and serializes paid work to one attempt. The
client does not retry or cancel a paid request. Every attempt, including failed
or unknown usage, remains blocked until its actual metered cost is reconciled
with a billing evidence reference. After a disconnect, reload the page to
recover run status; do not submit another request.

## Verify the local setup

With the server running and tenant values unset, check the loopback endpoints:

```bash
curl --fail http://localhost:8000/healthz
curl --fail http://localhost:8000/api/config
curl --include http://localhost:8000/api/briefs
```

The health check returns `200`. The configuration response reports
`setup-needed`; the protected brief route returns `503` until authentication
is configured. When configured, a missing bearer token returns `401`, an
invalid or unavailable identity configuration fails closed, and a valid token
without the required delegated scope returns `403`.

Run the local tests and checks without contacting a tenant or Speech service:

```bash
uv run pytest -q
uv run ruff check audio_poc tests
uv run ruff format --check audio_poc tests
uv lock --check
uv sync --locked
```

Use fake MSAL and API responses for browser workflow checks. Do not use a real
tenant token or enable paid Speech as part of routine validation.
