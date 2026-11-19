import { describe, expect, it, vi } from 'vitest';
import { publish_deployment_image } from '../../../scripts/publish_deployment_image.js';

const environ = { GITHUB_RUN_ID: '12345', GITHUB_RUN_ATTEMPT: '2' };

describe('publishing a prepared image without executing dependency or build scripts', () => {
  it('only loads, tags, authenticates and pushes the image, then returns an immutable registry digest', async () => {
    const execute = vi.fn(async () => {});
    const azure = vi.fn(async () => `sha256:${'a'.repeat(64)}`);
    const image = await publish_deployment_image('subscription', 'registry.azurecr.io', { environ, execute, azure });
    expect(execute.mock.calls).toEqual([
      ['docker', ['load', '--input', '.deployment/web-image.tar']],
      ['docker', ['tag', 'earwyrm-web:build', 'registry.azurecr.io/earwyrm/web:12345-2']],
      ['az', ['acr', 'login', '--subscription', 'subscription', '--name', 'registry']],
      ['docker', ['push', 'registry.azurecr.io/earwyrm/web:12345-2']],
    ]);
    expect(azure).toHaveBeenCalledWith('subscription', 'acr', 'repository', 'show',
      '--name', 'registry', '--image', 'earwyrm/web:12345-2', '--query', 'digest');
    expect(image).toBe(`registry.azurecr.io/earwyrm/web@sha256:${'a'.repeat(64)}`);
  });

  it.each([0, 1, 2, 3])('stops publishing when command %s fails', async failure => {
    let command = 0;
    const execute = vi.fn(async () => {
      if (command++ === failure) throw new Error('Publishing failed');
    });
    const azure = vi.fn();
    await expect(publish_deployment_image('subscription', 'registry.azurecr.io', { environ, execute, azure }))
      .rejects.toThrow('Publishing failed');
    expect(execute).toHaveBeenCalledTimes(failure + 1);
    expect(azure).not.toHaveBeenCalled();
  });

  it.each([
    ['other.example.test', environ],
    ['registry.azurecr.io', { ...environ, GITHUB_RUN_ID: '../other' }],
    ['registry.azurecr.io', { ...environ, GITHUB_RUN_ATTEMPT: '' }],
  ])('rejects invalid registry or run identity before publishing', async (registry, settings) => {
    const execute = vi.fn();
    await expect(publish_deployment_image('subscription', registry, { environ: settings, execute })).rejects.toThrow();
    expect(execute).not.toHaveBeenCalled();
  });

  it('refuses to deploy a tag or malformed digest returned by the registry', async () => {
    await expect(publish_deployment_image('subscription', 'registry.azurecr.io', {
      environ, execute: async () => {}, azure: async () => 'latest',
    })).rejects.toThrow();
  });
});
