import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import request from 'supertest';
import { z } from 'zod';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  BlobArtifact, JobRecord, QualityCheck, QualityReport, RenderManifest, RenderMessage, ServiceContracts,
} from '../src/contracts.js';
import { create_app, main as platform_main } from '../src/platform_service.js';
import { create_server as melody_server } from '../src/melody_mcp.js';
import { create_server as lyric_server } from '../src/lyric_mcp.js';
import { cost_for, gate, load_inputs, render_brief } from '../src/render.js';
import { main as render_main } from '../src/cli.js';
import type { LyricBackend } from '../src/lyric_cloud.js';
import { SAMPLE_RATE, tone } from '../src/dsp.js';

const temporary: string[] = [];
function directory(): string {
  const path = mkdtempSync(join(tmpdir(), 'earwyrm-ts-'));
  temporary.push(path);
  return path;
}
afterEach(() => {
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true });
});
const identity = () => ({ job_id: randomUUID(), version_id: randomUUID(), version_number: 1, brief_id: 'brief-001' });
const now = '2026-11-13T23:00:00Z';
const pending = (unit: string) => ({ unit, status: 'pending', evidence: 'not measured' });
const quality = () => ({
  identity: identity(),
  duration: { measured: 30, minimum: 29.5, maximum: 30, unit: 's', status: 'pass', evidence: 'measured' },
  loudness: pending('LUFS'), intelligibility: pending('1'), similarity: pending('1'),
  status: 'pending', checked_at: now,
});
const composition = () => ({
  logical_job_id: 'mcp-test-v1', product_path: 'vocoded',
  lyrics: 'One bright song for your shop every day',
  lines: [{
    text: 'One bright song for your shop every day',
    syllables: ['One', 'bright', 'song', 'for', 'your', 'shop', 'ev', 'ery', 'day'],
    start_seconds: 3, end_seconds: 7,
  }],
});

async function connected(server: McpServer): Promise<Client> {
  const client = new Client({ name: 'earwyrm-regression', version: '1' });
  const [client_transport, server_transport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(server_transport), client.connect(client_transport)]);
  return client;
}

describe('platform contracts', () => {
  it.each([
    'https://store/audio/a.wav?sig=secret', 'http://store/audio/a.wav',
    'https://user:password@store/audio/a.wav', 'https://store/audio/a.wav#fragment',
  ])('rejects insecure or bearer artifact %s', (uri) => {
    expect(BlobArtifact.safeParse({ uri, media_type: 'audio/wav', sha256: 'a'.repeat(64) }).success).toBe(false);
  });
  it.each([{ measured: null }, { measured: 31 }, { minimum: 32 }, { maximum: Infinity }])(
    'rejects quality claims that contradict evidence %j', (changes) => {
      expect(QualityCheck.safeParse({
        measured: 30, minimum: 29.5, maximum: 30, unit: 's', status: 'pass', evidence: 'measurement', ...changes,
      }).success).toBe(false);
    });
  it('keeps missing quality pending and binds manifest versions', () => {
    const report = quality();
    expect(QualityReport.parse(report).status).toBe('pending');
    expect(QualityReport.safeParse({ ...report, status: 'pass' }).success).toBe(false);
    expect(RenderManifest.safeParse({
      identity: identity(), product_path: 'vocoded',
      audio: { uri: 'https://store/audio.wav', media_type: 'audio/wav', sha256: 'a'.repeat(64) },
      created_at: now, components: [{ component: 'instruments', origin: 'original synthesis', evidence: 'score' }],
      tool_versions: { renderer: '1' }, speech_resource_id: '/subscriptions/test/speech', speech_result_id: 'result',
      quality: report,
    }).success).toBe(false);
  });
  it.each([
    { status: 'awaiting_approval' }, { status: 'failed' }, { attempt: 3 },
    { updated_at: '2026-11-12T23:00:00Z' },
  ])('rejects inconsistent durable job states %j', (changes) => {
    expect(JobRecord.safeParse({
      identity: identity(), status: 'queued', attempt: 1, created_at: now, updated_at: now, ...changes,
    }).success).toBe(false);
  });
  it('rejects all-zero trace IDs and exports real schemas', () => {
    expect(RenderMessage.safeParse({
      identity: identity(), composition: { uri: 'https://store/score.mid', media_type: 'audio/midi', sha256: 'b'.repeat(64) },
      product_path: 'spoken', traceparent: `00-${'0'.repeat(32)}-${'1'.repeat(16)}-01`,
    }).success).toBe(false);
    const schema = z.toJSONSchema(ServiceContracts);
    expect(schema.properties).toHaveProperty('lyric_request');
    expect(schema.properties).toHaveProperty('composition_request');
  });
});

describe('real MCP and scaffold surfaces', () => {
  it('publishes health and schemas without claiming generation or queue readiness', async () => {
    const app = create_app('web');
    expect((await request(app).get('/healthz')).body).toEqual({
      status: 'scaffold', service: 'web', generation_available: false,
    });
    expect((await request(app).get('/contracts')).body.properties).toHaveProperty('job');
    expect((await request(app).post('/jobs')).status).toBe(501);
    expect(await platform_main(['--role', 'render'])).toBe(2);
  });
  it('negotiates Streamable HTTP and rejects hostile Host and Origin headers', async () => {
    const app = create_app('melody', { allowed_host: '127.0.0.1' });
    const listener = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => listener.once('listening', resolve));
    const address = listener.address();
    if (!address || typeof address === 'string') throw new Error('Missing loopback listener');
    const client = new Client({ name: 'http-regression', version: '1' });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/mcp`)));
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toContain('compose_arrangement');
      expect((await client.callTool({ name: 'compose_arrangement', arguments: { request: composition() } })).isError).toBe(true);
      expect((await request(app).post('/mcp').set('Host', 'hostile.example').send({})).status).toBe(403);
      expect((await request(app).post('/mcp').set('Origin', 'https://hostile.example').send({})).status).toBe(403);
    } finally {
      await client.close();
      await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
    }
  });
  it.each([[null, 30], ['9223372036854775807', 30], [42, 16]] as const)('commits and recovers exact seed %s and %s-second resources through MCP', async (seed, duration_seconds) => {
    const client = await connected(await melody_server(directory()));
    const input = { ...composition(), duration_seconds, ...(seed === null ? {} : { seed }) };
    try {
      const tools = await client.listTools();
      const tool = tools.tools.find((item) => item.name === 'compose_arrangement');
      expect(tool?.inputSchema.properties).toHaveProperty('request');
      expect(tool?.outputSchema).toBeDefined();
      const first = await client.callTool({ name: 'compose_arrangement', arguments: { request: input } });
      expect(first.isError).not.toBe(true);
      expect(first.structuredContent).toHaveProperty('duration_seconds', duration_seconds);
      if (seed !== null) expect(first.structuredContent).toHaveProperty('seed', seed);
      const output = z.object({
        status: z.literal('queued'), job_id: z.uuid(), queue_owner: z.literal('melody-arrangement'),
        syllable_timing: z.array(z.unknown()).length(9),
        midi: z.object({ uri: z.string() }), backing_tracks: z.array(z.object({ uri: z.string() })).min(1),
      }).parse(first.structuredContent);
      const retry = await client.callTool({ name: 'compose_arrangement', arguments: { request: input } });
      expect(retry.structuredContent).toEqual(first.structuredContent);
      const recovered = await client.callTool({ name: 'get_render_job', arguments: { job_id: output.job_id } });
      expect(recovered.structuredContent).toEqual(first.structuredContent);
      for (const [uri, signature] of [[output.midi.uri, 'MThd'], [output.backing_tracks[0].uri, 'RIFF']]) {
        const resource = await client.readResource({ uri });
        const content = z.object({ blob: z.string() }).parse(resource.contents[0]);
        const bytes = Buffer.from(content.blob, 'base64');
        expect(bytes.subarray(0, 4).toString()).toBe(signature);
        if (signature === 'RIFF') expect(bytes.readUInt32LE(40)).toBe(duration_seconds * SAMPLE_RATE * 2);
      }
      const invalid = composition();
      invalid.lines[0].end_seconds = 3.125;
      expect((await client.callTool({ name: 'compose_arrangement', arguments: { request: invalid } })).isError).toBe(true);
    } finally { await client.close(); }
  });
  it('serves typed lyric results through the actual protocol', async () => {
    const cta = 'Call Bright Bike to plan your next ride';
    const hook = 'Bright Bike will help you ride each day';
    const backend: LyricBackend = {
      preflight: async () => ({ english: true, artist_imitation: false, risky_claims: false }),
      generate: async () => JSON.stringify({
        hook, lyrics: `${hook}\n${cta}`, syllables_per_line: [8, 8], rhyme_scheme: '--', brand_count: 2, cta,
      }),
      assess: async () => ({ english: true, grounded: true, risky_claims: false }),
      screen: async () => ({ moderation_passed: true, protected_material_detected: false }),
    };
    const client = await connected(lyric_server({ backend }));
    try {
      const result = await client.callTool({ name: 'write_lyrics', arguments: { request: {
        brief: { brief_id: 'brief-001', name: 'Bright Bike', offer: 'Bike tune ups', location: 'Lakeview',
          contact_details: { email: 'shop@example.com', phone: 'Call the shop' }, tone: 'Friendly',
          approved_claims: ['Bike tune ups are available'] }, product_path: 'spoken', cta,
      } } });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({ status: 'accepted', attempts: 1, broadcast_approval_required: true });
    } finally { await client.close(); }
  });
  it('negotiates the executable melody stdio entry point without stdout contamination', async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ['--import', 'tsx', 'src/melody_mcp.ts', '--data-dir', directory()],
      stderr: 'pipe',
    });
    const client = new Client({ name: 'stdio-regression', version: '1' });
    try {
      await client.connect(transport);
      expect((await client.listTools()).tools.map((tool) => tool.name)).toContain('get_render_job');
    } finally { await client.close(); }
  });
});

describe('offline rendering and paid-call preflight', () => {
  it('runs the executable offline CLI across every fixture with persistent history', async () => {
    const output = directory();
    const result = await promisify(execFile)(process.execPath, [
      '--import', 'tsx', 'src/cli.ts', '--instrumental-only', '--output', output,
    ], { timeout: 45_000 });
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('3 outputs written');
    const runs = readdirSync(output).filter((name) => !name.startsWith('.'));
    expect(runs).toHaveLength(1);
    const summary = JSON.parse(readFileSync(join(output, runs[0], 'summary.json'), 'utf8'));
    expect(summary).toMatchObject({ status: 'Pending', mode: 'instrumental-only' });
    expect(summary.outputs).toHaveLength(3);
    for (const [brief] of load_inputs()) {
      const duration = summary.outputs.find((row: { brief_id: string }) => row.brief_id === brief.brief_id).duration_seconds;
      expect(duration).toBeGreaterThanOrEqual(14); expect(duration).toBeLessThanOrEqual(20);
      expect(readFileSync(join(output, runs[0], brief.brief_id, 'instrumental.wav')).length)
        .toBe(44 + duration * 24_000 * 2);
      expect(readFileSync(join(output, runs[0], brief.brief_id, 'score.mid')).readUInt16BE(8)).toBe(0);
    }
  });
  it.each([
    [30, 299.99, 0.49, 'Pass'], [29.49, 1, 0, 'Fail'], [30, 300, 0, 'Fail'],
    [30, 1, 0.5, 'Fail'], [30, 1, null, 'Pending'], [30, NaN, 0, 'Fail'],
  ] as const)('uses exact duration, elapsed and full-request cost gates', (duration, elapsed, cost, status) => {
    expect(gate(duration, elapsed, cost)).toBe(status);
  });
  it('exports complete finite PCM/MIDI and pending provenance without provider calls', async () => {
    const [brief, text] = load_inputs()[0];
    const output = join(directory(), brief.brief_id);
    const rows = await render_brief(output, brief, text, 0, null, null);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ variant: 'instrumental', status: 'Pending', numeric_gates: 'Pass' });
    expect(rows[0].duration_seconds).toBeGreaterThanOrEqual(14); expect(rows[0].duration_seconds).toBeLessThanOrEqual(20);
    const wav = readFileSync(join(output, 'instrumental.wav'));
    expect(wav.subarray(0, 4).toString()).toBe('RIFF');
    expect(wav.readUInt32LE(24)).toBe(24_000);
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt16LE(34)).toBe(16);
    expect(wav.length).toBe(44 + rows[0].duration_seconds * 24_000 * 2);
    let peak = 0;
    for (let index = 44; index < wav.length; index += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(index)));
    expect(peak).toBeGreaterThan(20_000);
    expect(peak).toBeLessThan(32_767);
    expect(readFileSync(join(output, 'score.mid')).subarray(0, 4).toString()).toBe('MThd');
    expect(JSON.parse(readFileSync(join(output, 'manifest.json'), 'utf8')).outputs[0].evaluation.status).toBe('Pending');
    expect(cost_for('four', { usd_per_million_characters: '15' }).toString()).toBe('0.00006');
  });
  it('extends the full form for longer natural speech and retains complete paid-pair evidence', async () => {
    const [brief, text] = load_inputs()[0], tokens = [...text.matchAll(/[A-Za-z]+/g)];
    const output = join(directory(), brief.brief_id);
    const rows = await render_brief(output, brief, text, 0, {
      synthesize: async () => ({
        audio: tone(60, 21).map(value => value * 0.2), result_id: 'TEST-ONLY-NOT-AZURE',
        words: tokens.map((token, i) => ({ text: token[0], text_offset: token.index, offset: i * 0.25, duration: 0.24 })),
      }),
    }, {
      tier: 'S0', region: 'test', resource_reference: 'test-only', rate_source: 'test-only',
      rate_checked_on: '2026-11-17', usd_per_million_characters: '15',
    }, { composition_seed: 42 });
    expect(rows.map(row => row.duration_seconds)).toEqual([24, 24]);
    expect(rows.every(row => row.numeric_gates === 'Pass' && row.azure_usage.submitted_characters === text.length)).toBe(true);
    const map = JSON.parse(readFileSync(join(output, 'alignment.json'), 'utf8'));
    expect(map.map((row: { word: string }) => row.word)).toEqual(tokens.map(token => token[0]));
    expect(JSON.parse(readFileSync(join(output, 'composition.json'), 'utf8')).form.duration_seconds).toBe(24);
    expect(gate(24, 1, 0, 24)).toBe('Pass');
    expect(gate(23, 1, 0, 24)).toBe('Fail');
    expect(QualityReport.parse({ ...quality(), duration: { measured: 24, minimum: 12, maximum: 30, unit: 's', status: 'pass', evidence: 'measured phrase-led output' } }).status).toBe('pending');
  });
  it('rejects missing paid consent before creating an output directory', async () => {
    const output = directory();
    await expect(render_main(['--azure', '--output', output])).rejects.toThrow('--evidence');
    expect(readdirSync(output)).toEqual([]);
    await expect(render_main(['--instrumental-only', '--max-cost-usd', '1', '--output', output]))
      .rejects.toThrow('require --azure');
  });
});
