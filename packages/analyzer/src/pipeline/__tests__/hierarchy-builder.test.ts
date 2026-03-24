import { describe, it, expect } from 'vitest';
import { GraphLevel, NodeType, createNodeId } from '@sniffo/core';
import type { StoredNode } from '@sniffo/storage';
import { buildHierarchy } from '../hierarchy-builder.js';
import type { WorkspaceInfo } from '../workspace-detector.js';

function makeNode(type: NodeType, fqn: string, filePath: string): StoredNode {
  return {
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
    lastAnalyzedAt: new Date().toISOString(),
    metadata: {},
  };
}

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

describe('buildHierarchy', () => {
  it('creates a single system node', () => {
    const nodes = [
      makeNode(NodeType.CLASS, 'App\\Service\\UserService', 'src/Service/UserService.php'),
    ];
    const result = buildHierarchy(nodes, 'my-project');
    expect(result.systemNode.type).toBe(NodeType.SYSTEM);
    expect(result.systemNode.level).toBe(GraphLevel.SYSTEM);
    expect(result.systemNode.shortName).toBe('my-project');
  });

  it('groups classes by namespace into container nodes', () => {
    const nodes = [
      makeNode(NodeType.CLASS, 'App\\Service\\UserService', 'src/Service/UserService.php'),
      makeNode(NodeType.CLASS, 'App\\Service\\OrderService', 'src/Service/OrderService.php'),
      makeNode(NodeType.CLASS, 'App\\Repository\\UserRepository', 'src/Repository/UserRepository.php'),
    ];
    const result = buildHierarchy(nodes, 'my-project');

    const containerNames = result.containerNodes.map(c => c.qualifiedName).sort();
    expect(containerNames).toEqual(['App\\Repository', 'App\\Service']);
  });

  it('creates containment edges: system -> container -> component', () => {
    const nodes = [
      makeNode(NodeType.CLASS, 'App\\Service\\Foo', 'src/Service/Foo.php'),
    ];
    const result = buildHierarchy(nodes, 'my-project');

    const systemToContainer = result.containmentEdges.filter(
      e => e.source === result.systemNode.id
    );
    expect(systemToContainer).toHaveLength(1);

    const containerToComponent = result.containmentEdges.filter(
      e => e.source === result.containerNodes[0].id
    );
    expect(containerToComponent).toHaveLength(1);
  });

  it('handles classes with no namespace', () => {
    const nodes = [
      makeNode(NodeType.CLASS, 'GlobalClass', 'src/GlobalClass.php'),
    ];
    const result = buildHierarchy(nodes, 'my-project');

    expect(result.containerNodes).toHaveLength(1);
    expect(result.containerNodes[0].qualifiedName).toBe('(global)');
  });

  it('counts files per container', () => {
    const nodes = [
      makeNode(NodeType.CLASS, 'App\\Svc\\A', 'src/Svc/A.php'),
      makeNode(NodeType.CLASS, 'App\\Svc\\B', 'src/Svc/B.php'),
      makeNode(NodeType.INTERFACE, 'App\\Svc\\C', 'src/Svc/C.php'),
    ];
    const result = buildHierarchy(nodes, 'my-project');
    expect(result.containerNodes[0].metadata.fileCount).toBe(3);
  });

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

    const packageNodes = result.containerNodes.filter(n => n.type === NodeType.PACKAGE);
    expect(packageNodes).toHaveLength(2);

    const pkgNames = packageNodes.map(n => n.shortName).sort();
    expect(pkgNames).toEqual(['@my/cli', '@my/core']);

    const systemToPackage = result.containmentEdges.filter(
      e => e.source === result.systemNode.id && packageNodes.some(p => p.id === e.target),
    );
    expect(systemToPackage).toHaveLength(2);

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

    const corePkg = result.containerNodes.find(n => n.shortName === '@my/core')!;
    const cliPkg = result.containerNodes.find(n => n.shortName === '@my/cli')!;

    const coreModules = result.containmentEdges
      .filter(e => e.source === corePkg.id)
      .map(e => e.target);
    const cliModules = result.containmentEdges
      .filter(e => e.source === cliPkg.id)
      .map(e => e.target);

    const userHelperNode = componentNodes.find(n => n.shortName === 'UserHelper')!;
    const analyzeNode = componentNodes.find(n => n.shortName === 'Analyze')!;

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

    const packageNodes = result.containerNodes.filter(n => n.type === NodeType.PACKAGE);
    expect(packageNodes).toHaveLength(0);

    const moduleNodes = result.containerNodes.filter(n => n.type === NodeType.MODULE);
    expect(moduleNodes.length).toBeGreaterThan(0);
  });
});
