# Sniffo

Codebase knowledge graph tool. Analyzes your project's structure, dependencies, and relationships -- then exposes them via CLI, web UI, and MCP server for AI-assisted development.

## What it does

Sniffo parses your source code using tree-sitter, extracts symbols (classes, functions, interfaces) and their relationships (imports, inheritance, method calls), and stores everything in a DuckDB graph. You can then:

- **Search** symbols across your codebase
- **Trace** dependencies and dependents for any symbol
- **Detect** circular dependencies
- **Measure** blast radius of changes
- **Visualize** the architecture in a web UI
- **Keep it fresh** with incremental updates and pre-commit hooks

## Supported languages

- PHP 8.3+
- TypeScript / TSX
- JavaScript / JSX

## Quick start

```bash
# Install dependencies and build
pnpm install
pnpm build

# Initialize in your project (analyzes codebase + installs hook)
npx sniffo init

# Or step by step
npx sniffo analyze        # Full analysis
npx sniffo update         # Incremental update (changed files only)
npx sniffo status         # Staleness report
npx sniffo serve          # Web UI at http://localhost:3100
npx sniffo doctor         # Health check
```

## Claude Code plugin

Sniffo ships as a Claude Code plugin, giving Claude direct access to your codebase graph.

```bash
# Local development
claude --plugin-dir ./plugin

# Setup MCP server for a project
npx sniffo setup-plugin
```

### MCP tools available to Claude

| Tool | Description |
|------|-------------|
| `analyze_project` | Full codebase analysis |
| `search_symbols` | Find classes, functions, interfaces |
| `find_references` | Where is this symbol used? |
| `find_dependencies` | What does this depend on? |
| `find_dependents` | What depends on this? |
| `get_freshness` | Is the graph up-to-date? |
| `refresh` | Incremental update |

### Slash commands

- `/sniffo:analyze` -- Run or refresh analysis
- `/sniffo:explore` -- Navigate the dependency graph
- `/sniffo:freshness` -- Check graph staleness

## Web UI

```bash
npx sniffo serve -o  # Opens browser automatically
```

Interactive graph visualization with:
- Force-directed layout (WebGL via Sigma.js)
- Search and filter by symbol type
- Drill-down navigation with breadcrumbs
- Blast radius highlighting
- Freshness coloring (stale nodes in red)
- Export to JSON/CSV

## Architecture

Monorepo with 7 packages:

```
packages/
  core/          Type definitions and interfaces
  storage/       DuckDB graph store
  analyzer/      Tree-sitter parsers + analysis pipeline
  cli/           Commander.js CLI (sniffo binary)
  mcp-server/    MCP server (stdio transport)
  web-server/    Fastify HTTP API
  web/           React + Vite web UI
plugin/          Claude Code plugin (skills, hooks, MCP config)
```

### How it works

1. **Discovery** -- finds files matching include patterns
2. **Parsing** -- tree-sitter extracts symbols and references from each file
3. **Resolution** -- matches references to their target symbols
4. **Hierarchy** -- builds C4-model layers (System > Package > Module > Component)
5. **Aggregation** -- rolls up edges to higher abstraction levels

The graph is stored in `.sniffo/graph.duckdb`. Incremental updates only re-parse changed files (by content hash).

### Monorepo support

Automatically detects:
- pnpm workspaces (`pnpm-workspace.yaml`)
- npm/yarn workspaces (`package.json`)
- Composer path repositories (`composer.json`)

Cross-package edges are tagged and rendered in orange in the web UI.

## Development

```bash
pnpm install
pnpm build
pnpm test          # 195+ tests across all packages
pnpm typecheck
pnpm lint
```

## License

MIT
