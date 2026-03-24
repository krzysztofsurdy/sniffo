import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { DuckDBGraphStore } from '@sniffo/storage';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';

export async function runServe(projectDir: string, options: { port?: number; host?: string; open?: boolean } = {}): Promise<void> {
  const { startServer } = await import('@sniffo/web-server');

  const dbPath = join(projectDir, '.sniffo', 'graph.duckdb');
  if (!existsSync(dbPath)) {
    console.log('No database found. Running init + analysis first...');
    const { runInit } = await import('./init.js');
    await runInit(projectDir, { noAnalyze: false });
  }

  const store = new DuckDBGraphStore(dbPath);
  await store.initialize();

  const port = options.port ?? 3100;
  const host = options.host ?? '127.0.0.1';

  let staticDir: string | undefined;
  try {
    const webPkgPath = import.meta.resolve('@sniffo/web/package.json');
    const webPkgDir = dirname(fileURLToPath(webPkgPath));
    const distDir = join(webPkgDir, 'dist');
    if (existsSync(distDir)) {
      staticDir = distDir;
    }
  } catch {
    // Web package not available
  }

  await startServer({ store, projectDir, port, host, staticDir });
  const url = `http://${host}:${port}`;
  console.log(`Server running at ${url}`);
  if (staticDir) {
    console.log(`Web UI available at ${url}`);
  }

  if (options.open) {
    const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    exec(`${cmd} ${url}`, () => {});
  }
}
