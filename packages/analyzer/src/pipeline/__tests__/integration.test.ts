import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { GraphLevel, NodeType, EdgeType, createNodeId } from '@sniffo/core';
import { DuckDBGraphStore } from '@sniffo/storage';
import { AnalysisPipeline } from '../analysis-pipeline.js';
import { ParserRegistry } from '../../parsers/parser-registry.js';
import { PhpParser } from '../../parsers/php/php-parser.js';

const FIXTURE_DIR = join(import.meta.dirname, '../../../test/fixtures/php-symfony-project');

describe('Integration: multi-file PHP Symfony project', () => {
  let store: DuckDBGraphStore;
  let registry: ParserRegistry;
  let pipeline: AnalysisPipeline;

  beforeEach(async () => {
    store = new DuckDBGraphStore(':memory:');
    await store.initialize();
    registry = new ParserRegistry();
    await registry.register(new PhpParser());
    pipeline = new AnalysisPipeline(store, registry);
  });

  afterEach(async () => {
    registry.dispose();
    await store.close();
  });

  it('analyzes all fixture files without errors', async () => {
    const result = await pipeline.analyze({
      rootDir: FIXTURE_DIR,
      projectName: 'PhpSymfonyProject',
      includePatterns: ['**/*.php'],
    });

    expect(result.filesAnalyzed).toBeGreaterThanOrEqual(13);
    expect(result.filesFailed).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('extracts all expected classes, interfaces, traits, and enums', async () => {
    await pipeline.analyze({
      rootDir: FIXTURE_DIR,
      projectName: 'PhpSymfonyProject',
      includePatterns: ['**/*.php'],
    });

    const allNodes = await store.getAllNodes();
    const componentNodes = allNodes.filter((n) => n.level === GraphLevel.COMPONENT);
    const shortNames = componentNodes.map((n) => n.shortName);

    const expectedShortNames = [
      'User',
      'Order',
      'UserStatus',
      'OrderStatus',
      'TimestampableTrait',
      'BaseRepository',
      'UserRepository',
      'OrderRepository',
      'UserServiceInterface',
      'UserService',
      'OrderService',
      'UserController',
      'OrderController',
    ];

    for (const name of expectedShortNames) {
      expect(shortNames, `missing symbol: ${name}`).toContain(name);
    }
  });

  it('resolves EXTENDS edges', async () => {
    await pipeline.analyze({
      rootDir: FIXTURE_DIR,
      projectName: 'PhpSymfonyProject',
      includePatterns: ['**/*.php'],
    });

    const allEdges = await store.getAllEdges();
    const extendsEdges = allEdges.filter((e) => e.type === EdgeType.EXTENDS);

    const allNodes = await store.getAllNodes();
    const nodeIdByFqn = new Map(allNodes.map((n) => [n.id, n.qualifiedName]));

    const extendsPairs = extendsEdges.map((e) => ({
      source: nodeIdByFqn.get(e.source),
      target: nodeIdByFqn.get(e.target),
    }));

    expect(extendsPairs).toContainEqual({
      source: 'App\\Repository\\UserRepository',
      target: 'App\\Repository\\BaseRepository',
    });
    expect(extendsPairs).toContainEqual({
      source: 'App\\Repository\\OrderRepository',
      target: 'App\\Repository\\BaseRepository',
    });
  });

  it('resolves IMPLEMENTS edges', async () => {
    await pipeline.analyze({
      rootDir: FIXTURE_DIR,
      projectName: 'PhpSymfonyProject',
      includePatterns: ['**/*.php'],
    });

    const allEdges = await store.getAllEdges();
    const implementsEdges = allEdges.filter((e) => e.type === EdgeType.IMPLEMENTS);

    const allNodes = await store.getAllNodes();
    const nodeIdByFqn = new Map(allNodes.map((n) => [n.id, n.qualifiedName]));

    const implementsPairs = implementsEdges.map((e) => ({
      source: nodeIdByFqn.get(e.source),
      target: nodeIdByFqn.get(e.target),
    }));

    expect(implementsPairs).toContainEqual({
      source: 'App\\Service\\UserService',
      target: 'App\\Service\\UserServiceInterface',
    });
  });

  it('resolves USES_TRAIT edges', async () => {
    await pipeline.analyze({
      rootDir: FIXTURE_DIR,
      projectName: 'PhpSymfonyProject',
      includePatterns: ['**/*.php'],
    });

    const allEdges = await store.getAllEdges();
    const usesTraitEdges = allEdges.filter((e) => e.type === EdgeType.USES_TRAIT);

    const allNodes = await store.getAllNodes();
    const nodeIdByFqn = new Map(allNodes.map((n) => [n.id, n.qualifiedName]));

    const traitPairs = usesTraitEdges.map((e) => ({
      source: nodeIdByFqn.get(e.source),
      target: nodeIdByFqn.get(e.target),
    }));

    expect(traitPairs).toContainEqual({
      source: 'App\\Entity\\User',
      target: 'App\\Trait\\TimestampableTrait',
    });
  });

  it('resolves INJECTS edges for constructor dependencies', async () => {
    await pipeline.analyze({
      rootDir: FIXTURE_DIR,
      projectName: 'PhpSymfonyProject',
      includePatterns: ['**/*.php'],
    });

    const allEdges = await store.getAllEdges();
    const injectsEdges = allEdges.filter((e) => e.type === EdgeType.INJECTS);

    const allNodes = await store.getAllNodes();
    const nodeIdByFqn = new Map(allNodes.map((n) => [n.id, n.qualifiedName]));

    const injectsPairs = injectsEdges.map((e) => ({
      source: nodeIdByFqn.get(e.source),
      target: nodeIdByFqn.get(e.target),
    }));

    expect(injectsPairs).toContainEqual({
      source: 'App\\Service\\UserService',
      target: 'App\\Repository\\UserRepository',
    });
    expect(injectsPairs).toContainEqual({
      source: 'App\\Service\\OrderService',
      target: 'App\\Repository\\OrderRepository',
    });
    expect(injectsPairs).toContainEqual({
      source: 'App\\Controller\\UserController',
      target: 'App\\Service\\UserServiceInterface',
    });
    expect(injectsPairs).toContainEqual({
      source: 'App\\Controller\\OrderController',
      target: 'App\\Service\\OrderService',
    });
  });

  it('builds hierarchy with system node and container nodes', async () => {
    await pipeline.analyze({
      rootDir: FIXTURE_DIR,
      projectName: 'PhpSymfonyProject',
      includePatterns: ['**/*.php'],
    });

    const allNodes = await store.getAllNodes();

    const systemNode = allNodes.find((n) => n.type === NodeType.SYSTEM);
    expect(systemNode).toBeDefined();
    expect(systemNode!.qualifiedName).toBe('PhpSymfonyProject');
    expect(systemNode!.level).toBe(GraphLevel.SYSTEM);

    const containerNodes = allNodes.filter((n) => n.type === NodeType.MODULE);
    const containerNames = containerNodes.map((n) => n.shortName);

    expect(containerNames).toContain('Controller');
    expect(containerNames).toContain('Service');
    expect(containerNames).toContain('Repository');
    expect(containerNames).toContain('Entity');
  });

  it('creates CONTAINS edges through the hierarchy', async () => {
    await pipeline.analyze({
      rootDir: FIXTURE_DIR,
      projectName: 'PhpSymfonyProject',
      includePatterns: ['**/*.php'],
    });

    const allEdges = await store.getAllEdges();
    const containsEdges = allEdges.filter((e) => e.type === EdgeType.CONTAINS);

    expect(containsEdges.length).toBeGreaterThan(10);
  });

  it('completes analysis in under 30 seconds', async () => {
    const start = Date.now();

    await pipeline.analyze({
      rootDir: FIXTURE_DIR,
      projectName: 'PhpSymfonyProject',
      includePatterns: ['**/*.php'],
    });

    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(30_000);
  });

  it('achieves >= 90% accuracy on manually-verified relationships', async () => {
    await pipeline.analyze({
      rootDir: FIXTURE_DIR,
      projectName: 'PhpSymfonyProject',
      includePatterns: ['**/*.php'],
    });

    const allEdges = await store.getAllEdges();
    const allNodes = await store.getAllNodes();
    const nodeIdByFqn = new Map(allNodes.map((n) => [n.id, n.qualifiedName]));

    function hasEdge(type: EdgeType, sourceFqn: string, targetFqn: string): boolean {
      return allEdges.some((e) => {
        return (
          e.type === type &&
          nodeIdByFqn.get(e.source) === sourceFqn &&
          nodeIdByFqn.get(e.target) === targetFqn
        );
      });
    }

    const expectedRelationships = [
      { type: EdgeType.EXTENDS, source: 'App\\Repository\\UserRepository', target: 'App\\Repository\\BaseRepository' },
      { type: EdgeType.EXTENDS, source: 'App\\Repository\\OrderRepository', target: 'App\\Repository\\BaseRepository' },
      { type: EdgeType.IMPLEMENTS, source: 'App\\Service\\UserService', target: 'App\\Service\\UserServiceInterface' },
      { type: EdgeType.USES_TRAIT, source: 'App\\Entity\\User', target: 'App\\Trait\\TimestampableTrait' },
      { type: EdgeType.INJECTS, source: 'App\\Service\\UserService', target: 'App\\Repository\\UserRepository' },
      { type: EdgeType.INJECTS, source: 'App\\Service\\OrderService', target: 'App\\Repository\\OrderRepository' },
      { type: EdgeType.INJECTS, source: 'App\\Controller\\UserController', target: 'App\\Service\\UserServiceInterface' },
      { type: EdgeType.INJECTS, source: 'App\\Controller\\OrderController', target: 'App\\Service\\OrderService' },
    ];

    let found = 0;
    for (const rel of expectedRelationships) {
      if (hasEdge(rel.type, rel.source, rel.target)) {
        found++;
      }
    }

    const accuracy = found / expectedRelationships.length;
    expect(accuracy).toBeGreaterThanOrEqual(0.9);
  });
});
