# Phase 4: MCP Server and CLI Completion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver the MCP server so Claude Code can query the knowledge graph, add `lpc init` and `lpc serve` CLI commands, and build the Fastify HTTP API.

**Architecture:** New `@contextualizer/mcp-server` package using @modelcontextprotocol/sdk. New `@contextualizer/web-server` package using Fastify. Extend CLI with `init` and `serve` commands. Graph query helpers in analyzer package. Embeddings/semantic search deferred to a future phase.

**Tech Stack:** @modelcontextprotocol/sdk, Fastify, zod, existing DuckDB store + pipeline

**Reference docs:**
- `docs/backend-specification.md` lines 1070-1256 -- MCP tool definitions
- `docs/backend-specification.md` lines 828-1060 -- HTTP API specification
- `docs/delivery-plan.md` lines 110-147 -- Phase 4 definition of done

---

## Task 1: Graph query helpers

**Files:**
- Create: `packages/analyzer/src/query/graph-queries.ts`
- Create: `packages/analyzer/src/query/__tests__/graph-queries.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/analyzer/src/query/__tests__/graph-queries.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DuckDBGraphStore } from '@contextualizer/storage';
import { GraphLevel, NodeType, EdgeType, createNodeId, createEdgeId } from '@contextualizer/core';
import {
  findReferences,
  findDependencies,
  findDependents,
  searchSymbols,
} from '../graph-queries.js';

describe('graph queries', () => {
  let store: DuckDBGraphStore;
  const now = new Date().toISOString();

  const makeNode = (type: NodeType, fqn: string, filePath: string) => ({
    id: createNodeId(type, fqn),
    type,
    level: GraphLevel.COMPONENT,
    qualifiedName: fqn,
    shortName: fqn.split('\\').pop()!.split('::').pop()!,
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

  describe('searchSymbols', () => {
    it('finds symbols by short name substring', async () => {
      await store.upsertNode(makeNode(NodeType.CLASS, 'App\\Service\\UserService', 'src/UserService.php'));
      await store.upsertNode(makeNode(NodeType.CLASS, 'App\\Service\\OrderService', 'src/OrderService.php'));

      const results = await searchSymbols(store, 'User');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].qualifiedName).toContain('User');
    });

    it('finds symbols by FQN substring', async () => {
      await store.upsertNode(makeNode(NodeType.CLASS, 'App\\Service\\UserService', 'src/UserService.php'));

      const results = await searchSymbols(store, 'App\\Service');
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('filters by node type', async () => {
      await store.upsertNode(makeNode(NodeType.CLASS, 'App\\Foo', 'src/Foo.php'));
      await store.upsertNode(makeNode(NodeType.INTERFACE, 'App\\FooInterface', 'src/FooInterface.php'));

      const results = await searchSymbols(store, 'Foo', [NodeType.INTERFACE]);
      expect(results).toHaveLength(1);
      expect(results[0].type).toBe(NodeType.INTERFACE);
    });
  });

  describe('findReferences', () => {
    it('finds all incoming edges to a symbol', async () => {
      const nodeA = makeNode(NodeType.CLASS, 'App\\A', 'src/A.php');
      const nodeB = makeNode(NodeType.CLASS, 'App\\B', 'src/B.php');
      const nodeC = makeNode(NodeType.CLASS, 'App\\C', 'src/C.php');
      await store.upsertNode(nodeA);
      await store.upsertNode(nodeB);
      await store.upsertNode(nodeC);
      await store.upsertEdge(makeEdge(nodeB.id, nodeA.id, EdgeType.EXTENDS));
      await store.upsertEdge(makeEdge(nodeC.id, nodeA.id, EdgeType.INJECTS));

      const refs = await findReferences(store, 'App\\A');
      expect(refs).toHaveLength(2);
    });

    it('filters by edge type', async () => {
      const nodeA = makeNode(NodeType.CLASS, 'App\\A', 'src/A.php');
      const nodeB = makeNode(NodeType.CLASS, 'App\\B', 'src/B.php');
      const nodeC = makeNode(NodeType.CLASS, 'App\\C', 'src/C.php');
      await store.upsertNode(nodeA);
      await store.upsertNode(nodeB);
      await store.upsertNode(nodeC);
      await store.upsertEdge(makeEdge(nodeB.id, nodeA.id, EdgeType.EXTENDS));
      await store.upsertEdge(makeEdge(nodeC.id, nodeA.id, EdgeType.INJECTS));

      const refs = await findReferences(store, 'App\\A', [EdgeType.EXTENDS]);
      expect(refs).toHaveLength(1);
      expect(refs[0].edgeType).toBe(EdgeType.EXTENDS);
    });
  });

  describe('findDependencies', () => {
    it('finds outgoing edges from a symbol', async () => {
      const nodeA = makeNode(NodeType.CLASS, 'App\\A', 'src/A.php');
      const nodeB = makeNode(NodeType.CLASS, 'App\\B', 'src/B.php');
      await store.upsertNode(nodeA);
      await store.upsertNode(nodeB);
      await store.upsertEdge(makeEdge(nodeA.id, nodeB.id, EdgeType.EXTENDS));

      const deps = await findDependencies(store, 'App\\A');
      expect(deps).toHaveLength(1);
      expect(deps[0].target.qualifiedName).toBe('App\\B');
    });
  });

  describe('findDependents', () => {
    it('finds nodes that depend on a symbol (depth 1)', async () => {
      const nodeA = makeNode(NodeType.CLASS, 'App\\A', 'src/A.php');
      const nodeB = makeNode(NodeType.CLASS, 'App\\B', 'src/B.php');
      const nodeC = makeNode(NodeType.CLASS, 'App\\C', 'src/C.php');
      await store.upsertNode(nodeA);
      await store.upsertNode(nodeB);
      await store.upsertNode(nodeC);
      await store.upsertEdge(makeEdge(nodeB.id, nodeA.id, EdgeType.EXTENDS));
      await store.upsertEdge(makeEdge(nodeC.id, nodeA.id, EdgeType.INJECTS));

      const dependents = await findDependents(store, 'App\\A', 1);
      expect(dependents).toHaveLength(2);
    });

    it('traverses multiple hops with depth > 1', async () => {
      const nodeA = makeNode(NodeType.CLASS, 'App\\A', 'src/A.php');
      const nodeB = makeNode(NodeType.CLASS, 'App\\B', 'src/B.php');
      const nodeC = makeNode(NodeType.CLASS, 'App\\C', 'src/C.php');
      await store.upsertNode(nodeA);
      await store.upsertNode(nodeB);
      await store.upsertNode(nodeC);
      await store.upsertEdge(makeEdge(nodeB.id, nodeA.id, EdgeType.EXTENDS));
      await store.upsertEdge(makeEdge(nodeC.id, nodeB.id, EdgeType.EXTENDS));

      const dependents = await findDependents(store, 'App\\A', 2);
      expect(dependents).toHaveLength(2);
      const names = dependents.map(d => d.qualifiedName).sort();
      expect(names).toEqual(['App\\B', 'App\\C']);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @contextualizer/analyzer test -- --reporter verbose src/query/__tests__/graph-queries.test.ts`
Expected: FAIL

**Step 3: Implement graph-queries.ts**

```typescript
// packages/analyzer/src/query/graph-queries.ts
import type { GraphStore, StoredNode, StoredEdge } from '@contextualizer/storage';
import type { NodeType, EdgeType } from '@contextualizer/core';
import { GraphLevel } from '@contextualizer/core';

export interface ReferenceResult {
  source: StoredNode;
  edgeType: EdgeType;
  edge: StoredEdge;
}

export interface DependencyResult {
  target: StoredNode;
  edgeType: EdgeType;
  edge: StoredEdge;
}

export interface DependentResult {
  id: string;
  qualifiedName: string;
  shortName: string;
  type: string;
  filePath: string | null;
  depth: number;
}

export async function searchSymbols(
  store: GraphStore,
  query: string,
  types?: NodeType[],
): Promise<StoredNode[]> {
  const allNodes = await store.getAllNodes();
  let results = allNodes.filter(n =>
    n.level === GraphLevel.COMPONENT &&
    (n.qualifiedName.includes(query) || n.shortName.includes(query))
  );

  if (types && types.length > 0) {
    const typeSet = new Set(types);
    results = results.filter(n => typeSet.has(n.type));
  }

  return results;
}

export async function findReferences(
  store: GraphStore,
  symbolName: string,
  edgeTypes?: EdgeType[],
): Promise<ReferenceResult[]> {
  const targetNode = await resolveSymbol(store, symbolName);
  if (!targetNode) return [];

  let edges = await store.getIncomingEdges(targetNode.id);
  if (edgeTypes && edgeTypes.length > 0) {
    const typeSet = new Set(edgeTypes);
    edges = edges.filter(e => typeSet.has(e.type));
  }

  const results: ReferenceResult[] = [];
  for (const edge of edges) {
    const source = await store.getNodeById(edge.source);
    if (source) {
      results.push({ source, edgeType: edge.type, edge });
    }
  }

  return results;
}

export async function findDependencies(
  store: GraphStore,
  symbolName: string,
  edgeTypes?: EdgeType[],
): Promise<DependencyResult[]> {
  const sourceNode = await resolveSymbol(store, symbolName);
  if (!sourceNode) return [];

  let edges = await store.getOutgoingEdges(sourceNode.id);
  if (edgeTypes && edgeTypes.length > 0) {
    const typeSet = new Set(edgeTypes);
    edges = edges.filter(e => typeSet.has(e.type));
  }

  const results: DependencyResult[] = [];
  for (const edge of edges) {
    const target = await store.getNodeById(edge.target);
    if (target) {
      results.push({ target, edgeType: edge.type, edge });
    }
  }

  return results;
}

export async function findDependents(
  store: GraphStore,
  symbolName: string,
  depth: number = 1,
): Promise<DependentResult[]> {
  const targetNode = await resolveSymbol(store, symbolName);
  if (!targetNode) return [];

  const visited = new Set<string>([targetNode.id]);
  const results: DependentResult[] = [];
  let queue = [targetNode.id];
  let currentDepth = 0;

  while (queue.length > 0 && currentDepth < depth) {
    const nextQueue: string[] = [];
    currentDepth++;

    for (const nodeId of queue) {
      const incomingEdges = await store.getIncomingEdges(nodeId);
      for (const edge of incomingEdges) {
        if (!visited.has(edge.source)) {
          visited.add(edge.source);
          nextQueue.push(edge.source);
          const node = await store.getNodeById(edge.source);
          if (node) {
            results.push({
              id: node.id,
              qualifiedName: node.qualifiedName,
              shortName: node.shortName,
              type: node.type,
              filePath: node.filePath,
              depth: currentDepth,
            });
          }
        }
      }
    }

    queue = nextQueue;
  }

  return results;
}

async function resolveSymbol(store: GraphStore, symbolName: string): Promise<StoredNode | null> {
  // Try exact FQN match first
  const exact = await store.getNodeByQualifiedName(symbolName);
  if (exact) return exact;

  // Try short name match
  const candidates = await store.getNodesByShortName(symbolName);
  if (candidates.length === 1) return candidates[0];

  // Try substring match on all nodes
  const allNodes = await store.getAllNodes();
  const matches = allNodes.filter(n =>
    n.level === GraphLevel.COMPONENT && n.qualifiedName.includes(symbolName)
  );
  if (matches.length === 1) return matches[0];

  return matches[0] ?? null;
}
```

**Step 4: Update analyzer exports**

Add to `packages/analyzer/src/index.ts`:
```typescript
export { searchSymbols, findReferences, findDependencies, findDependents } from './query/graph-queries.js';
export type { ReferenceResult, DependencyResult, DependentResult } from './query/graph-queries.js';
```

**Step 5: Run tests**

Run: `pnpm --filter @contextualizer/analyzer test -- --reporter verbose src/query/__tests__/graph-queries.test.ts`
Expected: All 8 tests PASS

**Step 6: Commit**

```bash
git add packages/analyzer/src/query/ packages/analyzer/src/index.ts
git commit -m "feat: add graph query helpers (search, references, dependencies, dependents)"
```

---

## Task 2: `lpc init` command

**Files:**
- Create: `packages/cli/src/commands/init.ts`
- Create: `packages/cli/src/__tests__/init.test.ts`
- Modify: `packages/cli/src/cli.ts`

**Step 1: Write the failing test**

```typescript
// packages/cli/src/__tests__/init.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { runInit } from '../commands/init.js';

describe('lpc init', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ctx-init-'));
    execSync('git init', { cwd: tempDir, stdio: 'ignore' });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates .contextualizer directory', async () => {
    await runInit(tempDir);
    expect(existsSync(join(tempDir, '.contextualizer'))).toBe(true);
  });

  it('creates config.json with default settings', async () => {
    await runInit(tempDir);
    const configPath = join(tempDir, '.contextualizer', 'config.json');
    expect(existsSync(configPath)).toBe(true);

    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(config.version).toBe(1);
    expect(config.include).toContain('**/*.php');
    expect(config.exclude).toContain('vendor/**');
  });

  it('installs pre-commit hook by default', async () => {
    await runInit(tempDir);
    const hookPath = join(tempDir, '.git', 'hooks', 'pre-commit');
    expect(existsSync(hookPath)).toBe(true);
    const content = readFileSync(hookPath, 'utf-8');
    expect(content).toContain('contextualizer');
  });

  it('skips hook installation with noHooks option', async () => {
    await runInit(tempDir, { noHooks: true });
    const hookPath = join(tempDir, '.git', 'hooks', 'pre-commit');
    expect(existsSync(hookPath)).toBe(false);
  });

  it('is idempotent (can run twice safely)', async () => {
    await runInit(tempDir);
    await runInit(tempDir);
    const configPath = join(tempDir, '.contextualizer', 'config.json');
    expect(existsSync(configPath)).toBe(true);
  });
});
```

**Step 2: Implement init.ts**

```typescript
// packages/cli/src/commands/init.ts
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { installHook } from './install-hook.js';

interface InitOptions {
  noHooks?: boolean;
}

const DEFAULT_CONFIG = {
  version: 1,
  include: ['**/*.php'],
  exclude: ['vendor/**', 'node_modules/**', 'tests/**', 'var/**'],
  analysis: {
    concurrency: 4,
    fileTimeout: 30000,
    maxFileSize: 1048576,
    cascadeDepth: 2,
  },
  server: {
    port: 3100,
    host: '127.0.0.1',
  },
};

export async function runInit(projectDir: string, options: InitOptions = {}): Promise<void> {
  const ctxDir = join(projectDir, '.contextualizer');
  mkdirSync(ctxDir, { recursive: true });

  // Write config.json if it doesn't exist
  const configPath = join(ctxDir, 'config.json');
  if (!existsSync(configPath)) {
    writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n');
  }

  // Install hook unless opted out
  if (!options.noHooks) {
    try {
      await installHook(projectDir);
    } catch {
      // Not a git repo or hook install failed -- non-fatal
    }
  }

  // Append to .gitignore if it exists
  const gitignorePath = join(projectDir, '.gitignore');
  const entries = ['.contextualizer/graph.duckdb', '.contextualizer/models/'];
  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, 'utf-8');
    const toAdd = entries.filter(e => !content.includes(e));
    if (toAdd.length > 0) {
      writeFileSync(gitignorePath, content.trimEnd() + '\n' + toAdd.join('\n') + '\n');
    }
  }
}
```

**Step 3: Register in cli.ts**

Add `init` command with `--no-hooks` flag.

**Step 4: Run tests**

Run: `pnpm --filter @contextualizer/cli test -- --reporter verbose src/__tests__/init.test.ts`
Expected: All 5 tests PASS

**Step 5: Commit**

```bash
git add packages/cli/src/commands/init.ts packages/cli/src/__tests__/init.test.ts packages/cli/src/cli.ts
git commit -m "feat: add lpc init command with config generation and hook setup"
```

---

## Task 3: MCP server package scaffold

**Files:**
- Create: `packages/mcp-server/package.json`
- Create: `packages/mcp-server/tsconfig.json`
- Create: `packages/mcp-server/vitest.config.ts`
- Create: `packages/mcp-server/src/index.ts`
- Create: `packages/mcp-server/src/server.ts`

**Step 1: Create package.json**

```json
{
  "name": "@contextualizer/mcp-server",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "bin": {
    "contextualizer-mcp": "dist/index.js"
  },
  "main": "dist/server.js",
  "types": "dist/server.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@contextualizer/core": "workspace:*",
    "@contextualizer/analyzer": "workspace:*",
    "@contextualizer/storage": "workspace:*",
    "@modelcontextprotocol/sdk": "^1.12.0",
    "zod": "^3.24.0"
  }
}
```

**Step 2: Create tsconfig.json, vitest.config.ts (same pattern as other packages)**

**Step 3: Create src/server.ts**

```typescript
// packages/mcp-server/src/server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { GraphStore } from '@contextualizer/storage';

export function createMcpServer(store: GraphStore): McpServer {
  const server = new McpServer({
    name: 'contextualizer',
    version: '0.0.1',
  });

  return server;
}

export async function startStdioServer(store: GraphStore): Promise<void> {
  const server = createMcpServer(store);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
```

**Step 4: Create src/index.ts**

```typescript
#!/usr/bin/env node
import { join } from 'node:path';
import { DuckDBGraphStore } from '@contextualizer/storage';
import { startStdioServer } from './server.js';

const projectDir = process.argv[2] || process.cwd();
const dbPath = join(projectDir, '.contextualizer', 'graph.duckdb');

const store = new DuckDBGraphStore(dbPath);
await store.initialize();
await startStdioServer(store);
```

**Step 5: Install dependencies and build**

Run: `pnpm install && pnpm --filter @contextualizer/mcp-server build`

**Step 6: Commit**

```bash
git add packages/mcp-server/
git commit -m "feat: scaffold @contextualizer/mcp-server package"
```

---

## Task 4: MCP tools implementation

**Files:**
- Create: `packages/mcp-server/src/tools/analyze.ts`
- Create: `packages/mcp-server/src/tools/search.ts`
- Create: `packages/mcp-server/src/tools/references.ts`
- Create: `packages/mcp-server/src/tools/freshness.ts`
- Create: `packages/mcp-server/src/tools/refresh.ts`
- Modify: `packages/mcp-server/src/server.ts`
- Create: `packages/mcp-server/src/__tests__/tools.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/mcp-server/src/__tests__/tools.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DuckDBGraphStore } from '@contextualizer/storage';
import { createMcpServer } from '../server.js';

describe('MCP tools', () => {
  let tempDir: string;
  let store: DuckDBGraphStore;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ctx-mcp-'));
    mkdirSync(join(tempDir, 'src'), { recursive: true });
    mkdirSync(join(tempDir, '.contextualizer'), { recursive: true });
    writeFileSync(join(tempDir, 'src', 'UserService.php'), `<?php
namespace App\\Service;
use App\\Repository\\UserRepository;
class UserService {
    public function __construct(private readonly UserRepository $repo) {}
    public function findUser(int $id): void {}
}
`);
    writeFileSync(join(tempDir, 'src', 'UserRepository.php'), `<?php
namespace App\\Repository;
class UserRepository {
    public function find(int $id): void {}
}
`);

    store = new DuckDBGraphStore(':memory:');
    await store.initialize();
  });

  afterEach(async () => {
    await store.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates an MCP server with all tools registered', () => {
    const server = createMcpServer(store, tempDir);
    expect(server).toBeDefined();
  });

  // Additional tool tests will validate that tools return correct results
  // when called via the MCP server's internal tool dispatch
});
```

**Step 2: Implement tool modules**

Each tool module exports a `register(server, store, projectDir)` function that registers the tool with the MCP server.

`packages/mcp-server/src/tools/analyze.ts`:
- `analyze_project` tool: runs full analysis via AnalysisPipeline
- Returns text summary: files analyzed, symbols found, duration

`packages/mcp-server/src/tools/search.ts`:
- `search_symbols` tool: takes query + optional kind filter, uses searchSymbols()
- Returns formatted list of matching symbols

`packages/mcp-server/src/tools/references.ts`:
- `find_references` tool: what references this symbol (incoming edges)
- `find_dependencies` tool: what does this symbol depend on (outgoing edges)
- `find_dependents` tool: what depends on this symbol (BFS incoming, with depth)

`packages/mcp-server/src/tools/freshness.ts`:
- `get_freshness` tool: runs getStalenessReport, returns summary

`packages/mcp-server/src/tools/refresh.ts`:
- `refresh` tool: runs analyzeIncremental with optional file list

**Step 3: Update server.ts to register all tools**

```typescript
export function createMcpServer(store: GraphStore, projectDir: string): McpServer {
  const server = new McpServer({ name: 'contextualizer', version: '0.0.1' });
  registerAnalyzeTools(server, store, projectDir);
  registerSearchTools(server, store);
  registerReferenceTools(server, store);
  registerFreshnessTools(server, store);
  registerRefreshTools(server, store, projectDir);
  return server;
}
```

**Step 4: Run tests**

Run: `pnpm --filter @contextualizer/mcp-server test`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add packages/mcp-server/
git commit -m "feat: implement MCP tools (analyze, search, references, freshness, refresh)"
```

---

## Task 5: Fastify HTTP API server

**Files:**
- Create: `packages/web-server/package.json`
- Create: `packages/web-server/tsconfig.json`
- Create: `packages/web-server/vitest.config.ts`
- Create: `packages/web-server/src/server.ts`
- Create: `packages/web-server/src/routes/graph.ts`
- Create: `packages/web-server/src/routes/search.ts`
- Create: `packages/web-server/src/routes/node.ts`
- Create: `packages/web-server/src/routes/status.ts`
- Create: `packages/web-server/src/routes/refresh.ts`
- Create: `packages/web-server/src/index.ts`
- Create: `packages/web-server/src/__tests__/server.test.ts`

**Step 1: Create package.json**

```json
{
  "name": "@contextualizer/web-server",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "dist/server.js",
  "types": "dist/server.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@contextualizer/core": "workspace:*",
    "@contextualizer/analyzer": "workspace:*",
    "@contextualizer/storage": "workspace:*",
    "fastify": "^5.2.0",
    "@fastify/cors": "^11.0.0"
  }
}
```

**Step 2: Implement server.ts**

```typescript
// packages/web-server/src/server.ts
import Fastify from 'fastify';
import cors from '@fastify/cors';
import type { GraphStore } from '@contextualizer/storage';
import { registerGraphRoutes } from './routes/graph.js';
import { registerSearchRoutes } from './routes/search.js';
import { registerNodeRoutes } from './routes/node.js';
import { registerStatusRoutes } from './routes/status.js';
import { registerRefreshRoutes } from './routes/refresh.js';

export interface ServerOptions {
  store: GraphStore;
  projectDir: string;
  host?: string;
  port?: number;
}

export async function createServer(options: ServerOptions) {
  const app = Fastify();
  await app.register(cors, { origin: true });

  const { store, projectDir } = options;

  registerGraphRoutes(app, store);
  registerSearchRoutes(app, store);
  registerNodeRoutes(app, store);
  registerStatusRoutes(app, store);
  registerRefreshRoutes(app, store, projectDir);

  return app;
}

export async function startServer(options: ServerOptions) {
  const app = await createServer(options);
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 3100;
  await app.listen({ host, port });
  return app;
}
```

**Step 3: Implement route modules**

`routes/graph.ts`: `GET /api/graph/:level` -- returns nodes/edges at given level
`routes/node.ts`: `GET /api/node/:id` -- returns node detail with incoming/outgoing edges
`routes/search.ts`: `GET /api/search?q=` -- calls searchSymbols
`routes/status.ts`: `GET /api/status` -- calls getStalenessReport
`routes/refresh.ts`: `POST /api/refresh` -- runs analyzeIncremental

**Step 4: Write tests using Fastify inject (no real HTTP)**

```typescript
// packages/web-server/src/__tests__/server.test.ts
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
```

**Step 5: Run tests**

Run: `pnpm --filter @contextualizer/web-server test`
Expected: All 5 tests PASS

**Step 6: Commit**

```bash
git add packages/web-server/
git commit -m "feat: add Fastify HTTP API server with graph, search, node, status routes"
```

---

## Task 6: `lpc serve` command

**Files:**
- Create: `packages/cli/src/commands/serve.ts`
- Modify: `packages/cli/src/cli.ts`

**Step 1: Implement serve.ts**

```typescript
// packages/cli/src/commands/serve.ts
import { join } from 'node:path';
import { DuckDBGraphStore } from '@contextualizer/storage';

export async function runServe(projectDir: string, options: { port?: number; host?: string } = {}): Promise<void> {
  const { startServer } = await import('@contextualizer/web-server');
  const dbPath = join(projectDir, '.contextualizer', 'graph.duckdb');
  const store = new DuckDBGraphStore(dbPath);
  await store.initialize();

  const port = options.port ?? 3100;
  const host = options.host ?? '127.0.0.1';

  await startServer({ store, projectDir, port, host });
  console.log(`Server running at http://${host}:${port}`);
}
```

**Step 2: Add dependency on web-server**

Add `"@contextualizer/web-server": "workspace:*"` to cli package.json dependencies.

**Step 3: Register in cli.ts**

```typescript
program
  .command('serve')
  .description('Start HTTP API server')
  .option('-d, --dir <path>', 'Project directory', process.cwd())
  .option('-p, --port <number>', 'Port number', '3100')
  .option('--host <addr>', 'Bind address', '127.0.0.1')
  .action(async (opts) => {
    const { runServe } = await import('./commands/serve.js');
    await runServe(opts.dir, { port: parseInt(opts.port), host: opts.host });
  });
```

**Step 4: Build and verify**

Run: `pnpm install && pnpm build`
Expected: Clean build

**Step 5: Commit**

```bash
git add packages/cli/ pnpm-lock.yaml
git commit -m "feat: add lpc serve command for HTTP API server"
```

---

## Task 7: Final cleanup and full verification

**Step 1: Build all packages**

Run: `pnpm build`
Expected: Clean build, 6 packages

**Step 2: Run all tests**

Run: `pnpm test`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add -A
git commit -m "chore: phase 4 cleanup, all packages build and test green"
```

---

## Summary

| Task | What | Tests |
|------|------|-------|
| 1 | Graph query helpers (search, refs, deps) | 8 tests |
| 2 | `lpc init` command | 5 tests |
| 3 | MCP server package scaffold | 0 (scaffold) |
| 4 | MCP tools (analyze, search, refs, freshness, refresh) | ~2 tests |
| 5 | Fastify HTTP API server | 5 tests |
| 6 | `lpc serve` command | 0 (integration) |
| 7 | Final cleanup | 0 (verification) |

**Total new tests: ~20**
**New packages: mcp-server, web-server**

**Definition of Done (from delivery plan):**
- [x] All CLI commands work end-to-end (init, analyze, update, status, serve, install-hook)
- [x] Claude Code can call MCP tools (analyze_project, search_symbols, find_references, find_dependencies, find_dependents, get_freshness, refresh)
- [x] HTTP API serves graph data for web UI consumption
- [x] `lpc init && lpc analyze && lpc status` works as onboarding flow

**Deferred to future phase:**
- Vector embeddings (transformers.js + all-MiniLM-L6-v2)
- `semantic_search` MCP tool
- `query_graph` raw SQL/Cypher tool
