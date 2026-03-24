import { join } from 'node:path';
import { AnalysisPipeline, ParserRegistry, PhpParser, TypeScriptParser } from '@sniffo/analyzer';
import { DuckDBGraphStore } from '@sniffo/storage';
import type { AnalysisResult } from '@sniffo/core';
import { loadConfig } from '../config/loader.js';
import { renderProgress, clearProgress, PHASES } from './analyze.js';

export async function runUpdate(projectDir: string, files?: string[]): Promise<AnalysisResult> {
  const config = loadConfig(projectDir);

  const dbPath = join(projectDir, '.sniffo', 'graph.duckdb');
  const store = new DuckDBGraphStore(dbPath);
  await store.initialize();

  const registry = new ParserRegistry();
  await registry.register(new PhpParser());
  await registry.register(new TypeScriptParser());

  process.stdout.write('\n\n\n');

  const pipeline = new AnalysisPipeline(store, registry);
  const result = await pipeline.analyzeIncremental({
    rootDir: projectDir,
    projectName: config.projectName,
    includePatterns: config.include,
    excludePatterns: config.exclude,
    files,
    onProgress: (event) => {
      const phaseIndex = PHASES.indexOf(event.phase as typeof PHASES[number]);
      renderProgress(event.phase, phaseIndex, event.current, event.total, event.detail ?? event.file);
    },
  });

  clearProgress();

  registry.dispose();
  await store.close();

  return result;
}
