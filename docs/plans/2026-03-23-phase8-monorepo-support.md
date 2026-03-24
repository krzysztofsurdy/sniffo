# Monorepo Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the sniffo workspace-aware so monorepos get a proper hierarchy: System (L1) > Package (L1.5) > Container/Module (L2) > Component (L3) > Code (L4), with cross-package edge tagging and per-workspace detection.

**Architecture:** Add a workspace detection step that runs before parsing. It scans for `pnpm-workspace.yaml`, `lerna.json`, or `package.json` workspaces to discover package boundaries. Each discovered package becomes a PACKAGE node at CONTAINER level. The hierarchy builder groups components first by package (using file path prefix matching), then by namespace/module within each package. Edge aggregation rolls up through package boundaries. The web UI and API gain a `package` level for navigation.

**Tech Stack:** Node.js fs for workspace file detection, existing fast-glob for file matching, yaml package for pnpm-workspace.yaml parsing. No new major dependencies -- yaml is already available transitively.

---

## Task 1: Workspace detector

**Files:**
- Create: `packages/analyzer/src/pipeline/workspace-detector.ts`
- Create: `packages/analyzer/src/pipeline/__tests__/workspace-detector.test.ts`

**Step 1: Write failing tests**

```typescript
// packages/analyzer/src/pipeline/__tests__/workspace-detector.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { detectWorkspaces, type WorkspaceInfo } from '../workspace-detector.js';

describe('workspace detector', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ctx-ws-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns null for non-monorepo projects', async () => {
    writeFileSync(join(tempDir, 'package.json'), JSON.stringify({ name: 'single-pkg' }));
    const result = await detectWorkspaces(tempDir);
    expect(result).toBeNull();
  });

  it('detects pnpm workspaces from pnpm-workspace.yaml', async () => {
    writeFileSync(join(tempDir, 'pnpm-workspace.yaml'), 'packages:\n  - "packages/*"\n  - "apps/*"\n');
    mkdirSync(join(tempDir, 'packages', 'core', 'src'), { recursive: true });
    mkdirSync(join(tempDir, 'packages', 'cli', 'src'), { recursive: true });
    mkdirSync(join(tempDir, 'apps', 'web', 'src'), { recursive: true });
    writeFileSync(join(tempDir, 'packages', 'core', 'package.json'), JSON.stringify({ name: '@my/core' }));
    writeFileSync(join(tempDir, 'packages', 'cli', 'package.json'), JSON.stringify({ name: '@my/cli' }));
    writeFileSync(join(tempDir, 'apps', 'web', 'package.json'), JSON.stringify({ name: '@my/web' }));

    const result = await detectWorkspaces(tempDir);

    expect(result).not.toBeNull();
    expect(result!.type).toBe('pnpm');
    expect(result!.packages).toHaveLength(3);

    const names = result!.packages.map(p => p.name).sort();
    expect(names).toEqual(['@my/cli', '@my/core', '@my/web']);

    const corePkg = result!.packages.find(p => p.name === '@my/core')!;
    expect(corePkg.relativePath).toBe('packages/core');
  });

  it('detects npm/yarn workspaces from package.json', async () => {
    writeFileSync(join(tempDir, 'package.json'), JSON.stringify({
      name: 'my-monorepo',
      workspaces: ['packages/*'],
    }));
    mkdirSync(join(tempDir, 'packages', 'api'), { recursive: true });
    mkdirSync(join(tempDir, 'packages', 'shared'), { recursive: true });
    writeFileSync(join(tempDir, 'packages', 'api', 'package.json'), JSON.stringify({ name: '@my/api' }));
    writeFileSync(join(tempDir, 'packages', 'shared', 'package.json'), JSON.stringify({ name: '@my/shared' }));

    const result = await detectWorkspaces(tempDir);

    expect(result).not.toBeNull();
    expect(result!.type).toBe('npm');
    expect(result!.packages).toHaveLength(2);
  });

  it('detects yarn workspaces with object syntax', async () => {
    writeFileSync(join(tempDir, 'package.json'), JSON.stringify({
      name: 'my-monorepo',
      workspaces: { packages: ['packages/*'] },
    }));
    mkdirSync(join(tempDir, 'packages', 'lib'), { recursive: true });
    writeFileSync(join(tempDir, 'packages', 'lib', 'package.json'), JSON.stringify({ name: '@my/lib' }));

    const result = await detectWorkspaces(tempDir);

    expect(result).not.toBeNull();
    expect(result!.type).toBe('npm');
    expect(result!.packages).toHaveLength(1);
  });

  it('detects Composer workspaces (PHP monorepo)', async () => {
    // No pnpm/npm workspace file, but has composer.json with path repositories
    writeFileSync(join(tempDir, 'composer.json'), JSON.stringify({
      name: 'acme/monorepo',
      repositories: [
        { type: 'path', url: 'packages/*' },
      ],
    }));
    mkdirSync(join(tempDir, 'packages', 'billing'), { recursive: true });
    mkdirSync(join(tempDir, 'packages', 'auth'), { recursive: true });
    writeFileSync(join(tempDir, 'packages', 'billing', 'composer.json'), JSON.stringify({ name: 'acme/billing' }));
    writeFileSync(join(tempDir, 'packages', 'auth', 'composer.json'), JSON.stringify({ name: 'acme/auth' }));

    const result = await detectWorkspaces(tempDir);

    expect(result).not.toBeNull();
    expect(result!.type).toBe('composer');
    expect(result!.packages).toHaveLength(2);
  });

  it('handles glob patterns that match no directories', async () => {
    writeFileSync(join(tempDir, 'pnpm-workspace.yaml'), 'packages:\n  - "nonexistent/*"\n');

    const result = await detectWorkspaces(tempDir);
    expect(result).toBeNull();
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
cd /Users/krzysztofsurdy/ProjectsPrivate/llmProjectContextualizer
pnpm --filter @sniffo/analyzer test -- --reporter verbose src/pipeline/__tests__/workspace-detector.test.ts
```

Expected: FAIL -- module not found

**Step 3: Implement workspace detector**

```typescript
// packages/analyzer/src/pipeline/workspace-detector.ts
import { existsSync, readFileSync } from 'node:fs';
import { join, basename, relative } from 'node:path';
import fg from 'fast-glob';

export interface WorkspacePackage {
  name: string;
  relativePath: string;
  absolutePath: string;
}

export interface WorkspaceInfo {
  type: 'pnpm' | 'npm' | 'composer';
  rootDir: string;
  packages: WorkspacePackage[];
}

export async function detectWorkspaces(rootDir: string): Promise<WorkspaceInfo | null> {
  // Priority: pnpm-workspace.yaml > package.json workspaces > composer.json path repos
  const pnpmResult = await detectPnpmWorkspaces(rootDir);
  if (pnpmResult) return pnpmResult;

  const npmResult = await detectNpmWorkspaces(rootDir);
  if (npmResult) return npmResult;

  const composerResult = await detectComposerWorkspaces(rootDir);
  if (composerResult) return composerResult;

  return null;
}

async function detectPnpmWorkspaces(rootDir: string): Promise<WorkspaceInfo | null> {
  const yamlPath = join(rootDir, 'pnpm-workspace.yaml');
  if (!existsSync(yamlPath)) return null;

  const content = readFileSync(yamlPath, 'utf-8');
  const patterns = parsePnpmYaml(content);
  if (patterns.length === 0) return null;

  const packages = await resolvePackageDirs(rootDir, patterns, 'package.json', 'name');
  if (packages.length === 0) return null;

  return { type: 'pnpm', rootDir, packages };
}

async function detectNpmWorkspaces(rootDir: string): Promise<WorkspaceInfo | null> {
  const pkgJsonPath = join(rootDir, 'package.json');
  if (!existsSync(pkgJsonPath)) return null;

  try {
    const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
    let patterns: string[] = [];

    if (Array.isArray(pkg.workspaces)) {
      patterns = pkg.workspaces;
    } else if (pkg.workspaces && Array.isArray(pkg.workspaces.packages)) {
      patterns = pkg.workspaces.packages;
    }

    if (patterns.length === 0) return null;

    const packages = await resolvePackageDirs(rootDir, patterns, 'package.json', 'name');
    if (packages.length === 0) return null;

    return { type: 'npm', rootDir, packages };
  } catch {
    return null;
  }
}

async function detectComposerWorkspaces(rootDir: string): Promise<WorkspaceInfo | null> {
  const composerPath = join(rootDir, 'composer.json');
  if (!existsSync(composerPath)) return null;

  try {
    const composer = JSON.parse(readFileSync(composerPath, 'utf-8'));
    if (!Array.isArray(composer.repositories)) return null;

    const pathRepos = composer.repositories.filter(
      (r: Record<string, unknown>) => r.type === 'path' && typeof r.url === 'string',
    );

    const patterns = pathRepos.map((r: { url: string }) => r.url);
    if (patterns.length === 0) return null;

    const packages = await resolvePackageDirs(rootDir, patterns, 'composer.json', 'name');
    if (packages.length === 0) return null;

    return { type: 'composer', rootDir, packages };
  } catch {
    return null;
  }
}

function parsePnpmYaml(content: string): string[] {
  // Simple parser for pnpm-workspace.yaml -- avoids adding yaml dependency.
  // Handles the common format:
  //   packages:
  //     - "packages/*"
  //     - 'apps/*'
  //     - libs/*
  const patterns: string[] = [];
  let inPackages = false;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();

    if (trimmed === 'packages:') {
      inPackages = true;
      continue;
    }

    // End of packages block if we hit another top-level key
    if (inPackages && /^\w+:/.test(trimmed) && trimmed !== 'packages:') {
      break;
    }

    if (inPackages && trimmed.startsWith('- ')) {
      const pattern = trimmed
        .slice(2)
        .trim()
        .replace(/^['"]/, '')
        .replace(/['"]$/, '');
      if (pattern) patterns.push(pattern);
    }
  }

  return patterns;
}

async function resolvePackageDirs(
  rootDir: string,
  patterns: string[],
  manifestFile: string,
  nameField: string,
): Promise<WorkspacePackage[]> {
  // Resolve glob patterns to actual directories containing manifest files
  const globPatterns = patterns.map((p) => {
    // Ensure pattern ends with the manifest file
    const clean = p.replace(/\/+$/, '');
    return `${clean}/${manifestFile}`;
  });

  const matches = await fg(globPatterns, {
    cwd: rootDir,
    absolute: false,
    onlyFiles: true,
  });

  const packages: WorkspacePackage[] = [];

  for (const match of matches) {
    const pkgDir = match.replace(`/${manifestFile}`, '');
    const absPath = join(rootDir, pkgDir);
    const manifestPath = join(rootDir, match);

    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      const name = manifest[nameField] ?? basename(pkgDir);

      packages.push({
        name,
        relativePath: pkgDir,
        absolutePath: absPath,
      });
    } catch {
      // Invalid manifest, skip
      packages.push({
        name: basename(pkgDir),
        relativePath: pkgDir,
        absolutePath: absPath,
      });
    }
  }

  packages.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return packages;
}
```

**Step 4: Run tests**

```bash
pnpm --filter @sniffo/analyzer test -- --reporter verbose src/pipeline/__tests__/workspace-detector.test.ts
```

Expected: All 6 tests pass

**Step 5: Export from analyzer index**

Add to `packages/analyzer/src/index.ts`:
```typescript
export { detectWorkspaces, type WorkspaceInfo, type WorkspacePackage } from './pipeline/workspace-detector.js';
```

**Step 6: Commit**

```bash
git add packages/analyzer/src/pipeline/workspace-detector.ts packages/analyzer/src/pipeline/__tests__/workspace-detector.test.ts packages/analyzer/src/index.ts
git commit -m "feat: add workspace detector for pnpm, npm/yarn, and composer monorepos"
```

---

## Task 2: Update hierarchy builder for monorepo awareness

**Files:**
- Modify: `packages/analyzer/src/pipeline/hierarchy-builder.ts`
- Modify: `packages/analyzer/src/pipeline/__tests__/hierarchy-builder.test.ts`

The key change: when workspace info is provided, the hierarchy becomes:

```
System (L1)
  └─ Package (L2, type=PACKAGE)
       └─ Module/Namespace (L2, type=MODULE)
            └─ Component (L3)
```

Without workspaces (non-monorepo), the hierarchy stays as-is:

```
System (L1)
  └─ Module/Namespace (L2, type=MODULE)
       └─ Component (L3)
```

**Step 1: Write failing tests**

Add new tests to the existing test file `packages/analyzer/src/pipeline/__tests__/hierarchy-builder.test.ts`:

```typescript
// Add these imports at top:
import type { WorkspaceInfo } from '../workspace-detector.js';

// Add these test cases to the existing describe block:

it('creates package nodes for monorepo workspaces', () => {
  const componentNodes: StoredNode[] = [
    makeComponentNode('packages/core/src/utils.UserHelper', 'UserHelper', 'packages/core/src/utils.ts'),
    makeComponentNode('packages/core/src/models.User', 'User', 'packages/core/src/models.ts'),
    makeComponentNode('packages/cli/src/commands.Analyze', 'Analyze', 'packages/cli/src/commands.ts'),
  ];

  const workspaces: WorkspaceInfo = {
    type: 'pnpm',
    rootDir: '/project',
    packages: [
      { name: '@my/core', relativePath: 'packages/core', absolutePath: '/project/packages/core' },
      { name: '@my/cli', relativePath: 'packages/cli', absolutePath: '/project/packages/cli' },
    ],
  };

  const result = buildHierarchy(componentNodes, 'my-project', workspaces);

  // Should have package nodes
  const packageNodes = result.containerNodes.filter(n => n.type === NodeType.PACKAGE);
  expect(packageNodes).toHaveLength(2);

  const pkgNames = packageNodes.map(n => n.shortName).sort();
  expect(pkgNames).toEqual(['@my/cli', '@my/core']);

  // System -> Package edges
  const systemToPackage = result.containmentEdges.filter(
    e => e.source === result.systemNode.id && packageNodes.some(p => p.id === e.target),
  );
  expect(systemToPackage).toHaveLength(2);

  // Package -> Module edges should exist
  const moduleNodes = result.containerNodes.filter(n => n.type === NodeType.MODULE);
  expect(moduleNodes.length).toBeGreaterThan(0);
});

it('assigns components to correct package by file path', () => {
  const componentNodes: StoredNode[] = [
    makeComponentNode('packages/core/src/utils.UserHelper', 'UserHelper', 'packages/core/src/utils.ts'),
    makeComponentNode('packages/cli/src/commands.Analyze', 'Analyze', 'packages/cli/src/commands.ts'),
  ];

  const workspaces: WorkspaceInfo = {
    type: 'pnpm',
    rootDir: '/project',
    packages: [
      { name: '@my/core', relativePath: 'packages/core', absolutePath: '/project/packages/core' },
      { name: '@my/cli', relativePath: 'packages/cli', absolutePath: '/project/packages/cli' },
    ],
  };

  const result = buildHierarchy(componentNodes, 'my-project', workspaces);

  // Find package nodes
  const corePkg = result.containerNodes.find(n => n.shortName === '@my/core')!;
  const cliPkg = result.containerNodes.find(n => n.shortName === '@my/cli')!;

  // Find module nodes for each package
  const coreModules = result.containmentEdges
    .filter(e => e.source === corePkg.id)
    .map(e => e.target);
  const cliModules = result.containmentEdges
    .filter(e => e.source === cliPkg.id)
    .map(e => e.target);

  // UserHelper should be under core, not cli
  const userHelperNode = componentNodes.find(n => n.shortName === 'UserHelper')!;
  const analyzeNode = componentNodes.find(n => n.shortName === 'Analyze')!;

  // Trace: component -> module -> package
  const userHelperModule = result.containmentEdges.find(e => e.target === userHelperNode.id)?.source;
  const analyzeModule = result.containmentEdges.find(e => e.target === analyzeNode.id)?.source;

  expect(coreModules).toContain(userHelperModule);
  expect(cliModules).toContain(analyzeModule);
});

it('falls back to flat hierarchy when no workspaces provided', () => {
  const componentNodes: StoredNode[] = [
    makeComponentNode('App\\Services\\UserService', 'UserService', 'src/Services/UserService.php'),
  ];

  const result = buildHierarchy(componentNodes, 'my-project');

  // No package nodes
  const packageNodes = result.containerNodes.filter(n => n.type === NodeType.PACKAGE);
  expect(packageNodes).toHaveLength(0);

  // System -> Module directly
  const moduleNodes = result.containerNodes.filter(n => n.type === NodeType.MODULE);
  expect(moduleNodes.length).toBeGreaterThan(0);
});
```

You'll need a helper function in the test file:
```typescript
function makeComponentNode(fqn: string, shortName: string, filePath: string): StoredNode {
  return {
    id: createNodeId(NodeType.CLASS, fqn),
    type: NodeType.CLASS,
    level: GraphLevel.COMPONENT,
    qualifiedName: fqn,
    shortName,
    filePath,
    startLine: 1,
    endLine: 10,
    contentHash: 'abc',
    isStale: false,
    lastAnalyzedAt: new Date().toISOString(),
    metadata: {},
  };
}
```

**Step 2: Run tests to verify they fail**

```bash
pnpm --filter @sniffo/analyzer test -- --reporter verbose src/pipeline/__tests__/hierarchy-builder.test.ts
```

Expected: FAIL -- buildHierarchy doesn't accept 3rd arg

**Step 3: Update hierarchy builder**

Replace `packages/analyzer/src/pipeline/hierarchy-builder.ts` with:

```typescript
import { GraphLevel, NodeType, EdgeType, createNodeId, createEdgeId } from '@sniffo/core';
import type { StoredNode, StoredEdge } from '@sniffo/storage';
import type { WorkspaceInfo } from './workspace-detector.js';

export interface HierarchyResult {
  systemNode: StoredNode;
  containerNodes: StoredNode[];
  containmentEdges: StoredEdge[];
}

export function buildHierarchy(
  componentNodes: StoredNode[],
  projectName: string,
  workspaces?: WorkspaceInfo | null,
): HierarchyResult {
  const now = new Date().toISOString();

  const systemNode: StoredNode = {
    id: createNodeId(NodeType.SYSTEM, projectName),
    type: NodeType.SYSTEM,
    level: GraphLevel.SYSTEM,
    qualifiedName: projectName,
    shortName: projectName,
    filePath: null,
    startLine: null,
    endLine: null,
    contentHash: null,
    isStale: false,
    lastAnalyzedAt: now,
    metadata: {},
  };

  if (workspaces && workspaces.packages.length > 0) {
    return buildMonorepoHierarchy(systemNode, componentNodes, workspaces, now);
  }

  return buildFlatHierarchy(systemNode, componentNodes, now);
}

function buildFlatHierarchy(
  systemNode: StoredNode,
  componentNodes: StoredNode[],
  now: string,
): HierarchyResult {
  const containerNodes: StoredNode[] = [];
  const containmentEdges: StoredEdge[] = [];

  const namespaceMap = groupByNamespace(componentNodes);

  for (const [ns, members] of namespaceMap) {
    const containerNode = makeModuleNode(ns, members.length, now);
    containerNodes.push(containerNode);

    containmentEdges.push(makeContainsEdge(systemNode.id, containerNode.id, GraphLevel.SYSTEM));

    for (const member of members) {
      containmentEdges.push(makeContainsEdge(containerNode.id, member.id, GraphLevel.CONTAINER));
    }
  }

  return { systemNode, containerNodes, containmentEdges };
}

function buildMonorepoHierarchy(
  systemNode: StoredNode,
  componentNodes: StoredNode[],
  workspaces: WorkspaceInfo,
  now: string,
): HierarchyResult {
  const containerNodes: StoredNode[] = [];
  const containmentEdges: StoredEdge[] = [];

  // Sort packages by path length descending so longer paths match first
  // (e.g., "packages/core/sub" before "packages/core")
  const sortedPackages = [...workspaces.packages].sort(
    (a, b) => b.relativePath.length - a.relativePath.length,
  );

  // Assign each component to a package by file path prefix
  const packageBuckets = new Map<string, StoredNode[]>();
  const unassigned: StoredNode[] = [];

  for (const pkg of workspaces.packages) {
    packageBuckets.set(pkg.relativePath, []);
  }

  for (const node of componentNodes) {
    const filePath = node.filePath ?? node.qualifiedName;
    let assigned = false;

    for (const pkg of sortedPackages) {
      if (filePath.startsWith(pkg.relativePath + '/') || filePath.startsWith(pkg.relativePath + '\\')) {
        packageBuckets.get(pkg.relativePath)!.push(node);
        assigned = true;
        break;
      }
    }

    if (!assigned) {
      unassigned.push(node);
    }
  }

  // Create PACKAGE nodes for each workspace package
  for (const pkg of workspaces.packages) {
    const members = packageBuckets.get(pkg.relativePath) ?? [];
    if (members.length === 0) continue;

    const packageNode: StoredNode = {
      id: createNodeId(NodeType.PACKAGE, pkg.name),
      type: NodeType.PACKAGE,
      level: GraphLevel.CONTAINER,
      qualifiedName: pkg.name,
      shortName: pkg.name,
      filePath: null,
      startLine: null,
      endLine: null,
      contentHash: null,
      isStale: false,
      lastAnalyzedAt: now,
      metadata: {
        namespace: pkg.name,
        directory: pkg.relativePath,
        fileCount: members.length,
        workspaceType: workspaces.type,
      },
    };
    containerNodes.push(packageNode);

    // System -> Package
    containmentEdges.push(makeContainsEdge(systemNode.id, packageNode.id, GraphLevel.SYSTEM));

    // Group members by namespace within this package
    const namespaceMap = groupByNamespace(members);

    for (const [ns, nsMembers] of namespaceMap) {
      const moduleNode = makeModuleNode(`${pkg.name}::${ns}`, nsMembers.length, now);
      containerNodes.push(moduleNode);

      // Package -> Module
      containmentEdges.push(makeContainsEdge(packageNode.id, moduleNode.id, GraphLevel.CONTAINER));

      // Module -> Components
      for (const member of nsMembers) {
        containmentEdges.push(makeContainsEdge(moduleNode.id, member.id, GraphLevel.CONTAINER));
      }
    }
  }

  // Handle unassigned components (files outside any workspace package)
  if (unassigned.length > 0) {
    const namespaceMap = groupByNamespace(unassigned);
    for (const [ns, members] of namespaceMap) {
      const moduleNode = makeModuleNode(ns, members.length, now);
      containerNodes.push(moduleNode);

      containmentEdges.push(makeContainsEdge(systemNode.id, moduleNode.id, GraphLevel.SYSTEM));

      for (const member of members) {
        containmentEdges.push(makeContainsEdge(moduleNode.id, member.id, GraphLevel.CONTAINER));
      }
    }
  }

  return { systemNode, containerNodes, containmentEdges };
}

function groupByNamespace(nodes: StoredNode[]): Map<string, StoredNode[]> {
  const map = new Map<string, StoredNode[]>();
  for (const node of nodes) {
    const ns = extractNamespace(node.qualifiedName);
    if (!map.has(ns)) map.set(ns, []);
    map.get(ns)!.push(node);
  }
  return map;
}

function extractNamespace(qualifiedName: string): string {
  // PHP namespaces use \
  if (qualifiedName.includes('\\')) {
    const parts = qualifiedName.split('\\');
    if (parts.length <= 1) return '(global)';
    return parts.slice(0, -1).join('\\');
  }
  // TypeScript modules use . (from filePathToModule)
  if (qualifiedName.includes('.')) {
    const parts = qualifiedName.split('.');
    if (parts.length <= 1) return '(global)';
    // Remove class name (last part before :: or last dot-segment)
    const withoutMember = qualifiedName.split('::')[0];
    const segments = withoutMember.split('.');
    if (segments.length <= 1) return '(global)';
    return segments.slice(0, -1).join('.');
  }
  return '(global)';
}

function makeModuleNode(ns: string, fileCount: number, now: string): StoredNode {
  return {
    id: createNodeId(NodeType.MODULE, ns),
    type: NodeType.MODULE,
    level: GraphLevel.CONTAINER,
    qualifiedName: ns,
    shortName: ns.split('\\').pop()?.split('.').pop() || ns,
    filePath: null,
    startLine: null,
    endLine: null,
    contentHash: null,
    isStale: false,
    lastAnalyzedAt: now,
    metadata: {
      namespace: ns,
      directory: '',
      fileCount,
    },
  };
}

function makeContainsEdge(sourceId: string, targetId: string, level: GraphLevel): StoredEdge {
  return {
    id: createEdgeId(sourceId, targetId, EdgeType.CONTAINS),
    source: sourceId,
    target: targetId,
    type: EdgeType.CONTAINS,
    level,
    weight: 1.0,
    metadata: {},
  };
}
```

**Step 4: Run tests**

```bash
pnpm --filter @sniffo/analyzer test -- --reporter verbose src/pipeline/__tests__/hierarchy-builder.test.ts
```

Expected: All tests pass (old + new)

**Step 5: Commit**

```bash
git add packages/analyzer/src/pipeline/hierarchy-builder.ts packages/analyzer/src/pipeline/__tests__/hierarchy-builder.test.ts
git commit -m "feat: make hierarchy builder monorepo-aware with package-level grouping"
```

---

## Task 3: Integrate workspace detection into analysis pipeline

**Files:**
- Modify: `packages/analyzer/src/pipeline/analysis-pipeline.ts`
- Modify: `packages/analyzer/src/pipeline/__tests__/analysis-pipeline.test.ts`

**Step 1: Write failing test**

Add to `packages/analyzer/src/pipeline/__tests__/analysis-pipeline.test.ts`:

```typescript
// Add import:
import { detectWorkspaces } from '../workspace-detector.js';

it('detects monorepo workspaces and creates package hierarchy', async () => {
  // Create a fake monorepo structure
  mkdirSync(join(tempDir, 'packages', 'core', 'src'), { recursive: true });
  mkdirSync(join(tempDir, 'packages', 'api', 'src'), { recursive: true });
  writeFileSync(join(tempDir, 'package.json'), JSON.stringify({
    name: 'test-monorepo',
    workspaces: ['packages/*'],
  }));
  writeFileSync(join(tempDir, 'packages', 'core', 'package.json'), JSON.stringify({ name: '@test/core' }));
  writeFileSync(join(tempDir, 'packages', 'api', 'package.json'), JSON.stringify({ name: '@test/api' }));
  writeFileSync(join(tempDir, 'packages', 'core', 'src', 'utils.ts'), `
    export class Helper {
      run(): void {}
    }
  `);
  writeFileSync(join(tempDir, 'packages', 'api', 'src', 'controller.ts'), `
    import { Helper } from '@test/core';
    export class ApiController {
      handle(): void {
        const h = new Helper();
      }
    }
  `);

  const result = await pipeline.analyze({
    rootDir: tempDir,
    projectName: 'test-monorepo',
    includePatterns: ['packages/*/src/**/*.ts'],
  });

  expect(result.filesAnalyzed).toBe(2);

  const allNodes = await store.getAllNodes();
  const packageNodes = allNodes.filter(n => n.type === 'PACKAGE');
  expect(packageNodes.length).toBeGreaterThanOrEqual(1);
});
```

Note: Adapt this test to match the existing test setup (tempDir, store, pipeline variables). Read the existing test file first and follow its patterns.

**Step 2: Run test to verify it fails**

```bash
pnpm --filter @sniffo/analyzer test -- --reporter verbose src/pipeline/__tests__/analysis-pipeline.test.ts
```

**Step 3: Update analysis pipeline**

In `packages/analyzer/src/pipeline/analysis-pipeline.ts`, add workspace detection:

1. Add import at top:
```typescript
import { detectWorkspaces, type WorkspaceInfo } from './workspace-detector.js';
```

2. In `PipelineOptions`, add optional field:
```typescript
export interface PipelineOptions {
  rootDir: string;
  projectName: string;
  includePatterns?: string[];
  excludePatterns?: string[];
  files?: string[];
  workspaces?: WorkspaceInfo | null; // Pre-detected; if undefined, auto-detect
}
```

3. In `runPipeline()`, after file discovery but before hierarchy building (around line 242), add workspace detection and pass it to `buildHierarchy`:

Find this section:
```typescript
const componentNodes = allNodes.filter((n) => n.level === GraphLevel.COMPONENT);
const hierarchy = buildHierarchy(componentNodes, options.projectName);
```

Replace with:
```typescript
const componentNodes = allNodes.filter((n) => n.level === GraphLevel.COMPONENT);

// Detect workspaces if not explicitly provided
const workspaces = options.workspaces !== undefined
  ? options.workspaces
  : await detectWorkspaces(options.rootDir);

const hierarchy = buildHierarchy(componentNodes, options.projectName, workspaces);
```

**Step 4: Run tests**

```bash
pnpm --filter @sniffo/analyzer test -- --reporter verbose src/pipeline/__tests__/analysis-pipeline.test.ts
```

Expected: All tests pass

**Step 5: Commit**

```bash
git add packages/analyzer/src/pipeline/analysis-pipeline.ts packages/analyzer/src/pipeline/__tests__/analysis-pipeline.test.ts
git commit -m "feat: integrate workspace detection into analysis pipeline"
```

---

## Task 4: Add cross-package edge metadata

**Files:**
- Modify: `packages/analyzer/src/pipeline/edge-aggregator.ts`
- Modify: `packages/analyzer/src/pipeline/__tests__/edge-aggregator.test.ts`

When edges cross package boundaries, tag them with `crossPackage: true` metadata. This enables the web UI to visually distinguish internal vs cross-package dependencies.

**Step 1: Write failing test**

Add to existing `packages/analyzer/src/pipeline/__tests__/edge-aggregator.test.ts`:

```typescript
it('tags cross-package edges in metadata', () => {
  // Setup: two packages, components in each, edges crossing between them
  // Package A contains moduleA contains componentA
  // Package B contains moduleB contains componentB
  const containmentMap = new Map<string, string>();
  containmentMap.set('method1', 'componentA');
  containmentMap.set('method2', 'componentB');
  containmentMap.set('componentA', 'moduleA');
  containmentMap.set('componentB', 'moduleB');
  containmentMap.set('moduleA', 'packageA');
  containmentMap.set('moduleB', 'packageB');

  const l4Edges: StoredEdge[] = [
    makeEdge('method1', 'method2', EdgeType.CALLS, GraphLevel.CODE),
  ];

  const result = aggregateEdges(l4Edges, containmentMap);

  // L3 edge: componentA -> componentB
  const l3Edge = result.find(e => e.level === GraphLevel.COMPONENT);
  expect(l3Edge).toBeDefined();

  // L2 edge: moduleA -> moduleB (crosses packages)
  const l2Edge = result.find(e => e.level === GraphLevel.CONTAINER);
  expect(l2Edge).toBeDefined();
  expect(l2Edge!.metadata.crossPackage).toBe(true);
});

it('does not tag intra-package edges as cross-package', () => {
  // Both modules in same package
  const containmentMap = new Map<string, string>();
  containmentMap.set('method1', 'componentA');
  containmentMap.set('method2', 'componentB');
  containmentMap.set('componentA', 'moduleA');
  containmentMap.set('componentB', 'moduleB');
  containmentMap.set('moduleA', 'packageA');
  containmentMap.set('moduleB', 'packageA'); // Same package!

  const l4Edges: StoredEdge[] = [
    makeEdge('method1', 'method2', EdgeType.CALLS, GraphLevel.CODE),
  ];

  const result = aggregateEdges(l4Edges, containmentMap);

  const l2Edge = result.find(e => e.level === GraphLevel.CONTAINER);
  expect(l2Edge).toBeDefined();
  expect(l2Edge!.metadata.crossPackage).toBeUndefined();
});
```

Note: Use or create a `makeEdge` helper matching the existing test file's patterns.

**Step 2: Run test to verify it fails**

```bash
pnpm --filter @sniffo/analyzer test -- --reporter verbose src/pipeline/__tests__/edge-aggregator.test.ts
```

**Step 3: Update edge aggregator**

In `packages/analyzer/src/pipeline/edge-aggregator.ts`, modify `aggregateToLevel()` to detect cross-package edges:

In the bucket accumulation, after creating the aggregated edge, check if the source and target containers have different parents in the containment map. If so, add `crossPackage: true` to metadata.

Replace `aggregateToLevel` with:

```typescript
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

    // Check if this edge crosses package boundaries
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
```

**Step 4: Run tests**

```bash
pnpm --filter @sniffo/analyzer test -- --reporter verbose src/pipeline/__tests__/edge-aggregator.test.ts
```

Expected: All tests pass

**Step 5: Commit**

```bash
git add packages/analyzer/src/pipeline/edge-aggregator.ts packages/analyzer/src/pipeline/__tests__/edge-aggregator.test.ts
git commit -m "feat: tag cross-package edges in aggregated metadata"
```

---

## Task 5: Add workspace info to API and web types

**Files:**
- Modify: `packages/web-server/src/routes/graph.ts`
- Create: `packages/web-server/src/routes/workspaces.ts`
- Modify: `packages/web-server/src/server.ts`
- Modify: `packages/web/src/api/types.ts`
- Modify: `packages/web/src/api/client.ts`
- Modify: `packages/web/src/api/hooks.ts`
- Modify: `packages/web-server/src/__tests__/server.test.ts`

**Step 1: Add workspace API route test**

Add to `packages/web-server/src/__tests__/server.test.ts`:

```typescript
it('GET /api/workspaces returns workspace info', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/workspaces' });
  expect(res.statusCode).toBe(200);
  const body = JSON.parse(res.payload);
  expect(body.success).toBe(true);
  // In test environment with no real monorepo, should return null or empty
  expect(body.data).toBeDefined();
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm --filter @sniffo/web-server test -- --reporter verbose
```

**Step 3: Create workspace route**

```typescript
// packages/web-server/src/routes/workspaces.ts
import type { FastifyInstance } from 'fastify';
import { detectWorkspaces } from '@sniffo/analyzer';

export function registerWorkspaceRoutes(app: FastifyInstance, projectDir: string): void {
  app.get('/api/workspaces', async () => {
    const workspaces = await detectWorkspaces(projectDir);
    return {
      success: true,
      data: workspaces
        ? {
            type: workspaces.type,
            packages: workspaces.packages.map((p) => ({
              name: p.name,
              path: p.relativePath,
            })),
          }
        : null,
    };
  });
}
```

**Step 4: Register the route in server.ts**

In `packages/web-server/src/server.ts`, add:
```typescript
import { registerWorkspaceRoutes } from './routes/workspaces.js';
```

And in `createServer()`, add:
```typescript
registerWorkspaceRoutes(app, options.projectDir);
```

**Step 5: Update graph route to accept 'package' level**

In `packages/web-server/src/routes/graph.ts`, the LEVEL_MAP already maps to GraphLevel enum values. PACKAGE nodes use `GraphLevel.CONTAINER` level, same as MODULE. No change needed to the route itself -- the web UI filters by node type, not by level. However, you can add a `package` alias:

Actually, no extra route change needed. Package nodes are at CONTAINER level and already show up with `GET /api/graph/container`. The UI can filter by `type === 'PACKAGE'` vs `type === 'MODULE'`.

**Step 6: Update web types and client**

In `packages/web/src/api/types.ts`, add:

```typescript
export interface WorkspaceData {
  type: 'pnpm' | 'npm' | 'composer';
  packages: Array<{ name: string; path: string }>;
}
```

In `packages/web/src/api/client.ts`, add:

```typescript
async getWorkspaces(): Promise<WorkspaceData | null> {
  const res = await this.fetch('/api/workspaces');
  return res.data;
}
```

In `packages/web/src/api/hooks.ts`, add:

```typescript
export function useWorkspaces() {
  return useQuery({
    queryKey: ['workspaces'],
    queryFn: () => api.getWorkspaces(),
    staleTime: Infinity, // Workspace structure doesn't change during a session
  });
}
```

**Step 7: Run tests**

```bash
pnpm --filter @sniffo/web-server test -- --reporter verbose
```

**Step 8: Commit**

```bash
git add packages/web-server/src/routes/workspaces.ts packages/web-server/src/server.ts packages/web-server/src/__tests__/server.test.ts packages/web/src/api/types.ts packages/web/src/api/client.ts packages/web/src/api/hooks.ts
git commit -m "feat: add workspace API endpoint and web client integration"
```

---

## Task 6: Update web UI for monorepo navigation

**Files:**
- Modify: `packages/web/src/components/FilterPanel.tsx`
- Modify: `packages/web/src/lib/graph-builder.ts`
- Modify: `packages/web/src/lib/node-colors.ts`

**Step 1: Add PACKAGE color to node-colors.ts**

In `packages/web/src/lib/node-colors.ts`, ensure there's a color entry for `PACKAGE` node type. Read the file first and add:

```typescript
PACKAGE: '#F97316', // Orange -- distinct from MODULE
```

**Step 2: Update graph builder sizing**

In `packages/web/src/lib/graph-builder.ts`, update the node size logic so PACKAGE nodes are larger than MODULE nodes:

Find the size assignment and update:
```typescript
size: node.type === 'SYSTEM' ? 12
  : node.type === 'PACKAGE' ? 10
  : node.type === 'MODULE' ? 8
  : 5,
```

**Step 3: Update FilterPanel for package filtering**

In `packages/web/src/components/FilterPanel.tsx`, the node type checkboxes should include PACKAGE. Read the file first. Since it dynamically renders all node types from the store, it should already work if the data includes PACKAGE nodes. Verify this is the case.

**Step 4: Style cross-package edges**

In `packages/web/src/lib/graph-builder.ts`, when adding edges, check for `crossPackage` metadata and use a distinct color:

```typescript
// When adding edge to graph:
const edgeColor = edge.metadata?.crossPackage ? '#F97316' : getEdgeColor(edge.type);
```

**Step 5: Build and verify**

```bash
pnpm build
```

**Step 6: Commit**

```bash
git add packages/web/src/lib/node-colors.ts packages/web/src/lib/graph-builder.ts packages/web/src/components/FilterPanel.tsx
git commit -m "feat: update web UI with package node styling and cross-package edge colors"
```

---

## Task 7: Self-hosting monorepo test

**Files:**
- Modify: `packages/analyzer/src/pipeline/__tests__/self-hosting.test.ts`

This project IS a monorepo (pnpm workspaces). The self-hosting test should verify workspace detection works.

**Step 1: Add monorepo assertion to self-hosting test**

In the existing self-hosting test, add assertions after the current ones:

```typescript
// Verify monorepo detection works on our own codebase
const packageNodes = allNodes.filter(n => n.type === 'PACKAGE');
expect(packageNodes.length).toBeGreaterThanOrEqual(2); // At least core + analyzer

const packageNames = packageNodes.map(n => n.shortName);
// Our own packages should be detected
expect(packageNames).toContain('@sniffo/core');
expect(packageNames).toContain('@sniffo/analyzer');
```

Note: Read the existing test first to see the current structure. The pipeline uses `pnpm-workspace.yaml` at the monorepo root, which should be auto-detected.

**Step 2: Run test**

```bash
pnpm --filter @sniffo/analyzer test -- --reporter verbose src/pipeline/__tests__/self-hosting.test.ts
```

**Step 3: Commit**

```bash
git add packages/analyzer/src/pipeline/__tests__/self-hosting.test.ts
git commit -m "feat: verify monorepo self-hosting -- tool detects its own workspace packages"
```

---

## Task 8: Final build and verification

**Step 1: Build all packages**

```bash
pnpm build
```

**Step 2: Run all tests**

```bash
pnpm test
```

**Step 3: Commit if needed**

```bash
git add -A
git commit -m "chore: phase 8 complete -- monorepo support with workspace detection and package hierarchy"
```

---

## Summary

| Task | What | Tests |
|------|------|-------|
| 1 | Workspace detector (pnpm, npm/yarn, composer) | ~6 tests |
| 2 | Monorepo-aware hierarchy builder | ~3 tests |
| 3 | Pipeline integration with auto-detection | ~1 test |
| 4 | Cross-package edge metadata tagging | ~2 tests |
| 5 | Workspace API endpoint + web client | ~1 test |
| 6 | Web UI styling (package nodes, cross-pkg edges) | 0 (visual) |
| 7 | Self-hosting monorepo verification | 0 (existing test extended) |
| 8 | Final verification | 0 |

**New tests: ~13**

**Definition of Done:**
- [ ] Workspace detection works for pnpm, npm/yarn, and Composer monorepos
- [ ] Package hierarchy: System > Package > Module > Component > Code
- [ ] Cross-package edges tagged in metadata
- [ ] Non-monorepo projects work exactly as before (backward compatible)
- [ ] Self-hosting test verifies own workspace packages are detected
- [ ] Web UI shows package nodes with distinct styling
