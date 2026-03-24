import type { FastifyInstance } from 'fastify';
import type { GraphStore } from '@sniffo/storage';
import { computeBlastRadius } from '@sniffo/analyzer';

export function registerBlastRadiusRoutes(app: FastifyInstance, store: GraphStore): void {
  app.get<{ Params: { id: string }; Querystring: { depth?: string } }>('/api/blast-radius/:id', async (request) => {
    const depth = parseInt(request.query.depth ?? '2', 10);
    const result = await computeBlastRadius(store, request.params.id, Math.min(depth, 5));
    return { success: true, data: result };
  });
}
