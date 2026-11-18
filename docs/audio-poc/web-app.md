---
title: Use the web workspace
description: Configure local sign-in, preview music, and review jingle versions.
---

[Back to the README](../../README.md)

Use the web workspace to create and compare versions for one advertiser.
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

### Authorize an application user

Sign-in alone does not grant application access. Use a protected API client
with the `briefs.read` scope to get the caller's validated issuer and subject
from `/api/identity`. Verify both with the operator through a trusted channel.

For local SQLite, start the API once to create the store. With the same
`ENTRA_EXPECTED_ISSUER` and private data directory configured for the operator
shell, enroll the first administrator:

```bash
npm run database -- bootstrap-owner \
  --issuer 'https://verified-issuer.example.invalid' \
  --subject 'verified-subject'
```

Replace the example values with the verified identity. This one-time operation
grants paid Speech entitlement but does not enable spending. Use **Manage
access** as an enabled administrator to enroll or update other users; operators
can also use `npm run database -- --help`.

## Create and review a jingle

1. Select a sample advertiser, or use **Enter or upload brief** to supply your
   own. **View brief** shows the facts and call to action (CTA).
2. In **Create**, select **Preview music only**. A lyric selection and paid
   voice request are not required.
3. In **Listen & review**, select **Listen to version**, **Review this
   version**, or **Download WAV**. Use **Generation history** to find earlier
   runs.

For JSON upload, provide one object with `name`, `offer`, `location`,
`contact_details` (`email` and `phone`), `tone`, `approved_claims`, and `cta`.
Do not include a brief ID or extra fields. Use printable ASCII text, one to
twenty approved claims, and a file no larger than 24,000 bytes. Keep your
original JSON: validated but unused custom briefs are session drafts.

**Batch tools** renders one to three briefs using their original scripts, not
the lyric selected in **Create**. Instrumental results stay **Pending** for
evaluation, even after rendering completes; they do not prove vocal quality.
See [how to evaluate output](rendering.md#evaluate-output).

### Create together with MCP chat

In **Create**, use **Make it together** to describe a mood, pace, or revision.
Authorize paid requests for each **Send message** or **Write a lyric draft**
action. Review or edit the suggested **Creative direction**, choose a lyric
style, and write a screened draft. Suggestions cannot change the approved facts
in the brief, and held drafts cannot build audio.

Select an accepted option and choose **Build MCP music preview**. This makes
no cloud requests. After a disconnect, retry that same option to recover the
same arrangement rather than creating another. Use **Listen & review** to
hear its protected instrumental preview.

Choose **Estimate vocals on this arrangement** to add voices to the exact
backing and syllable timing, then explicitly confirm the Speech estimate.
The ordinary **Estimate voice + music** action still creates a separate
arrangement; it does not reuse an MCP preview. Spoken and sung mixes over an MCP
preview preserve its duration. Sung demos use approximate word slicing, not
natural singing, and still need producer and advertiser approval.

The latest twelve conversation messages stay in page memory for each
advertiser. They clear on reload or sign-out. Accepted drafts and music
previews are saved server-side. Errors keep your unsent message; revise it and
authorize the next paid action again.

## Enable paid options only with approval

* Chat and lyrics: Set `LYRIC_ENABLED=true` and configure the server-side Foundry and
  Content Safety settings in [Services and contracts](../service-contracts.md#lyric-writer).
  An enabled user with paid Speech entitlement can authorize chat, one draft,
  or **Generate 3 lyric options**. These actions incur separate charges. The
  server reserves a worst-case amount against its text budget before each
  action; this is not an estimate of the actual bill. Only accepted drafts can
  be selected with **Use option**; human
  review is still required before distribution.
* Voice: Set `SPEECH_ENABLED=true`, server-only `SPEECH_KEY` and
  `SPEECH_REGION`, and positive `SPEECH_PER_RUN_CAP_USD` and
  `SPEECH_TOTAL_BUDGET_USD` limits. Provide valid
  [Speech rate evidence](rendering.md#render-with-paid-speech) using
  `SPEECH_EVIDENCE_PATH` if it is outside the default location. An enabled,
  entitled user selects **Estimate voice + music** for an accepted draft and
  confirms the estimate. Changing the draft requires a new estimate. In
  **Batch tools**, use **Include vocals** and **Estimate vocal render**.

Paid voice stays blocked until prior attempts are reconciled with billing
evidence. After a disconnect, reload to check status rather than resubmitting.
The [Azure runbook](../azure-deployment.md#opt-in-to-paid-ai) covers the
default-off deployment and how to enable approved paid capabilities.

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
