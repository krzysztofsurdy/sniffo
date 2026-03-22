import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runAnalyze } from '../commands/analyze.js';
import { runUpdate } from '../commands/update.js';
import { runStatus } from '../commands/status.js';

describe('CLI commands', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ctx-cli-'));
    mkdirSync(join(tempDir, 'src'), { recursive: true });
    writeFileSync(join(tempDir, 'src', 'Foo.php'), '<?php namespace App; class Foo {}');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('runAnalyze creates .contextualizer directory and DB', async () => {
    const result = await runAnalyze(tempDir);
    expect(result.filesAnalyzed).toBe(1);
    expect(existsSync(join(tempDir, '.contextualizer'))).toBe(true);
  });

  it('runUpdate only processes changed files', async () => {
    await runAnalyze(tempDir);

    const result = await runUpdate(tempDir);
    expect(result.filesAnalyzed).toBe(0);
    expect(result.filesSkipped).toBe(1);
  });

  it('runUpdate detects modifications', async () => {
    await runAnalyze(tempDir);

    writeFileSync(join(tempDir, 'src', 'Foo.php'), '<?php namespace App; class Foo { public function bar(): void {} }');

    const result = await runUpdate(tempDir);
    expect(result.filesAnalyzed).toBe(1);
  });

  it('runStatus returns report', async () => {
    await runAnalyze(tempDir);

    const report = await runStatus(tempDir);
    expect(report.totalNodes).toBeGreaterThan(0);
    expect(report.stalePercentage).toBe(0);
  });
});
