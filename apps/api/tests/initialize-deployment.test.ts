import { access, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initialize_deployment } from '../../../scripts/initialize_deployment.js';
import {
  azure as execute_azure, deployment_target, DeploymentGateError, run, verify_private_network, type Azure,
} from '../../../scripts/deployment_gate.js';

vi.mock('../../../scripts/deployment_gate.js', async importOriginal => ({
  ...await importOriginal<typeof import('../../../scripts/deployment_gate.js')>(),
  deployment_target: vi.fn(),
  run: vi.fn(),
  verify_private_network: vi.fn(),
}));

function fixture() {
  const subscription = 'subscription', group = 'rg-test';
  const group_id = `/subscriptions/${subscription}/resourceGroups/${group}`;
  const app_id = `${group_id}/providers/Microsoft.App/containerApps/web`;
  const identity = `${group_id}/providers/Microsoft.ManagedIdentity/userAssignedIdentities/pull`;
  const environ: Record<string, string> = {
    EARWYRM_DATABASE_INITIALIZATION_APPROVED: 'true', EARWYRM_DATA_RESET_APPROVED: 'true',
    EARWYRM_BOOTSTRAP_OWNER_ISSUER: 'https://issuer.example.test',
    EARWYRM_BOOTSTRAP_OWNER_SUBJECT: 'verified-subject',
    EARWYRM_MAINTENANCE_APPROVED: 'true', EARWYRM_OTHER_WRITERS_STOPPED: 'true',
    AZURE_ENV_NAME: 'test', AZURE_KEY_VAULT_NAME: 'vault',
    AZURE_POSTGRESQL_PASSWORD_SECRET_NAME: 'password', AZURE_POSTGRESQL_ADMIN_LOGIN: 'admin',
  };
  const target = { id: app_id, name: 'web', tags: { 'azd-env-name': 'test', 'azd-service-name': 'web' } };
  const app = {
    ...target, location: 'eastus', identity: { userAssignedIdentities: { [identity]: {} } },
    properties: {
      environmentId: `${group_id}/providers/Microsoft.App/managedEnvironments/environment`,
      configuration: {
        registries: [{ server: 'registry.azurecr.io', identity }],
        secrets: [{ name: 'postgres-password', keyVaultUrl: 'https://vault.vault.azure.net/secrets/password', identity }],
      },
      template: {
        containers: [{
          name: 'main',
          env: [
            { name: 'EARWYRM_DATABASE_HOST', value: 'postgres.postgres.database.azure.com' },
            { name: 'EARWYRM_DATABASE_NAME', value: 'earwyrm' },
            { name: 'EARWYRM_DATABASE_USER', value: 'admin' },
            { name: 'ENTRA_EXPECTED_ISSUER', value: 'https://issuer.example.test' },
            { name: 'EARWYRM_DATABASE_PASSWORD', secretRef: 'postgres-password' },
            { name: 'EARWYRM_DATA_DIR', value: '/mnt/earwyrm' },
            { name: 'UNRELATED_SETTING', value: 'do-not-copy' },
          ],
          volumeMounts: [{ volumeName: 'media', mountPath: '/mnt/earwyrm' }],
        }],
        volumes: [{
          name: 'media', storageName: 'earwyrmfiles', storageType: 'AzureFile',
          mountOptions: 'uid=10001,gid=10001,dir_mode=0700,file_mode=0600,nobrl',
        }],
      },
    },
  };
  const state = {
    jobs: [] as { id: string; name: string; tags: Record<string, string> }[],
    path: '', body: {} as Record<string, unknown>, mode: 0,
    build: 'Succeeded', provisioning: 'Succeeded', execution: 'Succeeded',
    delete_fails: false, create_fails: false, start_fails: false, pagination: null as string | null,
  };
  const calls: string[][] = [], order: string[] = [];
  vi.mocked(deployment_target).mockResolvedValue([subscription, group, target]);
  vi.mocked(verify_private_network).mockImplementation(async () => { order.push('network'); });
  vi.mocked(run).mockImplementation(async action => { order.push(action); });
  const azure: Azure = async (target_subscription, ...args) => {
    expect(target_subscription).toBe(subscription);
    calls.push(args);
    const command = args.slice(0, args.findIndex(argument => argument.startsWith('--'))).join(' ');
    if (command === 'acr show') return { id: `${group_id}/providers/Microsoft.ContainerRegistry/registries/registry`, loginServer: 'registry.azurecr.io' };
    if (command === 'acr build') { order.push('build'); return { status: state.build }; }
    if (command === 'acr repository show') return `sha256:${'a'.repeat(64)}`;
    if (command === 'postgres flexible-server list') return [{
      id: `${group_id}/providers/Microsoft.DBforPostgreSQL/flexibleServers/postgres`, name: 'postgres',
      fullyQualifiedDomainName: 'postgres.postgres.database.azure.com', tags: { 'azd-env-name': 'test' },
    }];
    if (command !== 'rest') throw new Error(`Unexpected mocked operation ${command}`);
    const method = args[2], path = new URL(args[args.indexOf('--url') + 1]).pathname;
    if (method === 'get' && path === app_id) return app;
    if (method === 'get' && path.endsWith('/jobs')) return { value: state.jobs, nextLink: state.pagination };
    if (method === 'put') {
      order.push('create');
      state.path = args[args.indexOf('--body') + 1].slice(1);
      state.mode = (await stat(state.path)).mode & 0o777;
      state.body = JSON.parse(await readFile(state.path, 'utf8')) as Record<string, unknown>;
      if (state.create_fails) throw new DeploymentGateError('Creation failed');
      state.jobs = [{ id: path, name: path.split('/').at(-1)!, tags: { 'earwyrm-operation': 'initialize-database' } }];
      return null;
    }
    if (method === 'get' && path.endsWith('/executions')) return {
      value: [{ properties: { status: state.execution } }],
    };
    if (method === 'get') return { properties: { provisioningState: state.provisioning } };
    if (method === 'post' && path.endsWith('/start')) {
      order.push('start');
      if (state.start_fails) throw new DeploymentGateError('Start failed');
      return null;
    }
    if (method === 'delete') {
      order.push('delete');
      if (state.delete_fails) throw new DeploymentGateError('Cleanup denied');
      state.jobs = [];
      return null;
    }
    throw new Error(`Unexpected mocked REST operation ${method}`);
  };
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  return { environ, azure, state, calls, order, app, identity, log, sleep: vi.fn(async () => {}) };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

describe('private database bootstrap without Azure access', () => {
  it('builds in the existing registry, runs one private initializer and cleans up without resuming the app', async () => {
    const test = fixture();
    await initialize_deployment(test);
    expect(test.order).toEqual(['network', 'quiesce', 'build', 'create', 'verify', 'start', 'delete']);
    expect(test.state.body).toMatchObject({
      identity: { type: 'UserAssigned', userAssignedIdentities: { [test.identity]: {} } },
      properties: {
        environmentId: test.app.properties.environmentId,
        configuration: {
          triggerType: 'Manual', replicaRetryLimit: 0,
          manualTriggerConfig: { parallelism: 1, replicaCompletionCount: 1 },
          secrets: test.app.properties.configuration.secrets,
        },
        template: {
          containers: [{
            command: ['node'], args: ['apps/api/dist/bootstrap_database.js', 'initialize-fresh'],
            image: `registry.azurecr.io/earwyrm/database-bootstrap@sha256:${'a'.repeat(64)}`,
            env: expect.arrayContaining([
              { name: 'EARWYRM_DATABASE_PASSWORD', secretRef: 'postgres-password' },
              { name: 'EARWYRM_DATA_DIR', value: '/mnt/earwyrm' },
              { name: 'ENTRA_EXPECTED_ISSUER', value: 'https://issuer.example.test' },
              { name: 'EARWYRM_BOOTSTRAP_OWNER_ISSUER', value: 'https://issuer.example.test' },
              { name: 'EARWYRM_BOOTSTRAP_OWNER_SUBJECT', value: 'verified-subject' },
              { name: 'EARWYRM_DATA_RESET_APPROVED', value: 'true' },
            ]),
            volumeMounts: test.app.properties.template.containers[0].volumeMounts,
          }],
          volumes: test.app.properties.template.volumes,
        },
      },
    });
    expect(test.state.mode).toBe(0o600);
    expect(JSON.stringify(test.state.body)).not.toContain('do-not-copy');
    expect(JSON.stringify(test.log.mock.calls)).not.toContain('do-not-copy');
    expect(JSON.stringify(test.log.mock.calls)).not.toContain('verified-subject');
    expect(test.calls.some(args => args.includes('list-secrets') || args.includes('secret') || args.includes('firewall-rule'))).toBe(false);
    await expect(access(test.state.path)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(JSON.stringify(test.log.mock.calls)).toContain('PostgreSQL initialized and validated');
  });

  it.each(['EARWYRM_DATABASE_INITIALIZATION_APPROVED', 'EARWYRM_DATA_RESET_APPROVED'])(
    'rejects missing %s before invoking Azure', async setting => {
      const test = fixture();
      delete test.environ[setting];
      await expect(initialize_deployment(test)).rejects.toThrow('initialization and application data reset approvals');
      expect(deployment_target).not.toHaveBeenCalled();
      expect(test.calls).toEqual([]);
    });

  it('requires an exact owner identity before making Azure calls', async () => {
    const test = fixture();
    delete test.environ.EARWYRM_BOOTSTRAP_OWNER_SUBJECT;
    await expect(initialize_deployment(test)).rejects.toThrow('EARWYRM_BOOTSTRAP_OWNER_SUBJECT');
    expect(deployment_target).not.toHaveBeenCalled();
    expect(test.calls).toEqual([]);
    test.environ.EARWYRM_BOOTSTRAP_OWNER_SUBJECT = 'verified-subject';
    test.environ.EARWYRM_BOOTSTRAP_OWNER_ISSUER = 'https://other.example.test';
    await expect(initialize_deployment(test)).rejects.toThrow('issuer does not match');
    expect(test.order).not.toContain('network');
  });

  it('refuses an unprovisioned target without building or creating resources', async () => {
    const test = fixture();
    vi.mocked(deployment_target).mockResolvedValue(['subscription', 'rg-test', null]);
    await expect(initialize_deployment(test)).rejects.toThrow('Provision the web environment');
    expect(test.calls).toEqual([]);
  });

  it('blocks leftover initialization jobs and truncated inventories before stopping the app', async () => {
    const test = fixture();
    test.state.jobs = [{ id: 'existing', name: 'existing', tags: { 'earwyrm-operation': 'initialize-database' } }];
    await expect(initialize_deployment(test)).rejects.toThrow('previous initialization job');
    test.state.jobs = [];
    test.state.pagination = 'https://management.azure.com/another-page';
    await expect(initialize_deployment(test)).rejects.toThrow();
    expect(run).not.toHaveBeenCalled();
  });

  it.each(['secret', 'mount', 'database', 'identity', 'settings'])('rejects mismatched %s wiring before mutations', async defect => {
    const test = fixture();
    if (defect === 'secret') test.app.properties.configuration.secrets[0].keyVaultUrl = 'https://other.vault.azure.net/secrets/password';
    if (defect === 'mount') test.app.properties.template.containers[0].volumeMounts[0].mountPath = '/other';
    if (defect === 'database') test.app.properties.template.containers[0].env[0].value = 'other.postgres.database.azure.com';
    if (defect === 'identity') test.app.properties.configuration.registries[0].identity = '/other/identity';
    if (defect === 'settings') test.app.properties.template.containers[0].env.push({ name: 'EARWYRM_DATABASE_URL', value: 'do-not-log' });
    await expect(initialize_deployment(test)).rejects.toThrow();
    expect(run).not.toHaveBeenCalled();
    expect(test.calls.some(args => args.includes('build') || args[2] === 'put')).toBe(false);
  });

  it.each(['network', 'quiesce', 'verify'])('does not start an initializer when %s cannot be verified', async failure => {
    const test = fixture();
    if (failure === 'network') vi.mocked(verify_private_network).mockRejectedValue(new DeploymentGateError('Network failed'));
    else vi.mocked(run).mockImplementation(async action => {
      if (action === failure) throw new DeploymentGateError('Writer exclusion failed');
    });
    await expect(initialize_deployment(test)).rejects.toThrow();
    expect(test.order).not.toContain('start');
    if (failure === 'verify') {
      expect(test.order).toContain('delete');
      await expect(access(test.state.path)).rejects.toMatchObject({ code: 'ENOENT' });
    }
  });

  it.each(['create', 'provision', 'start', 'execution'])('cleans up after %s failure and never reports success', async failure => {
    const test = fixture();
    if (failure === 'create') test.state.create_fails = true;
    if (failure === 'provision') test.state.provisioning = 'Failed';
    if (failure === 'start') test.state.start_fails = true;
    if (failure === 'execution') test.state.execution = 'Failed';
    await expect(initialize_deployment(test)).rejects.toThrow();
    expect(test.order.at(-1)).toBe('delete');
    expect(test.state.jobs).toEqual([]);
    expect(JSON.stringify(test.log.mock.calls)).not.toContain('PostgreSQL initialized and validated');
    await expect(access(test.state.path)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('bounds execution polling and fails explicitly when cleanup cannot be verified', async () => {
    const test = fixture();
    test.state.execution = 'Running';
    let tick = 0;
    await expect(initialize_deployment({ ...test, now: () => tick++ * 600_001 })).rejects.toThrow('execution timed out');
    expect(test.order.at(-1)).toBe('delete');
    test.state.execution = 'Succeeded';
    test.state.delete_fails = true;
    await expect(initialize_deployment(test)).rejects.toThrow('Cleanup denied');
    expect(JSON.stringify(test.log.mock.calls)).toContain('cleanup could not be verified');
    expect(JSON.stringify(test.log.mock.calls)).not.toContain('PostgreSQL initialized and validated');
    await expect(access(test.state.path)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.each(['Failed', 'Running'])('does not create a job when the build result is %s', async status => {
    const test = fixture();
    test.state.build = status;
    await expect(initialize_deployment(test)).rejects.toThrow('image build failed');
    expect(test.order).toEqual(['network', 'quiesce', 'build']);
  });

  it('waits through asynchronous provisioning and initially absent execution results', async () => {
    const test = fixture();
    let provisions = 0, executions = 0;
    const azure: Azure = async (subscription, ...args) => {
      const response = await test.azure(subscription, ...args);
      if (args[0] === 'rest' && args[2] === 'get') {
        const path = new URL(args[args.indexOf('--url') + 1]).pathname;
        if (path.endsWith('/executions') && executions++ === 0) return { value: [] };
        if (/\/jobs\/[^/]+$/.test(path) && provisions++ === 0) return { properties: { provisioningState: 'InProgress' } };
      }
      return response;
    };
    await initialize_deployment({ ...test, azure });
    expect(test.sleep).toHaveBeenCalledTimes(2);
    expect(test.order).toEqual(['network', 'quiesce', 'build', 'create', 'verify', 'start', 'delete']);
  });

  it('uses the real CLI wrapper with no-wait output suppression reproduced by a fake az', async () => {
    const test = fixture();
    const directory = await mkdtemp(join(tmpdir(), 'earwyrm-acr-cli-'));
    try {
      await writeFile(join(directory, 'az'), `#!${process.execPath}
const args = process.argv.slice(2);
if (args[0] !== 'acr' || args[1] !== 'build') process.exit(99);
if (args.includes('--no-wait')) process.exit(0);
if (!args.includes('--no-logs') || args[args.indexOf('--timeout') + 1] !== '600') process.exit(98);
process.stderr.write('do-not-log-build-output');
process.stdout.write(JSON.stringify({ status: 'Succeeded' }));
`, { mode: 0o700 });
      vi.stubEnv('PATH', `${directory}${delimiter}${process.env.PATH ?? ''}`);
      const azure: Azure = async (subscription, ...args) => args[0] === 'acr' && args[1] === 'build'
        ? execute_azure(subscription, ...args) : test.azure(subscription, ...args);
      await initialize_deployment({ ...test, azure });
      expect(test.order).toContain('start');
      expect(JSON.stringify(test.log.mock.calls)).not.toContain('do-not-log-build-output');
      expect(JSON.stringify(test.log.mock.calls)).toContain('PostgreSQL initialized and validated');
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
