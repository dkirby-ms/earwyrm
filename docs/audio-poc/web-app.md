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
and evidence downloads. The TypeScript API validates access tokens and delegated
permissions; Speech credentials, evaluator answers, audio, and evaluation
records remain server-side.

These local instructions do not create or modify app registrations, provision
Azure resources, deploy services, or submit paid Speech requests. Each of
those actions remains a separate decision. For the Azure proof and its storage
limitations, see [Azure deployment](../azure-deployment.md).
Instrumental-only output is a workflow preview, not vocal proof.

Regenerate now creates a fresh musical identity, including melody intervals,
rhythm and harmony, not only a different key. The backing and vocal carrier
share the recorded composition seed. The private melody history screens each
new output before delivery; it does not enqueue a second render. See
[Melody and Arrangement MCP](../melody-mcp.md) for the independent service,
single queue ownership and similarity-screening limitations.

## Install and start locally

The applications are sibling npm workspaces:

```text
apps/
  api/          Node API, MCP services, audio tools and backend tests
  web/          React/Vite client and browser tests
infra/          Azure infrastructure
scripts/        Repository-level deployment tooling
```

Run npm commands from the repository root. One root lockfile installs both
workspaces; isolated dependency trees preserve their existing toolchain versions.
Fixtures and private data remain at their existing repository-root locations.

Run the Express API on loopback with Node.js 24 on Linux from the repository
root. Private-store serialization requires util-linux `flock`; both container
images include it:

```bash
npm ci
npm run dev:api
```

In a second terminal, start the React/Vite client:

```bash
npm run dev:web
```

Open `http://localhost:8000/` in your browser. Vite serves the client and
proxies same-origin `/api/` requests to Express on port `8001`. The app uses
the browser's current origin for its sign-in callback, so use `localhost`
rather than an IP address. Keep the existing Entra redirect URI
`http://localhost:8000/auth-callback.html`.

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
npm run dev:api
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

## Configure hosted PostgreSQL

The Azure Container App receives `EARWYRM_DATABASE_HOST`,
`EARWYRM_DATABASE_NAME`, and `EARWYRM_DATABASE_USER` as non-secret settings.
Its `EARWYRM_DATABASE_PASSWORD` comes from a versionless Key Vault reference
through the app's user-assigned managed identity and tracks the latest version.
Coordinate password rotation with the stopped-writer maintenance procedure in
the [deployment runbook](../azure-deployment.md#safe-updates-and-maintenance).
Do not copy the password into
GitHub variables, an azd environment, a Bicep parameter file, or command
arguments. The deployment identity and app identity have separate roles: the
deployment identity reads the secret for the secure provisioning reference;
the app identity reads only that secret at its scope.

When all four separate database fields are configured, the application builds
the PostgreSQL connection string with `sslmode=verify-full` and the system
certificate bundle. Configuration using `EARWYRM_DATABASE_URL` remains
available for local tools and tests, but it cannot be mixed with those fields.
Every URL that is not demonstrably loopback or a Unix socket must explicitly
set `sslmode=verify-full`. If `sslrootcert` is omitted, the application uses
the same system certificate bundle as the field-based path; a supplied CA path
is preserved. A non-TLS mode is allowed only for a clearly local target.
Unknown or conflicting host settings are treated as remote. Never use
`sslmode=disable` or `sslmode=require` for a remote database as a substitute
for certificate and hostname verification.

The mounted `/mnt/earwyrm` directory holds private media and working files;
PostgreSQL holds structured application records. Keep backups of both the
database and file data, including the original SQLite sources until cutover is
separately approved. Follow the [Azure deployment guide](../azure-deployment.md)
for the approved preview, provision, initialization/import, and deploy sequence,
private endpoint and private DNS, and coordinated password rotation. The web app refuses to
serve a missing or incomplete PostgreSQL initialization; provisioning alone
does not initialize the application store.

## Authorize application users

Valid External ID authentication and delegated scopes do not automatically
grant application access. A user who is unknown or disabled is denied access.
After signing in, use a protected API client to call `/api/identity` with the
`briefs.read` delegated scope. It returns only the caller's validated issuer and
subject. Verify those two values with the operator through a trusted channel;
do not share the access token.

Run hosted database administration, initialization and import commands from an
approved host with VNet connectivity and private DNS resolution. A standard
GitHub-hosted runner or internet-only laptop cannot reach the database; do not
enable public access as a workaround.

For an operator command against PostgreSQL, set `EARWYRM_DATA_DIR` to an
existing, empty absolute directory and set `EARWYRM_DATABASE_URL` securely in
the process environment. Require `sslmode=verify-full` and a trusted CA
certificate for the server. Initialize an empty target schema before
bootstrapping the owner:

```bash
npm run database -- initialize-fresh
```

This command refuses an existing source or target and does not migrate SQLite
data. Use it only when the source data directory and PostgreSQL target are both
empty. It is not a cutover command.

### Import existing SQLite data

Use the import command only after a separately approved maintenance window. Stop
and verify all app revisions, workers, and other writers before importing. Follow
the [deployment maintenance](../azure-deployment.md#safe-updates-and-maintenance)
and [backup and restore](../azure-deployment.md#backup-and-restore) procedures.
The backup must include the complete stopped data directory, including hidden
files, SQLite journals, the initialization marker, audio, and melody artifacts.

Set `EARWYRM_DATA_DIR` to the existing absolute data directory and provide
`EARWYRM_DATABASE_URL` through a secure process environment or secret reference.
Require `sslmode=verify-full` and a trusted CA certificate. The URL must point
to an empty PostgreSQL schema. Do not put database credentials in command
arguments, shell history, or logs. Then run:

```bash
npm run database -- import-sqlite
```

The command requires the existing `.earwyrm-initialized` marker and both SQLite
databases. It refuses to run while a cooperating writer holds the data-directory
lock, rejects unsupported or inconsistent schemas, and verifies database
integrity, relationships, JSON records, output manifests, referenced audio, and
melody artifact hashes. It creates both PostgreSQL schemas, imports the records,
checks row counts, and writes the PostgreSQL initialization marker last in one
transaction. A failure rolls back the PostgreSQL schema and data. The SQLite
databases, marker, and media remain in place; the command never switches the app
or deletes source data. A second import is refused because the target is no
longer empty.

Review the import result and verify the PostgreSQL-backed app before an
independently approved cutover. Keep the SQLite sources and backup. Returning to
SQLite is safe only before PostgreSQL accepts new writes. After that point, use a
separately approved reverse migration and reconciliation; do not point the app
at stale SQLite data.

Start the local web app once to create its local database. With
`ENTRA_EXPECTED_ISSUER` configured and `EARWYRM_DATA_DIR` set to the existing
absolute data directory, an operator can initialize the first account:

```bash
npm run database -- bootstrap-owner \
  --issuer 'https://verified-issuer.example.invalid' \
  --subject 'verified-subject'
```

Replace both example values with the verified caller's values. Bootstrap
creates exactly one enabled administrator with paid Speech entitlement and
refuses to run again, even if that account is later disabled. It does not
enable Speech spending. The issuer is bound to the store; another issuer
cannot be enrolled into it.

Operators can inspect and explicitly set access:

```bash
npm run database -- list-users
npm run database -- set-user \
  --issuer 'https://verified-issuer.example.invalid' \
  --subject 'verified-subject' --enabled yes --admin no --paid-speech no
```

The issuer must match `ENTRA_EXPECTED_ISSUER`. These commands manage only
application permissions; they do not create or alter External ID accounts.
Limit operator access to the private host and database.

An enabled administrator can also choose **Manage access** in the signed-in
workspace, review users, and set enabled, administrator, and paid Speech
permissions. Verify a new user's issuer and subject before saving. An
administrator who removes their own access may need an operator to restore it.
The API checks administrator privileges for every management request.

The vendored `@azure/msal-browser` assets are version `5.29.0`, from the npm
package's `lib/msal-browser.min.js` and
`lib/redirect-bridge/msal-redirect-bridge.min.js`, with the package MIT license at
[`apps/web/public/vendor/LICENSE`](../../apps/web/public/vendor/LICENSE). Its
SHA-384 checksums are:

```text
fb5be8a8da24358b1aa885dec45d24288ddcf56e0e1745cd72078cf484f489e87923edde744be924efaf4017c82e884d
a0cbfc7c857fa442839e4abb4eaf0eb47d073f3192a7dabf39368660baace44e88045e71eef26d14a9099101005c12e4
```

Verify the vendored file with:

```bash
sha384sum apps/web/public/vendor/msal-browser.min.js apps/web/public/vendor/msal-redirect-bridge.min.js
```

The Content Security Policy serves scripts, styles, and default resources from
the same origin. It allows identity `connect-src` and `frame-src` origins only
from the configured HTTPS authority and validated discovery metadata. It
disallows objects and framing by other sites. The callback alone permits
same-origin framing for silent token renewal and is served with `no-store`.
The app does not load scripts from a CDN.

Audio playback uses authenticated same-origin API requests followed by local
Blob URLs. The CSP permits these URLs only for media with
`media-src 'self' blob:`; script and default sources remain restricted.

## Listen to instrumental previews

Use the workspace navigation to switch between **Select briefs**,
**Evaluation status**, **Rendered variants**, and **Recent runs** without
losing the current selection or an unfinished evaluation. Paid usage awaiting
reconciliation remains visible across these views.

After rendering, the workspace opens **Rendered variants** to show the
completed outputs. Select **Load protected audio** on an output, then press
**Play** in its audio controls. You can also select **Download WAV**.

**Pending** is an evaluation status, not render progress, and does not block
playback. Instrumental previews remain Pending because they are not vocal
proof. **Recent render runs** reports whether rendering completed.

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
* An enabled application user with paid Speech entitlement
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
curl --fail http://localhost:8001/healthz
curl --fail http://localhost:8001/api/config
curl --include http://localhost:8001/api/briefs
```

The health check returns `200`. The configuration response reports
`setup-needed`; the protected brief route returns `503` until authentication
is configured. When configured, a missing bearer token returns `401`, an
invalid or unavailable identity configuration fails closed, and a valid token
without the required delegated scope returns `403`.

Run the local tests and checks without contacting a tenant or Speech service:

```bash
npm ci
npm run typecheck
npm test
npm run build
```

These root checks cover both workspaces. Use `npm run test:api` or
`npm run test:web` for a targeted suite, or pass `--workspace @earwyrm/api`
or `--workspace @earwyrm/web` to an individual workspace script.

Use fake MSAL and API responses for browser workflow checks. Do not use a real
tenant token or enable paid Speech as part of routine validation.
