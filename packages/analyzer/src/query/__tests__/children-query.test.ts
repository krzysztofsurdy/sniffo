import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DuckDBGraphStore } from '@contextualizer/storage';
import { GraphLevel, NodeType, EdgeType, createNodeId, createEdgeId } from '@contextualizer/core';
import { findChildren } from '../children-query.js';

describe('findChildren', () => {
  let store: DuckDBGraphStore;
  const now = new Date().toISOString();

  const makeNode = (type: NodeType, fqn: string, level: GraphLevel, filePath: string) => ({
    id: createNodeId(type, fqn), type, level,
    qualifiedName: fqn,
    shortName: fqn.split('\\').pop()!.split('::').pop()!,
    filePath, startLine: 1, endLine: 10,
    contentHash: 'x', isStale: false, lastAnalyzedAt: now, metadata: {},
  });

  beforeEach(async () => {
    store = new DuckDBGraphStore(':memory:');
    await store.initialize();
  });

  afterEach(async () => { await store.close(); });

  it('finds children connected by CONTAINS edges', async () => {
    const parent = makeNode(NodeType.CLASS, 'App\\UserService', GraphLevel.COMPONENT, 'src/UserService.php');
    const child1 = makeNode(NodeType.METHOD, 'App\\UserService::findUser', GraphLevel.CODE, 'src/UserService.php');
    const child2 = makeNode(NodeType.METHOD, 'App\\UserService::createUser', GraphLevel.CODE, 'src/UserService.php');
    await store.upsertNode(parent);
    await store.upsertNode(child1);
    await store.upsertNode(child2);
    await store.upsertEdge({
      id: createEdgeId(parent.id, child1.id, EdgeType.CONTAINS),
      source: parent.id, target: child1.id, type: EdgeType.CONTAINS,
      level: GraphLevel.COMPONENT, weight: 1, metadata: {},
    });
    await store.upsertEdge({
      id: createEdgeId(parent.id, child2.id, EdgeType.CONTAINS),
      source: parent.id, target: child2.id, type: EdgeType.CONTAINS,
      level: GraphLevel.COMPONENT, weight: 1, metadata: {},
    });

    const result = await findChildren(store, parent.id);
    expect(result.children).toHaveLength(2);
    expect(result.children.map(c => c.shortName).sort()).toEqual(['createUser', 'findUser']);
  });

  it('returns edges between children', async () => {
    const parent = makeNode(NodeType.CLASS, 'App\\UserService', GraphLevel.COMPONENT, 'src/UserService.php');
    const child1 = makeNode(NodeType.METHOD, 'App\\UserService::findUser', GraphLevel.CODE, 'src/UserService.php');
    const child2 = makeNode(NodeType.METHOD, 'App\\UserService::validate', GraphLevel.CODE, 'src/UserService.php');
    await store.upsertNode(parent);
    await store.upsertNode(child1);
    await store.upsertNode(child2);
    await store.upsertEdge({
      id: createEdgeId(parent.id, child1.id, EdgeType.CONTAINS),
      source: parent.id, target: child1.id, type: EdgeType.CONTAINS,
      level: GraphLevel.COMPONENT, weight: 1, metadata: {},
    });
    await store.upsertEdge({
      id: createEdgeId(parent.id, child2.id, EdgeType.CONTAINS),
      source: parent.id, target: child2.id, type: EdgeType.CONTAINS,
      level: GraphLevel.COMPONENT, weight: 1, metadata: {},
    });
    await store.upsertEdge({
      id: createEdgeId(child1.id, child2.id, EdgeType.CALLS),
      source: child1.id, target: child2.id, type: EdgeType.CALLS,
      level: GraphLevel.CODE, weight: 1, metadata: {},
    });

    const result = await findChildren(store, parent.id);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].type).toBe(EdgeType.CALLS);
  });

  it('returns empty for node with no children', async () => {
    const leaf = makeNode(NodeType.METHOD, 'App\\Foo::bar', GraphLevel.CODE, 'src/Foo.php');
    await store.upsertNode(leaf);
    const result = await findChildren(store, leaf.id);
    expect(result.children).toHaveLength(0);
  });
});
