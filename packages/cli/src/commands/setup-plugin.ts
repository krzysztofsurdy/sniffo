import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export async function runSetupPlugin(projectDir: string): Promise<void> {
  const mcpConfig = {
    mcpServers: {
      sniffo: {
        command: 'npx',
        args: ['@sniffo/mcp-server'],
        env: { PROJECT_DIR: projectDir },
      },
    },
  };

  const claudeDir = join(projectDir, '.claude');
  mkdirSync(claudeDir, { recursive: true });

  const mcpPath = join(claudeDir, 'mcp.json');
  if (existsSync(mcpPath)) {
    try {
      const existing = JSON.parse(readFileSync(mcpPath, 'utf-8'));
      existing.mcpServers = existing.mcpServers ?? {};
      existing.mcpServers.sniffo = mcpConfig.mcpServers.sniffo;
      writeFileSync(mcpPath, JSON.stringify(existing, null, 2) + '\n');
    } catch {
      writeFileSync(mcpPath, JSON.stringify(mcpConfig, null, 2) + '\n');
    }
  } else {
    writeFileSync(mcpPath, JSON.stringify(mcpConfig, null, 2) + '\n');
  }

  console.log(`MCP server configured in ${mcpPath}`);
  console.log('');
  console.log('Sniffo MCP server will be available in Claude Code.');
  console.log('For the full plugin experience (skills + hooks), run:');
  console.log('  claude plugin add --from-github krzysztofsurdy/sniffo');
}
