import Fastify from 'fastify';
import cors from '@fastify/cors';
import type { GraphStore } from '@sniffo/storage';
import { registerGraphRoutes } from './routes/graph.js';
import { registerSearchRoutes } from './routes/search.js';
import { registerNodeRoutes } from './routes/node.js';
import { registerStatusRoutes } from './routes/status.js';
import { registerRefreshRoutes } from './routes/refresh.js';
import { registerChildrenRoutes } from './routes/children.js';
import { registerBlastRadiusRoutes } from './routes/blast-radius.js';
import { registerCyclesRoutes } from './routes/cycles.js';
import { registerWorkspaceRoutes } from './routes/workspaces.js';
import { registerViewsRoutes } from './routes/views.js';
import { registerTraceRoutes } from './routes/trace.js';
import { registerDocsRoutes } from './routes/docs.js';

export interface ServerOptions {
  store: GraphStore;
  projectDir: string;
  host?: string;
  port?: number;
  staticDir?: string;
}

export async function createServer(options: ServerOptions) {
  const app = Fastify();
  await app.register(cors, { origin: true });

  const { store, projectDir } = options;

  registerGraphRoutes(app, store);
  registerSearchRoutes(app, store);
  registerNodeRoutes(app, store);
  registerStatusRoutes(app, store);
  registerRefreshRoutes(app, store, projectDir);
  registerChildrenRoutes(app, store);
  registerBlastRadiusRoutes(app, store);
  registerCyclesRoutes(app, store);
  registerWorkspaceRoutes(app, projectDir);
  registerViewsRoutes(app, projectDir);
  registerTraceRoutes(app, store);
  registerDocsRoutes(app, projectDir);

  if (options.staticDir) {
    const fastifyStatic = await import('@fastify/static');
    await app.register(fastifyStatic.default, {
      root: options.staticDir,
      prefix: '/',
      wildcard: false,
    });

    app.setNotFoundHandler(async (request, reply) => {
      if (request.url.startsWith('/api/')) {
        return reply.status(404).send({ success: false, error: 'Not found' });
      }
      return reply.sendFile('index.html');
    });
  }

  return app;
}

export async function startServer(options: ServerOptions) {
  const app = await createServer(options);
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 3100;
  await app.listen({ host, port });
  return app;
}
