import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';

interface SavedView {
  id: string;
  name: string;
  nodeIds: string[];
  createdAt: string;
}

function getViewsPath(projectDir: string): string {
  return join(projectDir, '.sniffo', 'views.json');
}

function loadViews(projectDir: string): SavedView[] {
  const path = getViewsPath(projectDir);
  if (!existsSync(path)) return [];
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return [];
  }
}

function saveViews(projectDir: string, views: SavedView[]): void {
  writeFileSync(getViewsPath(projectDir), JSON.stringify(views, null, 2) + '\n');
}

export function registerViewsRoutes(app: FastifyInstance, projectDir: string): void {
  app.get('/api/views', async () => {
    return loadViews(projectDir);
  });

  app.post<{ Body: { name: string; nodeIds: string[] } }>('/api/views', async (request) => {
    const { name, nodeIds } = request.body;
    const views = loadViews(projectDir);
    const view: SavedView = {
      id: crypto.randomUUID(),
      name,
      nodeIds,
      createdAt: new Date().toISOString(),
    };
    views.push(view);
    saveViews(projectDir, views);
    return view;
  });

  app.delete<{ Params: { id: string } }>('/api/views/:id', async (request) => {
    const views = loadViews(projectDir);
    const filtered = views.filter((v) => v.id !== request.params.id);
    saveViews(projectDir, filtered);
    return { ok: true };
  });
}
