import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run, type Azure } from '../../../scripts/deployment_gate.js';

const subscription = 'subscription';
const group = 'rg-test';
const app = {
  name: 'web',
  id: `/subscriptions/${subscription}/resourceGroups/${group}/providers/Microsoft.App/containerApps/web`,
  tags: { 'azd-env-name': 'test', 'azd-service-name': 'web' },
};
const server = {
  name: 'postgres',
  id: `/subscriptions/${subscription}/resourceGroups/${group}/providers/Microsoft.DBforPostgreSQL/flexibleServers/postgres`,
  tags: { 'azd-env-name': 'test' },
};
const group_id = `/subscriptions/${subscription}/resourceGroups/${group}`;
const environment_id = `${group_id}/providers/Microsoft.App/managedEnvironments/environment`;
const vnet_id = `${group_id}/providers/Microsoft.Network/virtualNetworks/network`;
const zone_id = `${group_id}/providers/Microsoft.Network/privateDnsZones/privatelink.postgres.database.azure.com`;
function fixture() {
  const environ: Record<string, string> = {
    AZURE_SUBSCRIPTION_ID: subscription, AZURE_TENANT_ID: 'tenant', AZURE_CLIENT_ID: 'client',
    AZURE_PRINCIPAL_ID: 'principal', AZURE_ENV_NAME: 'test',
    AZURE_KEY_VAULT_NAME: 'vault', AZURE_KEY_VAULT_RESOURCE_GROUP: 'vault-rg',
    AZURE_POSTGRESQL_PASSWORD_SECRET_NAME: 'postgres-password',
    AZURE_POSTGRESQL_ADMIN_LOGIN: 'admin',
    GITHUB_ACTIONS: 'true', ACTIONS_ID_TOKEN_REQUEST_URL: 'https://oidc.example.test',
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'test-only',
    EARWYRM_MAINTENANCE_APPROVED: 'true', EARWYRM_OTHER_WRITERS_STOPPED: 'true',
  };
  const calls: string[][] = [];
  const network = {
    server: { ...server, state: 'Ready', network: { publicNetworkAccess: 'Disabled' } },
    app: { ...app, properties: { environmentId: environment_id } },
    environment: {
      name: 'environment', id: environment_id, properties: {
        provisioningState: 'Succeeded', vnetConfiguration: { infrastructureSubnetId: `${vnet_id}/subnets/aca` },
      },
    },
    endpoints: { value: [{
      name: 'postgres-endpoint', id: `${group_id}/providers/Microsoft.Network/privateEndpoints/postgres-endpoint`,
      tags: { 'azd-env-name': 'test' }, properties: {
        provisioningState: 'Succeeded', subnet: { id: `${vnet_id}/subnets/endpoints` },
        privateLinkServiceConnections: [{ properties: {
          privateLinkServiceId: server.id, groupIds: ['postgresqlServer'],
          privateLinkServiceConnectionState: { status: 'Approved' },
        } }],
      },
    }] },
    zoneGroups: { value: [{ properties: {
      provisioningState: 'Succeeded',
      privateDnsZoneConfigs: [{ properties: { privateDnsZoneId: zone_id } }],
    } }] },
    links: { value: [{ properties: {
      provisioningState: 'Succeeded', virtualNetworkLinkState: 'Completed', virtualNetwork: { id: vnet_id },
    } }] },
  };
  const azure: Azure = async (target, ...args) => {
    expect(target).toBe(subscription);
    calls.push(args);
    const command = args.slice(0, 4).join(' ');
    if (command.startsWith('account show')) return {
      id: subscription, tenantId: 'tenant', user: { type: 'servicePrincipal', name: 'client' },
    };
    if (command.startsWith('keyvault show')) return {
      properties: { enableRbacAuthorization: true, enabledForTemplateDeployment: true },
    };
    if (command.startsWith('keyvault secret show')) return `https://vault.vault.azure.net/secrets/password/${'a'.repeat(32)}`;
    if (command.startsWith('group exists')) return true;
    if (command.startsWith('containerapp list')) return [app];
    if (command.startsWith('containerapp show')) return { properties: { runningStatus: 'Stopped' } };
    if (command.startsWith('containerapp revision list')) return [{ name: 'old' }, { name: 'new' }];
    if (command.startsWith('containerapp replica list')) return [];
    if (args[0] === 'rest') {
      if (args[2] === 'post') return null;
      const path = new URL(args[args.indexOf('--url') + 1]).pathname;
      if (path === app.id) return network.app;
      if (path === environment_id) return network.environment;
      if (path === `${group_id}/providers/Microsoft.Network/privateEndpoints`) return network.endpoints;
      if (path === `${network.endpoints.value[0]?.id}/privateDnsZoneGroups`) return network.zoneGroups;
      if (path === `${zone_id}/virtualNetworkLinks`) return network.links;
    }
    if (command.startsWith('postgres flexible-server list')) return [server];
    if (command.startsWith('postgres flexible-server show')) return network.server;
    throw new Error(`Unexpected mocked command ${command}`);
  };
  return { environ, calls, azure, network };
}

/** Runs the real CLI with a temporary fake az executable; it cannot reach Azure. */
function run_cli(environ: Record<string, string>, overrides: Record<string, {
  stdout?: string; stderr?: string; status?: number;
}> = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'earwyrm-deployment-cli-'));
  const responses = {
    'account show': { stdout: JSON.stringify({
      id: subscription, tenantId: 'tenant', user: { type: 'servicePrincipal', name: 'client' },
    }) },
    'keyvault show': { stdout: JSON.stringify({
      properties: { enableRbacAuthorization: true, enabledForTemplateDeployment: true },
    }) },
    'keyvault secret show': { stdout: JSON.stringify(`https://vault.vault.azure.net/secrets/password/${'a'.repeat(32)}`) },
    'group exists': { stdout: 'false' },
    ...overrides,
  };
  try {
    writeFileSync(join(directory, 'az'), `#!${process.execPath}
const args = process.argv.slice(2);
const flag = args.findIndex((argument) => argument.startsWith('-'));
const command = args.slice(0, flag === -1 ? args.length : flag).join(' ');
const response = ${JSON.stringify(responses)}[command];
if (!response) { process.stderr.write('Unexpected fake Azure command'); process.exit(99); }
process.stdout.write(response.stdout ?? '');
process.stderr.write(response.stderr ?? '');
process.exitCode = response.status ?? 0;
`, { mode: 0o700 });
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/deployment_gate.ts', 'quiesce'], {
      cwd: fileURLToPath(new URL('../../../', import.meta.url)),
      env: { ...environ, HOME: directory, PATH: `${directory}${delimiter}${process.env.PATH ?? ''}` },
      encoding: 'utf8', timeout: 15_000, maxBuffer: 1024 * 1024,
    });
    expect(result.error).toBeUndefined();
    return result;
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

describe('deployment maintenance gate without Azure access', () => {
  it('prints the missing setting name and exits nonzero before invoking Azure', () => {
    const test = fixture();
    delete test.environ.AZURE_KEY_VAULT_NAME;
    const result = run_cli(test.environ);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Required deployment setting is missing: AZURE_KEY_VAULT_NAME');
    expect(result.stderr).not.toContain('INFO: Azure operation:');
  });
  it('prints the failed Azure command, exit code and recognized error code without raw output', () => {
    const result = run_cli(fixture().environ, {
      'keyvault show': {
        status: 3, stdout: 'do-not-log-this-stdout',
        stderr: 'ERROR: (Forbidden) do-not-log-this-credential',
      },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('az keyvault show failed (exit 3; Forbidden)');
    expect(result.stderr).not.toContain('do-not-log-this');
    expect(result.stderr).not.toContain('--subscription');
    expect(result.stderr).not.toContain('--resource-group');
  });
  it('does not expose malformed Azure JSON in diagnostics', () => {
    const result = run_cli(fixture().environ, { 'account show': { stdout: '{"token":"do-not-log-this' } });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('az account show returned invalid JSON');
    expect(result.stderr).not.toContain('do-not-log-this');
  });
  it('identifies an invalid response field without logging its value', () => {
    const result = run_cli(fixture().environ, {
      'keyvault show': { stdout: JSON.stringify({
        properties: { enableRbacAuthorization: true, enabledForTemplateDeployment: 'do-not-log-this' },
      }) },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('INFO: Azure operation: az keyvault show');
    expect(result.stderr).toContain('properties.enabledForTemplateDeployment (invalid_type)');
    expect(result.stderr).not.toContain('do-not-log-this');
  });
  it('does not expose user-defined inventory keys in schema diagnostics', () => {
    const result = run_cli(fixture().environ, {
      'group exists': { stdout: 'true' },
      'containerapp list': { stdout: JSON.stringify([{ ...app, tags: { 'do-not-log-this-key': 123 } }]) },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('tags.[redacted-key]');
    expect(result.stderr).not.toContain('do-not-log-this');
  });
  it('keeps successful fresh-target preflight working through the actual CLI', () => {
    const result = run_cli(fixture().environ);
    expect(result.status).toBe(0);
    expect(result.stderr).toContain('No existing web app in the selected isolated target');
    expect(result.stderr).not.toContain('ERROR:');
  });
  it.each([
    'GITHUB_ACTIONS', 'ACTIONS_ID_TOKEN_REQUEST_TOKEN',
    'EARWYRM_MAINTENANCE_APPROVED', 'EARWYRM_OTHER_WRITERS_STOPPED',
  ])('refuses missing approval or OIDC setting %s before invoking Azure', async (name) => {
    const test = fixture();
    delete test.environ[name];
    await expect(run('verify', test)).rejects.toThrow();
    expect(test.calls).toEqual([]);
  });
  it('accepts a newly rotated latest secret without configuring a version', async () => {
    const test = fixture();
    const azure: Azure = async (target, ...args) => {
      if (args.slice(0, 3).join(' ') === 'keyvault secret show') {
        expect(args).not.toContain('--version');
        expect(args.slice(-2)).toEqual(['--query', 'id']);
        return `https://vault.vault.azure.net/secrets/postgres-password/${'b'.repeat(32)}`;
      }
      return test.azure(target, ...args);
    };
    await run('verify', { ...test, azure });
    expect(test.calls.some((args) => args.slice(0, 2).join(' ') === 'containerapp list')).toBe(true);
  });
  it.each(['account', 'vault', 'secret', 'apps', 'revisions', 'replicas', 'running-empty'])(
    'blocks unknown or unsafe %s inventory without stopping anything', async (failure) => {
      const test = fixture();
      const azure: Azure = async (target, ...args) => {
        const command = args.slice(0, 3).join(' ');
        if (failure === 'account' && command.startsWith('account show')) return {
          id: subscription, tenantId: 'tenant', user: { type: 'user', name: 'client' },
        };
        if (failure === 'vault' && command.startsWith('keyvault show')) return {
          properties: { enableRbacAuthorization: false, enabledForTemplateDeployment: true },
        };
        if (failure === 'secret' && command === 'keyvault secret show') return 'https://vault/secrets/password/wrong';
        if (failure === 'apps' && command.startsWith('containerapp list')) return [app, app];
        if (failure === 'revisions' && command === 'containerapp revision list') return [];
        if (failure === 'replicas' && command === 'containerapp replica list') return [{ name: 'active' }];
        if (failure === 'running-empty' && command.startsWith('containerapp show')) return { properties: { runningStatus: 'Running' } };
        return test.azure(target, ...args);
      };
      await expect(run('verify', { ...test, azure })).rejects.toThrow();
      expect(test.calls.some((args) => args[0] === 'rest')).toBe(false);
    });
  it.each(['verify', 'quiesce'])('checks every revision for %s', async (action) => {
    const test = fixture();
    await run(action, test);
    expect(test.calls.filter((args) => args.slice(0, 3).join(' ') === 'containerapp replica list')
      .map((args) => args.at(-1))).toEqual(['old', 'new']);
    expect(test.calls.filter((args) => args[0] === 'rest')).toHaveLength(action === 'quiesce' ? 1 : 0);
  });
  it('does not equate an accepted stop with writer exclusion and times out', async () => {
    const test = fixture();
    let tick = 0;
    const azure: Azure = async (target, ...args) => args.slice(0, 3).join(' ') === 'containerapp replica list'
      ? [{ name: 'still-running' }] : test.azure(target, ...args);
    await expect(run('quiesce', { ...test, azure, now: () => tick++ * 300_001, sleep: async () => undefined }))
      .rejects.toThrow('Writer exclusion');
  });
  it('requires exactly one running replica on resume', async () => {
    const test = fixture();
    const azure: Azure = async (target, ...args) => {
      if (args.slice(0, 2).join(' ') === 'containerapp show') return { properties: { runningStatus: 'Running' } };
      if (args.slice(0, 3).join(' ') === 'containerapp replica list') return [{ name: 'one' }];
      return test.azure(target, ...args);
    };
    await expect(run('resume', { ...test, azure })).rejects.toThrow('Multiple replicas');
  });
  it('resumes only after private networking is verified and exactly one replica is running', async () => {
    const test = fixture();
    const azure: Azure = async (target, ...args) => {
      if (args.slice(0, 2).join(' ') === 'containerapp show') return { properties: { runningStatus: 'Running' } };
      if (args.slice(0, 3).join(' ') === 'containerapp replica list') {
        return args.at(-1) === 'new' ? [{ name: 'one' }] : [];
      }
      return test.azure(target, ...args);
    };
    await run('resume', { ...test, azure });
    const start_index = test.calls.findIndex((args) => args[0] === 'rest' && args[2] === 'post');
    const dns_index = test.calls.findIndex((args) => args[0] === 'rest' && args.at(-1)?.includes('/virtualNetworkLinks?'));
    expect(dns_index).toBeGreaterThan(-1);
    expect(start_index).toBeGreaterThan(dns_index);
    expect(test.calls[start_index].at(-1)).toContain(`${app.id}/start?`);
  });
  it('verifies private PostgreSQL networking without an outbound allowlist or Azure mutations', async () => {
    const test = fixture();
    await run('verify-network', test);
    expect(test.calls.some((args) => args.includes('firewall-rule') || args[2] === 'post')).toBe(false);
    expect(test.calls.filter((args) => args[0] === 'rest')).toHaveLength(5);
  });
  it.each([
    'public-database', 'unready-server', 'missing-endpoint', 'duplicate-endpoint', 'unapproved-endpoint',
    'wrong-server', 'different-vnet', 'shared-subnet', 'missing-vnet',
    'missing-dns-group', 'wrong-dns-zone', 'missing-dns-link', 'incomplete-dns-link',
  ])('blocks %s before resuming the app', async (failure) => {
    const test = fixture();
    const network = test.network;
    switch (failure) {
      case 'public-database': network.server.network.publicNetworkAccess = 'Enabled'; break;
      case 'unready-server': network.server.state = 'Updating'; break;
      case 'missing-endpoint': network.endpoints.value = []; break;
      case 'duplicate-endpoint': network.endpoints.value.push(network.endpoints.value[0]); break;
      case 'unapproved-endpoint':
        network.endpoints.value[0].properties.privateLinkServiceConnections[0].properties.privateLinkServiceConnectionState.status = 'Pending';
        break;
      case 'wrong-server':
        network.endpoints.value[0].properties.privateLinkServiceConnections[0].properties.privateLinkServiceId = `${server.id}-other`;
        break;
      case 'different-vnet': network.endpoints.value[0].properties.subnet.id = `${vnet_id}-other/subnets/endpoints`; break;
      case 'shared-subnet': network.endpoints.value[0].properties.subnet.id = `${vnet_id}/subnets/aca`; break;
      case 'missing-vnet': network.environment.properties.vnetConfiguration.infrastructureSubnetId = ''; break;
      case 'missing-dns-group': network.zoneGroups.value = []; break;
      case 'wrong-dns-zone':
        network.zoneGroups.value[0].properties.privateDnsZoneConfigs[0].properties.privateDnsZoneId = `${zone_id}-other`;
        break;
      case 'missing-dns-link': network.links.value = []; break;
      case 'incomplete-dns-link': network.links.value[0].properties.virtualNetworkLinkState = 'InProgress'; break;
    }
    await expect(run('resume', test)).rejects.toThrow();
    expect(test.calls.some((args) => args[0] === 'rest' && args[2] === 'post')).toBe(false);
  });
  it('rejects a truncated endpoint inventory instead of accepting the first page', async () => {
    const test = fixture();
    const azure: Azure = async (target, ...args) => {
      const result = await test.azure(target, ...args);
      return result === test.network.endpoints ? { ...test.network.endpoints, nextLink: 'https://management.azure.com/next' } : result;
    };
    await expect(run('verify-network', { ...test, azure })).rejects.toThrow();
  });
});
