import { join } from 'node:path';
import { DuckDBGraphStore } from '@contextualizer/storage';

export async function runServe(projectDir: string, options: { port?: number; host?: string } = {}): Promise<void> {
  const { startServer } = await import('@contextualizer/web-server');
  const dbPath = join(projectDir, '.contextualizer', 'graph.duckdb');
  const store = new DuckDBGraphStore(dbPath);
  await store.initialize();

  const port = options.port ?? 3100;
  const host = options.host ?? '127.0.0.1';

  await startServer({ store, projectDir, port, host });
  console.log(`Server running at http://${host}:${port}`);
}
