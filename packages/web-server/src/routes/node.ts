import type { FastifyInstance } from 'fastify';
import type { GraphStore } from '@sniffo/storage';

export function registerNodeRoutes(app: FastifyInstance, store: GraphStore): void {
  app.get<{ Params: { id: string } }>('/api/node/:id', async (request, reply) => {
    const node = await store.getNodeById(request.params.id);
    if (!node) {
      return reply.status(404).send({ success: false, error: 'Node not found' });
    }

    const incoming = await store.getIncomingEdges(node.id);
    const outgoing = await store.getOutgoingEdges(node.id);

    return { success: true, data: { node, incoming, outgoing } };
  });
}
