# Phase 3: Freshness System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement cascade invalidation, incremental updates, staleness detection, a minimal CLI (`lpc update`, `lpc install-hook`), and a git pre-commit hook so the graph stays current automatically.

**Architecture:** New cascade invalidator in `@contextualizer/analyzer`. Extend `AnalysisPipeline` with incremental mode (accept file list). New `@contextualizer/cli` package with Commander.js. Pre-commit hook shell script + installer.

**Tech Stack:** Commander.js for CLI, existing DuckDB store, existing pipeline, shell script for git hook

**Reference docs:**
- `docs/backend-specification.md` lines 688-805 -- incremental update algorithm, cascade invalidation BFS, state categories
- `docs/system-design.md` lines 895-999 -- freshness system, hash registry, cascade invalidation
- `docs/delivery-plan.md` lines 79-107 -- Phase 3 definition of done

**Phase 2 artifacts used:**
- `packages/analyzer/src/pipeline/analysis-pipeline.ts` -- AnalysisPipeline, PipelineOptions
- `packages/storage/src/graph-store.ts` -- GraphStore interface (getNodesByFilePath, getIncomingEdges, markNodesStale, markNodesClean)
- `packages/core/src/freshness/content-hasher.ts` -- hashFile()

---

## Task 1: Cascade invalidation module

**Files:**
- Create: `packages/analyzer/src/pipeline/cascade-invalidator.ts`
- Create: `packages/analyzer/src/pipeline/__tests__/cascade-invalidator.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/analyzer/src/pipeline/__tests__/cascade-invalidator.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DuckDBGraphStore } from '@contextualizer/storage';
import { GraphLevel, NodeType, EdgeType, createNodeId, createEdgeId } from '@contextualizer/core';
import { cascadeInvalidation, type InvalidationResult } from '../cascade-invalidator.js';

describe('cascadeInvalidation', () => {
  let store: DuckDBGraphStore;

  const now = new Date().toISOString();
  const makeNode = (type: NodeType, fqn: string, filePath: string) => ({
    id: createNodeId(type, fqn),
    type,
    level: GraphLevel.COMPONENT,
    qualifiedName: fqn,
    shortName: fqn.split('\\').pop()!,
    filePath,
    startLine: 1,
    endLine: 10,
    contentHash: 'x',
    isStale: false,
    lastAnalyzedAt: now,
    metadata: {},
  });

  const makeEdge = (srcId: string, tgtId: string, type: EdgeType) => ({
    id: createEdgeId(srcId, tgtId, type),
    source: srcId,
    target: tgtId,
    type,
    level: GraphLevel.COMPONENT,
    weight: 1.0,
    metadata: {},
  });

  beforeEach(async () => {
    store = new DuckDBGraphStore(':memory:');
    await store.initialize();
  });

  afterEach(async () => {
    await store.close();
  });

  it('marks direct dependents as stale when target file changes', async () => {
    // A extends B. B changes -> A should be stale.
    const nodeA = makeNode(NodeType.CLASS, 'App\\A', 'src/A.php');
    const nodeB = makeNode(NodeType.CLASS, 'App\\B', 'src/B.php');
    await store.upsertNode(nodeA);
    await store.upsertNode(nodeB);
    await store.upsertEdge(makeEdge(nodeA.id, nodeB.id, EdgeType.EXTENDS));

    const result = await cascadeInvalidation(store, ['src/B.php']);

    expect(result.directlyChanged).toContain(nodeB.id);
    expect(result.cascadeInvalidated).toContain(nodeA.id);

    const updatedA = await store.getNodeById(nodeA.id);
    expect(updatedA!.isStale).toBe(true);
  });

  it('cascades through structural edges (EXTENDS, IMPLEMENTS, USES_TRAIT)', async () => {
    // C extends B extends A. A changes -> B stale, C stale (depth 2).
    const nodeA = makeNode(NodeType.CLASS, 'App\\A', 'src/A.php');
    const nodeB = makeNode(NodeType.CLASS, 'App\\B', 'src/B.php');
    const nodeC = makeNode(NodeType.CLASS, 'App\\C', 'src/C.php');
    await store.upsertNode(nodeA);
    await store.upsertNode(nodeB);
    await store.upsertNode(nodeC);
    await store.upsertEdge(makeEdge(nodeB.id, nodeA.id, EdgeType.EXTENDS));
    await store.upsertEdge(makeEdge(nodeC.id, nodeB.id, EdgeType.EXTENDS));

    const result = await cascadeInvalidation(store, ['src/A.php']);

    expect(result.cascadeInvalidated).toContain(nodeB.id);
    expect(result.cascadeInvalidated).toContain(nodeC.id);
  });

  it('does NOT cascade through CALLS edges', async () => {
    // B calls A. A changes -> B's CALLS edge stale, but B's own dependents NOT invalidated.
    const nodeA = makeNode(NodeType.CLASS, 'App\\A', 'src/A.php');
    const nodeB = makeNode(NodeType.CLASS, 'App\\B', 'src/B.php');
    const nodeD = makeNode(NodeType.CLASS, 'App\\D', 'src/D.php');
    await store.upsertNode(nodeA);
    await store.upsertNode(nodeB);
    await store.upsertNode(nodeD);
    await store.upsertEdge(makeEdge(nodeB.id, nodeA.id, EdgeType.CALLS));
    await store.upsertEdge(makeEdge(nodeD.id, nodeB.id, EdgeType.EXTENDS));

    const result = await cascadeInvalidation(store, ['src/A.php']);

    // B is a direct dependent (stale), but D should NOT be invalidated
    // because B->A is CALLS, not structural
    expect(result.cascadeInvalidated).toContain(nodeB.id);
    expect(result.cascadeInvalidated).not.toContain(nodeD.id);
  });

  it('limits cascade to MAX_DEPTH of 2', async () => {
    // Chain: E extends D extends C extends B extends A. A changes.
    // Should cascade at most 2 hops: B and C, but NOT D or E.
    const nodeA = makeNode(NodeType.CLASS, 'App\\A', 'src/A.php');
    const nodeB = makeNode(NodeType.CLASS, 'App\\B', 'src/B.php');
    const nodeC = makeNode(NodeType.CLASS, 'App\\C', 'src/C.php');
    const nodeD = makeNode(NodeType.CLASS, 'App\\D', 'src/D.php');
    const nodeE = makeNode(NodeType.CLASS, 'App\\E', 'src/E.php');
    await store.upsertNode(nodeA);
    await store.upsertNode(nodeB);
    await store.upsertNode(nodeC);
    await store.upsertNode(nodeD);
    await store.upsertNode(nodeE);
    await store.upsertEdge(makeEdge(nodeB.id, nodeA.id, EdgeType.EXTENDS));
    await store.upsertEdge(makeEdge(nodeC.id, nodeB.id, EdgeType.EXTENDS));
    await store.upsertEdge(makeEdge(nodeD.id, nodeC.id, EdgeType.EXTENDS));
    await store.upsertEdge(makeEdge(nodeE.id, nodeD.id, EdgeType.EXTENDS));

    const result = await cascadeInvalidation(store, ['src/A.php']);

    expect(result.cascadeInvalidated).toContain(nodeB.id);
    expect(result.cascadeInvalidated).toContain(nodeC.id);
    expect(result.cascadeInvalidated).not.toContain(nodeD.id);
    expect(result.cascadeInvalidated).not.toContain(nodeE.id);
    expect(result.stats.cascadeDepth).toBeLessThanOrEqual(2);
  });

  it('returns empty result when no dependents exist', async () => {
    const nodeA = makeNode(NodeType.CLASS, 'App\\A', 'src/A.php');
    await store.upsertNode(nodeA);

    const result = await cascadeInvalidation(store, ['src/A.php']);

    expect(result.directlyChanged.length).toBeGreaterThan(0);
    expect(result.cascadeInvalidated).toHaveLength(0);
  });

  it('handles multiple changed files at once', async () => {
    const nodeA = makeNode(NodeType.CLASS, 'App\\A', 'src/A.php');
    const nodeB = makeNode(NodeType.CLASS, 'App\\B', 'src/B.php');
    const nodeC = makeNode(NodeType.CLASS, 'App\\C', 'src/C.php');
    await store.upsertNode(nodeA);
    await store.upsertNode(nodeB);
    await store.upsertNode(nodeC);
    await store.upsertEdge(makeEdge(nodeC.id, nodeA.id, EdgeType.IMPLEMENTS));
    await store.upsertEdge(makeEdge(nodeC.id, nodeB.id, EdgeType.USES_TRAIT));

    const result = await cascadeInvalidation(store, ['src/A.php', 'src/B.php']);

    expect(result.directlyChanged).toContain(nodeA.id);
    expect(result.directlyChanged).toContain(nodeB.id);
    expect(result.cascadeInvalidated).toContain(nodeC.id);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @contextualizer/analyzer test -- --reporter verbose src/pipeline/__tests__/cascade-invalidator.test.ts`
Expected: FAIL -- cannot resolve `../cascade-invalidator.js`

**Step 3: Implement cascade-invalidator.ts**

```typescript
// packages/analyzer/src/pipeline/cascade-invalidator.ts
import { EdgeType } from '@contextualizer/core';
import type { GraphStore, StoredEdge } from '@contextualizer/storage';

const MAX_DEPTH = 2;
const STRUCTURAL_EDGE_TYPES = new Set([EdgeType.EXTENDS, EdgeType.IMPLEMENTS, EdgeType.USES_TRAIT]);

export interface InvalidationResult {
  directlyChanged: string[];
  cascadeInvalidated: string[];
  stats: {
    directlyChangedCount: number;
    cascadeInvalidatedCount: number;
    edgesMarkedStale: number;
    cascadeDepth: number;
  };
}

export async function cascadeInvalidation(
  store: GraphStore,
  changedFilePaths: string[],
): Promise<InvalidationResult> {
  // Step 1: Collect all node IDs in changed files
  const directlyChanged: string[] = [];
  for (const filePath of changedFilePaths) {
    const nodes = await store.getNodesByFilePath(filePath);
    for (const node of nodes) {
      directlyChanged.push(node.id);
    }
  }

  // Step 2: BFS cascade
  const visited = new Set<string>(directlyChanged);
  const cascadeInvalidated: string[] = [];
  let queue = [...directlyChanged];
  let depth = 0;
  let edgesMarkedStale = 0;

  while (queue.length > 0 && depth < MAX_DEPTH) {
    const nextQueue: string[] = [];

    for (const nodeId of queue) {
      const incomingEdges = await store.getIncomingEdges(nodeId);

      for (const edge of incomingEdges) {
        edgesMarkedStale++;

        if (!visited.has(edge.source)) {
          cascadeInvalidated.push(edge.source);

          // Only cascade further through structural edges
          if (STRUCTURAL_EDGE_TYPES.has(edge.type)) {
            visited.add(edge.source);
            nextQueue.push(edge.source);
          }
        }
      }
    }

    queue = nextQueue;
    depth++;
  }

  // Mark all cascade-invalidated nodes as stale
  if (cascadeInvalidated.length > 0) {
    await store.markNodesStale(cascadeInvalidated);
  }

  return {
    directlyChanged,
    cascadeInvalidated,
    stats: {
      directlyChangedCount: directlyChanged.length,
      cascadeInvalidatedCount: cascadeInvalidated.length,
      edgesMarkedStale,
      cascadeDepth: depth,
    },
  };
}
```

**Step 4: Run tests**

Run: `pnpm --filter @contextualizer/analyzer test -- --reporter verbose src/pipeline/__tests__/cascade-invalidator.test.ts`
Expected: All 6 tests PASS

**Step 5: Commit**

```bash
git add packages/analyzer/src/pipeline/cascade-invalidator.ts packages/analyzer/src/pipeline/__tests__/cascade-invalidator.test.ts
git commit -m "feat: add cascade invalidation with BFS depth-limited staleness propagation"
```

---

## Task 2: Incremental analysis mode

**Files:**
- Modify: `packages/analyzer/src/pipeline/analysis-pipeline.ts` (add `analyzeIncremental` method)
- Create: `packages/analyzer/src/pipeline/__tests__/incremental-analysis.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/analyzer/src/pipeline/__tests__/incremental-analysis.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AnalysisPipeline } from '../analysis-pipeline.js';
import { DuckDBGraphStore } from '@contextualizer/storage';
import { ParserRegistry } from '../../parsers/parser-registry.js';
import { PhpParser } from '../../parsers/php/php-parser.js';
import { NodeType, EdgeType } from '@contextualizer/core';

describe('Incremental Analysis', () => {
  let tempDir: string;
  let store: DuckDBGraphStore;
  let registry: ParserRegistry;
  let pipeline: AnalysisPipeline;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ctx-incr-'));
    store = new DuckDBGraphStore(':memory:');
    await store.initialize();
    registry = new ParserRegistry();
    await registry.register(new PhpParser());
    pipeline = new AnalysisPipeline(store, registry);
  });

  afterEach(async () => {
    registry.dispose();
    await store.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  function writePhp(relativePath: string, content: string) {
    const fullPath = join(tempDir, relativePath);
    mkdirSync(join(fullPath, '..'), { recursive: true });
    writeFileSync(fullPath, content);
  }

  it('only re-analyzes changed files on second run', async () => {
    writePhp('src/A.php', '<?php namespace App; class A {}');
    writePhp('src/B.php', '<?php namespace App; class B {}');

    const first = await pipeline.analyze({ rootDir: tempDir, projectName: 'test' });
    expect(first.filesAnalyzed).toBe(2);

    // Second run with no changes
    const second = await pipeline.analyze({ rootDir: tempDir, projectName: 'test' });
    expect(second.filesAnalyzed).toBe(0);
    expect(second.filesSkipped).toBe(2);
  });

  it('re-analyzes only the modified file', async () => {
    writePhp('src/A.php', '<?php namespace App; class A {}');
    writePhp('src/B.php', '<?php namespace App; class B {}');

    await pipeline.analyze({ rootDir: tempDir, projectName: 'test' });

    // Modify A only
    writePhp('src/A.php', '<?php namespace App; class A { public function hello(): void {} }');

    const result = await pipeline.analyze({ rootDir: tempDir, projectName: 'test' });
    expect(result.filesAnalyzed).toBe(1);
    expect(result.filesSkipped).toBe(1);
  });

  it('handles deleted files by removing their nodes', async () => {
    writePhp('src/A.php', '<?php namespace App; class A {}');
    writePhp('src/B.php', '<?php namespace App; class B {}');

    await pipeline.analyze({ rootDir: tempDir, projectName: 'test' });

    // Delete B
    rmSync(join(tempDir, 'src/B.php'));

    const result = await pipeline.analyze({ rootDir: tempDir, projectName: 'test' });
    const nodeB = await store.getNodeByQualifiedName('App\\B');
    expect(nodeB).toBeNull();
  });

  it('marks dependents stale via cascade invalidation on incremental run', async () => {
    writePhp('src/Base.php', '<?php namespace App; class Base { public function foo(): void {} }');
    writePhp('src/Child.php', '<?php namespace App; class Child extends Base {}');

    await pipeline.analyze({ rootDir: tempDir, projectName: 'test' });

    // Modify Base
    writePhp('src/Base.php', '<?php namespace App; class Base { public function bar(): void {} }');

    await pipeline.analyzeIncremental({ rootDir: tempDir, projectName: 'test' });

    const child = await store.getNodeByQualifiedName('App\\Child');
    expect(child!.isStale).toBe(true);
  });

  it('incremental update with specific file list', async () => {
    writePhp('src/A.php', '<?php namespace App; class A {}');
    writePhp('src/B.php', '<?php namespace App; class B {}');

    await pipeline.analyze({ rootDir: tempDir, projectName: 'test' });

    // Modify A
    writePhp('src/A.php', '<?php namespace App; class A { public function x(): void {} }');

    const result = await pipeline.analyzeIncremental({
      rootDir: tempDir,
      projectName: 'test',
      files: ['src/A.php'],
    });

    expect(result.filesAnalyzed).toBe(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @contextualizer/analyzer test -- --reporter verbose src/pipeline/__tests__/incremental-analysis.test.ts`
Expected: FAIL -- `analyzeIncremental` does not exist

**Step 3: Add `analyzeIncremental` to AnalysisPipeline**

Add to `packages/analyzer/src/pipeline/analysis-pipeline.ts`:

```typescript
import { cascadeInvalidation } from './cascade-invalidator.js';

// Add to PipelineOptions:
// files?: string[];  // Specific files to analyze (incremental mode)

// Add method to AnalysisPipeline class:
async analyzeIncremental(options: PipelineOptions): Promise<AnalysisResult> {
  const startTime = Date.now();
  const errors: AnalysisError[] = [];
  let symbolsFound = 0;
  let referencesFound = 0;
  let filesFailed = 0;

  // If specific files provided, discover only those
  // Otherwise, discover all and use change detection
  let filesToProcess: FileChange[];
  let filesSkipped = 0;
  let filesScanned: number;

  if (options.files && options.files.length > 0) {
    // Targeted incremental: only the specified files
    const { discoverSpecificFiles } = await this.discoverSpecific(options);
    filesToProcess = discoverSpecificFiles;
    filesScanned = filesToProcess.length;
  } else {
    // Full discovery with change detection
    const includePatterns = options.includePatterns ?? ['**/*.php'];
    const discoveredFiles = await discoverFiles(options.rootDir, includePatterns, options.excludePatterns ?? []);
    filesScanned = discoveredFiles.length;

    const changeSet = await detectChanges(
      discoveredFiles,
      (filePath) => this.store.getFileHash(filePath),
      () => this.store.getAllTrackedPaths(),
      hashFile,
    );

    // Handle deleted files
    for (const deletedPath of changeSet.deleted) {
      await this.store.removeNodesByFilePath(deletedPath);
      await this.store.removeFileHash(deletedPath);
    }

    filesToProcess = [...changeSet.added, ...changeSet.modified];
    filesSkipped = changeSet.unchanged.length;
  }

  // Parse changed files (same as analyze)
  const parsedFiles: ParsedFile[] = [];
  // ... (reuse same parsing logic as analyze)

  // After parsing, run cascade invalidation
  const changedFilePaths = filesToProcess.map(f => f.file.relativePath);
  await cascadeInvalidation(this.store, changedFilePaths);

  // Resolve references (same as analyze)
  // Build hierarchy
  // Aggregate edges

  // Return result
}
```

The key difference from `analyze()` is: after parsing, call `cascadeInvalidation()` to mark dependents stale.

Rather than duplicating the entire analyze method, refactor to share internals. Extract common steps into private methods.

**Step 4: Run tests**

Run: `pnpm --filter @contextualizer/analyzer test -- --reporter verbose src/pipeline/__tests__/incremental-analysis.test.ts`
Expected: All 5 tests PASS

**Step 5: Run all tests for regressions**

Run: `pnpm --filter @contextualizer/analyzer test`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add packages/analyzer/src/pipeline/analysis-pipeline.ts packages/analyzer/src/pipeline/__tests__/incremental-analysis.test.ts
git commit -m "feat: add incremental analysis with cascade invalidation"
```

---

## Task 3: Staleness query module

**Files:**
- Create: `packages/analyzer/src/pipeline/staleness-reporter.ts`
- Create: `packages/analyzer/src/pipeline/__tests__/staleness-reporter.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/analyzer/src/pipeline/__tests__/staleness-reporter.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DuckDBGraphStore } from '@contextualizer/storage';
import { GraphLevel, NodeType, createNodeId } from '@contextualizer/core';
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
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @contextualizer/analyzer test -- --reporter verbose src/pipeline/__tests__/staleness-reporter.test.ts`
Expected: FAIL

**Step 3: Implement staleness-reporter.ts**

```typescript
// packages/analyzer/src/pipeline/staleness-reporter.ts
import { GraphLevel } from '@contextualizer/core';
import type { GraphStore, StoredNode, AnalysisRun } from '@contextualizer/storage';

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

  // Only count component-level nodes (classes, interfaces, etc.)
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
```

**Step 4: Run tests**

Run: `pnpm --filter @contextualizer/analyzer test -- --reporter verbose src/pipeline/__tests__/staleness-reporter.test.ts`
Expected: All 4 tests PASS

**Step 5: Commit**

```bash
git add packages/analyzer/src/pipeline/staleness-reporter.ts packages/analyzer/src/pipeline/__tests__/staleness-reporter.test.ts
git commit -m "feat: add staleness report for querying stale nodes"
```

---

## Task 4: CLI package scaffold with Commander.js

**Files:**
- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/cli/vitest.config.ts`
- Create: `packages/cli/src/index.ts`
- Create: `packages/cli/src/cli.ts`

**Step 1: Create package.json**

```json
{
  "name": "@contextualizer/cli",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "bin": {
    "lpc": "dist/index.js"
  },
  "main": "dist/cli.js",
  "types": "dist/cli.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@contextualizer/core": "workspace:*",
    "@contextualizer/analyzer": "workspace:*",
    "@contextualizer/storage": "workspace:*",
    "commander": "^13.0.0"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "references": [
    { "path": "../core" },
    { "path": "../storage" },
    { "path": "../analyzer" }
  ]
}
```

**Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
    exclude: ['dist/**'],
  },
});
```

**Step 4: Create src/index.ts (bin entry point)**

```typescript
#!/usr/bin/env node
import { createCli } from './cli.js';

const program = createCli();
program.parse();
```

**Step 5: Create src/cli.ts (CLI definition)**

```typescript
import { Command } from 'commander';

export function createCli(): Command {
  const program = new Command();

  program
    .name('lpc')
    .description('llmProjectContextualizer -- Codebase Knowledge Graph Tool')
    .version('0.0.1');

  return program;
}
```

**Step 6: Install dependencies and build**

Run: `pnpm install && pnpm --filter @contextualizer/cli build`
Expected: Clean build

**Step 7: Commit**

```bash
git add packages/cli/
git commit -m "feat: scaffold @contextualizer/cli package with Commander.js"
```

---

## Task 5: CLI `lpc analyze` and `lpc update` commands

**Files:**
- Create: `packages/cli/src/commands/analyze.ts`
- Create: `packages/cli/src/commands/update.ts`
- Create: `packages/cli/src/commands/status.ts`
- Modify: `packages/cli/src/cli.ts`
- Create: `packages/cli/src/__tests__/commands.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/cli/src/__tests__/commands.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runAnalyze } from '../commands/analyze.js';
import { runUpdate } from '../commands/update.js';
import { runStatus } from '../commands/status.js';

describe('CLI commands', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ctx-cli-'));
    mkdirSync(join(tempDir, 'src'), { recursive: true });
    writeFileSync(join(tempDir, 'src', 'Foo.php'), '<?php namespace App; class Foo {}');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('runAnalyze creates .contextualizer directory and DB', async () => {
    const result = await runAnalyze(tempDir);
    expect(result.filesAnalyzed).toBe(1);

    const { existsSync } = await import('node:fs');
    expect(existsSync(join(tempDir, '.contextualizer'))).toBe(true);
  });

  it('runUpdate only processes changed files', async () => {
    await runAnalyze(tempDir);

    const result = await runUpdate(tempDir);
    expect(result.filesAnalyzed).toBe(0);
    expect(result.filesSkipped).toBe(1);
  });

  it('runUpdate detects modifications', async () => {
    await runAnalyze(tempDir);

    writeFileSync(join(tempDir, 'src', 'Foo.php'), '<?php namespace App; class Foo { public function bar(): void {} }');

    const result = await runUpdate(tempDir);
    expect(result.filesAnalyzed).toBe(1);
  });

  it('runStatus returns report', async () => {
    await runAnalyze(tempDir);

    const report = await runStatus(tempDir);
    expect(report.totalNodes).toBeGreaterThan(0);
    expect(report.stalePercentage).toBe(0);
  });
});
```

**Step 2: Implement commands**

`packages/cli/src/commands/analyze.ts`:
```typescript
import { mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { AnalysisPipeline, ParserRegistry, PhpParser } from '@contextualizer/analyzer';
import { DuckDBGraphStore } from '@contextualizer/storage';
import type { AnalysisResult } from '@contextualizer/core';

export async function runAnalyze(projectDir: string): Promise<AnalysisResult> {
  const ctxDir = join(projectDir, '.contextualizer');
  mkdirSync(ctxDir, { recursive: true });

  const dbPath = join(ctxDir, 'graph.duckdb');
  const store = new DuckDBGraphStore(dbPath);
  await store.initialize();

  const registry = new ParserRegistry();
  await registry.register(new PhpParser());

  const pipeline = new AnalysisPipeline(store, registry);
  const result = await pipeline.analyze({
    rootDir: projectDir,
    projectName: basename(projectDir),
  });

  registry.dispose();
  await store.close();

  return result;
}
```

`packages/cli/src/commands/update.ts`:
```typescript
import { join, basename } from 'node:path';
import { AnalysisPipeline, ParserRegistry, PhpParser } from '@contextualizer/analyzer';
import { DuckDBGraphStore } from '@contextualizer/storage';
import type { AnalysisResult } from '@contextualizer/core';

export async function runUpdate(projectDir: string, files?: string[]): Promise<AnalysisResult> {
  const dbPath = join(projectDir, '.contextualizer', 'graph.duckdb');
  const store = new DuckDBGraphStore(dbPath);
  await store.initialize();

  const registry = new ParserRegistry();
  await registry.register(new PhpParser());

  const pipeline = new AnalysisPipeline(store, registry);
  const result = await pipeline.analyzeIncremental({
    rootDir: projectDir,
    projectName: basename(projectDir),
    files,
  });

  registry.dispose();
  await store.close();

  return result;
}
```

`packages/cli/src/commands/status.ts`:
```typescript
import { join } from 'node:path';
import { DuckDBGraphStore } from '@contextualizer/storage';
import { getStalenessReport, type StalenessReport } from '@contextualizer/analyzer';

export async function runStatus(projectDir: string): Promise<StalenessReport> {
  const dbPath = join(projectDir, '.contextualizer', 'graph.duckdb');
  const store = new DuckDBGraphStore(dbPath);
  await store.initialize();

  const report = await getStalenessReport(store);

  await store.close();

  return report;
}
```

Update `packages/cli/src/cli.ts` to register the commands:
```typescript
import { Command } from 'commander';
import { runAnalyze } from './commands/analyze.js';
import { runUpdate } from './commands/update.js';
import { runStatus } from './commands/status.js';

export function createCli(): Command {
  const program = new Command();

  program
    .name('lpc')
    .description('llmProjectContextualizer -- Codebase Knowledge Graph Tool')
    .version('0.0.1');

  program
    .command('analyze')
    .description('Run full analysis on the project')
    .option('-d, --dir <path>', 'Project directory', process.cwd())
    .action(async (opts) => {
      const result = await runAnalyze(opts.dir);
      console.log(`Analyzed ${result.filesAnalyzed} files, found ${result.symbolsFound} symbols, ${result.referencesFound} references.`);
      if (result.errors.length > 0) {
        console.log(`${result.errors.length} errors occurred.`);
      }
    });

  program
    .command('update')
    .description('Incremental update (only changed files)')
    .option('-d, --dir <path>', 'Project directory', process.cwd())
    .action(async (opts) => {
      const result = await runUpdate(opts.dir);
      console.log(`Updated: ${result.filesAnalyzed} files analyzed, ${result.filesSkipped} unchanged.`);
    });

  program
    .command('status')
    .description('Show staleness report')
    .option('-d, --dir <path>', 'Project directory', process.cwd())
    .action(async (opts) => {
      const report = await runStatus(opts.dir);
      console.log(`Total nodes: ${report.totalNodes}`);
      console.log(`Stale: ${report.staleNodes.length} (${report.stalePercentage}%)`);
      if (report.lastAnalysisRun) {
        console.log(`Last run: ${report.lastAnalysisRun.startedAt} (${report.lastAnalysisRun.trigger})`);
      }
    });

  return program;
}
```

**Step 3: Export getStalenessReport from analyzer index**

Add to `packages/analyzer/src/index.ts`:
```typescript
export { getStalenessReport, type StalenessReport, type StaleNodeInfo } from './pipeline/staleness-reporter.js';
export { cascadeInvalidation, type InvalidationResult } from './pipeline/cascade-invalidator.js';
```

**Step 4: Run tests**

Run: `pnpm --filter @contextualizer/cli test`
Expected: All 4 tests PASS

**Step 5: Run full suite**

Run: `pnpm test`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add packages/cli/ packages/analyzer/src/index.ts
git commit -m "feat: add CLI commands (analyze, update, status) with Commander.js"
```

---

## Task 6: Pre-commit hook and installer

**Files:**
- Create: `packages/cli/src/commands/install-hook.ts`
- Create: `packages/cli/src/hook/pre-commit-hook.sh`
- Create: `packages/cli/src/__tests__/install-hook.test.ts`
- Modify: `packages/cli/src/cli.ts`

**Step 1: Write the failing test**

```typescript
// packages/cli/src/__tests__/install-hook.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { installHook, uninstallHook } from '../commands/install-hook.js';

describe('Pre-commit hook installer', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ctx-hook-'));
    execSync('git init', { cwd: tempDir, stdio: 'ignore' });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('installs pre-commit hook into .git/hooks', async () => {
    await installHook(tempDir);

    const hookPath = join(tempDir, '.git', 'hooks', 'pre-commit');
    expect(existsSync(hookPath)).toBe(true);

    const content = readFileSync(hookPath, 'utf-8');
    expect(content).toContain('lpc');
    expect(content).toContain('contextualizer');
  });

  it('makes hook executable', async () => {
    await installHook(tempDir);

    const hookPath = join(tempDir, '.git', 'hooks', 'pre-commit');
    const stat = statSync(hookPath);
    const isExecutable = (stat.mode & 0o111) !== 0;
    expect(isExecutable).toBe(true);
  });

  it('appends to existing pre-commit hook without overwriting', async () => {
    const hookPath = join(tempDir, '.git', 'hooks', 'pre-commit');
    mkdirSync(join(tempDir, '.git', 'hooks'), { recursive: true });
    const { writeFileSync, chmodSync } = await import('node:fs');
    writeFileSync(hookPath, '#!/bin/sh\necho "existing hook"\n');
    chmodSync(hookPath, 0o755);

    await installHook(tempDir);

    const content = readFileSync(hookPath, 'utf-8');
    expect(content).toContain('existing hook');
    expect(content).toContain('contextualizer');
  });

  it('uninstalls hook by removing contextualizer section', async () => {
    await installHook(tempDir);
    await uninstallHook(tempDir);

    const hookPath = join(tempDir, '.git', 'hooks', 'pre-commit');
    if (existsSync(hookPath)) {
      const content = readFileSync(hookPath, 'utf-8');
      expect(content).not.toContain('contextualizer');
    }
  });

  it('throws if not a git repository', async () => {
    const nonGitDir = mkdtempSync(join(tmpdir(), 'ctx-nogit-'));
    await expect(installHook(nonGitDir)).rejects.toThrow();
    rmSync(nonGitDir, { recursive: true, force: true });
  });
});
```

**Step 2: Implement install-hook.ts**

```typescript
// packages/cli/src/commands/install-hook.ts
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';

const HOOK_START_MARKER = '# --- contextualizer pre-commit hook start ---';
const HOOK_END_MARKER = '# --- contextualizer pre-commit hook end ---';

const HOOK_CONTENT = `
${HOOK_START_MARKER}
# Auto-update contextualizer graph on staged PHP files
STAGED_PHP_FILES=$(git diff --cached --name-only --diff-filter=ACM -- '*.php')
if [ -n "$STAGED_PHP_FILES" ]; then
  if command -v lpc &> /dev/null; then
    echo "[contextualizer] Updating graph for staged PHP files..."
    lpc update -d "$(git rev-parse --show-toplevel)" 2>/dev/null || true
  fi
fi
${HOOK_END_MARKER}
`;

export async function installHook(projectDir: string): Promise<void> {
  const gitDir = join(projectDir, '.git');
  if (!existsSync(gitDir)) {
    throw new Error(`Not a git repository: ${projectDir}`);
  }

  const hooksDir = join(gitDir, 'hooks');
  mkdirSync(hooksDir, { recursive: true });

  const hookPath = join(hooksDir, 'pre-commit');

  let existing = '';
  if (existsSync(hookPath)) {
    existing = readFileSync(hookPath, 'utf-8');
    // Don't install twice
    if (existing.includes(HOOK_START_MARKER)) {
      return;
    }
  } else {
    existing = '#!/bin/sh\n';
  }

  const newContent = existing.trimEnd() + '\n' + HOOK_CONTENT;
  writeFileSync(hookPath, newContent);
  chmodSync(hookPath, 0o755);
}

export async function uninstallHook(projectDir: string): Promise<void> {
  const hookPath = join(projectDir, '.git', 'hooks', 'pre-commit');
  if (!existsSync(hookPath)) return;

  let content = readFileSync(hookPath, 'utf-8');
  const startIdx = content.indexOf(HOOK_START_MARKER);
  const endIdx = content.indexOf(HOOK_END_MARKER);

  if (startIdx === -1 || endIdx === -1) return;

  const before = content.slice(0, startIdx);
  const after = content.slice(endIdx + HOOK_END_MARKER.length);
  content = (before + after).trim();

  if (content === '#!/bin/sh' || content === '') {
    const { unlinkSync } = await import('node:fs');
    unlinkSync(hookPath);
  } else {
    writeFileSync(hookPath, content + '\n');
    chmodSync(hookPath, 0o755);
  }
}
```

**Step 3: Register install-hook command in cli.ts**

Add to cli.ts:
```typescript
import { installHook, uninstallHook } from './commands/install-hook.js';

program
  .command('install-hook')
  .description('Install git pre-commit hook for auto-update')
  .option('-d, --dir <path>', 'Project directory', process.cwd())
  .action(async (opts) => {
    await installHook(opts.dir);
    console.log('Pre-commit hook installed.');
  });

program
  .command('uninstall-hook')
  .description('Remove git pre-commit hook')
  .option('-d, --dir <path>', 'Project directory', process.cwd())
  .action(async (opts) => {
    await uninstallHook(opts.dir);
    console.log('Pre-commit hook removed.');
  });
```

**Step 4: Run tests**

Run: `pnpm --filter @contextualizer/cli test`
Expected: All tests PASS (commands + hook tests)

**Step 5: Run full suite**

Run: `pnpm test`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add packages/cli/
git commit -m "feat: add pre-commit hook installer and uninstaller"
```

---

## Task 7: Final cleanup and full verification

**Step 1: Update analyzer exports**

Ensure `packages/analyzer/src/index.ts` exports all new modules.

**Step 2: Build all packages**

Run: `pnpm build`
Expected: Clean build, no errors

**Step 3: Run all tests**

Run: `pnpm test`
Expected: All tests PASS

**Step 4: Run typecheck**

Run: `pnpm turbo typecheck`
Expected: No type errors

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: phase 3 cleanup, all packages build and test green"
```

---

## Summary

| Task | What | Tests |
|------|------|-------|
| 1 | Cascade invalidation (BFS depth-limited) | 6 tests |
| 2 | Incremental analysis mode | 5 tests |
| 3 | Staleness report query | 4 tests |
| 4 | CLI package scaffold | 0 (scaffold only) |
| 5 | CLI commands (analyze, update, status) | 4 tests |
| 6 | Pre-commit hook installer | 5 tests |
| 7 | Final cleanup | 0 (verification only) |

**Total new tests: ~24**

**Definition of Done (from delivery plan):**
- [x] Changing a file and running update only re-analyzes that file plus direct dependents
- [x] Cascade invalidation marks structural dependents stale (MAX_DEPTH=2)
- [x] Pre-commit hook installs cleanly, runs on staged PHP files
- [x] Staleness query correctly identifies stale nodes
- [x] CLI commands work end-to-end
