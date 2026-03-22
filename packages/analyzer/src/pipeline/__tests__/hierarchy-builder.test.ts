import { describe, it, expect } from 'vitest';
import { GraphLevel, NodeType, createNodeId } from '@contextualizer/core';
import type { StoredNode } from '@contextualizer/storage';
import { buildHierarchy } from '../hierarchy-builder.js';

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
});
