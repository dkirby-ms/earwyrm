import { createHash, randomUUID } from 'node:crypto';
import { basename, dirname, join, resolve } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Decimal } from 'decimal.js';
import { z } from 'zod';
import {
  SAMPLE_RATE, ScoreDuration, compose, jingle_duration, mix, musical_form, musical_plan, normalize, vocode, write_midi, write_wav,
  type Note,
} from './dsp.js';
import { MelodyService } from './melody_service.js';
import { render_backing } from './backing.js';
import { select_screened, screen } from './similarity.js';
import { VOICE, align, hook_word_index, place_spoken, type SpeechProvider } from './speech.js';
import { AdvertiserBrief } from './lyrics.js';
import type { CompositionRequest } from './melody.js';
import { REPOSITORY_ROOT } from './paths.js';

export { REPOSITORY_ROOT };
export const FIXTURES = join(REPOSITORY_ROOT, 'docs', 'audio-poc');
const TERMS = 'https://www.microsoft.com/licensing/terms/productoffering/MicrosoftAzure/MCA';
const DISCLOSURE = 'https://learn.microsoft.com/azure/ai-services/speech-service/faq-tts';
const Evidence = z.object({
  tier: z.literal('S0'),
  region: z.string().trim().min(1),
  resource_reference: z.string().trim().min(1),
  rate_source: z.string().trim().min(1),
  rate_checked_on: z.iso.date(),
  usd_per_million_characters: z.union([z.string(), z.number()]),
  commercial_use_basis: z.string().trim().min(1).nullable().optional(),
}).passthrough();
/** Non-secret resource, rate and rights evidence; the rate is normalized to a decimal string. */
export type SpeechEvidence = z.infer<typeof Evidence> & {
  usd_per_million_characters: string;
};

/** Writes strict JSON, refusing NaN and Infinity instead of silently turning them into null. */
export function save_json(path: string, value: unknown): void {
  const json = JSON.stringify(value, (_key, item: unknown) => {
    if (typeof item === 'number' && !Number.isFinite(item)) throw new Error('Non-finite JSON measurement');
    return item;
  }, 2);
  if (json === undefined) throw new Error('JSON evidence must contain a value');
  writeFileSync(path, `${json}\n`, 'utf8');
}

/** Loads generation fixtures only, never the evaluator's expected answers. */
export function load_inputs(): Array<[AdvertiserBrief, string]> {
  const briefs = z.array(AdvertiserBrief).length(3).parse(
    JSON.parse(readFileSync(join(FIXTURES, 'advertiser-briefs.json'), 'utf8')) as unknown);
  const scripts = z.record(z.string(), z.string().min(1).max(400).regex(/^[\x00-\x7f]+$/))
    .parse(JSON.parse(readFileSync(join(FIXTURES, 'generation-scripts.json'), 'utf8')) as unknown);
  const ids = briefs.map((brief) => brief.brief_id);
  if (new Set(ids).size !== 3 || Object.keys(scripts).length !== 3 ||
    Object.keys(scripts).some((id) => !ids.includes(id))) {
    throw new Error('Brief and script IDs must match uniquely');
  }
  return briefs.map((brief) => {
    const text = scripts[brief.brief_id];
    if (!text || !text.includes(brief.name)) throw new Error("Script must include its brief's brand");
    return [brief, text];
  });
}

/** Reads positive dated S0 pricing evidence; no free-tier price or commercial approval is inferred. */
export function load_evidence(path: string): SpeechEvidence {
  const evidence = Evidence.parse(JSON.parse(readFileSync(path, 'utf8')) as unknown);
  if (evidence.rate_checked_on > new Date().toISOString().slice(0, 10)) {
    throw new Error('Rate evidence cannot be dated in the future');
  }
  const rate = new Decimal(evidence.usd_per_million_characters);
  if (!rate.isFinite() || rate.lte(0)) throw new Error('Supply a finite positive USD rate per million characters');
  return { ...evidence, usd_per_million_characters: rate.toString() };
}

/** Estimates plain-ASCII character usage without a free-tier assumption. */
export function cost_for(text: string, evidence: Pick<SpeechEvidence, 'usd_per_million_characters'>): Decimal {
  return new Decimal(text.length).mul(evidence.usd_per_million_characters).div(1_000_000);
}

/** Numeric proof gates do not establish listening quality, rights or broadcast approval. */
export function gate(duration: number, elapsed: number, cost: number | null, expected_duration = 30): 'Pass' | 'Pending' | 'Fail' {
  if (!ScoreDuration.safeParse(expected_duration).success || !(duration >= expected_duration - 0.5 && duration <= expected_duration) || !Number.isFinite(elapsed) || elapsed < 0 || elapsed >= 300 ||
    (cost !== null && (!Number.isFinite(cost) || cost < 0 || cost >= 0.5))) return 'Fail';
  return cost === null ? 'Pending' : 'Pass';
}

/** Retains source provenance and unresolved rights evidence for every audible component. */
export function component_ledger(evidence: SpeechEvidence | null, soundfont: string | null = null): Array<Record<string, unknown>> {
  const components: Array<Record<string, unknown>> = [
    { component: 'melody_and_chords', origin: 'Seeded TypeScript phrase composition in apps/api/src/dsp.ts',
      evidence: 'composition.json, score.json and score.mid', commercial_use_basis: null, status: 'Pending' },
    { component: 'instruments_and_carrier',
      origin: soundfont ? `FluidSynth backing with ${soundfont}; oscillator vocal carrier when used` : 'Harmonic oscillators, synthesized kick and seeded noise in apps/api/src/dsp.ts',
      evidence: 'composition.json and score.mid', commercial_use_basis: null, status: 'Pending' },
    { component: 'script', origin: 'Repository-authored synthetic brief script',
      evidence: 'brief.json and script.txt', commercial_use_basis: null, status: 'Pending' },
  ];
  if (evidence) {
    components.push({ component: 'stock_synthetic_voice', origin: `Azure Speech ${VOICE}, S0, ${evidence.region}`,
      evidence: [TERMS, DISCLOSURE, evidence.resource_reference], commercial_use_basis: null, status: 'Pending' });
    for (const component of components) {
      component.commercial_use_basis = evidence.commercial_use_basis ?? null;
      component.status = evidence.commercial_use_basis ? 'Recorded basis; human review required' : 'Pending';
    }
  }
  return components;
}

/** Completed output evidence; provider failures never return a completed manifest. */
export interface RenderOutput extends Record<string, unknown> {
  output_id: string;
  brief_id: string;
  variant: string;
  file: string;
  sha256: string;
  duration_seconds: number;
  render_seconds: number;
  status: string;
  numeric_gates: string;
  azure_usage: {
    attempt_id: string | null;
    submitted_characters: number;
    request_cost_usd: string;
    allocated_cost_usd: string;
    [key: string]: unknown;
  };
}

/** Persists one fresh brief render, preserving submitted attempts even when synthesis fails. */
export async function render_brief(
  directory: string, brief: AdvertiserBrief, text: string, _index: number,
  provider: SpeechProvider | null, evidence: SpeechEvidence | null,
  options: { composition_seed?: CompositionRequest['seed']; history_dir?: string | null; database_url?: string | null } = {},
): Promise<RenderOutput[]> {
  const started = performance.now();
  mkdirSync(directory);
  const attempt_id = randomUUID();
  save_json(join(directory, 'brief.json'), brief);
  writeFileSync(join(directory, 'script.txt'), `${text}\n`, 'utf8');
  const archive = options.history_dir
    ? new MelodyService(resolve(options.history_dir), { database_url: options.database_url ?? undefined }) : null;
  const minimum_duration = 10 + (text.match(/[A-Za-z]+/g)?.length ?? 0) * 0.25;
  const candidate = (seed: NonNullable<CompositionRequest['seed']>): [{ notes: Note[]; duration_seconds: number }, Record<string, number[]>] => {
    const duration_seconds = jingle_duration(seed, minimum_duration), notes = compose(seed, duration_seconds);
    return [{ notes, duration_seconds }, { lead: notes.filter((note) => note.instrument === 'lead').map((note) => note.pitch) }];
  };
  const [seed, selected, melodies] = select_screened(candidate, {
    seed: options.composition_seed ?? null,
    history: archive ? await archive.history_snapshot() : undefined,
  });
  let { notes, duration_seconds } = selected;
  let form = musical_form(duration_seconds);
  let { audio: bed, ...instrumentation } = await render_backing(notes, seed, duration_seconds);
  let outputs: Record<string, Float64Array> = { instrumental: normalize(bed) };
  let attempt: Record<string, unknown> | null = null;
  let alignment: unknown[] = [];
  let request_cost: Decimal | null = null;
  if (provider) {
    if (!evidence) throw new Error('Azure rendering requires usage-rate evidence');
    request_cost = cost_for(text, evidence);
    attempt = {
      attempt_id, status: 'submitted', submitted_at: new Date().toISOString(),
      provider: 'Azure Speech', voice: VOICE, submitted_characters: text.length, unit: 'character',
      calculated_request_cost_usd: null, cost_status: 'Unknown until request completes', evidence,
    };
    save_json(join(directory, 'attempt.json'), attempt);
    const utterance = await provider.synthesize(text).catch((error: unknown) => {
      attempt!.status = 'failed_or_unknown';
      save_json(join(directory, 'attempt.json'), attempt);
      throw error;
    });
    Object.assign(attempt, {
      status: 'synthesis_completed', result_id: utterance.result_id,
      calculated_request_cost_usd: request_cost.toString(),
      cost_status: 'Calculated estimate; reconcile with Azure billing',
    });
    save_json(join(directory, 'attempt.json'), attempt);
    const fitted_duration = jingle_duration(seed, Math.max(minimum_duration,
      utterance.audio.length / SAMPLE_RATE + 2, hook_word_index(utterance, text) * 0.25 + 10.75));
    if (fitted_duration !== duration_seconds) {
      duration_seconds = fitted_duration;
      form = musical_form(duration_seconds);
      notes = compose(seed, duration_seconds);
      melodies.lead = notes.filter(note => note.instrument === 'lead').map(note => note.pitch);
      ({ audio: bed, ...instrumentation } = await render_backing(notes, seed, duration_seconds));
    }
    const [modulator, carrier, melody, map] = align(utterance, text, musical_plan(seed).root, { melody_seed: seed, form });
    notes.push(...melody);
    melodies.vocal = melody.map((note) => note.pitch);
    alignment = map;
    outputs = { vocoded: mix(bed, vocode(modulator, carrier)), spoken: mix(bed, place_spoken(utterance, duration_seconds)) };
    write_wav(join(directory, 'source-speech.wav'), utterance.audio);
    write_wav(join(directory, 'aligned-speech.wav'), modulator);
  }
  const report = archive ? await archive.record_local_output(attempt_id, melodies) : screen(melodies);
  save_json(join(directory, 'composition.json'), {
    seed, generator_version: 'earwyrm-phrase-v2', form, similarity: report, instrumentation,
    timing_granularity: provider ? 'word' : null,
  });
  save_json(join(directory, 'score.json'), notes);
  write_midi(join(directory, 'score.mid'), notes, duration_seconds, instrumentation.palette);
  save_json(join(directory, 'alignment.json'), alignment);
  const rows: RenderOutput[] = [];
  for (const [variant, audio] of Object.entries(outputs)) {
    const path = join(directory, `${variant}.wav`);
    write_wav(path, audio);
    let peak = 0;
    let square = 0;
    for (const sample of audio) {
      peak = Math.max(peak, Math.abs(sample));
      square += sample * sample;
    }
    rows.push({
      output_id: `${basename(dirname(directory))}-${brief.brief_id}-${variant}`,
      brief_id: brief.brief_id, variant, file: basename(path),
      sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
      duration_seconds: audio.length / SAMPLE_RATE,
      peak_dbfs: 20 * Math.log10(peak), rms_dbfs: 20 * Math.log10(Math.sqrt(square / audio.length)),
      azure_usage: {
        attempt_id: attempt ? attempt_id : null, submitted_characters: attempt ? text.length : 0,
        allocation_fraction: attempt ? '0.5' : null,
        allocated_characters: attempt ? new Decimal(text.length).div(2).toString() : '0',
        request_cost_usd: request_cost?.toString() ?? '0',
        allocated_cost_usd: request_cost?.div(2).toString() ?? '0',
        basis: attempt ? 'One shared request, 50/50 pair allocation' : 'No Azure request; instrumental-only',
        rate_evidence: evidence, billing_reconciled: false,
      },
      components: component_ledger(evidence, instrumentation.soundfont), composition_seed: seed, melody_similarity: report,
      ai_generated: true,
      disclosure: 'Code-generated music and, in live mode, a stock synthetic Azure voice; review demo, not broadcast master.',
      evaluation: { brand_transcription: null, cta_transcription: null, self_rating: null,
        status: 'Pending', type: 'unblinded self-evaluation' },
      status: 'Pending', render_seconds: 0, numeric_gates: 'Pending',
    });
  }
  const elapsed = (performance.now() - started) / 1000;
  for (const row of rows) {
    row.render_seconds = elapsed;
    row.render_time_basis = 'Shared brief render, including synthesis and both mixes';
    row.numeric_gates = gate(row.duration_seconds, elapsed, request_cost?.toNumber() ?? 0, duration_seconds);
    if (row.numeric_gates === 'Fail') row.status = 'Fail';
  }
  save_json(join(directory, 'manifest.json'), {
    schema_version: 1, attempt_id, outputs: rows, fixed_gateway_hosting_cost_usd: '0',
    fixed_cost_basis: 'Local run; no gateway or hosting provisioned',
    excluded_costs: ['Local electricity/hardware', 'Developer and human-review time'],
    loudness: 'Peak-only demo normalization, not LUFS or broadcast compliance',
  });
  return rows;
}
