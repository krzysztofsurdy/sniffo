import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DuckDBGraphStore } from '@contextualizer/storage';
import { GraphLevel, NodeType, createNodeId } from '@contextualizer/core';
import { createServer } from '../server.js';

describe('HTTP API', () => {
  let store: DuckDBGraphStore;

  beforeEach(async () => {
    store = new DuckDBGraphStore(':memory:');
    await store.initialize();
  });

  afterEach(async () => {
    await store.close();
  });

  it('GET /api/status returns staleness report', async () => {
    const app = await createServer({ store, projectDir: '/tmp' });
    const res = await app.inject({ method: 'GET', url: '/api/status' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('totalNodes');
  });

  it('GET /api/search returns results', async () => {
    await store.upsertNode({
      id: createNodeId(NodeType.CLASS, 'App\\Foo'),
      type: NodeType.CLASS,
      level: GraphLevel.COMPONENT,
      qualifiedName: 'App\\Foo',
      shortName: 'Foo',
      filePath: 'src/Foo.php',
      startLine: 1, endLine: 10,
      contentHash: 'x',
      isStale: false,
      lastAnalyzedAt: new Date().toISOString(),
      metadata: {},
    });

    const app = await createServer({ store, projectDir: '/tmp' });
    const res = await app.inject({ method: 'GET', url: '/api/search?q=Foo' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.length).toBeGreaterThan(0);
  });

  it('GET /api/node/:id returns node details', async () => {
    const id = createNodeId(NodeType.CLASS, 'App\\Bar');
    await store.upsertNode({
      id,
      type: NodeType.CLASS,
      level: GraphLevel.COMPONENT,
      qualifiedName: 'App\\Bar',
      shortName: 'Bar',
      filePath: 'src/Bar.php',
      startLine: 1, endLine: 10,
      contentHash: 'x',
      isStale: false,
      lastAnalyzedAt: new Date().toISOString(),
      metadata: {},
    });

    const app = await createServer({ store, projectDir: '/tmp' });
    const res = await app.inject({ method: 'GET', url: `/api/node/${id}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.node.qualifiedName).toBe('App\\Bar');
  });

  it('GET /api/node/:id returns 404 for unknown node', async () => {
    const app = await createServer({ store, projectDir: '/tmp' });
    const res = await app.inject({ method: 'GET', url: '/api/node/nonexistent' });
    expect(res.statusCode).toBe(404);
  });

  it('GET /api/graph/component returns component-level nodes', async () => {
    await store.upsertNode({
      id: createNodeId(NodeType.CLASS, 'App\\X'),
      type: NodeType.CLASS,
      level: GraphLevel.COMPONENT,
      qualifiedName: 'App\\X',
      shortName: 'X',
      filePath: 'src/X.php',
      startLine: 1, endLine: 5,
      contentHash: 'x',
      isStale: false,
      lastAnalyzedAt: new Date().toISOString(),
      metadata: {},
    });

    const app = await createServer({ store, projectDir: '/tmp' });
    const res = await app.inject({ method: 'GET', url: '/api/graph/component' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.nodes.length).toBeGreaterThan(0);
  });
});
