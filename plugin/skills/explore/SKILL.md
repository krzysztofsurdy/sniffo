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
