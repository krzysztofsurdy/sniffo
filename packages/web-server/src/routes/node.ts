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

    const peerIds = new Set<string>();
    for (const e of incoming) peerIds.add(e.source);
    for (const e of outgoing) peerIds.add(e.target);
    peerIds.delete(node.id);

    const peerNodes = new Map<string, { shortName: string; type: string }>();
    for (const id of peerIds) {
      const peer = await store.getNodeById(id);
      if (peer) peerNodes.set(id, { shortName: peer.shortName, type: peer.type });
    }

    return { success: true, data: { node, incoming, outgoing, peerNodes: Object.fromEntries(peerNodes) } };
  });
}
