import { useEffect, useRef, useMemo, useCallback } from 'react';
import {
  SigmaContainer,
  useRegisterEvents,
  useSigma,
  useSetSettings,
  useCamera,
  useLoadGraph,
} from '@react-sigma/core';
import '@react-sigma/core/lib/style.css';
import FA2Layout from 'graphology-layout-forceatlas2/worker';
import { useGraphData, useChildren, useBlastRadius } from '../api/hooks';
import { useUIStore, useNavigationStore } from '../store';
import { buildGraphology } from '../lib/graph-builder';
import type { GraphData } from '../api/types';
import LevelNavigator from './LevelNavigator';
import BlastRadiusControls from './BlastRadiusControls';
import GraphControls from './GraphControls';
import ExportMenu from './ExportMenu';

interface GraphInnerProps {
  data: GraphData;
  visibleNodeTypes: Set<string>;
  visibleEdgeTypes: Set<string>;
}

function GraphEvents() {
  const selectNode = useUIStore((s) => s.selectNode);
  const toggleNodeSelection = useUIStore((s) => s.toggleNodeSelection);
  const drillDown = useNavigationStore((s) => s.drillDown);
  const sigma = useSigma();
  const registerEvents = useRegisterEvents();

  useEffect(() => {
    registerEvents({
      clickNode: ({ node, event }) => {
        const graph = sigma.getGraph();
        const label = graph.getNodeAttribute(node, 'label') ?? node;
        if (event.original.shiftKey) {
          toggleNodeSelection(node);
        } else {
          selectNode(node, label);
        }
      },
      clickStage: () => selectNode(null),
      doubleClickNode: ({ node }) => {
        const graph = sigma.getGraph();
        const label = graph.getNodeAttribute(node, 'label') ?? node;
        drillDown(node, label, 'children');
      },
    });
  }, [registerEvents, selectNode, toggleNodeSelection, drillDown, sigma]);

  return null;
}

function NodeDrag({ layoutRef }: { layoutRef: React.RefObject<FA2Layout | null> }) {
  const sigma = useSigma();
  const draggedNodeRef = useRef<string | null>(null);
  const isDraggingRef = useRef(false);
  const downNodeRef = useRef<string | null>(null);

  const handleDown = useCallback(
    (e: { node: string }) => {
      downNodeRef.current = e.node;
      isDraggingRef.current = false;
    },
    [],
  );

  const handleMove = useCallback(
    (coords: { x: number; y: number }) => {
      if (!downNodeRef.current) return;

      if (!isDraggingRef.current) {
        isDraggingRef.current = true;
        draggedNodeRef.current = downNodeRef.current;
        const graph = sigma.getGraph();
        graph.setNodeAttribute(downNodeRef.current, 'highlighted', true);
        graph.setNodeAttribute(downNodeRef.current, 'fixed', true);

        graph.forEachNeighbor(downNodeRef.current, (neighbor) => {
          graph.setNodeAttribute(neighbor, 'fixed', true);
        });

        sigma.getCamera().disable();
      }

      const pos = sigma.viewportToGraph(coords);
      sigma.getGraph().setNodeAttribute(draggedNodeRef.current!, 'x', pos.x);
      sigma.getGraph().setNodeAttribute(draggedNodeRef.current!, 'y', pos.y);
    },
    [sigma],
  );

  const handleUp = useCallback(() => {
    const wasDragging = isDraggingRef.current;
    if (draggedNodeRef.current) {
      const graph = sigma.getGraph();
      graph.removeNodeAttribute(draggedNodeRef.current, 'highlighted');
      graph.removeNodeAttribute(draggedNodeRef.current, 'fixed');

      graph.forEachNeighbor(draggedNodeRef.current, (neighbor) => {
        graph.removeNodeAttribute(neighbor, 'fixed');
      });

      draggedNodeRef.current = null;
    }
    downNodeRef.current = null;
    isDraggingRef.current = false;
    sigma.getCamera().enable();

    if (wasDragging) {
      if (layoutRef.current && !layoutRef.current.isRunning()) {
        layoutRef.current.start();
      }
      setTimeout(() => {
        if (layoutRef.current?.isRunning()) {
          layoutRef.current.stop();
        }
      }, 1500);
    }
  }, [sigma, layoutRef]);

  useEffect(() => {
    sigma.on('downNode', handleDown);
    sigma.getMouseCaptor().on('mousemovebody', handleMove);
    sigma.getMouseCaptor().on('mouseup', handleUp);

    return () => {
      sigma.off('downNode', handleDown);
      sigma.getMouseCaptor().off('mousemovebody', handleMove);
      sigma.getMouseCaptor().off('mouseup', handleUp);
    };
  }, [sigma, handleDown, handleMove, handleUp]);

  return null;
}

function GraphHighlighter() {
  const sigma = useSigma();
  const selectedNodeId = useUIStore((s) => s.selectedNodeId);
  const selectedNodeIds = useUIStore((s) => s.selectedNodeIds);
  const blastRadiusActive = useNavigationStore((s) => s.blastRadiusActive);
  const blastRadiusDepth = useNavigationStore((s) => s.blastRadiusDepth);
  const setSettings = useSetSettings();

  const { data: blastData } = useBlastRadius(
    blastRadiusActive ? selectedNodeId : null,
    blastRadiusDepth,
  );

  useEffect(() => {
    if (selectedNodeIds.size > 0) {
      setSettings({
        nodeReducer: (node, attrs) => {
          if (selectedNodeIds.has(node)) {
            return { ...attrs, size: (attrs.size ?? 5) * 1.3 };
          }
          return { ...attrs, color: (attrs.color ?? '#64748B') + '30', label: '' };
        },
        edgeReducer: (edge, attrs) => {
          const graph = sigma.getGraph();
          const src = graph.source(edge);
          const tgt = graph.target(edge);
          if (selectedNodeIds.has(src) && selectedNodeIds.has(tgt)) {
            return { ...attrs, size: (attrs.size ?? 1) * 1.5 };
          }
          return { ...attrs, color: (attrs.color ?? '#45526E') + '15' };
        },
      });
      return;
    }

    if (blastRadiusActive && selectedNodeId && blastData) {
      const affectedIds = new Set(blastData.affectedNodes.map((n) => n.id));
      affectedIds.add(selectedNodeId);

      const affectedEdgeSet = new Set(
        blastData.affectedEdges.map((e) => `${e.source}->${e.target}`),
      );

      setSettings({
        nodeReducer: (node, attrs) => {
          if (node === selectedNodeId) {
            return { ...attrs, size: (attrs.size ?? 5) * 1.5 };
          }
          if (affectedIds.has(node)) {
            return attrs;
          }
          return { ...attrs, color: (attrs.color ?? '#64748B') + '26', label: '' };
        },
        edgeReducer: (edge, attrs) => {
          const graph = sigma.getGraph();
          const src = graph.source(edge);
          const tgt = graph.target(edge);
          if (affectedIds.has(src) && affectedIds.has(tgt)) {
            const key = `${src}->${tgt}`;
            if (affectedEdgeSet.has(key)) {
              return { ...attrs, color: '#F78166' };
            }
          }
          return { ...attrs, hidden: true };
        },
      });
      return;
    }

    if (!selectedNodeId) {
      setSettings({
        nodeReducer: null,
        edgeReducer: null,
      });
      return;
    }

    const graph = sigma.getGraph();
    const neighbors = new Set<string>();
    graph.forEachNeighbor(selectedNodeId, (neighbor) => neighbors.add(neighbor));

    setSettings({
      nodeReducer: (node, attrs) => {
        if (node === selectedNodeId) {
          return { ...attrs, size: (attrs.size ?? 5) * 1.5 };
        }
        if (neighbors.has(node)) {
          return attrs;
        }
        return { ...attrs, color: (attrs.color ?? '#64748B') + '30', label: '' };
      },
      edgeReducer: (edge, attrs) => {
        const src = graph.source(edge);
        const tgt = graph.target(edge);
        if (src === selectedNodeId || tgt === selectedNodeId) {
          return { ...attrs, size: (attrs.size ?? 1) * 1.5 };
        }
        return { ...attrs, color: (attrs.color ?? '#45526E') + '15' };
      },
    });
  }, [selectedNodeId, selectedNodeIds, blastRadiusActive, blastData, setSettings, sigma]);

  return null;
}

function SearchFocuser() {
  const searchFocusedNodeId = useUIStore((s) => s.searchFocusedNodeId);
  const selectNode = useUIStore((s) => s.selectNode);
  const sigma = useSigma();
  const { gotoNode } = useCamera({ duration: 500 });

  useEffect(() => {
    if (!searchFocusedNodeId) return;
    const graph = sigma.getGraph();
    if (!graph.hasNode(searchFocusedNodeId)) return;

    gotoNode(searchFocusedNodeId);
    selectNode(searchFocusedNodeId);
  }, [searchFocusedNodeId, sigma, gotoNode, selectNode]);

  return null;
}

function GraphLoader({ data, visibleNodeTypes, visibleEdgeTypes, layoutRef }: GraphInnerProps & { layoutRef: React.MutableRefObject<FA2Layout | null> }) {
  const loadGraph = useLoadGraph();
  const sigma = useSigma();

  const graph = useMemo(
    () => buildGraphology(data, visibleNodeTypes, visibleEdgeTypes),
    [data, visibleNodeTypes, visibleEdgeTypes],
  );

  useEffect(() => {
    loadGraph(graph);

    if (layoutRef.current) {
      layoutRef.current.kill();
      layoutRef.current = null;
    }

    if (graph.order === 0) return;

    const sigmaGraph = sigma.getGraph();
    const layout = new FA2Layout(sigmaGraph, {
      getEdgeWeight: 'size',
      settings: {
        gravity: 1,
        scalingRatio: 2,
        slowDown: 10,
        adjustSizes: true,
        barnesHutOptimize: sigmaGraph.order > 100,
      },
    });
    layout.start();
    layoutRef.current = layout;

    const timer = setTimeout(() => {
      if (layoutRef.current?.isRunning()) {
        layoutRef.current.stop();
      }
    }, 3000);

    return () => {
      clearTimeout(timer);
      if (layoutRef.current) {
        layoutRef.current.kill();
        layoutRef.current = null;
      }
    };
  }, [graph, loadGraph, sigma, layoutRef]);

  return null;
}

export default function GraphCanvas() {
  const currentLevel = useUIStore((s) => s.currentLevel);
  const visibleNodeTypes = useUIStore((s) => s.visibleNodeTypes);
  const visibleEdgeTypes = useUIStore((s) => s.visibleEdgeTypes);
  const drillParentId = useNavigationStore((s) => s.drillParentId);
  const layoutRef = useRef<FA2Layout | null>(null);

  const { data: levelData, isLoading: levelLoading } = useGraphData(currentLevel);
  const { data: childrenData, isLoading: childrenLoading } = useChildren(drillParentId);

  const isLoading = drillParentId ? childrenLoading : levelLoading;

  const graphData = drillParentId && childrenData
    ? { nodes: childrenData.children, edges: childrenData.edges }
    : levelData;

  if (isLoading || !graphData) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-secondary">
        Loading graph...
      </div>
    );
  }

  if (graphData.nodes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-secondary">
        No nodes to display. Run analysis first.
      </div>
    );
  }

  return (
    <div className="flex-1 relative" style={{ minHeight: '400px' }}>
      <LevelNavigator />
      <BlastRadiusControls />
      <SigmaContainer
        style={{ width: '100%', height: '100%', backgroundColor: '#0D1117' }}
        settings={{
          renderLabels: true,
          labelColor: { color: '#E6EDF3' },
          labelFont: 'Inter, sans-serif',
          labelSize: 12,
          defaultEdgeType: 'arrow',
          defaultEdgeColor: '#45526E',
          stagePadding: 40,
          allowInvalidContainer: true,
        }}
      >
        <GraphLoader
          data={graphData}
          visibleNodeTypes={visibleNodeTypes}
          visibleEdgeTypes={visibleEdgeTypes}
          layoutRef={layoutRef}
        />
        <GraphEvents />
        <NodeDrag layoutRef={layoutRef} />
        <GraphHighlighter />
        <SearchFocuser />
        <GraphControls />
        <ExportMenu />
      </SigmaContainer>
    </div>
  );
}
