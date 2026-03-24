import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GraphStore } from '@sniffo/storage';
import { searchSymbols } from '@sniffo/analyzer';
import type { NodeType } from '@sniffo/core';

export function registerSearchTool(server: McpServer, store: GraphStore): void {
  server.tool(
    'search_symbols',
    'Search for symbols (classes, interfaces, functions) in the knowledge graph by name',
    {
      query: z.string().describe('Search query (matches against symbol names and FQNs)'),
      kind: z.string().optional().describe('Filter by symbol kind: class, interface, trait, enum, function'),
    },
    async ({ query, kind }) => {
      const types = kind ? [kind as NodeType] : undefined;
      const results = await searchSymbols(store, query, types);

      if (results.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No symbols found.' }] };
      }

      const lines = results.map(n =>
        `${n.type} ${n.qualifiedName} (${n.filePath}:${n.startLine}${n.isStale ? ' [STALE]' : ''})`
      );

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
      };
    },
  );
}
