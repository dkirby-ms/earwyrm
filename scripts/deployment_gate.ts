import { execFile } from 'node:child_process';
import { isIPv4 } from 'node:net';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { z } from 'zod';

const execute = promisify(execFile);
const POSTGRES_REQUIRED_SETTINGS = [
  'AZURE_KEY_VAULT_NAME', 'AZURE_KEY_VAULT_RESOURCE_GROUP',
  'AZURE_POSTGRESQL_PASSWORD_SECRET_NAME', 'AZURE_POSTGRESQL_PASSWORD_SECRET_VERSION',
  'AZURE_POSTGRESQL_ADMIN_LOGIN', 'AZURE_POSTGRESQL_OUTBOUND_IPS',
] as const;
const RULE_NAME = /^container-app-egress-(?:0|[1-9][0-9]*)$/;
const Resource = z.object({
  name: z.string().min(1),
  id: z.string().min(1),
  tags: z.record(z.string(), z.string()).default({}),
});
type Resource = z.infer<typeof Resource>;
/** Azure responses remain unknown until the relevant inventory schema validates them. */
export type Azure = (subscription: string, ...arguments_: string[]) => Promise<unknown>;
type Environment = Readonly<Record<string, string | undefined>>;

/** Executes against an explicit subscription; never forwards CLI stderr or credentials. */
export const azure: Azure = async (subscription, ...arguments_) => {
  let stdout: string;
  try {
    ({ stdout } = await execute('az', [
      ...arguments_, '--subscription', subscription, '--output', 'json',
    ], { timeout: 120_000, maxBuffer: 8 * 1024 * 1024 }));
  } catch (error) {
    if (error instanceof Error) throw new Error('Azure CLI operation failed; inspect approved workflow diagnostics');
    throw error;
  }
  if (arguments_[0] === 'rest' && !stdout.trim()) return null;
  return JSON.parse(stdout) as unknown;
};

/** Requires unique individual public IPv4 addresses, never CIDR or Azure-wide access. */
export function validate_outbound_ipv4s(value: string): void {
  const addresses = value.split(',');
  if (!value || addresses.some((address) => !address || address.trim() !== address)) {
    throw new Error('PostgreSQL outbound IPs must be comma-separated IPv4 addresses');
  }
  if (new Set(addresses).size !== addresses.length) {
    throw new Error('PostgreSQL outbound IPs must not contain duplicates');
  }
  for (const address of addresses) {
    if (!isIPv4(address)) throw new Error('PostgreSQL outbound IPs must be valid IPv4 addresses');
    const [a, b, c, d] = address.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0 && c === 0 && d !== 9 && d !== 10) ||
      (a === 192 && b === 0 && c === 2) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113)) {
      throw new Error('PostgreSQL outbound IPs must be public IPv4 addresses');
    }
  }
}

/** Validates workflow consent and inventories only the configured isolated deployment. */
export async function deployment_target(
  environ: Environment = process.env,
  call: Azure = azure,
): Promise<[string, string, Resource | null]> {
  for (const name of [
    'AZURE_SUBSCRIPTION_ID', 'AZURE_TENANT_ID', 'AZURE_CLIENT_ID',
    'AZURE_PRINCIPAL_ID', 'AZURE_ENV_NAME', ...POSTGRES_REQUIRED_SETTINGS,
  ]) {
    if (!(name in environ) || (name !== 'AZURE_POSTGRESQL_OUTBOUND_IPS' && !environ[name])) {
      throw new Error(`Required deployment setting is missing: ${name}`);
    }
  }
  const required = (name: string): string => {
    const value = environ[name];
    if (value === undefined) throw new Error(`Required deployment setting is missing: ${name}`);
    return value;
  };
  validate_outbound_ipv4s(required('AZURE_POSTGRESQL_OUTBOUND_IPS'));
  if (!/^[0-9a-fA-F]{32}$/.test(required('AZURE_POSTGRESQL_PASSWORD_SECRET_VERSION'))) {
    throw new Error('PostgreSQL Key Vault secret version must be 32 hexadecimal characters');
  }
  if (environ.GITHUB_ACTIONS !== 'true' || !environ.ACTIONS_ID_TOKEN_REQUEST_URL ||
    !environ.ACTIONS_ID_TOKEN_REQUEST_TOKEN) {
    throw new Error('Deployment requires the GitHub OIDC workflow');
  }
  if (environ.EARWYRM_MAINTENANCE_APPROVED !== 'true' ||
    environ.EARWYRM_OTHER_WRITERS_STOPPED !== 'true') {
    throw new Error('Approved maintenance and stopped external writers are required');
  }
  const environment = required('AZURE_ENV_NAME');
  if (!/^[a-z0-9][a-z0-9-]{1,18}[a-z0-9]$/.test(environment)) {
    throw new Error('Use a 3-20 character lowercase azd environment name');
  }
  const subscription = required('AZURE_SUBSCRIPTION_ID');
  const account = z.object({
    id: z.string(), tenantId: z.string(),
    user: z.object({ type: z.string(), name: z.string() }),
  }).parse(await call(subscription, 'account', 'show'));
  if (account.id.toLowerCase() !== subscription.toLowerCase() ||
    account.tenantId.toLowerCase() !== required('AZURE_TENANT_ID').toLowerCase() ||
    account.user.type !== 'servicePrincipal' ||
    account.user.name.toLowerCase() !== required('AZURE_CLIENT_ID').toLowerCase()) {
    throw new Error('Azure CLI account is not the configured deployment service principal');
  }
  const vault = z.object({ properties: z.object({
    enableRbacAuthorization: z.boolean(), enabledForTemplateDeployment: z.boolean(),
  }) }).parse(await call(subscription, 'keyvault', 'show',
    '--name', required('AZURE_KEY_VAULT_NAME'),
    '--resource-group', required('AZURE_KEY_VAULT_RESOURCE_GROUP')));
  if (!vault.properties.enableRbacAuthorization || !vault.properties.enabledForTemplateDeployment) {
    throw new Error('The existing Key Vault must use RBAC and allow secure template deployment');
  }
  const secret_id = z.string().parse(await call(subscription, 'keyvault', 'secret', 'show',
    '--vault-name', required('AZURE_KEY_VAULT_NAME'),
    '--name', required('AZURE_POSTGRESQL_PASSWORD_SECRET_NAME'), '--query', 'id'));
  if (secret_id.replace(/\/+$/, '').split('/').at(-1) !== required('AZURE_POSTGRESQL_PASSWORD_SECRET_VERSION')) {
    throw new Error('The configured PostgreSQL Key Vault secret version must be the current version');
  }
  const group = `rg-earwyrm-${environment}`;
  const exists = await call(subscription, 'group', 'exists', '--name', group);
  if (exists === false) return [subscription, group, null];
  if (exists !== true) throw new Error('Invalid resource group inventory response');
  const apps = z.array(Resource).parse(await call(subscription, 'containerapp', 'list', '--resource-group', group));
  if (!apps.length) return [subscription, group, null];
  if (apps.length !== 1 || apps[0].tags['azd-env-name'] !== environment ||
    apps[0].tags['azd-service-name'] !== 'web') {
    throw new Error('Target must contain only the isolated, tagged web app');
  }
  const app = apps[0];
  const expected_id = `/subscriptions/${subscription}/resourceGroups/${group}/providers/Microsoft.App/containerApps/${app.name}`;
  if (app.id.toLowerCase() !== expected_id.toLowerCase()) {
    throw new Error('Container app inventory does not match the selected target');
  }
  return [subscription, group, app];
}

/** Counts all replicas, including inactive revisions, and rejects unverifiable inventories. */
export async function replica_count(subscription: string, group: string, app: string, call: Azure = azure): Promise<number> {
  const arguments_ = ['--resource-group', group, '--name', app];
  const revisions = z.array(z.object({ name: z.string().min(1) })).min(1)
    .parse(await call(subscription, 'containerapp', 'revision', 'list', ...arguments_, '--all'));
  let count = 0;
  for (const revision of revisions) {
    const replicas = z.array(z.unknown()).parse(await call(subscription,
      'containerapp', 'replica', 'list', ...arguments_, '--revision', revision.name));
    count += replicas.length;
  }
  return count;
}

const Rule = z.object({ name: z.string(), startIpAddress: z.string(), endIpAddress: z.string() });
type Rule = z.infer<typeof Rule>;

/** Only explicitly named Earwyrm rules are owned; unknown rules block reconciliation. */
export async function postgres_firewall_rule_inventory(
  subscription: string, group: string, server: string, call: Azure = azure,
): Promise<[Map<string, Rule>, boolean]> {
  const rules = z.array(z.unknown()).parse(await call(subscription,
    'postgres', 'flexible-server', 'firewall-rule', 'list', '--resource-group', group, '--name', server));
  const owned = new Map<string, Rule>();
  let unrecognized = false;
  for (const value of rules) {
    const parsed = Rule.safeParse(value);
    if (!parsed.success || !RULE_NAME.test(parsed.data.name)) {
      unrecognized = true;
      continue;
    }
    if (owned.has(parsed.data.name)) throw new Error('Duplicate PostgreSQL firewall-rule names');
    owned.set(parsed.data.name, parsed.data);
  }
  return [owned, unrecognized];
}

/** Deletes obsolete app-owned rules only, then verifies the exact approved allowlist. */
export async function reconcile_postgres_firewall(
  subscription: string, group: string, environ: Environment = process.env, call: Azure = azure,
): Promise<void> {
  const environment = environ.AZURE_ENV_NAME;
  const servers = z.array(Resource).parse(await call(subscription,
    'postgres', 'flexible-server', 'list', '--resource-group', group));
  const matching = servers.filter((server) => server.tags['azd-env-name'] === environment);
  if (matching.length !== 1) throw new Error('PostgreSQL server target is absent or ambiguous');
  const server = matching[0];
  const expected_id = `/subscriptions/${subscription}/resourceGroups/${group}/providers/Microsoft.DBforPostgreSQL/flexibleServers/${server.name}`;
  if (server.id.toLowerCase() !== expected_id.toLowerCase()) {
    throw new Error('PostgreSQL server inventory does not match the selected target');
  }
  const details = Resource.extend({ state: z.string() }).parse(await call(subscription,
    'postgres', 'flexible-server', 'show', '--resource-group', group, '--name', server.name));
  if (details.id.toLowerCase() !== expected_id.toLowerCase() ||
    details.tags['azd-env-name'] !== environment || details.state !== 'Ready') {
    throw new Error('PostgreSQL server details or readiness do not match the selected target');
  }
  const allowlist = environ.AZURE_POSTGRESQL_OUTBOUND_IPS ?? '';
  validate_outbound_ipv4s(allowlist);
  const desired = new Map(allowlist.split(',').map((address, index) => [`container-app-egress-${index}`, address]));
  const [current] = await postgres_firewall_rule_inventory(subscription, group, server.name, call);
  for (const name of [...current.keys()].filter((name) => !desired.has(name)).sort()) {
    await call(subscription, 'postgres', 'flexible-server', 'firewall-rule', 'delete',
      '--resource-group', group, '--name', server.name, '--rule-name', name, '--yes');
  }
  const [actual, unrecognized] = await postgres_firewall_rule_inventory(subscription, group, server.name, call);
  if (unrecognized || actual.size !== desired.size || [...desired].some(([name, address]) =>
    actual.get(name)?.startIpAddress !== address || actual.get(name)?.endIpAddress !== address)) {
    throw new Error('PostgreSQL firewall-rule inventory does not match the approved allowlist');
  }
  console.error('INFO: Verified PostgreSQL firewall rules match the approved allowlist');
}

/** Mutations require the workflow's explicit maintenance approvals and isolated identity. */
export async function run(action: string, options: {
  environ?: Environment; azure?: Azure; now?: () => number; sleep?: (milliseconds: number) => Promise<unknown>;
} = {}): Promise<void> {
  if (!['verify', 'quiesce', 'resume', 'reconcile-firewall'].includes(action)) throw new Error('Invalid deployment action');
  const environ = options.environ ?? process.env;
  const call = options.azure ?? azure;
  const [subscription, group, app] = await deployment_target(environ, call);
  if (action === 'reconcile-firewall') {
    await reconcile_postgres_firewall(subscription, group, environ, call);
    return;
  }
  if (!app) {
    if (action === 'resume') throw new Error('Cannot resume an app that has not been provisioned');
    console.error('INFO: No existing web app in the selected isolated target');
    return;
  }
  if (action === 'quiesce' || action === 'resume') {
    const operation = action === 'quiesce' ? 'stop' : 'start';
    await call(subscription, 'rest', '--method', 'post', '--url',
      `https://management.azure.com${app.id}/${operation}?api-version=2026-07-01`);
  }
  const now = options.now ?? Date.now;
  const deadline = now() + 300_000;
  while (true) {
    const state = z.object({ properties: z.object({ runningStatus: z.string() }) })
      .parse(await call(subscription, 'containerapp', 'show', '--resource-group', group, '--name', app.name))
      .properties.runningStatus;
    const count = await replica_count(subscription, group, app.name, call);
    if (action === 'resume') {
      if (count > 1) throw new Error('Multiple replicas detected; stop writers before recovery');
      if (count === 1 && state === 'Running') return;
    } else if (count === 0 && state === 'Stopped') return;
    if (action === 'verify' || now() >= deadline) throw new Error('Writer exclusion could not be verified');
    await (options.sleep ?? sleep)(5000);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.argv[2] ?? '').catch(() => {
    console.error('ERROR: Deployment gate failed; verify approved workflow settings and inventory');
    process.exitCode = 1;
  });
}
