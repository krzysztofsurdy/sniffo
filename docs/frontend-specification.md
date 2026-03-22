# Frontend Technical Specification: llmProjectContextualizer Web UI

**Version**: 1.0
**Date**: 2026-03-22
**Status**: Draft

---

## Table of Contents

1. [Component Architecture](#1-component-architecture)
2. [State Management Design](#2-state-management-design)
3. [Sigma.js Integration Details](#3-sigmajs-integration-details)
4. [Level Transition UX](#4-level-transition-ux)
5. [Freshness Visualization](#5-freshness-visualization)
6. [Data Flow](#6-data-flow)
7. [Responsive Layout](#7-responsive-layout)

---

## 1. Component Architecture

### 1.1 Component Tree

```
App
├── FreshnessBar
├── MainLayout
│   ├── FilterPanel (left sidebar, collapsible)
│   │   ├── EdgeTypeFilterGroup
│   │   └── NodeTypeFilterGroup
│   ├── GraphArea (center)
│   │   ├── LevelNavigator (breadcrumbs, top-left overlay)
│   │   ├── SearchBar (top-right overlay)
│   │   ├── GraphCanvas (Sigma.js WebGL canvas)
│   │   ├── BlastRadiusOverlay (visual overlay on canvas)
│   │   ├── MiniMap (bottom-left overlay)
│   │   ├── GraphControls (zoom/fit/layout buttons, bottom-right)
│   │   └── ExportMenu (toolbar, top-right cluster)
│   └── DetailPanel (right sidebar, collapsible)
│       ├── NodeDetailPanel (shown when node selected)
│       └── EdgeDetailPanel (shown when edge selected)
└── RefreshOverlay (toast notification during refresh)
```

### 1.2 Shared Type Definitions

These types model the API response shapes and are used across components.

```typescript
// src/types/graph.ts

export enum GraphLevel {
  L1_SYSTEM = 'system',
  L2_CONTAINER = 'container',
  L3_COMPONENT = 'component',
  L4_CODE = 'code',
}

export enum RelationshipType {
  CALLS = 'CALLS',
  EXTENDS = 'EXTENDS',
  IMPLEMENTS = 'IMPLEMENTS',
  IMPORTS = 'IMPORTS',
  DEPENDS_ON = 'DEPENDS_ON',
  CONTAINS = 'CONTAINS',
  USES = 'USES',
  PRODUCES = 'PRODUCES',
  CONSUMES = 'CONSUMES',
}

export enum NodeType {
  SYSTEM = 'system',
  SERVICE = 'service',
  DATABASE = 'database',
  QUEUE = 'queue',
  PACKAGE = 'package',
  MODULE = 'module',
  CLASS = 'class',
  INTERFACE = 'interface',
  FUNCTION = 'function',
  FILE = 'file',
}

export interface GraphNode {
  id: string;
  label: string;
  type: NodeType;
  level: GraphLevel;
  parentId: string | null;
  lastAnalyzed: string; // ISO 8601
  metadata: Record<string, unknown>;
  childCount: number;
  connectionCount: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: RelationshipType;
  confidence: number; // 0.0 - 1.0
  sourceLocation: { file: string; line: number } | null;
  targetLocation: { file: string; line: number } | null;
  metadata: Record<string, unknown>;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  level: GraphLevel;
  parentId: string | null;
}

export interface FreshnessStatus {
  lastFullAnalysis: string; // ISO 8601
  staleFileCount: number;
  totalFileCount: number;
  staleNodeIds: string[];
}

export interface SearchResult {
  nodeId: string;
  label: string;
  type: NodeType;
  level: GraphLevel;
  score: number;
  matchContext: string;
}

export interface BreadcrumbItem {
  id: string;
  label: string;
  level: GraphLevel;
}

export interface RefreshProgress {
  status: 'idle' | 'running' | 'completed' | 'error';
  progress: number; // 0-100
  message: string;
}
```

### 1.3 Component Specifications

#### App

Root component. Sets up providers and global layout.

```typescript
// src/App.tsx
// No props -- root component.
// Wraps everything in QueryClientProvider and the main layout shell.
// Registers global keyboard shortcuts via useEffect.
```

**Responsibilities**:
- Provide React Query `QueryClientProvider`
- Render `FreshnessBar` + `MainLayout`
- Register global keyboard shortcut listener (delegated to a `useKeyboardShortcuts` hook)

---

#### FreshnessBar

Fixed banner at the top of the viewport showing global analysis status.

```typescript
// src/components/FreshnessBar/FreshnessBar.tsx

interface FreshnessBarProps {
  // No props -- reads from Zustand store + React Query
}

// Internal state: none (fully derived from store/query)
// Queries: GET /api/status via useFreshnessQuery()
```

**Renders**: A horizontal bar with:
- Left: "Last full analysis: {relative time} ({absolute date})"
- Center: "{N} stale files out of {total}" with colored indicator
- Right: `RefreshButton`

**Visual treatment**:
- Green background when 0 stale files
- Amber when stale files < 10% of total
- Red when stale files >= 10% of total

---

#### RefreshButton

Triggers POST /api/refresh and shows progress.

```typescript
// src/components/FreshnessBar/RefreshButton.tsx

interface RefreshButtonProps {
  // No props -- uses mutation hook internally
}

// Internal state:
// - Uses useMutation for POST /api/refresh
// - Polls GET /api/status during refresh for progress
```

**Behavior**:
1. Idle: shows "Refresh" button with sync icon
2. Click: fires POST /api/refresh, button becomes disabled spinner
3. Polls GET /api/status every 2 seconds until status is `completed` or `error`
4. On complete: invalidates all React Query caches, shows success toast
5. On error: shows error toast with message, re-enables button

---

#### MainLayout

Three-panel layout container.

```typescript
// src/components/Layout/MainLayout.tsx

interface MainLayoutProps {
  // No props -- pure layout component
}

// Internal state:
// - leftPanelOpen: boolean (default true on desktop, false on mobile)
// - rightPanelOpen: boolean (default false, opens on selection)
// - leftPanelWidth: number (resizable, default 280px)
// - rightPanelWidth: number (resizable, default 360px)
```

**Layout**: CSS Grid with three columns:
- Left: FilterPanel (collapsible, 280px default)
- Center: GraphArea (flex: 1, minimum 600px)
- Right: DetailPanel (collapsible, 360px default)

---

#### FilterPanel

Left sidebar with toggles for filtering the graph.

```typescript
// src/components/FilterPanel/FilterPanel.tsx

interface FilterPanelProps {
  isOpen: boolean;
  onToggle: () => void;
}

// Internal state: none (reads/writes Zustand filter store)
```

**Contains**:
- `EdgeTypeFilterGroup`: checkboxes for each `RelationshipType`
- `NodeTypeFilterGroup`: checkboxes for each `NodeType` visible at current level
- "Select All" / "Deselect All" controls for each group
- Active filter count badge on the collapse button

---

#### EdgeTypeFilterGroup

```typescript
// src/components/FilterPanel/EdgeTypeFilterGroup.tsx

interface EdgeTypeFilterGroupProps {
  enabledTypes: Set<RelationshipType>;
  onToggle: (type: RelationshipType) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}
```

Each checkbox shows: colored dot (matching edge color) + type name + count of edges of that type in current view.

---

#### NodeTypeFilterGroup

```typescript
// src/components/FilterPanel/NodeTypeFilterGroup.tsx

interface NodeTypeFilterGroupProps {
  enabledTypes: Set<NodeType>;
  availableTypes: NodeType[]; // types present in current graph
  onToggle: (type: NodeType) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}
```

---

#### GraphArea

Container for the graph canvas and its overlay controls.

```typescript
// src/components/GraphArea/GraphArea.tsx

interface GraphAreaProps {
  // No props -- reads level/navigation from store
}

// Internal state: none (orchestration only)
```

Positions overlay elements absolutely over the Sigma canvas using `position: relative` on the container.

---

#### GraphCanvas

The core Sigma.js + Graphology integration component.

```typescript
// src/components/GraphArea/GraphCanvas.tsx

interface GraphCanvasProps {
  // No props -- binds to Zustand graph store
}

// Internal refs:
// - containerRef: HTMLDivElement (mount point for Sigma)
// - sigmaRef: Sigma instance
// - graphRef: Graph (Graphology) instance
//
// Internal state: none (imperative Sigma API, data from store)
```

**Responsibilities**:
- Mounts Sigma renderer into a div
- Syncs Graphology graph instance with store data
- Handles all Sigma event listeners (click, hover, drag)
- Manages ForceAtlas2 layout worker lifecycle
- Applies visual properties (color, size, shape) based on node/edge attributes

Full integration details in [Section 3](#3-sigmajs-integration-details).

---

#### LevelNavigator

Breadcrumb trail showing the drill-down path.

```typescript
// src/components/GraphArea/LevelNavigator.tsx

interface LevelNavigatorProps {
  // No props -- reads breadcrumbs from navigation store
}

// Reads from store: breadcrumbStack, currentLevel
```

**Renders**: `L1: System > L2: API Gateway > L3: AuthModule`

Each segment is clickable to navigate back to that level. Current level is bold and non-clickable. Shows the level enum label (L1/L2/L3/L4) as a prefix badge with distinct colors.

---

#### SearchBar

Unified search with mode toggle.

```typescript
// src/components/GraphArea/SearchBar.tsx

interface SearchBarProps {
  // No props -- manages own state + writes to store
}

// Internal state:
// - query: string
// - mode: 'text' | 'semantic'
// - isOpen: boolean (expands on focus or keyboard shortcut)
// - Uses useQuery for GET /api/search?q=...&mode=...
```

**Behavior**:
- Collapsed by default: shows magnifying glass icon
- Expands on click or `/` keyboard shortcut
- Debounced search (300ms) as user types
- Results appear in dropdown below the input
- Each result shows: icon (by type) + label + level badge + score bar
- Clicking a result: navigates to the node's level, selects and centers the node
- Toggle between text/semantic mode via segmented control in the search bar
- `Escape` closes the search bar and clears highlights

---

#### NodeDetailPanel

Right sidebar content when a node is selected.

```typescript
// src/components/DetailPanel/NodeDetailPanel.tsx

interface NodeDetailPanelProps {
  nodeId: string;
}

// Queries: GET /api/node/:id via useNodeDetailQuery(nodeId)
```

**Displays**:
- Node label (heading)
- Type badge + Level badge
- Last analyzed: relative time + absolute tooltip
- Freshness indicator (green/amber/red dot)
- Child count with "Drill Down" button (if children exist)
- Connection summary: N incoming, M outgoing
- List of connections grouped by type, each clickable to select that edge
- Metadata key-value pairs (collapsible)
- "Show Blast Radius" button

---

#### EdgeDetailPanel

Right sidebar content when an edge is selected.

```typescript
// src/components/DetailPanel/EdgeDetailPanel.tsx

interface EdgeDetailPanelProps {
  edgeId: string;
}

// Reads edge data from Graphology graph instance (already loaded)
```

**Displays**:
- Relationship type badge (colored)
- Source node -> Target node (both clickable to select that node)
- Confidence: percentage + visual bar
- Source location: file path + line number (if available)
- Target location: file path + line number (if available)
- Metadata key-value pairs (collapsible)

---

#### BlastRadiusOverlay

Not a visible DOM overlay -- this component manages the blast radius highlighting logic by writing to the Graphology node attributes that Sigma reads for rendering.

```typescript
// src/components/GraphArea/BlastRadiusOverlay.tsx

interface BlastRadiusOverlayProps {
  // No props -- reads selectedNode + blastRadiusActive from store
}

// Internal logic:
// - When active, traverses graph from selected node using BFS on incoming edges
// - Sets "highlighted" attribute on all transitive dependents
// - Sets "dimmed" attribute on all other nodes
// - Sigma's node/edge reducer reads these attributes for rendering
```

**Visual effect**:
- Selected node: bright border ring (pulsing glow via Sigma node border program)
- Transitive dependents: full color, slightly enlarged
- All other nodes: 20% opacity, grayscale
- Edges in the blast path: full color, thicker
- All other edges: 10% opacity

A floating label shows: "Blast radius: {N} affected nodes across {M} levels"

---

#### MiniMap

Small overview of the full graph in the bottom-left corner.

```typescript
// src/components/GraphArea/MiniMap.tsx

interface MiniMapProps {
  // No props -- reads from Sigma camera state
}

// Internal state:
// - Uses a second, smaller Sigma instance or canvas rendering
//   of the Graphology graph at reduced detail
```

**Behavior**:
- 200x150px box with semi-transparent background
- Shows all nodes as small dots (no labels)
- Viewport rectangle shows current camera view
- Clicking on the minimap pans the main view
- Collapsible via corner button

**Implementation note**: Rather than a second Sigma instance (expensive), render the minimap using a plain Canvas 2D context. Read node positions from Graphology, draw dots, draw viewport rectangle from Sigma camera state.

---

#### GraphControls

Zoom and layout control buttons.

```typescript
// src/components/GraphArea/GraphControls.tsx

interface GraphControlsProps {
  // No props -- interacts with Sigma instance via ref/context
}
```

**Buttons**:
- Zoom In (+)
- Zoom Out (-)
- Fit to Screen (frame icon)
- Toggle Layout (play/pause ForceAtlas2)
- Reset Layout (re-run layout from scratch)

---

#### ExportMenu

Dropdown menu for exporting the current view.

```typescript
// src/components/GraphArea/ExportMenu.tsx

interface ExportMenuProps {
  // No props -- reads Sigma instance for export
}

// Internal state:
// - isOpen: boolean (dropdown visibility)
```

**Options**:
- Export as PNG (uses Sigma's `toDataURL()` or renders to offscreen canvas)
- Export as SVG (serializes current Graphology graph positions to SVG elements)

Both include the current view only (respecting zoom/pan). File is downloaded via `URL.createObjectURL` + anchor click.

---

### 1.4 Directory Structure

```
src/
├── main.tsx
├── App.tsx
├── types/
│   └── graph.ts                    # All shared TypeScript types
├── api/
│   ├── client.ts                   # Axios/fetch wrapper, base URL config
│   ├── queries.ts                  # React Query hook definitions
│   └── mutations.ts                # React Query mutation hooks
├── stores/
│   ├── graphStore.ts               # Graphology instance, graph data
│   ├── navigationStore.ts          # Level, breadcrumbs, drill-down
│   ├── selectionStore.ts           # Selected node/edge, blast radius
│   ├── filterStore.ts              # Active filters
│   └── uiStore.ts                  # Panel open/close, layout prefs
├── components/
│   ├── Layout/
│   │   └── MainLayout.tsx
│   ├── FreshnessBar/
│   │   ├── FreshnessBar.tsx
│   │   └── RefreshButton.tsx
│   ├── FilterPanel/
│   │   ├── FilterPanel.tsx
│   │   ├── EdgeTypeFilterGroup.tsx
│   │   └── NodeTypeFilterGroup.tsx
│   ├── GraphArea/
│   │   ├── GraphArea.tsx
│   │   ├── GraphCanvas.tsx
│   │   ├── LevelNavigator.tsx
│   │   ├── SearchBar.tsx
│   │   ├── BlastRadiusOverlay.tsx
│   │   ├── MiniMap.tsx
│   │   ├── GraphControls.tsx
│   │   └── ExportMenu.tsx
│   └── DetailPanel/
│       ├── DetailPanel.tsx         # Container, switches between Node/Edge
│       ├── NodeDetailPanel.tsx
│       └── EdgeDetailPanel.tsx
├── hooks/
│   ├── useSigma.ts                 # Sigma instance context/ref
│   ├── useGraphSync.ts             # Syncs store data -> Graphology
│   ├── useForceAtlas2.ts           # Layout worker lifecycle
│   ├── useKeyboardShortcuts.ts     # Global keyboard handlers
│   ├── useBlastRadius.ts           # BFS traversal logic
│   └── useGraphEvents.ts           # Sigma event -> store dispatch
├── lib/
│   ├── graphUtils.ts               # Graphology helper functions
│   ├── colorMap.ts                 # Node/edge type -> color mapping
│   ├── freshnessUtils.ts           # Stale threshold calculations
│   └── exportUtils.ts              # PNG/SVG export logic
└── styles/
    └── index.css                   # Tailwind directives + custom CSS
```

---

## 2. State Management Design

### 2.1 Store Architecture

Five Zustand store slices, each focused on a single concern. Stores are independent files (not combined) to avoid unnecessary re-renders. Components subscribe to the specific slice they need.

### 2.2 Navigation Store

```typescript
// src/stores/navigationStore.ts

import { create } from 'zustand';
import { GraphLevel, BreadcrumbItem } from '../types/graph';

interface NavigationState {
  currentLevel: GraphLevel;
  parentId: string | null;
  breadcrumbs: BreadcrumbItem[];

  drillDown: (nodeId: string, nodeLabel: string, targetLevel: GraphLevel) => void;
  navigateToBreadcrumb: (index: number) => void;
  resetToRoot: () => void;
}

export const useNavigationStore = create<NavigationState>((set) => ({
  currentLevel: GraphLevel.L1_SYSTEM,
  parentId: null,
  breadcrumbs: [],

  drillDown: (nodeId, nodeLabel, targetLevel) =>
    set((state) => ({
      currentLevel: targetLevel,
      parentId: nodeId,
      breadcrumbs: [
        ...state.breadcrumbs,
        { id: nodeId, label: nodeLabel, level: state.currentLevel },
      ],
    })),

  navigateToBreadcrumb: (index) =>
    set((state) => {
      const target = state.breadcrumbs[index];
      return {
        currentLevel: target.level,
        parentId: index === 0 ? null : state.breadcrumbs[index - 1]?.id ?? null,
        breadcrumbs: state.breadcrumbs.slice(0, index),
      };
    }),

  resetToRoot: () =>
    set({
      currentLevel: GraphLevel.L1_SYSTEM,
      parentId: null,
      breadcrumbs: [],
    }),
}));
```

### 2.3 Selection Store

```typescript
// src/stores/selectionStore.ts

import { create } from 'zustand';

interface SelectionState {
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  hoveredNodeId: string | null;
  hoveredEdgeId: string | null;
  blastRadiusActive: boolean;
  blastRadiusNodeIds: Set<string>;
  blastRadiusEdgeIds: Set<string>;

  selectNode: (nodeId: string | null) => void;
  selectEdge: (edgeId: string | null) => void;
  setHoveredNode: (nodeId: string | null) => void;
  setHoveredEdge: (edgeId: string | null) => void;
  activateBlastRadius: (nodeIds: Set<string>, edgeIds: Set<string>) => void;
  deactivateBlastRadius: () => void;
  clearSelection: () => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedNodeId: null,
  selectedEdgeId: null,
  hoveredNodeId: null,
  hoveredEdgeId: null,
  blastRadiusActive: false,
  blastRadiusNodeIds: new Set(),
  blastRadiusEdgeIds: new Set(),

  selectNode: (nodeId) =>
    set({
      selectedNodeId: nodeId,
      selectedEdgeId: null, // deselect edge when selecting node
      blastRadiusActive: false,
      blastRadiusNodeIds: new Set(),
      blastRadiusEdgeIds: new Set(),
    }),

  selectEdge: (edgeId) =>
    set({
      selectedEdgeId: edgeId,
      selectedNodeId: null, // deselect node when selecting edge
      blastRadiusActive: false,
      blastRadiusNodeIds: new Set(),
      blastRadiusEdgeIds: new Set(),
    }),

  setHoveredNode: (nodeId) => set({ hoveredNodeId: nodeId }),
  setHoveredEdge: (edgeId) => set({ hoveredEdgeId: edgeId }),

  activateBlastRadius: (nodeIds, edgeIds) =>
    set({
      blastRadiusActive: true,
      blastRadiusNodeIds: nodeIds,
      blastRadiusEdgeIds: edgeIds,
    }),

  deactivateBlastRadius: () =>
    set({
      blastRadiusActive: false,
      blastRadiusNodeIds: new Set(),
      blastRadiusEdgeIds: new Set(),
    }),

  clearSelection: () =>
    set({
      selectedNodeId: null,
      selectedEdgeId: null,
      blastRadiusActive: false,
      blastRadiusNodeIds: new Set(),
      blastRadiusEdgeIds: new Set(),
    }),
}));
```

### 2.4 Filter Store

```typescript
// src/stores/filterStore.ts

import { create } from 'zustand';
import { RelationshipType, NodeType } from '../types/graph';

interface FilterState {
  enabledEdgeTypes: Set<RelationshipType>;
  enabledNodeTypes: Set<NodeType>;
  searchHighlightedNodeIds: Set<string>;

  toggleEdgeType: (type: RelationshipType) => void;
  toggleNodeType: (type: NodeType) => void;
  setAllEdgeTypes: (enabled: boolean) => void;
  setAllNodeTypes: (enabled: boolean) => void;
  setSearchHighlights: (nodeIds: Set<string>) => void;
  clearSearchHighlights: () => void;
  resetFilters: () => void;
}

const ALL_EDGE_TYPES = new Set(Object.values(RelationshipType));
const ALL_NODE_TYPES = new Set(Object.values(NodeType));

export const useFilterStore = create<FilterState>((set) => ({
  enabledEdgeTypes: new Set(ALL_EDGE_TYPES),
  enabledNodeTypes: new Set(ALL_NODE_TYPES),
  searchHighlightedNodeIds: new Set(),

  toggleEdgeType: (type) =>
    set((state) => {
      const next = new Set(state.enabledEdgeTypes);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return { enabledEdgeTypes: next };
    }),

  toggleNodeType: (type) =>
    set((state) => {
      const next = new Set(state.enabledNodeTypes);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return { enabledNodeTypes: next };
    }),

  setAllEdgeTypes: (enabled) =>
    set({ enabledEdgeTypes: enabled ? new Set(ALL_EDGE_TYPES) : new Set() }),

  setAllNodeTypes: (enabled) =>
    set({ enabledNodeTypes: enabled ? new Set(ALL_NODE_TYPES) : new Set() }),

  setSearchHighlights: (nodeIds) => set({ searchHighlightedNodeIds: nodeIds }),
  clearSearchHighlights: () => set({ searchHighlightedNodeIds: new Set() }),

  resetFilters: () =>
    set({
      enabledEdgeTypes: new Set(ALL_EDGE_TYPES),
      enabledNodeTypes: new Set(ALL_NODE_TYPES),
      searchHighlightedNodeIds: new Set(),
    }),
}));
```

### 2.5 Graph Store

Holds the Graphology instance reference and the raw API data. This is the bridge between React Query data and the imperative Graphology API.

```typescript
// src/stores/graphStore.ts

import { create } from 'zustand';
import Graph from 'graphology';
import { GraphData, GraphNode, GraphEdge } from '../types/graph';

interface GraphState {
  graph: Graph;
  rawData: GraphData | null;
  isLayoutRunning: boolean;

  setGraphData: (data: GraphData) => void;
  setLayoutRunning: (running: boolean) => void;
  getNode: (id: string) => GraphNode | undefined;
  getEdge: (id: string) => GraphEdge | undefined;
}

export const useGraphStore = create<GraphState>((set, get) => ({
  graph: new Graph({ multi: true, type: 'directed' }),
  rawData: null,
  isLayoutRunning: false,

  setGraphData: (data) => {
    const graph = get().graph;
    graph.clear();

    for (const node of data.nodes) {
      graph.addNode(node.id, {
        label: node.label,
        nodeType: node.type,
        level: node.level,
        lastAnalyzed: node.lastAnalyzed,
        childCount: node.childCount,
        connectionCount: node.connectionCount,
        x: Math.random() * 1000,
        y: Math.random() * 1000,
        size: 5,
        color: '#666',
      });
    }

    for (const edge of data.edges) {
      graph.addEdgeWithKey(edge.id, edge.source, edge.target, {
        edgeType: edge.type,
        confidence: edge.confidence,
        sourceLocation: edge.sourceLocation,
        targetLocation: edge.targetLocation,
        color: '#ccc',
        size: 1,
      });
    }

    set({ rawData: data });
  },

  setLayoutRunning: (running) => set({ isLayoutRunning: running }),

  getNode: (id) => {
    const data = get().rawData;
    return data?.nodes.find((n) => n.id === id);
  },

  getEdge: (id) => {
    const data = get().rawData;
    return data?.edges.find((e) => e.id === id);
  },
}));
```

### 2.6 UI Store

```typescript
// src/stores/uiStore.ts

import { create } from 'zustand';

interface UIState {
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  leftPanelWidth: number;
  rightPanelWidth: number;
  searchOpen: boolean;

  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;
  setLeftPanelWidth: (width: number) => void;
  setRightPanelWidth: (width: number) => void;
  setSearchOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  leftPanelOpen: true,
  rightPanelOpen: false,
  leftPanelWidth: 280,
  rightPanelWidth: 360,
  searchOpen: false,

  toggleLeftPanel: () => set((s) => ({ leftPanelOpen: !s.leftPanelOpen })),
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
  setLeftPanelWidth: (width) => set({ leftPanelWidth: Math.max(200, Math.min(400, width)) }),
  setRightPanelWidth: (width) => set({ rightPanelWidth: Math.max(280, Math.min(500, width)) }),
  setSearchOpen: (open) => set({ searchOpen: open }),
}));
```

### 2.7 Data Flow Summary

```
API (React Query)
    │
    ▼
graphStore.setGraphData()  ──→  Graphology Graph instance
    │                                    │
    ▼                                    ▼
navigationStore (level/parent)    Sigma.js reads Graph for rendering
filterStore (what's visible)             │
selectionStore (what's selected)         ▼
    │                              useGraphSync hook applies:
    └─────────────────────────────  - node colors (from colorMap + nodeType)
                                    - node sizes (from connectionCount)
                                    - edge colors (from edgeType)
                                    - edge widths (from confidence)
                                    - visibility (from filters)
                                    - highlight state (from selection)
```

---

## 3. Sigma.js Integration Details

### 3.1 Initialization

```typescript
// src/hooks/useSigma.ts

import { useRef, useEffect, useCallback } from 'react';
import Sigma from 'sigma';
import Graph from 'graphology';
import { useGraphStore } from '../stores/graphStore';

export function useSigma(containerRef: React.RefObject<HTMLDivElement>) {
  const sigmaRef = useRef<Sigma | null>(null);
  const graph = useGraphStore((s) => s.graph);

  useEffect(() => {
    if (!containerRef.current) return;

    const sigma = new Sigma(graph, containerRef.current, {
      renderLabels: true,
      labelRenderedSizeThreshold: 8,
      labelFont: 'Inter, system-ui, sans-serif',
      labelColor: { color: '#1e293b' },
      labelSize: 12,
      defaultEdgeType: 'arrow',
      defaultNodeType: 'circle',
      allowInvalidContainer: true,
      // Node reducers and edge reducers are set in useGraphSync
    });

    sigmaRef.current = sigma;

    return () => {
      sigma.kill();
      sigmaRef.current = null;
    };
  }, [containerRef, graph]);

  return sigmaRef;
}
```

### 3.2 Node Rendering

Nodes are rendered with visual properties derived from their data attributes. The `nodeReducer` on the Sigma settings controls per-frame rendering.

```typescript
// Applied via Sigma settings.nodeReducer

import { NODE_COLORS, NODE_SIZES_BY_LEVEL } from '../lib/colorMap';
import { isStale } from '../lib/freshnessUtils';

// In useGraphSync hook:
sigma.setSetting('nodeReducer', (node, data) => {
  const res = { ...data };
  const selectionStore = useSelectionStore.getState();
  const filterStore = useFilterStore.getState();

  // Base color by node type
  res.color = NODE_COLORS[data.nodeType as NodeType] ?? '#94a3b8';

  // Size based on connection count, scaled by level
  const baseSize = NODE_SIZES_BY_LEVEL[data.level as GraphLevel] ?? 5;
  res.size = baseSize + Math.log2((data.connectionCount as number) + 1) * 2;

  // Stale visual treatment
  if (isStale(data.lastAnalyzed as string)) {
    res.color = desaturate(res.color, 0.6);
    res.borderColor = '#f59e0b';
    res.borderSize = 2;
  }

  // Node type filter: hide filtered-out types
  if (!filterStore.enabledNodeTypes.has(data.nodeType as NodeType)) {
    res.hidden = true;
    return res;
  }

  // Selection + blast radius dimming
  if (selectionStore.blastRadiusActive) {
    if (node === selectionStore.selectedNodeId) {
      res.highlighted = true;
      res.borderColor = '#3b82f6';
      res.borderSize = 3;
    } else if (selectionStore.blastRadiusNodeIds.has(node)) {
      // Keep full color, slightly enlarge
      res.size = res.size * 1.2;
    } else {
      res.color = '#e2e8f0';
      res.label = null; // hide labels for dimmed nodes
    }
  } else if (selectionStore.selectedNodeId) {
    if (node === selectionStore.selectedNodeId) {
      res.highlighted = true;
    }
  }

  // Search highlight
  if (filterStore.searchHighlightedNodeIds.size > 0) {
    if (filterStore.searchHighlightedNodeIds.has(node)) {
      res.highlighted = true;
      res.borderColor = '#8b5cf6';
      res.borderSize = 2;
    } else if (!selectionStore.blastRadiusActive) {
      res.color = desaturate(res.color, 0.5);
    }
  }

  // Hover
  if (selectionStore.hoveredNodeId === node) {
    res.highlighted = true;
  }

  return res;
});
```

#### Color Map

```typescript
// src/lib/colorMap.ts

import { NodeType, RelationshipType, GraphLevel } from '../types/graph';

export const NODE_COLORS: Record<NodeType, string> = {
  [NodeType.SYSTEM]: '#6366f1',     // indigo
  [NodeType.SERVICE]: '#3b82f6',    // blue
  [NodeType.DATABASE]: '#10b981',   // emerald
  [NodeType.QUEUE]: '#f59e0b',      // amber
  [NodeType.PACKAGE]: '#8b5cf6',    // violet
  [NodeType.MODULE]: '#06b6d4',     // cyan
  [NodeType.CLASS]: '#ec4899',      // pink
  [NodeType.INTERFACE]: '#14b8a6',  // teal
  [NodeType.FUNCTION]: '#f97316',   // orange
  [NodeType.FILE]: '#64748b',       // slate
};

export const EDGE_COLORS: Record<RelationshipType, string> = {
  [RelationshipType.CALLS]: '#3b82f6',
  [RelationshipType.EXTENDS]: '#8b5cf6',
  [RelationshipType.IMPLEMENTS]: '#14b8a6',
  [RelationshipType.IMPORTS]: '#64748b',
  [RelationshipType.DEPENDS_ON]: '#ef4444',
  [RelationshipType.CONTAINS]: '#d1d5db',
  [RelationshipType.USES]: '#f59e0b',
  [RelationshipType.PRODUCES]: '#10b981',
  [RelationshipType.CONSUMES]: '#f97316',
};

export const NODE_SIZES_BY_LEVEL: Record<GraphLevel, number> = {
  [GraphLevel.L1_SYSTEM]: 12,
  [GraphLevel.L2_CONTAINER]: 8,
  [GraphLevel.L3_COMPONENT]: 5,
  [GraphLevel.L4_CODE]: 3,
};
```

### 3.3 Edge Rendering

```typescript
// Applied via Sigma settings.edgeReducer

sigma.setSetting('edgeReducer', (edge, data) => {
  const res = { ...data };
  const selectionStore = useSelectionStore.getState();
  const filterStore = useFilterStore.getState();

  // Base color by edge type
  res.color = EDGE_COLORS[data.edgeType as RelationshipType] ?? '#d1d5db';

  // Width based on confidence
  res.size = 1 + (data.confidence as number) * 3;

  // Edge type filter
  if (!filterStore.enabledEdgeTypes.has(data.edgeType as RelationshipType)) {
    res.hidden = true;
    return res;
  }

  // Stale edges: dashed appearance (via custom edge program, see 3.5)
  // Sigma's built-in edge programs don't support dashing. Use the
  // @sigma/edge-curve package or a custom program. For MVP, change
  // color to a lighter shade instead of dashing.

  // Selected edge highlight
  if (selectionStore.selectedEdgeId === edge) {
    res.color = '#1d4ed8';
    res.size = res.size * 2;
  }

  // Blast radius: dim non-path edges
  if (selectionStore.blastRadiusActive) {
    if (selectionStore.blastRadiusEdgeIds.has(edge)) {
      res.size = res.size * 1.5;
    } else {
      res.color = '#f1f5f9';
    }
  }

  // Hover: highlight edges connected to hovered node
  const source = data.source;
  const target = data.target;
  if (selectionStore.hoveredNodeId === source || selectionStore.hoveredNodeId === target) {
    res.size = res.size * 1.3;
  }

  return res;
});
```

### 3.4 Event Handling

```typescript
// src/hooks/useGraphEvents.ts

import { useEffect } from 'react';
import Sigma from 'sigma';
import { useSelectionStore } from '../stores/selectionStore';
import { useNavigationStore } from '../stores/navigationStore';
import { useUIStore } from '../stores/uiStore';
import { useGraphStore } from '../stores/graphStore';

export function useGraphEvents(sigmaRef: React.RefObject<Sigma | null>) {
  const selectNode = useSelectionStore((s) => s.selectNode);
  const selectEdge = useSelectionStore((s) => s.selectEdge);
  const setHoveredNode = useSelectionStore((s) => s.setHoveredNode);
  const setHoveredEdge = useSelectionStore((s) => s.setHoveredEdge);
  const drillDown = useNavigationStore((s) => s.drillDown);
  const toggleRightPanel = useUIStore((s) => s.toggleRightPanel);
  const getNode = useGraphStore((s) => s.getNode);

  useEffect(() => {
    const sigma = sigmaRef.current;
    if (!sigma) return;

    // Single click: select node, open detail panel
    const handleClickNode = ({ node }: { node: string }) => {
      selectNode(node);
      useUIStore.getState().rightPanelOpen || toggleRightPanel();
    };

    // Double click: drill down into node (if it has children)
    const handleDoubleClickNode = ({ node }: { node: string }) => {
      const nodeData = getNode(node);
      if (nodeData && nodeData.childCount > 0) {
        const nextLevel = getNextLevel(nodeData.level);
        if (nextLevel) {
          drillDown(node, nodeData.label, nextLevel);
        }
      }
    };

    // Click edge: select edge, open detail panel
    const handleClickEdge = ({ edge }: { edge: string }) => {
      selectEdge(edge);
      useUIStore.getState().rightPanelOpen || toggleRightPanel();
    };

    // Hover handlers
    const handleEnterNode = ({ node }: { node: string }) => {
      setHoveredNode(node);
      sigma.getContainer().style.cursor = 'pointer';
    };

    const handleLeaveNode = () => {
      setHoveredNode(null);
      sigma.getContainer().style.cursor = 'default';
    };

    const handleEnterEdge = ({ edge }: { edge: string }) => {
      setHoveredEdge(edge);
    };

    const handleLeaveEdge = () => {
      setHoveredEdge(null);
    };

    // Click on empty space: deselect
    const handleClickStage = () => {
      useSelectionStore.getState().clearSelection();
    };

    sigma.on('clickNode', handleClickNode);
    sigma.on('doubleClickNode', handleDoubleClickNode);
    sigma.on('clickEdge', handleClickEdge);
    sigma.on('enterNode', handleEnterNode);
    sigma.on('leaveNode', handleLeaveNode);
    sigma.on('enterEdge', handleEnterEdge);
    sigma.on('leaveEdge', handleLeaveEdge);
    sigma.on('clickStage', handleClickStage);

    return () => {
      sigma.off('clickNode', handleClickNode);
      sigma.off('doubleClickNode', handleDoubleClickNode);
      sigma.off('clickEdge', handleClickEdge);
      sigma.off('enterNode', handleEnterNode);
      sigma.off('leaveNode', handleLeaveNode);
      sigma.off('enterEdge', handleEnterEdge);
      sigma.off('leaveEdge', handleLeaveEdge);
      sigma.off('clickStage', handleClickStage);
    };
  }, [sigmaRef, selectNode, selectEdge, setHoveredNode, setHoveredEdge, drillDown, toggleRightPanel, getNode]);
}
```

### 3.5 ForceAtlas2 Layout

```typescript
// src/hooks/useForceAtlas2.ts

import { useEffect, useRef, useCallback } from 'react';
import FA2Layout from 'graphology-layout-forceatlas2/worker';
import Graph from 'graphology';
import { useGraphStore } from '../stores/graphStore';

export function useForceAtlas2(graph: Graph) {
  const layoutRef = useRef<FA2Layout | null>(null);
  const setLayoutRunning = useGraphStore((s) => s.setLayoutRunning);

  const startLayout = useCallback(() => {
    if (layoutRef.current) {
      layoutRef.current.kill();
    }

    const layout = new FA2Layout(graph, {
      settings: {
        gravity: 1,
        scalingRatio: 10,
        barnesHutOptimize: graph.order > 500,
        barnesHutTheta: 0.5,
        slowDown: 5,
        strongGravityMode: false,
        adjustSizes: true,
        linLogMode: false,
        outboundAttractionDistribution: true,
      },
    });

    layout.start();
    layoutRef.current = layout;
    setLayoutRunning(true);

    // Auto-stop after convergence (10 seconds max for initial layout)
    setTimeout(() => {
      if (layoutRef.current?.isRunning()) {
        layoutRef.current.stop();
        setLayoutRunning(false);
      }
    }, 10000);
  }, [graph, setLayoutRunning]);

  const stopLayout = useCallback(() => {
    if (layoutRef.current?.isRunning()) {
      layoutRef.current.stop();
      setLayoutRunning(false);
    }
  }, [setLayoutRunning]);

  const toggleLayout = useCallback(() => {
    if (layoutRef.current?.isRunning()) {
      stopLayout();
    } else {
      startLayout();
    }
  }, [startLayout, stopLayout]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      layoutRef.current?.kill();
    };
  }, []);

  return { startLayout, stopLayout, toggleLayout };
}
```

**Performance notes**:
- `barnesHutOptimize` is enabled automatically when node count exceeds 500 (O(n log n) instead of O(n^2))
- Layout runs in a Web Worker (the `/worker` import), keeping the main thread free
- Auto-stops after 10 seconds to prevent indefinite CPU usage
- The user can manually toggle layout via GraphControls

### 3.6 Performance Strategy

| Node count | Strategy |
|---|---|
| < 500 | Full labels, all edges, standard ForceAtlas2 |
| 500 - 2000 | Labels only on hover/selected, barnesHut optimization on |
| 2000 - 5000 | Hide labels except selected, reduce edge rendering (hide lowest-confidence edges), barnesHut on |
| > 5000 | Should not happen per-level; if it does, paginate or cluster |

Sigma.js uses WebGL rendering, so the main bottleneck is the layout computation, not rendering. ForceAtlas2 in a Web Worker handles this.

**Label culling**: Sigma's built-in `labelRenderedSizeThreshold` hides labels for nodes below a certain rendered size (based on zoom). Set to `8` so labels appear only when zoomed in enough that they are readable.

**Edge culling**: For levels with many edges, Sigma already culls edges at low zoom levels. No additional logic needed for the expected data sizes (sub-5000 nodes per level).

---

## 4. Level Transition UX

### 4.1 Drill-Down Flow

When a user double-clicks a node that has children:

1. **Store update**: `navigationStore.drillDown(nodeId, label, nextLevel)` is called
   - `currentLevel` advances to the next level
   - `parentId` is set to the clicked node's ID
   - Breadcrumb entry is appended

2. **Data fetch**: The `useGraphData` React Query hook reacts to the changed `currentLevel` + `parentId`:
   ```typescript
   // src/api/queries.ts
   export function useGraphData() {
     const { currentLevel, parentId } = useNavigationStore();

     return useQuery({
       queryKey: ['graph', currentLevel, parentId],
       queryFn: () => fetchGraphData(currentLevel, parentId),
       staleTime: 5 * 60 * 1000, // 5 minutes
     });
   }
   ```

3. **Transition animation** (between old and new graph):
   - Old graph fades out (Sigma camera zoom-in + opacity transition over 300ms)
   - Loading indicator appears (centered spinner with "Loading {level}...")
   - New graph data is loaded into Graphology via `graphStore.setGraphData()`
   - ForceAtlas2 starts on the new graph
   - New graph fades in (opacity transition 300ms)
   - Total transition target: under 800ms for cached data, under 2s for uncached

4. **Selection reset**: `selectionStore.clearSelection()` is called -- the previous node/edge selection does not carry into the new level.

5. **Filter preservation**: Filters remain as-is. If the user had CALLS edges hidden, they stay hidden at the new level.

### 4.2 Breadcrumb Navigation (Going Back Up)

When a user clicks a breadcrumb segment:

1. `navigationStore.navigateToBreadcrumb(index)` truncates the breadcrumb stack and sets the level/parent accordingly
2. React Query serves the previously cached graph data (instant if within `staleTime`)
3. Same fade transition applies
4. Selection is cleared
5. Filters preserved

### 4.3 Breadcrumb Visual Design

```
[L1 System] > [L2 API Gateway] > [L3 AuthModule]  (current, bold)
  indigo bg     blue bg            cyan bg
```

Each segment is a pill/badge with:
- Level prefix (L1/L2/L3/L4) in a small superscript or prefix
- Node label as the main text
- Background color matches the level color
- Hover: underline + slightly brighter
- Click: navigates to that level
- Current (last) segment: bold, non-clickable, no hover effect

### 4.4 Level Helper

```typescript
// src/lib/graphUtils.ts

import { GraphLevel } from '../types/graph';

const LEVEL_ORDER: GraphLevel[] = [
  GraphLevel.L1_SYSTEM,
  GraphLevel.L2_CONTAINER,
  GraphLevel.L3_COMPONENT,
  GraphLevel.L4_CODE,
];

export function getNextLevel(current: GraphLevel): GraphLevel | null {
  const idx = LEVEL_ORDER.indexOf(current);
  return idx < LEVEL_ORDER.length - 1 ? LEVEL_ORDER[idx + 1] : null;
}

export function getPreviousLevel(current: GraphLevel): GraphLevel | null {
  const idx = LEVEL_ORDER.indexOf(current);
  return idx > 0 ? LEVEL_ORDER[idx - 1] : null;
}

export function getLevelLabel(level: GraphLevel): string {
  const labels: Record<GraphLevel, string> = {
    [GraphLevel.L1_SYSTEM]: 'L1: System',
    [GraphLevel.L2_CONTAINER]: 'L2: Container',
    [GraphLevel.L3_COMPONENT]: 'L3: Component',
    [GraphLevel.L4_CODE]: 'L4: Code',
  };
  return labels[level];
}

export function getLevelColor(level: GraphLevel): string {
  const colors: Record<GraphLevel, string> = {
    [GraphLevel.L1_SYSTEM]: '#6366f1',
    [GraphLevel.L2_CONTAINER]: '#3b82f6',
    [GraphLevel.L3_COMPONENT]: '#06b6d4',
    [GraphLevel.L4_CODE]: '#f97316',
  };
  return colors[level];
}
```

---

## 5. Freshness Visualization

### 5.1 Stale Threshold Logic

```typescript
// src/lib/freshnessUtils.ts

const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const WARNING_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

export type FreshnessLevel = 'fresh' | 'warning' | 'stale';

export function getFreshnessLevel(lastAnalyzed: string): FreshnessLevel {
  const age = Date.now() - new Date(lastAnalyzed).getTime();
  if (age > STALE_THRESHOLD_MS) return 'stale';
  if (age > WARNING_THRESHOLD_MS) return 'warning';
  return 'fresh';
}

export function isStale(lastAnalyzed: string): boolean {
  return getFreshnessLevel(lastAnalyzed) === 'stale';
}

export function getFreshnessColor(level: FreshnessLevel): string {
  const colors: Record<FreshnessLevel, string> = {
    fresh: '#22c55e',   // green-500
    warning: '#f59e0b', // amber-500
    stale: '#ef4444',   // red-500
  };
  return colors[level];
}

export function formatRelativeTime(isoDate: string): string {
  const seconds = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
```

### 5.2 Node Freshness Visual Treatment

| Freshness | Node appearance |
|---|---|
| Fresh (< 3 days) | Normal color, no border decoration |
| Warning (3-7 days) | Slightly desaturated, thin amber border (2px) |
| Stale (> 7 days) | 60% desaturated, thick amber border (3px), dashed outline effect |

### 5.3 Edge Freshness

Edges inherit the worst freshness of their source or target node. A stale edge is rendered with reduced opacity (0.4) and a lighter color.

### 5.4 Hover Tooltip

When hovering a node, a tooltip appears near the cursor (positioned by Sigma's mouse coordinates, rendered as a React portal outside the canvas):

```
┌─────────────────────────────┐
│ AuthService                 │
│ Type: Service   Level: L2   │
│ ─────────────────────────── │
│ Last analyzed: 2h ago       │
│ (2026-03-22 09:15:00 UTC)   │
│ Status: ● Fresh             │
│ Children: 12  Connections: 8│
│ ─────────────────────────── │
│ Double-click to drill down  │
└─────────────────────────────┘
```

```typescript
// Tooltip component (rendered as portal, positioned absolutely)

interface NodeTooltipProps {
  nodeId: string;
  position: { x: number; y: number }; // screen coordinates from Sigma
}
```

The tooltip appears after a 400ms hover delay to avoid flickering. It disappears immediately on mouse leave.

### 5.5 Global Freshness Banner (FreshnessBar)

Layout:

```
┌────────────────────────────────────────────────────────────────┐
│ ● Last full analysis: 2 hours ago  │  3 stale / 247 files  [↻]│
└────────────────────────────────────────────────────────────────┘
```

- Height: 40px, fixed at top of viewport
- Background color: gradient based on overall health
  - All fresh: `bg-emerald-50 border-b border-emerald-200`
  - Some stale (< 10%): `bg-amber-50 border-b border-amber-200`
  - Many stale (>= 10%): `bg-red-50 border-b border-red-200`
- Left section: clock icon + "Last full analysis: {relative time}"
- Center section: "{N} stale / {total} files" with a small progress bar underneath
- Right section: RefreshButton

### 5.6 Refresh Flow UX

1. **Idle**: RefreshButton shows sync icon + "Refresh"
2. **Click**: Button becomes disabled, icon spins, text changes to "Analyzing..."
3. **Progress**: A thin progress bar appears below the FreshnessBar (indeterminate if the API does not report progress percentage, determinate if it does)
4. **Complete**:
   - Success: Green toast "Analysis complete. {N} files updated." Toast auto-dismisses after 5 seconds.
   - Error: Red toast "Analysis failed: {error message}". Toast persists until dismissed.
5. **Post-refresh**: All React Query caches are invalidated. The current graph view re-fetches. FreshnessBar updates.

---

## 6. Data Flow

### 6.1 React Query Configuration

```typescript
// src/api/client.ts

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });

  if (!response.ok) {
    throw new Error(`API error ${response.status}: ${response.statusText}`);
  }

  return response.json();
}
```

```typescript
// src/api/queries.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client';
import { useNavigationStore } from '../stores/navigationStore';
import {
  GraphData,
  GraphNode,
  FreshnessStatus,
  SearchResult,
} from '../types/graph';

// -- Graph data for current level --

export function useGraphData() {
  const currentLevel = useNavigationStore((s) => s.currentLevel);
  const parentId = useNavigationStore((s) => s.parentId);

  return useQuery<GraphData>({
    queryKey: ['graph', currentLevel, parentId],
    queryFn: () => {
      const params = parentId ? `?parentId=${encodeURIComponent(parentId)}` : '';
      return apiFetch(`/api/graph/${currentLevel}${params}`);
    },
    staleTime: 5 * 60 * 1000,    // 5 minutes before considered stale
    gcTime: 30 * 60 * 1000,       // keep in cache 30 minutes (for back-navigation)
  });
}

// -- Node detail (for detail panel) --

export function useNodeDetail(nodeId: string | null) {
  return useQuery<GraphNode>({
    queryKey: ['node', nodeId],
    queryFn: () => apiFetch(`/api/node/${nodeId}`),
    enabled: nodeId !== null,
    staleTime: 5 * 60 * 1000,
  });
}

// -- Search --

export function useSearch(query: string, mode: 'text' | 'semantic') {
  return useQuery<SearchResult[]>({
    queryKey: ['search', query, mode],
    queryFn: () =>
      apiFetch(`/api/search?q=${encodeURIComponent(query)}&mode=${mode}`),
    enabled: query.length >= 2,
    staleTime: 2 * 60 * 1000,
  });
}

// -- Freshness status --

export function useFreshnessStatus() {
  return useQuery<FreshnessStatus>({
    queryKey: ['status'],
    queryFn: () => apiFetch('/api/status'),
    staleTime: 60 * 1000,         // re-fetch every minute
    refetchInterval: 60 * 1000,   // auto-poll every minute (lightweight GET)
  });
}

// -- Refresh mutation --

export function useRefreshMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiFetch('/api/refresh', { method: 'POST' }),
    onSuccess: () => {
      // Invalidate everything -- stale data across the board
      queryClient.invalidateQueries();
    },
  });
}
```

### 6.2 Graph Data Sync Pipeline

The `useGraphSync` hook is the bridge between React Query data and the Graphology/Sigma rendering:

```typescript
// src/hooks/useGraphSync.ts

import { useEffect } from 'react';
import { useGraphData } from '../api/queries';
import { useGraphStore } from '../stores/graphStore';
import { useFilterStore } from '../stores/filterStore';
import { useSelectionStore } from '../stores/selectionStore';
import { useForceAtlas2 } from './useForceAtlas2';

export function useGraphSync() {
  const { data, isLoading, isError } = useGraphData();
  const setGraphData = useGraphStore((s) => s.setGraphData);
  const graph = useGraphStore((s) => s.graph);
  const { startLayout } = useForceAtlas2(graph);

  // When new data arrives from the API, load it into Graphology
  useEffect(() => {
    if (data) {
      setGraphData(data);
      startLayout(); // run ForceAtlas2 on fresh data
    }
  }, [data, setGraphData, startLayout]);

  return { isLoading, isError };
}
```

### 6.3 Search Integration with Graph

When search results arrive:

1. `filterStore.setSearchHighlights(matchingNodeIds)` is called
2. The `nodeReducer` reads `searchHighlightedNodeIds` and applies highlight styling
3. If a search result is at the current level, it highlights in place
4. If a search result is at a different level, clicking the result triggers drill-down navigation to that level first, then highlights the node
5. Clearing the search bar calls `filterStore.clearSearchHighlights()`

### 6.4 Filter Application

Filters operate at the Sigma rendering layer, not the Graphology data layer. The Graphology graph always contains the full data set. Sigma's `nodeReducer` and `edgeReducer` set `hidden: true` on nodes/edges that should be filtered out.

This approach means:
- Toggling a filter is instant (no API call, no data manipulation)
- Blast radius calculations always use the full graph (correct results regardless of visual filters)
- Layout positions remain stable when toggling filters (nodes keep their positions)

### 6.5 Cache Strategy Summary

| Query | staleTime | gcTime | refetchInterval | Notes |
|---|---|---|---|---|
| graph (per level) | 5 min | 30 min | none | Long gcTime for back-navigation |
| node detail | 5 min | 10 min | none | On-demand fetch |
| search | 2 min | 5 min | none | Short-lived |
| status | 1 min | 5 min | 1 min | Lightweight polling |

---

## 7. Responsive Layout

### 7.1 Layout Grid

```typescript
// src/components/Layout/MainLayout.tsx -- layout logic

// Desktop (>= 1024px):
// [FilterPanel 280px] [GraphArea flex-1] [DetailPanel 360px]
//
// Tablet (768px - 1023px):
// FilterPanel as slide-over from left (hidden by default)
// [GraphArea full-width]
// DetailPanel as slide-over from right
//
// Mobile (< 768px):
// Not a primary target. GraphArea fills screen.
// FilterPanel and DetailPanel as full-screen modals.
```

```css
/* Tailwind classes on MainLayout container */
/* Desktop */
.main-layout {
  display: grid;
  grid-template-columns: var(--left-panel-width, 280px) 1fr var(--right-panel-width, 360px);
  grid-template-rows: 1fr;
  height: calc(100vh - 40px); /* subtract FreshnessBar */
  overflow: hidden;
}

/* When left panel collapsed */
.main-layout.left-collapsed {
  grid-template-columns: 0px 1fr var(--right-panel-width, 360px);
}

/* When right panel collapsed */
.main-layout.right-collapsed {
  grid-template-columns: var(--left-panel-width, 280px) 1fr 0px;
}

/* Both collapsed */
.main-layout.both-collapsed {
  grid-template-columns: 0px 1fr 0px;
}

/* Tablet */
@media (max-width: 1023px) {
  .main-layout {
    grid-template-columns: 1fr;
  }
}
```

### 7.2 Panel Collapse/Expand

- Left panel: toggle button on the left edge of the graph area (chevron icon)
- Right panel: opens automatically when a node/edge is selected; close button in the panel header; also closes on `Escape`
- Both panels animate with a 200ms slide transition

### 7.3 Panel Resize

Both side panels are resizable via drag handles on their inner edges:
- Left panel: drag handle on the right edge (min 200px, max 400px)
- Right panel: drag handle on the left edge (min 280px, max 500px)
- Implemented with pointer events (onPointerDown -> track movement -> onPointerUp)
- Graph canvas resizes automatically (Sigma detects container resize)

### 7.4 Keyboard Shortcuts

```typescript
// src/hooks/useKeyboardShortcuts.ts

import { useEffect } from 'react';
import { useSelectionStore } from '../stores/selectionStore';
import { useUIStore } from '../stores/uiStore';
import { useNavigationStore } from '../stores/navigationStore';

export function useKeyboardShortcuts() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      switch (e.key) {
        case 'Escape':
          // Deselect everything, close search, close right panel
          useSelectionStore.getState().clearSelection();
          useUIStore.getState().setSearchOpen(false);
          if (useUIStore.getState().rightPanelOpen) {
            useUIStore.getState().toggleRightPanel();
          }
          break;

        case '/':
          // Open search
          e.preventDefault();
          useUIStore.getState().setSearchOpen(true);
          break;

        case 'f':
          // Toggle filter panel
          if (!e.metaKey && !e.ctrlKey) {
            useUIStore.getState().toggleLeftPanel();
          }
          break;

        case 'Backspace':
          // Navigate up one level
          if (!e.metaKey && !e.ctrlKey) {
            const { breadcrumbs, navigateToBreadcrumb, resetToRoot } =
              useNavigationStore.getState();
            if (breadcrumbs.length > 0) {
              navigateToBreadcrumb(breadcrumbs.length - 1);
            } else {
              resetToRoot();
            }
          }
          break;

        case 'b':
          // Toggle blast radius (if a node is selected)
          if (!e.metaKey && !e.ctrlKey) {
            const { selectedNodeId, blastRadiusActive, deactivateBlastRadius } =
              useSelectionStore.getState();
            if (selectedNodeId && !blastRadiusActive) {
              // Trigger blast radius calculation (via the BlastRadiusOverlay logic)
              // Dispatch custom event or call a function exposed by the hook
              document.dispatchEvent(
                new CustomEvent('toggle-blast-radius', { detail: { nodeId: selectedNodeId } })
              );
            } else if (blastRadiusActive) {
              deactivateBlastRadius();
            }
          }
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
```

| Shortcut | Action |
|---|---|
| `Escape` | Deselect all, close search, close right panel |
| `/` | Open search bar |
| `f` | Toggle filter panel |
| `Backspace` | Navigate up one level |
| `b` | Toggle blast radius for selected node |
| `+` / `-` | Zoom in / out (handled natively by Sigma) |
| Mouse wheel | Zoom (handled by Sigma) |
| Click + drag on canvas | Pan (handled by Sigma) |
| Click + drag on node | Move node (handled by Sigma) |

### 7.5 Blast Radius Calculation

```typescript
// src/hooks/useBlastRadius.ts

import { useCallback } from 'react';
import Graph from 'graphology';
import { useGraphStore } from '../stores/graphStore';
import { useSelectionStore } from '../stores/selectionStore';

export function useBlastRadius() {
  const graph = useGraphStore((s) => s.graph);
  const activateBlastRadius = useSelectionStore((s) => s.activateBlastRadius);

  const calculateBlastRadius = useCallback(
    (startNodeId: string) => {
      // BFS traversal following INCOMING edges (who depends on this node?)
      const visitedNodes = new Set<string>([startNodeId]);
      const visitedEdges = new Set<string>();
      const queue: string[] = [startNodeId];

      while (queue.length > 0) {
        const current = queue.shift()!;

        // Find all nodes that have edges pointing TO the current node
        // (i.e., nodes that depend on / call / import the current node)
        graph.forEachInEdge(current, (edge, _attr, source) => {
          visitedEdges.add(edge);
          if (!visitedNodes.has(source)) {
            visitedNodes.add(source);
            queue.push(source);
          }
        });
      }

      activateBlastRadius(visitedNodes, visitedEdges);
    },
    [graph, activateBlastRadius]
  );

  return { calculateBlastRadius };
}
```

---

## Appendix A: Dependency Versions

```json
{
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "sigma": "^3.0.0",
    "graphology": "^0.25.4",
    "graphology-layout-forceatlas2": "^0.10.1",
    "@tanstack/react-query": "^5.60.0",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vite": "^6.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "tailwindcss": "^4.0.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0"
  }
}
```

## Appendix B: Node and Edge Rendering Quick Reference

### Node Visual Properties by Type and State

| Property | Source | Sigma Attribute |
|---|---|---|
| Color | `NodeType` -> `NODE_COLORS` map | `color` |
| Size | `connectionCount` + level base size | `size` |
| Border | Freshness level | `borderColor`, `borderSize` |
| Visibility | Node type filter | `hidden` |
| Highlight | Selection, search, hover | `highlighted` |
| Label visibility | Zoom level (automatic) | `labelRenderedSizeThreshold` |
| Opacity | Blast radius (dimming) | Applied via color alpha manipulation |

### Edge Visual Properties by Type and State

| Property | Source | Sigma Attribute |
|---|---|---|
| Color | `RelationshipType` -> `EDGE_COLORS` map | `color` |
| Width | `confidence` (0.0-1.0 scaled to 1-4px) | `size` |
| Visibility | Edge type filter | `hidden` |
| Type | Always arrow (directed graph) | `type: 'arrow'` |
| Opacity | Blast radius (dimming) | Applied via color alpha |
