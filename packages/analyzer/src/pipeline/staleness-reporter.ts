import { GraphLevel } from '@contextualizer/core';
import type { GraphStore, AnalysisRun } from '@contextualizer/storage';

export interface StaleNodeInfo {
  id: string;
  qualifiedName: string;
  shortName: string;
  filePath: string | null;
  type: string;
}

export interface StalenessReport {
  totalNodes: number;
  staleNodes: StaleNodeInfo[];
  stalePercentage: number;
  lastAnalysisRun: AnalysisRun | null;
}

export async function getStalenessReport(store: GraphStore): Promise<StalenessReport> {
  const allNodes = await store.getAllNodes();

  const componentNodes = allNodes.filter(
    n => n.level === GraphLevel.COMPONENT,
  );

  const staleNodes: StaleNodeInfo[] = componentNodes
    .filter(n => n.isStale)
    .map(n => ({
      id: n.id,
      qualifiedName: n.qualifiedName,
      shortName: n.shortName,
      filePath: n.filePath,
      type: n.type,
    }));

  const totalNodes = componentNodes.length;
  const stalePercentage = totalNodes > 0
    ? Math.round((staleNodes.length / totalNodes) * 100)
    : 0;

  const lastAnalysisRun = await store.getLastAnalysisRun();

  return {
    totalNodes,
    staleNodes,
    stalePercentage,
    lastAnalysisRun,
  };
}
