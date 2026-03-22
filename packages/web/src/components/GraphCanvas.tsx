import { useEffect, useRef, useMemo } from 'react';
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
import { useGraphData } from '../api/hooks';
import { useUIStore } from '../store';
import { buildGraphology } from '../lib/graph-builder';
import type { GraphData } from '../api/types';

interface GraphInnerProps {
  data: GraphData;
  visibleNodeTypes: Set<string>;
  visibleEdgeTypes: Set<string>;
}

function GraphEvents() {
  const selectNode = useUIStore((s) => s.selectNode);
  const registerEvents = useRegisterEvents();

  useEffect(() => {
    registerEvents({
      clickNode: ({ node }) => selectNode(node),
      clickStage: () => selectNode(null),
    });
  }, [registerEvents, selectNode]);

  return null;
}

function GraphHighlighter() {
  const sigma = useSigma();
  const selectedNodeId = useUIStore((s) => s.selectedNodeId);
  const setSettings = useSetSettings();

  useEffect(() => {
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
  }, [selectedNodeId, setSettings, sigma]);

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

  const { data, isLoading } = useGraphData(currentLevel);

  if (isLoading || !data) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-secondary">
        Loading graph...
      </div>
    );
  }

  if (data.nodes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-secondary">
        No nodes to display. Run analysis first.
      </div>
    );
  }

  return (
    <div className="flex-1 relative" style={{ minHeight: '400px' }}>
      <SigmaContainer
        style={{ width: '100%', height: '100%' }}
        settings={{
          renderLabels: true,
          labelColor: { color: '#E6EDF3' },
          labelFont: 'Inter, sans-serif',
          labelSize: 12,
          defaultEdgeType: 'arrow',
          defaultEdgeColor: '#45526E',
          stagePadding: 40,
        }}
      >
        <GraphLoader
          data={data}
          visibleNodeTypes={visibleNodeTypes}
          visibleEdgeTypes={visibleEdgeTypes}
        />
        <GraphEvents />
        <GraphHighlighter />
        <SearchFocuser />
      </SigmaContainer>
    </div>
  );
}
