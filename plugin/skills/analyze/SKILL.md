---
name: analyze
description: Analyze the current project to build or refresh the codebase knowledge graph. Use when the user asks to analyze, scan, or map their codebase structure.
---

# Analyze Codebase

Use the `analyze_project` MCP tool to run a full analysis of the current project.

After analysis completes, report:
- Number of files analyzed
- Number of symbols (classes, interfaces, functions) found
- Number of cross-references resolved
- Any errors encountered

If the user asks about specific languages or patterns, pass appropriate `includePatterns`.
