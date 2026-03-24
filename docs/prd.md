# Product Requirements Document: llmProjectSniffo

| Field            | Value                                      |
|------------------|--------------------------------------------|
| **Product Name** | llmProjectSniffo                   |
| **Version**      | 1.0                                        |
| **Author**       | Product Management                         |
| **Date**         | 2026-03-22                                 |
| **Status**       | Draft                                      |

---

## 1. Product Vision & Goals

### Vision

A developer tool that builds, maintains, and visualizes a living knowledge graph of any codebase -- turning static source files into an interactive, always-fresh map that both humans and AI agents can query. It runs entirely locally, stores everything inside the project, and integrates with Claude Code via MCP.

### Goals

| ID   | Goal                                                                                          | Success Indicator                                    |
|------|-----------------------------------------------------------------------------------------------|------------------------------------------------------|
| G-1  | Provide an accurate, always-up-to-date knowledge graph of code relationships                  | Zero stale nodes after a committed change (see M-1)  |
| G-2  | Enable multi-level drill-down visualization following C4 architecture levels                   | Users can navigate L1-L4 in under 3 clicks           |
| G-3  | Integrate seamlessly with Claude Code as an MCP server                                        | All MCP tools callable from Claude Code session       |
| G-4  | Run fully offline with no external API dependencies                                           | Complete analysis + embedding pipeline works air-gapped |
| G-5  | Support PHP as first-class language while keeping architecture language-agnostic               | Adding a new language requires only a parser + extractor module |

### Design Principles

1. **Freshness over completeness** -- a partially analyzed but accurate graph is more valuable than a complete but stale one.
2. **Local-first** -- all storage, embeddings, and processing happen on the developer's machine. No data leaves the project.
3. **Incremental by default** -- every operation (parse, index, embed) works on deltas, not full rescans.
4. **Minimal intrusion** -- the tool stores artifacts in `.sniffo/` and registers one git hook. No other project files are modified.

---

## 2. Target Users & Personas

### Persona 1: Senior Developer ("The Navigator")

- **Who**: Backend developer joining a large legacy PHP codebase (50k-500k LOC).
- **Pain**: Spends hours tracing call chains, understanding module boundaries, and finding blast radius of changes.
- **Need**: A visual map they can drill into, combined with AI-assisted querying ("what depends on this service?").
- **Success**: Reduces time-to-understanding of unfamiliar code areas from hours to minutes.

### Persona 2: Tech Lead ("The Architect")

- **Who**: Technical lead responsible for system design decisions across multiple services.
- **Pain**: Architecture diagrams are always out of date. C4 diagrams in Confluence diverge from reality within weeks.
- **Need**: Auto-generated, always-current architecture views at system, container, and component levels.
- **Success**: Can present current-state architecture to stakeholders without manual diagram updates.

### Persona 3: AI-Assisted Developer ("The Prompter")

- **Who**: Developer using Claude Code daily for code generation, refactoring, and review.
- **Pain**: Claude lacks project-wide structural context. Providing sufficient context manually is tedious.
- **Need**: MCP tools that let Claude query the knowledge graph for relationships, dependencies, and semantic similarity.
- **Success**: Claude responses reference accurate, up-to-date structural context without manual file enumeration.

---

## 3. Core Requirements

### 3.1 Analysis Engine

| REQ-ID  | Requirement                                                                                                              | Priority | Notes                                                           |
|---------|--------------------------------------------------------------------------------------------------------------------------|----------|-----------------------------------------------------------------|
| REQ-001 | Parse PHP source files using Tree-sitter to extract classes, interfaces, traits, functions, methods, properties, constants | Must     | Use `tree-sitter-php` grammar                                   |
| REQ-002 | Resolve cross-file relationships: imports/use statements, inheritance, interface implementation, trait usage, function calls, type references | Must     | Multi-pass pipeline: structure -> parse -> resolve -> cluster -> index |
| REQ-003 | Compute SHA-256 content hash per source file and store alongside graph nodes                                              | Must     | Used for staleness detection (REQ-010)                          |
| REQ-004 | Generate vector embeddings for code entities using `transformers.js` with `all-MiniLM-L6-v2` model                       | Must     | 384-dimension vectors, max 256 tokens per chunk                 |
| REQ-005 | Architecture must support adding new language parsers without modifying core engine                                        | Must     | Plugin interface: `LanguageParser { parse(file): Entity[] }`    |
| REQ-006 | Multi-pass analysis pipeline: (1) file discovery, (2) AST parsing, (3) cross-reference resolution, (4) clustering, (5) embedding + indexing | Must     | Inspired by GitNexus pipeline                                   |
| REQ-007 | Parallel file parsing -- process files concurrently using worker threads                                                  | Should   | Target: saturate available CPU cores                            |
| REQ-008 | Support incremental analysis -- only re-parse files whose content hash has changed                                        | Must     | Compare stored SHA-256 vs current file hash                     |
| REQ-009 | Assign every node and edge a `lastAnalyzedAt` ISO-8601 timestamp                                                         | Must     | Used for freshness display (REQ-027)                            |
| REQ-010 | Content-hash staleness detection: on read, compare stored hash vs current file hash; mark node as `stale` if mismatched   | Must     | Stale status propagates to UI indicators                        |
| REQ-011 | Dependency-aware cascade invalidation: when file A changes, mark all nodes that depend on A as `needsReverify`            | Must     | Traverse incoming edges in graph to find dependents             |
| REQ-012 | Cluster detection to auto-identify module/package boundaries for L2 (Container) and L3 (Component) levels                 | Must     | Use directory structure + namespace analysis as primary signal   |

### 3.2 Storage

| REQ-ID  | Requirement                                                                                                  | Priority | Notes                                                                |
|---------|--------------------------------------------------------------------------------------------------------------|----------|----------------------------------------------------------------------|
| REQ-013 | Store all artifacts in `<project-root>/.sniffo/` directory                                           | Must     | Add to `.gitignore` recommendation on init                           |
| REQ-014 | Use KuzuDB (v0.11.3) as embedded graph database for node and relationship storage                            | Must     | Archived but stable at v0.11.3; see RISK-001                        |
| REQ-015 | Store vector embeddings in KuzuDB using its built-in vector index support                                    | Must     | Avoids separate vector store dependency                              |
| REQ-016 | Graph schema must model C4 levels: `System`, `Container`, `Component`, `CodeEntity` node types               | Must     | Plus relationship types: `CONTAINS`, `DEPENDS_ON`, `CALLS`, `IMPLEMENTS`, `EXTENDS`, `USES_TRAIT`, `IMPORTS` |
| REQ-017 | Store file-level metadata: path, content hash, last analyzed timestamp, language, LOC                         | Must     | On `File` node type                                                  |
| REQ-018 | Database must survive unclean shutdown without corruption                                                      | Must     | KuzuDB provides WAL-based recovery                                   |
| REQ-019 | Provide export capability to JSON format for portability                                                      | Should   | Full graph export + per-level filtered export                        |

### 3.3 Freshness & Auto-Update

| REQ-ID  | Requirement                                                                                                  | Priority | Notes                                                                |
|---------|--------------------------------------------------------------------------------------------------------------|----------|----------------------------------------------------------------------|
| REQ-020 | Register a git pre-commit hook that triggers incremental graph update on every commit                         | Must     | Hook script at `.git/hooks/pre-commit` or via `.husky/`              |
| REQ-021 | Pre-commit hook must complete within 10 seconds for typical commits (1-20 changed files)                     | Must     | If exceeded, log warning but do not block commit                     |
| REQ-022 | Pre-commit hook only processes staged files (`git diff --cached --name-only`)                                 | Must     | Avoid full rescan on every commit                                    |
| REQ-023 | Provide CLI command `sniffo refresh` for manual full rescan                                           | Must     | For initial setup and recovery from drift                            |
| REQ-024 | Provide CLI command `sniffo refresh --changed` for manual incremental update                          | Should   | Detects changed files via content hash comparison                    |
| REQ-025 | No auto-refresh from UI -- user must explicitly trigger refresh via UI button or CLI                          | Must     | No polling, no file watchers from the web UI                         |
| REQ-026 | Display last global refresh timestamp prominently in UI header                                                | Must     | Format: "Last refreshed: 2026-03-22 14:30:05"                       |
| REQ-027 | Every node in the graph visualization shows its `lastAnalyzedAt` timestamp on hover                          | Must     | Tooltip or info panel                                                |
| REQ-028 | Visually indicate stale nodes/edges with distinct styling (e.g., dashed borders, muted colors, warning icon) | Must     | Stale = content hash mismatch detected on last read                  |
| REQ-029 | Visually indicate `needsReverify` nodes with a different style (e.g., amber border)                          | Must     | Distinct from stale -- dependency changed, not this file             |

### 3.4 Graph Visualization (Web UI)

| REQ-ID  | Requirement                                                                                                  | Priority | Notes                                                                |
|---------|--------------------------------------------------------------------------------------------------------------|----------|----------------------------------------------------------------------|
| REQ-030 | Force-directed graph layout using Sigma.js + Graphology with ForceAtlas2 algorithm                           | Must     | WebGL rendering for performance                                      |
| REQ-031 | Multi-level graph following C4 model: L1 System -> L2 Container -> L3 Component -> L4 Code                  | Must     | Click node to drill down; breadcrumb navigation to go up             |
| REQ-032 | L1 (System): Shows the project as a single system with external dependencies as separate nodes               | Must     | External deps = Composer packages, external services                 |
| REQ-033 | L2 (Container): Shows top-level modules/packages/bounded contexts within the system                          | Must     | Derived from directory structure + namespace clustering               |
| REQ-034 | L3 (Component): Shows classes, interfaces, traits, and their relationships within a container                 | Must     | Inheritance, implementation, trait usage, dependency injection        |
| REQ-035 | L4 (Code): Shows methods, properties, and function-level call graphs within a component                      | Must     | Method calls, property access, parameter types                       |
| REQ-036 | Drag nodes to reposition; positions persist during session                                                    | Must     | Sigma.js drag plugin                                                 |
| REQ-037 | Zoom and pan with mouse wheel and drag on canvas                                                              | Must     | Standard Sigma.js interaction                                        |
| REQ-038 | Filter graph by: node type, namespace, directory, staleness status, search query                              | Must     | Filter panel with checkboxes and text input                          |
| REQ-039 | Search nodes by name with fuzzy matching; highlight and center matched node                                   | Must     | Debounced input, max 500ms response time                             |
| REQ-040 | Blast radius visualization: select a node and highlight all transitively dependent nodes                      | Must     | Color-coded by hop distance (1-hop = red, 2-hop = orange, 3+ = yellow) |
| REQ-041 | Edge labels showing relationship type (CALLS, EXTENDS, IMPLEMENTS, etc.)                                      | Should   | Toggle-able to reduce visual clutter                                 |
| REQ-042 | Node size proportional to a selectable metric: LOC, dependency count, or fan-in                                | Should   | Dropdown selector in toolbar                                         |
| REQ-043 | Color-coding by node type (class = blue, interface = green, trait = purple, function = orange)                 | Must     | Legend visible in UI                                                 |
| REQ-044 | Breadcrumb navigation showing current drill-down path (e.g., System > src/Domain > UserService)               | Must     | Clickable segments to jump to any level                              |
| REQ-045 | Right-click context menu on nodes: "Show dependencies", "Show dependents", "Show blast radius", "Open in editor" | Should   | "Open in editor" uses `vscode://file/` URI scheme                    |
| REQ-046 | Keyboard shortcuts: `Escape` to go up one level, `/` to focus search, `R` to reset layout                    | Should   |                                                                      |
| REQ-047 | Responsive layout -- usable on 1280x720 minimum resolution                                                    | Must     |                                                                      |

### 3.5 Web UI Framework

| REQ-ID  | Requirement                                                                                  | Priority | Notes                                             |
|---------|----------------------------------------------------------------------------------------------|----------|---------------------------------------------------|
| REQ-048 | React + Vite + Tailwind CSS for UI framework                                                 | Must     | `@react-sigma/core` for Sigma.js integration      |
| REQ-049 | UI served by the MCP server process on a configurable port (default: `3000`)                  | Must     | Single process serves both MCP and web UI          |
| REQ-050 | Dark mode and light mode support                                                              | Should   | Respect system preference, toggle in UI            |
| REQ-051 | Detail panel (right sidebar) showing selected node properties, relationships, and metadata    | Must     | Includes: name, type, file path, LOC, lastAnalyzedAt, content hash, list of relationships |
| REQ-052 | Refresh button in UI toolbar that triggers incremental analysis and reloads graph              | Must     | Shows progress indicator during analysis           |

### 3.6 MCP Server & Claude Integration

| REQ-ID  | Requirement                                                                                  | Priority | Notes                                             |
|---------|----------------------------------------------------------------------------------------------|----------|---------------------------------------------------|
| REQ-053 | Implement MCP server using `@modelcontextprotocol/sdk`                                       | Must     | Transport: stdio for Claude Code                  |
| REQ-054 | MCP Tool: `get_node(name)` -- returns node details including type, file, relationships        | Must     |                                                   |
| REQ-055 | MCP Tool: `get_dependencies(name, direction, depth)` -- returns dependency tree               | Must     | direction: "incoming" or "outgoing", depth: 1-10  |
| REQ-056 | MCP Tool: `get_blast_radius(name, max_depth)` -- returns all transitively affected nodes      | Must     | Returns list with hop distance                    |
| REQ-057 | MCP Tool: `search_nodes(query, type?, limit?)` -- fuzzy search across all node names          | Must     | Uses graph index for name matching                |
| REQ-058 | MCP Tool: `semantic_search(query, limit?)` -- vector similarity search across code entities   | Must     | Uses stored embeddings, returns top-k with scores |
| REQ-059 | MCP Tool: `get_graph_summary()` -- returns high-level stats: node counts by type, edge counts, staleness stats, last refresh time | Must     |                                                   |
| REQ-060 | MCP Tool: `get_stale_nodes(limit?)` -- returns nodes whose content hash is outdated           | Must     | Helps Claude understand what might be inaccurate  |
| REQ-061 | MCP Tool: `get_level(level, parent?)` -- returns all nodes at a C4 level, optionally within a parent | Must     | level: 1-4, parent: node name                     |
| REQ-062 | MCP Tool: `refresh(scope?)` -- triggers incremental or full analysis                          | Should   | scope: "full" or "incremental" (default)          |
| REQ-063 | MCP Resource: `sniffo://graph/summary` -- exposes graph summary as MCP resource       | Should   | For Claude to read as context                     |

### 3.7 CLI

| REQ-ID  | Requirement                                                                                  | Priority | Notes                                             |
|---------|----------------------------------------------------------------------------------------------|----------|---------------------------------------------------|
| REQ-064 | CLI entry point: `sniffo` (or `npx llm-project-sniffo`)                      | Must     | Built with Commander.js                           |
| REQ-065 | `sniffo init` -- initializes `.sniffo/` directory, registers pre-commit hook, runs first full analysis | Must     | Interactive: confirms hook registration            |
| REQ-066 | `sniffo refresh [--full]` -- runs incremental (default) or full analysis              | Must     |                                                   |
| REQ-067 | `sniffo serve [--port <port>]` -- starts web UI server                                | Must     | Default port: 3000                                |
| REQ-068 | `sniffo status` -- prints graph stats, last refresh time, stale node count            | Must     |                                                   |
| REQ-069 | `sniffo query <cypher>` -- runs raw Cypher query against the graph DB                  | Should   | For power users and debugging                     |
| REQ-070 | `sniffo hook install` / `sniffo hook uninstall` -- manages pre-commit hook     | Must     | Idempotent: safe to run multiple times            |
| REQ-071 | `sniffo export [--level <1-4>] [--format json]` -- exports graph data                 | Should   |                                                   |
| REQ-072 | All CLI commands provide `--verbose` flag for debug output                                     | Should   |                                                   |

---

## 4. User Stories

### US-001: Initial Setup

**As a** developer cloning a PHP project, **I want to** initialize the sniffo with a single command, **so that** I get a complete knowledge graph without manual configuration.

**Acceptance Criteria:**
1. Running `sniffo init` in a project root with PHP files creates `.sniffo/` directory.
2. The `.sniffo/` directory contains: `graph.db/` (KuzuDB data), `config.json` (settings), `analysis.log` (last run log).
3. A pre-commit hook is registered (user prompted to confirm).
4. Full analysis completes and populates the graph.
5. `sniffo status` shows node/edge counts > 0.
6. If `.sniffo/` already exists, the command asks before overwriting.

### US-002: Automatic Graph Update on Commit

**As a** developer committing code changes, **I want** the knowledge graph to automatically update for changed files, **so that** the graph stays accurate without manual intervention.

**Acceptance Criteria:**
1. After `git commit`, the pre-commit hook runs `sniffo refresh --staged`.
2. Only files in the staging area are re-analyzed.
3. Changed nodes get updated `lastAnalyzedAt` timestamps.
4. Nodes depending on changed files are marked `needsReverify`.
5. The hook completes in under 10 seconds for 1-20 changed PHP files.
6. If the hook exceeds 30 seconds, it logs a warning and exits successfully (does not block commit).
7. If `sniffo` is not installed, the hook exits silently with code 0.

### US-003: Multi-Level Graph Navigation

**As a** tech lead, **I want to** see my system at a high level and drill down into specific areas, **so that** I can understand both the big picture and the details.

**Acceptance Criteria:**
1. Opening the web UI shows L1 (System) view with the project as a central node and external dependencies around it.
2. Clicking the project node drills into L2 (Container) view showing top-level modules.
3. Clicking a module drills into L3 (Component) view showing classes/interfaces/traits.
4. Clicking a class drills into L4 (Code) view showing methods and properties.
5. A breadcrumb trail at the top reflects the current path (e.g., `System > src/Domain > UserService`).
6. Clicking any breadcrumb segment navigates to that level.
7. Pressing `Escape` navigates up one level.

### US-004: Staleness Awareness

**As a** developer, **I want to** see which parts of the graph might be outdated, **so that** I can decide whether to trust the information or trigger a refresh.

**Acceptance Criteria:**
1. Nodes with a content hash mismatch (file changed since last analysis) render with dashed borders and muted opacity.
2. Nodes marked `needsReverify` (dependency changed) render with an amber border.
3. Hovering over any node shows a tooltip with `Last analyzed: <timestamp>`.
4. The UI header displays the global last refresh timestamp.
5. A badge in the toolbar shows the count of stale + needsReverify nodes (e.g., "12 stale").

### US-005: Blast Radius Analysis

**As a** developer planning a refactor, **I want to** select a class and see everything that would be affected if I change it, **so that** I can estimate the risk and scope of the change.

**Acceptance Criteria:**
1. Right-clicking a node and selecting "Show blast radius" highlights all transitively dependent nodes.
2. Nodes are color-coded by hop distance: 1-hop = red, 2-hop = orange, 3+ = yellow.
3. The detail panel lists all affected nodes grouped by hop distance with counts.
4. The blast radius respects the current C4 level (e.g., at L3, it shows component-level blast radius).
5. Clicking "Clear blast radius" restores normal coloring.

### US-006: AI-Assisted Code Understanding via MCP

**As a** developer using Claude Code, **I want** Claude to query the knowledge graph for structural information, **so that** Claude's responses are grounded in accurate project architecture.

**Acceptance Criteria:**
1. Running `sniffo` as an MCP server (configured in `.claude/settings.json`) exposes all MCP tools.
2. Claude can call `get_dependencies("UserService", "outgoing", 3)` and receive a structured dependency tree.
3. Claude can call `semantic_search("authentication logic")` and receive the top-10 most relevant code entities.
4. Claude can call `get_stale_nodes()` and warn the user about potentially outdated information.
5. All MCP tool responses include `lastAnalyzedAt` timestamps so Claude can caveat stale data.

### US-007: Search and Filter

**As a** developer exploring a large codebase, **I want to** search for specific classes or filter by type, **so that** I can quickly find what I'm looking for in the graph.

**Acceptance Criteria:**
1. Typing in the search bar filters visible nodes by name with fuzzy matching (e.g., "UsrSrv" matches "UserService").
2. Pressing `Enter` on a search result centers and highlights the node.
3. The filter panel allows toggling visibility by node type (class, interface, trait, function).
4. Filters can be combined (e.g., show only interfaces in the `Domain` namespace).
5. Active filters are shown as removable chips below the search bar.
6. Search results appear within 500ms of typing.

### US-008: Manual Refresh from UI

**As a** developer, **I want to** trigger a graph refresh from the web UI, **so that** I can update the graph without leaving the browser.

**Acceptance Criteria:**
1. A "Refresh" button is visible in the UI toolbar.
2. Clicking it triggers an incremental analysis (changed files only).
3. A progress indicator shows analysis status (e.g., "Analyzing 5/12 files...").
4. The graph updates in-place after analysis completes -- no full page reload.
5. The "Last refreshed" timestamp updates to the current time.
6. If no files changed, the UI displays "Already up to date".

---

## 5. Non-Functional Requirements

### 5.1 Performance

| NFR-ID  | Requirement                                                                                   | Threshold                                       |
|---------|-----------------------------------------------------------------------------------------------|--------------------------------------------------|
| NFR-001 | Initial full analysis of a 100k LOC PHP project                                                | < 60 seconds                                    |
| NFR-002 | Incremental analysis of 1-20 changed files                                                     | < 10 seconds                                    |
| NFR-003 | Pre-commit hook overhead                                                                       | < 10 seconds for typical commits                |
| NFR-004 | Graph rendering of 5,000 nodes at L3 level                                                     | 60 FPS with WebGL, < 2 second initial layout    |
| NFR-005 | MCP tool response time                                                                         | < 500ms for any single tool call                |
| NFR-006 | Semantic search query response                                                                  | < 1 second for top-10 results                   |
| NFR-007 | UI search/filter response                                                                       | < 500ms from keystroke to visual update          |
| NFR-008 | First embedding model load                                                                      | < 15 seconds (one-time, cached thereafter)       |
| NFR-009 | Memory usage during analysis                                                                    | < 2 GB for 100k LOC project                     |
| NFR-010 | Web UI initial load time                                                                        | < 3 seconds on localhost                         |

### 5.2 Scalability

| NFR-ID  | Requirement                                                                                   | Threshold                                       |
|---------|-----------------------------------------------------------------------------------------------|--------------------------------------------------|
| NFR-011 | Support codebases up to 500k LOC without degradation                                           | Analysis < 5 minutes, graph renders < 5 seconds |
| NFR-012 | Graph database storage size                                                                     | < 500 MB for 500k LOC project                   |
| NFR-013 | Embedding storage size                                                                          | < 200 MB for 500k LOC project                   |

### 5.3 Reliability

| NFR-ID  | Requirement                                                                                   | Threshold                                       |
|---------|-----------------------------------------------------------------------------------------------|--------------------------------------------------|
| NFR-014 | Analysis failure on a single file must not abort the entire pipeline                           | Skip file, log error, continue                  |
| NFR-015 | Corrupted graph database must be recoverable                                                   | `sniffo refresh --full` rebuilds from scratch |
| NFR-016 | Pre-commit hook must never block a commit                                                       | Exit code 0 on any error, log failure            |

### 5.4 Security

| NFR-ID  | Requirement                                                                                   | Notes                                            |
|---------|-----------------------------------------------------------------------------------------------|--------------------------------------------------|
| NFR-017 | No source code leaves the developer's machine                                                  | All processing local, no network calls           |
| NFR-018 | Web UI binds to `localhost` only by default                                                    | Optional `--host` flag for network access        |
| NFR-019 | No secrets/credentials should be indexed or stored in the graph                                 | Exclude `.env`, `*.pem`, `*.key` files by default |
| NFR-020 | `.sniffo/` should be added to `.gitignore`                                              | Suggested during `sniffo init`           |

### 5.5 Compatibility

| NFR-ID  | Requirement                                                                                   | Notes                                            |
|---------|-----------------------------------------------------------------------------------------------|--------------------------------------------------|
| NFR-021 | Node.js >= 20 LTS                                                                              | Required for `transformers.js` compatibility     |
| NFR-022 | macOS, Linux support                                                                            | Windows: best-effort, not blocking v1.0          |
| NFR-023 | Git >= 2.30                                                                                     | For pre-commit hook integration                  |

---

## 6. Success Metrics

| Metric ID | Metric                                                  | Target (v1.0, 3 months post-launch)        | How Measured                                               |
|-----------|---------------------------------------------------------|---------------------------------------------|------------------------------------------------------------|
| M-1       | Graph accuracy after auto-update                        | 0 stale nodes within 5 seconds of commit    | Automated test: commit change, verify hash match           |
| M-2       | Cascade invalidation correctness                         | 100% of direct dependents marked            | Test suite with known dependency chains                    |
| M-3       | Time to first insight (new developer)                    | < 5 minutes from `init` to navigating graph | User testing with unfamiliar codebases                     |
| M-4       | MCP tool utilization                                     | Claude uses tools in > 50% of code questions | Measure via MCP server request logs                        |
| M-5       | Pre-commit hook reliability                              | 0 blocked commits due to hook failures      | Monitor hook exit codes in CI                              |
| M-6       | Rendering performance                                    | 60 FPS at 5,000 nodes                       | Automated browser performance test                         |

---

## 7. Out of Scope (v1.0)

| Item                                          | Rationale                                                               |
|-----------------------------------------------|-------------------------------------------------------------------------|
| Languages other than PHP                      | Architecture supports it (REQ-005), but only PHP parser ships in v1.0   |
| Remote/cloud storage of graph data            | Local-first is a core principle; cloud sync is a future consideration   |
| Real-time file watching                       | Explicitly excluded per user requirement (REQ-025); hook-based updates only |
| Multi-project graphs                          | One `.sniffo/` per project root; cross-project analysis not in scope |
| Git history analysis (blame, evolution)        | Future feature; v1.0 analyzes current state only                        |
| Automatic PR/MR integration                    | No GitHub/GitLab API integration in v1.0                                |
| Custom graph queries in the UI                 | CLI supports raw Cypher (REQ-069); UI gets predefined views only        |
| Embedding model selection                      | `all-MiniLM-L6-v2` is hardcoded; model switching is a future feature    |
| Windows support                                | Best-effort only; not tested or guaranteed in v1.0                      |
| Authentication/authorization for web UI        | Localhost-only by default; auth needed only if network-exposed (future) |

---

## 8. Risks & Mitigations

| Risk ID  | Risk                                                                                           | Likelihood | Impact | Mitigation                                                                                                  |
|----------|------------------------------------------------------------------------------------------------|------------|--------|-------------------------------------------------------------------------------------------------------------|
| RISK-001 | **KuzuDB archived (Oct 2025)**: No new releases or bug fixes. Storage format never stabilized. | High       | High   | Pin to v0.11.3 (last stable). Abstract DB layer behind `GraphStore` interface to enable future migration to DuckPGQ or a community fork (e.g., Vela-Engineering/kuzu). Include `sniffo export` from day one for data portability. |
| RISK-002 | **Tree-sitter PHP grammar gaps**: Certain PHP 8.3+ syntax may not be fully supported.          | Medium     | Medium | Validate against a corpus of modern PHP projects during development. Fall back to partial parsing -- a node with incomplete relationships is better than a missing node. Monitor `tree-sitter-php` releases. |
| RISK-003 | **Embedding model size and load time**: `all-MiniLM-L6-v2` ONNX model is ~80MB, first load ~15s. | Medium     | Low    | Cache model in `.sniffo/models/`. Lazy-load embeddings -- graph works without embeddings, semantic search just returns empty. Show progress indicator on first load. |
| RISK-004 | **Pre-commit hook blocking developer workflow**: Slow analysis could frustrate developers.       | Medium     | High   | Hard timeout: 30 seconds max, then exit 0. Only analyze staged PHP files. Provide `sniffo hook uninstall` escape hatch. Log performance metrics for optimization. |
| RISK-005 | **Graph becomes too large to render at lower C4 levels**: L4 view of a large module could have thousands of nodes. | Medium     | Medium | Implement pagination/virtualization at L4. Cap visible nodes at 2,000 with "show more" option. ForceAtlas2 handles large graphs well with WebGL, but UI controls (filter, search) become critical. |
| RISK-006 | **Clustering accuracy**: Auto-detected module boundaries may not match developer's mental model. | Medium     | Medium | Use directory structure as primary signal (most reliable), namespace as secondary. Allow manual overrides via `.sniffo/config.json` cluster mappings. Show cluster boundaries as suggestions, not facts. |
| RISK-007 | **MCP protocol changes**: MCP is evolving rapidly; SDK breaking changes possible.               | Low        | Medium | Pin `@modelcontextprotocol/sdk` version. Monitor MCP changelog. Keep MCP layer thin -- business logic in service layer, MCP is just a transport adapter. |
| RISK-008 | **Content hash false negatives**: Formatting-only changes (whitespace, comments) trigger re-analysis unnecessarily. | Low        | Low    | Hash the full file content (not AST). Accept some unnecessary re-analysis -- correctness over efficiency. Future optimization: AST-hash for smarter diffing. |

---

## Appendix A: Directory Structure

```
<project-root>/
  .sniffo/
    config.json              # User configuration (excluded paths, port, cluster overrides)
    graph.db/                # KuzuDB database files
    models/                  # Cached ONNX model files
    analysis.log             # Last analysis run log
```

## Appendix B: Graph Schema (KuzuDB Cypher)

```cypher
-- Node tables
CREATE NODE TABLE System(name STRING, lastAnalyzedAt STRING, PRIMARY KEY(name));
CREATE NODE TABLE Container(name STRING, path STRING, lastAnalyzedAt STRING, PRIMARY KEY(name));
CREATE NODE TABLE Component(name STRING, type STRING, namespace STRING, filePath STRING, contentHash STRING, loc INT64, lastAnalyzedAt STRING, stale BOOLEAN, needsReverify BOOLEAN, embedding FLOAT[384], PRIMARY KEY(name));
CREATE NODE TABLE CodeEntity(name STRING, type STRING, parentComponent STRING, filePath STRING, lineStart INT64, lineEnd INT64, signature STRING, contentHash STRING, lastAnalyzedAt STRING, stale BOOLEAN, needsReverify BOOLEAN, embedding FLOAT[384], PRIMARY KEY(name));
CREATE NODE TABLE File(path STRING, contentHash STRING, language STRING, loc INT64, lastAnalyzedAt STRING, PRIMARY KEY(path));

-- Relationship tables
CREATE REL TABLE CONTAINS(FROM System TO Container);
CREATE REL TABLE CONTAINS(FROM Container TO Component);
CREATE REL TABLE CONTAINS(FROM Component TO CodeEntity);
CREATE REL TABLE DEPENDS_ON(FROM Component TO Component, type STRING, lastAnalyzedAt STRING);
CREATE REL TABLE CALLS(FROM CodeEntity TO CodeEntity, lastAnalyzedAt STRING);
CREATE REL TABLE EXTENDS(FROM Component TO Component, lastAnalyzedAt STRING);
CREATE REL TABLE IMPLEMENTS(FROM Component TO Component, lastAnalyzedAt STRING);
CREATE REL TABLE USES_TRAIT(FROM Component TO Component, lastAnalyzedAt STRING);
CREATE REL TABLE IMPORTS(FROM File TO File, lastAnalyzedAt STRING);
CREATE REL TABLE DEFINED_IN(FROM Component TO File);
CREATE REL TABLE DEFINED_IN(FROM CodeEntity TO File);
```

## Appendix C: MCP Server Configuration

```json
{
  "mcpServers": {
    "sniffo": {
      "command": "npx",
      "args": ["llm-project-sniffo", "mcp"],
      "env": {
        "PROJECT_ROOT": "${workspaceFolder}"
      }
    }
  }
}
```

## Appendix D: Tech Stack Summary

| Component             | Technology                                          | Version / Notes                              |
|-----------------------|-----------------------------------------------------|----------------------------------------------|
| Language              | TypeScript                                          | Strict mode, ES2022 target                   |
| Runtime               | Node.js                                             | >= 20 LTS                                    |
| AST Parsing           | tree-sitter + tree-sitter-php                       | Via tree-sitter-language-pack                 |
| Graph Database        | KuzuDB                                              | v0.11.3 (archived, pinned)                   |
| Vector Embeddings     | transformers.js + all-MiniLM-L6-v2                  | 384-dim, ONNX runtime                        |
| Graph Visualization   | Sigma.js + Graphology                               | @react-sigma/core, ForceAtlas2 layout        |
| Web UI                | React + Vite + Tailwind CSS                         | SPA, localhost-only                          |
| MCP Integration       | @modelcontextprotocol/sdk                           | stdio transport                              |
| CLI                   | Commander.js                                        |                                              |
| Build                 | tsup or Vite (library mode)                         |                                              |

---

*End of PRD.*
