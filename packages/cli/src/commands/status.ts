import { join } from 'node:path';
import { DuckDBGraphStore } from '@contextualizer/storage';
import { getStalenessReport, type StalenessReport } from '@contextualizer/analyzer';

export async function runStatus(projectDir: string): Promise<StalenessReport> {
  const dbPath = join(projectDir, '.contextualizer', 'graph.duckdb');
  const store = new DuckDBGraphStore(dbPath);
  await store.initialize();

  const report = await getStalenessReport(store);

  await store.close();

  return report;
}
