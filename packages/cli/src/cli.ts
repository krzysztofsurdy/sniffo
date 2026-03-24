import { Command } from 'commander';
import { runAnalyze } from './commands/analyze.js';
import { runUpdate } from './commands/update.js';
import { runStatus } from './commands/status.js';
import { installHook, uninstallHook } from './commands/install-hook.js';
import { runInit } from './commands/init.js';

export function createCli(): Command {
  const program = new Command();

  program
    .name('sniffo')
    .description('sniffo -- Codebase Knowledge Graph Tool')
    .version('0.0.1');

  program
    .command('analyze')
    .description('Run full analysis on the project')
    .option('-d, --dir <path>', 'Project directory', process.cwd())
    .action(async (opts) => {
      const result = await runAnalyze(opts.dir);
      console.log(`Analyzed ${result.filesAnalyzed} files, found ${result.symbolsFound} symbols, ${result.referencesFound} references.`);
      if (result.errors.length > 0) {
        console.log(`${result.errors.length} errors occurred.`);
      }
    });

  program
    .command('update')
    .description('Incremental update (only changed files)')
    .option('-d, --dir <path>', 'Project directory', process.cwd())
    .action(async (opts) => {
      const result = await runUpdate(opts.dir);
      console.log(`Updated: ${result.filesAnalyzed} files analyzed, ${result.filesSkipped} unchanged.`);
    });

  program
    .command('status')
    .description('Show staleness report')
    .option('-d, --dir <path>', 'Project directory', process.cwd())
    .action(async (opts) => {
      const report = await runStatus(opts.dir);
      console.log(`Total nodes: ${report.totalNodes}`);
      console.log(`Stale: ${report.staleNodes.length} (${report.stalePercentage}%)`);
      if (report.lastAnalysisRun) {
        console.log(`Last run: ${report.lastAnalysisRun.startedAt} (${report.lastAnalysisRun.trigger})`);
      }
    });

  program
    .command('install-hook')
    .description('Install pre-commit hook for automatic graph updates')
    .option('-d, --dir <path>', 'Project directory', process.cwd())
    .action(async (opts: { dir: string }) => {
      await installHook(opts.dir);
      console.log('Pre-commit hook installed.');
    });

  program
    .command('uninstall-hook')
    .description('Remove sniffo pre-commit hook')
    .option('-d, --dir <path>', 'Project directory', process.cwd())
    .action(async (opts: { dir: string }) => {
      await uninstallHook(opts.dir);
      console.log('Pre-commit hook removed.');
    });

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

  program
    .command('setup-plugin')
    .description('Configure Claude Code plugin for this project')
    .option('-d, --dir <path>', 'Project directory', process.cwd())
    .action(async (opts) => {
      const { runSetupPlugin } = await import('./commands/setup-plugin.js');
      await runSetupPlugin(opts.dir);
    });

  return program;
}
