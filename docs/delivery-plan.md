# llmProjectContextualizer -- Delivery Plan

**Project:** Codebase Knowledge Graph Tool (Claude Code Plugin + Web UI)
**Date:** 2026-03-22
**Author:** Delivery Manager (PRINCE2)
**Developer:** Solo (PHP/Symfony background, learning TypeScript tooling)

---

## Executive Summary

This plan delivers the llmProjectContextualizer in 7 phases, each producing a testable increment. The tool parses codebases into a knowledge graph, stores relationships in a graph database, integrates with Claude Code via MCP, and provides an interactive web UI for exploration.

**Critical finding from research:** KuzuDB was archived in October 2025. The plan accounts for this by recommending a storage spike upfront and using an abstraction layer to decouple from any specific graph database vendor. FalkorDB Lite (zero-config embedded, TypeScript-native) and LadybugDB (KuzuDB successor, MIT license) are the leading replacement candidates.

---

## Phase Breakdown

### Phase 1: Foundation

**Objective:** Establish the monorepo, core type system, parser interface, and a working PHP parser that can extract basic structural elements from a single file.

**Deliverables:**
- Monorepo scaffolding (pnpm workspaces, TypeScript project references, shared tsconfig)
- `@lpc/core` package: graph schema types (Node, Edge, GraphDocument), parser interface, relationship type enums
- `@lpc/analyzer` package: Tree-sitter PHP integration, single-file parsing producing AST-derived graph nodes
- Parsed output for: classes, interfaces, traits, enums, functions, methods, properties, constants
- Relationship extraction within a single file: `CONTAINS`, `IMPLEMENTS`, `EXTENDS`, `USES_TRAIT`, `HAS_METHOD`, `HAS_PROPERTY`
- Unit tests for each node/edge type against representative PHP fixtures
- CI pipeline (GitHub Actions): lint, type-check, test

**Dependencies:** None (first phase)

**Key Risks:**
- Tree-sitter PHP grammar may not cover all PHP 8.3+ syntax (enums, fibers, readonly classes)
- Monorepo tooling decisions could create friction later (pnpm vs turborepo vs nx)

**Definition of Done:**
- Given a PHP file with classes, interfaces, traits, and enums, the parser produces a correct graph document with all declared symbols and intra-file relationships
- All tests pass, zero type errors, linter clean
- A developer can clone, install, and run tests in under 2 minutes

**Complexity:** L

---

### Phase 2: Analysis Pipeline

**Objective:** Build multi-pass analysis that resolves cross-file relationships, namespace resolution, and dependency injection patterns. Store the full graph in a persistent graph database.

**Deliverables:**
- `@lpc/analyzer` extension: multi-pass pipeline (Parse -> Resolve -> Link -> Enrich)
- Pass 1 (Parse): parallel single-file parsing from Phase 1
- Pass 2 (Resolve): namespace resolution, use-statement tracking, FQCN mapping
- Pass 3 (Link): cross-file relationships: `CALLS`, `INSTANTIATES`, `INJECTS`, `DEPENDS_ON`, `IMPORTS`
- Pass 4 (Enrich): method parameter types, return types, complexity metrics
- `@lpc/storage` package: graph DB abstraction interface, concrete adapter (FalkorDB Lite or LadybugDB -- based on spike outcome)
- Cypher-based schema creation and population
- Integration tests: analyze a multi-file PHP project, verify cross-file edges exist and are correct
- Accuracy test suite: a curated set of PHP patterns with expected graph output

**Dependencies:** Phase 1 (parser, core types)

**Key Risks:**
- Cross-file resolution accuracy for dynamic PHP patterns (magic methods, service containers)
- Graph DB adapter performance for medium-sized codebases (500+ files)
- Namespace aliasing edge cases (`use Foo as Bar`)

**Definition of Done:**
- A 50-file PHP project (Symfony controller/service/repository pattern) is analyzed and produces a graph with >= 90% accurate cross-file relationships
- Graph is persisted and queryable via Cypher
- Pipeline completes in under 30 seconds for 50 files

**Complexity:** XL

---

### Phase 3: Freshness System

**Objective:** Implement content hashing, incremental updates, cascade invalidation, and a git pre-commit hook so the graph stays current automatically.

**Deliverables:**
- Content hashing per file (SHA-256 of normalized AST, not raw content)
- Incremental update pipeline: only re-analyze changed files
- Cascade invalidation: when file A changes, re-resolve files that depend on A
- Staleness detection: query which nodes are potentially stale
- `@lpc/cli` package (minimal): `lpc update` command that runs incremental analysis
- Git pre-commit hook: runs `lpc update` on staged PHP files
- Hook installer: `lpc install-hook` command
- Performance test: incremental update of 5 changed files in a 500-file project completes in under 5 seconds

**Dependencies:** Phase 2 (full pipeline, storage)

**Key Risks:**
- Cascade invalidation may be too aggressive (re-analyzing too many files) or too conservative (missing stale edges)
- Pre-commit hook must be fast enough to not disrupt developer flow (< 5s for typical commits)
- Hook reliability across git versions and OS environments (macOS, Linux)

**Definition of Done:**
- Changing a single PHP file and running update only re-analyzes that file plus its direct dependents
- Pre-commit hook installs cleanly and runs on staged files
- Staleness query correctly identifies files needing re-analysis
- Hook adds < 5 seconds to commit time for a typical 1-5 file change

**Complexity:** L

---

### Phase 4: CLI and MCP Server

**Objective:** Deliver the full CLI toolkit and MCP server so Claude Code can query and navigate the knowledge graph.

**Deliverables:**
- `@lpc/cli` full commands:
  - `lpc init` -- initialize project config, create DB, install hook
  - `lpc analyze` -- full analysis from scratch
  - `lpc update` -- incremental update (from Phase 3)
  - `lpc status` -- show graph stats, staleness summary, last analysis time
  - `lpc serve` -- start HTTP API server for web UI
  - `lpc query <cypher>` -- ad-hoc Cypher query
- `@lpc/mcp` package: MCP server with tools:
  - `analyze_project` -- trigger full/incremental analysis
  - `query_graph` -- execute Cypher queries against the graph
  - `search_symbols` -- find nodes by name, type, or pattern
  - `get_context` -- retrieve a node with its relationships (N-hop neighborhood)
  - `get_blast_radius` -- show what depends on a given symbol
  - `check_freshness` -- report stale areas of the graph
- MCP server registration in Claude Code config
- Vector embeddings integration (transformers.js, all-MiniLM-L6-v2): embed node descriptions for semantic search
- `search_semantic` MCP tool: find related code by meaning, not just name

**Dependencies:** Phase 3 (freshness system, incremental update)

**Key Risks:**
- MCP protocol changes or Claude Code API evolution
- Vector embedding model download size and first-run latency
- Semantic search quality for code-oriented queries

**Definition of Done:**
- All CLI commands work end-to-end on a real PHP project
- Claude Code can call all MCP tools and receive correct responses
- Semantic search returns relevant results for natural language queries like "find the user authentication logic"
- `lpc init && lpc analyze && lpc status` works as a complete onboarding flow

**Complexity:** XL

---

### Phase 5: Web UI Core

**Objective:** Build a functional web interface that renders the knowledge graph and allows basic navigation.

**Deliverables:**
- `@lpc/http` package: Express/Fastify REST API
  - `GET /api/graph` -- full graph or filtered subgraph
  - `GET /api/nodes/:id` -- node details with relationships
  - `GET /api/search?q=` -- symbol search
  - `GET /api/stats` -- graph statistics
  - `GET /api/freshness` -- staleness report
- `@lpc/web` package: React + Sigma.js + Tailwind CSS
  - Force-directed graph layout (full project view)
  - Node coloring by type (class, interface, trait, function, etc.)
  - Edge coloring by relationship type
  - Click node to see details panel (properties, relationships, source location)
  - Click edge to see relationship details
  - Basic zoom, pan, selection
  - Node search with autocomplete
- `lpc serve` integration: serves both API and static web UI

**Dependencies:** Phase 4 (HTTP API, CLI serve command)

**Key Risks:**
- Sigma.js rendering performance for large graphs (1000+ nodes)
- Layout algorithm quality for code graphs (may need tuning)
- Bundle size and initial load time

**Definition of Done:**
- Web UI renders a 200-node graph smoothly (60fps pan/zoom)
- Clicking a node shows its properties and relationships
- Search finds nodes by name and navigates to them
- UI is usable without documentation (intuitive navigation)

**Complexity:** L

---

### Phase 6: Web UI Advanced

**Objective:** Add multi-level drill-down, advanced filtering, blast radius visualization, freshness indicators, and community detection for architectural grouping.

**Deliverables:**
- Multi-level graph navigation:
  - Level 1: Directory/namespace clusters (collapsed)
  - Level 2: Classes/interfaces within a namespace
  - Level 3: Methods/properties within a class
  - Drill-down and roll-up animations
- Community detection (Louvain or label propagation) for automatic module grouping
- Filter panel: filter by node type, relationship type, namespace, staleness
- Blast radius view: select a symbol, highlight everything that depends on it (direct + transitive)
- Freshness indicators: color-code nodes by staleness (green/yellow/red)
- Dependency cycle detection and highlighting
- Export: SVG snapshot, JSON graph data, Cypher dump
- Keyboard shortcuts for power users

**Dependencies:** Phase 5 (working web UI)

**Key Risks:**
- Multi-level rendering performance (collapsing/expanding clusters)
- Community detection quality on code graphs (may produce unintuitive groupings)
- UX complexity -- too many features may overwhelm

**Definition of Done:**
- Namespace-level view loads in under 2 seconds for a 500-file project
- Drilling into a namespace shows its classes; drilling into a class shows its methods
- Blast radius for a service class correctly shows all dependent controllers/commands
- Freshness colors match actual staleness state
- Cycle detection identifies at least one known circular dependency in a test project

**Complexity:** XL

---

### Phase 7: Polish and Extensibility

**Objective:** Performance optimization, second language parser (TypeScript), documentation, and packaging for distribution.

**Deliverables:**
- Performance optimization: profile and fix bottlenecks in analysis and rendering
- TypeScript/JavaScript parser using tree-sitter-typescript
- Parser plugin interface: documented API for adding new language parsers
- Configuration file (`.lpcrc.json`): exclude patterns, analysis depth, custom relationship rules
- Error handling hardening: graceful degradation for unparseable files
- npm package publishing setup
- User documentation: README, getting started guide, configuration reference
- Self-hosting milestone: the tool successfully analyzes its own codebase

**Dependencies:** Phase 6 (all features complete)

**Key Risks:**
- TypeScript parser complexity (generics, decorators, module resolution)
- Performance regressions during optimization
- npm publishing pipeline configuration

**Definition of Done:**
- Tool analyzes its own codebase and produces a correct, navigable graph
- TypeScript parser handles standard TS patterns (classes, interfaces, modules, decorators)
- Full analysis of a 1000-file project completes in under 2 minutes
- Web UI renders 1000-node graph at 30fps minimum
- Published to npm and installable via `npx @lpc/cli init`

**Complexity:** L

---

## Risk Register

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|-----------|--------|------------|
| R1 | **Graph DB vendor instability** -- KuzuDB is archived; replacement may also be immature | High | High | Storage abstraction layer from day 1. Spike both FalkorDB Lite and LadybugDB before committing. Keep adapter swappable. Consider pure SQLite + adjacency list as fallback. |
| R2 | **Tree-sitter PHP grammar gaps** -- PHP 8.3+ features (enums, fibers, readonly props, first-class callables) may not be in the grammar | Medium | High | Run grammar against a comprehensive PHP 8.3 fixture set in Spike S1. Maintain a "known gaps" list. Fall back to regex extraction for unsupported syntax. |
| R3 | **Cross-file resolution accuracy** -- Dynamic PHP patterns (magic methods, `__call`, service container injection, annotations) are hard to resolve statically | High | Medium | Start with explicit patterns only (constructor injection, use statements, type hints). Add heuristic layers incrementally. Track accuracy metrics per pattern type. Accept < 100% coverage with clear reporting of unresolved references. |
| R4 | **Sigma.js performance at scale** -- Graphs over 1000 nodes may be sluggish | Medium | Medium | Implement Level-of-Detail from Phase 6. Use namespace clustering to reduce visible nodes. Lazy-load detail levels. Profile early with synthetic large graphs. |
| R5 | **Pre-commit hook reliability** -- Different OS, shell, git versions, node versions | Medium | High | Test on macOS and Linux (Ubuntu). Use `husky` or similar established hook manager rather than raw shell scripts. Provide `--no-verify` escape hatch documentation. Add timeout safeguard (kill after 15s). |
| R6 | **MCP protocol evolution** -- Claude Code MCP spec may change | Low | Medium | Pin MCP SDK version. Wrap MCP interactions in a thin adapter. Monitor Anthropic changelog. |
| R7 | **Vector embedding first-run latency** -- Model download and warmup on first use | Medium | Low | Make embeddings optional (disabled by default). Download model during `lpc init` with progress indicator. Cache model locally. |
| R8 | **Solo developer burnout** -- XL phases may feel overwhelming | Medium | High | Each phase has clear deliverables. Phases are designed to be independently satisfying. No phase exceeds ~3 weeks of focused effort. Celebrate milestones. |
| R9 | **Cascade invalidation over-triggering** -- Changing a base class re-analyzes half the project | Medium | Medium | Limit cascade depth (configurable, default 2 hops). Track "affected but not changed" vs "structurally changed" distinction. Profile cascade breadth on real projects. |
| R10 | **TypeScript learning curve** -- Developer is primarily PHP; TS tooling, monorepo, and async patterns may slow progress | Medium | Medium | Start simple (no complex generics in Phase 1). Use strict TS config from day 1 to catch issues early. Lean on Claude Code for TS idiom guidance. |

---

## Quality Gates

### Per-Phase Gates

| Phase | Gate | Criteria |
|-------|------|----------|
| 1 | **Parser Accuracy** | >= 95% of PHP structural elements correctly extracted from 20 fixture files |
| 1 | **CI Green** | All tests pass, zero type errors, lint clean |
| 2 | **Cross-file Accuracy** | >= 90% of cross-file relationships correct on a 50-file Symfony project |
| 2 | **Pipeline Performance** | Full analysis of 50 files in < 30 seconds |
| 3 | **Incremental Speed** | Update of 5 changed files in < 5 seconds (500-file project) |
| 3 | **Hook Reliability** | Pre-commit hook succeeds on macOS and Linux in CI |
| 4 | **MCP Integration** | All 7 MCP tools callable from Claude Code with correct responses |
| 4 | **CLI Completeness** | All commands documented in `--help` and tested end-to-end |
| 5 | **Render Performance** | 200-node graph at 60fps (pan/zoom) |
| 5 | **UI Usability** | A fresh user can navigate to a specific class within 30 seconds |
| 6 | **Multi-level Navigation** | Drill-down from namespace to class to method works without lag |
| 6 | **Blast Radius Correctness** | Matches manual dependency analysis on 3 test scenarios |
| 7 | **Self-hosting** | Tool produces correct graph of its own codebase |
| 7 | **Scale Performance** | 1000-file project: analysis < 2 min, render >= 30fps |

### Accuracy Benchmarks

Accuracy is measured against a hand-curated "golden" graph for each test project:

- **Phase 1:** Single-file extraction accuracy >= 95%
- **Phase 2:** Cross-file relationship accuracy >= 90%
- **Phase 3:** Staleness detection precision >= 95%, recall >= 85%
- **Phase 4:** Semantic search relevance: top-5 results contain correct answer >= 80% of the time
- **Phase 7:** Multi-language (PHP + TS) accuracy >= 85% on mixed projects

### Performance Thresholds

| Metric | Threshold | Measured At |
|--------|-----------|-------------|
| Full analysis (50 files) | < 30s | Phase 2 |
| Full analysis (500 files) | < 3 min | Phase 3 |
| Full analysis (1000 files) | < 2 min (optimized) | Phase 7 |
| Incremental update (5 files) | < 5s | Phase 3 |
| Pre-commit hook (typical commit) | < 5s | Phase 3 |
| Graph render (200 nodes) | 60fps | Phase 5 |
| Graph render (1000 nodes) | 30fps | Phase 7 |
| Semantic search query | < 500ms | Phase 4 |
| MCP tool response | < 2s | Phase 4 |

---

## Milestone Summary

| Milestone | Phase | Deliverable | Significance |
|-----------|-------|-------------|--------------|
| **M1: First Parse** | 1 | PHP file in, graph document out | Proof of concept -- core tech works |
| **M2: First Graph** | 2 | Multi-file PHP project stored as queryable graph | The knowledge graph exists and is correct |
| **M3: Living Graph** | 3 | Graph auto-updates on commit | The #1 priority (freshness) is addressed |
| **M4: Claude Sees the Graph** | 4 | Claude Code can query the graph via MCP | The primary integration point works |
| **M5: Human Sees the Graph** | 5 | Web UI renders navigable graph | Visual exploration is possible |
| **M6: Deep Exploration** | 6 | Multi-level navigation, blast radius, freshness colors | Full analytical power available |
| **M7: Self-Hosting** | 7 | Tool analyzes its own codebase correctly | The tool is mature and publishable |

**Self-hosting checkpoint:** The tool becomes self-hosting at Phase 7, but a partial self-hosting test should be attempted at Phase 4 (CLI + MCP can analyze and query the tool's own TypeScript source, even without a TS parser, by treating .ts files as text nodes with basic relationship extraction).

---

## Technical Spike List

Spikes should be completed before or during Phase 1. Each spike has a time-box and a decision to make.

| ID | Question | Time-box | Decision Required | Phase |
|----|----------|----------|-------------------|-------|
| **S1** | **Tree-sitter PHP grammar completeness:** Does `tree-sitter-php` handle PHP 8.3 enums, readonly classes, intersection types, first-class callables, fibers? | 1 day | Proceed with tree-sitter vs. use php-parser (native PHP) via subprocess vs. build custom grammar extensions | Pre-Phase 1 |
| **S2** | **Graph DB selection:** Compare FalkorDB Lite vs. LadybugDB vs. SQLite+adjacency-list. Evaluate: Node.js binding quality, Cypher support, embedded mode, performance on 1000-node graphs, active maintenance status. | 2 days | Choose primary graph DB adapter | Pre-Phase 2 |
| **S3** | **Sigma.js multi-level rendering:** Can Sigma.js natively support collapsible clusters? Or do we need a custom layer (e.g., pre-computing cluster layouts, swapping graph data on drill-down)? Evaluate `graphology` layout algorithms for code graphs. | 1 day | Sigma.js cluster approach: native vs. virtual re-render vs. alternative library | Pre-Phase 5 |
| **S4** | **MCP SDK stability:** Test the `@modelcontextprotocol/sdk` package. Verify: tool registration, stdio transport, resource exposure, error handling. Build a minimal "hello world" MCP server and connect it to Claude Code. | 0.5 day | Confirm MCP SDK is production-ready for our use case | Pre-Phase 4 |
| **S5** | **Transformers.js embedding performance:** Measure time to embed 1000 code snippets with `all-MiniLM-L6-v2`. Evaluate model download size, memory usage, and whether WebGPU acceleration works in Node.js. Test v4 preview if stable. | 0.5 day | Use transformers.js vs. external embedding service vs. skip embeddings | Pre-Phase 4 |
| **S6** | **Cross-file resolution strategy for Symfony:** How to resolve constructor injection (autowiring), annotations/attributes (`#[Route]`, `#[AsCommand]`), and service container references without running PHP? | 1 day | Define resolution heuristics and accepted accuracy ceiling for dynamic patterns | Pre-Phase 2 |
| **S7** | **Monorepo tooling:** Compare pnpm workspaces (simple) vs. Turborepo (caching) vs. Nx (full orchestration). For a solo developer, what is the simplest setup that supports TypeScript project references and shared configs? | 0.5 day | Choose monorepo tool | Pre-Phase 1 |

---

## Phase Dependency Graph

```
Phase 1: Foundation
    |
    v
Phase 2: Analysis Pipeline
    |
    v
Phase 3: Freshness System
    |
    v
Phase 4: CLI & MCP Server
    |
    +-------v-----------+
    |                   |
Phase 5: Web UI Core    |
    |                   |
    v                   |
Phase 6: Web UI Adv.    |
    |                   |
    +-------+-----------+
            |
            v
    Phase 7: Polish
```

Phases 5-6 (Web UI) and Phase 4 (MCP) can partially overlap since the HTTP API from Phase 4 feeds Phase 5. However, Phase 5 should not start until Phase 4's HTTP API endpoints are stable.

---

## Recommendations

1. **Do the spikes first.** S1 (tree-sitter PHP) and S2 (graph DB) are the highest-risk technical decisions. Spending 3-4 days on spikes before Phase 1 will prevent costly pivots later.

2. **Ship the MCP server before the web UI.** As a Claude Code plugin, the MCP integration (Phase 4) delivers the most value to the developer workflow. The web UI is complementary, not primary.

3. **Track accuracy obsessively.** Maintain a "golden" test project with hand-verified expected graph output. Run accuracy tests in CI from Phase 2 onward. This is the project's competitive moat.

4. **Keep the storage layer swappable.** Given KuzuDB's fate, the graph DB market for embedded solutions is volatile. A clean interface boundary protects against future disruptions.

5. **Avoid premature optimization.** Performance thresholds are defined but should not drive architecture until Phase 7. Correct first, fast second.

---

## Appendix: Research Findings

### KuzuDB Status (Critical)
KuzuDB was archived on October 10, 2025. The project is no longer actively maintained. Recommended alternatives:
- **LadybugDB:** Direct fork/successor, MIT license, maintains Cypher compatibility
- **FalkorDB Lite:** Zero-config embedded graph for Node.js/TypeScript, actively maintained
- **SQLite + custom graph layer:** Maximum control, zero vendor risk, but more implementation work

### Tree-sitter PHP
The `tree-sitter-php` grammar is community-maintained under the tree-sitter GitHub organization. PHP 8.x support varies -- spike S1 is essential to verify coverage of modern PHP features.

### Sigma.js
Version 2 uses WebGL rendering and handles thousands of nodes. Multi-level/cluster rendering is not built-in but achievable via `graphology` graph manipulation (collapsing nodes into meta-nodes). The approach requires custom implementation.

### Transformers.js
Version 4 (preview, February 2026) adds WebGPU acceleration in Node.js with ~4x speedup for BERT-based embedding models. The `all-MiniLM-L6-v2` model produces 384-dimension vectors suitable for code similarity search.

### MCP SDK
The `@modelcontextprotocol/sdk` package supports stdio transport (required for Claude Code), tool registration, and resource exposure. The protocol is stable as of early 2026.

Sources:
- [KuzuDB Node.js API](https://docs.kuzudb.com/client-apis/nodejs/)
- [KuzuDB Archived -- The Register](https://www.theregister.com/2025/10/14/kuzudb_abandoned/)
- [FalkorDB Lite TypeScript](https://github.com/FalkorDB/falkordblite-ts)
- [LadybugDB](https://ladybugdb.com/)
- [Tree-sitter PHP Grammar](https://github.com/tree-sitter/tree-sitter-php)
- [Sigma.js](https://www.sigmajs.org/)
- [Transformers.js v4 Preview](https://huggingface.co/blog/transformersjs-v4)
- [Claude Code MCP Docs](https://code.claude.com/docs/en/mcp)
- [MCP Server TypeScript Guide](https://workos.com/blog/getting-started-with-claude-desktop-and-custom-mcp-servers-using-the-typescript-sdk)
