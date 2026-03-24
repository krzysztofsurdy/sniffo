import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DuckDBGraphStore } from '@sniffo/storage';
import { GraphLevel, NodeType, createNodeId } from '@sniffo/core';
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

  it('GET /api/workspaces returns null for non-monorepo', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'ws-test-'));
    try {
      const app = await createServer({ store, projectDir: tempDir });
      const res = await app.inject({ method: 'GET', url: '/api/workspaces' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeNull();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('GET /api/workspaces returns workspace info for pnpm monorepo', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'ws-test-'));
    try {
      writeFileSync(join(tempDir, 'pnpm-workspace.yaml'), 'packages:\n  - "packages/*"\n');
      const pkgDir = join(tempDir, 'packages', 'my-pkg');
      mkdirSync(pkgDir, { recursive: true });
      writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({ name: '@test/my-pkg' }));

      const app = await createServer({ store, projectDir: tempDir });
      const res = await app.inject({ method: 'GET', url: '/api/workspaces' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data).not.toBeNull();
      expect(body.data.type).toBe('pnpm');
      expect(body.data.packages).toHaveLength(1);
      expect(body.data.packages[0].name).toBe('@test/my-pkg');
      expect(body.data.packages[0].path).toBe('packages/my-pkg');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
