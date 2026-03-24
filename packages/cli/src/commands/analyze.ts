import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { AnalysisPipeline, ParserRegistry, PhpParser, TypeScriptParser } from '@sniffo/analyzer';
import { DuckDBGraphStore } from '@sniffo/storage';
import type { AnalysisResult } from '@sniffo/core';
import { loadConfig } from '../config/loader.js';

export async function runAnalyze(projectDir: string): Promise<AnalysisResult> {
  const config = loadConfig(projectDir);

  const ctxDir = join(projectDir, '.sniffo');
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
    onProgress: (event) => {
      if (event.phase === 'discovery') {
        process.stdout.write(`\rDiscovered ${event.total} files...`);
      } else if (event.phase === 'parsing') {
        process.stdout.write(`\rParsing [${event.current}/${event.total}] ${event.file ?? ''}`.padEnd(80).slice(0, 80));
      } else if (event.phase === 'resolution') {
        process.stdout.write(`\rResolving references...`.padEnd(80));
      } else if (event.phase === 'hierarchy') {
        process.stdout.write(`\rBuilding hierarchy...`.padEnd(80));
      } else if (event.phase === 'aggregation') {
        process.stdout.write(`\rAggregating edges...`.padEnd(80));
      }
    },
  });
  process.stdout.write('\r' + ' '.repeat(80) + '\r');

  registry.dispose();
  await store.close();

  return result;
}
