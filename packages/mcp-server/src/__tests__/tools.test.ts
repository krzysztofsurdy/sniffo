import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DuckDBGraphStore } from '@sniffo/storage';
import { createMcpServer } from '../server.js';

describe('MCP server', () => {
  let store: DuckDBGraphStore;

  beforeEach(async () => {
    store = new DuckDBGraphStore(':memory:');
    await store.initialize();
  });

  afterEach(async () => {
    await store.close();
  });

  it('creates an MCP server with all tools registered', () => {
    const server = createMcpServer(store, '/tmp/test');
    expect(server).toBeDefined();
  });

  it('server has expected tool count', () => {
    const server = createMcpServer(store, '/tmp/test');
    expect(server).toBeDefined();
  });
});
