import type { FastifyInstance } from 'fastify';
import type { GraphStore } from '@sniffo/storage';
import { traceFlow } from '@sniffo/analyzer';

export function registerTraceRoutes(app: FastifyInstance, store: GraphStore): void {
  app.get<{
    Params: { id: string };
    Querystring: { edgeTypes?: string; depth?: string; direction?: string };
  }>('/api/trace/:id', async (request) => {
    const { id } = request.params;
    const edgeTypes = request.query.edgeTypes?.split(',') ?? ['CALLS', 'INJECTS', 'IMPORTS'];
    const depth = Math.min(10, Math.max(1, parseInt(request.query.depth ?? '3', 10)));
    const direction = (['outgoing', 'incoming', 'both'].includes(request.query.direction ?? '')
      ? request.query.direction
      : 'outgoing') as 'outgoing' | 'incoming' | 'both';

    const result = await traceFlow(store, id, { edgeTypes: edgeTypes as any[], depth, direction });

    return { success: true, data: result };
  });
}
