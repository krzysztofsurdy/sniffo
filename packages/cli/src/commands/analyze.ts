import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { AnalysisPipeline, ParserRegistry, PhpParser, TypeScriptParser } from '@contextualizer/analyzer';
import { DuckDBGraphStore } from '@contextualizer/storage';
import type { AnalysisResult } from '@contextualizer/core';
import { loadConfig } from '../config/loader.js';

export async function runAnalyze(projectDir: string): Promise<AnalysisResult> {
  const config = loadConfig(projectDir);

  const ctxDir = join(projectDir, '.contextualizer');
  mkdirSync(ctxDir, { recursive: true });

  const dbPath = join(ctxDir, 'graph.duckdb');
  const store = new DuckDBGraphStore(dbPath);
  await store.initialize();

  const registry = new ParserRegistry();
  await registry.register(new PhpParser());
  await registry.register(new TypeScriptParser());

  const pipeline = new AnalysisPipeline(store, registry);
  const result = await pipeline.analyze({
    rootDir: projectDir,
    projectName: config.projectName,
    includePatterns: config.include,
    excludePatterns: config.exclude,
  });

  registry.dispose();
  await store.close();

  return result;
}
