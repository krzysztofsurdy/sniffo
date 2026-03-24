import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { detectWorkspaces, type WorkspaceInfo } from '../workspace-detector.js';

describe('workspace detector', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ctx-ws-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns null for non-monorepo projects', async () => {
    writeFileSync(join(tempDir, 'package.json'), JSON.stringify({ name: 'single-pkg' }));
    const result = await detectWorkspaces(tempDir);
    expect(result).toBeNull();
  });

  it('detects pnpm workspaces from pnpm-workspace.yaml', async () => {
    writeFileSync(join(tempDir, 'pnpm-workspace.yaml'), 'packages:\n  - "packages/*"\n  - "apps/*"\n');
    mkdirSync(join(tempDir, 'packages', 'core', 'src'), { recursive: true });
    mkdirSync(join(tempDir, 'packages', 'cli', 'src'), { recursive: true });
    mkdirSync(join(tempDir, 'apps', 'web', 'src'), { recursive: true });
    writeFileSync(join(tempDir, 'packages', 'core', 'package.json'), JSON.stringify({ name: '@my/core' }));
    writeFileSync(join(tempDir, 'packages', 'cli', 'package.json'), JSON.stringify({ name: '@my/cli' }));
    writeFileSync(join(tempDir, 'apps', 'web', 'package.json'), JSON.stringify({ name: '@my/web' }));

    const result = await detectWorkspaces(tempDir);

    expect(result).not.toBeNull();
    expect(result!.type).toBe('pnpm');
    expect(result!.packages).toHaveLength(3);

    const names = result!.packages.map(p => p.name).sort();
    expect(names).toEqual(['@my/cli', '@my/core', '@my/web']);

    const corePkg = result!.packages.find(p => p.name === '@my/core')!;
    expect(corePkg.relativePath).toBe('packages/core');
  });

  it('detects npm/yarn workspaces from package.json', async () => {
    writeFileSync(join(tempDir, 'package.json'), JSON.stringify({
      name: 'my-monorepo',
      workspaces: ['packages/*'],
    }));
    mkdirSync(join(tempDir, 'packages', 'api'), { recursive: true });
    mkdirSync(join(tempDir, 'packages', 'shared'), { recursive: true });
    writeFileSync(join(tempDir, 'packages', 'api', 'package.json'), JSON.stringify({ name: '@my/api' }));
    writeFileSync(join(tempDir, 'packages', 'shared', 'package.json'), JSON.stringify({ name: '@my/shared' }));

    const result = await detectWorkspaces(tempDir);

    expect(result).not.toBeNull();
    expect(result!.type).toBe('npm');
    expect(result!.packages).toHaveLength(2);
  });

  it('detects yarn workspaces with object syntax', async () => {
    writeFileSync(join(tempDir, 'package.json'), JSON.stringify({
      name: 'my-monorepo',
      workspaces: { packages: ['packages/*'] },
    }));
    mkdirSync(join(tempDir, 'packages', 'lib'), { recursive: true });
    writeFileSync(join(tempDir, 'packages', 'lib', 'package.json'), JSON.stringify({ name: '@my/lib' }));

    const result = await detectWorkspaces(tempDir);

    expect(result).not.toBeNull();
    expect(result!.type).toBe('npm');
    expect(result!.packages).toHaveLength(1);
  });

  it('detects Composer workspaces (PHP monorepo)', async () => {
    writeFileSync(join(tempDir, 'composer.json'), JSON.stringify({
      name: 'acme/monorepo',
      repositories: [
        { type: 'path', url: 'packages/*' },
      ],
    }));
    mkdirSync(join(tempDir, 'packages', 'billing'), { recursive: true });
    mkdirSync(join(tempDir, 'packages', 'auth'), { recursive: true });
    writeFileSync(join(tempDir, 'packages', 'billing', 'composer.json'), JSON.stringify({ name: 'acme/billing' }));
    writeFileSync(join(tempDir, 'packages', 'auth', 'composer.json'), JSON.stringify({ name: 'acme/auth' }));

    const result = await detectWorkspaces(tempDir);

    expect(result).not.toBeNull();
    expect(result!.type).toBe('composer');
    expect(result!.packages).toHaveLength(2);
  });

  it('handles glob patterns that match no directories', async () => {
    writeFileSync(join(tempDir, 'pnpm-workspace.yaml'), 'packages:\n  - "nonexistent/*"\n');

    const result = await detectWorkspaces(tempDir);
    expect(result).toBeNull();
  });
});
