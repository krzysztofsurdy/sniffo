import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DuckDBGraphStore } from '@sniffo/storage';
import { GraphLevel, NodeType, EdgeType, createNodeId, createEdgeId } from '@sniffo/core';
import { cascadeInvalidation, type InvalidationResult } from '../cascade-invalidator.js';

describe('cascadeInvalidation', () => {
  let store: DuckDBGraphStore;

  const now = new Date().toISOString();
  const makeNode = (type: NodeType, fqn: string, filePath: string) => ({
    id: createNodeId(type, fqn),
    type,
    level: GraphLevel.COMPONENT,
    qualifiedName: fqn,
    shortName: fqn.split('\\').pop()!,
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

  it('marks direct dependents as stale when target file changes', async () => {
    const nodeA = makeNode(NodeType.CLASS, 'App\\A', 'src/A.php');
    const nodeB = makeNode(NodeType.CLASS, 'App\\B', 'src/B.php');
    await store.upsertNode(nodeA);
    await store.upsertNode(nodeB);
    await store.upsertEdge(makeEdge(nodeA.id, nodeB.id, EdgeType.EXTENDS));

    const result = await cascadeInvalidation(store, ['src/B.php']);

    expect(result.directlyChanged).toContain(nodeB.id);
    expect(result.cascadeInvalidated).toContain(nodeA.id);

    const updatedA = await store.getNodeById(nodeA.id);
    expect(updatedA!.isStale).toBe(true);
  });

  it('cascades through structural edges (EXTENDS, IMPLEMENTS, USES_TRAIT)', async () => {
    const nodeA = makeNode(NodeType.CLASS, 'App\\A', 'src/A.php');
    const nodeB = makeNode(NodeType.CLASS, 'App\\B', 'src/B.php');
    const nodeC = makeNode(NodeType.CLASS, 'App\\C', 'src/C.php');
    await store.upsertNode(nodeA);
    await store.upsertNode(nodeB);
    await store.upsertNode(nodeC);
    await store.upsertEdge(makeEdge(nodeB.id, nodeA.id, EdgeType.EXTENDS));
    await store.upsertEdge(makeEdge(nodeC.id, nodeB.id, EdgeType.EXTENDS));

    const result = await cascadeInvalidation(store, ['src/A.php']);

    expect(result.cascadeInvalidated).toContain(nodeB.id);
    expect(result.cascadeInvalidated).toContain(nodeC.id);
  });

  it('does NOT cascade through CALLS edges', async () => {
    const nodeA = makeNode(NodeType.CLASS, 'App\\A', 'src/A.php');
    const nodeB = makeNode(NodeType.CLASS, 'App\\B', 'src/B.php');
    const nodeD = makeNode(NodeType.CLASS, 'App\\D', 'src/D.php');
    await store.upsertNode(nodeA);
    await store.upsertNode(nodeB);
    await store.upsertNode(nodeD);
    await store.upsertEdge(makeEdge(nodeB.id, nodeA.id, EdgeType.CALLS));
    await store.upsertEdge(makeEdge(nodeD.id, nodeB.id, EdgeType.EXTENDS));

    const result = await cascadeInvalidation(store, ['src/A.php']);

    expect(result.cascadeInvalidated).toContain(nodeB.id);
    expect(result.cascadeInvalidated).not.toContain(nodeD.id);
  });

  it('limits cascade to MAX_DEPTH of 2', async () => {
    const nodeA = makeNode(NodeType.CLASS, 'App\\A', 'src/A.php');
    const nodeB = makeNode(NodeType.CLASS, 'App\\B', 'src/B.php');
    const nodeC = makeNode(NodeType.CLASS, 'App\\C', 'src/C.php');
    const nodeD = makeNode(NodeType.CLASS, 'App\\D', 'src/D.php');
    const nodeE = makeNode(NodeType.CLASS, 'App\\E', 'src/E.php');
    await store.upsertNode(nodeA);
    await store.upsertNode(nodeB);
    await store.upsertNode(nodeC);
    await store.upsertNode(nodeD);
    await store.upsertNode(nodeE);
    await store.upsertEdge(makeEdge(nodeB.id, nodeA.id, EdgeType.EXTENDS));
    await store.upsertEdge(makeEdge(nodeC.id, nodeB.id, EdgeType.EXTENDS));
    await store.upsertEdge(makeEdge(nodeD.id, nodeC.id, EdgeType.EXTENDS));
    await store.upsertEdge(makeEdge(nodeE.id, nodeD.id, EdgeType.EXTENDS));

    const result = await cascadeInvalidation(store, ['src/A.php']);

    expect(result.cascadeInvalidated).toContain(nodeB.id);
    expect(result.cascadeInvalidated).toContain(nodeC.id);
    expect(result.cascadeInvalidated).not.toContain(nodeD.id);
    expect(result.cascadeInvalidated).not.toContain(nodeE.id);
    expect(result.stats.cascadeDepth).toBeLessThanOrEqual(2);
  });

  it('returns empty result when no dependents exist', async () => {
    const nodeA = makeNode(NodeType.CLASS, 'App\\A', 'src/A.php');
    await store.upsertNode(nodeA);

    const result = await cascadeInvalidation(store, ['src/A.php']);

    expect(result.directlyChanged.length).toBeGreaterThan(0);
    expect(result.cascadeInvalidated).toHaveLength(0);
  });

  it('handles multiple changed files at once', async () => {
    const nodeA = makeNode(NodeType.CLASS, 'App\\A', 'src/A.php');
    const nodeB = makeNode(NodeType.CLASS, 'App\\B', 'src/B.php');
    const nodeC = makeNode(NodeType.CLASS, 'App\\C', 'src/C.php');
    await store.upsertNode(nodeA);
    await store.upsertNode(nodeB);
    await store.upsertNode(nodeC);
    await store.upsertEdge(makeEdge(nodeC.id, nodeA.id, EdgeType.IMPLEMENTS));
    await store.upsertEdge(makeEdge(nodeC.id, nodeB.id, EdgeType.USES_TRAIT));

    const result = await cascadeInvalidation(store, ['src/A.php', 'src/B.php']);

    expect(result.directlyChanged).toContain(nodeA.id);
    expect(result.directlyChanged).toContain(nodeB.id);
    expect(result.cascadeInvalidated).toContain(nodeC.id);
  });
});
