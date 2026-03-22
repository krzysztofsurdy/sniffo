import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DuckDBGraphStore } from '@contextualizer/storage';
import { GraphLevel, NodeType, EdgeType, createNodeId, createEdgeId } from '@contextualizer/core';
import { detectCycles } from '../cycle-detector.js';

describe('detectCycles', () => {
  let store: DuckDBGraphStore;
  const now = new Date().toISOString();

  const makeNode = (type: NodeType, fqn: string) => ({
    id: createNodeId(type, fqn), type,
    level: GraphLevel.COMPONENT,
    qualifiedName: fqn, shortName: fqn.split('\\').pop()!,
    filePath: 'src/f.php', startLine: 1, endLine: 10,
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

  it('detects a simple A->B->A cycle', async () => {
    const a = makeNode(NodeType.CLASS, 'App\\A');
    const b = makeNode(NodeType.CLASS, 'App\\B');
    await store.upsertNode(a);
    await store.upsertNode(b);
    await store.upsertEdge(makeEdge(a.id, b.id, EdgeType.DEPENDS_ON));
    await store.upsertEdge(makeEdge(b.id, a.id, EdgeType.DEPENDS_ON));

    const cycles = await detectCycles(store);
    expect(cycles.length).toBeGreaterThanOrEqual(1);
    expect(cycles[0].length).toBe(2);
  });

  it('detects a 3-node cycle A->B->C->A', async () => {
    const a = makeNode(NodeType.CLASS, 'App\\A');
    const b = makeNode(NodeType.CLASS, 'App\\B');
    const c = makeNode(NodeType.CLASS, 'App\\C');
    await store.upsertNode(a);
    await store.upsertNode(b);
    await store.upsertNode(c);
    await store.upsertEdge(makeEdge(a.id, b.id, EdgeType.DEPENDS_ON));
    await store.upsertEdge(makeEdge(b.id, c.id, EdgeType.DEPENDS_ON));
    await store.upsertEdge(makeEdge(c.id, a.id, EdgeType.DEPENDS_ON));

    const cycles = await detectCycles(store);
    expect(cycles.length).toBeGreaterThanOrEqual(1);
  });

  it('returns empty array for acyclic graph', async () => {
    const a = makeNode(NodeType.CLASS, 'App\\A');
    const b = makeNode(NodeType.CLASS, 'App\\B');
    await store.upsertNode(a);
    await store.upsertNode(b);
    await store.upsertEdge(makeEdge(a.id, b.id, EdgeType.EXTENDS));

    const cycles = await detectCycles(store);
    expect(cycles).toHaveLength(0);
  });
});
