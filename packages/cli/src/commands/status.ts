import { join } from 'node:path';
import { DuckDBGraphStore } from '@sniffo/storage';
import { getStalenessReport, type StalenessReport } from '@sniffo/analyzer';

export async function runStatus(projectDir: string): Promise<StalenessReport> {
  const dbPath = join(projectDir, '.sniffo', 'graph.duckdb');
  const store = new DuckDBGraphStore(dbPath);
  await store.initialize();

  const report = await getStalenessReport(store);

  await store.close();

  return report;
}
