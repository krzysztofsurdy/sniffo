#!/usr/bin/env node
import { join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { DuckDBGraphStore } from '@sniffo/storage';
import { startStdioServer } from './server.js';

const projectDir = process.argv[2] || process.env.PROJECT_DIR || process.cwd();
const ctxDir = join(projectDir, '.sniffo');
const dbPath = join(ctxDir, 'graph.duckdb');

if (!existsSync(dbPath)) {
  mkdirSync(ctxDir, { recursive: true });
  process.stderr.write(`[sniffo] No database found at ${dbPath}. Initializing...\n`);
}

const store = new DuckDBGraphStore(dbPath);
await store.initialize();

const allNodes = await store.getAllNodes();
if (allNodes.length === 0) {
  process.stderr.write(`[sniffo] Empty database. Running initial analysis...\n`);
  try {
    const { AnalysisPipeline, ParserRegistry, PhpParser, TypeScriptParser } = await import('@sniffo/analyzer');
    const registry = new ParserRegistry();
    await registry.register(new PhpParser());
    await registry.register(new TypeScriptParser());
    const pipeline = new AnalysisPipeline(store, registry);
    const result = await pipeline.analyze({
      rootDir: projectDir,
      projectName: projectDir.split('/').pop() ?? 'project',
      includePatterns: ['**/*.php', '**/*.ts', '**/*.tsx'],
      excludePatterns: ['vendor/**', 'node_modules/**', '.git/**', 'dist/**', 'build/**'],
    });
    registry.dispose();
    process.stderr.write(`[sniffo] Analysis complete: ${result.filesAnalyzed} files, ${result.symbolsFound} symbols.\n`);
  } catch (err) {
    process.stderr.write(`[sniffo] Analysis failed: ${err instanceof Error ? err.message : String(err)}\n`);
  }
}

await startStdioServer(store, projectDir);
