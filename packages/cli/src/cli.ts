import { Command } from 'commander';
import { runAnalyze } from './commands/analyze.js';
import { runUpdate } from './commands/update.js';
import { runStatus } from './commands/status.js';
import { installHook, uninstallHook } from './commands/install-hook.js';
import { runInit } from './commands/init.js';

export function createCli(): Command {
  const program = new Command();

  program
    .name('lpc')
    .description('llmProjectContextualizer -- Codebase Knowledge Graph Tool')
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
    .description('Remove contextualizer pre-commit hook')
    .option('-d, --dir <path>', 'Project directory', process.cwd())
    .action(async (opts: { dir: string }) => {
      await uninstallHook(opts.dir);
      console.log('Pre-commit hook removed.');
    });

  program
    .command('init')
    .description('Initialize contextualizer in the current project')
    .option('-d, --dir <path>', 'Project directory', process.cwd())
    .option('--no-hooks', 'Skip pre-commit hook installation')
    .action(async (opts: { dir: string; hooks: boolean }) => {
      await runInit(opts.dir, { noHooks: !opts.hooks });
      console.log('Contextualizer initialized.');
    });

  return program;
}
