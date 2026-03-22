import { existsSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';

export interface ProjectConfig {
  version: number;
  include: string[];
  exclude: string[];
  projectName: string;
  analysis: {
    concurrency: number;
    fileTimeout: number;
    maxFileSize: number;
    cascadeDepth: number;
  };
  server: {
    port: number;
    host: string;
  };
}

const DEFAULT_CONFIG: ProjectConfig = {
  version: 1,
  include: ['**/*.php', '**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
  exclude: ['vendor/**', 'node_modules/**', '.git/**', '.contextualizer/**', 'dist/**', 'build/**', 'var/**'],
  projectName: '',
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

export function loadConfig(projectDir: string): ProjectConfig {
  const config = { ...DEFAULT_CONFIG, projectName: basename(projectDir) };

  const ctxConfigPath = join(projectDir, '.contextualizer', 'config.json');
  if (existsSync(ctxConfigPath)) {
    try {
      const raw = JSON.parse(readFileSync(ctxConfigPath, 'utf-8'));
      return mergeConfig(config, raw);
    } catch {
      // Invalid JSON, use defaults
    }
  }

  const lpcrcPath = join(projectDir, '.lpcrc.json');
  if (existsSync(lpcrcPath)) {
    try {
      const raw = JSON.parse(readFileSync(lpcrcPath, 'utf-8'));
      return mergeConfig(config, raw);
    } catch {
      // Invalid JSON, use defaults
    }
  }

  return config;
}

function mergeConfig(defaults: ProjectConfig, overrides: Record<string, unknown>): ProjectConfig {
  return {
    version: (overrides.version as number) ?? defaults.version,
    include: (overrides.include as string[]) ?? defaults.include,
    exclude: (overrides.exclude as string[]) ?? defaults.exclude,
    projectName: (overrides.projectName as string) ?? defaults.projectName,
    analysis: { ...defaults.analysis, ...(overrides.analysis as Record<string, unknown> ?? {}) },
    server: { ...defaults.server, ...(overrides.server as Record<string, unknown> ?? {}) },
  };
}
