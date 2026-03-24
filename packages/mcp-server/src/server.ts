import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { GraphStore } from '@sniffo/storage';
import { registerAnalyzeTool } from './tools/analyze.js';
import { registerSearchTool } from './tools/search.js';
import { registerReferencesTools } from './tools/references.js';
import { registerFreshnessTool } from './tools/freshness.js';
import { registerRefreshTool } from './tools/refresh.js';
import { registerViewsTools } from './tools/views.js';

export function createMcpServer(store: GraphStore, projectDir: string): McpServer {
  const server = new McpServer({
    name: 'sniffo',
    version: '0.0.1',
  });

  registerAnalyzeTool(server, store, projectDir);
  registerSearchTool(server, store);
  registerReferencesTools(server, store);
  registerFreshnessTool(server, store);
  registerRefreshTool(server, store, projectDir);
  registerViewsTools(server, store, projectDir);

  return server;
}

export async function startStdioServer(store: GraphStore, projectDir: string): Promise<void> {
  const server = createMcpServer(store, projectDir);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
