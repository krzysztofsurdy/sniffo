import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { AnalysisPipeline, ParserRegistry, PhpParser, TypeScriptParser } from '@sniffo/analyzer';
import { DuckDBGraphStore } from '@sniffo/storage';
import type { AnalysisResult } from '@sniffo/core';
import { loadConfig } from '../config/loader.js';

export const PHASES = ['discovery', 'parsing', 'storing', 'resolution', 'hierarchy', 'aggregation'] as const;
const PHASE_LABELS: Record<string, string> = {
  discovery: 'Discovering files',
  parsing: 'Parsing files',
  storing: 'Storing to database',
  resolution: 'Resolving references',
  hierarchy: 'Building hierarchy',
  aggregation: 'Aggregating edges',
};

export function clearProgress(): void {
  const cols = process.stdout.columns || 80;
  process.stdout.write(`\x1b[?25h\x1b[3A\r${' '.repeat(cols)}\n${' '.repeat(cols)}\n${' '.repeat(cols)}\x1b[3A\r`);
}

function bar(current: number, total: number, width: number): string {
  if (total === 0) return '░'.repeat(width);
  const ratio = Math.min(1, current / total);
  const filled = Math.round(ratio * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

export function renderProgress(phase: string, phaseIndex: number, current: number, total: number, detail?: string): void {
  const cols = process.stdout.columns || 80;
  const overallBar = bar(phaseIndex, PHASES.length, 20);
  const phaseBar = bar(current, total, 25);
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  const phaseLabel = PHASE_LABELS[phase] ?? phase;

  const line1 = `Overall  [${overallBar}] ${phaseIndex}/${PHASES.length}  ${phaseLabel}`;
  const line2 = `Current  [${phaseBar}] ${pct}% (${current}/${total})`;
  const line3 = detail ? detail.slice(0, cols) : '';

  process.stdout.write(`\x1b[?25l\x1b[3A\r${line1.padEnd(cols)}\n${line2.padEnd(cols)}\n${line3.padEnd(cols)}\r`);
}

export async function runAnalyze(projectDir: string): Promise<AnalysisResult> {
  const config = loadConfig(projectDir);

  const ctxDir = join(projectDir, '.sniffo');
  mkdirSync(ctxDir, { recursive: true });

  const dbPath = join(ctxDir, 'graph.duckdb');
  const store = new DuckDBGraphStore(dbPath);
  await store.initialize();

  const registry = new ParserRegistry();
  await registry.register(new PhpParser());
  await registry.register(new TypeScriptParser());

  // Reserve 3 lines for progress display
  process.stdout.write('\n\n\n');

  const pipeline = new AnalysisPipeline(store, registry);
  const result = await pipeline.analyze({
    rootDir: projectDir,
    projectName: config.projectName,
    includePatterns: config.include,
    excludePatterns: config.exclude,
    onProgress: (event) => {
      const phaseIndex = PHASES.indexOf(event.phase as typeof PHASES[number]);
      renderProgress(event.phase, phaseIndex, event.current, event.total, event.detail ?? event.file);
    },
  });

  clearProgress();

  registry.dispose();
  await store.close();

  return result;
}
