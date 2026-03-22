import Fastify from 'fastify';
import cors from '@fastify/cors';
import type { GraphStore } from '@contextualizer/storage';
import { registerGraphRoutes } from './routes/graph.js';
import { registerSearchRoutes } from './routes/search.js';
import { registerNodeRoutes } from './routes/node.js';
import { registerStatusRoutes } from './routes/status.js';
import { registerRefreshRoutes } from './routes/refresh.js';

export interface ServerOptions {
  store: GraphStore;
  projectDir: string;
  host?: string;
  port?: number;
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

  return app;
}

export async function startServer(options: ServerOptions) {
  const app = await createServer(options);
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 3100;
  await app.listen({ host, port });
  return app;
}
