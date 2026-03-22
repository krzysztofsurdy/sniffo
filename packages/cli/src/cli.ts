import { Command } from 'commander';

export function createCli(): Command {
  const program = new Command();

  program
    .name('lpc')
    .description('llmProjectContextualizer -- Codebase Knowledge Graph Tool')
    .version('0.0.1');

  return program;
}
