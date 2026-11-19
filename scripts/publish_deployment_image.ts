import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { azure, deployment_error_detail, DeploymentGateError, required_setting, type Azure } from './deployment_gate.js';

const execute_file = promisify(execFile);

/** Publishes a verified workflow image without building or running it; discards raw command output. */
export async function publish_deployment_image(subscription: string, registry: string, options: {
  environ?: Readonly<Record<string, string | undefined>>;
  azure?: Azure;
  execute?: (command: string, arguments_: string[]) => Promise<void>;
} = {}): Promise<string> {
  if (!/^[a-z0-9]+\.azurecr\.io$/.test(registry)) throw new DeploymentGateError('Invalid deployment registry hostname');
  const environ = options.environ ?? process.env;
  const run_id = required_setting(environ, 'GITHUB_RUN_ID');
  const attempt = required_setting(environ, 'GITHUB_RUN_ATTEMPT');
  if (!/^[0-9]+$/.test(run_id) || !/^[0-9]+$/.test(attempt)) throw new DeploymentGateError('Invalid workflow run identity');
  const image = `earwyrm/web:${run_id}-${attempt}`;
  const execute = options.execute ?? (async (command, arguments_) => {
    try { await execute_file(command, arguments_, { timeout: 600_000, maxBuffer: 8 * 1024 * 1024 }); }
    catch { throw new DeploymentGateError(`Image publishing failed: ${command} ${arguments_[0]}; raw command output withheld`); }
  });
  await execute('docker', ['load', '--input', '.deployment/web-image.tar']);
  await execute('docker', ['tag', 'earwyrm-web:build', `${registry}/${image}`]);
  await execute('az', ['acr', 'login', '--subscription', subscription, '--name', registry.split('.')[0]]);
  await execute('docker', ['push', `${registry}/${image}`]);
  const digest = z.string().regex(/^sha256:[0-9a-f]{64}$/).parse(await (options.azure ?? azure)(subscription,
    'acr', 'repository', 'show', '--name', registry.split('.')[0], '--image', image, '--query', 'digest'));
  return `${registry}/earwyrm/web@${digest}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  publish_deployment_image(required_setting(process.env, 'AZURE_SUBSCRIPTION_ID'), process.argv[2] ?? '')
    .then(image => console.log(image))
    .catch((error: unknown) => {
      console.error(`ERROR: Image publishing failed: ${deployment_error_detail(error)}`);
      process.exitCode = 1;
    });
}
