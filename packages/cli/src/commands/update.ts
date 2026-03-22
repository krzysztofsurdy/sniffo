import { join, basename } from 'node:path';
import { AnalysisPipeline, ParserRegistry, PhpParser } from '@contextualizer/analyzer';
import { DuckDBGraphStore } from '@contextualizer/storage';
import type { AnalysisResult } from '@contextualizer/core';

export async function runUpdate(projectDir: string, files?: string[]): Promise<AnalysisResult> {
  const dbPath = join(projectDir, '.contextualizer', 'graph.duckdb');
  const store = new DuckDBGraphStore(dbPath);
  await store.initialize();

  const registry = new ParserRegistry();
  await registry.register(new PhpParser());

  const pipeline = new AnalysisPipeline(store, registry);
  const result = await pipeline.analyzeIncremental({
    rootDir: projectDir,
    projectName: basename(projectDir),
    files,
  });

  registry.dispose();
  await store.close();

  return result;
}
