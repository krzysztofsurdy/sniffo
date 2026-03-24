import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DuckDBGraphStore } from '@sniffo/storage';
import { GraphLevel, NodeType, EdgeType, createNodeId, createEdgeId } from '@sniffo/core';
import { computeBlastRadius } from '../blast-radius.js';

describe('computeBlastRadius', () => {
  let store: DuckDBGraphStore;
  const now = new Date().toISOString();

  const makeNode = (type: NodeType, fqn: string, filePath: string) => ({
    id: createNodeId(type, fqn), type,
    level: GraphLevel.COMPONENT,
    qualifiedName: fqn, shortName: fqn.split('\\').pop()!,
    filePath, startLine: 1, endLine: 10,
    contentHash: 'x', isStale: false, lastAnalyzedAt: now, metadata: {},
  });

  const makeEdge = (srcId: string, tgtId: string, type: EdgeType) => ({
    id: createEdgeId(srcId, tgtId, type),
    source: srcId, target: tgtId, type,
    level: GraphLevel.COMPONENT, weight: 1, metadata: {},
  });

  beforeEach(async () => {
    store = new DuckDBGraphStore(':memory:');
    await store.initialize();
  });

  afterEach(async () => { await store.close(); });

  it('finds direct dependents at depth 1', async () => {
    const a = makeNode(NodeType.CLASS, 'App\\A', 'a.php');
    const b = makeNode(NodeType.CLASS, 'App\\B', 'b.php');
    const c = makeNode(NodeType.CLASS, 'App\\C', 'c.php');
    await store.upsertNode(a);
    await store.upsertNode(b);
    await store.upsertNode(c);
    await store.upsertEdge(makeEdge(b.id, a.id, EdgeType.EXTENDS));
    await store.upsertEdge(makeEdge(c.id, a.id, EdgeType.INJECTS));

    const result = await computeBlastRadius(store, a.id, 1);
    expect(result.affectedNodes).toHaveLength(2);
    expect(result.affectedEdges.length).toBeGreaterThanOrEqual(2);
  });

  it('traverses transitive dependents at depth 2', async () => {
    const a = makeNode(NodeType.CLASS, 'App\\A', 'a.php');
    const b = makeNode(NodeType.CLASS, 'App\\B', 'b.php');
    const c = makeNode(NodeType.CLASS, 'App\\C', 'c.php');
    await store.upsertNode(a);
    await store.upsertNode(b);
    await store.upsertNode(c);
    await store.upsertEdge(makeEdge(b.id, a.id, EdgeType.EXTENDS));
    await store.upsertEdge(makeEdge(c.id, b.id, EdgeType.CALLS));

    const result = await computeBlastRadius(store, a.id, 2);
    expect(result.affectedNodes).toHaveLength(2);
  });

  it('respects max depth limit', async () => {
    const a = makeNode(NodeType.CLASS, 'App\\A', 'a.php');
    const b = makeNode(NodeType.CLASS, 'App\\B', 'b.php');
    const c = makeNode(NodeType.CLASS, 'App\\C', 'c.php');
    await store.upsertNode(a);
    await store.upsertNode(b);
    await store.upsertNode(c);
    await store.upsertEdge(makeEdge(b.id, a.id, EdgeType.EXTENDS));
    await store.upsertEdge(makeEdge(c.id, b.id, EdgeType.CALLS));

    const result = await computeBlastRadius(store, a.id, 1);
    expect(result.affectedNodes).toHaveLength(1);
  });
});
