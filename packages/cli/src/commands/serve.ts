import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { DuckDBGraphStore } from '@contextualizer/storage';
import { fileURLToPath } from 'node:url';

export async function runServe(projectDir: string, options: { port?: number; host?: string } = {}): Promise<void> {
  const { startServer } = await import('@contextualizer/web-server');
  const dbPath = join(projectDir, '.contextualizer', 'graph.duckdb');
  const store = new DuckDBGraphStore(dbPath);
  await store.initialize();

  const port = options.port ?? 3100;
  const host = options.host ?? '127.0.0.1';

  let staticDir: string | undefined;
  try {
    const webPkgPath = import.meta.resolve('@contextualizer/web/package.json');
    const webPkgDir = dirname(fileURLToPath(webPkgPath));
    const distDir = join(webPkgDir, 'dist');
    if (existsSync(distDir)) {
      staticDir = distDir;
    }
  } catch {
    // Web package not available
  }

  await startServer({ store, projectDir, port, host, staticDir });
  console.log(`Server running at http://${host}:${port}`);
  if (staticDir) {
    console.log(`Web UI available at http://${host}:${port}`);
  }
}
