import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AnalysisPipeline } from '../analysis-pipeline.js';
import { DuckDBGraphStore } from '@contextualizer/storage';
import { ParserRegistry } from '../../parsers/parser-registry.js';
import { PhpParser } from '../../parsers/php/php-parser.js';

describe('Incremental Analysis', () => {
  let tempDir: string;
  let store: DuckDBGraphStore;
  let registry: ParserRegistry;
  let pipeline: AnalysisPipeline;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ctx-incr-'));
    store = new DuckDBGraphStore(':memory:');
    await store.initialize();
    registry = new ParserRegistry();
    await registry.register(new PhpParser());
    pipeline = new AnalysisPipeline(store, registry);
  });

  afterEach(async () => {
    registry.dispose();
    await store.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  function writePhp(relativePath: string, content: string) {
    const fullPath = join(tempDir, relativePath);
    mkdirSync(join(fullPath, '..'), { recursive: true });
    writeFileSync(fullPath, content);
  }

  it('only re-analyzes changed files on second run', async () => {
    writePhp('src/A.php', '<?php namespace App; class A {}');
    writePhp('src/B.php', '<?php namespace App; class B {}');

    const first = await pipeline.analyze({ rootDir: tempDir, projectName: 'test' });
    expect(first.filesAnalyzed).toBe(2);

    const second = await pipeline.analyze({ rootDir: tempDir, projectName: 'test' });
    expect(second.filesAnalyzed).toBe(0);
    expect(second.filesSkipped).toBe(2);
  });

  it('re-analyzes only the modified file', async () => {
    writePhp('src/A.php', '<?php namespace App; class A {}');
    writePhp('src/B.php', '<?php namespace App; class B {}');

    await pipeline.analyze({ rootDir: tempDir, projectName: 'test' });

    writePhp('src/A.php', '<?php namespace App; class A { public function hello(): void {} }');

    const result = await pipeline.analyze({ rootDir: tempDir, projectName: 'test' });
    expect(result.filesAnalyzed).toBe(1);
    expect(result.filesSkipped).toBe(1);
  });

  it('handles deleted files by removing their nodes', async () => {
    writePhp('src/A.php', '<?php namespace App; class A {}');
    writePhp('src/B.php', '<?php namespace App; class B {}');

    await pipeline.analyze({ rootDir: tempDir, projectName: 'test' });

    rmSync(join(tempDir, 'src/B.php'));

    await pipeline.analyze({ rootDir: tempDir, projectName: 'test' });
    const nodeB = await store.getNodeByQualifiedName('App\\B');
    expect(nodeB).toBeNull();
  });

  it('marks dependents stale via cascade invalidation on incremental run', async () => {
    writePhp('src/Base.php', '<?php namespace App; class Base { public function foo(): void {} }');
    writePhp('src/Child.php', '<?php namespace App; class Child extends Base {}');

    await pipeline.analyze({ rootDir: tempDir, projectName: 'test' });

    writePhp('src/Base.php', '<?php namespace App; class Base { public function bar(): void {} }');

    await pipeline.analyzeIncremental({ rootDir: tempDir, projectName: 'test' });

    const child = await store.getNodeByQualifiedName('App\\Child');
    expect(child!.isStale).toBe(true);
  });

  it('incremental update with specific file list', async () => {
    writePhp('src/A.php', '<?php namespace App; class A {}');
    writePhp('src/B.php', '<?php namespace App; class B {}');

    await pipeline.analyze({ rootDir: tempDir, projectName: 'test' });

    writePhp('src/A.php', '<?php namespace App; class A { public function x(): void {} }');

    const result = await pipeline.analyzeIncremental({
      rootDir: tempDir,
      projectName: 'test',
      files: ['src/A.php'],
    });

    expect(result.filesAnalyzed).toBe(1);
  });
});
