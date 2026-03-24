import { create } from 'zustand';
import type { SavedView } from '../api/types';

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

  activeView: SavedView | null;
  activateView: (view: SavedView) => void;
  clearView: () => void;

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

  activeView: null,
  activateView: (view) =>
    set({
      activeView: view,
      drillParentId: null,
      breadcrumbs: [{ nodeId: null, label: 'Root', level: 'component' }],
    }),
  clearView: () => set({ activeView: null }),

  blastRadiusActive: false,
  blastRadiusDepth: 2,
  toggleBlastRadius: () => set((s) => ({ blastRadiusActive: !s.blastRadiusActive })),
  setBlastRadiusDepth: (depth) => set({ blastRadiusDepth: Math.min(Math.max(depth, 1), 5) }),
}));
