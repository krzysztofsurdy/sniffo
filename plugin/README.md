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
