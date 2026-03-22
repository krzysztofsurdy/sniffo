import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DuckDBGraphStore } from '@contextualizer/storage';
import { GraphLevel, NodeType, EdgeType, createNodeId, createEdgeId } from '@contextualizer/core';
import { createServer } from '../server.js';

describe('advanced HTTP routes', () => {
  let store: DuckDBGraphStore;
  const now = new Date().toISOString();

  const makeNode = (type: NodeType, fqn: string, level: GraphLevel) => ({
    id: createNodeId(type, fqn), type, level,
    qualifiedName: fqn, shortName: fqn.split('\\').pop()!,
    filePath: 'src/f.php', startLine: 1, endLine: 10,
    contentHash: 'x', isStale: false, lastAnalyzedAt: now, metadata: {},
  });

  beforeEach(async () => {
    store = new DuckDBGraphStore(':memory:');
    await store.initialize();
  });

  afterEach(async () => { await store.close(); });

  it('GET /api/node/:id/children returns children', async () => {
    const parent = makeNode(NodeType.CLASS, 'App\\Svc', GraphLevel.COMPONENT);
    const child = makeNode(NodeType.METHOD, 'App\\Svc::run', GraphLevel.CODE);
    await store.upsertNode(parent);
    await store.upsertNode(child);
    await store.upsertEdge({
      id: createEdgeId(parent.id, child.id, EdgeType.CONTAINS),
      source: parent.id, target: child.id, type: EdgeType.CONTAINS,
      level: GraphLevel.COMPONENT, weight: 1, metadata: {},
    });

    const app = await createServer({ store, projectDir: '/tmp' });
    const res = await app.inject({ method: 'GET', url: `/api/node/${parent.id}/children` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.children).toHaveLength(1);
  });

  it('GET /api/blast-radius/:id returns affected nodes', async () => {
    const a = makeNode(NodeType.CLASS, 'App\\A', GraphLevel.COMPONENT);
    const b = makeNode(NodeType.CLASS, 'App\\B', GraphLevel.COMPONENT);
    await store.upsertNode(a);
    await store.upsertNode(b);
    await store.upsertEdge({
      id: createEdgeId(b.id, a.id, EdgeType.EXTENDS),
      source: b.id, target: a.id, type: EdgeType.EXTENDS,
      level: GraphLevel.COMPONENT, weight: 1, metadata: {},
    });

    const app = await createServer({ store, projectDir: '/tmp' });
    const res = await app.inject({ method: 'GET', url: `/api/blast-radius/${a.id}?depth=1` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.affectedNodes).toHaveLength(1);
  });

  it('GET /api/cycles returns cycle list', async () => {
    const app = await createServer({ store, projectDir: '/tmp' });
    const res = await app.inject({ method: 'GET', url: '/api/cycles' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.cycles).toEqual([]);
  });
});
