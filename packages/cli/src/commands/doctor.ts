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

  const ctxDir = join(projectDir, '.sniffo');
  checks.push({
    name: 'sniffo-dir',
    label: '.sniffo directory',
    status: existsSync(ctxDir) ? 'pass' : 'fail',
    message: existsSync(ctxDir) ? 'Found' : 'Missing. Run: sniffo init',
  });

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
    checks.push({ name: 'config', label: 'Configuration', status: 'fail', message: 'Missing config.json. Run: sniffo init' });
  }

  const dbPath = join(ctxDir, 'graph.duckdb');
  checks.push({
    name: 'database',
    label: 'Graph database',
    status: existsSync(dbPath) ? 'pass' : 'fail',
    message: existsSync(dbPath) ? 'Found' : 'Missing. Run: sniffo analyze',
  });

  const hookPath = join(projectDir, '.git', 'hooks', 'pre-commit');
  if (existsSync(hookPath)) {
    const hookContent = readFileSync(hookPath, 'utf-8');
    const hasCtx = hookContent.includes('sniffo') || hookContent.includes('sniffo');
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
      message: 'Not installed. Run: sniffo install-hook',
    });
  }

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
