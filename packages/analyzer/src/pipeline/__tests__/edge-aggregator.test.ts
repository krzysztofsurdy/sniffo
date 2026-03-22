import { describe, it, expect } from 'vitest';
import { GraphLevel, NodeType, EdgeType, createNodeId, createEdgeId } from '@contextualizer/core';
import type { StoredEdge } from '@contextualizer/storage';
import { aggregateEdges } from '../edge-aggregator.js';

describe('aggregateEdges', () => {
  const containerA = createNodeId(NodeType.MODULE, 'App\\Service');
  const containerB = createNodeId(NodeType.MODULE, 'App\\Repository');
  const classA = createNodeId(NodeType.CLASS, 'App\\Service\\UserService');
  const classB = createNodeId(NodeType.CLASS, 'App\\Repository\\UserRepo');
  const methodA = createNodeId(NodeType.METHOD, 'App\\Service\\UserService::findUser');
  const methodB = createNodeId(NodeType.METHOD, 'App\\Repository\\UserRepo::find');

  const containmentMap = new Map<string, string>([
    [methodA, classA],
    [methodB, classB],
    [classA, containerA],
    [classB, containerB],
  ]);

  it('aggregates L4 method-level CALLS into L3 class-level edges', () => {
    const l4Edges: StoredEdge[] = [{
      id: createEdgeId(methodA, methodB, EdgeType.CALLS),
      source: methodA,
      target: methodB,
      type: EdgeType.CALLS,
      level: GraphLevel.CODE,
      weight: 1.0,
      metadata: {},
    }];

    const result = aggregateEdges(l4Edges, containmentMap);

    const l3Edges = result.filter(e => e.level === GraphLevel.COMPONENT);
    expect(l3Edges).toHaveLength(1);
    expect(l3Edges[0].source).toBe(classA);
    expect(l3Edges[0].target).toBe(classB);
  });

  it('aggregates L3 class-level edges into L2 container-level edges', () => {
    const l4Edges: StoredEdge[] = [{
      id: createEdgeId(methodA, methodB, EdgeType.CALLS),
      source: methodA,
      target: methodB,
      type: EdgeType.CALLS,
      level: GraphLevel.CODE,
      weight: 1.0,
      metadata: {},
    }];

    const result = aggregateEdges(l4Edges, containmentMap);
    const l2Edges = result.filter(e => e.level === GraphLevel.CONTAINER);
    expect(l2Edges).toHaveLength(1);
    expect(l2Edges[0].source).toBe(containerA);
    expect(l2Edges[0].target).toBe(containerB);
  });

  it('does not create self-referencing aggregated edges', () => {
    const methodA2 = createNodeId(NodeType.METHOD, 'App\\Service\\UserService::save');
    const methodA3 = createNodeId(NodeType.METHOD, 'App\\Service\\UserService::validate');
    const extendedContainment = new Map(containmentMap);
    extendedContainment.set(methodA2, classA);
    extendedContainment.set(methodA3, classA);

    const l4Edges: StoredEdge[] = [{
      id: createEdgeId(methodA2, methodA3, EdgeType.CALLS),
      source: methodA2,
      target: methodA3,
      type: EdgeType.CALLS,
      level: GraphLevel.CODE,
      weight: 1.0,
      metadata: {},
    }];

    const result = aggregateEdges(l4Edges, extendedContainment);
    const l3Edges = result.filter(e => e.level === GraphLevel.COMPONENT);
    expect(l3Edges).toHaveLength(0);
  });

  it('increments weight for multiple edges between same pair', () => {
    const methodA2 = createNodeId(NodeType.METHOD, 'App\\Service\\UserService::other');
    const extendedContainment = new Map(containmentMap);
    extendedContainment.set(methodA2, classA);

    const l4Edges: StoredEdge[] = [
      {
        id: createEdgeId(methodA, methodB, EdgeType.CALLS),
        source: methodA,
        target: methodB,
        type: EdgeType.CALLS,
        level: GraphLevel.CODE,
        weight: 1.0,
        metadata: {},
      },
      {
        id: createEdgeId(methodA2, methodB, EdgeType.CALLS),
        source: methodA2,
        target: methodB,
        type: EdgeType.CALLS,
        level: GraphLevel.CODE,
        weight: 1.0,
        metadata: {},
      },
    ];

    const result = aggregateEdges(l4Edges, extendedContainment);
    const l3Edges = result.filter(e => e.level === GraphLevel.COMPONENT);
    expect(l3Edges).toHaveLength(1);
    expect((l3Edges[0].metadata as any).constituentEdgeCount).toBe(2);
  });
});
