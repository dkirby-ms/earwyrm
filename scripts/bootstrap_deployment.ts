import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import {
  azure, DeploymentGateError, deployment_error_detail, required_setting, verify_deployment_identity,
  type Azure,
} from './deployment_gate.js';

const SECRETS_OFFICER = 'b86a8fe4-44ce-4948-aee5-eccb2c155cd7';
const SECRETS_USER = '4633458b-17de-408a-b874-0445c86b69e6';
const SETTINGS = {
  AZURE_SUBSCRIPTION_ID: z.uuid(),
  AZURE_TENANT_ID: z.uuid(),
  AZURE_CLIENT_ID: z.uuid(),
  AZURE_PRINCIPAL_ID: z.uuid(),
  AZURE_LOCATION: z.string().regex(/^[a-z0-9]+$/),
  AZURE_KEY_VAULT_NAME: z.string().min(3).max(24).regex(/^[a-zA-Z][a-zA-Z0-9-]*[a-zA-Z0-9]$/).refine((value) => !value.includes('--')),
  AZURE_KEY_VAULT_RESOURCE_GROUP: z.string().max(90).regex(/^[a-zA-Z0-9_()-][a-zA-Z0-9_.()-]*$/).refine((value) => !value.endsWith('.')),
  AZURE_POSTGRESQL_PASSWORD_SECRET_NAME: z.string().regex(/^[a-zA-Z0-9-]{1,127}$/),
  AZURE_POSTGRESQL_ADMIN_LOGIN: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,62}$/),
};

/** Creates missing credential prerequisites only; preserves existing vault settings and password versions. */
export async function bootstrap(options: {
  environ?: Readonly<Record<string, string | undefined>>;
  azure?: Azure;
  sleep?: (milliseconds: number) => Promise<unknown>;
} = {}): Promise<void> {
  const environ = options.environ ?? process.env;
  const required = (name: string) => required_setting(environ, name);
  if (environ.EARWYRM_BOOTSTRAP_APPROVED !== 'true') {
    throw new DeploymentGateError('Explicit credential bootstrap approval is required');
  }
  for (const [name, schema] of Object.entries(SETTINGS)) {
    if (!schema.safeParse(required(name)).success) throw new DeploymentGateError(`Invalid bootstrap setting: ${name}`);
  }
  const call = options.azure ?? azure;
  const subscription = await verify_deployment_identity(environ, call);
  const group = required('AZURE_KEY_VAULT_RESOURCE_GROUP');
  const vault = required('AZURE_KEY_VAULT_NAME');
  const secret = required('AZURE_POSTGRESQL_PASSWORD_SECRET_NAME');
  const principal = required('AZURE_PRINCIPAL_ID');
  const vault_id = `/subscriptions/${subscription}/resourceGroups/${group}/providers/Microsoft.KeyVault/vaults/${vault}`;
  const secret_scope = `${vault_id}/secrets/${secret}`;
  const exists = z.boolean().parse(await call(subscription, 'group', 'exists', '--name', group));
  if (!exists) {
    await call(subscription, 'group', 'create', '--name', group, '--location', required('AZURE_LOCATION'));
  }
  const vaults = z.array(z.object({ id: z.string(), name: z.string() }))
    .parse(await call(subscription, 'keyvault', 'list', '--resource-group', group));
  const matches = vaults.filter((item) => item.name.toLowerCase() === vault.toLowerCase());
  if (matches.length > 1 || (matches.length === 1 && matches[0].id.toLowerCase() !== vault_id.toLowerCase())) {
    throw new DeploymentGateError('Key Vault inventory does not match the bootstrap target');
  }
  if (!matches.length) {
    await call(subscription, 'keyvault', 'create', '--name', vault, '--resource-group', group,
      '--location', required('AZURE_LOCATION'), '--sku', 'standard', '--enable-rbac-authorization', 'true',
      '--enabled-for-template-deployment', 'true', '--enable-purge-protection', 'true',
      '--retention-days', '90', '--no-self-perms', 'true');
  }
  const details = z.object({ id: z.string(), properties: z.object({
    tenantId: z.string(), enableRbacAuthorization: z.boolean(), enabledForTemplateDeployment: z.boolean(),
  }) }).parse(await call(subscription, 'keyvault', 'show', '--name', vault, '--resource-group', group));
  if (details.id.toLowerCase() !== vault_id.toLowerCase() ||
    details.properties.tenantId.toLowerCase() !== required('AZURE_TENANT_ID').toLowerCase()) {
    throw new DeploymentGateError('Key Vault identity or tenant does not match the bootstrap target');
  }
  if (!details.properties.enableRbacAuthorization || !details.properties.enabledForTemplateDeployment) {
    throw new DeploymentGateError('Existing Key Vault must already enable RBAC and template deployment; bootstrap will not change its security settings');
  }
  const assign = async (role: string, scope: string, name?: string) => {
    try {
      await call(subscription, 'role', 'assignment', 'create',
        '--assignee-object-id', principal, '--assignee-principal-type', 'ServicePrincipal',
        '--role', role, '--scope', scope, ...(name ? ['--name', name] : []), '--query', 'id');
    } catch (error) {
      if (!(error instanceof DeploymentGateError) || error.azureCode !== 'RoleAssignmentExists') throw error;
      console.error('INFO: Existing matching Key Vault role assignment retained');
    }
  };
  const secret_id_prefix = `https://${vault}.vault.azure.net/secrets/${secret}/`.toLowerCase();
  const validate_secret_id = (response: unknown) => {
    const id = z.string().url().parse(response);
    if (!id.toLowerCase().startsWith(secret_id_prefix) ||
      !/^[0-9a-f]{32}$/i.test(id.slice(secret_id_prefix.length))) {
      throw new DeploymentGateError('Password secret ID does not match the bootstrap target');
    }
  };
  const read_secret = async (): Promise<boolean> => {
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        validate_secret_id(await call(subscription, 'keyvault', 'secret', 'show',
          '--vault-name', vault, '--name', secret, '--query', 'id'));
        return true;
      } catch (error) {
        if (!(error instanceof DeploymentGateError)) throw error;
        if (error.azureCode === 'SecretNotFound') return false;
        if (!['Forbidden', 'ForbiddenByRbac'].includes(error.azureCode ?? '')) throw error;
        if (attempt === 29) throw new DeploymentGateError('Key Vault access remains forbidden after the RBAC propagation wait; verify permissions and networking before retrying');
        console.error('INFO: Waiting for Key Vault RBAC propagation');
        await (options.sleep ?? sleep)(10_000);
      }
    }
    throw new DeploymentGateError('Key Vault access could not be verified');
  };
  const assignment_name = randomUUID();
  const assignment_id = `${vault_id}/providers/Microsoft.Authorization/roleAssignments/${assignment_name}`;
  console.error(`INFO: Temporary bootstrap writer assignment name: ${assignment_name}`);
  try {
    await assign(SECRETS_OFFICER, vault_id, assignment_name);
    if (await read_secret()) {
      console.error('INFO: Existing PostgreSQL password secret retained without creating a version');
    } else {
      let password: string;
      do { password = `${randomBytes(32).toString('base64url')}!`; }
      while (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) ||
        password.toLowerCase().includes(required('AZURE_POSTGRESQL_ADMIN_LOGIN').toLowerCase()));
      const directory = await mkdtemp(join(tmpdir(), 'earwyrm-bootstrap-'));
      try {
        const path = join(directory, 'password');
        await writeFile(path, password, { mode: 0o600, flag: 'wx' });
        validate_secret_id(await call(subscription, 'keyvault', 'secret', 'set',
          '--vault-name', vault, '--name', secret, '--file', path, '--encoding', 'utf-8', '--query', 'id'));
      } finally { await rm(directory, { recursive: true, force: true }); }
      console.error('INFO: Initial PostgreSQL password secret created');
    }
    await assign(SECRETS_USER, secret_scope);
  } finally {
    try {
      await call(subscription, 'rest', '--method', 'delete', '--url',
        `https://management.azure.com${assignment_id}?api-version=2022-04-01`);
    } catch (error) {
      console.error('ERROR: Temporary Key Vault writer cleanup could not be verified; an owner must inspect bootstrap role assignments before retrying');
      throw error;
    }
  }
  if (!await read_secret()) throw new DeploymentGateError('Password secret is missing after bootstrap');
  console.error('INFO: Credential bootstrap complete; dispatch a new deployment preview');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  bootstrap().catch((error: unknown) => {
    console.error(`ERROR: Credential bootstrap failed: ${deployment_error_detail(error)}`);
    process.exitCode = 1;
  });
}
