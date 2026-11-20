---
title: Use the web workspace
description: Configure local sign-in, generate AI jingles, and review provider costs.
---

[Back to the README](../../README.md)

Use the web workspace to turn a description into a jingle with music and voice.
Start the API and client using the [README quickstart](../../README.md#open-the-web-workspace).
For hosted setup and database maintenance, use the [Azure runbook](../azure-deployment.md).

## Set up local sign-in

Use an existing Microsoft Entra External ID tenant with a browser SPA and a
protected API. The SPA redirect URI must include
`http://localhost:8000/auth-callback.html`. Registration or consent changes
require tenant-owner approval.

Set these variables in the API process environment and restart the API. Use
[`.env.example`](../../.env.example) as a template, not as working credentials.
The API does not automatically load `.env` files.

| Variable | Value |
|---|---|
| `ENTRA_CLIENT_ID` | Browser SPA application (client) ID |
| `ENTRA_AUTHORITY` | Existing tenant's HTTPS CIAM authority |
| `ENTRA_METADATA_URL` | Tenant's OpenID Connect discovery URL |
| `ENTRA_EXPECTED_ISSUER` | Exact `issuer` from discovery metadata |
| `ENTRA_AUDIENCE` | Expected access-token `aud`; for v2.0 tokens, the API application (client) ID |
| `ENTRA_API_SCOPE_PREFIX` | API Application ID URI without a trailing slash |

Use discovery metadata and signing keys on the authority's HTTPS origin. Copy
the issuer exactly; its host can differ from the authority. The SPA needs
permission and consent for the API's delegated scopes: `briefs.read`,
`renders.read`, `renders.write`, `evaluations.write`, and `outputs.read`.
Do not share access tokens.

### Request or grant application access

Sign-in alone does not grant application access. If you are signed in but
cannot open the workspace, select **Request access**. The API binds the request
to your validated identity; you do not enter a subject or email address. The
workspace shows when your request is pending or denied; you can submit another
request after a denial. After approval, reload the workspace to continue.

An enabled administrator can open **Manage access** to review pending requests
and grant or deny them without entering the requester's subject. Granting gives
application access, including **Generate jingle** when the server is configured.
Administrator and legacy paid Speech permissions remain off.
These changes do not modify External ID accounts.

Pending requests show the requester's email alongside their subject. Email comes
from the validated access token's `email` or `emails` claim and is display
information only; access remains tied to issuer and subject. Requests without an
email claim, including older requests, show **Email unavailable**. Submitting the
request again with an email-bearing token refreshes a pending request's email
without changing its place in the queue. SQLite adds this field on initialization;
PostgreSQL adds it through the existing additive database upgrade path.

For local SQLite, start the API once to create the store. With the same
`ENTRA_EXPECTED_ISSUER` and private data directory configured for the operator
shell, bootstrap the first administrator:

```bash
npm run database -- bootstrap-owner \
  --issuer 'https://verified-issuer.example.invalid' \
  --subject 'verified-subject'
```

Replace the example values with the verified identity. This one-time operation
grants paid Speech entitlement but does not enable spending. After bootstrap,
the administrator can manage pending access requests and edit existing
application permissions. Operators can also use
`npm run database -- --help`.

## Create and review a jingle

1. Describe the jingle in a few sentences. Include the business or product
   name and, if useful, what it offers, the mood, or an exact call to action.
   There is no brief to upload.
2. Check the cost estimate, then select **Generate jingle**. This starts the
   paid request without a separate confirmation. The server screens the lyrics,
   uses Foundry to compose the score, and mixes Azure Speech with that score.
   It does not substitute seeded music if a stage fails.
3. Follow the generation timeline. It highlights the current step as the
   server reports it; short steps may pass between updates. If updates become
   unavailable, the page still waits for the original generation request.
4. Listen and review the demo on the same page. Generation is not broadcast
   approval. If the connection drops, check the page for a result before making
   another request. A failed generation can still incur provider charges.

## Understand costs

The estimate before generation is an upper bound based on configured model
and screening limits, bounded retries, and the maximum Speech input. Afterward,
the exact character count gives a narrower Speech estimate. Neither is an
invoice. The amounts cover provider calls, not hosting.

Record actual Speech and, when attributable, actual Foundry and Content Safety
charges with a billing evidence reference. A combined actual cost is available
only when both amounts are recorded. For the shared budget, a jingle counts for
at least its Speech estimate even after reconciliation. An uncertain Speech
attempt blocks further generation until it is reconciled.

## Manage budgets

Open **Manage access**, then **Budgets and usage**. Administrators can inspect
shared AI/safety and Speech usage, recorded actual charges, and individual
lifetime balances. Select **Edit AI budget**, **Edit Speech budget**, or
**Edit budget for** a user to open the budget dialog without leaving your place
on the page. Enter the new total and select **Save budget limit**, or select
**Cancel** or press Escape to discard the edit.
Use **Refresh budgets** to reload current usage.

Every user, including administrators and existing enabled users, defaults to a
$5 lifetime trial allowance across paid chat, lyrics, score composition, and
Speech. Existing attributable usage counts toward that allowance. The creation
workspace shows the current balance. Free previews remain free.

An allowance is a total spending ceiling, not a top-up amount. To grant another
$5 to a user with a $5 limit, set the limit to $10. Limits accept zero and up to
12 decimal places. Lowering a limit below current usage leaves history intact,
shows zero remaining, and prevents further paid reservations. Allowances do not
reset monthly. Subscription billing and automatic premium grants are not
implemented.

Shared limits initially use `LYRIC_TOTAL_BUDGET_USD` and
`SPEECH_TOTAL_BUDGET_USD`. Saved database overrides take precedence over those
totals on subsequent reservations and survive restarts. Shared and per-user
limits both apply; changing them does not enable disabled services, grant
permissions, change price estimates, bypass reconciliation, or raise
per-operation safety caps.

Charged or reserved usage is conservative, not an invoice: text reservations
retain their worst-case ceilings, and jingle Speech retains at least its
estimate after reconciliation. Recorded actuals include only submitted billing
evidence. Historical text reservations without owner information remain in the
shared total and are shown separately; they are not assigned to a guessed user.
Actual records are read-only here. Use the existing reconciliation workflow to
record provider charges, rather than altering historical usage to grant credit.

Budget endpoints are `GET /api/budget` for the caller's own balance and
`GET/PUT /api/admin/budgets` for administrators. Writes require `renders.write`
and current enabled administrator permission. The strict write body contains
`scope` (`text`, `speech`, or `user`) and decimal-string `limit_usd`; user updates
also require an existing user's `owner` subject. Actual charges and usage
counters are not writable through this endpoint.

SQLite adds budget storage and nullable lyric ownership on initialization.
PostgreSQL uses the existing additive upgrade path; see the
[Azure runbook](../azure-deployment.md#shared-ai-configuration). Neither upgrade
resets usage or grants new permissions.

## Configure generation

Configure Foundry, Content Safety, and Speech using the
[shared AI configuration](../azure-deployment.md#shared-ai-configuration).
For local development, follow the server-side
[lyric writer configuration](../service-contracts.md#lyric-writer) and
[Speech prerequisites](rendering.md#render-with-paid-speech). Enabled users
can generate when provider configuration and budgets permit. The original CLI
experiments and lower-level endpoints are not part of the browser workflow.

## Troubleshoot and find local files

* **Sign-in setup required**: With no Entra settings, `/api/config` reports
  `setup-needed`. Partial or invalid settings fail closed. Use
  [the API health endpoint](http://localhost:8001/healthz) to check that the
  process is running independently of sign-in.
* **Signed in but denied**: Verify the delegated scopes and the application's
  enabled-user record for that issuer and subject.
* **Find audio and evaluations**: The API defaults to `.earwyrm-data/` at the
  repository root. Set `EARWYRM_DATA_DIR` to an absolute private path to
  override it. Keep this data out of source control; the local POC does not
  expire or back it up automatically.
