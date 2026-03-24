import type { FastifyInstance } from 'fastify';
import type { GraphStore } from '@sniffo/storage';
import { getStalenessReport } from '@sniffo/analyzer';

export function registerStatusRoutes(app: FastifyInstance, store: GraphStore): void {
  app.get('/api/status', async () => {
    const report = await getStalenessReport(store);
    return { success: true, data: report };
  });
}
