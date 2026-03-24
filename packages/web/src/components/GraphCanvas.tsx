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
  const drillDown = useNavigationStore((s) => s.drillDown);
  const sigma = useSigma();
  const registerEvents = useRegisterEvents();

  useEffect(() => {
    registerEvents({
      clickNode: ({ node }) => selectNode(node),
      clickStage: () => selectNode(null),
      doubleClickNode: ({ node }) => {
        const graph = sigma.getGraph();
        const label = graph.getNodeAttribute(node, 'label') ?? node;
        drillDown(node, label, 'children');
      },
    });
  }, [registerEvents, selectNode, drillDown, sigma]);

  return null;
}

function NodeDrag() {
  const sigma = useSigma();
  const draggedNodeRef = useRef<string | null>(null);
  const isDraggingRef = useRef(false);

  const handleDown = useCallback(
    (e: { node: string }) => {
      draggedNodeRef.current = e.node;
      isDraggingRef.current = false;
      sigma.getGraph().setNodeAttribute(e.node, 'highlighted', true);
      sigma.getCamera().disable();
    },
    [sigma],
  );

  const handleMove = useCallback(
    (coords: { x: number; y: number }) => {
      if (!draggedNodeRef.current) return;
      isDraggingRef.current = true;
      const pos = sigma.viewportToGraph(coords);
      sigma.getGraph().setNodeAttribute(draggedNodeRef.current, 'x', pos.x);
      sigma.getGraph().setNodeAttribute(draggedNodeRef.current, 'y', pos.y);
    },
    [sigma],
  );

  const handleUp = useCallback(() => {
    if (draggedNodeRef.current) {
      sigma.getGraph().removeNodeAttribute(draggedNodeRef.current, 'highlighted');
      draggedNodeRef.current = null;
    }
    isDraggingRef.current = false;
    sigma.getCamera().enable();
  }, [sigma]);

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
  const blastRadiusActive = useNavigationStore((s) => s.blastRadiusActive);
  const blastRadiusDepth = useNavigationStore((s) => s.blastRadiusDepth);
  const setSettings = useSetSettings();

  const { data: blastData } = useBlastRadius(
    blastRadiusActive ? selectedNodeId : null,
    blastRadiusDepth,
  );

  useEffect(() => {
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

    setSettings({
      nodeReducer: (node, attrs) => {
        if (node === selectedNodeId) {
          return { ...attrs, size: (attrs.size ?? 5) * 1.5 };
        }
        return { ...attrs, color: (attrs.color ?? '#64748B') + '40', label: '' };
      },
      edgeReducer: (edge, attrs) => {
        const graph = sigma.getGraph();
        const src = graph.source(edge);
        const tgt = graph.target(edge);
        if (src !== selectedNodeId && tgt !== selectedNodeId) {
          return { ...attrs, hidden: true };
        }
        return attrs;
      },
    });
  }, [selectedNodeId, blastRadiusActive, blastData, setSettings, sigma]);

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

function GraphLoader({ data, visibleNodeTypes, visibleEdgeTypes }: GraphInnerProps) {
  const loadGraph = useLoadGraph();
  const sigma = useSigma();
  const layoutRef = useRef<FA2Layout | null>(null);

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
      settings: {
        gravity: 1,
        scalingRatio: 2,
        slowDown: 5,
        barnesHutOptimize: sigmaGraph.order > 100,
      },
    });
    layout.start();
    layoutRef.current = layout;

    const timer = setTimeout(() => {
      if (layoutRef.current?.isRunning()) {
        layoutRef.current.stop();
      }
    }, 5000);

    return () => {
      clearTimeout(timer);
      if (layoutRef.current) {
        layoutRef.current.kill();
        layoutRef.current = null;
      }
    };
  }, [graph, loadGraph, sigma]);

  return null;
}

export default function GraphCanvas() {
  const currentLevel = useUIStore((s) => s.currentLevel);
  const visibleNodeTypes = useUIStore((s) => s.visibleNodeTypes);
  const visibleEdgeTypes = useUIStore((s) => s.visibleEdgeTypes);
  const drillParentId = useNavigationStore((s) => s.drillParentId);

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
        />
        <GraphEvents />
        <NodeDrag />
        <GraphHighlighter />
        <SearchFocuser />
        <GraphControls />
        <ExportMenu />
      </SigmaContainer>
    </div>
  );
}
