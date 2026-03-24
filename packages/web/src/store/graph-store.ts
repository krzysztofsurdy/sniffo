import { create } from 'zustand';

export interface UIState {
  currentLevel: string;
  setCurrentLevel: (level: string) => void;

  selectedNodeId: string | null;
  selectedNodeLabel: string | null;
  selectNode: (id: string | null, label?: string) => void;

  selectedEdgeId: string | null;
  selectEdge: (id: string | null) => void;

  visibleNodeTypes: Set<string>;
  toggleNodeType: (type: string) => void;
  setAllNodeTypes: (types: string[]) => void;
  clearNodeTypes: () => void;

  visibleEdgeTypes: Set<string>;
  toggleEdgeType: (type: string) => void;
  setAllEdgeTypes: (types: string[]) => void;
  clearEdgeTypes: () => void;

  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchFocusedNodeId: string | null;
  focusSearchResult: (id: string | null) => void;

  selectedNodeIds: Set<string>;
  toggleNodeSelection: (nodeId: string) => void;
  clearSelection: () => void;
  setSelection: (nodeIds: string[]) => void;

  showEdgeLabels: boolean;
  toggleEdgeLabels: () => void;

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
  selectedNodeLabel: null,
  selectNode: (id, label) => set({ selectedNodeId: id, selectedNodeLabel: label ?? null, selectedEdgeId: null }),

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

  selectedNodeIds: new Set<string>(),
  toggleNodeSelection: (nodeId) =>
    set((state) => {
      const next = new Set(state.selectedNodeIds);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return { selectedNodeIds: next };
    }),
  clearSelection: () => set({ selectedNodeIds: new Set<string>() }),
  setSelection: (nodeIds) => set({ selectedNodeIds: new Set(nodeIds) }),

  showEdgeLabels: false,
  toggleEdgeLabels: () => set((s) => ({ showEdgeLabels: !s.showEdgeLabels })),

  filterPanelOpen: true,
  toggleFilterPanel: () => set((s) => ({ filterPanelOpen: !s.filterPanelOpen })),
  detailPanelOpen: true,
  toggleDetailPanel: () => set((s) => ({ detailPanelOpen: !s.detailPanelOpen })),
}));
