import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { installHook } from './install-hook.js';

interface InitOptions {
  noHooks?: boolean;
  noAnalyze?: boolean;
  quiet?: boolean;
}

const DEFAULT_CONFIG = {
  version: 1,
  include: ['**/*.php', '**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
  exclude: ['vendor/**', 'node_modules/**', '.git/**', '.sniffo/**', 'dist/**', 'build/**', 'var/**'],
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
  const ctxDir = join(projectDir, '.sniffo');
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
  const entries = ['.sniffo/graph.duckdb', '.sniffo/models/'];
  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, 'utf-8');
    const toAdd = entries.filter(e => !content.includes(e));
    if (toAdd.length > 0) {
      writeFileSync(gitignorePath, content.trimEnd() + '\n' + toAdd.join('\n') + '\n');
    }
  }

  if (!options.noAnalyze) {
    const { runAnalyze } = await import('./analyze.js');
    if (!options.quiet) {
      console.log('Running initial analysis...');
    }
    const result = await runAnalyze(projectDir);
    if (!options.quiet) {
      console.log(`Analyzed ${result.filesAnalyzed} files, found ${result.symbolsFound} symbols.`);
    }
  }
}
