# Query-Based Landscape Views Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace manual node-list saved views with query-based landscape views that trace flows through the dependency graph from a root node.

**Architecture:** A new `traceFlow` query performs BFS/DFS traversal from a root node, following configurable edge types to a configurable depth. Views store the query definition (root + edgeTypes + depth + direction) instead of static node IDs. The web UI renders trace results on the existing Sigma graph with highlighting. MCP tools updated to create query-based views.

**Tech Stack:** TypeScript, graphology, Sigma.js, Zustand, React Query, Fastify, Vitest

---

### Task 1: Create the `traceFlow` Query Function

**Files:**
- Create: `packages/analyzer/src/query/trace-flow.ts`
- Test: `packages/analyzer/src/query/__tests__/trace-flow.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/analyzer/src/query/__tests__/trace-flow.test.ts
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
```

**Step 2: Run test to verify it fails**

Run: `cd packages/analyzer && npx vitest run src/query/__tests__/trace-flow.test.ts`
Expected: FAIL with "Cannot find module '../trace-flow.js'"

**Step 3: Write minimal implementation**

```typescript
// packages/analyzer/src/query/trace-flow.ts
import type { GraphStore, StoredNode, StoredEdge } from '@sniffo/storage';
import type { EdgeType } from '@sniffo/core';

export interface TraceFlowOptions {
  edgeTypes: EdgeType[];
  depth: number;
  direction: 'outgoing' | 'incoming' | 'both';
}

export interface TraceFlowResult {
  rootId: string;
  nodes: StoredNode[];
  edges: StoredEdge[];
}

export async function traceFlow(
  store: GraphStore,
  rootId: string,
  options: TraceFlowOptions,
): Promise<TraceFlowResult> {
  const rootNode = await store.getNodeById(rootId);
  if (!rootNode) {
    return { rootId, nodes: [], edges: [] };
  }

  const edgeTypeSet = new Set(options.edgeTypes as string[]);
  const visitedNodes = new Set<string>([rootId]);
  const collectedEdges = new Map<string, StoredEdge>();
  let frontier = [rootId];

  for (let d = 0; d < options.depth && frontier.length > 0; d++) {
    const nextFrontier: string[] = [];

    for (const nodeId of frontier) {
      const candidateEdges: StoredEdge[] = [];

      if (options.direction === 'outgoing' || options.direction === 'both') {
        const outgoing = await store.getOutgoingEdges(nodeId);
        candidateEdges.push(...outgoing);
      }

      if (options.direction === 'incoming' || options.direction === 'both') {
        const incoming = await store.getIncomingEdges(nodeId);
        candidateEdges.push(...incoming);
      }

      for (const edge of candidateEdges) {
        if (!edgeTypeSet.has(edge.type)) continue;

        collectedEdges.set(edge.id, edge);

        const neighborId = edge.source === nodeId ? edge.target : edge.source;
        if (!visitedNodes.has(neighborId)) {
          visitedNodes.add(neighborId);
          nextFrontier.push(neighborId);
        }
      }
    }

    frontier = nextFrontier;
  }

  const nodeMap = new Map<string, StoredNode>();
  nodeMap.set(rootId, rootNode);

  for (const nodeId of visitedNodes) {
    if (nodeMap.has(nodeId)) continue;
    const node = await store.getNodeById(nodeId);
    if (node) nodeMap.set(nodeId, node);
  }

  return {
    rootId,
    nodes: Array.from(nodeMap.values()),
    edges: Array.from(collectedEdges.values()),
  };
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/analyzer && npx vitest run src/query/__tests__/trace-flow.test.ts`
Expected: 7 tests PASS

**Step 5: Export from query index**

Add export to `packages/analyzer/src/query/index.ts` (or wherever queries are exported):

```typescript
export { traceFlow, type TraceFlowOptions, type TraceFlowResult } from './trace-flow.js';
```

Also export from `packages/analyzer/src/index.ts` if queries are re-exported there.

**Step 6: Commit**

```bash
git add packages/analyzer/src/query/trace-flow.ts packages/analyzer/src/query/__tests__/trace-flow.test.ts packages/analyzer/src/index.ts
git commit -m "feat: add traceFlow query for graph traversal from root node"
```

---

### Task 2: Add `/api/trace` Endpoint

**Files:**
- Create: `packages/web-server/src/routes/trace.ts`
- Modify: `packages/web-server/src/server.ts`
- Test: manual (curl)

**Step 1: Create the route handler**

```typescript
// packages/web-server/src/routes/trace.ts
import type { FastifyInstance } from 'fastify';
import type { GraphStore } from '@sniffo/storage';
import { traceFlow } from '@sniffo/analyzer';

export function registerTraceRoutes(app: FastifyInstance, store: GraphStore): void {
  app.get<{
    Params: { id: string };
    Querystring: { edgeTypes?: string; depth?: string; direction?: string };
  }>('/api/trace/:id', async (request, reply) => {
    const { id } = request.params;
    const edgeTypes = request.query.edgeTypes?.split(',') ?? ['CALLS', 'INJECTS', 'IMPORTS'];
    const depth = Math.min(10, Math.max(1, parseInt(request.query.depth ?? '3', 10)));
    const direction = (['outgoing', 'incoming', 'both'].includes(request.query.direction ?? '')
      ? request.query.direction
      : 'outgoing') as 'outgoing' | 'incoming' | 'both';

    const result = await traceFlow(store, id, { edgeTypes: edgeTypes as any[], depth, direction });

    return { success: true, data: result };
  });
}
```

**Step 2: Register the route in server.ts**

In `packages/web-server/src/server.ts`, add:

```typescript
import { registerTraceRoutes } from './routes/trace.js';
// ... in the setup function:
registerTraceRoutes(app, store);
```

**Step 3: Verify the analyzer package exports traceFlow**

Check `packages/analyzer/src/index.ts` exports `traceFlow`. If it uses barrel exports from `./query/index.js`, make sure that file exists and re-exports traceFlow.

**Step 4: Build and verify**

Run: `pnpm build`
Expected: clean build

**Step 5: Commit**

```bash
git add packages/web-server/src/routes/trace.ts packages/web-server/src/server.ts packages/analyzer/src/index.ts
git commit -m "feat: add /api/trace/:id endpoint for flow tracing"
```

---

### Task 3: Update SavedView Schema to Query-Based

**Files:**
- Modify: `packages/web/src/api/types.ts`
- Modify: `packages/web-server/src/routes/views.ts`
- Modify: `packages/mcp-server/src/tools/views.ts`

This task changes the SavedView from a static node list to a query definition. Old views with just `nodeIds` remain loadable for backwards compatibility.

**Step 1: Update the SavedView type**

In `packages/web/src/api/types.ts`, replace the existing `SavedView` interface:

```typescript
export interface SavedView {
  id: string;
  name: string;
  createdAt: string;
  // Query-based definition
  rootNodeId: string;
  rootLabel: string;
  edgeTypes: string[];
  depth: number;
  direction: 'outgoing' | 'incoming' | 'both';
  // Legacy support
  nodeIds?: string[];
}
```

**Step 2: Update the web-server views route**

In `packages/web-server/src/routes/views.ts`, update the POST handler to accept query params:

```typescript
// In the POST handler body type:
// { name, rootNodeId, rootLabel, edgeTypes, depth, direction }
// instead of { name, nodeIds }

app.post('/api/views', async (request, reply) => {
  const { name, rootNodeId, rootLabel, edgeTypes, depth, direction } = request.body as {
    name: string;
    rootNodeId: string;
    rootLabel: string;
    edgeTypes: string[];
    depth: number;
    direction: 'outgoing' | 'incoming' | 'both';
  };

  const views = await loadViews(viewsPath);
  const newView = {
    id: crypto.randomUUID(),
    name,
    rootNodeId,
    rootLabel,
    edgeTypes,
    depth,
    direction,
    createdAt: new Date().toISOString(),
  };
  views.push(newView);
  await saveViews(viewsPath, views);

  return { success: true, data: newView };
});
```

**Step 3: Build and verify**

Run: `pnpm build`
Expected: clean build (may have type errors in ViewsPanel -- those get fixed in Task 5)

**Step 4: Commit**

```bash
git add packages/web/src/api/types.ts packages/web-server/src/routes/views.ts
git commit -m "feat: change SavedView schema from node lists to query definitions"
```

---

### Task 4: Add Trace API Client and Hook

**Files:**
- Modify: `packages/web/src/api/client.ts`
- Modify: `packages/web/src/api/hooks.ts`

**Step 1: Add trace API method**

In `packages/web/src/api/client.ts`:

```typescript
export async function getTrace(
  nodeId: string,
  edgeTypes: string[],
  depth: number,
  direction: string,
): Promise<{ rootId: string; nodes: GraphNode[]; edges: GraphEdge[] }> {
  const params = new URLSearchParams({
    edgeTypes: edgeTypes.join(','),
    depth: String(depth),
    direction,
  });
  const res = await fetch(`${BASE}/api/trace/${nodeId}?${params}`);
  const json = await res.json();
  return json.data;
}
```

**Step 2: Add React Query hook**

In `packages/web/src/api/hooks.ts`:

```typescript
export function useTrace(
  nodeId: string | null,
  edgeTypes: string[],
  depth: number,
  direction: string,
) {
  return useQuery({
    queryKey: ['trace', nodeId, edgeTypes.join(','), depth, direction],
    queryFn: () => getTrace(nodeId!, edgeTypes, depth, direction),
    enabled: !!nodeId,
  });
}
```

**Step 3: Build and verify**

Run: `pnpm build`
Expected: clean build

**Step 4: Commit**

```bash
git add packages/web/src/api/client.ts packages/web/src/api/hooks.ts
git commit -m "feat: add trace API client and useTrace hook"
```

---

### Task 5: Add Trace/View State to Navigation Store

**Files:**
- Modify: `packages/web/src/store/navigation-store.ts`

**Step 1: Add view-related state**

Add to the navigation store:

```typescript
// New state
activeView: SavedView | null;

// New actions
activateView: (view: SavedView) => void;
clearView: () => void;
```

When a view is activated, the graph should show the trace result for that view's query. When cleared, return to normal level-based view.

```typescript
activateView: (view) => set({
  activeView: view,
  drillParentId: null,
  breadcrumbs: [{ nodeId: 'root', label: 'Root', level: 'system' }],
}),
clearView: () => set({ activeView: null }),
```

**Step 2: Build and verify**

Run: `pnpm build`
Expected: clean build

**Step 3: Commit**

```bash
git add packages/web/src/store/navigation-store.ts
git commit -m "feat: add activeView state to navigation store"
```

---

### Task 6: Update GraphCanvas to Render Trace Views

**Files:**
- Modify: `packages/web/src/components/GraphCanvas.tsx`

This is the key integration. When `activeView` is set, GraphCanvas fetches the trace and renders it instead of the level graph.

**Step 1: Add trace data fetching**

In GraphCanvas, after existing hooks:

```typescript
const activeView = useNavigationStore((s) => s.activeView);

const { data: traceData, isLoading: traceLoading } = useTrace(
  activeView?.rootNodeId ?? null,
  activeView?.edgeTypes ?? [],
  activeView?.depth ?? 3,
  activeView?.direction ?? 'outgoing',
);
```

**Step 2: Update the data selection logic**

Replace the existing `isLoading` / `graphData` logic:

```typescript
const isLoading = activeView
  ? traceLoading
  : drillParentId
    ? childrenLoading
    : levelLoading;

const graphData = activeView && traceData
  ? { nodes: traceData.nodes, edges: traceData.edges }
  : drillParentId && childrenData
    ? { nodes: childrenData.children, edges: childrenData.edges }
    : levelData;
```

**Step 3: Build and verify**

Run: `pnpm build`
Expected: clean build

**Step 4: Commit**

```bash
git add packages/web/src/components/GraphCanvas.tsx
git commit -m "feat: render trace view in GraphCanvas when activeView is set"
```

---

### Task 7: Rewrite ViewsPanel for Query-Based Views

**Files:**
- Modify: `packages/web/src/components/ViewsPanel.tsx`

The ViewsPanel changes from "save selected nodes" to "create a trace from selected node".

**Step 1: Rewrite ViewsPanel**

```typescript
// packages/web/src/components/ViewsPanel.tsx
import { useState } from 'react';
import { useViews, useCreateView, useDeleteView } from '../api/hooks';
import { useUIStore, useNavigationStore } from '../store';
import type { SavedView } from '../api/types';

const TRACE_EDGE_OPTIONS = [
  { value: 'CALLS', label: 'Calls' },
  { value: 'IMPORTS', label: 'Imports' },
  { value: 'INJECTS', label: 'Injects' },
  { value: 'EXTENDS', label: 'Extends' },
  { value: 'IMPLEMENTS', label: 'Implements' },
  { value: 'DEPENDS_ON', label: 'Depends On' },
  { value: 'INSTANTIATES', label: 'Instantiates' },
];

export default function ViewsPanel() {
  const selectedNodeId = useUIStore((s) => s.selectedNodeId);
  const activateView = useNavigationStore((s) => s.activateView);
  const clearView = useNavigationStore((s) => s.clearView);
  const activeView = useNavigationStore((s) => s.activeView);

  const { data: views } = useViews();
  const createView = useCreateView();
  const deleteView = useDeleteView();

  const [name, setName] = useState('');
  const [depth, setDepth] = useState(3);
  const [direction, setDirection] = useState<'outgoing' | 'incoming' | 'both'>('outgoing');
  const [edgeTypes, setEdgeTypes] = useState<string[]>(['CALLS', 'INJECTS', 'IMPORTS']);

  const toggleEdgeType = (type: string) => {
    setEdgeTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  };

  const handleCreate = () => {
    if (!name.trim() || !selectedNodeId) return;
    createView.mutate({
      name: name.trim(),
      rootNodeId: selectedNodeId,
      rootLabel: selectedNodeId, // Will be resolved from graph
      edgeTypes,
      depth,
      direction,
    });
    setName('');
  };

  const handleActivate = (view: SavedView) => {
    activateView(view);
  };

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
        Landscape Views
      </h3>

      {/* Create new view - needs a selected node as root */}
      {selectedNodeId ? (
        <div className="space-y-2 p-2 bg-surface-secondary rounded">
          <p className="text-xs text-text-secondary">
            Trace from selected node
          </p>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="View name..."
            className="w-full px-2 py-1 text-xs bg-surface-primary border border-border rounded text-text-primary"
          />
          <div className="space-y-1">
            <label className="text-xs text-text-secondary">Direction</label>
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value as any)}
              className="w-full px-2 py-1 text-xs bg-surface-primary border border-border rounded text-text-primary"
            >
              <option value="outgoing">Outgoing (what does it call?)</option>
              <option value="incoming">Incoming (what calls it?)</option>
              <option value="both">Both directions</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-text-secondary">Depth: {depth}</label>
            <input
              type="range"
              min={1}
              max={8}
              value={depth}
              onChange={(e) => setDepth(Number(e.target.value))}
              className="w-full"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-text-secondary">Edge types</label>
            <div className="flex flex-wrap gap-1">
              {TRACE_EDGE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => toggleEdgeType(opt.value)}
                  className={`px-1.5 py-0.5 text-xs rounded ${
                    edgeTypes.includes(opt.value)
                      ? 'bg-accent-blue text-white'
                      : 'bg-surface-primary text-text-secondary border border-border'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={handleCreate}
            disabled={!name.trim()}
            className="w-full px-2 py-1 text-xs bg-accent-blue text-white rounded disabled:opacity-40"
          >
            Save View
          </button>
        </div>
      ) : (
        <p className="text-xs text-text-secondary">
          Click a node to create a trace view from it
        </p>
      )}

      {/* Active view indicator */}
      {activeView && (
        <div className="flex items-center justify-between p-2 bg-accent-blue/20 border border-accent-blue/40 rounded">
          <span className="text-xs text-accent-blue font-medium truncate">
            {activeView.name}
          </span>
          <button
            onClick={clearView}
            className="text-xs text-text-secondary hover:text-text-primary ml-2"
          >
            Clear
          </button>
        </div>
      )}

      {/* Saved views list */}
      {views && views.length > 0 && (
        <div className="space-y-1">
          {views.map((view) => (
            <div
              key={view.id}
              className={`flex items-center justify-between p-2 rounded cursor-pointer text-xs
                ${activeView?.id === view.id ? 'bg-accent-blue/20' : 'bg-surface-secondary hover:bg-surface-tertiary'}`}
              onClick={() => handleActivate(view)}
            >
              <div className="truncate">
                <span className="text-text-primary">{view.name}</span>
                <span className="text-text-secondary ml-1">
                  ({view.direction}, d={view.depth})
                </span>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); deleteView.mutate(view.id); }}
                className="text-text-secondary hover:text-red-400 ml-2"
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Update the createView API call**

In `packages/web/src/api/client.ts`, update `createView` to send query params instead of nodeIds:

```typescript
export async function createView(view: {
  name: string;
  rootNodeId: string;
  rootLabel: string;
  edgeTypes: string[];
  depth: number;
  direction: string;
}): Promise<SavedView> {
  const res = await fetch(`${BASE}/api/views`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(view),
  });
  const json = await res.json();
  return json.data;
}
```

**Step 3: Resolve rootLabel from the graph**

In ViewsPanel, get the selected node's label from the sigma graph. Add to the create handler:

```typescript
// Get label from sigma graph or use nodeId as fallback
// The sigma graph has the label attribute set in graph-builder.ts
```

Actually, simpler: read it from the DetailPanel's node data. The `useNodeDetail` hook already fetches node info. Use the store's selectedNodeId to get the label from the graph.

Add to ViewsPanel:

```typescript
import { useSigma } from '@react-sigma/core';
// But ViewsPanel is outside SigmaContainer, so can't use useSigma.
// Instead, store the selected node's label in the UI store.
```

The cleanest approach: when creating, fetch the node label from the node detail API. Or store `selectedNodeLabel` alongside `selectedNodeId` in the UI store.

Add to `packages/web/src/store/graph-store.ts`:

```typescript
// In the UIState interface, alongside selectedNodeId:
selectedNodeLabel: string | null;

// In selectNode action:
selectNode: (id: string | null, label?: string) => set({ selectedNodeId: id, selectedNodeLabel: label ?? null }),
```

Then in GraphEvents (GraphCanvas.tsx), when calling selectNode:

```typescript
clickNode: ({ node, event }) => {
  const graph = sigma.getGraph();
  const label = graph.getNodeAttribute(node, 'label') ?? node;
  if (event.original.shiftKey) {
    toggleNodeSelection(node);
  } else {
    selectNode(node, label);
  }
},
```

And in ViewsPanel:

```typescript
const selectedNodeLabel = useUIStore((s) => s.selectedNodeLabel);

// In handleCreate:
createView.mutate({
  name: name.trim(),
  rootNodeId: selectedNodeId,
  rootLabel: selectedNodeLabel ?? selectedNodeId,
  edgeTypes,
  depth,
  direction,
});
```

**Step 4: Build and verify**

Run: `pnpm build`
Expected: clean build

**Step 5: Commit**

```bash
git add packages/web/src/components/ViewsPanel.tsx packages/web/src/api/client.ts packages/web/src/store/graph-store.ts packages/web/src/components/GraphCanvas.tsx
git commit -m "feat: rewrite ViewsPanel for query-based landscape views"
```

---

### Task 8: Update MCP Tools for Query-Based Views

**Files:**
- Modify: `packages/mcp-server/src/tools/views.ts`
- Modify: `skills/views/SKILL.md`

**Step 1: Update create_view tool**

Replace the current `create_view` implementation that searches symbols and stores nodeIds. The new version accepts a root symbol name, edge types, depth, and direction.

```typescript
// In packages/mcp-server/src/tools/views.ts
// Update the create_view tool registration:

server.tool(
  'create_view',
  'Create a landscape view that traces a flow from a root symbol',
  {
    name: z.string().describe('Name for the view (e.g., "Payment Flow")'),
    rootSymbol: z.string().describe('Name of the root symbol to trace from'),
    edgeTypes: z.array(z.string()).optional().describe('Edge types to follow (default: CALLS, INJECTS, IMPORTS)'),
    depth: z.number().optional().describe('Max traversal depth (default: 3, max: 10)'),
    direction: z.enum(['outgoing', 'incoming', 'both']).optional().describe('Traversal direction (default: outgoing)'),
  },
  async ({ name, rootSymbol, edgeTypes, depth, direction }) => {
    // 1. Resolve the root symbol
    const searchResults = await searchSymbols(store, rootSymbol);
    if (searchResults.length === 0) {
      return { content: [{ type: 'text', text: `No symbol found matching "${rootSymbol}"` }] };
    }

    const rootNode = searchResults[0]; // Best match
    const resolvedEdgeTypes = edgeTypes ?? ['CALLS', 'INJECTS', 'IMPORTS'];
    const resolvedDepth = Math.min(10, Math.max(1, depth ?? 3));
    const resolvedDirection = direction ?? 'outgoing';

    // 2. Run the trace to show what the view contains
    const traceResult = await traceFlow(store, rootNode.id, {
      edgeTypes: resolvedEdgeTypes as any[],
      depth: resolvedDepth,
      direction: resolvedDirection,
    });

    // 3. Save the view
    const viewsPath = join(projectDir, '.sniffo', 'views.json');
    const views = await loadViews(viewsPath);
    const newView = {
      id: crypto.randomUUID(),
      name,
      rootNodeId: rootNode.id,
      rootLabel: rootNode.shortName,
      edgeTypes: resolvedEdgeTypes,
      depth: resolvedDepth,
      direction: resolvedDirection,
      createdAt: new Date().toISOString(),
    };
    views.push(newView);
    await saveViews(viewsPath, views);

    const nodeNames = traceResult.nodes.map(n => n.shortName).join(', ');
    return {
      content: [{
        type: 'text',
        text: `Created view "${name}" (${traceResult.nodes.length} nodes, ${traceResult.edges.length} edges)\n` +
              `Root: ${rootNode.shortName}\n` +
              `Direction: ${resolvedDirection}, Depth: ${resolvedDepth}\n` +
              `Edge types: ${resolvedEdgeTypes.join(', ')}\n` +
              `Nodes: ${nodeNames}`,
      }],
    };
  },
);
```

Note: You need to import `traceFlow` from `@sniffo/analyzer` and add `loadViews`/`saveViews` helpers (same as in web-server views route -- consider extracting to a shared utility, or just duplicate the simple file read/write).

**Step 2: Update the views skill**

Replace `skills/views/SKILL.md`:

```markdown
---
name: views
description: Create and manage landscape views -- query-based traces through the dependency graph starting from a root symbol. Use when the user wants to map out a flow, trace dependencies, or visualize how a feature connects.
---

# Landscape Views

Landscape views are query-based traces through the dependency graph. Instead of manually picking nodes, you define a starting point and the view automatically traces all connected symbols.

## Creating a view

1. Use `search_symbols` to find the root symbol (e.g., "PaymentController")
2. Use `create_view` with the root symbol and trace parameters

Example:
```
create_view({
  name: "Payment Flow",
  rootSymbol: "PaymentController",
  edgeTypes: ["CALLS", "INJECTS"],
  depth: 4,
  direction: "outgoing"
})
```

This traces outgoing CALLS and INJECTS from PaymentController up to 4 levels deep.

## Direction options

- **outgoing**: "What does this call?" -- traces forward through the flow
- **incoming**: "What calls this?" -- traces backwards to find dependents
- **both**: Full neighborhood in both directions

## Common patterns

| View | Root | Direction | Edge Types | Depth |
|------|------|-----------|------------|-------|
| Feature flow | Controller | outgoing | CALLS, INJECTS | 4 |
| Impact analysis | Service | incoming | CALLS, DEPENDS_ON | 3 |
| Inheritance tree | Interface | incoming | IMPLEMENTS, EXTENDS | 5 |
| Full context | Any class | both | CALLS, INJECTS, IMPORTS | 2 |

## Listing and deleting views

- `list_views` -- shows all saved views with their query parameters
- `delete_view` -- removes a view by ID

## Tips

- Start with depth 3 and increase if the trace looks incomplete
- Use "outgoing" for "how does this work?" questions
- Use "incoming" for "what breaks if I change this?" questions
- Views are stored in `.sniffo/views.json` and visible in the web UI
```

**Step 3: Update list_views tool output**

Update the list_views tool to show query params instead of node counts:

```typescript
const formatted = views.map(v =>
  `${v.name} (${v.direction}, depth=${v.depth}, edges=${(v.edgeTypes ?? []).join(',')}) [${v.id}]`
).join('\n');
```

**Step 4: Build and verify**

Run: `pnpm build`
Expected: clean build

**Step 5: Commit**

```bash
git add packages/mcp-server/src/tools/views.ts skills/views/SKILL.md
git commit -m "feat: update MCP views tools for query-based landscape views"
```

---

### Task 9: Integration Test -- Full Flow

**Files:**
- No new files

**Step 1: Build everything**

Run: `pnpm build`
Expected: all 7 packages build clean

**Step 2: Run all tests**

Run: `pnpm test`
Expected: all tests pass (existing + new trace-flow tests)

**Step 3: Manual test**

1. Start the web UI: `pnpm --filter @sniffo/cli start -- serve`
2. Open browser to localhost:3100
3. Navigate to Component level -- verify edges now appear between components
4. Click a node -- verify it's selected
5. In the ViewsPanel, set trace parameters and save a view
6. Click the saved view -- verify the graph shows only the traced subgraph
7. Click "Clear" -- verify return to normal view

**Step 4: Final commit and version bump**

```bash
pnpm build && pnpm test
# If all good:
# Bump version in all 7 package.json files
git add -A
git commit -m "chore: bump to 0.3.0"
git tag v0.3.0
git push && git push origin v0.3.0
```

---

### Notes for the implementer

**Backwards compatibility**: Old views in `.sniffo/views.json` that have `nodeIds` but no `rootNodeId` should be handled gracefully. In the web UI, skip rendering them or show them as "(legacy)" entries that can be deleted but not activated.

**The `traceFlow` function is the core**: Everything else is plumbing. If the trace query works correctly, the rest is UI wiring.

**Do NOT add new npm dependencies**: The existing graphology + Sigma.js + ForceAtlas2 stack handles rendering. No need for dagre or other layout libraries at this stage.

**Edge type filtering in graph-builder.ts**: The trace endpoint returns edges with their original types (CALLS, IMPORTS, etc.), not just DEPENDS_ON. The graph-builder already handles these types via `getEdgeColor()`, so no changes needed there.
