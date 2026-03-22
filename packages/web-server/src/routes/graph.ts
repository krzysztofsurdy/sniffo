import type { FastifyInstance } from 'fastify';
import type { GraphStore } from '@contextualizer/storage';
import { GraphLevel } from '@contextualizer/core';

const LEVEL_MAP: Record<string, GraphLevel> = {
  system: GraphLevel.SYSTEM,
  container: GraphLevel.CONTAINER,
  component: GraphLevel.COMPONENT,
  code: GraphLevel.CODE,
};

export function registerGraphRoutes(app: FastifyInstance, store: GraphStore): void {
  app.get<{ Params: { level: string } }>('/api/graph/:level', async (request, reply) => {
    const level = LEVEL_MAP[request.params.level];
    if (level === undefined) {
      return reply.status(400).send({ success: false, error: 'Invalid level. Use: system, container, component, code' });
    }

    const allNodes = await store.getAllNodes();
    const nodes = allNodes.filter(n => n.level === level);

    const allEdges = await store.getAllEdges();
    const nodeIds = new Set(nodes.map(n => n.id));
    const edges = allEdges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));

    return { success: true, data: { nodes, edges } };
  });
}
