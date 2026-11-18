import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { LyricRequest, LyricResult } from './lyrics.js';
import { LyricWriter } from './lyric_service.js';
import { AzureLyricBackend, CloudFailure, Preflight, Screening, azure_backend, type LyricBackend } from './lyric_cloud.js';
import { serve_mcp } from './platform_service.js';
import { JingleDiscussion, JingleSuggestion, type JingleAdvisor } from './jingle_chat.js';
import { IMITATION } from './lyric_service.js';

/** Exposes the independent writer; missing provider configuration returns an explicit unavailable result. */
export function create_server(options: { backend?: LyricBackend; advisor?: JingleAdvisor } = {}): McpServer {
  const server = new McpServer({ name: 'Earwyrm Lyric and Hook Writer', version: '0.1.0' }, {
    instructions: 'Only status=accepted passes technical gates; human_review_required must not proceed automatically. All output requires producer and advertiser approval before broadcast. The tool owns at most three lyric retries; never add a retry loop.',
  });
  server.registerTool('suggest_jingle', {
    description: 'Discuss and refine an original creative direction. Makes paid model and safety calls, not lyrics or audio. Explicit user consent is required.',
    inputSchema: JingleDiscussion,
    outputSchema: JingleSuggestion,
  }, async input => {
    try {
      const backend = options.backend ?? azure_backend();
      const advisor = options.advisor ?? (backend instanceof AzureLyricBackend ? backend : null);
      if (!advisor) throw new CloudFailure('chat_advisor_unavailable');
      const context = input.messages.map(message => message.content).join('\n');
      if (IMITATION.test(context)) throw new CloudFailure('artist_imitation');
      const preflight = Preflight.parse(await backend.preflight(input.request, context));
      if (!preflight.english || preflight.artist_imitation) throw new CloudFailure('unsupported_creative_request');
      const result = JingleSuggestion.parse(await advisor.suggest(input));
      const screening = Screening.parse(await backend.screen(`${result.reply}\n${result.creative_direction}`));
      if (!screening.moderation_passed || screening.protected_material_detected) throw new CloudFailure('suggestion_screening_rejected');
      return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
    } catch (error) {
      if (!(error instanceof CloudFailure)) throw error;
      console.error('ERROR: Jingle discussion unavailable or rejected');
      return { isError: true, content: [{ type: 'text', text: error.code }] };
    }
  });
  server.registerTool('write_lyrics', {
    description: 'Write original English hook and lyrics with verified metadata and mandatory safety gates. Uses paid Foundry and Content Safety when configured.',
    inputSchema: { request: LyricRequest },
    outputSchema: LyricResult,
  }, async ({ request }) => {
    let result: LyricResult;
    if (options.backend) {
      result = await new LyricWriter(options.backend).write(request);
    } else {
      try {
        const backend = azure_backend();
        result = await new LyricWriter(backend).write(request);
      } catch (error) {
        if (!(error instanceof CloudFailure)) throw error;
        console.error('ERROR: Lyric cloud configuration unavailable');
        result = LyricResult.parse({ status: 'unavailable', attempts: 0, reasons: [error.code] });
      }
    }
    return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({ options: {
    transport: { type: 'string', default: 'stdio' },
    port: { type: 'string', default: '8002' },
  } });
  serve_mcp(() => create_server(), {
    transport: values.transport, port: z.coerce.number().int().min(1).max(65535).parse(values.port),
  }).catch(() => {
    console.error('ERROR: Lyric MCP failed; inspect local configuration');
    process.exitCode = 2;
  });
}
