import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import express, { type ErrorRequestHandler, type Express } from 'express';
import { z } from 'zod';
import { trace, SpanKind } from '@opentelemetry/api';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ServiceContracts } from './contracts.js';
import { LyricRequest } from './lyrics.js';
import { CompositionRequest } from './melody.js';

/** A scaffold role deliberately does not assert generation or durable cloud integration. */
export type ServiceRole = 'web' | 'lyric' | 'melody';

/** Creates real MCP negotiation while refusing generation in the production foundation. */
export function create_mcp(role: 'lyric' | 'melody'): McpServer {
  const server = new McpServer({ name: `Earwyrm ${role} foundation`, version: '0.1.0' });
  if (role === 'lyric') {
    server.registerTool('write_lyrics', {
      inputSchema: { request: LyricRequest },
      description: 'Not integrated in this foundation; use the local writer separately.',
    }, () => {
      console.error('ERROR: lyric_service_not_integrated');
      return { isError: true, content: [{ type: 'text', text: 'lyric_service_not_integrated: generation is disabled in this scaffold' }] };
    });
  } else {
    server.registerTool('compose_arrangement', {
      inputSchema: { request: CompositionRequest },
      description: 'Not integrated: no durable cloud artifacts or queue submission yet.',
    }, () => {
      console.error('ERROR: melody_service_not_integrated');
      return { isError: true, content: [{ type: 'text', text: 'melody_service_not_integrated: no render job was queued' }] };
    });
  }
  return server;
}

/** Stateless JSON Streamable HTTP with Host and Origin validation against one configured hostname. */
export function create_mcp_http_app(
  factory: () => McpServer | Promise<McpServer>,
  options: { allowed_host?: string } = {},
): Express {
  const allowed_host = options.allowed_host ?? '127.0.0.1';
  const app = createMcpExpressApp({ host: allowed_host, allowedHosts: [allowed_host] });
  app.disable('x-powered-by');
  app.use('/mcp', (request, response, next) => {
    const origin = request.get('origin');
    if (origin) {
      let permitted = false;
      try {
        const url = new URL(origin);
        permitted = url.hostname === allowed_host &&
          (url.protocol === 'https:' || url.protocol === 'http:') &&
          !url.username && !url.password && url.origin === origin;
      } catch (error) {
        if (!(error instanceof TypeError)) throw error;
      }
      if (!permitted) {
        response.status(403).json({ detail: 'Invalid MCP origin' });
        return;
      }
    }
    next();
  });
  app.all('/mcp', async (request, response) => {
    const server = await factory();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    response.once('close', () => {
      server.close().catch(() => console.error('ERROR: MCP transport cleanup failed'));
    });
    await server.connect(transport);
    await transport.handleRequest(request, response, request.body);
  });
  const errors: ErrorRequestHandler = (_error: unknown, _request, response, next) => {
    console.error('ERROR: MCP request failed');
    if (response.headersSent) {
      next(_error);
      return;
    }
    response.status(500).json({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'MCP request failed' } });
  };
  app.use(errors);
  return app;
}

/** Local tools bind to loopback; stdio writes only protocol data to stdout. */
export async function serve_mcp(
  factory: () => McpServer | Promise<McpServer>,
  options: { transport?: string; port?: number } = {},
): Promise<void> {
  const transport = options.transport ?? 'stdio';
  if (transport === 'stdio') {
    await (await factory()).connect(new StdioServerTransport());
    return;
  }
  if (transport !== 'streamable-http') throw new Error('Unsupported MCP transport');
  const port = options.port ?? 8001;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('--port must be between 1 and 65535');
  await new Promise<void>((resolve, reject) => {
    const listener = create_mcp_http_app(factory).listen(port, '127.0.0.1', () => {
      console.error(`INFO: MCP listening on 127.0.0.1:${port}/mcp`);
      resolve();
    });
    listener.once('error', reject);
  });
}

/** Process health and schemas are available; job submission explicitly remains unintegrated. */
export function create_app(role: ServiceRole, options: { allowed_host?: string } = {}): Express {
  const app = express();
  app.disable('x-powered-by');
  app.get('/healthz', (_request, response) => {
    response.json({ status: 'scaffold', service: role, generation_available: false });
  });
  app.get('/contracts', (_request, response) => {
    trace.getTracer('earwyrm-platform').startActiveSpan('GET /contracts', { kind: SpanKind.SERVER }, (span) => {
      try { response.json(z.toJSONSchema(ServiceContracts)); } finally { span.end(); }
    });
  });
  app.post('/jobs', (_request, response) => {
    console.error('ERROR: workflow_not_integrated');
    response.status(501).json({ detail: 'workflow_not_integrated: no render job was queued' });
  });
  if (role !== 'web') app.use(create_mcp_http_app(() => create_mcp(role), options));
  return app;
}

/** The render worker exits without consuming or acknowledging any queue message. */
export async function main(arguments_: string[] = process.argv.slice(2)): Promise<number> {
  const { values } = parseArgs({ args: arguments_, options: {
    role: { type: 'string', default: process.env.SERVICE_ROLE ?? 'web' },
    host: { type: 'string', default: process.env.HOST ?? '127.0.0.1' },
    port: { type: 'string', default: process.env.PORT ?? '8080' },
  } });
  const role = z.enum(['web', 'lyric', 'melody', 'render']).parse(values.role);
  const port = z.coerce.number().int().min(1).max(65535).parse(values.port);
  if (role === 'render') {
    console.error('ERROR: render_worker_not_integrated: no message was consumed or acknowledged');
    return 2;
  }
  await new Promise<void>((resolve, reject) => {
    const listener = create_app(role, { allowed_host: process.env.PLATFORM_ALLOWED_HOST ?? values.host })
      .listen(port, values.host, () => {
        console.error(`INFO: Earwyrm ${role} scaffold listening`);
        resolve();
      });
    listener.once('error', reject);
  });
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => { process.exitCode = code; }).catch(() => {
    console.error('ERROR: invalid_platform_configuration');
    process.exitCode = 2;
  });
}
