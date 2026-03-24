import { type ParsedReference, type ImportStatement, ReferenceKind } from '@sniffo/core';

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
    const results = resolveOne(ref.targetName, ref.kind, ref.sourceSymbolFqn, importMap, currentNamespace, index);
    if (results.length > 0) {
      for (const result of results) {
        resolved.push({
          original: ref,
          targetFqn: result.fqn,
          targetNodeId: result.nodeId,
          confidence: result.confidence,
        });
      }
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
  kind: ReferenceKind,
  sourceSymbolFqn: string,
  importMap: Map<string, string>,
  currentNamespace: string | null,
  index: SymbolIndex,
): ResolveResult[] {
  // Exact FQN match
  if (targetName.includes('\\')) {
    const nodeId = index.byFqn.get(targetName);
    if (nodeId) return [{ fqn: targetName, nodeId, confidence: 1.0 }];
  }

  // Import-resolved match
  const importedFqn = importMap.get(targetName);
  if (importedFqn) {
    const nodeId = index.byFqn.get(importedFqn);
    if (nodeId) return [{ fqn: importedFqn, nodeId, confidence: 1.0 }];
  }

  // Namespace-qualified match
  if (currentNamespace) {
    const namespacedFqn = `${currentNamespace}\\${targetName}`;
    const nodeId = index.byFqn.get(namespacedFqn);
    if (nodeId) return [{ fqn: namespacedFqn, nodeId, confidence: 1.0 }];
  }

  // Global match
  {
    const nodeId = index.byFqn.get(targetName);
    if (nodeId) return [{ fqn: targetName, nodeId, confidence: 1.0 }];
  }

  const candidates = index.byShortName.get(targetName);
  if (candidates && candidates.length === 1) {
    return [{ fqn: candidates[0].fqn, nodeId: candidates[0].nodeId, confidence: 0.8 }];
  }

  // For calls: try to resolve via the source class's dependencies
  if (kind === ReferenceKind.Calls && candidates && candidates.length > 0) {
    // Extract the class FQN from sourceSymbolFqn (e.g., "App\Service\Foo::bar" -> "App\Service\Foo")
    const classIdx = sourceSymbolFqn.lastIndexOf('::');
    const classFqn = classIdx !== -1 ? sourceSymbolFqn.slice(0, classIdx) : sourceSymbolFqn;

    // Find candidates that belong to the same class (self calls)
    const selfCandidates = candidates.filter(c => c.fqn.startsWith(classFqn + '::'));
    if (selfCandidates.length === 1) {
      return [{ fqn: selfCandidates[0].fqn, nodeId: selfCandidates[0].nodeId, confidence: 0.9 }];
    }

    // Cap at 3 candidates to avoid noise
    return candidates.slice(0, 3).map(c => ({
      fqn: c.fqn,
      nodeId: c.nodeId,
      confidence: 0.4,
    }));
  }

  return [];
}
