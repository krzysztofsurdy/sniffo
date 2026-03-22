import { join } from 'node:path';
import { AnalysisPipeline, ParserRegistry, PhpParser, TypeScriptParser } from '@contextualizer/analyzer';
import { DuckDBGraphStore } from '@contextualizer/storage';
import type { AnalysisResult } from '@contextualizer/core';
import { loadConfig } from '../config/loader.js';

export async function runUpdate(projectDir: string, files?: string[]): Promise<AnalysisResult> {
  const config = loadConfig(projectDir);

  const dbPath = join(projectDir, '.contextualizer', 'graph.duckdb');
  const store = new DuckDBGraphStore(dbPath);
  await store.initialize();

  const registry = new ParserRegistry();
  await registry.register(new PhpParser());
  await registry.register(new TypeScriptParser());

  const pipeline = new AnalysisPipeline(store, registry);
  const result = await pipeline.analyzeIncremental({
    rootDir: projectDir,
    projectName: config.projectName,
    includePatterns: config.include,
    excludePatterns: config.exclude,
    files,
  });

  registry.dispose();
  await store.close();

  return result;
}
