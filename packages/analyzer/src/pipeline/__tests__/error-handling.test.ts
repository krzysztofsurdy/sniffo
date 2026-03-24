import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DuckDBGraphStore } from '@sniffo/storage';
import { AnalysisPipeline } from '../analysis-pipeline.js';
import { ParserRegistry } from '../../parsers/parser-registry.js';
import { PhpParser } from '../../parsers/php/php-parser.js';

describe('error handling', () => {
  let tempDir: string;
  let store: DuckDBGraphStore;
  let registry: ParserRegistry;
  let pipeline: AnalysisPipeline;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'ctx-err-'));
    await mkdir(join(tempDir, 'src'), { recursive: true });
    store = new DuckDBGraphStore(':memory:');
    await store.initialize();
    registry = new ParserRegistry();
    await registry.register(new PhpParser());
    pipeline = new AnalysisPipeline(store, registry);
  });

  afterEach(async () => {
    registry.dispose();
    await store.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('continues analysis when a file has syntax errors', async () => {
    await writeFile(
      join(tempDir, 'src', 'good.php'),
      '<?php\nclass GoodClass {}',
    );
    await writeFile(
      join(tempDir, 'src', 'bad.php'),
      '<?php\nclass { broken syntax !!!',
    );

    const result = await pipeline.analyze({
      rootDir: tempDir,
      projectName: 'test',
      includePatterns: ['**/*.php'],
    });

    expect(result.filesAnalyzed).toBeGreaterThanOrEqual(1);
  });

  it('handles empty files gracefully', async () => {
    await writeFile(join(tempDir, 'src', 'empty.php'), '');

    const result = await pipeline.analyze({
      rootDir: tempDir,
      projectName: 'test',
      includePatterns: ['**/*.php'],
    });

    expect(result).toBeDefined();
  });

  it('handles binary-like content gracefully', async () => {
    await writeFile(
      join(tempDir, 'src', 'binary.php'),
      Buffer.from([0x00, 0x01, 0x02, 0xff]),
    );

    const result = await pipeline.analyze({
      rootDir: tempDir,
      projectName: 'test',
      includePatterns: ['**/*.php'],
    });

    expect(result).toBeDefined();
  });
});
