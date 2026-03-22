import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { installHook } from './install-hook.js';

interface InitOptions {
  noHooks?: boolean;
}

const DEFAULT_CONFIG = {
  version: 1,
  include: ['**/*.php'],
  exclude: ['vendor/**', 'node_modules/**', 'tests/**', 'var/**'],
  analysis: {
    concurrency: 4,
    fileTimeout: 30000,
    maxFileSize: 1048576,
    cascadeDepth: 2,
  },
  server: {
    port: 3100,
    host: '127.0.0.1',
  },
};

export async function runInit(projectDir: string, options: InitOptions = {}): Promise<void> {
  const ctxDir = join(projectDir, '.contextualizer');
  mkdirSync(ctxDir, { recursive: true });

  const configPath = join(ctxDir, 'config.json');
  if (!existsSync(configPath)) {
    writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n');
  }

  if (!options.noHooks) {
    try {
      await installHook(projectDir);
    } catch {
      // Not a git repo or hook install failed -- non-fatal
    }
  }

  const gitignorePath = join(projectDir, '.gitignore');
  const entries = ['.contextualizer/graph.duckdb', '.contextualizer/models/'];
  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, 'utf-8');
    const toAdd = entries.filter(e => !content.includes(e));
    if (toAdd.length > 0) {
      writeFileSync(gitignorePath, content.trimEnd() + '\n' + toAdd.join('\n') + '\n');
    }
  }
}
