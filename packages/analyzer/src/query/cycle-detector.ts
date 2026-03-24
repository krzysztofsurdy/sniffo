import type { GraphStore } from '@sniffo/storage';
import { GraphLevel, EdgeType } from '@sniffo/core';

const STRUCTURAL_TYPES = new Set([
  EdgeType.EXTENDS, EdgeType.IMPLEMENTS, EdgeType.USES_TRAIT,
  EdgeType.CALLS, EdgeType.INJECTS, EdgeType.DEPENDS_ON,
  EdgeType.INSTANTIATES, EdgeType.IMPORTS,
]);

export async function detectCycles(store: GraphStore): Promise<string[][]> {
  const allNodes = await store.getAllNodes();
  const componentNodes = allNodes.filter(n => n.level === GraphLevel.COMPONENT);
  const allEdges = await store.getAllEdges();

  const adj = new Map<string, string[]>();
  for (const node of componentNodes) {
    adj.set(node.id, []);
  }
  for (const edge of allEdges) {
    if (!STRUCTURAL_TYPES.has(edge.type)) continue;
    if (edge.type === EdgeType.CONTAINS) continue;
    if (!adj.has(edge.source)) continue;
    adj.get(edge.source)!.push(edge.target);
  }

  const cycles: string[][] = [];
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();

  for (const nodeId of adj.keys()) {
    color.set(nodeId, WHITE);
  }

  function dfs(u: string, path: string[]): void {
    color.set(u, GRAY);
    path.push(u);

    for (const v of adj.get(u) ?? []) {
      if (!adj.has(v)) continue;
      if (color.get(v) === GRAY) {
        const cycleStart = path.indexOf(v);
        if (cycleStart >= 0) {
          const cycle = path.slice(cycleStart);
          if (cycle.length >= 2) {
            cycles.push(cycle);
          }
        }
      } else if (color.get(v) === WHITE) {
        dfs(v, path);
      }
    }

    path.pop();
    color.set(u, BLACK);
  }

  for (const nodeId of adj.keys()) {
    if (color.get(nodeId) === WHITE) {
      dfs(nodeId, []);
    }
  }

  return cycles;
}
