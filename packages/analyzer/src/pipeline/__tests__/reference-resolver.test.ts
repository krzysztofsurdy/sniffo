import { describe, it, expect } from 'vitest';
import { ReferenceKind } from '@contextualizer/core';
import type { ParsedReference, ImportStatement } from '@contextualizer/core';
import {
  resolveReferences,
  type SymbolIndex,
  type ResolvedReference,
} from '../reference-resolver.js';

function makeRef(overrides: Partial<ParsedReference>): ParsedReference {
  return {
    kind: ReferenceKind.Extends,
    sourceSymbolFqn: 'App\\Service\\UserService',
    targetName: 'BaseService',
    targetFqn: null,
    filePath: 'src/Service/UserService.php',
    line: 10,
    column: 0,
    context: 'extends BaseService',
    ...overrides,
  };
}

function makeIndex(entries: Record<string, string>): SymbolIndex {
  const byFqn = new Map<string, string>();
  const byShortName = new Map<string, Array<{ fqn: string; nodeId: string }>>();

  for (const [fqn, nodeId] of Object.entries(entries)) {
    byFqn.set(fqn, nodeId);
    const short = fqn.split('\\').pop()!;
    if (!byShortName.has(short)) byShortName.set(short, []);
    byShortName.get(short)!.push({ fqn, nodeId });
  }

  return { byFqn, byShortName };
}

describe('resolveReferences', () => {
  it('resolves via import map (exact match)', () => {
    const imports: ImportStatement[] = [
      { originalName: 'App\\Model\\BaseService', alias: null, line: 3 },
    ];
    const index = makeIndex({ 'App\\Model\\BaseService': 'node1' });
    const ref = makeRef({ targetName: 'BaseService' });

    const result = resolveReferences([ref], imports, 'App\\Service', index);
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0].targetFqn).toBe('App\\Model\\BaseService');
    expect(result.resolved[0].targetNodeId).toBe('node1');
    expect(result.resolved[0].confidence).toBe(1.0);
  });

  it('resolves via import alias', () => {
    const imports: ImportStatement[] = [
      { originalName: 'App\\Model\\BaseService', alias: 'BS', line: 3 },
    ];
    const index = makeIndex({ 'App\\Model\\BaseService': 'node1' });
    const ref = makeRef({ targetName: 'BS' });

    const result = resolveReferences([ref], imports, 'App\\Service', index);
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0].targetFqn).toBe('App\\Model\\BaseService');
  });

  it('resolves via same-namespace lookup', () => {
    const imports: ImportStatement[] = [];
    const index = makeIndex({ 'App\\Service\\Helper': 'node2' });
    const ref = makeRef({ targetName: 'Helper' });

    const result = resolveReferences([ref], imports, 'App\\Service', index);
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0].targetFqn).toBe('App\\Service\\Helper');
    expect(result.resolved[0].confidence).toBe(1.0);
  });

  it('resolves via global namespace lookup', () => {
    const imports: ImportStatement[] = [];
    const index = makeIndex({ 'GlobalClass': 'node3' });
    const ref = makeRef({ targetName: 'GlobalClass' });

    const result = resolveReferences([ref], imports, 'App\\Service', index);
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0].targetFqn).toBe('GlobalClass');
  });

  it('resolves via fuzzy single-candidate match with lower confidence', () => {
    const imports: ImportStatement[] = [];
    const index = makeIndex({ 'Vendor\\Lib\\UniqueClass': 'node4' });
    const ref = makeRef({ targetName: 'UniqueClass' });

    const result = resolveReferences([ref], imports, 'App\\Service', index);
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0].confidence).toBe(0.8);
  });

  it('reports unresolved when multiple fuzzy candidates exist', () => {
    const imports: ImportStatement[] = [];
    const index = makeIndex({
      'App\\A\\Ambiguous': 'node5',
      'App\\B\\Ambiguous': 'node6',
    });
    const ref = makeRef({ targetName: 'Ambiguous' });

    const result = resolveReferences([ref], imports, 'App\\Service', index);
    expect(result.resolved).toHaveLength(0);
    expect(result.unresolved).toHaveLength(1);
  });

  it('reports unresolved when symbol not in index at all', () => {
    const imports: ImportStatement[] = [];
    const index = makeIndex({});
    const ref = makeRef({ targetName: 'Unknown' });

    const result = resolveReferences([ref], imports, 'App\\Service', index);
    expect(result.unresolved).toHaveLength(1);
    expect(result.unresolved[0].targetName).toBe('Unknown');
  });

  it('handles fully qualified names in targetName', () => {
    const imports: ImportStatement[] = [];
    const index = makeIndex({ 'App\\Model\\User': 'node7' });
    const ref = makeRef({ targetName: 'App\\Model\\User' });

    const result = resolveReferences([ref], imports, 'App\\Service', index);
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0].confidence).toBe(1.0);
  });
});
