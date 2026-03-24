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
