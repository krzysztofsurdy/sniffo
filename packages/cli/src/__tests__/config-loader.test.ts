import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig } from '../config/loader.js';

describe('config loader', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ctx-cfg-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns defaults when no config file exists', () => {
    const config = loadConfig(tempDir);
    expect(config.include).toContain('**/*.php');
    expect(config.include).toContain('**/*.ts');
    expect(config.exclude).toContain('vendor/**');
    expect(config.exclude).toContain('node_modules/**');
  });

  it('loads config from .sniffo/config.json', () => {
    mkdirSync(join(tempDir, '.sniffo'), { recursive: true });
    writeFileSync(join(tempDir, '.sniffo', 'config.json'), JSON.stringify({
      version: 1,
      include: ['**/*.php'],
      exclude: ['vendor/**', 'tests/**'],
    }));

    const config = loadConfig(tempDir);
    expect(config.include).toEqual(['**/*.php']);
    expect(config.exclude).toContain('tests/**');
  });

  it('merges with defaults for missing fields', () => {
    mkdirSync(join(tempDir, '.sniffo'), { recursive: true });
    writeFileSync(join(tempDir, '.sniffo', 'config.json'), JSON.stringify({
      version: 1,
      include: ['**/*.py'],
    }));

    const config = loadConfig(tempDir);
    expect(config.include).toEqual(['**/*.py']);
    expect(config.exclude.length).toBeGreaterThan(0);
  });

  it('loads config from .snifforc.json at project root', () => {
    writeFileSync(join(tempDir, '.snifforc.json'), JSON.stringify({
      include: ['src/**/*.ts'],
      exclude: ['dist/**'],
      projectName: 'my-project',
    }));

    const config = loadConfig(tempDir);
    expect(config.include).toEqual(['src/**/*.ts']);
    expect(config.projectName).toBe('my-project');
  });

  it('prefers .sniffo/config.json over .snifforc.json', () => {
    mkdirSync(join(tempDir, '.sniffo'), { recursive: true });
    writeFileSync(join(tempDir, '.sniffo', 'config.json'), JSON.stringify({
      include: ['**/*.php'],
    }));
    writeFileSync(join(tempDir, '.snifforc.json'), JSON.stringify({
      include: ['**/*.ts'],
    }));

    const config = loadConfig(tempDir);
    expect(config.include).toEqual(['**/*.php']);
  });

  it('falls back to defaults on invalid JSON', () => {
    writeFileSync(join(tempDir, '.snifforc.json'), 'not valid json{{{');

    const config = loadConfig(tempDir);
    expect(config.include).toContain('**/*.php');
    expect(config.include).toContain('**/*.ts');
  });

  it('uses directory basename as default projectName', () => {
    const config = loadConfig(tempDir);
    expect(config.projectName).toBeTruthy();
  });

  it('merges nested analysis config', () => {
    writeFileSync(join(tempDir, '.snifforc.json'), JSON.stringify({
      analysis: { concurrency: 8 },
    }));

    const config = loadConfig(tempDir);
    expect(config.analysis.concurrency).toBe(8);
    expect(config.analysis.fileTimeout).toBe(30000);
  });
});
