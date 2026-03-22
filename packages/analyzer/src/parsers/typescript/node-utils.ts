import type { Node } from 'web-tree-sitter';

export function findChildByType(
  node: Node,
  type: string,
): Node | null {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === type) return child;
  }
  return null;
}

export function findChildrenByType(
  node: Node,
  type: string,
): Node[] {
  const results: Node[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === type) results.push(child);
  }
  return results;
}

export function findDescendantsByType(
  node: Node,
  type: string,
): Node[] {
  const results: Node[] = [];
  const walk = (n: Node) => {
    if (n.type === type) results.push(n);
    for (let i = 0; i < n.childCount; i++) {
      const child = n.child(i);
      if (child) walk(child);
    }
  };
  walk(node);
  return results;
}

export function getNodeText(node: Node | null): string {
  return node?.text ?? '';
}
