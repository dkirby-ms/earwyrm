import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { join } from 'node:path';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { CompositionRequest } from './melody.js';
import {
  ARTIFACT_TYPES, CompositionResult, CompositionUnavailable, JobConflict, JobNotFound, MelodyService,
} from './melody_service.js';
import { database_url_from_environment, validate_postgres_store } from './persistence.js';
import { SimilarityError } from './similarity.js';
import { serve_mcp } from './platform_service.js';
import { REPOSITORY_ROOT } from './paths.js';

/** Durable local composition tools own queue submission and expose digest-checked binary artifacts. */
export async function create_server(
  data_dir: string,
  options: { database_url?: string } = {},
): Promise<McpServer> {
  if (options.database_url) await validate_postgres_store(options.database_url);
  const service = new MelodyService(data_dir, options);
  const server = new McpServer({ name: 'Earwyrm Melody and Arrangement', version: '0.1.0' }, {
    instructions: 'Compose a 30-second retro-synth arrangement. This service owns render-job submission: use its returned job_id, never enqueue a second copy. Screening is limited, not legal clearance.',
  });
  server.registerTool('compose_arrangement', {
    description: 'Validate syllable windows, screen melodies, return artifacts and queue one job. Reuse logical_job_id only for an identical retry. Never calls Speech.',
    inputSchema: { request: CompositionRequest }, outputSchema: CompositionResult,
  }, async ({ request }) => {
    try {
      const result = await service.submit(request);
      return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
    } catch (error) {
      console.error('ERROR: Composition request failed');
      const message = error instanceof JobConflict || error instanceof SimilarityError || error instanceof CompositionUnavailable
        ? error.message : 'Composition storage is unavailable';
      return { isError: true, content: [{ type: 'text', text: message }] };
    }
  });
  server.registerTool('get_render_job', {
    description: 'Recover the exact committed arrangement after a lost response.',
    inputSchema: { job_id: z.uuid() }, outputSchema: CompositionResult,
  }, async ({ job_id }) => {
    try {
      const result = await service.get_job(job_id);
      return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
    } catch (error) {
      console.error('ERROR: Composition recovery failed');
      return { isError: true, content: [{ type: 'text', text: error instanceof JobNotFound
        ? error.message : 'Composition storage is unavailable' }] };
    }
  });
  for (const [name, media_type] of Object.entries(ARTIFACT_TYPES)) {
    server.registerResource(`composition_${name}`,
      new ResourceTemplate(`earwyrm://jobs/{job_id}/${name}`, { list: undefined }),
      { mimeType: media_type }, async (uri, variables) => {
        const job_id = z.uuid().parse(variables.job_id);
        try {
          const bytes = await service.read_artifact(job_id, name);
          return { contents: [{ uri: uri.href, mimeType: media_type, blob: bytes.toString('base64') }] };
        } catch (error) {
          console.error('ERROR: Composition artifact unavailable');
          if (error instanceof JobNotFound || error instanceof CompositionUnavailable) throw error;
          throw new Error('Composition storage is unavailable');
        }
      });
  }
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({ options: {
    'data-dir': { type: 'string', default: join(REPOSITORY_ROOT, '.earwyrm-data/melody') },
    transport: { type: 'string', default: 'stdio' },
    port: { type: 'string', default: '8001' },
  } });
  const database_url = database_url_from_environment(process.env) ?? undefined;
  serve_mcp(() => create_server(values['data-dir'], { database_url }), {
    transport: values.transport, port: z.coerce.number().int().min(1).max(65535).parse(values.port),
  }).catch(() => {
    console.error('ERROR: Melody service failed; inspect local storage configuration');
    process.exitCode = 2;
  });
}
