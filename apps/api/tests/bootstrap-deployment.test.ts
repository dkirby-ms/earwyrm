import { access, readFile, stat } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bootstrap } from '../../../scripts/bootstrap_deployment.js';
import { DeploymentGateError, type Azure } from '../../../scripts/deployment_gate.js';

function fixture() {
  const environ: Record<string, string> = {
    AZURE_SUBSCRIPTION_ID: '11111111-1111-4111-8111-111111111111',
    AZURE_TENANT_ID: '22222222-2222-4222-8222-222222222222',
    AZURE_CLIENT_ID: '33333333-3333-4333-8333-333333333333',
    AZURE_PRINCIPAL_ID: '44444444-4444-4444-8444-444444444444',
    AZURE_LOCATION: 'eastus', AZURE_KEY_VAULT_RESOURCE_GROUP: 'rg-credentials',
    AZURE_KEY_VAULT_NAME: 'earwyrm-test-vault',
    AZURE_POSTGRESQL_PASSWORD_SECRET_NAME: 'postgres-password',
    AZURE_POSTGRESQL_ADMIN_LOGIN: 'earwyrmadmin',
    GITHUB_ACTIONS: 'true', ACTIONS_ID_TOKEN_REQUEST_URL: 'https://oidc.example.test',
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'test-only', EARWYRM_BOOTSTRAP_APPROVED: 'true',
  };
  const vault_id = `/subscriptions/${environ.AZURE_SUBSCRIPTION_ID}/resourceGroups/rg-credentials/providers/Microsoft.KeyVault/vaults/earwyrm-test-vault`;
  const secret_id = `https://earwyrm-test-vault.vault.azure.net/secrets/postgres-password/${'a'.repeat(32)}`;
  const state = { group: false, vault: false, secret: false, password: '', path: '', mode: 0 };
  const calls: string[][] = [];
  const azure: Azure = async (subscription, ...args) => {
    expect(subscription).toBe(environ.AZURE_SUBSCRIPTION_ID);
    calls.push(args);
    const command = args.slice(0, args.findIndex((argument) => argument.startsWith('--'))).join(' ');
    if (args.join(' ') === 'account show') return {
      id: subscription, tenantId: environ.AZURE_TENANT_ID,
      user: { type: 'servicePrincipal', name: environ.AZURE_CLIENT_ID },
    };
    if (command === 'group exists') return state.group;
    if (command === 'group create') { state.group = true; return { id: vault_id.split('/providers/')[0] }; }
    if (command === 'keyvault list') {
      expect(state.group).toBe(true);
      return state.vault ? [{ id: vault_id, name: environ.AZURE_KEY_VAULT_NAME }] : [];
    }
    if (command === 'keyvault create') { state.vault = true; return { id: vault_id }; }
    if (command === 'keyvault show') return {
      id: vault_id, properties: {
        tenantId: environ.AZURE_TENANT_ID, enableRbacAuthorization: true, enabledForTemplateDeployment: true,
      },
    };
    if (command === 'role assignment create') return 'role-id';
    if (command === 'keyvault secret show') {
      if (state.secret) return secret_id;
      throw new DeploymentGateError('Test secret is absent', 'SecretNotFound');
    }
    if (command === 'keyvault secret set') {
      state.path = args[args.indexOf('--file') + 1];
      state.mode = (await stat(state.path)).mode & 0o777;
      state.password = await readFile(state.path, 'utf8');
      state.secret = true;
      return secret_id;
    }
    if (command === 'rest' && args[2] === 'delete') return null;
    throw new Error(`Unexpected mocked bootstrap operation: ${command}`);
  };
  return { environ, azure, state, calls, vault_id };
}

afterEach(() => vi.restoreAllMocks());

describe('credential bootstrap without Azure access', () => {
  it('creates missing prerequisites with a private password file and scoped, cleaned-up grants', async () => {
    const test = fixture();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    await bootstrap(test);
    expect(test.state).toMatchObject({ group: true, vault: true, secret: true, mode: 0o600 });
    expect(test.state.password.length).toBeGreaterThanOrEqual(32);
    expect(test.state.password.length).toBeLessThanOrEqual(128);
    expect(test.state.password).toMatch(/[a-z]/);
    expect(test.state.password).toMatch(/[A-Z]/);
    expect(test.state.password).toMatch(/[0-9]/);
    expect(test.state.password).toMatch(/[^a-zA-Z0-9]/);
    expect(test.state.password.toLowerCase()).not.toContain(test.environ.AZURE_POSTGRESQL_ADMIN_LOGIN);
    expect(JSON.stringify(test.calls)).not.toContain(test.state.password);
    expect(JSON.stringify(log.mock.calls)).not.toContain(test.state.password);
    await expect(access(test.state.path)).rejects.toMatchObject({ code: 'ENOENT' });
    const grants = test.calls.filter((args) => args.slice(0, 3).join(' ') === 'role assignment create');
    expect(grants).toHaveLength(2);
    expect(grants[0][grants[0].indexOf('--role') + 1]).toBe('b86a8fe4-44ce-4948-aee5-eccb2c155cd7');
    expect(grants[1][grants[1].indexOf('--role') + 1]).toBe('4633458b-17de-408a-b874-0445c86b69e6');
    expect(grants[0][grants[0].indexOf('--scope') + 1]).toBe(test.vault_id);
    expect(grants[1][grants[1].indexOf('--scope') + 1]).toBe(`${test.vault_id}/secrets/postgres-password`);
    const delete_call = test.calls.find((args) => args[0] === 'rest');
    expect(delete_call?.[2]).toBe('delete');
    expect(delete_call?.[4]).toContain(`/${grants[0][grants[0].indexOf('--name') + 1]}?api-version=`);
    expect(test.calls.at(-1)?.slice(0, 3)).toEqual(['keyvault', 'secret', 'show']);
  });

  it('preserves existing vaults and password versions on repeated runs', async () => {
    const test = fixture();
    Object.assign(test.state, { group: true, vault: true, secret: true });
    await bootstrap(test);
    await bootstrap(test);
    expect(test.calls.filter((args) => args.includes('create') && args[0] !== 'role')).toEqual([]);
    expect(test.calls.filter((args) => args.slice(0, 3).join(' ') === 'keyvault secret set')).toEqual([]);
  });

  it.each([
    ['EARWYRM_BOOTSTRAP_APPROVED', 'false'],
    ['GITHUB_ACTIONS', 'false'],
    ['AZURE_LOCATION', ''],
    ['AZURE_SUBSCRIPTION_ID', 'invalid-subscription'],
    ['AZURE_KEY_VAULT_RESOURCE_GROUP', '../../another-scope'],
  ])('refuses invalid approval, identity or target %s before invoking Azure', async (name, value) => {
    const test = fixture();
    test.environ[name] = value;
    await expect(bootstrap(test)).rejects.toThrow();
    expect(test.calls).toEqual([]);
  });

  it('does not reconfigure a pre-existing vault with incompatible security settings', async () => {
    const test = fixture();
    Object.assign(test.state, { group: true, vault: true });
    const azure: Azure = async (subscription, ...args) => {
      const response = await test.azure(subscription, ...args);
      if (args.slice(0, 2).join(' ') === 'keyvault show') return {
        id: test.vault_id, properties: {
          tenantId: test.environ.AZURE_TENANT_ID,
          enableRbacAuthorization: false, enabledForTemplateDeployment: true,
        },
      };
      return response;
    };
    await expect(bootstrap({ ...test, azure })).rejects.toThrow('will not change its security settings');
    expect(test.calls.some((args) => args.includes('create'))).toBe(false);
  });

  it('does not treat a firewall denial as a missing password, and removes its temporary writer grant', async () => {
    const test = fixture();
    const azure: Azure = async (subscription, ...args) => {
      if (args.slice(0, 3).join(' ') === 'keyvault secret show') {
        throw new DeploymentGateError('Test firewall denial', 'ForbiddenByFirewall');
      }
      return test.azure(subscription, ...args);
    };
    await expect(bootstrap({ ...test, azure })).rejects.toThrow('Test firewall denial');
    expect(test.state.secret).toBe(false);
    expect(test.calls.at(-1)?.slice(0, 3)).toEqual(['rest', '--method', 'delete']);
  });

  it('waits for RBAC propagation before checking whether the secret is missing', async () => {
    const test = fixture();
    let remaining = 2;
    const pause = vi.fn(async () => {});
    const azure: Azure = async (subscription, ...args) => {
      if (args.slice(0, 3).join(' ') === 'keyvault secret show' && remaining-- > 0) {
        throw new DeploymentGateError('Test RBAC propagation', 'ForbiddenByRbac');
      }
      return test.azure(subscription, ...args);
    };
    await bootstrap({ ...test, azure, sleep: pause });
    expect(pause).toHaveBeenCalledTimes(2);
    expect(test.state.secret).toBe(true);
  });

  it('bounds forbidden retries without generating a password', async () => {
    const test = fixture();
    const pause = vi.fn(async () => {});
    const azure: Azure = async (subscription, ...args) => {
      if (args.slice(0, 3).join(' ') === 'keyvault secret show') {
        throw new DeploymentGateError('Test authorization denial', 'Forbidden');
      }
      return test.azure(subscription, ...args);
    };
    await expect(bootstrap({ ...test, azure, sleep: pause })).rejects.toThrow('propagation wait');
    expect(pause).toHaveBeenCalledTimes(29);
    expect(test.state.path).toBe('');
    expect(test.calls.at(-1)?.slice(0, 3)).toEqual(['rest', '--method', 'delete']);
  });

  it('cleans the password file and temporary writer grant when secret creation fails', async () => {
    const test = fixture();
    const azure: Azure = async (subscription, ...args) => {
      if (args.slice(0, 3).join(' ') === 'keyvault secret set') {
        test.state.path = args[args.indexOf('--file') + 1];
        await expect(access(test.state.path)).resolves.toBeUndefined();
        throw new DeploymentGateError('Test secret write failed');
      }
      return test.azure(subscription, ...args);
    };
    await expect(bootstrap({ ...test, azure })).rejects.toThrow('Test secret write failed');
    await expect(access(test.state.path)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(test.calls.at(-1)?.slice(0, 3)).toEqual(['rest', '--method', 'delete']);
  });

  it('preserves pre-existing role grants and cleans only its run-specific writer assignment', async () => {
    const test = fixture();
    Object.assign(test.state, { group: true, vault: true, secret: true });
    const azure: Azure = async (subscription, ...args) => {
      const response = await test.azure(subscription, ...args);
      if (args.slice(0, 3).join(' ') === 'role assignment create') {
        throw new DeploymentGateError('Test existing matching assignment', 'RoleAssignmentExists');
      }
      return response;
    };
    await bootstrap({ ...test, azure });
    expect(test.calls.filter((args) => args[0] === 'rest')).toHaveLength(1);
    expect(test.calls.find((args) => args[0] === 'rest')?.[4]).toContain('/roleAssignments/');
  });

  it('fails explicitly when temporary role cleanup cannot be verified', async () => {
    const test = fixture();
    test.state.secret = true;
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const azure: Azure = async (subscription, ...args) => {
      if (args[0] === 'rest') throw new DeploymentGateError('Test cleanup denied');
      return test.azure(subscription, ...args);
    };
    await expect(bootstrap({ ...test, azure })).rejects.toThrow('Test cleanup denied');
    expect(JSON.stringify(log.mock.calls)).toContain('an owner must inspect bootstrap role assignments');
  });
});
