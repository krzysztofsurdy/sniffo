# DX Improvements & Claude Code Plugin Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce onboarding from 6 manual steps to one command (`sniffo init`) and package the tool as a Claude Code plugin for zero-config MCP integration.

**Architecture:** Three improvements: (1) merge init+analyze into a single smart `sniffo init` with progress output, (2) add `sniffo doctor` for validation, (3) create a Claude Code plugin directory structure at the repo root that bundles the MCP server, skills, and a SessionStart hook for auto-setup. The plugin uses `.mcp.json` to start `sniffo-mcp` and includes skills for common operations.

**Tech Stack:** Commander.js (existing CLI), Claude Code plugin format (.claude-plugin/plugin.json, .mcp.json, skills/), existing MCP server.

---

## Task 1: Fix `init` command -- smart defaults and auto-analyze

The current `init` hardcodes `**/*.php` in its DEFAULT_CONFIG. The config loader defaults to `['**/*.php', '**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx']`. These should match. Also, `init` should run the first analysis automatically.

**Files:**
- Modify: `packages/cli/src/commands/init.ts`
- Modify: `packages/cli/src/__tests__/init.test.ts`

**Step 1: Write failing test**

Add to `packages/cli/src/__tests__/init.test.ts`:

```typescript
it('writes config with all supported language patterns', async () => {
  await runInit(tempDir);
  const config = JSON.parse(readFileSync(join(tempDir, '.sniffo', 'config.json'), 'utf-8'));
  expect(config.include).toContain('**/*.ts');
  expect(config.include).toContain('**/*.tsx');
  expect(config.include).toContain('**/*.php');
});
```

**Step 2: Run test to verify it fails**

```bash
cd /Users/krzysztofsurdy/ProjectsPrivate/llmProjectSniffo
pnpm --filter @sniffo/cli test -- --reporter verbose src/__tests__/init.test.ts
```

Expected: FAIL -- config only has `**/*.php`

**Step 3: Update init.ts**

Replace `DEFAULT_CONFIG` in `packages/cli/src/commands/init.ts`:

```typescript
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
```

Add an `--analyze` option (default true) and a `--quiet` option. Update the function signature:

```typescript
interface InitOptions {
  noHooks?: boolean;
  noAnalyze?: boolean;
  quiet?: boolean;
}

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
```

**Step 4: Update CLI command registration**

In `packages/cli/src/cli.ts`, update the init command:

```typescript
program
  .command('init')
  .description('Initialize sniffo and run first analysis')
  .option('-d, --dir <path>', 'Project directory', process.cwd())
  .option('--no-hooks', 'Skip pre-commit hook installation')
  .option('--no-analyze', 'Skip initial analysis')
  .option('-q, --quiet', 'Suppress output')
  .action(async (opts: { dir: string; hooks: boolean; analyze: boolean; quiet: boolean }) => {
    await runInit(opts.dir, { noHooks: !opts.hooks, noAnalyze: !opts.analyze, quiet: opts.quiet });
    if (!opts.quiet) {
      console.log('Sniffo initialized.');
    }
  });
```

**Step 5: Run tests**

```bash
pnpm --filter @sniffo/cli test -- --reporter verbose src/__tests__/init.test.ts
```

Note: The existing tests call `runInit` with `noAnalyze: true` or the test setup may need updating. Read the existing tests and ensure old ones still pass by adding `{ noAnalyze: true }` to existing calls that don't set up a full analyzer environment.

**Step 6: Commit**

```bash
git add packages/cli/src/commands/init.ts packages/cli/src/cli.ts packages/cli/src/__tests__/init.test.ts
git commit -m "feat: init auto-analyzes with smart defaults for all supported languages"
```

---

## Task 2: Add progress output to analyze command

**Files:**
- Modify: `packages/analyzer/src/pipeline/analysis-pipeline.ts`
- Modify: `packages/cli/src/commands/analyze.ts`
- Modify: `packages/cli/src/commands/update.ts`

Currently analysis is silent. Add a progress callback so the CLI can print updates.

**Step 1: Add progress callback to PipelineOptions**

In `packages/analyzer/src/pipeline/analysis-pipeline.ts`, add to `PipelineOptions`:

```typescript
export interface PipelineOptions {
  rootDir: string;
  projectName: string;
  includePatterns?: string[];
  excludePatterns?: string[];
  files?: string[];
  workspaces?: WorkspaceInfo | null;
  onProgress?: (event: ProgressEvent) => void;
}

export interface ProgressEvent {
  phase: 'discovery' | 'parsing' | 'resolution' | 'hierarchy' | 'aggregation';
  current: number;
  total: number;
  file?: string;
}
```

**Step 2: Emit progress events in runPipeline**

After file discovery:
```typescript
options.onProgress?.({ phase: 'discovery', current: discoveredFiles.length, total: discoveredFiles.length });
```

Inside the file processing loop (around line 126), before parsing each file:
```typescript
options.onProgress?.({ phase: 'parsing', current: fileIndex + 1, total: filesToProcess.length, file: fileChange.file.relativePath });
```

After reference resolution loop completes:
```typescript
options.onProgress?.({ phase: 'resolution', current: parsedFiles.length, total: parsedFiles.length });
```

After hierarchy building:
```typescript
options.onProgress?.({ phase: 'hierarchy', current: 1, total: 1 });
```

After edge aggregation:
```typescript
options.onProgress?.({ phase: 'aggregation', current: 1, total: 1 });
```

**Step 3: Print progress in CLI commands**

In `packages/cli/src/commands/analyze.ts`, add a progress callback:

```typescript
const result = await pipeline.analyze({
  rootDir: projectDir,
  projectName: config.projectName,
  includePatterns: config.include,
  excludePatterns: config.exclude,
  onProgress: (event) => {
    if (event.phase === 'discovery') {
      process.stdout.write(`\rDiscovered ${event.total} files...`);
    } else if (event.phase === 'parsing') {
      process.stdout.write(`\rParsing [${event.current}/${event.total}] ${event.file ?? ''}`.padEnd(80).slice(0, 80));
    } else if (event.phase === 'resolution') {
      process.stdout.write(`\rResolving references...`.padEnd(80));
    } else if (event.phase === 'hierarchy') {
      process.stdout.write(`\rBuilding hierarchy...`.padEnd(80));
    } else if (event.phase === 'aggregation') {
      process.stdout.write(`\rAggregating edges...`.padEnd(80));
    }
  },
});
process.stdout.write('\r'.padEnd(80) + '\r'); // Clear progress line
```

Do the same in `packages/cli/src/commands/update.ts`.

**Step 4: Export ProgressEvent from analyzer index**

Add to `packages/analyzer/src/index.ts`:
```typescript
export type { ProgressEvent } from './pipeline/analysis-pipeline.js';
```

**Step 5: Build and test**

```bash
pnpm build && pnpm test
```

**Step 6: Commit**

```bash
git add packages/analyzer/src/pipeline/analysis-pipeline.ts packages/analyzer/src/index.ts packages/cli/src/commands/analyze.ts packages/cli/src/commands/update.ts
git commit -m "feat: add progress output during analysis"
```

---

## Task 3: Add `sniffo doctor` command

**Files:**
- Create: `packages/cli/src/commands/doctor.ts`
- Create: `packages/cli/src/__tests__/doctor.test.ts`
- Modify: `packages/cli/src/cli.ts`

**Step 1: Write failing test**

```typescript
// packages/cli/src/__tests__/doctor.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runDoctor, type DoctorResult } from '../commands/doctor.js';

describe('doctor command', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ctx-doc-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('reports missing .sniffo directory', async () => {
    const result = await runDoctor(tempDir);
    expect(result.checks.find(c => c.name === 'sniffo-dir')!.status).toBe('fail');
  });

  it('reports missing database', async () => {
    mkdirSync(join(tempDir, '.sniffo'), { recursive: true });
    writeFileSync(join(tempDir, '.sniffo', 'config.json'), '{}');
    const result = await runDoctor(tempDir);
    expect(result.checks.find(c => c.name === 'database')!.status).toBe('fail');
  });

  it('reports all green for a fully initialized project', async () => {
    mkdirSync(join(tempDir, '.sniffo'), { recursive: true });
    writeFileSync(join(tempDir, '.sniffo', 'config.json'), JSON.stringify({ version: 1 }));
    // Create a DB file (empty is fine for this check)
    writeFileSync(join(tempDir, '.sniffo', 'graph.duckdb'), '');
    mkdirSync(join(tempDir, '.git', 'hooks'), { recursive: true });
    writeFileSync(join(tempDir, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\nlpc update');

    const result = await runDoctor(tempDir);
    expect(result.checks.find(c => c.name === 'sniffo-dir')!.status).toBe('pass');
    expect(result.checks.find(c => c.name === 'config')!.status).toBe('pass');
    expect(result.checks.find(c => c.name === 'database')!.status).toBe('pass');
    expect(result.checks.find(c => c.name === 'hook')!.status).toBe('pass');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm --filter @sniffo/cli test -- --reporter verbose src/__tests__/doctor.test.ts
```

**Step 3: Implement doctor command**

```typescript
// packages/cli/src/commands/doctor.ts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface DoctorCheck {
  name: string;
  label: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
}

export interface DoctorResult {
  checks: DoctorCheck[];
  healthy: boolean;
}

export async function runDoctor(projectDir: string): Promise<DoctorResult> {
  const checks: DoctorCheck[] = [];

  // 1. .sniffo directory
  const ctxDir = join(projectDir, '.sniffo');
  checks.push({
    name: 'sniffo-dir',
    label: '.sniffo directory',
    status: existsSync(ctxDir) ? 'pass' : 'fail',
    message: existsSync(ctxDir) ? 'Found' : 'Missing. Run: lpc init',
  });

  // 2. Config file
  const configPath = join(ctxDir, 'config.json');
  if (existsSync(configPath)) {
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      checks.push({
        name: 'config',
        label: 'Configuration',
        status: config.version ? 'pass' : 'warn',
        message: config.version ? `Version ${config.version}` : 'Missing version field',
      });
    } catch {
      checks.push({ name: 'config', label: 'Configuration', status: 'fail', message: 'Invalid JSON' });
    }
  } else {
    checks.push({ name: 'config', label: 'Configuration', status: 'fail', message: 'Missing config.json. Run: lpc init' });
  }

  // 3. Database
  const dbPath = join(ctxDir, 'graph.duckdb');
  checks.push({
    name: 'database',
    label: 'Graph database',
    status: existsSync(dbPath) ? 'pass' : 'fail',
    message: existsSync(dbPath) ? 'Found' : 'Missing. Run: lpc analyze',
  });

  // 4. Pre-commit hook
  const hookPath = join(projectDir, '.git', 'hooks', 'pre-commit');
  if (existsSync(hookPath)) {
    const hookContent = readFileSync(hookPath, 'utf-8');
    const hasCtx = hookContent.includes('lpc') || hookContent.includes('sniffo');
    checks.push({
      name: 'hook',
      label: 'Pre-commit hook',
      status: hasCtx ? 'pass' : 'warn',
      message: hasCtx ? 'Installed' : 'Hook exists but does not reference sniffo',
    });
  } else {
    checks.push({
      name: 'hook',
      label: 'Pre-commit hook',
      status: 'warn',
      message: 'Not installed. Run: lpc install-hook',
    });
  }

  // 5. Parsers loadable (quick check)
  try {
    const { ParserRegistry, PhpParser, TypeScriptParser } = await import('@sniffo/analyzer');
    const registry = new ParserRegistry();
    await registry.register(new PhpParser());
    await registry.register(new TypeScriptParser());
    registry.dispose();
    checks.push({ name: 'parsers', label: 'Parsers', status: 'pass', message: 'PHP + TypeScript loaded' });
  } catch (err) {
    checks.push({
      name: 'parsers',
      label: 'Parsers',
      status: 'fail',
      message: `Failed to load: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  return {
    checks,
    healthy: checks.every(c => c.status !== 'fail'),
  };
}
```

**Step 4: Register in CLI**

In `packages/cli/src/cli.ts`, add:

```typescript
program
  .command('doctor')
  .description('Check if sniffo is properly set up')
  .option('-d, --dir <path>', 'Project directory', process.cwd())
  .action(async (opts) => {
    const { runDoctor } = await import('./commands/doctor.js');
    const result = await runDoctor(opts.dir);
    for (const check of result.checks) {
      const icon = check.status === 'pass' ? '[OK]' : check.status === 'warn' ? '[!!]' : '[FAIL]';
      console.log(`  ${icon} ${check.label}: ${check.message}`);
    }
    if (!result.healthy) {
      process.exitCode = 1;
    }
  });
```

**Step 5: Run tests**

```bash
pnpm --filter @sniffo/cli test -- --reporter verbose src/__tests__/doctor.test.ts
```

**Step 6: Commit**

```bash
git add packages/cli/src/commands/doctor.ts packages/cli/src/__tests__/doctor.test.ts packages/cli/src/cli.ts
git commit -m "feat: add lpc doctor command for setup validation"
```

---

## Task 4: Add `--open` flag to serve command

**Files:**
- Modify: `packages/cli/src/commands/serve.ts`
- Modify: `packages/cli/src/cli.ts`

**Step 1: Update serve.ts**

Add `open` option and use `child_process.exec` to open browser:

```typescript
import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { DuckDBGraphStore } from '@sniffo/storage';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';

export async function runServe(projectDir: string, options: { port?: number; host?: string; open?: boolean } = {}): Promise<void> {
  const { startServer } = await import('@sniffo/web-server');

  // Auto-init if not already done
  const dbPath = join(projectDir, '.sniffo', 'graph.duckdb');
  if (!existsSync(dbPath)) {
    console.log('No database found. Running init + analysis first...');
    const { runInit } = await import('./init.js');
    await runInit(projectDir, { noAnalyze: false });
  }

  const store = new DuckDBGraphStore(dbPath);
  await store.initialize();

  const port = options.port ?? 3100;
  const host = options.host ?? '127.0.0.1';

  let staticDir: string | undefined;
  try {
    const webPkgPath = import.meta.resolve('@sniffo/web/package.json');
    const webPkgDir = dirname(fileURLToPath(webPkgPath));
    const distDir = join(webPkgDir, 'dist');
    if (existsSync(distDir)) {
      staticDir = distDir;
    }
  } catch {
    // Web package not available
  }

  await startServer({ store, projectDir, port, host, staticDir });
  const url = `http://${host}:${port}`;
  console.log(`Server running at ${url}`);
  if (staticDir) {
    console.log(`Web UI available at ${url}`);
  }

  if (options.open) {
    const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    exec(`${cmd} ${url}`);
  }
}
```

**Step 2: Update CLI registration**

In `packages/cli/src/cli.ts`, update serve command:

```typescript
program
  .command('serve')
  .description('Start HTTP API server with web UI')
  .option('-d, --dir <path>', 'Project directory', process.cwd())
  .option('-p, --port <number>', 'Port number', '3100')
  .option('--host <addr>', 'Bind address', '127.0.0.1')
  .option('-o, --open', 'Open browser automatically')
  .action(async (opts) => {
    const { runServe } = await import('./commands/serve.js');
    await runServe(opts.dir, { port: parseInt(opts.port), host: opts.host, open: opts.open });
  });
```

**Step 3: Build and test**

```bash
pnpm build && pnpm test
```

**Step 4: Commit**

```bash
git add packages/cli/src/commands/serve.ts packages/cli/src/cli.ts
git commit -m "feat: serve auto-inits if needed, --open flag opens browser"
```

---

## Task 5: Graceful MCP server startup

The MCP server crashes if the DB doesn't exist. It should auto-initialize.

**Files:**
- Modify: `packages/mcp-server/src/index.ts`

**Step 1: Update MCP entrypoint**

Replace `packages/mcp-server/src/index.ts`:

```typescript
#!/usr/bin/env node
import { join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { DuckDBGraphStore } from '@sniffo/storage';
import { startStdioServer } from './server.js';

const projectDir = process.argv[2] || process.env.PROJECT_DIR || process.cwd();
const ctxDir = join(projectDir, '.sniffo');
const dbPath = join(ctxDir, 'graph.duckdb');

// Auto-initialize if needed
if (!existsSync(dbPath)) {
  mkdirSync(ctxDir, { recursive: true });
  process.stderr.write(`[sniffo] No database found at ${dbPath}. Initializing...\n`);
}

const store = new DuckDBGraphStore(dbPath);
await store.initialize();

// If empty DB, run initial analysis
const allNodes = await store.getAllNodes();
if (allNodes.length === 0) {
  process.stderr.write(`[sniffo] Empty database. Running initial analysis...\n`);
  try {
    const { AnalysisPipeline, ParserRegistry, PhpParser, TypeScriptParser } = await import('@sniffo/analyzer');
    const registry = new ParserRegistry();
    await registry.register(new PhpParser());
    await registry.register(new TypeScriptParser());
    const pipeline = new AnalysisPipeline(store, registry);
    const result = await pipeline.analyze({
      rootDir: projectDir,
      projectName: projectDir.split('/').pop() ?? 'project',
      includePatterns: ['**/*.php', '**/*.ts', '**/*.tsx'],
      excludePatterns: ['vendor/**', 'node_modules/**', '.git/**', 'dist/**', 'build/**'],
    });
    registry.dispose();
    process.stderr.write(`[sniffo] Analysis complete: ${result.filesAnalyzed} files, ${result.symbolsFound} symbols.\n`);
  } catch (err) {
    process.stderr.write(`[sniffo] Analysis failed: ${err instanceof Error ? err.message : String(err)}\n`);
  }
}

await startStdioServer(store, projectDir);
```

**Step 2: Build and test**

```bash
pnpm build && pnpm --filter @sniffo/mcp-server test -- --reporter verbose
```

**Step 3: Commit**

```bash
git add packages/mcp-server/src/index.ts
git commit -m "feat: MCP server auto-initializes and analyzes on first run"
```

---

## Task 6: Create Claude Code plugin structure

This is the main plugin task. We create a `plugin/` directory at the repo root with the Claude Code plugin layout.

**Files:**
- Create: `plugin/.claude-plugin/plugin.json`
- Create: `plugin/.mcp.json`
- Create: `plugin/skills/analyze/SKILL.md`
- Create: `plugin/skills/explore/SKILL.md`
- Create: `plugin/skills/freshness/SKILL.md`
- Create: `plugin/hooks/hooks.json`
- Create: `plugin/README.md`

**Step 1: Create plugin manifest**

```json
// plugin/.claude-plugin/plugin.json
{
  "name": "sniffo",
  "description": "Codebase knowledge graph -- analyzes your project structure, dependencies, and relationships. Provides search, blast radius, cycle detection, and interactive graph visualization.",
  "version": "0.1.0",
  "author": {
    "name": "Krzysztof Surdy"
  },
  "keywords": ["codebase", "knowledge-graph", "architecture", "dependencies", "analysis"]
}
```

**Step 2: Create MCP server configuration**

The MCP server binary is `sniffo-mcp` from the `@sniffo/mcp-server` package. For local plugin use, we reference it via the built dist path. The `PROJECT_DIR` env var tells the server which project to analyze.

```json
// plugin/.mcp.json
{
  "mcpServers": {
    "sniffo": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/../packages/mcp-server/dist/index.js"],
      "env": {
        "PROJECT_DIR": "${PROJECT_DIR:-.}"
      }
    }
  }
}
```

Note: For distribution, this would be `npx sniffo-mcp` instead. For development/local use, we point at the built dist.

**Step 3: Create skills**

```markdown
<!-- plugin/skills/analyze/SKILL.md -->
---
name: analyze
description: Analyze the current project to build or refresh the codebase knowledge graph. Use when the user asks to analyze, scan, or map their codebase structure.
---

# Analyze Codebase

Use the `analyze_project` MCP tool to run a full analysis of the current project.

After analysis completes, report:
- Number of files analyzed
- Number of symbols (classes, interfaces, functions) found
- Number of cross-references resolved
- Any errors encountered

If the user asks about specific languages or patterns, pass appropriate `includePatterns`.
```

```markdown
<!-- plugin/skills/explore/SKILL.md -->
---
name: explore
description: Explore the codebase knowledge graph to understand architecture, find dependencies, trace relationships, or assess impact. Use when the user asks about code structure, dependencies, what uses what, or impact analysis.
---

# Explore Codebase Graph

You have these MCP tools available:

1. **search_symbols** -- Find classes, interfaces, functions by name. Start here.
2. **find_references** -- Find where a symbol is used (incoming references).
3. **find_dependencies** -- Find what a symbol depends on (outgoing references).
4. **find_dependents** -- Find what depends on a symbol (who would break if it changes).

## Workflow

1. Use `search_symbols` to find the starting point
2. Use `find_dependencies` or `find_dependents` to trace the graph
3. Summarize findings in a clear, structured way

When explaining architecture, organize by:
- Package/module boundaries
- Key dependency chains
- Circular dependencies (if any)
```

```markdown
<!-- plugin/skills/freshness/SKILL.md -->
---
name: freshness
description: Check if the codebase knowledge graph is up-to-date or needs refreshing. Use when the user asks about staleness, outdated analysis, or wants to refresh the graph.
---

# Check Freshness

Use the `get_freshness` MCP tool to check how up-to-date the knowledge graph is.

If stale nodes are found, offer to run `refresh` to incrementally update only the changed files.

Report:
- Total nodes in graph
- Number and percentage of stale nodes
- When the last analysis was run
```

**Step 4: Create hooks**

A SessionStart hook that checks if the database exists and prints a helpful message:

```json
// plugin/hooks/hooks.json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "test -f .sniffo/graph.duckdb || echo '[sniffo] No analysis database found. Use /sniffo:analyze to scan this project.'"
          }
        ]
      }
    ]
  }
}
```

**Step 5: Create README**

```markdown
<!-- plugin/README.md -->
# Sniffo - Claude Code Plugin

Codebase knowledge graph plugin for Claude Code. Analyzes your project's structure,
dependencies, and relationships to give Claude deep architectural understanding.

## Installation

### Local development

```bash
claude --plugin-dir ./plugin
```

### From marketplace (when published)

```bash
claude plugin install sniffo
```

## What it provides

### MCP Tools (automatic)

- `analyze_project` -- Full codebase analysis
- `search_symbols` -- Find classes, functions, interfaces
- `find_references` -- Where is this symbol used?
- `find_dependencies` -- What does this depend on?
- `find_dependents` -- What depends on this?
- `get_freshness` -- Is the graph up-to-date?
- `refresh` -- Incremental update

### Skills (slash commands)

- `/sniffo:analyze` -- Run or refresh analysis
- `/sniffo:explore` -- Navigate the dependency graph
- `/sniffo:freshness` -- Check graph staleness

## Supported Languages

- PHP 8.3+
- TypeScript / TSX
- JavaScript / JSX

## How it works

On first use, the plugin analyzes your codebase and stores a knowledge graph in
`.sniffo/graph.duckdb`. Subsequent runs are incremental -- only changed files
are re-analyzed. A pre-commit hook keeps the graph fresh automatically.
```

**Step 6: Verify plugin structure**

```bash
ls -la plugin/.claude-plugin/plugin.json plugin/.mcp.json plugin/skills/*/SKILL.md plugin/hooks/hooks.json plugin/README.md
```

**Step 7: Test the plugin loads**

```bash
claude --plugin-dir ./plugin --debug 2>&1 | head -20
```

Or just verify the structure is correct -- actual runtime testing requires Claude Code.

**Step 8: Commit**

```bash
git add plugin/
git commit -m "feat: create Claude Code plugin with MCP server, skills, and hooks"
```

---

## Task 7: Add `sniffo setup-plugin` command

A convenience command that symlinks or copies the plugin for local use.

**Files:**
- Create: `packages/cli/src/commands/setup-plugin.ts`
- Modify: `packages/cli/src/cli.ts`

**Step 1: Implement setup-plugin**

```typescript
// packages/cli/src/commands/setup-plugin.ts
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function runSetupPlugin(projectDir: string): Promise<void> {
  // Find the plugin directory relative to this package
  const pkgDir = dirname(fileURLToPath(import.meta.url));
  // Go up from dist/commands/ to the monorepo root, then into plugin/
  const pluginDir = resolve(pkgDir, '..', '..', '..', '..', 'plugin');

  if (!existsSync(pluginDir)) {
    throw new Error(`Plugin directory not found at ${pluginDir}. Is the project built?`);
  }

  // Create .mcp.json in the project pointing to the actual MCP server
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

  // Write to project's .claude/ directory
  const claudeDir = join(projectDir, '.claude');
  mkdirSync(claudeDir, { recursive: true });

  const mcpPath = join(claudeDir, 'mcp.json');
  if (existsSync(mcpPath)) {
    // Merge with existing
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
```

**Step 2: Register in CLI**

In `packages/cli/src/cli.ts`:

```typescript
program
  .command('setup-plugin')
  .description('Configure Claude Code plugin for this project')
  .option('-d, --dir <path>', 'Project directory', process.cwd())
  .action(async (opts) => {
    const { runSetupPlugin } = await import('./commands/setup-plugin.js');
    await runSetupPlugin(opts.dir);
  });
```

**Step 3: Build and test**

```bash
pnpm build
```

**Step 4: Commit**

```bash
git add packages/cli/src/commands/setup-plugin.ts packages/cli/src/cli.ts
git commit -m "feat: add lpc setup-plugin command for Claude Code integration"
```

---

## Task 8: Final build and verification

**Step 1: Build all packages**

```bash
pnpm build
```

**Step 2: Run all tests**

```bash
pnpm test
```

**Step 3: Verify plugin structure**

```bash
# Check all expected files exist
ls plugin/.claude-plugin/plugin.json plugin/.mcp.json plugin/skills/analyze/SKILL.md plugin/skills/explore/SKILL.md plugin/skills/freshness/SKILL.md plugin/hooks/hooks.json
```

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: phase 9 complete -- DX improvements and Claude Code plugin"
```

---

## Summary

| Task | What | Tests |
|------|------|-------|
| 1 | Init auto-analyzes, smart defaults | ~1 new test |
| 2 | Progress output during analysis | 0 (visual) |
| 3 | `sniffo doctor` validation command | ~3 tests |
| 4 | `serve --open` + auto-init | 0 (interactive) |
| 5 | MCP server graceful startup | 0 (MCP runtime) |
| 6 | Claude Code plugin (manifest, MCP, skills, hooks) | 0 (plugin structure) |
| 7 | `sniffo setup-plugin` command | 0 (wiring) |
| 8 | Final verification | 0 |

**New tests: ~4**

**Definition of Done:**
- [ ] `sniffo init` is a single command that creates config, installs hook, AND runs first analysis
- [ ] Analysis shows progress (file count, current file)
- [ ] `sniffo doctor` validates the full setup
- [ ] `sniffo serve --open` opens browser
- [ ] MCP server auto-initializes on first connection (no manual setup needed)
- [ ] Claude Code plugin directory with manifest, MCP config, 3 skills, session hook
- [ ] `sniffo setup-plugin` wires MCP for a project

**New onboarding flow:**
```bash
# One command to rule them all:
lpc init

# Or with web UI:
lpc serve --open

# Or as Claude Code plugin:
claude --plugin-dir ./plugin
```
