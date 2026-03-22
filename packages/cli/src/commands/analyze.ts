import { mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { AnalysisPipeline, ParserRegistry, PhpParser } from '@contextualizer/analyzer';
import { DuckDBGraphStore } from '@contextualizer/storage';
import type { AnalysisResult } from '@contextualizer/core';

export async function runAnalyze(projectDir: string): Promise<AnalysisResult> {
  const ctxDir = join(projectDir, '.contextualizer');
  mkdirSync(ctxDir, { recursive: true });

  const dbPath = join(ctxDir, 'graph.duckdb');
  const store = new DuckDBGraphStore(dbPath);
  await store.initialize();

  const registry = new ParserRegistry();
  await registry.register(new PhpParser());

  const pipeline = new AnalysisPipeline(store, registry);
  const result = await pipeline.analyze({
    rootDir: projectDir,
    projectName: basename(projectDir),
  });

  registry.dispose();
  await store.close();

  return result;
}
