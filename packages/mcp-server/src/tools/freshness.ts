import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GraphStore } from '@contextualizer/storage';
import { getStalenessReport } from '@contextualizer/analyzer';

export function registerFreshnessTool(server: McpServer, store: GraphStore): void {
  server.tool(
    'get_freshness',
    'Get a freshness/staleness report for the knowledge graph',
    {},
    async () => {
      const report = await getStalenessReport(store);

      const lines = [
        `Total nodes: ${report.totalNodes}`,
        `Stale nodes: ${report.staleNodes.length} (${report.stalePercentage}%)`,
      ];

      if (report.staleNodes.length > 0) {
        lines.push('', 'Stale symbols:');
        for (const stale of report.staleNodes.slice(0, 20)) {
          lines.push(`  - ${stale.qualifiedName} (${stale.filePath})`);
        }
        if (report.staleNodes.length > 20) {
          lines.push(`  ... and ${report.staleNodes.length - 20} more`);
        }
      }

      if (report.lastAnalysisRun) {
        lines.push('', `Last analysis: ${report.lastAnalysisRun.startedAt} (${report.lastAnalysisRun.trigger})`);
      }

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );
}
