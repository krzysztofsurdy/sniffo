import type { FastifyInstance } from 'fastify';
import type { GraphStore } from '@contextualizer/storage';
import { getStalenessReport } from '@contextualizer/analyzer';

export function registerStatusRoutes(app: FastifyInstance, store: GraphStore): void {
  app.get('/api/status', async () => {
    const report = await getStalenessReport(store);
    return { success: true, data: report };
  });
}
