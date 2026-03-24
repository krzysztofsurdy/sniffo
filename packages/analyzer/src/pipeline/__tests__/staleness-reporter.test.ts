import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DuckDBGraphStore } from '@sniffo/storage';
import { GraphLevel, NodeType, createNodeId } from '@sniffo/core';
import { getStalenessReport, type StalenessReport } from '../staleness-reporter.js';

describe('getStalenessReport', () => {
  let store: DuckDBGraphStore;
  const now = new Date().toISOString();

  beforeEach(async () => {
    store = new DuckDBGraphStore(':memory:');
    await store.initialize();
  });

  afterEach(async () => {
    await store.close();
  });

  it('reports zero stale nodes when all are clean', async () => {
    await store.upsertNode({
      id: createNodeId(NodeType.CLASS, 'App\\A'),
      type: NodeType.CLASS,
      level: GraphLevel.COMPONENT,
      qualifiedName: 'App\\A',
      shortName: 'A',
      filePath: 'src/A.php',
      startLine: 1, endLine: 10,
      contentHash: 'x',
      isStale: false,
      lastAnalyzedAt: now,
      metadata: {},
    });

    const report = await getStalenessReport(store);
    expect(report.staleNodes).toHaveLength(0);
    expect(report.totalNodes).toBe(1);
    expect(report.stalePercentage).toBe(0);
  });

  it('lists stale nodes with their file paths', async () => {
    const nodeId = createNodeId(NodeType.CLASS, 'App\\B');
    await store.upsertNode({
      id: nodeId,
      type: NodeType.CLASS,
      level: GraphLevel.COMPONENT,
      qualifiedName: 'App\\B',
      shortName: 'B',
      filePath: 'src/B.php',
      startLine: 1, endLine: 10,
      contentHash: 'x',
      isStale: true,
      lastAnalyzedAt: now,
      metadata: {},
    });

    const report = await getStalenessReport(store);
    expect(report.staleNodes).toHaveLength(1);
    expect(report.staleNodes[0].qualifiedName).toBe('App\\B');
    expect(report.stalePercentage).toBe(100);
  });

  it('calculates correct stale percentage', async () => {
    const base = { level: GraphLevel.COMPONENT as const, startLine: 1, endLine: 5, contentHash: 'x', lastAnalyzedAt: now, metadata: {} };
    await store.upsertNode({ ...base, id: createNodeId(NodeType.CLASS, 'A'), type: NodeType.CLASS, qualifiedName: 'A', shortName: 'A', filePath: 'a.php', isStale: false });
    await store.upsertNode({ ...base, id: createNodeId(NodeType.CLASS, 'B'), type: NodeType.CLASS, qualifiedName: 'B', shortName: 'B', filePath: 'b.php', isStale: true });
    await store.upsertNode({ ...base, id: createNodeId(NodeType.CLASS, 'C'), type: NodeType.CLASS, qualifiedName: 'C', shortName: 'C', filePath: 'c.php', isStale: false });
    await store.upsertNode({ ...base, id: createNodeId(NodeType.CLASS, 'D'), type: NodeType.CLASS, qualifiedName: 'D', shortName: 'D', filePath: 'd.php', isStale: true });

    const report = await getStalenessReport(store);
    expect(report.stalePercentage).toBe(50);
    expect(report.staleNodes).toHaveLength(2);
    expect(report.totalNodes).toBe(4);
  });

  it('includes last analysis run info', async () => {
    await store.recordAnalysisRun({
      id: 'run-1',
      startedAt: '2026-03-22T10:00:00Z',
      completedAt: '2026-03-22T10:00:05Z',
      trigger: 'full',
      filesAnalyzed: 10,
      nodesCreated: 20,
      nodesUpdated: 0,
      nodesDeleted: 0,
      edgesCreated: 15,
      edgesDeleted: 0,
      status: 'completed',
    });

    const report = await getStalenessReport(store);
    expect(report.lastAnalysisRun).not.toBeNull();
    expect(report.lastAnalysisRun!.trigger).toBe('full');
  });
});
