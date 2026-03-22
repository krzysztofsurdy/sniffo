# Competitive Landscape: Codebase Knowledge Graph & Visualization Tools

Research date: 2026-03-22

---

## 1. Sourcetrail (Archived)

- **URL:** https://github.com/CoatiSoftware/Sourcetrail
- **What it does:** Interactive source code explorer with graph-based navigation. Parses code, builds a searchable index, and lets you visually navigate classes, functions, call hierarchies, and inheritance chains.
- **Tech stack:** C++, Qt (desktop app)
- **Visualization:** Custom graph UI with interactive nodes for classes/functions/files, breadcrumb navigation, split view with source code panel
- **Code analysis:** Custom parsers + Clang (C/C++), JavaParser (Java), Python AST. Deep semantic analysis.
- **Languages:** C, C++, Java, Python
- **Data storage:** Custom SQLite-based index database
- **Stars:** ~16,400
- **Strengths:** Gold standard UX for code exploration; deep semantic understanding; bidirectional code-graph linking; the original inspiration for many tools in this space
- **Weaknesses:** Archived since 2021; limited language support; desktop-only (no web UI); no AI/LLM integration; no dependency/architecture-level views
- **Fork:** NumbatUI (https://github.com/quarkslab/NumbatUI) -- Quarkslab fork, WIP/unstable

---

## 2. GitNexus

- **URL:** https://github.com/abhigyanpatwari/GitNexus
- **What it does:** Zero-server code intelligence engine. Drop a GitHub URL or ZIP, get an interactive knowledge graph with a Graph RAG agent. Also provides an MCP server for AI editor integration.
- **Tech stack:** TypeScript, WebAssembly (Tree-sitter via WASM), KuzuDB (WASM), React, D3.js
- **Visualization:** Force-directed graph in the browser; interactive nodes for files, classes, functions
- **Code analysis:** Tree-sitter AST parsing via WebAssembly -- runs entirely client-side
- **Languages:** Multi-language via Tree-sitter grammars (JS, TS, Python, Java, Go, Rust, etc.)
- **Data storage:** KuzuDB in-browser (WASM), no server needed
- **Stars:** ~3,800 (many forks circulating)
- **Strengths:** Fully client-side (privacy-first); MCP server for Claude Code/Cursor/Windsurf; Graph RAG agent built in; blast radius analysis; good developer experience
- **Weaknesses:** Browser-based limitations on large repos; newer project, less battle-tested; visualization could be richer; limited deep semantic analysis (Tree-sitter = syntax only, not types)

---

## 3. Axon

- **URL:** https://github.com/harshkedia177/axon
- **What it does:** Graph-powered code intelligence engine that indexes codebases into a knowledge graph, exposed via MCP tools for AI agents and CLI.
- **Tech stack:** Python, KuzuDB (default) or Neo4j (optional), Tree-sitter
- **Visualization:** Interactive web dashboard with force-directed graph
- **Code analysis:** 12-phase pipeline: walk, structure, parse, imports, calls, heritage, types, communities, processes, dead code, coupling, embeddings
- **Languages:** Python (deep), TypeScript (structural + type analysis)
- **Data storage:** KuzuDB (graph) + BM25 full-text + HNSW vector embeddings
- **Stars:** ~1,200
- **Strengths:** Deepest analysis pipeline of any open-source tool (12 phases); community detection (Louvain); dead code detection; coupling analysis; vector embeddings for semantic search; MCP integration
- **Weaknesses:** Limited language support (Python + TS only); newer project; KuzuDB is less mainstream; requires local setup

---

## 4. codebase-memory-mcp (DeusData)

- **URL:** https://github.com/DeusData/codebase-memory-mcp
- **What it does:** High-performance MCP server that indexes codebases into a persistent knowledge graph. Single static binary, zero dependencies.
- **Tech stack:** Rust (compiled binary), Tree-sitter (vendored grammars), built-in graph engine
- **Visualization:** Optional 3D interactive UI at localhost:9749
- **Code analysis:** Tree-sitter parsing with 14 analysis tools (search, trace, architecture, impact, dead code, cross-service HTTP linking)
- **Languages:** 64 languages (vendored Tree-sitter grammars compiled into binary)
- **Data storage:** Embedded persistent graph (no external DB needed)
- **Stars:** ~2,500
- **Strengths:** Blazing fast (avg repo indexed in ms); 64 languages; single binary with zero deps; 120x fewer tokens vs file-by-file search; Cypher query support; ADR management; cross-service HTTP link tracing
- **Weaknesses:** Closed-source binary (not fully inspectable); visualization is secondary (3D UI is basic); Rust codebase harder to contribute to; newer project

---

## 5. FalkorDB Code Graph

- **URL:** https://github.com/FalkorDB/code-graph
- **What it does:** Analyzes GitHub repos and builds a knowledge graph of files, functions, and classes. React frontend + Python backend.
- **Tech stack:** Python (FastAPI backend), React (frontend), FalkorDB (graph database, GraphBLAS-based)
- **Visualization:** Interactive web-based graph explorer; node types for files/functions/classes
- **Code analysis:** Custom parsers for supported languages
- **Languages:** Python, Java, C#
- **Data storage:** FalkorDB (Redis-compatible graph DB using GraphBLAS for sparse matrix operations)
- **Stars:** ~500
- **Strengths:** Built by the FalkorDB team (optimized graph DB); good performance on large graphs; GraphRAG-SDK integration; live hosted demo at code-graph.falkordb.com
- **Weaknesses:** Limited language support (3 languages); primarily a demo for FalkorDB; not deeply featured as a standalone tool; requires FalkorDB server

---

## 6. CodeGraph (ChrisRoyse)

- **URL:** https://github.com/ChrisRoyse/CodeGraph
- **What it does:** Static analysis engine that transforms codebases into a queryable Neo4j graph database. Creates a "digital twin" of the software ecosystem.
- **Tech stack:** TypeScript, Neo4j, MCP integration
- **Visualization:** Neo4j browser visualization; queryable via Cypher
- **Code analysis:** Two-pass analysis -- AST building per file, then cross-file relationship resolution
- **Languages:** Multiple (JS, TS, Python, and more)
- **Data storage:** Neo4j graph database
- **Stars:** ~300
- **Strengths:** Deep cross-file analysis; natural language to Cypher translation; MCP integration for AI assistants; extracts classes, interfaces, functions, methods, variables, parameters, SQL tables, etc.
- **Weaknesses:** Requires Neo4j setup; smaller community; visualization depends on Neo4j browser (not custom UI)

---

## 7. Dependency Cruiser

- **URL:** https://github.com/sverweij/dependency-cruiser
- **What it does:** Validates and visualizes JavaScript/TypeScript module dependencies with custom rules. Can enforce architectural constraints in CI.
- **Tech stack:** JavaScript/Node.js, Graphviz (for visualization)
- **Visualization:** DOT/SVG/HTML dependency graphs via Graphviz; also supports Mermaid output
- **Code analysis:** Module resolution (follows require/import statements); not full AST semantic analysis
- **Languages:** JavaScript, TypeScript, CoffeeScript (ES6, CommonJS, AMD)
- **Data storage:** JSON output (no persistent DB)
- **Stars:** ~6,500
- **Strengths:** Mature and battle-tested; excellent CI integration; custom rule engine for architectural enforcement; circular dependency detection; rich documentation; active maintenance
- **Weaknesses:** JS/TS only; static Graphviz output (not interactive); no graph database; no AI integration; no semantic analysis beyond imports

---

## 8. Madge

- **URL:** https://github.com/pahen/madge
- **What it does:** Generates visual graphs of JS module dependencies and finds circular dependencies.
- **Tech stack:** JavaScript/Node.js, Graphviz
- **Visualization:** SVG/DOT/JPG static dependency graphs
- **Code analysis:** Module resolution for CommonJS, AMD, ES6 modules
- **Languages:** JavaScript, TypeScript, CSS preprocessors (Sass, Stylus, Less)
- **Data storage:** JSON (in-memory, no persistent store)
- **Stars:** ~9,900
- **Strengths:** Simple and focused; easy to use; good for quick dependency overviews; CSS preprocessor support is unique
- **Weaknesses:** Static output only; no interactive graph; JS-only; no semantic analysis; no AI integration; no persistent storage; less feature-rich than dependency-cruiser

---

## 9. Emerge

- **URL:** https://github.com/glato/emerge
- **What it does:** Browser-based interactive codebase and dependency visualization with code quality metrics and graph clustering.
- **Tech stack:** Python 3, D3.js (browser visualization)
- **Visualization:** Interactive force-directed graph with Louvain modularity clustering; browser-based; color-coded nodes
- **Code analysis:** Language-specific parsers for dependency extraction
- **Languages:** C, C++, Groovy, Java, JavaScript, TypeScript, Kotlin, ObjC, Ruby, Swift, Python, Go
- **Data storage:** Export to JSON, GraphML, DOT, Tabular
- **Stars:** ~800
- **Strengths:** Beautiful interactive visualization; Louvain clustering groups related modules; multi-language support; code quality metrics; browser-based (no desktop app needed); filesystem graph view
- **Weaknesses:** Python-only analysis engine (slower on large repos); no graph database; no AI integration; no MCP server; limited semantic depth

---

## 10. Deptrac (PHP)

- **URL:** https://github.com/deptrac/deptrac
- **What it does:** Static code analysis tool for PHP that enforces architectural layer constraints. Visualizes and validates dependency rules.
- **Tech stack:** PHP 8.1+
- **Visualization:** Graphviz DOT graphs, Mermaid.js diagrams
- **Code analysis:** PHP AST parsing; collector-based layer assignment; dependency rule checking
- **Languages:** PHP only
- **Data storage:** In-memory analysis (no persistent store)
- **Stars:** ~2,700
- **Strengths:** Symfony ecosystem standard; excellent CI integration; clean architectural layer concept; well-documented; actively maintained; recommended by Symfony blog
- **Weaknesses:** PHP only; static visualization (not interactive); architectural layers only (no call graphs, class diagrams); no AI integration; no graph database

---

## 11. Bevel Code-to-Knowledge-Graph

- **URL:** https://github.com/Bevel-Software/code-to-knowledge-graph
- **What it does:** Kotlin/JVM toolkit that parses source code via LSP (Language Server Protocol) and creates queryable knowledge graphs.
- **Tech stack:** Kotlin/JVM, LSP clients, VS Code extension
- **Visualization:** VS Code extension with graph views
- **Code analysis:** LSP-based -- leverages existing language servers for deep semantic analysis (types, references, definitions)
- **Languages:** Any language with an LSP server (theoretically all major languages)
- **Data storage:** In-memory graph structures (exportable)
- **Stars:** ~200
- **Strengths:** LSP-based analysis means true semantic understanding (not just syntax); theoretically supports any LSP language; VS Code integration
- **Weaknesses:** JVM dependency; early stage; limited documentation; smaller community; no standalone web visualization; no MCP integration

---

## 12. CodeGraph MCP (colbymchenry)

- **URL:** https://github.com/colbymchenry/codegraph
- **What it does:** Pre-indexed code knowledge graph for Claude Code. Fewer tokens, fewer tool calls, 100% local.
- **Tech stack:** TypeScript, SQLite, Tree-sitter
- **Visualization:** No dedicated visualization (MCP-focused, data-only)
- **Code analysis:** Tree-sitter parsing
- **Languages:** TypeScript, JavaScript, Python, Go, Rust, Java, C#, PHP, Ruby, C, C++, Swift, Kotlin, Dart, Svelte, Liquid, Pascal/Delphi
- **Data storage:** Local SQLite database
- **Stars:** ~600
- **Strengths:** Wide language support including PHP; SQLite simplicity; zero external dependencies; MCP-first design; good token efficiency
- **Weaknesses:** No visualization at all; purely a data/query layer for AI agents; no interactive exploration

---

## 13. Arkit

- **URL:** https://github.com/dyatko/arkit
- **What it does:** Generates architecture diagrams and dependency graphs for JavaScript/TypeScript projects as SVG or PlantUML.
- **Tech stack:** JavaScript/Node.js, PlantUML, Graphviz
- **Visualization:** SVG, PNG, PlantUML diagrams -- grouped component architecture views
- **Code analysis:** Module import/export resolution
- **Languages:** JavaScript, TypeScript, Flow, Vue/Nuxt
- **Data storage:** JSON config (no persistent store)
- **Stars:** ~1,700
- **Strengths:** Generates clean architecture diagrams (not just dependency graphs); PlantUML integration; simple CLI usage with npx; grouped component views
- **Weaknesses:** JS/TS only; static output; no interactive graph; uses external web service for PlantUML conversion; limited analysis depth; no AI integration

---

## 14. CodeScene

- **URL:** https://codescene.com
- **What it does:** Software engineering intelligence platform combining code quality metrics with behavioral code analysis. Uses version control history + ML to identify hotspots, code smells, and coupling.
- **Tech stack:** Proprietary (Clojure backend); SaaS + on-premise
- **Visualization:** Hotspot maps (circle-packing), architectural coupling diagrams, code health treemaps, temporal coupling views
- **Code analysis:** Git history behavioral analysis + source code parsing for code smells (God Class, Duplicated Code, etc.)
- **Languages:** 30+ languages (C, C++, C#, Java, JS, TS, Python, Go, Kotlin, PHP, Ruby, Rust, Elixir, etc.)
- **Data storage:** Proprietary (SaaS)
- **Stars:** N/A (commercial product)
- **Strengths:** Unique behavioral analysis (who changes what, when, together); temporal coupling detection; code health scoring; excellent enterprise features; wide language support; CI/CD integration
- **Weaknesses:** Commercial (not open source); no graph database export; visualization is focused on hotspots, not structural graphs; expensive for small teams

---

## 15. Sourcegraph

- **URL:** https://sourcegraph.com
- **What it does:** Code intelligence platform for universal code search, navigation, and AI-powered coding assistance across all repositories.
- **Tech stack:** Go, TypeScript, GraphQL; SaaS + self-hosted
- **Visualization:** Code navigation in web UI (not graph visualization per se); reference/definition jumping; code ownership views
- **Code analysis:** SCIP (Source Code Intelligence Protocol) indexers; LSP-based; precise code intelligence via language-specific indexers
- **Languages:** 30+ languages via SCIP indexers
- **Data storage:** PostgreSQL + custom indexes
- **Stars:** N/A (primarily commercial; some OSS components)
- **Strengths:** Best-in-class code search at scale; cross-repo navigation; precise code intelligence; enterprise-grade; Cody AI assistant; batch changes across repos
- **Weaknesses:** No graph visualization; expensive; complex self-hosting; pivoting toward AI (Amp); discontinued free tier in 2025; overkill for single-repo analysis

---

## 16. SciTools Understand

- **URL:** https://scitools.com
- **What it does:** IDE-like tool for static code analysis with rich graphing: control flow, call trees, dependency graphs, UML class diagrams, butterfly graphs, metric treemaps.
- **Tech stack:** Proprietary (C++ desktop app)
- **Visualization:** Control flow graphs, call trees, dependency graphs, butterfly diagrams, UML class diagrams, metric treemaps with heat maps
- **Code analysis:** Deep semantic parsing with full cross-reference database
- **Languages:** 15+ (Ada, C/C++, C#, COBOL, FORTRAN, Java, JOVIAL, Delphi/Pascal, Python, VHDL, Visual Basic .NET, web languages)
- **Data storage:** Proprietary analysis database
- **Stars:** N/A (commercial product)
- **Strengths:** Deepest analysis of any tool listed; rich variety of graph types; metric visualization; architecture hierarchies; AI-powered graph summaries (v7.0); enterprise trusted
- **Weaknesses:** Commercial (expensive); desktop-only; no web UI; no AI/MCP integration; no graph database export; dated UI

---

## 17. CodeSee

- **URL:** https://codesee.io
- **What it does:** Continuous code understanding platform. Auto-generates codebase maps showing file dependencies, code changes, and service connections.
- **Tech stack:** Proprietary SaaS; browser-based
- **Visualization:** Interactive codebase maps; PR review maps; onboarding maps; feature planning maps; real-time collaboration
- **Code analysis:** Automated dependency and service mapping
- **Languages:** Multi-language (details not fully public)
- **Data storage:** SaaS (proprietary)
- **Stars:** N/A (commercial product)
- **Strengths:** Best UX for team collaboration; PR-integrated review maps; onboarding maps; code ownership visualization; AI-powered summaries
- **Weaknesses:** Commercial; not open source; limited graph query capabilities; focused on team workflows rather than deep code analysis

---

## 18. code-graph-analysis-pipeline

- **URL:** https://github.com/JohT/code-graph-analysis-pipeline
- **What it does:** Fully automated pipeline for static code graph analysis. Parses bytecode/source, loads into Neo4j, runs analysis queries, generates reports.
- **Tech stack:** Shell scripts, Neo4j, jQAssistant, Cypher queries
- **Visualization:** Neo4j browser + generated SVG/CSV reports
- **Code analysis:** jQAssistant (bytecode analysis for JVM) + custom Cypher analysis queries
- **Languages:** Java/JVM (bytecode level), TypeScript
- **Data storage:** Neo4j
- **Stars:** ~80
- **Strengths:** Fully automated pipeline (CI-friendly); deep JVM analysis via bytecode; rich pre-built Cypher queries for common patterns; community detection
- **Weaknesses:** JVM-centric; requires Neo4j; small community; complex setup; limited language support

---

## Summary Comparison Matrix

| Tool | OSS | Languages | Graph DB | Interactive Viz | AI/MCP | Analysis Depth | Stars |
|------|-----|-----------|----------|----------------|--------|---------------|-------|
| Sourcetrail | Yes (archived) | 4 | No (SQLite) | Yes (desktop) | No | Deep semantic | 16.4k |
| GitNexus | Yes | Many (Tree-sitter) | KuzuDB (WASM) | Yes (browser) | Yes (MCP) | Syntax | ~3.8k |
| Axon | Yes | 2 (Python, TS) | KuzuDB | Yes (web) | Yes (MCP) | Very deep (12-phase) | ~1.2k |
| codebase-memory-mcp | Partial | 64 | Embedded | Yes (3D, basic) | Yes (MCP) | Moderate | ~2.5k |
| FalkorDB Code Graph | Yes | 3 | FalkorDB | Yes (web) | Partial | Moderate | ~500 |
| CodeGraph (ChrisRoyse) | Yes | Multiple | Neo4j | Neo4j browser | Yes (MCP) | Deep (2-pass) | ~300 |
| Dependency Cruiser | Yes | JS/TS/CS | No (JSON) | No (static SVG) | No | Import-level | 6.5k |
| Madge | Yes | JS/TS/CSS | No | No (static) | No | Import-level | 9.9k |
| Emerge | Yes | 12 | No (export) | Yes (browser) | No | Moderate | ~800 |
| Deptrac | Yes | PHP | No | No (static) | No | Layer/import | 2.7k |
| Bevel C2KG | Yes | Any (LSP) | In-memory | VS Code | No | Deep (LSP) | ~200 |
| CodeGraph MCP | Yes | 17 | SQLite | No | Yes (MCP) | Syntax | ~600 |
| Arkit | Yes | JS/TS/Vue | No | No (static) | No | Import-level | 1.7k |
| CodeScene | No | 30+ | Proprietary | Yes (web) | Partial | Behavioral+static | N/A |
| Sourcegraph | Partial | 30+ | PostgreSQL | Navigation only | Yes (Cody) | Deep (SCIP) | N/A |
| SciTools Understand | No | 15+ | Proprietary | Yes (desktop) | Partial | Deepest | N/A |
| CodeSee | No | Multi | Proprietary | Yes (web) | Yes | Moderate | N/A |

---

## Key Insights for Our Project

### What the market lacks (our opportunity):
1. **No tool combines deep semantic analysis + interactive web graph + MCP integration + broad language support** in a single open-source package
2. **PHP is underserved** -- Deptrac does layers only; no tool builds a full knowledge graph for PHP/Symfony codebases
3. **Most MCP-based tools use Tree-sitter only** (syntax-level) -- combining with LSP or type analysis would be a differentiator
4. **Visualization quality varies wildly** -- Emerge and GitNexus have the best browser UIs; most tools produce static Graphviz output
5. **No tool does proper incremental indexing** -- most require full re-analysis on every change

### Architecture patterns to adopt:
- **Tree-sitter for parsing** (industry standard, 64+ languages) -- consider augmenting with LSP for deeper analysis
- **KuzuDB for storage** (embedded, fast, Cypher support, WASM-capable) -- preferred over Neo4j for local-first tools
- **MCP server for AI integration** (table stakes for 2025+ tools)
- **Force-directed graph with D3.js or react-force-graph** for visualization
- **12-phase pipeline** (Axon's approach) is the deepest open-source analysis

### What we can learn from each:
- **Sourcetrail:** Bidirectional code-graph linking UX
- **GitNexus:** Client-side architecture, KuzuDB WASM, zero-server design
- **Axon:** 12-phase pipeline, community detection, dead code analysis, coupling metrics
- **codebase-memory-mcp:** Performance (Rust + embedded graph), 64-language support, token efficiency
- **Emerge:** Louvain clustering visualization, multi-language parsing
- **CodeScene:** Behavioral analysis from git history (temporal coupling)
- **Dependency Cruiser:** Rule-based architectural enforcement in CI
- **Deptrac:** Layer concept for PHP architectural boundaries
- **Bevel:** LSP-based analysis for true semantic understanding

### What we can do better:
- **PHP-first with true semantic understanding** (not just imports -- calls, inheritance, traits, interfaces, DI container resolution)
- **Symfony-aware analysis** (service container, routing, event listeners, Doctrine entities)
- **Interactive web visualization** that rivals Emerge/GitNexus but with deeper data
- **Incremental indexing** (watch mode, re-index only changed files)
- **Architectural fitness functions** (like dependency-cruiser rules but for PHP)
- **Git history integration** (temporal coupling a la CodeScene, but open source)

---

## Visualization Libraries to Consider

| Library | Type | Stars | Notes |
|---------|------|-------|-------|
| react-force-graph | React component | ~2.2k | 2D/3D/VR/AR force graphs; canvas/WebGL |
| D3.js | Low-level | ~110k | Industry standard; full control; steep learning curve |
| vis-network | Graph library | ~3k | Part of vis.js; good for network graphs |
| Cytoscape.js | Graph theory | ~10k | Rich graph analysis + visualization |
| Sigma.js | Large graphs | ~11k | WebGL-based; handles 100k+ nodes |

---

Sources:
- [Sourcetrail](https://github.com/CoatiSoftware/Sourcetrail)
- [NumbatUI (Sourcetrail fork)](https://github.com/quarkslab/NumbatUI)
- [GitNexus](https://github.com/abhigyanpatwari/GitNexus)
- [GitNexus blog](https://www.virge.io/en/blog/gitnexus-code-knowledge-graph/)
- [Axon](https://github.com/harshkedia177/axon)
- [codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp)
- [FalkorDB Code Graph](https://github.com/FalkorDB/code-graph)
- [FalkorDB blog](https://www.falkordb.com/blog/code-graph-analysis-visualize-source-code/)
- [CodeGraph (ChrisRoyse)](https://github.com/ChrisRoyse/CodeGraph)
- [Dependency Cruiser](https://github.com/sverweij/dependency-cruiser)
- [Madge](https://github.com/pahen/madge)
- [Emerge](https://github.com/glato/emerge)
- [Deptrac](https://github.com/deptrac/deptrac)
- [Bevel code-to-knowledge-graph](https://github.com/Bevel-Software/code-to-knowledge-graph)
- [CodeGraph MCP (colbymchenry)](https://github.com/colbymchenry/codegraph)
- [Arkit](https://github.com/dyatko/arkit)
- [CodeScene](https://codescene.com)
- [Sourcegraph](https://sourcegraph.com)
- [SciTools Understand](https://scitools.com)
- [CodeSee](https://www.codesee.io)
- [code-graph-analysis-pipeline](https://github.com/JohT/code-graph-analysis-pipeline)
- [code-graph-rag](https://github.com/vitali87/code-graph-rag)
- [Neo4j Codebase Knowledge Graph](https://neo4j.com/blog/developer/codebase-knowledge-graph/)
- [tree-sitter-graph](https://github.com/tree-sitter/tree-sitter-graph)
- [GitHub Stack Graphs](https://github.blog/open-source/introducing-stack-graphs/)
- [react-force-graph](https://github.com/vasturiano/react-force-graph)
- [mcp-code-graph (JudiniLabs)](https://github.com/JudiniLabs/mcp-code-graph)
- [code-review-graph](https://github.com/tirth8205/code-review-graph)
- [GraphGen4Code](https://wala.github.io/graph4code/)
- [CodeGraphContext](https://github.com/CodeGraphContext/CodeGraphContext)
