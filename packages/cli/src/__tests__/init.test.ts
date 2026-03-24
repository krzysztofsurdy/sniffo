import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { runInit } from '../commands/init.js';

describe('sniffo init', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ctx-init-'));
    execSync('git init', { cwd: tempDir, stdio: 'ignore' });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates .sniffo directory', async () => {
    await runInit(tempDir, { noAnalyze: true });
    expect(existsSync(join(tempDir, '.sniffo'))).toBe(true);
  });

  it('creates config.json with default settings', async () => {
    await runInit(tempDir, { noAnalyze: true });
    const configPath = join(tempDir, '.sniffo', 'config.json');
    expect(existsSync(configPath)).toBe(true);

    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(config.version).toBe(1);
    expect(config.include).toContain('**/*.php');
    expect(config.exclude).toContain('vendor/**');
  });

  it('writes config with all supported language patterns', async () => {
    await runInit(tempDir, { noAnalyze: true });
    const config = JSON.parse(readFileSync(join(tempDir, '.sniffo', 'config.json'), 'utf-8'));
    expect(config.include).toContain('**/*.ts');
    expect(config.include).toContain('**/*.tsx');
    expect(config.include).toContain('**/*.js');
    expect(config.include).toContain('**/*.jsx');
    expect(config.include).toContain('**/*.php');
  });

  it('installs pre-commit hook by default', async () => {
    await runInit(tempDir, { noAnalyze: true });
    const hookPath = join(tempDir, '.git', 'hooks', 'pre-commit');
    expect(existsSync(hookPath)).toBe(true);
    const content = readFileSync(hookPath, 'utf-8');
    expect(content).toContain('sniffo');
  });

  it('skips hook installation with noHooks option', async () => {
    await runInit(tempDir, { noHooks: true, noAnalyze: true });
    const hookPath = join(tempDir, '.git', 'hooks', 'pre-commit');
    expect(existsSync(hookPath)).toBe(false);
  });

  it('is idempotent (can run twice safely)', async () => {
    await runInit(tempDir, { noAnalyze: true });
    await runInit(tempDir, { noAnalyze: true });
    const configPath = join(tempDir, '.sniffo', 'config.json');
    expect(existsSync(configPath)).toBe(true);
  });
});
