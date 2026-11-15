---
title: Deploy the web proof to Azure
description: Deploy the existing External ID web proof with an identity-authenticated Azure Files share.
ms.date: 2026-11-15
ms.topic: how-to
---

## Scope and limitations

[azure.yaml](../azure.yaml) deploys the existing same-origin web UI and API from
[Dockerfile.web](../Dockerfile.web). The app validates External ID access tokens
and delegated scopes itself. The deployment does not create registrations,
APIM, an AI model, or a functioning MCP service. Paid Speech remains disabled.

> [!CAUTION]
> This is a disposable, single-user proof of concept. SQLite warns that network
> filesystem locking and synchronization failures can corrupt databases. Azure
> Files managed-identity SMB mounting is a preview feature. A successful test
> does not prove that corruption or data loss cannot occur. Do not store data
> that you cannot afford to lose.

The Container Apps **environment** has a system-assigned identity. It receives
the account-scoped `Storage File Data SMB MI Admin` role for a classic Azure
Files SMB share. SMB OAuth and Kerberos are enabled; storage account keys are
not used. The share contains both SQLite databases, the initialized-store marker,
private audio and working files. The app rejects an unmounted data path, attempts
to exclude a second cooperating writer, and checks for missing databases and unsupported
SQLite journal modes at startup. Every runtime SQLite connection uses
non-creating `mode=rw`; constructors also refuse to recreate missing databases
once the store marker exists. Database loss blocks reads or renders rather
than silently resetting owner records, the paid ledger or melody history.

The new share starts empty. Existing local records and audio are not copied
automatically.

The database volume uses the SMB
[`nobrl` mount option](https://manpages.debian.org/bookworm/cifs-utils/mount.cifs.8.en.html)
to avoid SQLite startup failures caused by SMB byte-range locking. This disables
byte-range lock requests to the server; it does not make concurrent database
access from separate replicas or clients safe. Existing UID/GID and private
file permissions remain unchanged. Keep SQLite in rollback-journal mode, not
WAL, as required by the startup checks. See
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
* Review pricing and obtain billing approval before provisioning. The app keeps
  one replica running; Container Apps, Azure Files, ACR builds and storage,
  Log Analytics, and networking can incur charges.
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
| All six `ENTRA_*` settings above | Verbatim existing External ID values |

The workflow logs both Azure CLI and azd in through GitHub OIDC. Its maintenance
gate verifies the CLI subscription, tenant, service-principal type and client ID
before inventorying or changing the target. The deployment owner must confirm
`AZURE_PRINCIPAL_ID` belongs to that service principal. Bicep intentionally
assigns registry publishing to `ServicePrincipal`, not to an interactive user.
The parameter mapping is in [main.parameters.json](../infra/main.parameters.json).

Dispatch `preview` first, approving downtime and confirming that all external
share writers are stopped. The workflow stops the existing app and verifies
zero replicas, then runs `azd provision --preview`. Review the proposed changes
in that run before dispatching `deploy`; that second run requires the
`preview_reviewed` confirmation and environment approval. Review again when
the code or target changes. Neither confirmation permits deletion, destructive
migration or unrelated changes: stop and seek separate approval for those.
A preview leaves the existing app stopped; arrange an explicitly approved
maintenance recovery if you decide not to deploy.

The deploy run uses `azd provision`, stops and verifies any bootstrap/replacement
writers again, then runs `azd deploy web` and resumes the app. The whole workflow
is serialized with cancellation disabled. Do not run another workflow or direct
ARM/CLI deployment against the same share concurrently. The hook checks do not
replace Azure access controls; restrict deployment permissions to the approved
pipeline and authorized maintenance operators.

In the workflow, `azd env get-values` shows `WEB_ENDPOINT`, `AZURE_RESOURCE_GROUP`,
`AZURE_CONTAINER_APP_NAME`, `AZURE_CONTAINER_ENVIRONMENT_NAME`,
`AZURE_STORAGE_ACCOUNT_NAME` and `AZURE_FILE_SHARE_NAME`.

The first provision uses a temporary nginx image until `azd deploy` publishes
the web image. `azd provision` alone does not deploy the application and may
reset an existing app to the bootstrap image. Do not treat bootstrap health as
application readiness. If the mount fails, inspect Container Apps system logs,
RBAC propagation, preview availability, Kerberos settings, port 445 and storage
network rules. Do not enable account keys as a workaround.

Use the printed `WEB_ENDPOINT` to obtain the exact callback URI. Have the
registration owner approve and add it if it is missing, then validate sign-in.
`/healthz` only checks the process; `/api/config` checks identity metadata,
not the storage mount or a successful user login.

## Safe updates and maintenance

[azure.yaml](../azure.yaml) registers fail-closed `preprovision` and `predeploy`
hooks using [deployment_gate.py](../scripts/deployment_gate.py). These hooks
require the approved GitHub OIDC context, inventory the isolated resource group,
and require `runningStatus: Stopped` plus zero replicas for every revision,
including inactive ones. Transiently empty replicas on a running app do not pass. Any
running replica, missing/invalid inventory, wrong identity or CLI error blocks
the command. A successful stop request is never sufficient.

The authorized workflow's `quiesce` action stops only the single app tagged
for this environment's `web` service and polls for zero replicas, timing out
after five minutes. Additional or unrelated apps in the group block the run
without being stopped. A new target with no app can proceed. Share clients
outside this target cannot be discovered by this check: their owners must stop
them and confirm `other_writers_stopped` before approving the run. Real SMB
locking is not assumed. The workflow's `resume` action requires exactly one
replica; this is not proof of application readiness or successful SMB mounting.

Do not use ordinary `azd up` as an update shortcut. Provisioning can start a
bootstrap revision, so the next hook will refuse deployment until the workflow
quiesces and verifies it again. Failed or cancelled maintenance can leave the
app stopped; keep it stopped until an authorized operator has reviewed the
failure. The gate does not automatically resume an unsuccessful deployment.

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

## Backup and restore

Stop and verify all writers as above. From an approved administration host,
mount the share using a separately authorized managed identity and
[Azure Files managed-identity instructions](https://learn.microsoft.com/azure/storage/files/files-managed-identities).
That host needs network access and its own appropriate role assignment; the
Container Apps environment identity cannot be assumed to be available there.
Copy the **entire** stopped share, including hidden files and any SQLite
journals, to an encrypted, access-controlled backup location outside this
share and storage account. Record the backup time and access policy. A share
snapshot can supplement this copy but is not an independent backup and does
not by itself make a live database consistent.

Test restoration to a separate, isolated mounted directory before replacing
anything. Preserve the source share and existing data. On the administration
host, choose an encrypted off-share `BACKUP_FILE`, the stopped `SHARE_MOUNT`,
and an empty isolated `RESTORE_DIR`. Use a trusted `sqlite3` installation:

```bash
tar -C "$SHARE_MOUNT" -cpf "$BACKUP_FILE" .
tar -C "$RESTORE_DIR" -xpf "$BACKUP_FILE"
sqlite3 "$RESTORE_DIR/earwyrm.sqlite3" 'PRAGMA integrity_check;'
sqlite3 "$RESTORE_DIR/melody/melody.sqlite3" 'PRAGMA integrity_check;'
sqlite3 "$RESTORE_DIR/earwyrm.sqlite3" 'SELECT audio_filename FROM outputs;' |
  while IFS= read -r filename; do test -f "$RESTORE_DIR/audio/$filename" || exit 1; done
```

Both integrity checks must return `ok`, the file check must succeed, and the
restored `.earwyrm-initialized` marker and referenced audio must be readable by
UID 10001. A missing database after initialization blocks startup and affected runtime
operations. It does not detect replacement with a different existing database. This marker
cannot detect replacement of an entire share with a new empty share. Obtain
separate approval before switching live data, and perform any restore while
all writers remain stopped.

For an approved recovery, create a new empty classic SMB share in the same
storage account, mount it on the administration host, and copy the verified
restored directory into that share with the same archive procedure. Verify its
permissions, both databases and referenced files again. Change `shareName` in
[platform.bicep](../infra/platform.bicep) to the new share name, preview the
deployment, and provision and deploy only after reviewing the change. Verify
the app against the new share before resuming use. Keep the old share and the
independent backup until recovery is verified; do not delete or overwrite them.
This recovery sequence requires a live test before relying on it.

## Cloud acceptance

The implementation has not been validated against a live Azure mount. After
separate approval, confirm the deployed image and the UID 10001 mount's create,
read, chmod, write, rename, delete, journal and locking behavior. Exercise a
revision update and confirm writer exclusion. Sign in, select a synthetic
brief, render an instrumental, compare and evaluate it, and download the
protected audio and evidence. Restart and retrieve the same records and audio.
Confirm a second user cannot read them, test a mount failure, and perform a
backup and restore with both integrity checks. Record failures honestly; do not
enable paid Speech for this check.

## Teardown

`azd down` can delete the resource group, file share and all application data.
Obtain separate approval, verify the subscription and environment, and verify
an independent backup before destructive teardown. Existing app registrations,
consent and unrelated resources need their own owner-approved treatment.
