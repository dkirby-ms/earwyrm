import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { Decimal } from 'decimal.js';
import { AzureSpeech } from './speech.js';
import { REPOSITORY_ROOT, cost_for, load_evidence, load_inputs, render_brief, save_json, type RenderOutput } from './render.js';

/** Renders offline unless paid mode, evidence and a finite positive budget are explicitly selected. */
export async function main(arguments_: string[] = process.argv.slice(2)): Promise<number> {
  const { values } = parseArgs({
    args: arguments_,
    options: {
      'instrumental-only': { type: 'boolean', default: false },
      azure: { type: 'boolean', default: false },
      output: { type: 'string', default: join(REPOSITORY_ROOT, 'renders') },
      evidence: { type: 'string' },
      'max-cost-usd': { type: 'string' },
    },
  });
  if (values.azure === values['instrumental-only']) {
    throw new Error('Select exactly one of --instrumental-only or --azure');
  }
  const inputs = load_inputs();
  let evidence = null;
  let provider = null;
  if (values.azure) {
    if (!values.evidence || !values['max-cost-usd']) throw new Error('--azure requires --evidence and --max-cost-usd');
    evidence = load_evidence(values.evidence);
    if (evidence.region !== process.env.SPEECH_REGION) throw new Error('Evidence region must match SPEECH_REGION');
    const budget = new Decimal(values['max-cost-usd']);
    const estimate = inputs.reduce((sum, [, text]) => sum.add(cost_for(text, evidence!)), new Decimal(0));
    if (!budget.isFinite() || budget.lte(0) || estimate.gt(budget)) {
      throw new Error('Estimated requests exceed the finite positive --max-cost-usd budget');
    }
    provider = new AzureSpeech();
  } else if (values.evidence !== undefined || values['max-cost-usd'] !== undefined) {
    throw new Error('Azure evidence/budget options require --azure');
  }
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const output = values.output;
  const run = join(output, `${timestamp}-${randomUUID().slice(0, 8)}`);
  mkdirSync(output, { recursive: true });
  mkdirSync(run);
  console.error(`INFO: Rendering into ${run}`);
  const rows: RenderOutput[] = [];
  for (const [index, [brief, text]] of inputs.entries()) {
    rows.push(...await render_brief(join(run, brief.brief_id), brief, text, index, provider, evidence, {
      history_dir: join(output, '.melody-history'),
    }));
  }
  const status = rows.some((row) => row.status === 'Fail') ? 'Fail' : 'Pending';
  save_json(join(run, 'summary.json'), {
    status, mode: values.azure ? 'azure' : 'instrumental-only', outputs: rows,
  });
  console.error(`INFO: ${rows.length} outputs written; proof status ${status} (listening and rights not auto-approved)`);
  return status === 'Fail' ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => { process.exitCode = code; }).catch(() => {
    console.error('ERROR: Render failed; inspect local configuration and retained attempt evidence. Submitted usage may remain unknown.');
    process.exitCode = 2;
  });
}
