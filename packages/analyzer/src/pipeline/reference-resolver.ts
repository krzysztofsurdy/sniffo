import type { ParsedReference, ImportStatement } from '@contextualizer/core';

export interface SymbolIndex {
  byFqn: Map<string, string>;  // FQN -> nodeId
  byShortName: Map<string, Array<{ fqn: string; nodeId: string }>>;
}

export interface ResolvedReference {
  original: ParsedReference;
  targetFqn: string;
  targetNodeId: string;
  confidence: number;
}

export interface ResolutionResult {
  resolved: ResolvedReference[];
  unresolved: ParsedReference[];
}

export function resolveReferences(
  references: ParsedReference[],
  imports: ImportStatement[],
  currentNamespace: string | null,
  index: SymbolIndex,
): ResolutionResult {
  const importMap = buildImportMap(imports);
  const resolved: ResolvedReference[] = [];
  const unresolved: ParsedReference[] = [];

  for (const ref of references) {
    const result = resolveOne(ref.targetName, importMap, currentNamespace, index);
    if (result) {
      resolved.push({
        original: ref,
        targetFqn: result.fqn,
        targetNodeId: result.nodeId,
        confidence: result.confidence,
      });
    } else {
      unresolved.push(ref);
    }
  }

  return { resolved, unresolved };
}

function buildImportMap(imports: ImportStatement[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const imp of imports) {
    const shortName = imp.alias ?? imp.originalName.split('\\').pop()!;
    map.set(shortName, imp.originalName);
  }
  return map;
}

interface ResolveResult {
  fqn: string;
  nodeId: string;
  confidence: number;
}

function resolveOne(
  targetName: string,
  importMap: Map<string, string>,
  currentNamespace: string | null,
  index: SymbolIndex,
): ResolveResult | null {
  if (targetName.includes('\\')) {
    const nodeId = index.byFqn.get(targetName);
    if (nodeId) return { fqn: targetName, nodeId, confidence: 1.0 };
  }

  const importedFqn = importMap.get(targetName);
  if (importedFqn) {
    const nodeId = index.byFqn.get(importedFqn);
    if (nodeId) return { fqn: importedFqn, nodeId, confidence: 1.0 };
  }

  if (currentNamespace) {
    const namespacedFqn = `${currentNamespace}\\${targetName}`;
    const nodeId = index.byFqn.get(namespacedFqn);
    if (nodeId) return { fqn: namespacedFqn, nodeId, confidence: 1.0 };
  }

  {
    const nodeId = index.byFqn.get(targetName);
    if (nodeId) return { fqn: targetName, nodeId, confidence: 1.0 };
  }

  const candidates = index.byShortName.get(targetName);
  if (candidates && candidates.length === 1) {
    return {
      fqn: candidates[0].fqn,
      nodeId: candidates[0].nodeId,
      confidence: 0.8,
    };
  }

  return null;
}
