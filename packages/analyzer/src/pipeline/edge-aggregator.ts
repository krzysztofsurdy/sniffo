import { GraphLevel, EdgeType, createEdgeId } from '@sniffo/core';
import type { StoredEdge } from '@sniffo/storage';

const AGGREGATED_TYPE = EdgeType.DEPENDS_ON;

export function aggregateEdges(
  l4Edges: StoredEdge[],
  containmentMap: Map<string, string>,
): StoredEdge[] {
  const l3Edges = aggregateToLevel(l4Edges, containmentMap, GraphLevel.COMPONENT);
  const l2Edges = aggregateToLevel(l3Edges, containmentMap, GraphLevel.CONTAINER);
  return [...l3Edges, ...l2Edges];
}

function aggregateToLevel(
  edges: StoredEdge[],
  containmentMap: Map<string, string>,
  targetLevel: GraphLevel,
): StoredEdge[] {
  const buckets = new Map<string, { source: string; target: string; count: number; types: Set<string> }>();

  for (const edge of edges) {
    const parentSource = containmentMap.get(edge.source);
    const parentTarget = containmentMap.get(edge.target);

    if (!parentSource || !parentTarget) continue;
    if (parentSource === parentTarget) continue;

    const key = `${parentSource}->${parentTarget}`;
    if (!buckets.has(key)) {
      buckets.set(key, { source: parentSource, target: parentTarget, count: 0, types: new Set() });
    }
    const bucket = buckets.get(key)!;
    bucket.count++;
    bucket.types.add(edge.type);
  }

  const result: StoredEdge[] = [];
  for (const bucket of buckets.values()) {
    const metadata: Record<string, unknown> = {
      constituentEdgeCount: bucket.count,
      constituentEdgeTypes: Array.from(bucket.types),
    };

    const sourceParent = containmentMap.get(bucket.source);
    const targetParent = containmentMap.get(bucket.target);
    if (sourceParent && targetParent && sourceParent !== targetParent) {
      metadata.crossPackage = true;
    }

    result.push({
      id: createEdgeId(bucket.source, bucket.target, AGGREGATED_TYPE),
      source: bucket.source,
      target: bucket.target,
      type: AGGREGATED_TYPE,
      level: targetLevel,
      weight: bucket.count,
      metadata,
    });
  }

  return result;
}
