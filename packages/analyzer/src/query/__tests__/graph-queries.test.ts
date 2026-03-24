import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DuckDBGraphStore } from '@sniffo/storage';
import { GraphLevel, NodeType, EdgeType, createNodeId, createEdgeId } from '@sniffo/core';
import {
  findReferences,
  findDependencies,
  findDependents,
  searchSymbols,
} from '../graph-queries.js';

describe('graph queries', () => {
  let store: DuckDBGraphStore;
  const now = new Date().toISOString();

  const makeNode = (type: NodeType, fqn: string, filePath: string) => ({
    id: createNodeId(type, fqn),
    type,
    level: GraphLevel.COMPONENT,
    qualifiedName: fqn,
    shortName: fqn.split('\\').pop()!.split('::').pop()!,
    filePath,
    startLine: 1,
    endLine: 10,
    contentHash: 'x',
    isStale: false,
    lastAnalyzedAt: now,
    metadata: {},
  });

  const makeEdge = (srcId: string, tgtId: string, type: EdgeType) => ({
    id: createEdgeId(srcId, tgtId, type),
    source: srcId,
    target: tgtId,
    type,
    level: GraphLevel.COMPONENT,
    weight: 1.0,
    metadata: {},
  });

  beforeEach(async () => {
    store = new DuckDBGraphStore(':memory:');
    await store.initialize();
  });

  afterEach(async () => {
    await store.close();
  });

  describe('searchSymbols', () => {
    it('finds symbols by short name substring', async () => {
      await store.upsertNode(makeNode(NodeType.CLASS, 'App\\Service\\UserService', 'src/UserService.php'));
      await store.upsertNode(makeNode(NodeType.CLASS, 'App\\Service\\OrderService', 'src/OrderService.php'));

      const results = await searchSymbols(store, 'User');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].qualifiedName).toContain('User');
    });

    it('finds symbols by FQN substring', async () => {
      await store.upsertNode(makeNode(NodeType.CLASS, 'App\\Service\\UserService', 'src/UserService.php'));

      const results = await searchSymbols(store, 'App\\Service');
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('filters by node type', async () => {
      await store.upsertNode(makeNode(NodeType.CLASS, 'App\\Foo', 'src/Foo.php'));
      await store.upsertNode(makeNode(NodeType.INTERFACE, 'App\\FooInterface', 'src/FooInterface.php'));

      const results = await searchSymbols(store, 'Foo', [NodeType.INTERFACE]);
      expect(results).toHaveLength(1);
      expect(results[0].type).toBe(NodeType.INTERFACE);
    });
  });

  describe('findReferences', () => {
    it('finds all incoming edges to a symbol', async () => {
      const nodeA = makeNode(NodeType.CLASS, 'App\\A', 'src/A.php');
      const nodeB = makeNode(NodeType.CLASS, 'App\\B', 'src/B.php');
      const nodeC = makeNode(NodeType.CLASS, 'App\\C', 'src/C.php');
      await store.upsertNode(nodeA);
      await store.upsertNode(nodeB);
      await store.upsertNode(nodeC);
      await store.upsertEdge(makeEdge(nodeB.id, nodeA.id, EdgeType.EXTENDS));
      await store.upsertEdge(makeEdge(nodeC.id, nodeA.id, EdgeType.INJECTS));

      const refs = await findReferences(store, 'App\\A');
      expect(refs).toHaveLength(2);
    });

    it('filters by edge type', async () => {
      const nodeA = makeNode(NodeType.CLASS, 'App\\A', 'src/A.php');
      const nodeB = makeNode(NodeType.CLASS, 'App\\B', 'src/B.php');
      const nodeC = makeNode(NodeType.CLASS, 'App\\C', 'src/C.php');
      await store.upsertNode(nodeA);
      await store.upsertNode(nodeB);
      await store.upsertNode(nodeC);
      await store.upsertEdge(makeEdge(nodeB.id, nodeA.id, EdgeType.EXTENDS));
      await store.upsertEdge(makeEdge(nodeC.id, nodeA.id, EdgeType.INJECTS));

      const refs = await findReferences(store, 'App\\A', [EdgeType.EXTENDS]);
      expect(refs).toHaveLength(1);
      expect(refs[0].edgeType).toBe(EdgeType.EXTENDS);
    });
  });

  describe('findDependencies', () => {
    it('finds outgoing edges from a symbol', async () => {
      const nodeA = makeNode(NodeType.CLASS, 'App\\A', 'src/A.php');
      const nodeB = makeNode(NodeType.CLASS, 'App\\B', 'src/B.php');
      await store.upsertNode(nodeA);
      await store.upsertNode(nodeB);
      await store.upsertEdge(makeEdge(nodeA.id, nodeB.id, EdgeType.EXTENDS));

      const deps = await findDependencies(store, 'App\\A');
      expect(deps).toHaveLength(1);
      expect(deps[0].target.qualifiedName).toBe('App\\B');
    });
  });

  describe('findDependents', () => {
    it('finds nodes that depend on a symbol (depth 1)', async () => {
      const nodeA = makeNode(NodeType.CLASS, 'App\\A', 'src/A.php');
      const nodeB = makeNode(NodeType.CLASS, 'App\\B', 'src/B.php');
      const nodeC = makeNode(NodeType.CLASS, 'App\\C', 'src/C.php');
      await store.upsertNode(nodeA);
      await store.upsertNode(nodeB);
      await store.upsertNode(nodeC);
      await store.upsertEdge(makeEdge(nodeB.id, nodeA.id, EdgeType.EXTENDS));
      await store.upsertEdge(makeEdge(nodeC.id, nodeA.id, EdgeType.INJECTS));

      const dependents = await findDependents(store, 'App\\A', 1);
      expect(dependents).toHaveLength(2);
    });

    it('traverses multiple hops with depth > 1', async () => {
      const nodeA = makeNode(NodeType.CLASS, 'App\\A', 'src/A.php');
      const nodeB = makeNode(NodeType.CLASS, 'App\\B', 'src/B.php');
      const nodeC = makeNode(NodeType.CLASS, 'App\\C', 'src/C.php');
      await store.upsertNode(nodeA);
      await store.upsertNode(nodeB);
      await store.upsertNode(nodeC);
      await store.upsertEdge(makeEdge(nodeB.id, nodeA.id, EdgeType.EXTENDS));
      await store.upsertEdge(makeEdge(nodeC.id, nodeB.id, EdgeType.EXTENDS));

      const dependents = await findDependents(store, 'App\\A', 2);
      expect(dependents).toHaveLength(2);
      const names = dependents.map(d => d.qualifiedName).sort();
      expect(names).toEqual(['App\\B', 'App\\C']);
    });
  });
});
