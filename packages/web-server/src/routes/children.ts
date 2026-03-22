import type { FastifyInstance } from 'fastify';
import type { GraphStore } from '@contextualizer/storage';
import { findChildren } from '@contextualizer/analyzer';

export function registerChildrenRoutes(app: FastifyInstance, store: GraphStore): void {
  app.get<{ Params: { id: string } }>('/api/node/:id/children', async (request) => {
    const result = await findChildren(store, request.params.id);
    return { success: true, data: result };
  });
}
