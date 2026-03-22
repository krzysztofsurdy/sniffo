import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GraphStore } from '@contextualizer/storage';
import { AnalysisPipeline, ParserRegistry, PhpParser } from '@contextualizer/analyzer';

export function registerRefreshTool(server: McpServer, store: GraphStore, projectDir: string): void {
  server.tool(
    'refresh',
    'Incrementally update the knowledge graph (only re-analyze changed files)',
    {
      files: z.array(z.string()).optional().describe('Specific files to refresh (relative paths). Omit to detect changes automatically.'),
    },
    async ({ files }) => {
      const registry = new ParserRegistry();
      registry.register(new PhpParser());
      const pipeline = new AnalysisPipeline(store, registry);

      const result = await pipeline.analyzeIncremental({
        rootDir: projectDir,
        projectName: 'project',
        files: files ?? undefined,
      });

      return {
        content: [{
          type: 'text' as const,
          text: [
            `Refresh complete.`,
            `Files analyzed: ${result.filesAnalyzed}`,
            `Files skipped (unchanged): ${result.filesSkipped}`,
            `Symbols found: ${result.symbolsFound}`,
            `References found: ${result.referencesFound}`,
            `Duration: ${result.durationMs}ms`,
          ].join('\n'),
        }],
      };
    },
  );
}
