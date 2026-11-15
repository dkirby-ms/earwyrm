import { describe, expect, it } from 'vitest';
import { run, validate_outbound_ipv4s, type Azure } from '../../../scripts/deployment_gate.js';

const subscription = 'subscription';
const group = 'rg-earwyrm-test';
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
function fixture() {
  const environ: Record<string, string> = {
    AZURE_SUBSCRIPTION_ID: subscription, AZURE_TENANT_ID: 'tenant', AZURE_CLIENT_ID: 'client',
    AZURE_PRINCIPAL_ID: 'principal', AZURE_ENV_NAME: 'test',
    AZURE_KEY_VAULT_NAME: 'vault', AZURE_KEY_VAULT_RESOURCE_GROUP: 'vault-rg',
    AZURE_POSTGRESQL_PASSWORD_SECRET_NAME: 'postgres-password',
    AZURE_POSTGRESQL_PASSWORD_SECRET_VERSION: 'a'.repeat(32),
    AZURE_POSTGRESQL_ADMIN_LOGIN: 'admin', AZURE_POSTGRESQL_OUTBOUND_IPS: '8.8.8.8,1.1.1.1',
    GITHUB_ACTIONS: 'true', ACTIONS_ID_TOKEN_REQUEST_URL: 'https://oidc.example.test',
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'test-only',
    EARWYRM_MAINTENANCE_APPROVED: 'true', EARWYRM_OTHER_WRITERS_STOPPED: 'true',
  };
  const calls: string[][] = [];
  const rule = (name: string, address: string) => ({ name, startIpAddress: address, endIpAddress: address });
  let rules = [
    rule('container-app-egress-0', '8.8.8.8'), rule('container-app-egress-1', '1.1.1.1'),
    rule('container-app-egress-2', '9.9.9.9'),
  ];
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
    if (args[0] === 'rest') return null;
    if (command.startsWith('postgres flexible-server list')) return [server];
    if (command.startsWith('postgres flexible-server show')) return { ...server, state: 'Ready' };
    if (command === 'postgres flexible-server firewall-rule list') return rules.map((item) => ({ ...item }));
    if (command === 'postgres flexible-server firewall-rule delete') {
      rules = rules.filter((item) => item.name !== args[args.indexOf('--rule-name') + 1]);
      return null;
    }
    throw new Error(`Unexpected mocked command ${command}`);
  };
  return { environ, calls, azure, addRule: (name: string, address: string) => { rules.push(rule(name, address)); } };
}

describe('deployment maintenance gate without Azure access', () => {
  it.each([
    'GITHUB_ACTIONS', 'ACTIONS_ID_TOKEN_REQUEST_TOKEN',
    'EARWYRM_MAINTENANCE_APPROVED', 'EARWYRM_OTHER_WRITERS_STOPPED',
  ])('refuses missing approval or OIDC setting %s before invoking Azure', async (name) => {
    const test = fixture();
    delete test.environ[name];
    await expect(run('verify', test)).rejects.toThrow();
    expect(test.calls).toEqual([]);
  });
  it.each(['', '0.0.0.0', '0.0.0.0/0', '8.8.8.8,not-an-ip', '8.8.8.8,8.8.8.8',
    '127.0.0.1', '10.1.2.3', '100.64.0.1', '192.0.2.1', '224.0.0.1', '8.8.8.8, 1.1.1.1'])(
    'rejects unsafe outbound allowlist %s', (value) => {
      expect(() => validate_outbound_ipv4s(value)).toThrow('PostgreSQL outbound IPs');
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
  it('deletes only obsolete owned firewall rules then verifies exact addresses', async () => {
    const test = fixture();
    await run('reconcile-firewall', test);
    const deleted = test.calls.filter((args) => args[3] === 'delete');
    expect(deleted).toHaveLength(1);
    expect(deleted[0]).toContain('container-app-egress-2');
  });
  it('never deletes unrecognized firewall rules and fails closed', async () => {
    const test = fixture();
    test.addRule('operator-owned', '9.9.9.9');
    await expect(run('reconcile-firewall', test)).rejects.toThrow('allowlist');
    expect(test.calls.filter((args) => args[3] === 'delete').flat()).not.toContain('operator-owned');
  });
});
