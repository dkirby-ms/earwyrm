---
title: Deploy the Azure foundation
description: Prerequisites, identity boundaries, deployment, smoke checks and teardown for the non-generating service foundation.
---

## What this deployment provides

[azure.yaml](../azure.yaml) and [infra/main.bicep](../infra/main.bicep) define
three Python 3.12 Container Apps (`web`, `lyric`, `melody`), a queue-triggered
`render` job, and their supporting Azure resources. Shared schemas are described
in [service contracts](./service-contracts.md). The audio path is vocoded vocals
with a spoken-tagline fallback, based on the user's audio-proof pass attestation.
That attestation is not independent listening evidence or rights clearance.

> [!IMPORTANT]
> These are deployment scaffolds, not a functioning generator. Health reports
> `generation_available: false`. HTTP job submission returns 501, MCP tools return
> an explicit not-integrated error, and the worker exits 2 without consuming or
> acknowledging any message. Existing local POC services remain separate.

Keep the `render` queue empty until a durable worker is integrated. Messages can
otherwise trigger repeated failed executions and charges. The foundation does
not upload briefs, generate audio, collect approvals or export application traces.
Container diagnostics are connected to Log Analytics; Application Insights and
OpenTelemetry environment settings are prepared for later instrumentation.

## Prerequisites and costs

* Install [uv](https://docs.astral.sh/uv/), Docker, Azure CLI with Bicep, and a
  current stable [Azure Developer CLI](https://learn.microsoft.com/azure/developer/azure-developer-cli/install-azd).
  Use an azd version supporting Container App Jobs with `host: containerapp`;
  see [Container Apps workflows](https://learn.microsoft.com/azure/developer/azure-developer-cli/container-apps-workflows).
* Use an isolated development subscription/environment in Azure public cloud.
  The operator needs subscription deployment/resource-group creation permissions
  (normally Contributor) and role-assignment rights (Owner, User Access
  Administrator, or Role Based Access Control Administrator at the required
  scope). Contributor alone cannot create the RBAC assignments.
* Have your subscription administrator register `Microsoft.App`,
  `Microsoft.ContainerRegistry`, `Microsoft.Storage`, `Microsoft.CognitiveServices`,
  `Microsoft.ApiManagement`, `Microsoft.ManagedIdentity`, `Microsoft.KeyVault`,
  `Microsoft.Insights` and `Microsoft.OperationalInsights` if needed.
* Confirm Container Apps, APIM and AI service availability in the chosen regions.
  Confirm model access, deployment SKU and quota before provisioning. Review the
  [model retirement schedule](https://learn.microsoft.com/azure/foundry/openai/concepts/model-retirement-schedule)
  and Content Safety support for moderation and protected-material text detection.
  The supplied model version is pinned, with no automatic upgrade; it is not a
  promise of continuing availability.
* Budget for APIM, ACR, paid Speech S0, model usage, Content Safety, compute,
  storage and monitoring. APIM Developer is non-production, has no SLA and incurs
  fixed charges even when containers scale to zero. It is not APIM Consumption:
  that tier does not support this MCP deployment. Review current Azure pricing,
  set a budget, and get billing approval before running `azd up`.

The default model is `gpt-4.1-mini`, version `2025-04-14`, deployment `lyrics`,
`GlobalStandard`, capacity 10. The default AI regions are `eastus2`, independently
configurable from compute. Global Standard can process outside the resource's
region. Capacity units and available regions are model-specific; changing to
regional `Standard` also requires checking that exact model/version/SKU offer.
Stock Speech voice is `en-US-JennyNeural`; no custom or cloned voice is created.

## Entra application setup

Have an authorized tenant administrator create or select two single-tenant API
registrations and configure their access tokens as v2
(`api.requestedAccessTokenVersion: 2`):

1. A seller API with Application ID URI `api://<seller-api-client-id>` exposing
   delegated scope `Jingle.Create`. Register/authorize a separate interactive
   client, grant the delegated permission and required consent, and restrict
   access to your intended sellers. Use authorization code with PKCE or an
   approved interactive token flow, not a client secret embedded in the app.
2. A separate backend API with Application ID URI
   `api://<backend-api-client-id>`. APIM requests this resource using its
   system-assigned managed identity. This foundation uses an explicit principal
   allowlist rather than application-role authorization. If your tenant requires
   application assignment for this API, configure and assign an app role to
   APIM's principal before the authenticated smoke check.

The template does not create registrations, consent, interactive login redirects
or client secrets. The web scaffold is bearer-token authenticated; it has no
interactive sign-in UI yet.

APIM validates issuer, tenant, audience, delegated scope and seller object ID,
then rate-limits by seller. It replaces the backend bearer token with its own
managed-identity token. The lyric and melody backends allow only APIM's
service-principal object ID, not arbitrary tenant users or the managed identity's
client ID. `/healthz` is deliberately anonymous; other routes require
authentication. Backend endpoints are public HTTPS with identity restrictions,
not private-network endpoints.

## Configure and deploy

Run from the repository root after obtaining permission to create billable
resources. Replace the example values; do not paste access tokens or secrets into
these settings.

```bash
az login
azd auth login
azd env new earwyrm-dev
azd env set AZURE_SUBSCRIPTION_ID "<subscription-id>"
azd env set AZURE_LOCATION "<compute-region>"
azd env set SELLER_API_CLIENT_ID "<seller-api-client-id>"
azd env set BACKEND_API_CLIENT_ID "<backend-api-client-id>"
azd env set APIM_PUBLISHER_EMAIL "<operator-contact>"
azd env set MODEL_LOCATION eastus2
azd env set SAFETY_LOCATION eastus2
azd env set SPEECH_LOCATION eastus2
azd up
```

azd supplies `AZURE_ENV_NAME` and the signed-in deployment principal's
`AZURE_PRINCIPAL_ID`. Environment names must be lowercase letters, digits and
hyphens, 3-20 characters. Optional settings are `MODEL_NAME`, `MODEL_VERSION`,
`MODEL_SKU`, `MODEL_CAPACITY` (positive integer), and `APIM_SKU`.
Review [main.parameters.json](../infra/main.parameters.json) for the mapping.
Local azd state under `.azure/` is Git-ignored.

`azd up` provisions the resource group, builds the locked Docker image through
ACR, and deploys it to each tagged app/job. The deployer gets registry AcrPush;
runtime identities use a separate AcrPull identity. APIM provisioning and RBAC
propagation can take time. If deployment fails, inspect the reported operation
and correct its quota, region or permission error before rerunning.

Provisioning uses a temporary non-root nginx image listening on 8080, matching
the app TCP probes, with no command override. `azd provision` alone leaves that
bootstrap image in place and can reset previously deployed images. Always finish
with `azd deploy` or use `azd up`. Do not send queue messages or treat bootstrap
health as successful application deployment.

`azd env get-values` shows deployment outputs, including `WEB_ENDPOINT`,
`LYRIC_MCP_ENDPOINT`, `MELODY_MCP_ENDPOINT`, `BLOB_ENDPOINT`,
`AZURE_STORAGE_ACCOUNT_NAME`, `RENDER_QUEUE_NAME`, `RENDER_JOB_NAME`,
`LYRIC_FOUNDRY_ENDPOINT`, `LYRIC_MODEL_DEPLOYMENT`,
`LYRIC_CONTENT_SAFETY_ENDPOINT`, `SPEECH_ENDPOINT` and `KEY_VAULT_ENDPOINT`.
Only HTTPS references and resource names are output, not access keys or SAS URLs.

## Local setup and smoke checks

```bash
uv sync --locked
uv run --locked pytest -q
uv run --locked python -m audio_poc.platform_service --role lyric
```

In another terminal:

```bash
curl --fail http://127.0.0.1:8080/healthz
curl --fail http://127.0.0.1:8080/contracts
curl --fail http://127.0.0.1:8080/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"1"}}}'
```

Expect scaffold health, a JSON Schema catalog and successful MCP initialization
with protocol `2025-06-18` or newer. The contract test suite also verifies explicit
tool failure and rejection of an untrusted MCP host.

For the same image used by Azure:

```bash
docker build -t earwyrm-foundation:local .
docker run --rm --name earwyrm-local-lyric \
  -p 127.0.0.1:8080:8080 -e SERVICE_ROLE=lyric earwyrm-foundation:local
```

Stop your own foreground process with Ctrl+C, or run
`docker stop earwyrm-local-lyric`. Do not stop other developers' containers.
The image uses UID 10001, installs locked production dependencies, and excludes
local data, credentials, generated renders, Git and tests from its build context.

## Authenticated cloud acceptance

1. Confirm all four deployed resources use an ACR application image, not the
   bootstrap image. Check job configuration without starting a render execution.
2. Request a seller access token for
   `api://<seller-api-client-id>/Jingle.Create` through your authorized client.
   Keep it in memory or a temporary environment variable; do not log it or store
   it in azd configuration. An app-only token cannot supply the delegated scope.
3. Use an MCP client supporting Streamable HTTP and protocol `2025-06-18` or
   newer. Connect to each `*_MCP_ENDPOINT` output with
   `Authorization: Bearer <seller-token>`. Initialize, list tools, then call a
   tool with a schema-valid synthetic input. Initialization and discovery must
   succeed; the call must return the documented not-integrated tool error.
4. Repeat without a token and with a valid token lacking `Jingle.Create`; expect
   rejection. Direct backend `/mcp` calls with the seller token must be denied,
   while APIM's managed-identity call succeeds. This checks both auth boundaries,
   not merely the public health endpoint.
5. Check authenticated web `/contracts` and the explicit 501 from `/jobs`.
   Check anonymous `/healthz` returns `generation_available: false`.
6. Confirm Blob containers deny anonymous reads, the queue is empty, the job is
   idle, and Container Apps diagnostics reach the workspace. Do not claim paid
   model/Speech integration or application trace export based on resource
   creation alone.

Record CLI versions, environment/region/model settings, deployment outcome and
smoke results without tokens, private brief content or credentials. Local tests,
image builds and Bicep compilation do not establish clean-cloud acceptance.

## Identity, storage and secrets

Storage shared-key auth and public blob access are disabled. `artifacts`,
`briefs` and `approvals` are private containers on a public authenticated endpoint;
there are no private endpoints or SAS review links.

* Web can read artifacts and contribute briefs/approvals.
* Lyric can call its Azure OpenAI and Content Safety resources.
* Melody can contribute artifacts and access the render queue.
* Render can contribute artifacts, access that queue and use Speech.
* Each runtime has a separate user-assigned identity; only the pull identity has
  registry-read permission. There are no runtime Key Vault data-plane grants.

Key Vault is initially empty, with RBAC, soft delete and purge protection.
If future integration requires a secret, add it outside source control, grant
only the consuming identity access and use a managed Key Vault reference. Do not
enable account keys to bypass an identity error.

## Teardown

> [!CAUTION]
> Teardown deletes the selected environment's resources and data. Confirm the
> active azd environment and subscription, export any needed synthetic evidence,
> and obtain the resource owner's approval first.

```bash
azd env get-values
azd down
```

Review the interactive deletion confirmation. Purge-protected vaults cannot be
immediately purged; soft-deleted vault names can remain reserved for the retention
period. Do not disable purge protection or delete unrelated resources to force
name reuse. Use a new environment name or follow the approved recovery process.
Entra app registrations and client consent were prerequisites and are not deleted
by `azd down`; have their owner remove them separately when appropriate.
