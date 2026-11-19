import { createHash } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { create_server as lyric_server } from './lyric_mcp.js';
import { create_server as melody_server } from './melody_mcp.js';
import { CompositionResult, type Artifact } from './melody_service.js';
import { LyricResult, type LyricRequest } from './lyrics.js';
import { JingleSuggestion, type JingleAdvisor, type JingleDiscussion } from './jingle_chat.js';
import type { LyricBackend } from './lyric_cloud.js';
import type { CompositionRequest } from './melody.js';
import { RenderDuration, type Note } from './dsp.js';

/** Content-free tool/transport failure safe to expose through the authorized API. */
export class JingleToolError extends Error {}
/** Exact digest-checked artifacts; callers must retain owner and lyric checks before loading. */
export interface CommittedComposition {
  result: CompositionResult;
  backing: Buffer;
  midi: Buffer;
  score: Note[];
}
const Score = z.array(z.strictObject({
  start: z.number().finite().nonnegative(), duration: z.number().finite().positive(),
  pitch: z.number().int().min(0).max(127),
  instrument: z.enum(['pad', 'bass', 'lead', 'vocal', 'kick', 'hat', 'snare']),
  gain: z.number().min(0).max(1),
})).min(1).max(10000);

async function connected<T>(factory: () => McpServer | Promise<McpServer>, operation: (client: Client) => Promise<T>): Promise<T> {
  const server = await factory();
  const client = new Client({ name: 'earwyrm-jingle-chat', version: '1.0' });
  const [local, remote] = InMemoryTransport.createLinkedPair();
  try {
    await Promise.all([server.connect(remote), client.connect(local)]);
    return await operation(client);
  } finally {
    await Promise.all([client.close(), server.close()]);
  }
}

async function call<T>(client: Client, name: string, args: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> {
  // The bounded writer can make eleven posts with separate 30s credential and HTTP waits.
  const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 15 * 60 * 1000 });
  if (result.isError) throw new JingleToolError(`${name} could not complete; no successful result was accepted`);
  const parsed = schema.safeParse(result.structuredContent);
  if (!parsed.success) throw new JingleToolError(`${name} returned an invalid result`);
  return parsed.data;
}

async function resource(client: Client, job_id: string, name: string, artifact: Artifact): Promise<Buffer> {
  if (artifact.uri !== `earwyrm://jobs/${job_id}/${name}`) throw new JingleToolError('Composition resource identity is invalid');
  const result = await client.readResource({ uri: artifact.uri });
  const parsed = z.array(z.object({ uri: z.literal(artifact.uri), blob: z.string().max(8000000) })).length(1).safeParse(result.contents);
  if (!parsed.success) throw new JingleToolError('Composition resource is invalid');
  const bytes = Buffer.from(parsed.data[0].blob, 'base64');
  if (createHash('sha256').update(bytes).digest('hex') !== artifact.sha256) throw new JingleToolError('Composition resource integrity check failed');
  return bytes;
}

/** Real MCP protocol calls over in-process transports, without exposing public endpoints or credentials. */
export class JingleTools {
  constructor(
    private readonly directory: string,
    private readonly options: { backend?: LyricBackend; advisor?: JingleAdvisor; database_url?: string } = {},
  ) {}

  /** Paid, screened creative advice; never invokes another tool automatically. */
  async discuss(input: JingleDiscussion): Promise<JingleSuggestion> {
    return connected(() => lyric_server(this.options), client => call(client, 'suggest_jingle', input, JingleSuggestion));
  }

  /** The writer owns bounded retries and returns held outcomes without promoting them. */
  async write(request: LyricRequest): Promise<LyricResult> {
    return connected(() => lyric_server(this.options), client => call(client, 'write_lyrics', { request }, LyricResult));
  }

  /** Submit once by logical identity; identical retries recover the same committed arrangement. */
  async compose(request: CompositionRequest): Promise<CompositionResult> {
    return connected(() => melody_server(this.directory, this.options),
      client => call(client, 'compose_arrangement', { request }, CompositionResult));
  }

  /** Recover an exact job through MCP; authorization remains the caller's responsibility. */
  async get(job_id: string): Promise<CompositionResult> {
    return connected(() => melody_server(this.directory, this.options),
      client => call(client, 'get_render_job', { job_id }, CompositionResult));
  }

  /** Read only fixed composition resources and independently verify every digest before use. */
  async artifacts(result: CompositionResult): Promise<CommittedComposition> {
    RenderDuration.parse(result.duration_seconds);
    return connected(() => melody_server(this.directory, this.options), async client => {
      const load = (name: string) => {
        const artifact = result.artifacts[name];
        if (!artifact) throw new JingleToolError('Composition resource is missing');
        return resource(client, result.job_id, name, artifact);
      };
      const [backing, midi, score_bytes] = await Promise.all([load('backing.wav'), load('score.mid'), load('score.json')]);
      let raw: unknown;
      try { raw = JSON.parse(score_bytes.toString('utf8')); }
      catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        throw new JingleToolError('Composition score is invalid');
      }
      const score = Score.parse(raw);
      if (score.some(note => note.start + note.duration > result.duration_seconds + 1e-9)) throw new JingleToolError('Composition score exceeds its duration');
      return { result, backing, midi, score };
    });
  }
}
