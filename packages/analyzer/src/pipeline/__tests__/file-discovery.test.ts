import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverFiles } from '../file-discovery.js';

describe('discoverFiles', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'file-discovery-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('discovers PHP files recursively from a directory', async () => {
    await mkdir(join(tempDir, 'src', 'Entity'), { recursive: true });
    await writeFile(join(tempDir, 'src', 'index.php'), '<?php echo "hi";');
    await writeFile(join(tempDir, 'src', 'Entity', 'User.php'), '<?php class User {}');

    const files = await discoverFiles(tempDir);

    expect(files).toHaveLength(2);
    expect(files[0].relativePath).toBe('src/Entity/User.php');
    expect(files[0].language).toBe('php');
    expect(files[0].sizeBytes).toBeGreaterThan(0);
    expect(files[0].absolutePath).toBe(join(tempDir, 'src/Entity/User.php'));
    expect(files[1].relativePath).toBe('src/index.php');
  });

  it('excludes vendor and node_modules by default', async () => {
    await mkdir(join(tempDir, 'src'), { recursive: true });
    await mkdir(join(tempDir, 'vendor', 'lib'), { recursive: true });
    await mkdir(join(tempDir, 'node_modules', 'pkg'), { recursive: true });
    await writeFile(join(tempDir, 'src', 'App.php'), '<?php');
    await writeFile(join(tempDir, 'vendor', 'lib', 'dep.php'), '<?php');
    await writeFile(join(tempDir, 'node_modules', 'pkg', 'index.js'), '// js');

    const files = await discoverFiles(tempDir);

    expect(files).toHaveLength(1);
    expect(files[0].relativePath).toBe('src/App.php');
  });

  it('respects custom exclude patterns', async () => {
    await mkdir(join(tempDir, 'src'), { recursive: true });
    await mkdir(join(tempDir, 'tests'), { recursive: true });
    await writeFile(join(tempDir, 'src', 'App.php'), '<?php');
    await writeFile(join(tempDir, 'tests', 'AppTest.php'), '<?php');

    const files = await discoverFiles(tempDir, ['**/*'], ['tests/**']);

    expect(files).toHaveLength(1);
    expect(files[0].relativePath).toBe('src/App.php');
  });

  it('returns file size and language for supported extensions', async () => {
    const content = '<?php class Service {}';
    await mkdir(join(tempDir, 'src'), { recursive: true });
    await writeFile(join(tempDir, 'src', 'Service.php'), content);
    await writeFile(join(tempDir, 'src', 'app.ts'), 'export const x = 1;');
    await writeFile(join(tempDir, 'src', 'main.py'), 'print("hello")');

    const files = await discoverFiles(tempDir);

    expect(files).toHaveLength(3);

    const phpFile = files.find((f) => f.language === 'php')!;
    expect(phpFile.sizeBytes).toBe(Buffer.byteLength(content));

    const tsFile = files.find((f) => f.language === 'typescript')!;
    expect(tsFile.relativePath).toBe('src/app.ts');

    const pyFile = files.find((f) => f.language === 'python')!;
    expect(pyFile.relativePath).toBe('src/main.py');
  });

  it('returns empty array when no matching files exist', async () => {
    await mkdir(join(tempDir, 'empty'), { recursive: true });
    await writeFile(join(tempDir, 'empty', 'readme.txt'), 'nothing here');

    const files = await discoverFiles(tempDir);

    expect(files).toEqual([]);
  });
});
