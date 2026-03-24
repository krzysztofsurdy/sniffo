import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GraphStore } from '@sniffo/storage';
import { findReferences, findDependencies, findDependents } from '@sniffo/analyzer';
import type { EdgeType } from '@sniffo/core';

export function registerReferencesTools(server: McpServer, store: GraphStore): void {
  server.tool(
    'find_references',
    'Find all symbols that reference a given symbol (incoming edges)',
    {
      symbol: z.string().describe('Symbol name or FQN to find references for'),
      edgeType: z.string().optional().describe('Filter by edge type: extends, implements, calls, injects, etc.'),
    },
    async ({ symbol, edgeType }) => {
      const types = edgeType ? [edgeType as EdgeType] : undefined;
      const refs = await findReferences(store, symbol, types);

      if (refs.length === 0) {
        return { content: [{ type: 'text' as const, text: `No references found for "${symbol}".` }] };
      }

      const lines = refs.map(r =>
        `${r.edgeType}: ${r.source.qualifiedName} (${r.source.filePath}:${r.source.startLine})`
      );

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );

  server.tool(
    'find_dependencies',
    'Find all symbols that a given symbol depends on (outgoing edges)',
    {
      symbol: z.string().describe('Symbol name or FQN to find dependencies for'),
    },
    async ({ symbol }) => {
      const deps = await findDependencies(store, symbol);

      if (deps.length === 0) {
        return { content: [{ type: 'text' as const, text: `No dependencies found for "${symbol}".` }] };
      }

      const lines = deps.map(d =>
        `${d.edgeType}: ${d.target.qualifiedName} (${d.target.filePath}:${d.target.startLine})`
      );

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );

  server.tool(
    'find_dependents',
    'Find all symbols that transitively depend on a given symbol (BFS incoming edges)',
    {
      symbol: z.string().describe('Symbol name or FQN'),
      depth: z.number().optional().describe('Max traversal depth (default: 1)'),
    },
    async ({ symbol, depth }) => {
      const dependents = await findDependents(store, symbol, depth ?? 1);

      if (dependents.length === 0) {
        return { content: [{ type: 'text' as const, text: `No dependents found for "${symbol}".` }] };
      }

      const lines = dependents.map(d =>
        `[depth ${d.depth}] ${d.type} ${d.qualifiedName} (${d.filePath})`
      );

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );
}
