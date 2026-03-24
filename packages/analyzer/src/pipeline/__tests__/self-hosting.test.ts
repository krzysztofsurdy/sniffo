import { describe, it, expect, afterEach } from 'vitest';
import { resolve } from 'node:path';
import { DuckDBGraphStore } from '@sniffo/storage';
import { AnalysisPipeline } from '../analysis-pipeline.js';
import { ParserRegistry } from '../../parsers/parser-registry.js';
import { TypeScriptParser } from '../../parsers/typescript/typescript-parser.js';

const ROOT_DIR = resolve(import.meta.dirname, '../../../../..');

describe('self-hosting', () => {
  let store: DuckDBGraphStore;
  let registry: ParserRegistry;

  afterEach(async () => {
    registry?.dispose();
    await store?.close();
  });

  it('analyzes the sniffo codebase itself', async () => {
    store = new DuckDBGraphStore(':memory:');
    await store.initialize();

    registry = new ParserRegistry();
    await registry.register(new TypeScriptParser());

    const pipeline = new AnalysisPipeline(store, registry);

    const result = await pipeline.analyze({
      rootDir: ROOT_DIR,
      projectName: 'sniffo',
      includePatterns: ['packages/*/src/**/*.ts'],
      excludePatterns: ['**/*.test.ts', '**/*.d.ts', '**/node_modules/**', '**/dist/**'],
    });

    expect(result.filesAnalyzed).toBeGreaterThan(10);
    expect(result.symbolsFound).toBeGreaterThan(20);
    expect(result.errors.length).toBeLessThan(result.filesAnalyzed);

    const allNodes = await store.getAllNodes();
    const classNames = allNodes.map((n) => n.shortName);

    expect(classNames).toContain('AnalysisPipeline');
    expect(classNames).toContain('ParserRegistry');

    // Verify monorepo detection works on our own codebase
    const packageNodes = allNodes.filter(n => n.type === 'PACKAGE');
    expect(packageNodes.length).toBeGreaterThanOrEqual(2);

    const packageNames = packageNodes.map(n => n.shortName);
    expect(packageNames).toContain('@sniffo/core');
    expect(packageNames).toContain('@sniffo/analyzer');
  }, 60000);
});
