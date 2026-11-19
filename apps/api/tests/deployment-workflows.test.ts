import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflows = new URL('../../../.github/workflows/', import.meta.url);
const prepare = readFileSync(new URL('prepare-deployment.yml', workflows), 'utf8');

describe('deployment workflow privilege separation', () => {
  it('keeps installation and builds in an unprivileged job with no environment or inherited secrets', () => {
    expect(prepare).toContain('npm ci --no-audit --no-fund');
    expect(prepare).toContain('docker build --file Dockerfile.web');
    expect(prepare).not.toMatch(/id-token:\s*write|environment:|secrets:\s*inherit/);
    expect(prepare).toContain('actions/upload-artifact@v4');
    expect(prepare).not.toContain('overwrite: true');
  });

  it.each(['deploy-web.yml', 'bootstrap-web.yml'])('isolates and verifies the payload in %s', filename => {
    const workflow = readFileSync(new URL(filename, workflows), 'utf8');
    const [header, jobs] = workflow.split('\njobs:\n');
    expect(header).not.toContain('id-token: write');
    expect(jobs).toContain('uses: ./.github/workflows/prepare-deployment.yml');
    expect(jobs).not.toMatch(/secrets:\s*inherit/);
    const privileged_job = jobs.slice(jobs.indexOf('    needs: prepare'));
    expect(privileged_job).toContain('id-token: write');
    expect(privileged_job).toContain('environment: earwyrm-web');
    expect(privileged_job).not.toMatch(/\bnpm\b|\bnpx\b|\btsx\b|docker build|acr build|azd deploy/);
    expect(privileged_job).toContain('artifact-ids: ${{ needs.prepare.outputs.artifact_id }}');
    expect(privileged_job).toContain('EXPECTED_SHA256: ${{ needs.prepare.outputs.sha256 }}');
    const verification = privileged_job.match(/          set -euo pipefail\n          \[\[ "\$EXPECTED_SHA256"[\s\S]*?          tar -xf[^\n]+/)?.[0];
    if (!verification) throw new Error('Missing fail-closed payload verification');
    expect(privileged_job.indexOf(verification)).toBeLessThan(privileged_job.indexOf('uses: azure/login'));
    expect(verification.indexOf('sha256sum --check --strict')).toBeLessThan(verification.indexOf('tar -xf'));
    const directory = mkdtempSync(join(tmpdir(), 'earwyrm-artifact-'));
    try {
      mkdirSync(join(directory, 'payload'));
      writeFileSync(join(directory, 'tooling.js'), 'verified tooling');
      const archive = join(directory, 'payload/deployment.tar');
      expect(spawnSync('tar', ['-cf', archive, '-C', directory, 'tooling.js']).status).toBe(0);
      const digest = createHash('sha256').update(readFileSync(archive)).digest('hex');
      for (const expected of ['', 'not-a-digest', 'a'.repeat(64), digest]) {
        const result = spawnSync('bash', ['-c', verification], {
          cwd: directory,
          env: { ...process.env, EXPECTED_SHA256: expected },
          encoding: 'utf8',
        });
        expect(result.error).toBeUndefined();
        expect(result.status === 0).toBe(expected === digest);
        expect(existsSync(join(directory, '.deployment/tooling.js'))).toBe(expected === digest);
      }
      rmSync(join(directory, '.deployment'), { recursive: true });
      writeFileSync(archive, 'tampered artifact');
      const tampered = spawnSync('bash', ['-c', verification], {
        cwd: directory, env: { ...process.env, EXPECTED_SHA256: digest }, encoding: 'utf8',
      });
      expect(tampered.status).not.toBe(0);
      expect(existsSync(join(directory, '.deployment'))).toBe(false);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it('runs azd provision hooks using only prepared tooling', () => {
    const config = readFileSync(new URL('../../../azure.yaml', import.meta.url), 'utf8');
    expect(config).not.toContain('npm run');
    expect(config).toContain('node .deployment/tooling/deployment_gate.js verify');
  });
});
