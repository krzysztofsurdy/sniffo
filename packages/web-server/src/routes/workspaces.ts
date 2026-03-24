import type { FastifyInstance } from 'fastify';
import { detectWorkspaces } from '@sniffo/analyzer';

export function registerWorkspaceRoutes(app: FastifyInstance, projectDir: string): void {
  app.get('/api/workspaces', async () => {
    const info = await detectWorkspaces(projectDir);

    if (!info) {
      return { success: true, data: null };
    }

    return {
      success: true,
      data: {
        type: info.type,
        packages: info.packages.map(pkg => ({
          name: pkg.name,
          path: pkg.relativePath,
        })),
      },
    };
  });
}
