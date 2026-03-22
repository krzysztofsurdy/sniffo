import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GraphStore } from '@contextualizer/storage';
import { AnalysisPipeline, ParserRegistry, PhpParser } from '@contextualizer/analyzer';

export function registerAnalyzeTool(server: McpServer, store: GraphStore, projectDir: string): void {
  server.tool(
    'analyze_project',
    'Run full analysis on the codebase to build the knowledge graph',
    {
      includePatterns: z.array(z.string()).optional().describe('Glob patterns to include (default: ["**/*.php"])'),
    },
    async ({ includePatterns }) => {
      const registry = new ParserRegistry();
      registry.register(new PhpParser());
      const pipeline = new AnalysisPipeline(store, registry);

      const result = await pipeline.analyze({
        rootDir: projectDir,
        projectName: 'project',
        includePatterns: includePatterns ?? ['**/*.php'],
      });

      return {
        content: [{
          type: 'text' as const,
          text: [
            `Analysis complete.`,
            `Files scanned: ${result.filesScanned}`,
            `Files analyzed: ${result.filesAnalyzed}`,
            `Symbols found: ${result.symbolsFound}`,
            `References found: ${result.referencesFound}`,
            `Duration: ${result.durationMs}ms`,
            result.errors.length > 0 ? `Errors: ${result.errors.length}` : '',
          ].filter(Boolean).join('\n'),
        }],
      };
    },
  );
}
