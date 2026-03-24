import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function runSetupPlugin(projectDir: string): Promise<void> {
  const pkgDir = dirname(fileURLToPath(import.meta.url));
  // Go up from dist/commands/ to the monorepo root, then into plugin/
  const pluginDir = resolve(pkgDir, '..', '..', '..', '..', 'plugin');

  if (!existsSync(pluginDir)) {
    throw new Error(`Plugin directory not found at ${pluginDir}. Is the project built?`);
  }

  const mpcServerPath = resolve(pkgDir, '..', '..', '..', 'mcp-server', 'dist', 'index.js');
  if (!existsSync(mpcServerPath)) {
    throw new Error(`MCP server not found at ${mpcServerPath}. Run: pnpm build`);
  }

  const mcpConfig = {
    mcpServers: {
      sniffo: {
        command: 'node',
        args: [mpcServerPath, projectDir],
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
  console.log(`Plugin directory: ${pluginDir}`);
  console.log('');
  console.log('To use the plugin, start Claude Code with:');
  console.log(`  claude --plugin-dir ${pluginDir}`);
  console.log('');
  console.log('Or add to your settings for permanent use.');
}
