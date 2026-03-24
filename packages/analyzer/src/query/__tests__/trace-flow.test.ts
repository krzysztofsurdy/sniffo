import { describe, it, expect, beforeEach } from 'vitest';
import { DuckDBGraphStore } from '@sniffo/storage';
import { traceFlow } from '../trace-flow.js';
import { GraphLevel, EdgeType, NodeType, createNodeId, createEdgeId } from '@sniffo/core';
import type { StoredNode, StoredEdge } from '@sniffo/storage';

function makeNode(shortName: string, type: NodeType = NodeType.CLASS): StoredNode {
  return {
    id: createNodeId(type, shortName),
    type,
    level: GraphLevel.COMPONENT,
    qualifiedName: shortName,
    shortName,
    filePath: 'test.ts',
    startLine: 1,
    endLine: 10,
    contentHash: 'abc',
    isStale: false,
    lastAnalyzedAt: new Date().toISOString(),
    metadata: {},
  };
}

function makeEdge(source: string, target: string, type: EdgeType = EdgeType.CALLS): StoredEdge {
  return {
    id: createEdgeId(source, target, type),
    source,
    target,
    type,
    level: GraphLevel.COMPONENT,
    weight: 1,
    metadata: {},
  };
}

describe('traceFlow', () => {
  let store: DuckDBGraphStore;

  beforeEach(async () => {
    store = new DuckDBGraphStore(':memory:');
    await store.initialize();
  });

  it('traces outgoing CALLS from a root node', async () => {
    const controller = makeNode('PaymentController');
    const service = makeNode('PaymentService');
    const repo = makeNode('PaymentRepository');
    const unrelated = makeNode('UserService');

    await store.upsertNode(controller);
    await store.upsertNode(service);
    await store.upsertNode(repo);
    await store.upsertNode(unrelated);

    await store.upsertEdge(makeEdge(controller.id, service.id, EdgeType.CALLS));
    await store.upsertEdge(makeEdge(service.id, repo.id, EdgeType.CALLS));
    await store.upsertEdge(makeEdge(unrelated.id, repo.id, EdgeType.CALLS));

    const result = await traceFlow(store, controller.id, {
      edgeTypes: [EdgeType.CALLS],
      depth: 3,
      direction: 'outgoing',
    });

    expect(result.nodes).toHaveLength(3);
    expect(result.nodes.map(n => n.shortName).sort()).toEqual(
      ['PaymentController', 'PaymentRepository', 'PaymentService'],
    );
    expect(result.edges).toHaveLength(2);
    expect(result.rootId).toBe(controller.id);
  });

  it('traces incoming edges (dependents)', async () => {
    const repo = makeNode('PaymentRepository');
    const service = makeNode('PaymentService');
    const controller = makeNode('PaymentController');

    await store.upsertNode(repo);
    await store.upsertNode(service);
    await store.upsertNode(controller);

    await store.upsertEdge(makeEdge(controller.id, service.id, EdgeType.CALLS));
    await store.upsertEdge(makeEdge(service.id, repo.id, EdgeType.CALLS));

    const result = await traceFlow(store, repo.id, {
      edgeTypes: [EdgeType.CALLS],
      depth: 3,
      direction: 'incoming',
    });

    expect(result.nodes).toHaveLength(3);
    expect(result.edges).toHaveLength(2);
  });

  it('respects depth limit', async () => {
    const a = makeNode('A');
    const b = makeNode('B');
    const c = makeNode('C');

    await store.upsertNode(a);
    await store.upsertNode(b);
    await store.upsertNode(c);

    await store.upsertEdge(makeEdge(a.id, b.id));
    await store.upsertEdge(makeEdge(b.id, c.id));

    const result = await traceFlow(store, a.id, {
      edgeTypes: [EdgeType.CALLS],
      depth: 1,
      direction: 'outgoing',
    });

    expect(result.nodes).toHaveLength(2); // A and B only
    expect(result.edges).toHaveLength(1);
  });

  it('follows multiple edge types', async () => {
    const controller = makeNode('PaymentController');
    const service = makeNode('PaymentService');
    const iface = makeNode('PaymentGateway', NodeType.INTERFACE);

    await store.upsertNode(controller);
    await store.upsertNode(service);
    await store.upsertNode(iface);

    await store.upsertEdge(makeEdge(controller.id, service.id, EdgeType.CALLS));
    await store.upsertEdge(makeEdge(service.id, iface.id, EdgeType.IMPLEMENTS));

    const result = await traceFlow(store, controller.id, {
      edgeTypes: [EdgeType.CALLS, EdgeType.IMPLEMENTS],
      depth: 5,
      direction: 'outgoing',
    });

    expect(result.nodes).toHaveLength(3);
    expect(result.edges).toHaveLength(2);
  });

  it('traces both directions', async () => {
    const a = makeNode('A');
    const b = makeNode('B');
    const c = makeNode('C');

    await store.upsertNode(a);
    await store.upsertNode(b);
    await store.upsertNode(c);

    await store.upsertEdge(makeEdge(a.id, b.id));
    await store.upsertEdge(makeEdge(b.id, c.id));

    const result = await traceFlow(store, b.id, {
      edgeTypes: [EdgeType.CALLS],
      depth: 1,
      direction: 'both',
    });

    expect(result.nodes).toHaveLength(3); // A, B, C
    expect(result.edges).toHaveLength(2);
  });

  it('handles cycles without infinite loop', async () => {
    const a = makeNode('A');
    const b = makeNode('B');

    await store.upsertNode(a);
    await store.upsertNode(b);

    await store.upsertEdge(makeEdge(a.id, b.id));
    await store.upsertEdge(makeEdge(b.id, a.id));

    const result = await traceFlow(store, a.id, {
      edgeTypes: [EdgeType.CALLS],
      depth: 10,
      direction: 'outgoing',
    });

    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(2);
  });

  it('returns empty result for unknown root', async () => {
    const result = await traceFlow(store, 'nonexistent', {
      edgeTypes: [EdgeType.CALLS],
      depth: 3,
      direction: 'outgoing',
    });

    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });
});
