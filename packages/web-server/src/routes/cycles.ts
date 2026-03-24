import type { FastifyInstance } from 'fastify';
import type { GraphStore } from '@sniffo/storage';
import { detectCycles } from '@sniffo/analyzer';

export function registerCyclesRoutes(app: FastifyInstance, store: GraphStore): void {
  app.get('/api/cycles', async () => {
    const cycles = await detectCycles(store);
    return { success: true, data: { cycles, count: cycles.length } };
  });
}
