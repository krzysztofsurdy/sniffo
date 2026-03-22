import { describe, it, expect, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm, stat, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { installHook, uninstallHook } from '../commands/install-hook.js';

const MARKER_START = '# --- contextualizer pre-commit hook start ---';
const MARKER_END = '# --- contextualizer pre-commit hook end ---';

let tempDir: string;

async function createTempGitRepo(): Promise<string> {
  tempDir = await mkdtemp(join(tmpdir(), 'ctx-hook-test-'));
  execSync('git init', { cwd: tempDir, stdio: 'ignore' });
  return tempDir;
}

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
  }
});

describe('installHook', () => {
  it('installs pre-commit hook into .git/hooks', async () => {
    const dir = await createTempGitRepo();

    await installHook(dir);

    const hookPath = join(dir, '.git', 'hooks', 'pre-commit');
    const content = await readFile(hookPath, 'utf-8');

    expect(content).toContain('#!/bin/sh');
    expect(content).toContain(MARKER_START);
    expect(content).toContain(MARKER_END);
    expect(content).toContain('lpc update');
  });

  it('makes hook executable', async () => {
    const dir = await createTempGitRepo();

    await installHook(dir);

    const hookPath = join(dir, '.git', 'hooks', 'pre-commit');
    const stats = await stat(hookPath);
    const mode = stats.mode & 0o777;

    expect(mode & 0o111).not.toBe(0);
  });

  it('appends to existing pre-commit hook without overwriting', async () => {
    const dir = await createTempGitRepo();
    const hookPath = join(dir, '.git', 'hooks', 'pre-commit');

    const existingContent = '#!/bin/sh\necho "existing hook"';
    const { mkdir } = await import('node:fs/promises');
    await mkdir(join(dir, '.git', 'hooks'), { recursive: true });
    await writeFile(hookPath, existingContent, 'utf-8');
    await chmod(hookPath, 0o755);

    await installHook(dir);

    const content = await readFile(hookPath, 'utf-8');
    expect(content).toContain('echo "existing hook"');
    expect(content).toContain(MARKER_START);
    expect(content).toContain(MARKER_END);
  });

  it('throws if not a git repository', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'ctx-hook-test-'));

    await expect(installHook(tempDir)).rejects.toThrow('Not a git repository');
  });
});

describe('uninstallHook', () => {
  it('uninstalls hook by removing contextualizer section', async () => {
    const dir = await createTempGitRepo();

    await installHook(dir);

    const hookPath = join(dir, '.git', 'hooks', 'pre-commit');
    let content = await readFile(hookPath, 'utf-8');
    expect(content).toContain(MARKER_START);

    await uninstallHook(dir);

    try {
      await stat(hookPath);
      expect.fail('Hook file should have been deleted');
    } catch {
      // expected: file deleted since only shebang remained
    }
  });

  it('preserves other hook content when uninstalling', async () => {
    const dir = await createTempGitRepo();
    const hookPath = join(dir, '.git', 'hooks', 'pre-commit');

    const { mkdir } = await import('node:fs/promises');
    await mkdir(join(dir, '.git', 'hooks'), { recursive: true });
    await writeFile(hookPath, '#!/bin/sh\necho "keep me"', 'utf-8');

    await installHook(dir);
    await uninstallHook(dir);

    const content = await readFile(hookPath, 'utf-8');
    expect(content).toContain('echo "keep me"');
    expect(content).not.toContain(MARKER_START);
  });
});
