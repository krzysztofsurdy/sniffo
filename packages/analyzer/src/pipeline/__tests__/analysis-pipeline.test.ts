import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GraphLevel, NodeType, EdgeType } from '@sniffo/core';
import { DuckDBGraphStore } from '@sniffo/storage';
import { AnalysisPipeline } from '../analysis-pipeline.js';
import { ParserRegistry } from '../../parsers/parser-registry.js';
import { PhpParser } from '../../parsers/php/php-parser.js';

describe('AnalysisPipeline', () => {
  let tempDir: string;
  let store: DuckDBGraphStore;
  let registry: ParserRegistry;
  let pipeline: AnalysisPipeline;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'analysis-pipeline-'));
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

  it('analyzes a single PHP file and stores nodes', async () => {
    await mkdir(join(tempDir, 'src', 'Service'), { recursive: true });
    await writeFile(
      join(tempDir, 'src', 'Service', 'UserService.php'),
      `<?php
namespace App\\Service;

class UserService
{
    public function findUser(int $id): void
    {
    }
}
`,
    );

    const result = await pipeline.analyze({
      rootDir: tempDir,
      projectName: 'TestProject',
      includePatterns: ['**/*.php'],
    });

    expect(result.filesAnalyzed).toBe(1);
    expect(result.symbolsFound).toBeGreaterThanOrEqual(2);
    expect(result.errors).toHaveLength(0);

    const allNodes = await store.getAllNodes();
    const classNode = allNodes.find((n) => n.qualifiedName === 'App\\Service\\UserService');
    expect(classNode).toBeDefined();
    expect(classNode!.type).toBe(NodeType.CLASS);
    expect(classNode!.level).toBe(GraphLevel.COMPONENT);

    const methodNode = allNodes.find((n) => n.qualifiedName === 'App\\Service\\UserService::findUser');
    expect(methodNode).toBeDefined();
    expect(methodNode!.type).toBe(NodeType.METHOD);
    expect(methodNode!.level).toBe(GraphLevel.CODE);
  });

  it('resolves cross-file extends reference', async () => {
    await mkdir(join(tempDir, 'src'), { recursive: true });
    await writeFile(
      join(tempDir, 'src', 'Base.php'),
      `<?php
namespace App;

class Base
{
    public function baseMethod(): void {}
}
`,
    );
    await writeFile(
      join(tempDir, 'src', 'Child.php'),
      `<?php
namespace App;

class Child extends Base
{
    public function childMethod(): void {}
}
`,
    );

    const result = await pipeline.analyze({
      rootDir: tempDir,
      projectName: 'TestProject',
      includePatterns: ['**/*.php'],
    });

    expect(result.filesAnalyzed).toBe(2);

    const allEdges = await store.getAllEdges();
    const extendsEdge = allEdges.find((e) => e.type === EdgeType.EXTENDS);
    expect(extendsEdge).toBeDefined();
  });

  it('resolves cross-file implements with use statement', async () => {
    await mkdir(join(tempDir, 'src', 'Contract'), { recursive: true });
    await mkdir(join(tempDir, 'src', 'Service'), { recursive: true });
    await writeFile(
      join(tempDir, 'src', 'Contract', 'UserRepositoryInterface.php'),
      `<?php
namespace App\\Contract;

interface UserRepositoryInterface
{
    public function find(int $id): void;
}
`,
    );
    await writeFile(
      join(tempDir, 'src', 'Service', 'UserRepository.php'),
      `<?php
namespace App\\Service;

use App\\Contract\\UserRepositoryInterface;

class UserRepository implements UserRepositoryInterface
{
    public function find(int $id): void {}
}
`,
    );

    const result = await pipeline.analyze({
      rootDir: tempDir,
      projectName: 'TestProject',
      includePatterns: ['**/*.php'],
    });

    expect(result.filesAnalyzed).toBe(2);

    const allEdges = await store.getAllEdges();
    const implementsEdge = allEdges.find((e) => e.type === EdgeType.IMPLEMENTS);
    expect(implementsEdge).toBeDefined();
  });

  it('builds hierarchy with system and container nodes', async () => {
    await mkdir(join(tempDir, 'src'), { recursive: true });
    await writeFile(
      join(tempDir, 'src', 'Foo.php'),
      `<?php
namespace App;

class Foo {}
`,
    );

    await pipeline.analyze({
      rootDir: tempDir,
      projectName: 'TestProject',
      includePatterns: ['**/*.php'],
    });

    const allNodes = await store.getAllNodes();
    const systemNode = allNodes.find((n) => n.type === NodeType.SYSTEM);
    expect(systemNode).toBeDefined();
    expect(systemNode!.qualifiedName).toBe('TestProject');
    expect(systemNode!.level).toBe(GraphLevel.SYSTEM);

    const containerNode = allNodes.find((n) => n.type === NodeType.MODULE);
    expect(containerNode).toBeDefined();
    expect(containerNode!.level).toBe(GraphLevel.CONTAINER);
  });

  it('stores file hashes for change detection', async () => {
    await mkdir(join(tempDir, 'src'), { recursive: true });
    await writeFile(
      join(tempDir, 'src', 'Bar.php'),
      `<?php
namespace App;

class Bar {}
`,
    );

    await pipeline.analyze({
      rootDir: tempDir,
      projectName: 'TestProject',
      includePatterns: ['**/*.php'],
    });

    const hash = await store.getFileHash('src/Bar.php');
    expect(hash).not.toBeNull();
    expect(hash).toHaveLength(64);

    const result2 = await pipeline.analyze({
      rootDir: tempDir,
      projectName: 'TestProject',
      includePatterns: ['**/*.php'],
    });

    expect(result2.filesAnalyzed).toBe(0);
    expect(result2.filesSkipped).toBe(1);
  });

  it('auto-detects workspaces and creates PACKAGE nodes for monorepo', async () => {
    await writeFile(
      join(tempDir, 'package.json'),
      JSON.stringify({ name: 'monorepo', workspaces: ['packages/*'] }),
    );

    await mkdir(join(tempDir, 'packages', 'core', 'src'), { recursive: true });
    await writeFile(
      join(tempDir, 'packages', 'core', 'package.json'),
      JSON.stringify({ name: '@mono/core' }),
    );
    await writeFile(
      join(tempDir, 'packages', 'core', 'src', 'CoreService.php'),
      `<?php
namespace Core;

class CoreService
{
    public function handle(): void {}
}
`,
    );

    await mkdir(join(tempDir, 'packages', 'api', 'src'), { recursive: true });
    await writeFile(
      join(tempDir, 'packages', 'api', 'package.json'),
      JSON.stringify({ name: '@mono/api' }),
    );
    await writeFile(
      join(tempDir, 'packages', 'api', 'src', 'ApiController.php'),
      `<?php
namespace Api;

class ApiController
{
    public function index(): void {}
}
`,
    );

    const result = await pipeline.analyze({
      rootDir: tempDir,
      projectName: 'MonoRepo',
      includePatterns: ['**/*.php'],
    });

    expect(result.filesAnalyzed).toBe(2);
    expect(result.errors).toHaveLength(0);

    const allNodes = await store.getAllNodes();
    const packageNodes = allNodes.filter((n) => n.type === NodeType.PACKAGE);
    expect(packageNodes.length).toBe(2);

    const packageNames = packageNodes.map((n) => n.qualifiedName).sort();
    expect(packageNames).toEqual(['@mono/api', '@mono/core']);

    const systemNode = allNodes.find((n) => n.type === NodeType.SYSTEM);
    expect(systemNode).toBeDefined();
    expect(systemNode!.qualifiedName).toBe('MonoRepo');

    const allEdges = await store.getAllEdges();
    const systemToPackageEdges = allEdges.filter(
      (e) => e.source === systemNode!.id && e.type === 'CONTAINS',
    );
    expect(systemToPackageEdges.length).toBeGreaterThanOrEqual(2);
  });

  it('returns analysis result with correct counts', async () => {
    await mkdir(join(tempDir, 'src'), { recursive: true });
    await writeFile(
      join(tempDir, 'src', 'Alpha.php'),
      `<?php
namespace App;

class Alpha
{
    public function run(): void {}
}
`,
    );
    await writeFile(
      join(tempDir, 'src', 'Beta.php'),
      `<?php
namespace App;

class Beta extends Alpha
{
    public function execute(): void {}
}
`,
    );

    const result = await pipeline.analyze({
      rootDir: tempDir,
      projectName: 'TestProject',
      includePatterns: ['**/*.php'],
    });

    expect(result.filesScanned).toBe(2);
    expect(result.filesAnalyzed).toBe(2);
    expect(result.filesFailed).toBe(0);
    expect(result.symbolsFound).toBeGreaterThanOrEqual(4);
    expect(result.referencesFound).toBeGreaterThanOrEqual(1);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.errors).toHaveLength(0);
  });
});
