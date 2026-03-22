import type { FastifyInstance } from 'fastify';
import type { GraphStore } from '@contextualizer/storage';
import { AnalysisPipeline, ParserRegistry, PhpParser } from '@contextualizer/analyzer';

export function registerRefreshRoutes(app: FastifyInstance, store: GraphStore, projectDir: string): void {
  app.post<{ Body: { files?: string[] } }>('/api/refresh', async (request) => {
    const registry = new ParserRegistry();
    registry.register(new PhpParser());
    const pipeline = new AnalysisPipeline(store, registry);

    const result = await pipeline.analyzeIncremental({
      rootDir: projectDir,
      projectName: 'project',
      files: request.body?.files,
    });

    return { success: true, data: result };
  });
}
