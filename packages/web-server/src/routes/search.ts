import type { FastifyInstance } from 'fastify';
import type { GraphStore } from '@contextualizer/storage';
import { searchSymbols } from '@contextualizer/analyzer';
import type { NodeType } from '@contextualizer/core';

export function registerSearchRoutes(app: FastifyInstance, store: GraphStore): void {
  app.get<{ Querystring: { q: string; kind?: string } }>('/api/search', async (request, reply) => {
    const { q, kind } = request.query;
    if (!q) {
      return reply.status(400).send({ success: false, error: 'Missing query parameter "q"' });
    }

    const types = kind ? [kind as NodeType] : undefined;
    const results = await searchSymbols(store, q, types);

    return { success: true, data: results };
  });
}
