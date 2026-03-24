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

## Setup

### Install the CLI

```bash
npm install -g @sniffo/cli
```

### Initialize in your project

```bash
sniffo init        # Analyzes codebase + installs pre-commit hook
sniffo analyze     # Full analysis
sniffo update      # Incremental update (changed files only)
sniffo status      # Staleness report
sniffo serve -o    # Web UI at http://localhost:3100
sniffo doctor      # Health check
```

## MCP Server

Sniffo exposes a knowledge graph MCP server that works with any AI coding agent.

### Claude Code

```bash
claude mcp add -s user sniffo -- npx -y @sniffo/mcp-server
```

Or project-level:

```bash
claude mcp add -s project sniffo -- npx -y @sniffo/mcp-server
```

### Claude Code Plugin (full experience)

For skills and lifecycle hooks in addition to MCP tools:

```bash
claude plugin add --from-github krzysztofsurdy/sniffo
```

### Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "sniffo": {
      "command": "npx",
      "args": ["-y", "@sniffo/mcp-server"]
    }
  }
}
```

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "sniffo": {
      "command": "npx",
      "args": ["-y", "@sniffo/mcp-server"]
    }
  }
}
```

### OpenCode

Add to `opencode.json`:

```json
{
  "mcp": {
    "sniffo": {
      "type": "local",
      "command": ["npx", "-y", "@sniffo/mcp-server"]
    }
  }
}
```

### VS Code (GitHub Copilot)

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "sniffo": {
      "command": "npx",
      "args": ["-y", "@sniffo/mcp-server"]
    }
  }
}
```

### MCP tools

| Tool | Description |
|------|-------------|
| `analyze_project` | Full codebase analysis |
| `search_symbols` | Find classes, functions, interfaces |
| `find_references` | Where is this symbol used? |
| `find_dependencies` | What does this depend on? |
| `find_dependents` | What depends on this? |
| `get_freshness` | Is the graph up-to-date? |
| `refresh` | Incremental update |

### Claude Code slash commands

When installed as a plugin, these skills are available:

- `/sniffo:analyze` -- Run or refresh analysis
- `/sniffo:explore` -- Navigate the dependency graph
- `/sniffo:freshness` -- Check graph staleness

## Web UI

```bash
sniffo serve -o  # Opens browser automatically
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
