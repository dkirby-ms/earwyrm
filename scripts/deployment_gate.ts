import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { z } from 'zod';

const execute = promisify(execFile);
const POSTGRES_REQUIRED_SETTINGS = [
  'AZURE_KEY_VAULT_NAME', 'AZURE_KEY_VAULT_RESOURCE_GROUP',
  'AZURE_POSTGRESQL_PASSWORD_SECRET_NAME',
  'AZURE_POSTGRESQL_ADMIN_LOGIN',
] as const;
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

/** Validates workflow consent and inventories only the configured isolated deployment. */
export async function deployment_target(
  environ: Environment = process.env,
  call: Azure = azure,
): Promise<[string, string, Resource | null]> {
  for (const name of [
    'AZURE_SUBSCRIPTION_ID', 'AZURE_TENANT_ID', 'AZURE_CLIENT_ID',
    'AZURE_PRINCIPAL_ID', 'AZURE_ENV_NAME', ...POSTGRES_REQUIRED_SETTINGS,
  ]) {
    if (!environ[name]) {
      throw new Error(`Required deployment setting is missing: ${name}`);
    }
  }
  const required = (name: string): string => {
    const value = environ[name];
    if (value === undefined) throw new Error(`Required deployment setting is missing: ${name}`);
    return value;
  };
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
  const secret_id = z.string().url().parse(await call(subscription, 'keyvault', 'secret', 'show',
    '--vault-name', required('AZURE_KEY_VAULT_NAME'),
    '--name', required('AZURE_POSTGRESQL_PASSWORD_SECRET_NAME'), '--query', 'id'));
  if (!/\/[0-9a-fA-F]{32}\/?$/.test(secret_id)) {
    throw new Error('The latest PostgreSQL Key Vault secret must have a valid versioned ID');
  }
  const group = `rg-${environment}`;
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

/** Checks private endpoint and DNS management inventory; does not prove live data-plane connectivity. */
export async function verify_private_network(
  subscription: string, group: string, app: Resource, environ: Environment = process.env, call: Azure = azure,
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
  const details = Resource.extend({
    state: z.string(), network: z.object({ publicNetworkAccess: z.literal('Disabled') }),
  }).parse(await call(subscription,
    'postgres', 'flexible-server', 'show', '--resource-group', group, '--name', server.name));
  if (details.id.toLowerCase() !== expected_id.toLowerCase() ||
    details.tags['azd-env-name'] !== environment || details.state !== 'Ready') {
    throw new Error('PostgreSQL server details or readiness do not match the selected target');
  }
  const group_id = `/subscriptions/${subscription}/resourceGroups/${group}`;
  const read = (id: string, version: string) => call(subscription, 'rest', '--method', 'get', '--url',
    `https://management.azure.com${id}?api-version=${version}`);
  const app_details = Resource.extend({
    properties: z.object({ environmentId: z.string().min(1) }),
  }).parse(await read(app.id, '2026-07-01'));
  const environment_id = app_details.properties.environmentId;
  const environment_name = environment_id.split('/').at(-1);
  if (app_details.id.toLowerCase() !== app.id.toLowerCase() || !environment_name ||
    environment_id.toLowerCase() !== `${group_id}/providers/Microsoft.App/managedEnvironments/${environment_name}`.toLowerCase()) {
    throw new Error('Container app environment does not match the selected target');
  }
  const managed_environment = Resource.extend({ properties: z.object({
    provisioningState: z.literal('Succeeded'),
    vnetConfiguration: z.object({ infrastructureSubnetId: z.string().min(1) }),
  }) }).parse(await read(environment_id, '2026-03-02-preview'));
  const subnet_id = managed_environment.properties.vnetConfiguration.infrastructureSubnetId.toLowerCase();
  const [vnet_id, subnet_name, ...extra] = subnet_id.split('/subnets/');
  const vnet_name = vnet_id.split('/').at(-1);
  if (managed_environment.id.toLowerCase() !== environment_id.toLowerCase() || !subnet_name ||
    subnet_name.includes('/') || extra.length || !vnet_name ||
    vnet_id !== `${group_id}/providers/Microsoft.Network/virtualNetworks/${vnet_name}`.toLowerCase()) {
    throw new Error('Container Apps must use a subnet in the selected private virtual network');
  }
  const endpoints = z.object({ nextLink: z.null().optional(), value: z.array(Resource.extend({ properties: z.object({
    provisioningState: z.literal('Succeeded'),
    subnet: z.object({ id: z.string() }),
    privateLinkServiceConnections: z.array(z.object({ properties: z.object({
      privateLinkServiceId: z.string(), groupIds: z.array(z.string()),
      privateLinkServiceConnectionState: z.object({ status: z.string() }),
    }) })),
  }) })) }).parse(await read(`${group_id}/providers/Microsoft.Network/privateEndpoints`, '2026-03-01')).value;
  const matching_endpoints = endpoints.filter((endpoint) =>
    endpoint.tags['azd-env-name'] === environment && endpoint.properties.privateLinkServiceConnections.some(({ properties }) =>
      properties.privateLinkServiceId.toLowerCase() === server.id.toLowerCase() &&
      properties.groupIds.includes('postgresqlServer') && properties.privateLinkServiceConnectionState.status === 'Approved'));
  if (matching_endpoints.length !== 1) throw new Error('PostgreSQL private endpoint is absent, unapproved or ambiguous');
  const endpoint = matching_endpoints[0];
  const endpoint_subnet = endpoint.properties.subnet.id.toLowerCase();
  const endpoint_subnet_name = endpoint_subnet.slice(`${vnet_id}/subnets/`.length);
  if (endpoint.id.toLowerCase() !== `${group_id}/providers/Microsoft.Network/privateEndpoints/${endpoint.name}`.toLowerCase() ||
    !endpoint_subnet.startsWith(`${vnet_id}/subnets/`) || !endpoint_subnet_name || endpoint_subnet_name.includes('/') ||
    endpoint_subnet === subnet_id) {
    throw new Error('PostgreSQL private endpoint must use a separate subnet in the Container Apps virtual network');
  }
  const zone_id = `${group_id}/providers/Microsoft.Network/privateDnsZones/privatelink.postgres.database.azure.com`;
  const zone_groups = z.object({ nextLink: z.null().optional(), value: z.array(z.object({ properties: z.object({
    provisioningState: z.literal('Succeeded'),
    privateDnsZoneConfigs: z.array(z.object({ properties: z.object({ privateDnsZoneId: z.string() }) })),
  }) })) }).parse(await read(`${endpoint.id}/privateDnsZoneGroups`, '2026-03-01')).value;
  if (!zone_groups.some(({ properties }) => properties.privateDnsZoneConfigs.some(({ properties: config }) =>
    config.privateDnsZoneId.toLowerCase() === zone_id.toLowerCase()))) {
    throw new Error('PostgreSQL private endpoint is missing its private DNS zone group');
  }
  const links = z.object({ nextLink: z.null().optional(), value: z.array(z.object({ properties: z.object({
    provisioningState: z.literal('Succeeded'), virtualNetworkLinkState: z.literal('Completed'),
    virtualNetwork: z.object({ id: z.string() }),
  }) })) }).parse(await read(`${zone_id}/virtualNetworkLinks`, '2024-06-01')).value;
  if (!links.some(({ properties }) => properties.virtualNetwork.id.toLowerCase() === vnet_id)) {
    throw new Error('PostgreSQL private DNS zone is not linked to the Container Apps virtual network');
  }
  console.error('INFO: Verified private PostgreSQL endpoint, DNS linkage and disabled public access');
}

/** Mutations require the workflow's explicit maintenance approvals and isolated identity. */
export async function run(action: string, options: {
  environ?: Environment; azure?: Azure; now?: () => number; sleep?: (milliseconds: number) => Promise<unknown>;
} = {}): Promise<void> {
  if (!['verify', 'quiesce', 'resume', 'verify-network'].includes(action)) throw new Error('Invalid deployment action');
  const environ = options.environ ?? process.env;
  const call = options.azure ?? azure;
  const [subscription, group, app] = await deployment_target(environ, call);
  if (action === 'verify-network' || action === 'resume') {
    if (!app) throw new Error('Private networking requires a provisioned container app');
    await verify_private_network(subscription, group, app, environ, call);
    if (action === 'verify-network') return;
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
