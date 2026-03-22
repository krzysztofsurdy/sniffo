import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { runInit } from '../commands/init.js';

describe('lpc init', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ctx-init-'));
    execSync('git init', { cwd: tempDir, stdio: 'ignore' });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates .contextualizer directory', async () => {
    await runInit(tempDir);
    expect(existsSync(join(tempDir, '.contextualizer'))).toBe(true);
  });

  it('creates config.json with default settings', async () => {
    await runInit(tempDir);
    const configPath = join(tempDir, '.contextualizer', 'config.json');
    expect(existsSync(configPath)).toBe(true);

    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(config.version).toBe(1);
    expect(config.include).toContain('**/*.php');
    expect(config.exclude).toContain('vendor/**');
  });

  it('installs pre-commit hook by default', async () => {
    await runInit(tempDir);
    const hookPath = join(tempDir, '.git', 'hooks', 'pre-commit');
    expect(existsSync(hookPath)).toBe(true);
    const content = readFileSync(hookPath, 'utf-8');
    expect(content).toContain('contextualizer');
  });

  it('skips hook installation with noHooks option', async () => {
    await runInit(tempDir, { noHooks: true });
    const hookPath = join(tempDir, '.git', 'hooks', 'pre-commit');
    expect(existsSync(hookPath)).toBe(false);
  });

  it('is idempotent (can run twice safely)', async () => {
    await runInit(tempDir);
    await runInit(tempDir);
    const configPath = join(tempDir, '.contextualizer', 'config.json');
    expect(existsSync(configPath)).toBe(true);
  });
});
