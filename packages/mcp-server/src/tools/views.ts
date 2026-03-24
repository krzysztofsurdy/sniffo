import { z } from 'zod';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GraphStore } from '@sniffo/storage';
import { searchSymbols, traceFlow } from '@sniffo/analyzer';
import type { NodeType } from '@sniffo/core';

interface SavedView {
  id: string;
  name: string;
  createdAt: string;
  rootNodeId: string;
  rootLabel: string;
  edgeTypes: string[];
  depth: number;
  direction: 'outgoing' | 'incoming' | 'both';
  nodeIds?: string[];
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
    'List all saved landscape views (query-based traces through the dependency graph)',
    {},
    async () => {
      const views = loadViews(projectDir);
      if (views.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No saved views.' }] };
      }
      const lines = views.map((v) =>
        `${v.name} (${v.direction ?? 'legacy'}, depth=${v.depth ?? '?'}, edges=${(v.edgeTypes ?? []).join(',')}) [${v.id}]`,
      );
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );

  server.tool(
    'create_view',
    'Create a landscape view that traces a flow from a root symbol',
    {
      name: z.string().describe('Name for the view (e.g., "Payment Flow")'),
      rootSymbol: z.string().describe('Name of the root symbol to trace from'),
      edgeTypes: z.array(z.string()).optional().describe('Edge types to follow (default: CALLS, INJECTS, IMPORTS)'),
      depth: z.number().optional().describe('Max traversal depth (default: 3, max: 10)'),
      direction: z.enum(['outgoing', 'incoming', 'both']).optional().describe('Traversal direction (default: outgoing)'),
    },
    async ({ name, rootSymbol, edgeTypes, depth, direction }) => {
      const searchResults = await searchSymbols(store, rootSymbol);
      if (searchResults.length === 0) {
        return { content: [{ type: 'text' as const, text: `No symbol found matching "${rootSymbol}"` }] };
      }

      const rootNode = searchResults[0];
      const resolvedEdgeTypes = edgeTypes ?? ['CALLS', 'INJECTS', 'IMPORTS'];
      const resolvedDepth = Math.min(10, Math.max(1, depth ?? 3));
      const resolvedDirection = direction ?? 'outgoing';

      const traceResult = await traceFlow(store, rootNode.id, {
        edgeTypes: resolvedEdgeTypes as any[],
        depth: resolvedDepth,
        direction: resolvedDirection,
      });

      const views = loadViews(projectDir);
      const newView: SavedView = {
        id: crypto.randomUUID(),
        name,
        rootNodeId: rootNode.id,
        rootLabel: rootNode.shortName,
        edgeTypes: resolvedEdgeTypes,
        depth: resolvedDepth,
        direction: resolvedDirection,
        createdAt: new Date().toISOString(),
      };
      views.push(newView);
      saveViews(projectDir, views);

      const nodeNames = traceResult.nodes.map((n) => n.shortName).join(', ');
      return {
        content: [{
          type: 'text' as const,
          text: `Created view "${name}" (${traceResult.nodes.length} nodes, ${traceResult.edges.length} edges)\n` +
                `Root: ${rootNode.shortName}\n` +
                `Direction: ${resolvedDirection}, Depth: ${resolvedDepth}\n` +
                `Edge types: ${resolvedEdgeTypes.join(', ')}\n` +
                `Nodes: ${nodeNames}`,
        }],
      };
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
