---
title: Deploy the web proof to Azure
description: Deploy the existing External ID web proof with PostgreSQL, Key Vault, and Azure Files media storage.
ms.date: 2026-11-15
ms.topic: how-to
---

## Scope and limitations

[azure.yaml](../azure.yaml) deploys the existing same-origin web UI and API from
[Dockerfile.web](../Dockerfile.web). The app validates External ID access tokens
and delegated scopes itself. PostgreSQL stores web, authorization and melody
records; the private Azure Files share stores audio and working files and can
retain SQLite source data for migration and rollback. The deployment does not
create registrations, APIM, an AI model, or a functioning MCP service. Paid
Speech remains disabled.

> [!CAUTION]
> This is a disposable, single-user proof of concept. Azure Files
> managed-identity SMB mounting is a preview feature. The share still holds
> private media and working files; a successful test does not prove that data
> cannot be lost. Do not store data that you cannot afford to lose.

The Container Apps **environment** has a system-assigned identity. It receives
the account-scoped `Storage File Data SMB MI Admin` role for a classic Azure
Files SMB share. SMB OAuth and Kerberos are enabled; storage account keys are
not used. PostgreSQL stores structured records and enforces TLS-verified
connections. The share holds private audio and working files and can retain the
preserved SQLite source files during migration. The new share starts empty, so
existing local records and audio are not copied automatically.

The SMB mount uses the
[`nobrl` option](https://manpages.debian.org/bookworm/cifs-utils/mount.cifs.8.en.html),
which disables byte-range lock requests to the server. PostgreSQL, not the
share, is the runtime database. Keep any retained SQLite source in
rollback-journal mode and access it only during a quiesced migration; `nobrl`
does not make network-filesystem database access safe. See
[SQLite's network-filesystem caveats](https://www.sqlite.org/useovernet.html).

The advisory writer lock remains a best-effort safeguard and has not been
validated on Azure with `nobrl`. Do not rely on it for cross-replica or
cross-client exclusion. It does not constrain clients that ignore the lock.
Single-revision mode, one replica and one worker reduce contention but do not
guarantee that revisions or replacement replicas never overlap. Follow the
maintenance procedure below even when the lock appears to work.

## Prerequisites and costs

* Install Docker, Azure CLI with Bicep, a current Azure Developer CLI (`azd`),
  and the current Container Apps CLI extension.
* Use an isolated new azd environment and an Azure subscription with resource
  creation and `Microsoft.Authorization/roleAssignments/write` permissions.
  Register `Microsoft.App`, `Microsoft.ContainerRegistry`, `Microsoft.Storage`,
  `Microsoft.ManagedIdentity`, `Microsoft.Insights`, and
  `Microsoft.OperationalInsights` if required.
* Confirm preview support in the subscription and region, SMB network access
  on port 445, registry access, resource quota and authorization. RBAC role
  assignments can take time to propagate after provisioning.
* Verify the existing Key Vault uses Azure RBAC and permits template
  deployment. The deployment principal needs permission to read the selected
  secret for Bicep and inspect its version. The app's user-assigned identity
  receives `Key Vault Secrets User` only at that secret's scope.
* Review pricing and obtain billing approval before provisioning. The app keeps
  one replica running; PostgreSQL, Container Apps, Azure Files, ACR builds and
  storage, Log Analytics, and networking can incur charges. The initial
  PostgreSQL candidate is Burstable B1ms with 32 GiB storage, seven-day local
  backups, and no geo-redundant backup. B1ms has one vCore and 2 GiB of memory;
  burst-credit exhaustion can reduce performance. Storage auto-growth can
  increase charges. Check regional availability and the complete regional
  price before approving the preview.
* Inventory any existing environment and preview proposed changes before
  deploying. This template replaces the prior scaffold configuration; removing
  a resource from a template does not delete an existing Azure resource. Do not
  modify or delete existing resources or data without separate approval.

## Existing External ID configuration

Use your existing External ID tenant's SPA and API registrations. These are
separate from the identity that deploys resources to the Azure subscription.
Do not substitute a workforce tenant issuer, generate another API registration,
or put Container Apps EasyAuth in front of this app.

| Setting | Value |
|---|---|
| `ENTRA_CLIENT_ID` | Client ID of the existing browser SPA registration |
| `ENTRA_AUTHORITY` | Existing tenant's HTTPS CIAM authority |
| `ENTRA_METADATA_URL` | Existing tenant's OpenID Connect discovery URL |
| `ENTRA_EXPECTED_ISSUER` | Exact `issuer` returned by that discovery document |
| `ENTRA_AUDIENCE` | Exact access-token audience expected by the existing API |
| `ENTRA_API_SCOPE_PREFIX` | Existing API application ID URI, without a trailing slash |

The API registration must expose the existing delegated scopes described in
[web app configuration](./audio-poc/web-app.md). The SPA must have the deployed
HTTPS origin plus `/auth-callback.html` as an allowed SPA redirect URI, and the
appropriate delegated permissions and consent. Registration or consent changes
require separate approval by the tenant owner. Never put tokens, passwords or
Speech keys in `azd` configuration or command examples.

## Configure and deploy

Deployment is supported only through the manually dispatched
[GitHub workflow](../.github/workflows/deploy-web.yml), using GitHub OIDC
federation to a dedicated deployment service principal. Interactive `az login`
or `azd auth login`, client secrets, and automatic push-triggered deployments
are not supported. This does not change how browser users sign in to External ID.

After separate owner approval, create a GitHub environment named `earwyrm-web`
with required reviewers and restrict it to your approved deployment branch.
Configure the deployment application's federated credential with issuer
`https://token.actions.githubusercontent.com`, audience `api://AzureADTokenExchange`,
and subject `repo:<owner>/<repository>:environment:earwyrm-web`. The Azure owner
must grant that service principal resource-creation and role-assignment
permissions in the selected subscription. Do not run `azd pipeline config`
as an implicit authorization to create registrations, credentials or permissions.

Set these non-secret GitHub environment variables:

| Variable | Value |
|---|---|
| `AZURE_CLIENT_ID` | Deployment application's client ID, not the browser SPA ID |
| `AZURE_TENANT_ID` | Deployment service principal's Azure tenant ID |
| `AZURE_PRINCIPAL_ID` | Object ID of that tenant's service principal (enterprise application), not its application object or client ID |
| `AZURE_SUBSCRIPTION_ID` | Explicit approved subscription ID |
| `AZURE_ENV_NAME` | Isolated environment name, 3-20 lowercase letters, digits or hyphens, starting and ending with a letter or digit |
| `AZURE_LOCATION` | Approved region |
| `AZURE_KEY_VAULT_NAME` | Existing RBAC-enabled Key Vault name |
| `AZURE_KEY_VAULT_RESOURCE_GROUP` | Resource group containing that vault in the deployment subscription |
| `AZURE_POSTGRESQL_PASSWORD_SECRET_NAME` | Existing secret containing the PostgreSQL administrator password |
| `AZURE_POSTGRESQL_PASSWORD_SECRET_VERSION` | Current 32-character hexadecimal version of that secret |
| `AZURE_POSTGRESQL_ADMIN_LOGIN` | PostgreSQL administrator login |
| `AZURE_POSTGRESQL_OUTBOUND_IPS` | Comma-separated public IPv4 addresses for verified Container Apps egress and any temporarily approved migration host |
| All six `ENTRA_*` settings above | Verbatim existing External ID values |

The workflow logs both Azure CLI and azd in through GitHub OIDC. Its maintenance
gate validates the IP allowlist before Azure access, verifies the CLI
subscription, tenant, service-principal type and client ID, and checks that the
vault permits RBAC and template deployment. It reads only the selected secret's
ID, never its value, and requires the configured version to be current before
inventorying or changing the target. Bicep reads that current value through a
secure deployment-time Key Vault reference; the Container App uses its
user-assigned identity and a version-pinned Key Vault reference to the same
secret. Do not rotate the secret between the gate and deployment. The deployment
owner must confirm `AZURE_PRINCIPAL_ID` belongs to that service principal.
Bicep intentionally assigns registry publishing to `ServicePrincipal`, not to
an interactive user. The parameter mapping is in
[main.parameters.json](../infra/main.parameters.json). No password is stored in
GitHub variables, azd configuration, Bicep outputs or command arguments.

Dispatch `preview` first, approving downtime and confirming that all external
share writers are stopped. The workflow stops the existing app and verifies
zero replicas, then runs `azd provision --preview`. Review the proposed changes
in that run. A preview leaves an existing app stopped; arrange an explicitly
approved maintenance recovery if you decide not to proceed.

After approving the preview, dispatch `provision`. This creates or updates the
resources without deploying the application image, then stops and verifies the
temporary bootstrap app. The app remains stopped. Verify the database server,
network allowlist, vault permissions and Key Vault secret version. Initialize
an explicitly empty store or import the backed-up SQLite stores by following
the [database migration runbook](./audio-poc/web-app.md#import-existing-sqlite-data).
If the approved import host needs database access, add only its verified public
IPv4 address for the maintenance window, then remove it from the allowlist after
the import. Keep all source files and backups until cutover is separately
approved.

Dispatch `deploy` only after the PostgreSQL initialization or import has been
independently verified. Confirm `postgres_store_initialized` and the current
preview. This run provisions again, quiesces any bootstrap revision, deploys the
application image, and resumes the app. Startup refuses an absent or incomplete
PostgreSQL initialization marker. Review again when code, configuration,
secret version or target changes. Neither confirmation permits deletion,
destructive migration or unrelated changes; stop and seek separate approval
for those.

The whole workflow is serialized with cancellation disabled. Do not run
another workflow or direct ARM/CLI deployment against the same share
concurrently. The hook checks do not replace Azure access controls; restrict
deployment permissions to the approved pipeline and authorized maintenance
operators.

In the workflow, `azd env get-values` shows `WEB_ENDPOINT`, `AZURE_RESOURCE_GROUP`,
`AZURE_CONTAINER_APP_NAME`, `AZURE_CONTAINER_ENVIRONMENT_NAME`,
`AZURE_STORAGE_ACCOUNT_NAME`, `AZURE_FILE_SHARE_NAME`,
`AZURE_POSTGRESQL_HOST` and `AZURE_POSTGRESQL_DATABASE`.

The first provision uses a temporary nginx image until `azd deploy` publishes
the web image. `azd provision` alone does not deploy the application and may
reset an existing app to the bootstrap image. The approved workflow stops this
revision before returning from `provision`. Do not treat bootstrap health as
application readiness. If the mount fails, inspect Container Apps system logs,
RBAC propagation, preview availability, Kerberos settings, port 445 and storage
network rules. Do not enable account keys as a workaround.

Use the printed `WEB_ENDPOINT` to obtain the exact callback URI. Have the
registration owner approve and add it if it is missing, then validate sign-in.
`/healthz` only checks the process; `/api/config` checks identity metadata,
not the storage mount or a successful user login.

## Safe updates and maintenance

[azure.yaml](../azure.yaml) registers fail-closed `preprovision` and `predeploy`
hooks using [deployment_gate.ts](../scripts/deployment_gate.ts). These hooks
require the approved GitHub OIDC context, a nonempty allowlist of individual
public IPv4 addresses, the approved vault configuration and the pinned current
secret version. They inventory the isolated resource group and require
`runningStatus: Stopped` plus zero replicas for every revision, including
inactive ones. Transiently empty replicas on a running app do not pass. Any
running replica, missing or invalid inventory, wrong identity, unavailable
secret or CLI error blocks the command. A successful stop request is never
sufficient.

The authorized workflow's `quiesce` action stops only the single app tagged
for this environment's `web` service and polls for zero replicas, timing out
after five minutes. Additional or unrelated apps in the group block the run
without being stopped. A new target with no app can proceed. Share clients
outside this target cannot be discovered by this check: their owners must stop
them and confirm `other_writers_stopped` before approving the run. Real SMB
locking is not assumed. The workflow's `resume` action requires exactly one
replica; this is not proof of application readiness or successful SMB mounting.
PostgreSQL firewall rules allow only the supplied single-address IPv4 entries.
The deployment owner must verify that the list covers every active Container
Apps outbound address and can remain reliable. If egress is not stable or
complete, do not provision. Recheck the list when the environment or region
changes. The gate validates syntax and rejects broad, private, duplicate or
invalid addresses; it cannot establish live egress coverage without the
deployment owner's inventory.

After provisioning and the second writer-quiescence check, the approved
workflow runs `npm run deployment-gate -- reconcile-firewall` before deployment or
workflow completion. The gate requires exactly one Flexible Server tagged for
the selected environment and in `Ready` state. It removes only obsolete
`container-app-egress-<index>` rules, leaves unrecognized rules untouched and
fails if any remain, then verifies that the owned rule names and exact IP pairs
match the approved allowlist. A missing or ambiguous server, inventory mismatch,
or Azure CLI error blocks the run. Rule deletion can take up to five minutes to
propagate, so a matching control-plane inventory does not prove immediate
network enforcement; verify live connectivity separately.

Do not use ordinary `azd up` as an update shortcut. Provisioning can start a
bootstrap revision, so the workflow quiesces and verifies it before deployment.
Failed or cancelled maintenance can leave the app stopped; keep it stopped until
an authorized operator has reviewed the failure. The gate does not
automatically resume an unsuccessful deployment.

Before any repeat deployment, backup or restore, arrange downtime and stop
**all** applications or clients that can write to the share. Stop the app using
the [Container Apps stop API](https://learn.microsoft.com/rest/api/resource-manager/containerapps/container-apps/stop?view=rest-resource-manager-containerapps-2026-07-01):

```bash
AZURE_RESOURCE_GROUP="$(azd env get-value AZURE_RESOURCE_GROUP)"
AZURE_CONTAINER_APP_NAME="$(azd env get-value AZURE_CONTAINER_APP_NAME)"
APP_ID="$(az containerapp show --resource-group "$AZURE_RESOURCE_GROUP" \
  --name "$AZURE_CONTAINER_APP_NAME" --query id -o tsv)"
az rest --method post \
  --url "https://management.azure.com${APP_ID}/stop?api-version=2026-07-01"
az containerapp revision list --resource-group "$AZURE_RESOURCE_GROUP" \
  --name "$AZURE_CONTAINER_APP_NAME" --all -o table
```

Check replicas for **each** revision with
`az containerapp replica list --resource-group "$AZURE_RESOURCE_GROUP" --name "$AZURE_CONTAINER_APP_NAME" --revision "<revision>"`.
Wait until no replica or other share client is running; a successful stop
request alone is not proof. If that cannot be confirmed, do not proceed. Test
this procedure in the target environment before relying on it.

For an approved update, use the gated workflow, inspect the proposed changes,
and preserve the existing share. For separately authorized maintenance recovery
or backup/restore, the operator may use the
corresponding [start API](https://learn.microsoft.com/rest/api/resource-manager/containerapps/container-apps/start?view=rest-resource-manager-containerapps-2026-07-01)
after maintenance:

```bash
az rest --method post \
  --url "https://management.azure.com${APP_ID}/start?api-version=2026-07-01"
```

Wait for the operation and check logs and replica state. These manual stop/start
commands are for approved maintenance, not an interactive deployment path. Do not run another
`azd up`, direct revision update or additional app against this share while
writers are active. Never treat a successful local lock test as proof that the
Azure SMB lock is reliable.

For PostgreSQL password rotation, stop the app and other writers first. Add the
new password as a new Key Vault secret version and update
`AZURE_POSTGRESQL_PASSWORD_SECRET_VERSION` to that exact version. Review the
preview, then use the gated provision operation to update the server credential
and app reference together. Verify a fresh TLS-validated database connection
before deploying or resuming the app. Retain the old secret version and an
approved recovery path until verification succeeds. Rotating the Key Vault
secret alone does not change the PostgreSQL password. If the server update
fails, keep the app stopped and restore the matching previous server credential
and secret reference through an approved deployment.

## Backup and restore

Stop and verify all writers as above. Back up both persistence planes during the
same maintenance window so database records and referenced files remain
consistent.

From an approved administration host, create an encrypted PostgreSQL dump with
a trusted `pg_dump` client and full TLS certificate and host verification. Supply
the current database password through a temporary owner-only password file or
an approved secret manager, never as a command argument or shell-history value.
The host must be allowed by the PostgreSQL firewall and use the trusted system
CA bundle. The server retains seven days of local backups, but those are not an
independent off-server backup and do not include Azure Files data.

On the same stopped deployment, mount the share using a separately authorized
managed identity and [Azure Files managed-identity instructions](https://learn.microsoft.com/azure/storage/files/files-managed-identities).
That host needs network access and its own appropriate role assignment; the
Container Apps environment identity is not available there. Copy the **entire**
share, including hidden files, SQLite source files, journals, private audio and
working files, to an encrypted, access-controlled backup location outside this
share and storage account. Record the database dump time, share backup time and
access policy. A share snapshot can supplement the copy but is not an
independent backup and does not by itself make live data consistent.

Test restoration to a new isolated PostgreSQL server/database and a separate
mounted directory before replacing anything. Restore the database dump with a
trusted `pg_restore` client, then restore the file backup without modifying the
source. Preserve the original server, share and backups. Verify the initialization
marker and required schemas, compare expected records and ownership, and check
that every referenced audio and melody artifact exists and can be read by UID
10001. Start an isolated app against the restored targets and verify sign-in,
records and media retrieval. Do not switch live traffic until the recovery has
been separately approved.

For an approved recovery, provision separate database and file targets, restore
and verify both, and then update the deployment to reference those targets.
Review the preview before provisioning or deploying. Keep the original database,
share and independent backups until the restored app has passed acceptance;
do not delete or overwrite them. This recovery sequence requires a live test
before relying on it.

## Cloud acceptance

The implementation has not been validated against live Azure resources. After
separate approval, verify that the application reaches PostgreSQL using
certificate- and host-validated TLS and reaches the file share through its
managed identity. Exercise a revision update and confirm writer exclusion.
Sign in, select a synthetic brief, render an instrumental, compare and evaluate
it, and download the protected audio and evidence. Restart and retrieve the
same records and audio. Confirm a second user cannot read them, test a mount or
database failure, and perform a backup and isolated restore of both PostgreSQL
records and file data. Record failures honestly; do not enable paid Speech for
this check.

## Teardown

`azd down` can delete the resource group, file share and all application data.
Obtain separate approval, verify the subscription and environment, and verify
an independent backup before destructive teardown. Existing app registrations,
consent and unrelated resources need their own owner-approved treatment.
