import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import {
  azure, deployment_error_detail, deployment_target, DeploymentGateError,
  required_setting, run, verify_private_network, type Azure,
} from './deployment_gate.js';

const API_VERSION = '2025-07-01';
const OPERATION = 'initialize-database';
const Resource = z.object({
  id: z.string().min(1), name: z.string().min(1),
  tags: z.record(z.string(), z.string()).default({}),
});
const EnvironmentVariable = z.object({
  name: z.string(), value: z.string().optional(), secretRef: z.string().optional(),
});
const App = Resource.extend({
  location: z.string().min(1),
  identity: z.object({ userAssignedIdentities: z.record(z.string(), z.unknown()) }),
  properties: z.object({
    environmentId: z.string().min(1),
    configuration: z.object({
      registries: z.array(z.object({ server: z.string().regex(/^[a-z0-9]+\.azurecr\.io$/), identity: z.string().min(1) })).length(1),
      secrets: z.array(z.object({
        name: z.string(), keyVaultUrl: z.string().optional(), identity: z.string().optional(),
        value: z.never().optional(),
      })),
    }),
    template: z.object({
      containers: z.array(z.object({
        name: z.literal('main'), env: z.array(EnvironmentVariable),
        volumeMounts: z.array(z.object({ volumeName: z.string(), mountPath: z.string(), subPath: z.never().optional() })),
      })).length(1),
      volumes: z.array(z.object({
        name: z.string(), storageName: z.string().min(1), storageType: z.literal('AzureFile'),
        mountOptions: z.string().min(1),
      })).length(1),
    }),
  }),
});
const JobList = z.object({ nextLink: z.null().optional(), value: z.array(Resource) });

/** Initializes only an empty store via a private, single-execution job; never resumes the web app. */
export async function initialize_deployment(options: {
  environ?: Readonly<Record<string, string | undefined>>;
  azure?: Azure;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<unknown>;
} = {}): Promise<void> {
  const environ = options.environ ?? process.env, call = options.azure ?? azure;
  if (environ.EARWYRM_DATABASE_INITIALIZATION_APPROVED !== 'true' || environ.EARWYRM_EMPTY_STORE_CONFIRMED !== 'true') {
    throw new DeploymentGateError('Explicit database initialization approval and empty-store confirmation are required');
  }
  const [subscription, group, target] = await deployment_target(environ, call);
  if (!target) throw new DeploymentGateError('Provision the web environment before initializing PostgreSQL');
  const group_id = `/subscriptions/${subscription}/resourceGroups/${group}`;
  const rest = (method: string, id: string, ...args: string[]) => call(subscription,
    'rest', '--method', method, '--url', `https://management.azure.com${id}?api-version=${API_VERSION}`, ...args);
  const list_jobs = async () => JobList.parse(await rest('get', `${group_id}/providers/Microsoft.App/jobs`)).value;
  if ((await list_jobs()).some(job => job.tags['earwyrm-operation'] === OPERATION)) {
    throw new DeploymentGateError('A previous initialization job remains; an owner must inspect its execution and remove it before retrying');
  }
  const app = App.parse(await rest('get', target.id));
  if (app.id.toLowerCase() !== target.id.toLowerCase()) throw new DeploymentGateError('Container app details do not match the bootstrap target');
  const registry = app.properties.configuration.registries[0];
  const identity = registry.identity;
  const identity_name = identity.split('/').at(-1);
  if (!identity_name || identity.toLowerCase() !== `${group_id}/providers/Microsoft.ManagedIdentity/userAssignedIdentities/${identity_name}`.toLowerCase() ||
    !Object.keys(app.identity.userAssignedIdentities).some(id => id.toLowerCase() === identity.toLowerCase())) {
    throw new DeploymentGateError('Initialization requires the app registry identity in the selected resource group');
  }
  const container = app.properties.template.containers[0];
  const setting = (name: string) => {
    const matches = container.env.filter(value => value.name === name);
    if (matches.length !== 1) throw new DeploymentGateError(`App initialization setting is absent or ambiguous: ${name}`);
    return matches[0];
  };
  const fields = ['EARWYRM_DATABASE_HOST', 'EARWYRM_DATABASE_NAME', 'EARWYRM_DATABASE_USER', 'EARWYRM_DATA_DIR'];
  const env = fields.map(name => {
    const field = setting(name);
    if (!field.value?.trim() || field.secretRef !== undefined) throw new DeploymentGateError(`Invalid app initialization setting: ${name}`);
    return { name, value: field.value };
  });
  if (container.env.some(value => value.name === 'EARWYRM_DATABASE_URL') ||
    setting('EARWYRM_DATA_DIR').value !== '/mnt/earwyrm' ||
    setting('EARWYRM_DATABASE_NAME').value !== 'earwyrm' ||
    setting('EARWYRM_DATABASE_USER').value !== required_setting(environ, 'AZURE_POSTGRESQL_ADMIN_LOGIN')) {
    throw new DeploymentGateError('App database settings do not match the provisioned bootstrap configuration');
  }
  const password = setting('EARWYRM_DATABASE_PASSWORD');
  const secret = app.properties.configuration.secrets.filter(value => value.name === password.secretRef);
  const expected_secret = `https://${required_setting(environ, 'AZURE_KEY_VAULT_NAME')}.vault.azure.net/secrets/${required_setting(environ, 'AZURE_POSTGRESQL_PASSWORD_SECRET_NAME')}`;
  if (password.value !== undefined || secret.length !== 1 || secret[0].keyVaultUrl?.toLowerCase() !== expected_secret.toLowerCase() ||
    secret[0].identity?.toLowerCase() !== identity.toLowerCase()) {
    throw new DeploymentGateError('Initialization requires the app versionless Key Vault password reference and registry identity');
  }
  const volume = app.properties.template.volumes[0];
  if (container.volumeMounts.length !== 1 || container.volumeMounts[0].volumeName !== volume.name ||
    container.volumeMounts[0].mountPath !== '/mnt/earwyrm') {
    throw new DeploymentGateError('Initialization requires the existing app media share mount');
  }
  const registry_name = registry.server.split('.')[0];
  const registry_details = z.object({ id: z.string(), loginServer: z.string() })
    .parse(await call(subscription, 'acr', 'show', '--name', registry_name));
  if (registry_details.id.toLowerCase() !== `${group_id}/providers/Microsoft.ContainerRegistry/registries/${registry_name}`.toLowerCase() ||
    registry_details.loginServer !== registry.server) {
    throw new DeploymentGateError('Registry does not match the selected bootstrap resource group');
  }
  const servers = z.array(Resource.extend({ fullyQualifiedDomainName: z.string() }))
    .parse(await call(subscription, 'postgres', 'flexible-server', 'list', '--resource-group', group));
  if (!servers.some(server => server.tags['azd-env-name'] === environ.AZURE_ENV_NAME &&
    server.id.toLowerCase() === `${group_id}/providers/Microsoft.DBforPostgreSQL/flexibleServers/${server.name}`.toLowerCase() &&
    server.fullyQualifiedDomainName === setting('EARWYRM_DATABASE_HOST').value)) {
    throw new DeploymentGateError('App database hostname does not match the isolated PostgreSQL server');
  }
  await verify_private_network(subscription, group, target, environ, call);
  await run('quiesce', { ...options, environ, azure: call });
  const now = options.now ?? Date.now;
  const wait = async (label: string, timeout: number, check: () => Promise<boolean>) => {
    const deadline = now() + timeout;
    while (!await check()) {
      if (now() >= deadline) throw new DeploymentGateError(`${label} timed out; app remains stopped`);
      await (options.sleep ?? sleep)(5000);
    }
  };
  const suffix = randomUUID();
  const image_tag = `earwyrm/database-bootstrap:${suffix}`;
  console.error('INFO: Building the selected checkout for private database initialization');
  const build = z.object({ status: z.enum(['Queued', 'Started', 'Running', 'Succeeded', 'Failed', 'Canceled', 'Error', 'Timeout']) }).parse(await call(subscription,
    'acr', 'build', '--registry', registry_name, '--image', image_tag, '--file', 'Dockerfile.web',
    '--no-logs', '--timeout', '600', '.'));
  if (build.status !== 'Succeeded') throw new DeploymentGateError('Initialization image build failed or did not finish; raw build output withheld');
  const digest = z.string().regex(/^sha256:[0-9a-f]{64}$/).parse(await call(subscription,
    'acr', 'repository', 'show', '--name', registry_name, '--image', image_tag, '--query', 'digest'));
  const job_name = `db-init-${suffix.slice(0, 8)}`;
  const job_id = `${group_id}/providers/Microsoft.App/jobs/${job_name}`;
  const body = {
    location: app.location,
    tags: { 'azd-env-name': environ.AZURE_ENV_NAME, 'earwyrm-operation': OPERATION },
    identity: { type: 'UserAssigned', userAssignedIdentities: { [identity]: {} } },
    properties: {
      environmentId: app.properties.environmentId,
      workloadProfileName: 'Consumption',
      configuration: {
        triggerType: 'Manual', replicaTimeout: 300, replicaRetryLimit: 0,
        manualTriggerConfig: { parallelism: 1, replicaCompletionCount: 1 },
        registries: [registry],
        secrets: [{ name: secret[0].name, keyVaultUrl: expected_secret, identity }],
      },
      template: {
        containers: [{
          name: 'main', image: `${registry.server}/earwyrm/database-bootstrap@${digest}`,
          command: ['node'], args: ['apps/api/dist/bootstrap_database.js', 'initialize-fresh'],
          env: [...env, { name: 'EARWYRM_DATABASE_PASSWORD', secretRef: password.secretRef }],
          resources: { cpu: 0.5, memory: '1Gi' }, volumeMounts: container.volumeMounts,
        }],
        volumes: [volume],
      },
    },
  };
  const directory = await mkdtemp(join(tmpdir(), 'earwyrm-database-job-'));
  let creation_attempted = false;
  console.error(`INFO: Temporary database initialization job: ${job_name}`);
  try {
    const path = join(directory, 'job.json');
    await writeFile(path, JSON.stringify(body), { mode: 0o600, flag: 'wx' });
    creation_attempted = true;
    await rest('put', job_id, '--body', `@${path}`);
    await wait('Initialization job provisioning', 300_000, async () => {
      const state = z.object({ properties: z.object({ provisioningState: z.enum(['InProgress', 'Succeeded', 'Failed', 'Canceled', 'Deleting']) }) })
        .parse(await rest('get', job_id)).properties.provisioningState;
      if (['Failed', 'Canceled', 'Deleting'].includes(state)) throw new DeploymentGateError('Initialization job provisioning failed');
      return state === 'Succeeded';
    });
    await run('verify', { ...options, environ, azure: call });
    await rest('post', `${job_id}/start`);
    await wait('Database initialization execution', 600_000, async () => {
      const executions = z.object({
        nextLink: z.null().optional(),
        value: z.array(z.object({ properties: z.object({
          status: z.enum(['Running', 'Processing', 'Stopped', 'Degraded', 'Failed', 'Unknown', 'Succeeded']),
        }) })).max(1),
      }).parse(await rest('get', `${job_id}/executions`)).value;
      const status = executions[0]?.properties.status;
      if (status && !['Running', 'Processing', 'Succeeded'].includes(status)) {
        throw new DeploymentGateError('Database initialization execution failed; inspect restricted job logs; do not retry against a populated store');
      }
      return status === 'Succeeded';
    });
  } catch (error) {
    console.error(`ERROR: Private database initialization failed: ${deployment_error_detail(error)}`);
    throw error;
  } finally {
    try {
      if (creation_attempted) {
        try { await rest('delete', job_id); }
        catch (error) { if (!(error instanceof DeploymentGateError) || error.azureCode !== 'ResourceNotFound') throw error; }
        await wait('Initialization job cleanup', 180_000, async () => !(await list_jobs()).some(job => job.id.toLowerCase() === job_id.toLowerCase()));
      }
    } catch (error) {
      console.error('ERROR: Temporary initialization job cleanup could not be verified; app remains stopped; an owner must inspect the named job before retrying');
      throw error;
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
  console.error('INFO: PostgreSQL initialized and validated; temporary job removed; app remains stopped. Review a new deployment preview before deploying.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  initialize_deployment().catch((error: unknown) => {
    console.error(`ERROR: Database bootstrap failed: ${deployment_error_detail(error)}`);
    process.exitCode = 1;
  });
}
