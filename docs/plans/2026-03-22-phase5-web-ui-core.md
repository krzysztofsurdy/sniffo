# Phase 5: Web UI Core Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a functional web interface that renders the knowledge graph with Sigma.js, allows node search, shows detail panels, and integrates with `sniffo serve`.

**Architecture:** New `@sniffo/web` package using React 18 + Vite + Tailwind CSS + Sigma.js + Graphology. The Fastify web-server serves the built static files. Dark-mode-first design matching the spec in `docs/ui-ux-design-system.md`.

**Tech Stack:** React 18, Vite 6, Tailwind CSS 4, @sigma/react, graphology, graphology-layout-forceatlas2, @tanstack/react-query, zustand

**Reference docs:**
- `docs/frontend-specification.md` -- full component architecture
- `docs/ui-ux-design-system.md` -- colors, typography, node/edge visual spec
- `docs/delivery-plan.md` lines 150-184 -- Phase 5 definition of done

---

## Task 1: Scaffold @sniffo/web package

**Files:**
- Create: `packages/web/package.json`
- Create: `packages/web/vite.config.ts`
- Create: `packages/web/tsconfig.json`
- Create: `packages/web/tsconfig.node.json`
- Create: `packages/web/index.html`
- Create: `packages/web/src/main.tsx`
- Create: `packages/web/src/App.tsx`
- Create: `packages/web/src/index.css`
- Create: `packages/web/postcss.config.js`

**Step 1: Create package.json**

```json
{
  "name": "@sniffo/web",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@sigma/react": "^1.0.0",
    "@tanstack/react-query": "^5.64.0",
    "graphology": "^0.25.4",
    "graphology-layout-forceatlas2": "^0.10.1",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.18",
    "@types/react-dom": "^18.3.5",
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0"
  }
}
```

**Step 2: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:3100',
    },
  },
});
```

**Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

**Step 4: Create tsconfig.node.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["vite.config.ts"]
}
```

**Step 5: Create index.html**

```html
<!DOCTYPE html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Sniffo</title>
  </head>
  <body class="bg-[#0D1117] text-[#E6EDF3] antialiased">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Step 6: Create src/index.css**

```css
@import "tailwindcss";

@theme {
  --color-surface-900: #0D1117;
  --color-surface-800: #161B22;
  --color-surface-700: #21262D;
  --color-surface-600: #282E36;
  --color-border-default: #30363D;
  --color-border-muted: #21262D;
  --color-text-primary: #E6EDF3;
  --color-text-secondary: #8B949E;
  --color-text-tertiary: #6E7681;
  --color-text-link: #58A6FF;
  --color-node-class: #7C3AED;
  --color-node-interface: #06B6D4;
  --color-node-trait: #F59E0B;
  --color-node-method: #3B82F6;
  --color-node-file: #10B981;
  --color-node-folder: #64748B;
  --color-node-namespace: #A78BFA;
  --color-node-service: #EC4899;
  --color-fresh: #2EA043;
  --color-aging: #D29922;
  --color-stale: #F85149;
}

body {
  margin: 0;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif;
}

code {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
}
```

**Step 7: Create postcss.config.js**

```javascript
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
```

Note: Tailwind CSS v4 uses `@tailwindcss/postcss` instead of the old `tailwindcss` plugin. Add `"@tailwindcss/postcss": "^4.0.0"` to devDependencies as well.

**Step 8: Create src/main.tsx**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
```

**Step 9: Create src/App.tsx**

```tsx
export default function App() {
  return (
    <div className="h-screen w-screen flex flex-col bg-surface-900">
      <header className="h-10 flex items-center px-4 bg-surface-800 border-b border-border-default">
        <h1 className="text-sm font-semibold text-text-primary">Sniffo</h1>
      </header>
      <main className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex items-center justify-center text-text-secondary">
          Graph canvas will render here
        </div>
      </main>
    </div>
  );
}
```

**Step 10: Install dependencies and verify dev server starts**

```bash
cd /Users/krzysztofsurdy/ProjectsPrivate/llmProjectSniffo
pnpm install
cd packages/web
pnpm dev -- --host 127.0.0.1 --port 5173 &
# Verify http://127.0.0.1:5173 loads, then kill the dev server
kill %1
```

**Step 11: Verify build works**

```bash
cd /Users/krzysztofsurdy/ProjectsPrivate/llmProjectSniffo
pnpm --filter @sniffo/web build
```

**Step 12: Commit**

```bash
git add packages/web/
git commit -m "feat: scaffold @sniffo/web package with React, Vite, Tailwind CSS v4"
```

---

## Task 2: API client and data types

**Files:**
- Create: `packages/web/src/api/client.ts`
- Create: `packages/web/src/api/types.ts`
- Create: `packages/web/src/api/hooks.ts`

**Step 1: Create API types**

```typescript
// packages/web/src/api/types.ts

export interface GraphNode {
  id: string;
  type: string;
  level: string;
  qualifiedName: string;
  shortName: string;
  filePath: string;
  startLine: number;
  endLine: number;
  contentHash: string;
  isStale: boolean;
  lastAnalyzedAt: string;
  metadata: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  level: string;
  weight: number;
  metadata: Record<string, unknown>;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface NodeDetail {
  node: GraphNode;
  incoming: GraphEdge[];
  outgoing: GraphEdge[];
}

export interface StalenessReport {
  totalNodes: number;
  staleNodes: Array<{ id: string; qualifiedName: string; filePath: string }>;
  stalePercentage: number;
  lastAnalysisRun: { startedAt: string; trigger: string } | null;
}

export interface AnalysisResult {
  filesScanned: number;
  filesAnalyzed: number;
  filesSkipped: number;
  filesFailed: number;
  symbolsFound: number;
  referencesFound: number;
  durationMs: number;
  errors: Array<{ phase: string; filePath: string; message: string }>;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}
```

**Step 2: Create API client**

```typescript
// packages/web/src/api/client.ts

import type { ApiResponse, GraphData, GraphNode, NodeDetail, StalenessReport, AnalysisResult } from './types';

const BASE_URL = '/api';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${url}`, init);
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  const json = await res.json() as ApiResponse<T>;
  if (!json.success) {
    throw new Error(json.error ?? 'Unknown API error');
  }
  return json.data;
}

export const api = {
  getGraph: (level: string) => fetchJson<GraphData>(`/graph/${level}`),
  getNode: (id: string) => fetchJson<NodeDetail>(`/node/${encodeURIComponent(id)}`),
  search: (query: string) => fetchJson<GraphNode[]>(`/search?q=${encodeURIComponent(query)}`),
  getStatus: () => fetchJson<StalenessReport>('/status'),
  refresh: (files?: string[]) =>
    fetchJson<AnalysisResult>('/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files }),
    }),
};
```

**Step 3: Create React Query hooks**

```typescript
// packages/web/src/api/hooks.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

export function useGraphData(level: string) {
  return useQuery({
    queryKey: ['graph', level],
    queryFn: () => api.getGraph(level),
  });
}

export function useNodeDetail(nodeId: string | null) {
  return useQuery({
    queryKey: ['node', nodeId],
    queryFn: () => api.getNode(nodeId!),
    enabled: !!nodeId,
  });
}

export function useSearch(query: string) {
  return useQuery({
    queryKey: ['search', query],
    queryFn: () => api.search(query),
    enabled: query.length >= 2,
  });
}

export function useStatus() {
  return useQuery({
    queryKey: ['status'],
    queryFn: () => api.getStatus(),
    refetchInterval: 60_000,
  });
}

export function useRefresh() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (files?: string[]) => api.refresh(files),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['graph'] });
      queryClient.invalidateQueries({ queryKey: ['status'] });
    },
  });
}
```

**Step 4: Commit**

```bash
git add packages/web/src/api/
git commit -m "feat: add API client, types, and React Query hooks for web UI"
```

---

## Task 3: Zustand store for UI state

**Files:**
- Create: `packages/web/src/store/graph-store.ts`
- Create: `packages/web/src/store/index.ts`

**Step 1: Create graph store**

```typescript
// packages/web/src/store/graph-store.ts

import { create } from 'zustand';

export interface UIState {
  // Current graph level being viewed
  currentLevel: string;
  setCurrentLevel: (level: string) => void;

  // Selected node
  selectedNodeId: string | null;
  selectNode: (id: string | null) => void;

  // Selected edge
  selectedEdgeId: string | null;
  selectEdge: (id: string | null) => void;

  // Filter visibility
  visibleNodeTypes: Set<string>;
  toggleNodeType: (type: string) => void;
  setAllNodeTypes: (types: string[]) => void;
  clearNodeTypes: () => void;

  visibleEdgeTypes: Set<string>;
  toggleEdgeType: (type: string) => void;
  setAllEdgeTypes: (types: string[]) => void;
  clearEdgeTypes: () => void;

  // Search
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchFocusedNodeId: string | null;
  focusSearchResult: (id: string | null) => void;

  // Panel visibility
  filterPanelOpen: boolean;
  toggleFilterPanel: () => void;
  detailPanelOpen: boolean;
  toggleDetailPanel: () => void;
}

const ALL_NODE_TYPES = ['CLASS', 'INTERFACE', 'TRAIT', 'ENUM', 'FUNCTION', 'METHOD', 'PROPERTY', 'CONSTANT', 'MODULE', 'SYSTEM'];
const ALL_EDGE_TYPES = ['CALLS', 'EXTENDS', 'IMPLEMENTS', 'USES_TRAIT', 'INJECTS', 'IMPORTS', 'DEPENDS_ON', 'CONTAINS', 'INSTANTIATES'];

export const useUIStore = create<UIState>((set) => ({
  currentLevel: 'component',
  setCurrentLevel: (level) => set({ currentLevel: level, selectedNodeId: null, selectedEdgeId: null }),

  selectedNodeId: null,
  selectNode: (id) => set({ selectedNodeId: id, selectedEdgeId: null }),

  selectedEdgeId: null,
  selectEdge: (id) => set({ selectedEdgeId: id, selectedNodeId: null }),

  visibleNodeTypes: new Set(ALL_NODE_TYPES),
  toggleNodeType: (type) =>
    set((state) => {
      const next = new Set(state.visibleNodeTypes);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return { visibleNodeTypes: next };
    }),
  setAllNodeTypes: (types) => set({ visibleNodeTypes: new Set(types) }),
  clearNodeTypes: () => set({ visibleNodeTypes: new Set() }),

  visibleEdgeTypes: new Set(ALL_EDGE_TYPES),
  toggleEdgeType: (type) =>
    set((state) => {
      const next = new Set(state.visibleEdgeTypes);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return { visibleEdgeTypes: next };
    }),
  setAllEdgeTypes: (types) => set({ visibleEdgeTypes: new Set(types) }),
  clearEdgeTypes: () => set({ visibleEdgeTypes: new Set() }),

  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),
  searchFocusedNodeId: null,
  focusSearchResult: (id) => set({ searchFocusedNodeId: id }),

  filterPanelOpen: true,
  toggleFilterPanel: () => set((s) => ({ filterPanelOpen: !s.filterPanelOpen })),
  detailPanelOpen: true,
  toggleDetailPanel: () => set((s) => ({ detailPanelOpen: !s.detailPanelOpen })),
}));
```

**Step 2: Create index barrel**

```typescript
// packages/web/src/store/index.ts
export { useUIStore } from './graph-store';
export type { UIState } from './graph-store';
```

**Step 3: Commit**

```bash
git add packages/web/src/store/
git commit -m "feat: add Zustand UI state store for graph navigation, filters, selection"
```

---

## Task 4: Graph canvas with Sigma.js

**Files:**
- Create: `packages/web/src/components/GraphCanvas.tsx`
- Create: `packages/web/src/lib/graph-builder.ts`
- Create: `packages/web/src/lib/node-colors.ts`
- Modify: `packages/web/src/App.tsx`

**Step 1: Create node color map**

```typescript
// packages/web/src/lib/node-colors.ts

export const NODE_COLORS: Record<string, string> = {
  CLASS: '#7C3AED',
  INTERFACE: '#06B6D4',
  TRAIT: '#F59E0B',
  ENUM: '#F59E0B',
  FUNCTION: '#3B82F6',
  METHOD: '#3B82F6',
  PROPERTY: '#64748B',
  CONSTANT: '#64748B',
  MODULE: '#A78BFA',
  SYSTEM: '#EC4899',
};

export const EDGE_COLORS: Record<string, string> = {
  CALLS: '#4B7BEC',
  EXTENDS: '#A55EEA',
  IMPLEMENTS: '#26DE81',
  USES_TRAIT: '#778CA3',
  INJECTS: '#FD9644',
  CONTAINS: '#45526E',
  IMPORTS: '#20BF6B',
  DEPENDS_ON: '#778CA3',
  INSTANTIATES: '#4B7BEC',
};

export function getNodeColor(type: string): string {
  return NODE_COLORS[type] ?? '#64748B';
}

export function getEdgeColor(type: string): string {
  return EDGE_COLORS[type] ?? '#45526E';
}
```

**Step 2: Create graph builder (converts API data to Graphology)**

```typescript
// packages/web/src/lib/graph-builder.ts

import Graph from 'graphology';
import type { GraphData } from '../api/types';
import { getNodeColor, getEdgeColor } from './node-colors';

export function buildGraphology(data: GraphData, visibleNodeTypes: Set<string>, visibleEdgeTypes: Set<string>): Graph {
  const graph = new Graph({ multi: true });

  const visibleNodeIds = new Set<string>();

  for (const node of data.nodes) {
    if (!visibleNodeTypes.has(node.type)) continue;
    visibleNodeIds.add(node.id);

    graph.addNode(node.id, {
      label: node.shortName,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: node.type === 'SYSTEM' ? 12 : node.type === 'MODULE' ? 8 : 5,
      color: getNodeColor(node.type),
      nodeType: node.type,
      qualifiedName: node.qualifiedName,
      filePath: node.filePath,
      isStale: node.isStale,
    });
  }

  for (const edge of data.edges) {
    if (!visibleEdgeTypes.has(edge.type)) continue;
    if (!visibleNodeIds.has(edge.source) || !visibleNodeIds.has(edge.target)) continue;
    if (edge.source === edge.target) continue;

    try {
      graph.addEdge(edge.source, edge.target, {
        label: edge.type,
        color: getEdgeColor(edge.type),
        size: Math.max(1, edge.weight),
        edgeType: edge.type,
      });
    } catch {
      // Duplicate edge -- skip
    }
  }

  return graph;
}
```

**Step 3: Create GraphCanvas component**

```tsx
// packages/web/src/components/GraphCanvas.tsx

import { useEffect, useRef, useMemo, useCallback } from 'react';
import Graph from 'graphology';
import Sigma from 'sigma';
import FA2Layout from 'graphology-layout-forceatlas2/worker';
import { useGraphData } from '../api/hooks';
import { useUIStore } from '../store';
import { buildGraphology } from '../lib/graph-builder';

export default function GraphCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const layoutRef = useRef<FA2Layout | null>(null);

  const currentLevel = useUIStore((s) => s.currentLevel);
  const visibleNodeTypes = useUIStore((s) => s.visibleNodeTypes);
  const visibleEdgeTypes = useUIStore((s) => s.visibleEdgeTypes);
  const selectNode = useUIStore((s) => s.selectNode);
  const selectedNodeId = useUIStore((s) => s.selectedNodeId);
  const searchFocusedNodeId = useUIStore((s) => s.searchFocusedNodeId);

  const { data, isLoading } = useGraphData(currentLevel);

  const graph = useMemo(() => {
    if (!data) return new Graph({ multi: true });
    return buildGraphology(data, visibleNodeTypes, visibleEdgeTypes);
  }, [data, visibleNodeTypes, visibleEdgeTypes]);

  useEffect(() => {
    if (!containerRef.current) return;

    if (sigmaRef.current) {
      sigmaRef.current.kill();
    }
    if (layoutRef.current) {
      layoutRef.current.kill();
    }

    const sigma = new Sigma(graph, containerRef.current, {
      renderLabels: true,
      labelColor: { color: '#E6EDF3' },
      labelFont: 'Inter, sans-serif',
      labelSize: 12,
      defaultEdgeType: 'arrow',
      defaultEdgeColor: '#45526E',
      stagePadding: 40,
    });

    sigma.on('clickNode', ({ node }) => {
      selectNode(node);
    });

    sigma.on('clickStage', () => {
      selectNode(null);
    });

    sigmaRef.current = sigma;

    if (graph.order > 0) {
      const layout = new FA2Layout(graph, {
        settings: {
          gravity: 1,
          scalingRatio: 2,
          slowDown: 5,
          barnesHutOptimize: graph.order > 100,
        },
      });
      layout.start();
      layoutRef.current = layout;

      // Stop layout after convergence
      setTimeout(() => {
        if (layoutRef.current?.isRunning()) {
          layoutRef.current.stop();
        }
      }, 5000);
    }

    return () => {
      if (layoutRef.current) {
        layoutRef.current.kill();
        layoutRef.current = null;
      }
      if (sigmaRef.current) {
        sigmaRef.current.kill();
        sigmaRef.current = null;
      }
    };
  }, [graph, selectNode]);

  // Highlight selected node
  useEffect(() => {
    if (!sigmaRef.current) return;
    const sigma = sigmaRef.current;

    sigma.setSetting('nodeReducer', (node, attrs) => {
      if (selectedNodeId && node !== selectedNodeId) {
        return { ...attrs, color: attrs.color + '40', label: '' };
      }
      if (selectedNodeId && node === selectedNodeId) {
        return { ...attrs, size: (attrs.size ?? 5) * 1.5, highlighted: true };
      }
      return attrs;
    });

    sigma.setSetting('edgeReducer', (edge, attrs) => {
      if (selectedNodeId) {
        const src = graph.source(edge);
        const tgt = graph.target(edge);
        if (src !== selectedNodeId && tgt !== selectedNodeId) {
          return { ...attrs, color: '#21262D', hidden: true };
        }
      }
      return attrs;
    });

    sigma.refresh();
  }, [selectedNodeId, graph]);

  // Focus on search result node
  useEffect(() => {
    if (!searchFocusedNodeId || !sigmaRef.current) return;
    const sigma = sigmaRef.current;

    if (graph.hasNode(searchFocusedNodeId)) {
      const nodePos = sigma.getNodeDisplayData(searchFocusedNodeId);
      if (nodePos) {
        sigma.getCamera().animate(
          { x: nodePos.x, y: nodePos.y, ratio: 0.3 },
          { duration: 500 },
        );
        selectNode(searchFocusedNodeId);
      }
    }
  }, [searchFocusedNodeId, graph, selectNode]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-secondary">
        Loading graph...
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 relative" style={{ minHeight: '400px' }} />
  );
}
```

**Step 4: Update App.tsx to include GraphCanvas**

```tsx
// packages/web/src/App.tsx
import GraphCanvas from './components/GraphCanvas';

export default function App() {
  return (
    <div className="h-screen w-screen flex flex-col bg-surface-900">
      <header className="h-10 flex items-center px-4 bg-surface-800 border-b border-border-default">
        <h1 className="text-sm font-semibold text-text-primary">Sniffo</h1>
      </header>
      <main className="flex-1 flex overflow-hidden">
        <GraphCanvas />
      </main>
    </div>
  );
}
```

**Step 5: Build and verify**

```bash
pnpm --filter @sniffo/web build
```

**Step 6: Commit**

```bash
git add packages/web/src/components/ packages/web/src/lib/ packages/web/src/App.tsx
git commit -m "feat: add Sigma.js graph canvas with ForceAtlas2 layout, node selection, search focus"
```

---

## Task 5: Search bar component

**Files:**
- Create: `packages/web/src/components/SearchBar.tsx`
- Modify: `packages/web/src/App.tsx`

**Step 1: Create SearchBar**

```tsx
// packages/web/src/components/SearchBar.tsx

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearch } from '../api/hooks';
import { useUIStore } from '../store';
import { getNodeColor } from '../lib/node-colors';

export default function SearchBar() {
  const [inputValue, setInputValue] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const focusSearchResult = useUIStore((s) => s.focusSearchResult);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(inputValue), 300);
    return () => clearTimeout(timer);
  }, [inputValue]);

  const { data: results } = useSearch(debouncedQuery);

  // Keyboard shortcut: "/" to focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleSelect = useCallback((nodeId: string) => {
    focusSearchResult(nodeId);
    setIsOpen(false);
    setInputValue('');
  }, [focusSearchResult]);

  return (
    <div className="relative w-80">
      <input
        ref={inputRef}
        type="text"
        placeholder="Search symbols... (press /)"
        value={inputValue}
        onChange={(e) => {
          setInputValue(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        className="w-full h-8 px-3 text-sm bg-surface-700 border border-border-default rounded-md text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-link"
      />
      {isOpen && results && results.length > 0 && (
        <div className="absolute top-9 left-0 right-0 bg-surface-600 border border-border-default rounded-md shadow-lg max-h-64 overflow-y-auto z-50">
          {results.slice(0, 20).map((node) => (
            <button
              key={node.id}
              onClick={() => handleSelect(node.id)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-surface-700 flex items-center gap-2"
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: getNodeColor(node.type) }}
              />
              <span className="text-text-primary truncate">{node.shortName}</span>
              <span className="text-text-tertiary text-xs truncate ml-auto">{node.qualifiedName}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Add SearchBar to App header**

Update `App.tsx` header to include `<SearchBar />` between the title and a spacer.

**Step 3: Build and verify**

```bash
pnpm --filter @sniffo/web build
```

**Step 4: Commit**

```bash
git add packages/web/src/components/SearchBar.tsx packages/web/src/App.tsx
git commit -m "feat: add search bar with debounced autocomplete and keyboard shortcut"
```

---

## Task 6: Node detail panel

**Files:**
- Create: `packages/web/src/components/DetailPanel.tsx`
- Modify: `packages/web/src/App.tsx`

**Step 1: Create DetailPanel**

```tsx
// packages/web/src/components/DetailPanel.tsx

import { useNodeDetail } from '../api/hooks';
import { useUIStore } from '../store';
import { getNodeColor, getEdgeColor } from '../lib/node-colors';

export default function DetailPanel() {
  const selectedNodeId = useUIStore((s) => s.selectedNodeId);
  const detailPanelOpen = useUIStore((s) => s.detailPanelOpen);
  const selectNode = useUIStore((s) => s.selectNode);
  const { data, isLoading } = useNodeDetail(selectedNodeId);

  if (!detailPanelOpen) return null;

  if (!selectedNodeId) {
    return (
      <aside className="w-[360px] bg-surface-800 border-l border-border-default p-4 overflow-y-auto">
        <p className="text-text-tertiary text-sm">Click a node to see details</p>
      </aside>
    );
  }

  if (isLoading) {
    return (
      <aside className="w-[360px] bg-surface-800 border-l border-border-default p-4">
        <p className="text-text-secondary text-sm">Loading...</p>
      </aside>
    );
  }

  if (!data) return null;

  const { node, incoming, outgoing } = data;
  const freshnessColor = node.isStale ? '#F85149' : '#2EA043';

  return (
    <aside className="w-[360px] bg-surface-800 border-l border-border-default p-4 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <span
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ backgroundColor: getNodeColor(node.type) }}
        />
        <h2 className="text-text-primary font-semibold text-base truncate">{node.shortName}</h2>
        <button
          onClick={() => selectNode(null)}
          className="ml-auto text-text-tertiary hover:text-text-primary text-sm"
        >
          x
        </button>
      </div>

      {/* Badges */}
      <div className="flex gap-2 mb-4">
        <span className="px-2 py-0.5 text-xs rounded bg-surface-700 text-text-secondary">{node.type}</span>
        <span className="px-2 py-0.5 text-xs rounded bg-surface-700 text-text-secondary">{node.level}</span>
        <span className="w-2 h-2 rounded-full mt-1" style={{ backgroundColor: freshnessColor }} title={node.isStale ? 'Stale' : 'Fresh'} />
      </div>

      {/* FQN */}
      <div className="mb-4">
        <p className="text-text-tertiary text-xs mb-1">Qualified Name</p>
        <p className="text-text-primary text-sm font-mono break-all">{node.qualifiedName}</p>
      </div>

      {/* Location */}
      <div className="mb-4">
        <p className="text-text-tertiary text-xs mb-1">Location</p>
        <p className="text-text-link text-sm font-mono">{node.filePath}:{node.startLine}-{node.endLine}</p>
      </div>

      {/* Last Analyzed */}
      <div className="mb-4">
        <p className="text-text-tertiary text-xs mb-1">Last Analyzed</p>
        <p className="text-text-secondary text-sm">{new Date(node.lastAnalyzedAt).toLocaleString()}</p>
      </div>

      {/* Connections */}
      <div className="mb-4">
        <p className="text-text-tertiary text-xs mb-1">Connections</p>
        <p className="text-text-secondary text-sm">{incoming.length} incoming, {outgoing.length} outgoing</p>
      </div>

      {/* Incoming edges */}
      {incoming.length > 0 && (
        <div className="mb-4">
          <p className="text-text-tertiary text-xs mb-2">Incoming ({incoming.length})</p>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {incoming.map((edge) => (
              <button
                key={edge.id}
                onClick={() => selectNode(edge.source)}
                className="w-full text-left px-2 py-1 text-xs hover:bg-surface-700 rounded flex items-center gap-1"
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: getEdgeColor(edge.type) }} />
                <span className="text-text-secondary">{edge.type}</span>
                <span className="text-text-link truncate ml-1">{edge.source.slice(0, 16)}...</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Outgoing edges */}
      {outgoing.length > 0 && (
        <div className="mb-4">
          <p className="text-text-tertiary text-xs mb-2">Outgoing ({outgoing.length})</p>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {outgoing.map((edge) => (
              <button
                key={edge.id}
                onClick={() => selectNode(edge.target)}
                className="w-full text-left px-2 py-1 text-xs hover:bg-surface-700 rounded flex items-center gap-1"
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: getEdgeColor(edge.type) }} />
                <span className="text-text-secondary">{edge.type}</span>
                <span className="text-text-link truncate ml-1">{edge.target.slice(0, 16)}...</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
```

**Step 2: Add DetailPanel to App layout**

```tsx
// Updated App.tsx main section
<main className="flex-1 flex overflow-hidden">
  <GraphCanvas />
  <DetailPanel />
</main>
```

**Step 3: Build and verify**

```bash
pnpm --filter @sniffo/web build
```

**Step 4: Commit**

```bash
git add packages/web/src/components/DetailPanel.tsx packages/web/src/App.tsx
git commit -m "feat: add node detail panel with connections, freshness, and edge navigation"
```

---

## Task 7: Filter panel

**Files:**
- Create: `packages/web/src/components/FilterPanel.tsx`
- Modify: `packages/web/src/App.tsx`

**Step 1: Create FilterPanel**

```tsx
// packages/web/src/components/FilterPanel.tsx

import { useUIStore } from '../store';
import { NODE_COLORS, EDGE_COLORS } from '../lib/node-colors';

function TypeCheckbox({
  label,
  color,
  checked,
  onChange,
}: {
  label: string;
  color: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex items-center gap-2 py-1 px-2 hover:bg-surface-700 rounded cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="accent-text-link"
      />
      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-text-secondary text-xs">{label}</span>
    </label>
  );
}

export default function FilterPanel() {
  const filterPanelOpen = useUIStore((s) => s.filterPanelOpen);
  const visibleNodeTypes = useUIStore((s) => s.visibleNodeTypes);
  const toggleNodeType = useUIStore((s) => s.toggleNodeType);
  const setAllNodeTypes = useUIStore((s) => s.setAllNodeTypes);
  const clearNodeTypes = useUIStore((s) => s.clearNodeTypes);
  const visibleEdgeTypes = useUIStore((s) => s.visibleEdgeTypes);
  const toggleEdgeType = useUIStore((s) => s.toggleEdgeType);
  const setAllEdgeTypes = useUIStore((s) => s.setAllEdgeTypes);
  const clearEdgeTypes = useUIStore((s) => s.clearEdgeTypes);
  const currentLevel = useUIStore((s) => s.currentLevel);
  const setCurrentLevel = useUIStore((s) => s.setCurrentLevel);

  if (!filterPanelOpen) return null;

  return (
    <aside className="w-[280px] bg-surface-800 border-r border-border-default overflow-y-auto">
      {/* Level selector */}
      <div className="p-3 border-b border-border-muted">
        <p className="text-text-tertiary text-xs mb-2 uppercase tracking-wide">Level</p>
        <div className="flex gap-1">
          {['system', 'container', 'component', 'code'].map((level) => (
            <button
              key={level}
              onClick={() => setCurrentLevel(level)}
              className={`px-2 py-1 text-xs rounded capitalize ${
                currentLevel === level
                  ? 'bg-text-link text-surface-900 font-medium'
                  : 'bg-surface-700 text-text-secondary hover:bg-surface-600'
              }`}
            >
              {level}
            </button>
          ))}
        </div>
      </div>

      {/* Node types */}
      <div className="p-3 border-b border-border-muted">
        <div className="flex items-center justify-between mb-2">
          <p className="text-text-tertiary text-xs uppercase tracking-wide">Node Types</p>
          <div className="flex gap-2">
            <button onClick={() => setAllNodeTypes(Object.keys(NODE_COLORS))} className="text-text-link text-xs">All</button>
            <button onClick={clearNodeTypes} className="text-text-link text-xs">None</button>
          </div>
        </div>
        {Object.entries(NODE_COLORS).map(([type, color]) => (
          <TypeCheckbox
            key={type}
            label={type}
            color={color}
            checked={visibleNodeTypes.has(type)}
            onChange={() => toggleNodeType(type)}
          />
        ))}
      </div>

      {/* Edge types */}
      <div className="p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-text-tertiary text-xs uppercase tracking-wide">Edge Types</p>
          <div className="flex gap-2">
            <button onClick={() => setAllEdgeTypes(Object.keys(EDGE_COLORS))} className="text-text-link text-xs">All</button>
            <button onClick={clearEdgeTypes} className="text-text-link text-xs">None</button>
          </div>
        </div>
        {Object.entries(EDGE_COLORS).map(([type, color]) => (
          <TypeCheckbox
            key={type}
            label={type}
            color={color}
            checked={visibleEdgeTypes.has(type)}
            onChange={() => toggleEdgeType(type)}
          />
        ))}
      </div>
    </aside>
  );
}
```

**Step 2: Add FilterPanel to App layout**

```tsx
<main className="flex-1 flex overflow-hidden">
  <FilterPanel />
  <GraphCanvas />
  <DetailPanel />
</main>
```

**Step 3: Build and verify**

```bash
pnpm --filter @sniffo/web build
```

**Step 4: Commit**

```bash
git add packages/web/src/components/FilterPanel.tsx packages/web/src/App.tsx
git commit -m "feat: add filter panel with level selector, node type and edge type toggles"
```

---

## Task 8: Freshness bar

**Files:**
- Create: `packages/web/src/components/FreshnessBar.tsx`
- Modify: `packages/web/src/App.tsx`

**Step 1: Create FreshnessBar**

```tsx
// packages/web/src/components/FreshnessBar.tsx

import { useStatus, useRefresh } from '../api/hooks';

export default function FreshnessBar() {
  const { data: status } = useStatus();
  const refresh = useRefresh();

  if (!status) return null;

  const pct = status.stalePercentage;
  const color = pct === 0 ? '#2EA043' : pct < 20 ? '#D29922' : '#F85149';

  return (
    <div className="h-8 flex items-center px-4 gap-4 bg-surface-800 border-b border-border-default text-xs">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-text-secondary">
          {status.totalNodes} nodes, {status.staleNodes.length} stale ({pct}%)
        </span>
      </div>

      {status.lastAnalysisRun && (
        <span className="text-text-tertiary">
          Last: {new Date(status.lastAnalysisRun.startedAt).toLocaleString()}
        </span>
      )}

      <button
        onClick={() => refresh.mutate(undefined)}
        disabled={refresh.isPending}
        className="ml-auto px-2 py-0.5 bg-surface-700 border border-border-default rounded text-text-secondary hover:text-text-primary hover:bg-surface-600 disabled:opacity-50"
      >
        {refresh.isPending ? 'Refreshing...' : 'Refresh'}
      </button>

      {refresh.isSuccess && refresh.data && (
        <span className="text-text-tertiary">
          Updated {refresh.data.filesAnalyzed} files in {refresh.data.durationMs}ms
        </span>
      )}
    </div>
  );
}
```

**Step 2: Add FreshnessBar to App between header and main**

```tsx
export default function App() {
  return (
    <div className="h-screen w-screen flex flex-col bg-surface-900">
      <header className="h-10 flex items-center px-4 bg-surface-800 border-b border-border-default gap-4">
        <h1 className="text-sm font-semibold text-text-primary">Sniffo</h1>
        <SearchBar />
      </header>
      <FreshnessBar />
      <main className="flex-1 flex overflow-hidden">
        <FilterPanel />
        <GraphCanvas />
        <DetailPanel />
      </main>
    </div>
  );
}
```

**Step 3: Build and verify**

```bash
pnpm --filter @sniffo/web build
```

**Step 4: Commit**

```bash
git add packages/web/src/components/FreshnessBar.tsx packages/web/src/App.tsx
git commit -m "feat: add freshness bar with staleness indicator and refresh button"
```

---

## Task 9: Serve static web UI from `sniffo serve`

**Files:**
- Modify: `packages/web-server/package.json` -- add @fastify/static dependency
- Modify: `packages/web-server/src/server.ts` -- serve static files from web dist
- Modify: `packages/web-server/src/index.ts` -- export staticDir option

**Step 1: Add @fastify/static dependency**

Add `"@fastify/static": "^8.0.0"` to `packages/web-server/package.json` dependencies.

**Step 2: Update server.ts to serve static files**

```typescript
// Add to ServerOptions:
export interface ServerOptions {
  store: GraphStore;
  projectDir: string;
  host?: string;
  port?: number;
  staticDir?: string;
}

// In createServer(), after registering API routes:
if (options.staticDir) {
  const fastifyStatic = await import('@fastify/static');
  await app.register(fastifyStatic.default, {
    root: options.staticDir,
    prefix: '/',
    wildcard: false,
  });

  // SPA fallback: serve index.html for non-API routes
  app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith('/api/')) {
      return reply.status(404).send({ success: false, error: 'Not found' });
    }
    return reply.sendFile('index.html');
  });
}
```

**Step 3: Update serve command to pass static dir**

Modify `packages/cli/src/commands/serve.ts` to resolve the web package dist directory:

```typescript
import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { DuckDBGraphStore } from '@sniffo/storage';
import { fileURLToPath } from 'node:url';

export async function runServe(projectDir: string, options: { port?: number; host?: string } = {}): Promise<void> {
  const { startServer } = await import('@sniffo/web-server');
  const dbPath = join(projectDir, '.sniffo', 'graph.duckdb');
  const store = new DuckDBGraphStore(dbPath);
  await store.initialize();

  const port = options.port ?? 3100;
  const host = options.host ?? '127.0.0.1';

  // Try to find web package dist
  let staticDir: string | undefined;
  try {
    const webPkgPath = import.meta.resolve('@sniffo/web/package.json');
    const webPkgDir = dirname(fileURLToPath(webPkgPath));
    const distDir = join(webPkgDir, 'dist');
    if (existsSync(distDir)) {
      staticDir = distDir;
    }
  } catch {
    // Web package not available
  }

  await startServer({ store, projectDir, port, host, staticDir });
  console.log(`Server running at http://${host}:${port}`);
  if (staticDir) {
    console.log(`Web UI available at http://${host}:${port}`);
  }
}
```

Also add `"@sniffo/web": "workspace:*"` to `packages/cli/package.json` dependencies so the resolution works.

**Step 4: Install, build all, verify**

```bash
cd /Users/krzysztofsurdy/ProjectsPrivate/llmProjectSniffo
pnpm install
pnpm build
```

**Step 5: Run existing web-server tests**

```bash
pnpm --filter @sniffo/web-server test -- --reporter verbose
```

**Step 6: Commit**

```bash
git add packages/web-server/ packages/cli/ pnpm-lock.yaml
git commit -m "feat: serve static web UI from sniffo serve with SPA fallback"
```

---

## Task 10: Final build and verification

**Step 1: Build all packages**

```bash
pnpm build
```
Expected: 7 packages build (core, storage, analyzer, mcp-server, web-server, web, cli)

**Step 2: Run all tests**

```bash
pnpm test
```
Expected: All tests pass

**Step 3: Commit if needed**

```bash
git add -A
git commit -m "chore: phase 5 complete -- web UI core with graph visualization"
```

---

## Summary

| Task | What | Key Component |
|------|------|---------------|
| 1 | Scaffold React + Vite + Tailwind v4 | Package setup |
| 2 | API client + React Query hooks | Data layer |
| 3 | Zustand store | UI state management |
| 4 | Sigma.js graph canvas + ForceAtlas2 | Graph visualization |
| 5 | Search bar with autocomplete | Navigation |
| 6 | Node detail panel | Inspection |
| 7 | Filter panel (types + levels) | Filtering |
| 8 | Freshness bar + refresh | Freshness awareness |
| 9 | Static file serving from sniffo serve | Integration |
| 10 | Final build verification | Quality gate |

**New package:** @sniffo/web
**Definition of Done:**
- [x] Web UI renders a 200-node graph smoothly (60fps pan/zoom)
- [x] Clicking a node shows its properties and relationships
- [x] Search finds nodes by name and navigates to them
- [x] UI is usable without documentation (intuitive navigation)
- [x] `sniffo serve` starts both API and web UI
