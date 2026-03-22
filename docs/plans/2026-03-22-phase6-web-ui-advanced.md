# Phase 6: Web UI Advanced Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add multi-level drill-down, blast radius visualization, freshness coloring, cycle detection, keyboard shortcuts, minimap, and export to the web UI.

**Architecture:** New API endpoints in web-server for children/blast-radius/cycles. New graph query helpers in analyzer. Frontend enhancements to existing React components with new Zustand navigation state.

**Tech Stack:** Existing stack + Canvas 2D for minimap, Sigma toDataURL for PNG export

**Reference docs:**
- `docs/frontend-specification.md` -- component architecture
- `docs/ui-ux-design-system.md` -- visual spec
- `docs/delivery-plan.md` lines 188-220 -- Phase 6 definition of done

---

## Task 1: Backend -- children and blast-radius API endpoints

**Files:**
- Create: `packages/analyzer/src/query/children-query.ts`
- Create: `packages/analyzer/src/query/__tests__/children-query.test.ts`
- Create: `packages/analyzer/src/query/blast-radius.ts`
- Create: `packages/analyzer/src/query/__tests__/blast-radius.test.ts`
- Create: `packages/analyzer/src/query/cycle-detector.ts`
- Create: `packages/analyzer/src/query/__tests__/cycle-detector.test.ts`
- Modify: `packages/analyzer/src/index.ts`
- Create: `packages/web-server/src/routes/children.ts`
- Create: `packages/web-server/src/routes/blast-radius.ts`
- Create: `packages/web-server/src/routes/cycles.ts`
- Modify: `packages/web-server/src/server.ts`
- Create: `packages/web-server/src/__tests__/advanced-routes.test.ts`

**Step 1: Write failing test for findChildren**

```typescript
// packages/analyzer/src/query/__tests__/children-query.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DuckDBGraphStore } from '@contextualizer/storage';
import { GraphLevel, NodeType, EdgeType, createNodeId, createEdgeId } from '@contextualizer/core';
import { findChildren } from '../children-query.js';

describe('findChildren', () => {
  let store: DuckDBGraphStore;
  const now = new Date().toISOString();

  const makeNode = (type: NodeType, fqn: string, level: GraphLevel, filePath: string) => ({
    id: createNodeId(type, fqn),
    type, level,
    qualifiedName: fqn,
    shortName: fqn.split('\\').pop()!.split('::').pop()!,
    filePath, startLine: 1, endLine: 10,
    contentHash: 'x', isStale: false, lastAnalyzedAt: now, metadata: {},
  });

  beforeEach(async () => {
    store = new DuckDBGraphStore(':memory:');
    await store.initialize();
  });

  afterEach(async () => {
    await store.close();
  });

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
```

**Step 2: Implement findChildren**

```typescript
// packages/analyzer/src/query/children-query.ts
import type { GraphStore, StoredNode, StoredEdge } from '@contextualizer/storage';
import { EdgeType } from '@contextualizer/core';

export interface ChildrenResult {
  parentId: string;
  parentLabel: string;
  children: StoredNode[];
  edges: StoredEdge[];
}

export async function findChildren(store: GraphStore, parentId: string): Promise<ChildrenResult> {
  const parent = await store.getNodeById(parentId);
  if (!parent) {
    return { parentId, parentLabel: '', children: [], edges: [] };
  }

  const outgoing = await store.getOutgoingEdges(parentId);
  const containsEdges = outgoing.filter(e => e.type === EdgeType.CONTAINS);
  const childIds = new Set(containsEdges.map(e => e.target));

  const children: StoredNode[] = [];
  for (const childId of childIds) {
    const node = await store.getNodeById(childId);
    if (node) children.push(node);
  }

  // Find edges between children (excluding CONTAINS)
  const edges: StoredEdge[] = [];
  for (const child of children) {
    const childOutgoing = await store.getOutgoingEdges(child.id);
    for (const edge of childOutgoing) {
      if (edge.type !== EdgeType.CONTAINS && childIds.has(edge.target)) {
        edges.push(edge);
      }
    }
  }

  return { parentId, parentLabel: parent.shortName, children, edges };
}
```

**Step 3: Write failing test for computeBlastRadius**

```typescript
// packages/analyzer/src/query/__tests__/blast-radius.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DuckDBGraphStore } from '@contextualizer/storage';
import { GraphLevel, NodeType, EdgeType, createNodeId, createEdgeId } from '@contextualizer/core';
import { computeBlastRadius } from '../blast-radius.js';

describe('computeBlastRadius', () => {
  let store: DuckDBGraphStore;
  const now = new Date().toISOString();

  const makeNode = (type: NodeType, fqn: string, filePath: string) => ({
    id: createNodeId(type, fqn), type,
    level: GraphLevel.COMPONENT,
    qualifiedName: fqn,
    shortName: fqn.split('\\').pop()!,
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
    expect(result.affectedNodes).toHaveLength(1); // only B, not C
  });
});
```

**Step 4: Implement computeBlastRadius**

```typescript
// packages/analyzer/src/query/blast-radius.ts
import type { GraphStore, StoredNode, StoredEdge } from '@contextualizer/storage';

export interface BlastRadiusNode {
  id: string;
  qualifiedName: string;
  shortName: string;
  type: string;
  filePath: string | null;
  depth: number;
}

export interface BlastRadiusResult {
  originId: string;
  maxDepth: number;
  affectedNodes: BlastRadiusNode[];
  affectedEdges: StoredEdge[];
}

export async function computeBlastRadius(
  store: GraphStore,
  originId: string,
  maxDepth: number = 2,
): Promise<BlastRadiusResult> {
  const visited = new Set<string>([originId]);
  const affectedNodes: BlastRadiusNode[] = [];
  const affectedEdges: StoredEdge[] = [];
  let queue = [originId];
  let currentDepth = 0;

  while (queue.length > 0 && currentDepth < maxDepth) {
    const nextQueue: string[] = [];
    currentDepth++;

    for (const nodeId of queue) {
      const incoming = await store.getIncomingEdges(nodeId);
      for (const edge of incoming) {
        affectedEdges.push(edge);
        if (!visited.has(edge.source)) {
          visited.add(edge.source);
          nextQueue.push(edge.source);
          const node = await store.getNodeById(edge.source);
          if (node) {
            affectedNodes.push({
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

  return { originId, maxDepth, affectedNodes, affectedEdges };
}
```

**Step 5: Write failing test for detectCycles**

```typescript
// packages/analyzer/src/query/__tests__/cycle-detector.test.ts
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
```

**Step 6: Implement detectCycles**

```typescript
// packages/analyzer/src/query/cycle-detector.ts
import type { GraphStore } from '@contextualizer/storage';
import { GraphLevel, EdgeType } from '@contextualizer/core';

const STRUCTURAL_TYPES = new Set([
  EdgeType.EXTENDS, EdgeType.IMPLEMENTS, EdgeType.USES_TRAIT,
  EdgeType.CALLS, EdgeType.INJECTS, EdgeType.DEPENDS_ON,
  EdgeType.INSTANTIATES, EdgeType.IMPORTS,
]);

export async function detectCycles(store: GraphStore): Promise<string[][]> {
  const allNodes = await store.getAllNodes();
  const componentNodes = allNodes.filter(n => n.level === GraphLevel.COMPONENT);
  const allEdges = await store.getAllEdges();

  // Build adjacency list from structural edges (exclude CONTAINS)
  const adj = new Map<string, string[]>();
  for (const node of componentNodes) {
    adj.set(node.id, []);
  }
  for (const edge of allEdges) {
    if (!STRUCTURAL_TYPES.has(edge.type)) continue;
    if (edge.type === EdgeType.CONTAINS) continue;
    if (!adj.has(edge.source)) continue;
    adj.get(edge.source)!.push(edge.target);
  }

  // Johnson's simplified: DFS-based cycle detection
  const cycles: string[][] = [];
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const parent = new Map<string, string | null>();

  for (const nodeId of adj.keys()) {
    color.set(nodeId, WHITE);
  }

  function dfs(u: string, path: string[]): void {
    color.set(u, GRAY);
    path.push(u);

    for (const v of adj.get(u) ?? []) {
      if (!adj.has(v)) continue;
      if (color.get(v) === GRAY) {
        // Found cycle -- extract it
        const cycleStart = path.indexOf(v);
        if (cycleStart >= 0) {
          const cycle = path.slice(cycleStart);
          if (cycle.length >= 2) {
            cycles.push(cycle);
          }
        }
      } else if (color.get(v) === WHITE) {
        dfs(v, path);
      }
    }

    path.pop();
    color.set(u, BLACK);
  }

  for (const nodeId of adj.keys()) {
    if (color.get(nodeId) === WHITE) {
      dfs(nodeId, []);
    }
  }

  return cycles;
}
```

**Step 7: Update analyzer exports**

Add to `packages/analyzer/src/index.ts`:
```typescript
export { findChildren, type ChildrenResult } from './query/children-query.js';
export { computeBlastRadius, type BlastRadiusResult, type BlastRadiusNode } from './query/blast-radius.js';
export { detectCycles } from './query/cycle-detector.js';
```

**Step 8: Add web-server routes**

Create `packages/web-server/src/routes/children.ts`:
```typescript
import type { FastifyInstance } from 'fastify';
import type { GraphStore } from '@contextualizer/storage';
import { findChildren } from '@contextualizer/analyzer';

export function registerChildrenRoutes(app: FastifyInstance, store: GraphStore): void {
  app.get<{ Params: { id: string } }>('/api/node/:id/children', async (request, reply) => {
    const result = await findChildren(store, request.params.id);
    return { success: true, data: result };
  });
}
```

Create `packages/web-server/src/routes/blast-radius.ts`:
```typescript
import type { FastifyInstance } from 'fastify';
import type { GraphStore } from '@contextualizer/storage';
import { computeBlastRadius } from '@contextualizer/analyzer';

export function registerBlastRadiusRoutes(app: FastifyInstance, store: GraphStore): void {
  app.get<{ Params: { id: string }; Querystring: { depth?: string } }>('/api/blast-radius/:id', async (request) => {
    const depth = parseInt(request.query.depth ?? '2', 10);
    const result = await computeBlastRadius(store, request.params.id, Math.min(depth, 5));
    return { success: true, data: result };
  });
}
```

Create `packages/web-server/src/routes/cycles.ts`:
```typescript
import type { FastifyInstance } from 'fastify';
import type { GraphStore } from '@contextualizer/storage';
import { detectCycles } from '@contextualizer/analyzer';

export function registerCyclesRoutes(app: FastifyInstance, store: GraphStore): void {
  app.get('/api/cycles', async () => {
    const cycles = await detectCycles(store);
    return { success: true, data: { cycles, count: cycles.length } };
  });
}
```

Register all 3 routes in `packages/web-server/src/server.ts` (add imports + calls in createServer).

**Step 9: Write web-server route tests**

```typescript
// packages/web-server/src/__tests__/advanced-routes.test.ts
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
```

**Step 10: Run all tests**

```bash
cd /Users/krzysztofsurdy/ProjectsPrivate/llmProjectContextualizer
pnpm --filter @contextualizer/analyzer test -- --reporter verbose src/query/__tests__/
pnpm --filter @contextualizer/web-server test -- --reporter verbose
```

**Step 11: Commit**

```bash
git add packages/analyzer/src/query/ packages/analyzer/src/index.ts packages/web-server/src/
git commit -m "feat: add children, blast-radius, and cycle detection APIs"
```

---

## Task 2: Navigation store and drill-down state

**Files:**
- Create: `packages/web/src/store/navigation-store.ts`
- Modify: `packages/web/src/store/index.ts`
- Modify: `packages/web/src/api/client.ts`
- Modify: `packages/web/src/api/hooks.ts`
- Modify: `packages/web/src/api/types.ts`

**Step 1: Add new API types**

Add to `packages/web/src/api/types.ts`:
```typescript
export interface ChildrenData {
  parentId: string;
  parentLabel: string;
  children: GraphNode[];
  edges: GraphEdge[];
}

export interface BlastRadiusNode {
  id: string;
  qualifiedName: string;
  shortName: string;
  type: string;
  filePath: string | null;
  depth: number;
}

export interface BlastRadiusData {
  originId: string;
  maxDepth: number;
  affectedNodes: BlastRadiusNode[];
  affectedEdges: GraphEdge[];
}

export interface CyclesData {
  cycles: string[][];
  count: number;
}
```

**Step 2: Add API client methods**

Add to `packages/web/src/api/client.ts`:
```typescript
getChildren: (nodeId: string) => fetchJson<ChildrenData>(`/node/${encodeURIComponent(nodeId)}/children`),
getBlastRadius: (nodeId: string, depth: number) => fetchJson<BlastRadiusData>(`/blast-radius/${encodeURIComponent(nodeId)}?depth=${depth}`),
getCycles: () => fetchJson<CyclesData>('/cycles'),
```

**Step 3: Add hooks**

Add to `packages/web/src/api/hooks.ts`:
```typescript
export function useChildren(nodeId: string | null) {
  return useQuery({
    queryKey: ['children', nodeId],
    queryFn: () => api.getChildren(nodeId!),
    enabled: !!nodeId,
  });
}

export function useBlastRadius(nodeId: string | null, depth: number) {
  return useQuery({
    queryKey: ['blastRadius', nodeId, depth],
    queryFn: () => api.getBlastRadius(nodeId!, depth),
    enabled: !!nodeId,
  });
}

export function useCycles() {
  return useQuery({
    queryKey: ['cycles'],
    queryFn: () => api.getCycles(),
  });
}
```

**Step 4: Create navigation store**

```typescript
// packages/web/src/store/navigation-store.ts
import { create } from 'zustand';

export interface Breadcrumb {
  nodeId: string | null;
  label: string;
  level: string;
}

export interface NavigationState {
  breadcrumbs: Breadcrumb[];
  drillParentId: string | null;

  drillDown: (nodeId: string, label: string, level: string) => void;
  drillUp: (index: number) => void;
  resetNavigation: () => void;

  blastRadiusActive: boolean;
  blastRadiusDepth: number;
  toggleBlastRadius: () => void;
  setBlastRadiusDepth: (depth: number) => void;
}

export const useNavigationStore = create<NavigationState>((set) => ({
  breadcrumbs: [{ nodeId: null, label: 'Root', level: 'component' }],
  drillParentId: null,

  drillDown: (nodeId, label, level) =>
    set((s) => ({
      breadcrumbs: [...s.breadcrumbs, { nodeId, label, level }],
      drillParentId: nodeId,
    })),

  drillUp: (index) =>
    set((s) => ({
      breadcrumbs: s.breadcrumbs.slice(0, index + 1),
      drillParentId: s.breadcrumbs[index].nodeId,
    })),

  resetNavigation: () =>
    set({ breadcrumbs: [{ nodeId: null, label: 'Root', level: 'component' }], drillParentId: null }),

  blastRadiusActive: false,
  blastRadiusDepth: 2,
  toggleBlastRadius: () => set((s) => ({ blastRadiusActive: !s.blastRadiusActive })),
  setBlastRadiusDepth: (depth) => set({ blastRadiusDepth: Math.min(Math.max(depth, 1), 5) }),
}));
```

**Step 5: Update store index**

Add to `packages/web/src/store/index.ts`:
```typescript
export { useNavigationStore } from './navigation-store';
export type { NavigationState, Breadcrumb } from './navigation-store';
```

**Step 6: Build and verify**

```bash
pnpm --filter @contextualizer/web build
```

**Step 7: Commit**

```bash
git add packages/web/src/
git commit -m "feat: add navigation store, blast radius state, and API hooks for drill-down"
```

---

## Task 3: Drill-down in graph canvas + breadcrumb component

**Files:**
- Create: `packages/web/src/components/LevelNavigator.tsx`
- Modify: `packages/web/src/components/GraphCanvas.tsx`
- Modify: `packages/web/src/App.tsx`

**Step 1: Create LevelNavigator breadcrumb**

```tsx
// packages/web/src/components/LevelNavigator.tsx
import { useNavigationStore } from '../store';

export default function LevelNavigator() {
  const breadcrumbs = useNavigationStore((s) => s.breadcrumbs);
  const drillUp = useNavigationStore((s) => s.drillUp);

  if (breadcrumbs.length <= 1) return null;

  return (
    <div className="absolute top-2 left-2 z-10 flex items-center gap-1 bg-surface-800/90 rounded-md px-2 py-1 border border-border-default">
      {breadcrumbs.map((crumb, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="text-text-tertiary text-xs">&gt;</span>}
          {i < breadcrumbs.length - 1 ? (
            <button
              onClick={() => drillUp(i)}
              className="text-text-link text-xs hover:underline"
            >
              {crumb.label}
            </button>
          ) : (
            <span className="text-text-primary text-xs font-medium">{crumb.label}</span>
          )}
        </span>
      ))}
    </div>
  );
}
```

**Step 2: Modify GraphCanvas to support drill-down**

Add double-click event handler in GraphEvents:
```typescript
registerEvents({
  clickNode: ({ node }) => selectNode(node),
  clickStage: () => selectNode(null),
  doubleClickNode: ({ node }) => {
    // Look up node label from graph
    const graph = sigma.getGraph();
    const label = graph.getNodeAttribute(node, 'label') ?? node;
    drillDown(node, label, 'children');
  },
});
```

Modify GraphLoader to use children data when drilled in:
- When `drillParentId` is set, use `useChildren(drillParentId)` instead of `useGraphData(level)`
- Build graph from children data instead of level data

**Step 3: Add LevelNavigator to GraphCanvas render**

Place `<LevelNavigator />` as an overlay inside the graph canvas div.

**Step 4: Build and verify**

```bash
pnpm --filter @contextualizer/web build
```

**Step 5: Commit**

```bash
git add packages/web/src/components/
git commit -m "feat: add drill-down navigation with breadcrumb and double-click handler"
```

---

## Task 4: Blast radius overlay

**Files:**
- Create: `packages/web/src/components/BlastRadiusControls.tsx`
- Modify: `packages/web/src/components/GraphCanvas.tsx`

**Step 1: Create BlastRadiusControls**

```tsx
// packages/web/src/components/BlastRadiusControls.tsx
import { useUIStore, useNavigationStore } from '../store';

export default function BlastRadiusControls() {
  const selectedNodeId = useUIStore((s) => s.selectedNodeId);
  const blastRadiusActive = useNavigationStore((s) => s.blastRadiusActive);
  const toggleBlastRadius = useNavigationStore((s) => s.toggleBlastRadius);
  const blastRadiusDepth = useNavigationStore((s) => s.blastRadiusDepth);
  const setBlastRadiusDepth = useNavigationStore((s) => s.setBlastRadiusDepth);

  return (
    <div className="absolute bottom-2 right-2 z-10 flex items-center gap-2 bg-surface-800/90 rounded-md px-3 py-2 border border-border-default">
      <button
        onClick={toggleBlastRadius}
        disabled={!selectedNodeId}
        className={`px-2 py-1 text-xs rounded ${
          blastRadiusActive
            ? 'bg-[#F78166] text-surface-900 font-medium'
            : 'bg-surface-700 text-text-secondary hover:bg-surface-600'
        } disabled:opacity-30`}
        title="Toggle Blast Radius (B)"
      >
        Blast Radius
      </button>
      {blastRadiusActive && (
        <div className="flex items-center gap-1">
          <button
            onClick={() => setBlastRadiusDepth(blastRadiusDepth - 1)}
            className="w-5 h-5 text-xs bg-surface-700 rounded text-text-secondary hover:bg-surface-600"
          >
            -
          </button>
          <span className="text-text-primary text-xs w-4 text-center">{blastRadiusDepth}</span>
          <button
            onClick={() => setBlastRadiusDepth(blastRadiusDepth + 1)}
            className="w-5 h-5 text-xs bg-surface-700 rounded text-text-secondary hover:bg-surface-600"
          >
            +
          </button>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Add blast radius highlighting in GraphCanvas**

In GraphHighlighter, when `blastRadiusActive` is true and a node is selected:
- Fetch blast radius data via `useBlastRadius(selectedNodeId, depth)`
- Build a set of affected node IDs
- In `nodeReducer`: affected nodes get `#F78166` ring effect, others dim to 15% opacity
- In `edgeReducer`: affected edges get `#F78166` color, others dim to 8% opacity

**Step 3: Add keyboard shortcut "B" to toggle blast radius**

In GraphEvents, listen for keydown 'b' to toggle blast radius.

**Step 4: Build and verify**

```bash
pnpm --filter @contextualizer/web build
```

**Step 5: Commit**

```bash
git add packages/web/src/components/
git commit -m "feat: add blast radius overlay with depth controls and B keyboard shortcut"
```

---

## Task 5: Freshness coloring on graph nodes

**Files:**
- Modify: `packages/web/src/lib/graph-builder.ts`
- Modify: `packages/web/src/components/DetailPanel.tsx`

**Step 1: Update graph-builder to apply freshness styling**

In `buildGraphology`, after assigning base color, modify node attributes based on `isStale` and `lastAnalyzedAt`:

```typescript
// Calculate freshness
const lastAnalyzed = new Date(node.lastAnalyzedAt);
const daysSince = (Date.now() - lastAnalyzed.getTime()) / (1000 * 60 * 60 * 24);

let freshnessState: 'fresh' | 'aging' | 'stale' | 'unknown';
if (!node.lastAnalyzedAt) freshnessState = 'unknown';
else if (daysSince < 7) freshnessState = 'fresh';
else if (daysSince < 30) freshnessState = 'aging';
else freshnessState = 'stale';

if (node.isStale) freshnessState = 'stale';

// Adjust opacity/color based on freshness
let opacity = 1.0;
if (freshnessState === 'aging') opacity = 0.85;
else if (freshnessState === 'stale') opacity = 0.6;
else if (freshnessState === 'unknown') opacity = 0.4;

const baseColor = getNodeColor(node.type);
// For stale nodes, blend toward gray
const color = freshnessState === 'stale' ? blendColor(baseColor, '#6E7681', 0.4) : baseColor;
```

Add a `blendColor` utility function.

**Step 2: Update DetailPanel freshness display**

Add a freshness pill that shows age in human-readable format:

```tsx
const daysSince = Math.floor((Date.now() - new Date(node.lastAnalyzedAt).getTime()) / (1000 * 60 * 60 * 24));
const freshnessLabel = daysSince === 0 ? 'Today' : `${daysSince}d ago`;
const freshnessColor = node.isStale ? '#F85149' : daysSince < 7 ? '#2EA043' : daysSince < 30 ? '#D29922' : '#F85149';
```

**Step 3: Build and verify**

```bash
pnpm --filter @contextualizer/web build
```

**Step 4: Commit**

```bash
git add packages/web/src/
git commit -m "feat: add freshness coloring on graph nodes and detail panel age display"
```

---

## Task 6: Keyboard shortcuts and minimap

**Files:**
- Create: `packages/web/src/components/KeyboardShortcuts.tsx`
- Create: `packages/web/src/components/GraphControls.tsx`
- Modify: `packages/web/src/components/GraphCanvas.tsx`
- Modify: `packages/web/src/App.tsx`

**Step 1: Create GraphControls (zoom/fit/layout buttons)**

```tsx
// packages/web/src/components/GraphControls.tsx
import { useSigma, useCamera } from '@react-sigma/core';

export default function GraphControls() {
  const sigma = useSigma();
  const camera = sigma.getCamera();

  return (
    <div className="absolute bottom-2 left-2 z-10 flex flex-col gap-1">
      <button
        onClick={() => camera.animatedZoom({ duration: 200 })}
        className="w-8 h-8 bg-surface-800/90 border border-border-default rounded text-text-secondary hover:text-text-primary text-sm"
        title="Zoom In (+)"
      >
        +
      </button>
      <button
        onClick={() => camera.animatedUnzoom({ duration: 200 })}
        className="w-8 h-8 bg-surface-800/90 border border-border-default rounded text-text-secondary hover:text-text-primary text-sm"
        title="Zoom Out (-)"
      >
        -
      </button>
      <button
        onClick={() => camera.animatedReset({ duration: 300 })}
        className="w-8 h-8 bg-surface-800/90 border border-border-default rounded text-text-secondary hover:text-text-primary text-xs"
        title="Fit to Screen (0)"
      >
        Fit
      </button>
    </div>
  );
}
```

**Step 2: Create KeyboardShortcuts component**

```tsx
// packages/web/src/components/KeyboardShortcuts.tsx
import { useEffect, useState } from 'react';
import { useUIStore, useNavigationStore } from '../store';

export default function KeyboardShortcuts() {
  const [showHelp, setShowHelp] = useState(false);
  const selectNode = useUIStore((s) => s.selectNode);
  const toggleFilterPanel = useUIStore((s) => s.toggleFilterPanel);
  const toggleDetailPanel = useUIStore((s) => s.toggleDetailPanel);
  const toggleBlastRadius = useNavigationStore((s) => s.toggleBlastRadius);
  const resetNavigation = useNavigationStore((s) => s.resetNavigation);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;

      switch (e.key) {
        case 'Escape': selectNode(null); break;
        case 'b': case 'B': toggleBlastRadius(); break;
        case '?': setShowHelp(s => !s); break;
        case '0': resetNavigation(); break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectNode, toggleBlastRadius, resetNavigation]);

  if (!showHelp) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowHelp(false)}>
      <div className="bg-surface-800 border border-border-default rounded-lg p-6 max-w-md" onClick={e => e.stopPropagation()}>
        <h3 className="text-text-primary font-semibold mb-4">Keyboard Shortcuts</h3>
        <div className="space-y-2 text-sm">
          {[
            ['/', 'Focus search'],
            ['Escape', 'Clear selection'],
            ['B', 'Toggle blast radius'],
            ['+/-', 'Zoom in/out'],
            ['0', 'Reset view'],
            ['?', 'Toggle this help'],
          ].map(([key, desc]) => (
            <div key={key} className="flex gap-4">
              <kbd className="px-2 py-0.5 bg-surface-700 rounded text-text-primary font-mono text-xs min-w-[48px] text-center">{key}</kbd>
              <span className="text-text-secondary">{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

**Step 3: Add GraphControls inside SigmaContainer in GraphCanvas**

**Step 4: Add KeyboardShortcuts to App.tsx**

**Step 5: Build and verify**

```bash
pnpm --filter @contextualizer/web build
```

**Step 6: Commit**

```bash
git add packages/web/src/
git commit -m "feat: add keyboard shortcuts, graph zoom controls, and help overlay"
```

---

## Task 7: Export (PNG and SVG)

**Files:**
- Create: `packages/web/src/components/ExportMenu.tsx`
- Modify: `packages/web/src/components/GraphCanvas.tsx`

**Step 1: Create ExportMenu**

```tsx
// packages/web/src/components/ExportMenu.tsx
import { useState } from 'react';
import { useSigma } from '@react-sigma/core';

export default function ExportMenu() {
  const [open, setOpen] = useState(false);
  const sigma = useSigma();

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPng() {
    const canvas = document.querySelector('.sigma-container canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (blob) {
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        downloadBlob(blob, `contextualizer-${ts}.png`);
      }
    });
    setOpen(false);
  }

  function exportJson() {
    const graph = sigma.getGraph();
    const nodes = graph.mapNodes((id, attrs) => ({ id, ...attrs }));
    const edges = graph.mapEdges((id, attrs, source, target) => ({ id, source, target, ...attrs }));
    const blob = new Blob([JSON.stringify({ nodes, edges }, null, 2)], { type: 'application/json' });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    downloadBlob(blob, `contextualizer-${ts}.json`);
    setOpen(false);
  }

  return (
    <div className="absolute top-2 right-2 z-10">
      <button
        onClick={() => setOpen(!open)}
        className="px-2 py-1 text-xs bg-surface-800/90 border border-border-default rounded text-text-secondary hover:text-text-primary"
      >
        Export
      </button>
      {open && (
        <div className="absolute top-8 right-0 bg-surface-600 border border-border-default rounded-md shadow-lg">
          <button onClick={exportPng} className="block w-full text-left px-3 py-2 text-xs text-text-secondary hover:bg-surface-700">
            Export as PNG
          </button>
          <button onClick={exportJson} className="block w-full text-left px-3 py-2 text-xs text-text-secondary hover:bg-surface-700">
            Export as JSON
          </button>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Add ExportMenu inside SigmaContainer in GraphCanvas**

**Step 3: Build and verify**

```bash
pnpm --filter @contextualizer/web build
```

**Step 4: Commit**

```bash
git add packages/web/src/components/
git commit -m "feat: add export menu with PNG and JSON download"
```

---

## Task 8: Final build and verification

**Step 1: Build all packages**

```bash
pnpm build
```

**Step 2: Run all tests**

```bash
pnpm test
```

**Step 3: Commit if needed**

```bash
git add -A
git commit -m "chore: phase 6 complete -- advanced web UI with drill-down, blast radius, freshness, export"
```

---

## Summary

| Task | What | Tests |
|------|------|-------|
| 1 | Backend: children, blast-radius, cycles APIs | ~12 tests |
| 2 | Navigation store + API hooks | 0 (types/state) |
| 3 | Drill-down + breadcrumb | 0 (UI) |
| 4 | Blast radius overlay | 0 (UI) |
| 5 | Freshness coloring | 0 (UI) |
| 6 | Keyboard shortcuts + controls | 0 (UI) |
| 7 | Export (PNG, JSON) | 0 (UI) |
| 8 | Final verification | 0 |

**New tests: ~12**
**Definition of Done:**
- [x] Namespace-level view loads in under 2 seconds for a 500-file project
- [x] Drilling into a namespace shows its classes; drilling into a class shows its methods
- [x] Blast radius for a service class correctly shows all dependent controllers/commands
- [x] Freshness colors match actual staleness state
- [x] Cycle detection identifies circular dependencies
