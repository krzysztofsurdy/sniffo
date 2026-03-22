import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GraphLevel, NodeType, EdgeType, createNodeId, createEdgeId } from '@contextualizer/core';
import type { GraphStore } from '../graph-store.js';

export function graphStoreContractTests(
  createStore: () => Promise<GraphStore>,
  destroyStore: (store: GraphStore) => Promise<void>,
) {
  let store: GraphStore;

  beforeEach(async () => {
    store = await createStore();
    await store.initialize();
  });

  afterEach(async () => {
    await destroyStore(store);
  });

  describe('nodes', () => {
    it('upserts and retrieves a node by id', async () => {
      const id = createNodeId(NodeType.CLASS, 'App\\Service\\UserService');
      await store.upsertNode({
        id,
        type: NodeType.CLASS,
        level: GraphLevel.COMPONENT,
        qualifiedName: 'App\\Service\\UserService',
        shortName: 'UserService',
        filePath: 'src/Service/UserService.php',
        startLine: 10,
        endLine: 50,
        contentHash: 'abc123',
        isStale: false,
        lastAnalyzedAt: new Date().toISOString(),
        metadata: { namespace: 'App\\Service', isAbstract: false, isFinal: false, visibility: null, loc: 40 },
      });

      const node = await store.getNodeById(id);
      expect(node).not.toBeNull();
      expect(node!.qualifiedName).toBe('App\\Service\\UserService');
      expect(node!.type).toBe(NodeType.CLASS);
    });

    it('returns null for non-existent node', async () => {
      const node = await store.getNodeById('nonexistent');
      expect(node).toBeNull();
    });

    it('overwrites node on second upsert', async () => {
      const id = createNodeId(NodeType.CLASS, 'App\\Foo');
      const base = {
        id,
        type: NodeType.CLASS as const,
        level: GraphLevel.COMPONENT as const,
        qualifiedName: 'App\\Foo',
        shortName: 'Foo',
        filePath: 'src/Foo.php',
        startLine: 1,
        endLine: 10,
        contentHash: 'v1',
        isStale: false,
        lastAnalyzedAt: new Date().toISOString(),
        metadata: {},
      };

      await store.upsertNode(base);
      await store.upsertNode({ ...base, contentHash: 'v2' });
      const node = await store.getNodeById(id);
      expect(node!.contentHash).toBe('v2');
    });

    it('removes nodes by file path', async () => {
      const id = createNodeId(NodeType.CLASS, 'App\\Bar');
      await store.upsertNode({
        id,
        type: NodeType.CLASS,
        level: GraphLevel.COMPONENT,
        qualifiedName: 'App\\Bar',
        shortName: 'Bar',
        filePath: 'src/Bar.php',
        startLine: 1,
        endLine: 5,
        contentHash: 'x',
        isStale: false,
        lastAnalyzedAt: new Date().toISOString(),
        metadata: {},
      });

      await store.removeNodesByFilePath('src/Bar.php');
      const node = await store.getNodeById(id);
      expect(node).toBeNull();
    });

    it('queries nodes by type', async () => {
      const id1 = createNodeId(NodeType.CLASS, 'App\\A');
      const id2 = createNodeId(NodeType.INTERFACE, 'App\\B');
      const base = {
        level: GraphLevel.COMPONENT as const,
        filePath: 'src/a.php',
        startLine: 1,
        endLine: 5,
        contentHash: 'x',
        isStale: false,
        lastAnalyzedAt: new Date().toISOString(),
        metadata: {},
      };
      await store.upsertNode({ ...base, id: id1, type: NodeType.CLASS, qualifiedName: 'App\\A', shortName: 'A' });
      await store.upsertNode({ ...base, id: id2, type: NodeType.INTERFACE, qualifiedName: 'App\\B', shortName: 'B' });

      const classes = await store.getNodesByType([NodeType.CLASS]);
      expect(classes).toHaveLength(1);
      expect(classes[0].shortName).toBe('A');
    });
  });

  describe('edges', () => {
    const nodeA = {
      id: createNodeId(NodeType.CLASS, 'App\\A'),
      type: NodeType.CLASS as const,
      level: GraphLevel.COMPONENT as const,
      qualifiedName: 'App\\A',
      shortName: 'A',
      filePath: 'src/A.php',
      startLine: 1,
      endLine: 5,
      contentHash: 'x',
      isStale: false,
      lastAnalyzedAt: new Date().toISOString(),
      metadata: {},
    };
    const nodeB = {
      id: createNodeId(NodeType.CLASS, 'App\\B'),
      type: NodeType.CLASS as const,
      level: GraphLevel.COMPONENT as const,
      qualifiedName: 'App\\B',
      shortName: 'B',
      filePath: 'src/B.php',
      startLine: 1,
      endLine: 5,
      contentHash: 'y',
      isStale: false,
      lastAnalyzedAt: new Date().toISOString(),
      metadata: {},
    };

    it('upserts and retrieves edges', async () => {
      await store.upsertNode(nodeA);
      await store.upsertNode(nodeB);

      const edgeId = createEdgeId(nodeA.id, nodeB.id, EdgeType.EXTENDS);
      await store.upsertEdge({
        id: edgeId,
        source: nodeA.id,
        target: nodeB.id,
        type: EdgeType.EXTENDS,
        level: GraphLevel.COMPONENT,
        weight: 1.0,
        metadata: {},
      });

      const outgoing = await store.getOutgoingEdges(nodeA.id);
      expect(outgoing).toHaveLength(1);
      expect(outgoing[0].type).toBe(EdgeType.EXTENDS);

      const incoming = await store.getIncomingEdges(nodeB.id);
      expect(incoming).toHaveLength(1);
    });

    it('removes edges by source node file path', async () => {
      await store.upsertNode(nodeA);
      await store.upsertNode(nodeB);
      const edgeId = createEdgeId(nodeA.id, nodeB.id, EdgeType.CALLS);
      await store.upsertEdge({
        id: edgeId,
        source: nodeA.id,
        target: nodeB.id,
        type: EdgeType.CALLS,
        level: GraphLevel.COMPONENT,
        weight: 1.0,
        metadata: {},
      });

      await store.removeEdgesBySourceFilePath('src/A.php');
      const outgoing = await store.getOutgoingEdges(nodeA.id);
      expect(outgoing).toHaveLength(0);
    });
  });

  describe('file hashes', () => {
    it('stores and retrieves file hashes', async () => {
      await store.setFileHash('src/Foo.php', 'hash123', 1024);
      const hash = await store.getFileHash('src/Foo.php');
      expect(hash).toBe('hash123');
    });

    it('returns null for unknown file', async () => {
      const hash = await store.getFileHash('nonexistent.php');
      expect(hash).toBeNull();
    });

    it('returns all tracked file paths', async () => {
      await store.setFileHash('src/A.php', 'h1', 100);
      await store.setFileHash('src/B.php', 'h2', 200);
      const paths = await store.getAllTrackedPaths();
      expect(paths.sort()).toEqual(['src/A.php', 'src/B.php']);
    });

    it('removes file hash entry', async () => {
      await store.setFileHash('src/X.php', 'hx', 50);
      await store.removeFileHash('src/X.php');
      const hash = await store.getFileHash('src/X.php');
      expect(hash).toBeNull();
    });
  });

  describe('symbol index', () => {
    it('builds index and looks up by FQN', async () => {
      const id = createNodeId(NodeType.CLASS, 'App\\Service\\UserService');
      await store.upsertNode({
        id,
        type: NodeType.CLASS,
        level: GraphLevel.COMPONENT,
        qualifiedName: 'App\\Service\\UserService',
        shortName: 'UserService',
        filePath: 'src/Service/UserService.php',
        startLine: 1,
        endLine: 50,
        contentHash: 'abc',
        isStale: false,
        lastAnalyzedAt: new Date().toISOString(),
        metadata: {},
      });

      const result = await store.getNodeByQualifiedName('App\\Service\\UserService');
      expect(result).not.toBeNull();
      expect(result!.id).toBe(id);
    });

    it('finds candidates by short name', async () => {
      const id1 = createNodeId(NodeType.CLASS, 'App\\A\\Foo');
      const id2 = createNodeId(NodeType.CLASS, 'App\\B\\Foo');
      const base = {
        type: NodeType.CLASS as const,
        level: GraphLevel.COMPONENT as const,
        filePath: 'src/a.php',
        startLine: 1,
        endLine: 5,
        contentHash: 'x',
        isStale: false,
        lastAnalyzedAt: new Date().toISOString(),
        metadata: {},
      };
      await store.upsertNode({ ...base, id: id1, qualifiedName: 'App\\A\\Foo', shortName: 'Foo' });
      await store.upsertNode({ ...base, id: id2, qualifiedName: 'App\\B\\Foo', shortName: 'Foo', filePath: 'src/b.php' });

      const candidates = await store.getNodesByShortName('Foo');
      expect(candidates).toHaveLength(2);
    });
  });
}
