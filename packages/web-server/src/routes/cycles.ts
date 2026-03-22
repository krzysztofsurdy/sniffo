import type { FastifyInstance } from 'fastify';
import type { GraphStore } from '@contextualizer/storage';
import { detectCycles } from '@contextualizer/analyzer';

export function registerCyclesRoutes(app: FastifyInstance, store: GraphStore): void {
  app.get('/api/cycles', async () => {
    const cycles = await detectCycles(store);
    return { success: true, data: { cycles, count: cycles.length } };
  });
}
