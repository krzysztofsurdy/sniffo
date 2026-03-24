import { z } from 'zod';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GraphStore } from '@sniffo/storage';
import { searchSymbols } from '@sniffo/analyzer';
import type { NodeType } from '@sniffo/core';

interface SavedView {
  id: string;
  name: string;
  nodeIds: string[];
  createdAt: string;
}

function getViewsPath(projectDir: string): string {
  return join(projectDir, '.sniffo', 'views.json');
}

function loadViews(projectDir: string): SavedView[] {
  const path = getViewsPath(projectDir);
  if (!existsSync(path)) return [];
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return [];
  }
}

function saveViews(projectDir: string, views: SavedView[]): void {
  writeFileSync(getViewsPath(projectDir), JSON.stringify(views, null, 2) + '\n');
}

export function registerViewsTools(server: McpServer, store: GraphStore, projectDir: string): void {
  server.tool(
    'list_views',
    'List all saved views (curated collections of related symbols)',
    {},
    async () => {
      const views = loadViews(projectDir);
      if (views.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No saved views.' }] };
      }
      const lines = views.map((v) => `${v.name} (${v.nodeIds.length} nodes) [${v.id}]`);
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );

  server.tool(
    'create_view',
    'Create a saved view from symbol names. Searches for each symbol and collects matching node IDs into a named view.',
    {
      name: z.string().describe('Name for the view (e.g., "Payment Flow", "Auth System")'),
      symbols: z.array(z.string()).describe('Symbol names or search queries to include in the view'),
    },
    async ({ name, symbols }) => {
      const nodeIds = new Set<string>();
      const matched: string[] = [];
      const missed: string[] = [];

      for (const query of symbols) {
        const results = await searchSymbols(store, query);
        if (results.length > 0) {
          for (const r of results) {
            nodeIds.add(r.id);
          }
          matched.push(`${query} (${results.length} matches)`);
        } else {
          missed.push(query);
        }
      }

      if (nodeIds.size === 0) {
        return { content: [{ type: 'text' as const, text: 'No symbols found for any of the queries.' }] };
      }

      const views = loadViews(projectDir);
      const view: SavedView = {
        id: crypto.randomUUID(),
        name,
        nodeIds: Array.from(nodeIds),
        createdAt: new Date().toISOString(),
      };
      views.push(view);
      saveViews(projectDir, views);

      const lines = [
        `View "${name}" created with ${nodeIds.size} nodes.`,
        '',
        'Matched:',
        ...matched.map((m) => `  ${m}`),
      ];
      if (missed.length > 0) {
        lines.push('', 'Not found:', ...missed.map((m) => `  ${m}`));
      }

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );

  server.tool(
    'delete_view',
    'Delete a saved view by ID',
    {
      id: z.string().describe('View ID to delete'),
    },
    async ({ id }) => {
      const views = loadViews(projectDir);
      const filtered = views.filter((v) => v.id !== id);
      if (filtered.length === views.length) {
        return { content: [{ type: 'text' as const, text: `View ${id} not found.` }] };
      }
      saveViews(projectDir, filtered);
      return { content: [{ type: 'text' as const, text: 'View deleted.' }] };
    },
  );
}
