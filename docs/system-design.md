

# llmProjectSniffo -- System Design Document

**Version:** 1.0.0
**Date:** 2026-03-22
**Status:** Draft

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Package Structure](#2-package-structure)
3. [Graph Schema](#3-graph-schema)
4. [Analysis Pipeline](#4-analysis-pipeline)
5. [Staleness and Freshness System](#5-staleness-and-freshness-system)
6. [Storage Design](#6-storage-design)
7. [MCP Server Design](#7-mcp-server-design)
8. [Web Server Design](#8-web-server-design)
9. [Extension Points](#9-extension-points)
10. [Architecture Decision Records](#10-architecture-decision-records)

---

## 1. Architecture Overview

### High-Level ASCII Diagram

```
+------------------------------------------------------------------+
|                        User Interfaces                           |
|                                                                  |
|  +------------------+   +------------------+   +---------------+ |
|  |   Claude Code    |   |    Web UI        |   |    CLI        | |
|  |   (MCP Client)   |   | (React + Vite)  |   | (Commander)   | |
|  +--------+---------+   +--------+---------+   +-------+-------+ |
|           |                      |                      |        |
+-----------+----------------------+----------------------+--------+
            |                      |                      |
            v                      v                      v
+------------------------------------------------------------------+
|                       Service Layer                              |
|                                                                  |
|  +------------------+   +------------------+   +---------------+ |
|  |   MCP Server     |   |  Web Server      |   |  CLI Handler  | |
|  |   (stdio/SSE)    |   |  (Fastify)       |   |               | |
|  +--------+---------+   +--------+---------+   +-------+-------+ |
|           |                      |                      |        |
+-----------+----------------------+----------------------+--------+
            |                      |                      |
            v                      v                      v
+------------------------------------------------------------------+
|                        Core Engine                               |
|                                                                  |
|  +---------------------+   +----------------------------------+ |
|  |  Analysis Pipeline   |   |  Query Engine                    | |
|  |                      |   |                                  | |
|  |  +----------------+  |   |  +------------+ +-------------+  | |
|  |  | Tree-sitter    |  |   |  | Graph      | | Semantic    |  | |
|  |  | AST Parser     |  |   |  | Traversal  | | Search      |  | |
|  |  +-------+--------+  |   |  +------+-----+ +------+------+  | |
|  |          |            |   |         |              |          | |
|  |  +-------v--------+  |   +---------+--------------+----------+ |
|  |  | Relationship   |  |             |              |            |
|  |  | Extractors     |  |             |              |            |
|  |  +-------+--------+  |             |              |            |
|  |          |            |             |              |            |
|  |  +-------v--------+  |             |              |            |
|  |  | Graph Builder  |  |             |              |            |
|  |  +-------+--------+  |             |              |            |
|  +----------+-----------+             |              |            |
|             |                         |              |            |
+-------------+-------------------------+--------------+------------+
              |                         |              |
              v                         v              v
+------------------------------------------------------------------+
|                      Storage Layer                               |
|                                                                  |
|  +------------------+  +------------------+  +-----------------+ |
|  |  DuckDB +        |  |  SQLite Vector   |  |  File Hash     | |
|  |  DuckPGQ         |  |  Store           |  |  Registry       | |
|  |  (Graph)         |  |  (Embeddings)    |  |  (JSON)        | |
|  +------------------+  +------------------+  +-----------------+ |
|                                                                  |
|  All stored in:  <target-project>/.sniffo/               |
+------------------------------------------------------------------+
              ^
              |
+------------------------------------------------------------------+
|                    Freshness System                              |
|                                                                  |
|  +------------------+  +------------------+  +-----------------+ |
|  |  Content Hasher  |  |  Cascade         |  |  Pre-commit    | |
|  |  (SHA-256)       |  |  Invalidator     |  |  Hook          | |
|  +------------------+  +------------------+  +-----------------+ |
+------------------------------------------------------------------+
```

### Data Flow

```
Source Files
    |
    v
[File Watcher / Pre-commit Hook / CLI trigger]
    |
    v
[Content Hasher] -- compare SHA-256 --> [Hash Registry]
    |                                        |
    | (changed files only)                   | (staleness info)
    v                                        v
[Tree-sitter Parser] --> AST ----------> [Relationship Extractors]
    |                                        |
    |                                        v
    |                                   [Graph Builder]
    |                                        |
    |                    +-------------------+-------------------+
    |                    |                                       |
    v                    v                                       v
[Embedding Generator]  [DuckDB Graph Store]              [Cascade Invalidator]
    |                                                           |
    v                                                           v
[SQLite Vector Store]                                    [Mark dependents stale]
```

### Component Boundaries

| Boundary | Responsibility | Communication |
|----------|---------------|---------------|
| **MCP Server** | Tool dispatch, schema validation | stdio/SSE with Claude, function calls to Core |
| **Web Server** | HTTP API, static file serving | REST/WebSocket to Web UI, function calls to Core |
| **CLI** | Command parsing, user interaction | function calls to Core |
| **Analysis Pipeline** | Parsing, extraction, graph building | Internal events, direct storage writes |
| **Query Engine** | Graph traversal, semantic search | Direct storage reads |
| **Storage Layer** | Persistence, indexing | File I/O, SQL queries |
| **Freshness System** | Change detection, invalidation | Hash comparison, graph dependency walks |

---

## 2. Package Structure

### Monorepo Layout

```
llmProjectSniffo/
├── package.json                    # Workspace root
├── tsconfig.base.json              # Shared TS config
├── turbo.json                      # Turborepo pipeline config
├── .github/
│   └── workflows/
│       └── ci.yml
├── packages/
│   ├── core/                       # @sniffo/core
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── analysis/
│   │       │   ├── pipeline.ts            # Orchestrates all passes
│   │       │   ├── file-discovery.ts      # Finds source files
│   │       │   ├── ast-parser.ts          # Tree-sitter wrapper
│   │       │   └── extractors/
│   │       │       ├── extractor.interface.ts
│   │       │       ├── php/
│   │       │       │   ├── php-extractor.ts
│   │       │       │   ├── class-extractor.ts
│   │       │       │   ├── function-extractor.ts
│   │       │       │   ├── namespace-extractor.ts
│   │       │       │   └── dependency-extractor.ts
│   │       │       └── typescript/
│   │       │           └── ts-extractor.ts
│   │       ├── graph/
│   │       │   ├── graph-builder.ts       # Constructs nodes/edges
│   │       │   ├── graph-schema.ts        # Type definitions
│   │       │   └── hierarchy.ts           # L1-L4 level management
│   │       ├── freshness/
│   │       │   ├── content-hasher.ts      # SHA-256 per file
│   │       │   ├── hash-registry.ts       # Persists hashes
│   │       │   ├── cascade-invalidator.ts # Dependency cascade
│   │       │   └── change-detector.ts     # Diff against registry
│   │       ├── query/
│   │       │   ├── graph-query.ts         # Graph traversal queries
│   │       │   └── semantic-search.ts     # Vector similarity
│   │       ├── embeddings/
│   │       │   ├── embedding-generator.ts # transformers.js wrapper
│   │       │   └── vector-store.ts        # SQLite-vec operations
│   │       ├── storage/
│   │       │   ├── storage-manager.ts     # Coordinates all stores
│   │       │   ├── duckdb-store.ts        # DuckDB + DuckPGQ adapter
│   │       │   ├── sqlite-vector-store.ts # sqlite-vec adapter
│   │       │   └── migrations/
│   │       │       ├── 001-initial-schema.sql
│   │       │       └── runner.ts
│   │       └── types/
│   │           ├── graph-nodes.ts
│   │           ├── graph-edges.ts
│   │           ├── analysis.ts
│   │           └── config.ts
│   │
│   ├── mcp-server/                 # @sniffo/mcp-server
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts            # MCP server entry point
│   │       ├── server.ts           # MCP server setup
│   │       └── tools/
│   │           ├── analyze-project.ts
│   │           ├── query-graph.ts
│   │           ├── search-code.ts
│   │           ├── get-context.ts
│   │           ├── explain-relationship.ts
│   │           └── get-staleness-report.ts
│   │
│   ├── web-ui/                     # @sniffo/web-ui
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vite.config.ts
│   │   ├── tailwind.config.ts
│   │   ├── index.html
│   │   └── src/
│   │       ├── main.tsx
│   │       ├── App.tsx
│   │       ├── components/
│   │       │   ├── GraphCanvas.tsx         # Sigma.js renderer
│   │       │   ├── LevelSelector.tsx       # L1-L4 switcher
│   │       │   ├── NodeDetail.tsx          # Side panel
│   │       │   ├── SearchBar.tsx           # Semantic + text search
│   │       │   ├── FilterPanel.tsx         # Node/edge type filters
│   │       │   └── StalenessIndicator.tsx  # Visual freshness
│   │       ├── hooks/
│   │       │   ├── useGraph.ts
│   │       │   ├── useWebSocket.ts
│   │       │   └── useSearch.ts
│   │       ├── lib/
│   │       │   ├── graph-adapter.ts        # Graphology adapter
│   │       │   ├── layout.ts              # Force-directed config
│   │       │   └── api-client.ts
│   │       └── types/
│   │           └── index.ts
│   │
│   ├── web-server/                 # @sniffo/web-server
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── server.ts           # Fastify setup
│   │       ├── routes/
│   │       │   ├── graph.ts        # GET /api/graph/:level
│   │       │   ├── search.ts       # POST /api/search
│   │       │   ├── analysis.ts     # POST /api/analyze
│   │       │   ├── staleness.ts    # GET /api/staleness
│   │       │   └── node.ts         # GET /api/node/:id
│   │       └── ws/
│   │           └── graph-updates.ts # WebSocket for live updates
│   │
│   └── cli/                        # @sniffo/cli
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts            # Entry point, bin
│           ├── commands/
│           │   ├── init.ts         # Initialize .sniffo/
│           │   ├── analyze.ts      # Run full/incremental analysis
│           │   ├── serve.ts        # Start web server
│           │   ├── query.ts        # CLI graph queries
│           │   ├── status.ts       # Show staleness report
│           │   └── hook.ts         # Install/manage pre-commit hook
│           └── utils/
│               └── output.ts       # CLI formatting
│
├── scripts/
│   ├── pre-commit-hook.sh          # Git hook template
│   └── install-hook.ts             # Hook installer
│
└── tree-sitter-grammars/           # Vendored WASM grammars
    ├── tree-sitter-php.wasm
    ├── tree-sitter-typescript.wasm
    ├── tree-sitter-javascript.wasm
    └── tree-sitter-python.wasm
```

### Package Dependencies

```
@sniffo/cli
  ├── @sniffo/core
  ├── @sniffo/web-server
  └── commander

@sniffo/mcp-server
  └── @sniffo/core
      └── @modelcontextprotocol/sdk

@sniffo/web-server
  ├── @sniffo/core
  └── fastify

@sniffo/web-ui
  ├── sigma
  ├── graphology
  ├── react
  └── (no dependency on core -- communicates via HTTP/WS)

@sniffo/core
  ├── duckdb (duckdb-async)
  ├── better-sqlite3 + sqlite-vec
  ├── web-tree-sitter
  └── @huggingface/transformers
```

### Workspace Root `package.json`

```json
{
  "name": "llm-project-sniffo",
  "private": true,
  "workspaces": [
    "packages/*"
  ],
  "devDependencies": {
    "turbo": "^2.3.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0",
    "@types/node": "^22.0.0"
  },
  "scripts": {
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "dev": "turbo run dev --parallel"
  }
}
```

---

## 3. Graph Schema

### Level Hierarchy

```
L1: System        -- The entire project as one node. Edges to external systems.
L2: Container     -- Bounded contexts, modules, packages (e.g., Symfony bundles, npm packages)
L3: Component     -- Classes, interfaces, traits, standalone functions, enums
L4: Code          -- Methods, properties, parameters, constants
```

### TypeScript Interfaces

```typescript
// packages/core/src/types/graph-nodes.ts

interface BaseNode {
  id: string;                      // Deterministic: hash of (type + qualifiedName)
  type: NodeType;
  level: GraphLevel;
  qualifiedName: string;           // e.g., "App\\Service\\UserService"
  shortName: string;               // e.g., "UserService"
  filePath: string | null;         // Relative to project root
  startLine: number | null;
  endLine: number | null;
  contentHash: string | null;      // SHA-256 of the source span
  isStale: boolean;
  lastAnalyzedAt: string;          // ISO 8601
  metadata: Record<string, unknown>;
}

type GraphLevel = 'L1_SYSTEM' | 'L2_CONTAINER' | 'L3_COMPONENT' | 'L4_CODE';

type NodeType =
  // L1
  | 'SYSTEM'
  // L2
  | 'CONTAINER'
  | 'MODULE'
  | 'PACKAGE'
  | 'BUNDLE'
  // L3
  | 'CLASS'
  | 'INTERFACE'
  | 'TRAIT'
  | 'ENUM'
  | 'ABSTRACT_CLASS'
  | 'FUNCTION'          // standalone function
  | 'CONFIGURATION'     // config files as nodes
  // L4
  | 'METHOD'
  | 'PROPERTY'
  | 'CONSTANT'
  | 'PARAMETER'
  | 'CONSTRUCTOR';

// L1 node
interface SystemNode extends BaseNode {
  level: 'L1_SYSTEM';
  type: 'SYSTEM';
  metadata: {
    language: string;
    framework: string | null;
    version: string | null;
  };
}

// L2 node
interface ContainerNode extends BaseNode {
  level: 'L2_CONTAINER';
  type: 'CONTAINER' | 'MODULE' | 'PACKAGE' | 'BUNDLE';
  metadata: {
    namespace: string;
    directory: string;
    fileCount: number;
  };
}

// L3 node
interface ComponentNode extends BaseNode {
  level: 'L3_COMPONENT';
  type: 'CLASS' | 'INTERFACE' | 'TRAIT' | 'ENUM' | 'ABSTRACT_CLASS' | 'FUNCTION' | 'CONFIGURATION';
  metadata: {
    namespace: string;
    isAbstract: boolean;
    isFinal: boolean;
    visibility: 'public' | 'protected' | 'private' | null;
    annotations: string[];
    docSummary: string | null;
    loc: number;                   // lines of code
  };
}

// L4 node
interface CodeNode extends BaseNode {
  level: 'L4_CODE';
  type: 'METHOD' | 'PROPERTY' | 'CONSTANT' | 'PARAMETER' | 'CONSTRUCTOR';
  metadata: {
    visibility: 'public' | 'protected' | 'private';
    isStatic: boolean;
    returnType: string | null;
    parameterTypes: string[];
    complexity: number | null;     // cyclomatic complexity
  };
}
```

```typescript
// packages/core/src/types/graph-edges.ts

interface BaseEdge {
  id: string;                      // hash of (source + target + type)
  source: string;                  // Node ID
  target: string;                  // Node ID
  type: EdgeType;
  level: GraphLevel;
  weight: number;                  // 0.0 - 1.0, coupling strength
  metadata: Record<string, unknown>;
}

type EdgeType =
  // Structural (containment hierarchy)
  | 'CONTAINS'                     // System -> Container -> Component -> Code
  // Inheritance / Implementation
  | 'EXTENDS'
  | 'IMPLEMENTS'
  | 'USES_TRAIT'
  // Dependencies
  | 'DEPENDS_ON'                   // General dependency
  | 'IMPORTS'                      // use statement / import
  | 'INJECTS'                      // Constructor injection / DI
  | 'CALLS'                        // Method call
  | 'INSTANTIATES'                 // new ClassName()
  // Type references
  | 'RETURNS_TYPE'                 // Method -> return type
  | 'PARAMETER_TYPE'               // Method -> parameter type
  | 'PROPERTY_TYPE'                // Property -> type
  // Configuration
  | 'CONFIGURED_BY'                // Service -> config
  | 'ROUTES_TO'                    // Route -> Controller::method
  // Data
  | 'READS'
  | 'WRITES'
  // Aggregated (for higher levels)
  | 'AGGREGATED_DEPENDENCY';       // Rolled-up edge for L1/L2 views

interface ContainmentEdge extends BaseEdge {
  type: 'CONTAINS';
  metadata: Record<string, never>;
}

interface InheritanceEdge extends BaseEdge {
  type: 'EXTENDS' | 'IMPLEMENTS' | 'USES_TRAIT';
  metadata: Record<string, never>;
}

interface DependencyEdge extends BaseEdge {
  type: 'DEPENDS_ON' | 'IMPORTS' | 'INJECTS' | 'CALLS' | 'INSTANTIATES';
  metadata: {
    sourceLocation: { file: string; line: number } | null;
    isWeak: boolean;               // Optional / nullable dependency
  };
}

interface AggregatedEdge extends BaseEdge {
  type: 'AGGREGATED_DEPENDENCY';
  metadata: {
    constituentEdgeCount: number;  // How many L4 edges rolled up
    constituentEdgeTypes: EdgeType[];
  };
}
```

### DuckDB + DuckPGQ Schema (CREATE Statements)

```sql
-- Migration 001: Initial Schema
-- packages/core/src/storage/migrations/001-initial-schema.sql

-- ============================================================
-- Node Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS nodes (
    id              VARCHAR PRIMARY KEY,
    type            VARCHAR NOT NULL,
    level           VARCHAR NOT NULL,
    qualified_name  VARCHAR NOT NULL,
    short_name      VARCHAR NOT NULL,
    file_path       VARCHAR,
    start_line      INTEGER,
    end_line         INTEGER,
    content_hash    VARCHAR,
    is_stale        BOOLEAN NOT NULL DEFAULT false,
    last_analyzed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    metadata        JSON NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_nodes_type ON nodes(type);
CREATE INDEX idx_nodes_level ON nodes(level);
CREATE INDEX idx_nodes_qualified_name ON nodes(qualified_name);
CREATE INDEX idx_nodes_file_path ON nodes(file_path);
CREATE INDEX idx_nodes_is_stale ON nodes(is_stale);

-- ============================================================
-- Edge Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS edges (
    id        VARCHAR PRIMARY KEY,
    source    VARCHAR NOT NULL REFERENCES nodes(id),
    target    VARCHAR NOT NULL REFERENCES nodes(id),
    type      VARCHAR NOT NULL,
    level     VARCHAR NOT NULL,
    weight    DOUBLE NOT NULL DEFAULT 1.0,
    metadata  JSON NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_edges_source ON edges(source);
CREATE INDEX idx_edges_target ON edges(target);
CREATE INDEX idx_edges_type ON edges(type);
CREATE INDEX idx_edges_level ON edges(level);
CREATE UNIQUE INDEX idx_edges_unique ON edges(source, target, type);

-- ============================================================
-- DuckPGQ Property Graph Definition
-- ============================================================

CREATE PROPERTY GRAPH sniffo_graph
    VERTEX TABLES (
        nodes PROPERTIES (id, type, level, qualified_name, short_name, file_path, is_stale)
    )
    EDGE TABLES (
        edges SOURCE KEY (source) REFERENCES nodes (id)
              DESTINATION KEY (target) REFERENCES nodes (id)
              PROPERTIES (type, level, weight)
    );

-- ============================================================
-- File Hash Registry
-- ============================================================

CREATE TABLE IF NOT EXISTS file_hashes (
    file_path       VARCHAR PRIMARY KEY,
    content_hash    VARCHAR NOT NULL,
    last_modified   TIMESTAMP NOT NULL,
    last_analyzed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    file_size       BIGINT NOT NULL
);

-- ============================================================
-- Analysis Metadata
-- ============================================================

CREATE TABLE IF NOT EXISTS analysis_runs (
    id              VARCHAR PRIMARY KEY,
    started_at      TIMESTAMP NOT NULL,
    completed_at    TIMESTAMP,
    trigger         VARCHAR NOT NULL,  -- 'full', 'incremental', 'pre-commit'
    files_analyzed  INTEGER NOT NULL DEFAULT 0,
    nodes_created   INTEGER NOT NULL DEFAULT 0,
    nodes_updated   INTEGER NOT NULL DEFAULT 0,
    nodes_deleted   INTEGER NOT NULL DEFAULT 0,
    edges_created   INTEGER NOT NULL DEFAULT 0,
    edges_deleted   INTEGER NOT NULL DEFAULT 0,
    status          VARCHAR NOT NULL DEFAULT 'running'  -- 'running', 'completed', 'failed'
);
```

### DuckPGQ Query Examples

```sql
-- Find all classes that depend on a given class (1-hop)
FROM GRAPH_TABLE(sniffo_graph
    MATCH (a:nodes)-[e:edges]->(b:nodes)
    WHERE b.qualified_name = 'App\Service\UserService'
      AND e.type IN ('DEPENDS_ON', 'IMPORTS', 'CALLS', 'INSTANTIATES')
    COLUMNS (a.qualified_name AS dependent, e.type AS relationship, e.weight AS strength)
);

-- Shortest path between two components
FROM GRAPH_TABLE(sniffo_graph
    MATCH p = SHORTEST 1 TO 5 (a:nodes)-[e:edges]->(b:nodes)
    WHERE a.qualified_name = 'App\Controller\UserController'
      AND b.qualified_name = 'App\Repository\UserRepository'
    COLUMNS (path_length(p) AS distance, vertices(p) AS path_nodes)
);

-- Find all stale nodes and their immediate dependents
FROM GRAPH_TABLE(sniffo_graph
    MATCH (stale:nodes)<-[e:edges]-(dependent:nodes)
    WHERE stale.is_stale = true
    COLUMNS (stale.qualified_name AS stale_node,
             dependent.qualified_name AS affected_dependent,
             e.type AS edge_type)
);
```

---

## 4. Analysis Pipeline

### Pipeline Overview

```
Pass 1: File Discovery
    |
    v
Pass 2: Change Detection (content hashing)
    |
    v
Pass 3: AST Parsing (Tree-sitter)
    |
    v
Pass 4: Symbol Extraction (nodes)
    |
    v
Pass 5: Relationship Extraction (edges)
    |
    v
Pass 6: Hierarchy Construction (L1-L4 containment)
    |
    v
Pass 7: Edge Aggregation (roll up to L2/L1)
    |
    v
Pass 8: Embedding Generation (vectors)
    |
    v
Pass 9: Persistence (write to stores)
```

### Pass 1: File Discovery

```typescript
interface FileDiscoveryInput {
  projectRoot: string;
  includePatterns: string[];       // e.g., ["**/*.php", "**/*.ts"]
  excludePatterns: string[];       // e.g., ["vendor/**", "node_modules/**"]
}

interface FileDiscoveryOutput {
  files: DiscoveredFile[];
}

interface DiscoveredFile {
  relativePath: string;
  absolutePath: string;
  language: SupportedLanguage;
  sizeBytes: number;
  lastModified: Date;
}

type SupportedLanguage = 'php' | 'typescript' | 'javascript' | 'python';
```

**Algorithm:**
1. Read `.sniffo/config.json` for include/exclude patterns. Fall back to language-specific defaults.
2. Walk the project tree using `fast-glob`, respecting `.gitignore` plus exclude patterns.
3. Classify each file by extension to a `SupportedLanguage`.
4. Return sorted file list.

### Pass 2: Change Detection

```typescript
interface ChangeDetectionInput {
  files: DiscoveredFile[];
  hashRegistry: HashRegistry;
}

interface ChangeDetectionOutput {
  added: DiscoveredFile[];
  modified: DiscoveredFile[];
  deleted: string[];               // file paths no longer present
  unchanged: DiscoveredFile[];
}
```

**Algorithm:**
1. For each discovered file, compute SHA-256 of file contents.
2. Compare against stored hash in `file_hashes` table.
3. Categorize: new file (no stored hash), modified (hash mismatch), unchanged (hash match).
4. Query `file_hashes` for paths not in the discovered set -- those are deleted files.
5. For full analysis, treat all files as modified. For incremental, only process added + modified.

### Pass 3: AST Parsing

```typescript
interface ASTParseInput {
  file: DiscoveredFile;
  grammar: TreeSitterGrammar;      // Loaded WASM grammar
}

interface ASTParseOutput {
  file: DiscoveredFile;
  tree: Parser.Tree;               // Tree-sitter syntax tree
  errors: ParseError[];
}

interface ParseError {
  file: string;
  line: number;
  column: number;
  message: string;
}
```

**Algorithm:**
1. Load the appropriate Tree-sitter WASM grammar for the file's language.
2. Read file contents as UTF-8 string.
3. Parse with `parser.parse(source)`.
4. Collect any `ERROR` or `MISSING` nodes from the tree as `ParseError`.
5. Continue even with parse errors -- extract what is available.

### Pass 4: Symbol Extraction

```typescript
interface SymbolExtractionInput {
  file: DiscoveredFile;
  tree: Parser.Tree;
  source: string;
}

interface SymbolExtractionOutput {
  nodes: BaseNode[];               // L3 + L4 nodes
}
```

**Algorithm (PHP example):**
1. Walk the AST using a cursor.
2. Match node types:
   - `namespace_definition` -> extract namespace (used for container grouping)
   - `class_declaration` -> create `CLASS` node (L3)
   - `interface_declaration` -> create `INTERFACE` node (L3)
   - `trait_declaration` -> create `TRAIT` node (L3)
   - `enum_declaration` -> create `ENUM` node (L3)
   - `function_definition` (top-level) -> create `FUNCTION` node (L3)
   - `method_declaration` -> create `METHOD` node (L4)
   - `property_declaration` -> create `PROPERTY` node (L4)
   - `const_declaration` (in class) -> create `CONSTANT` node (L4)
3. For each node, extract: name, visibility, modifiers, annotations from doc comments, parameter types, return types.
4. Generate deterministic ID: `sha256(type + ":" + qualifiedName)`.
5. Compute content hash of the source span (startByte to endByte).

### Pass 5: Relationship Extraction

```typescript
interface RelationshipExtractionInput {
  file: DiscoveredFile;
  tree: Parser.Tree;
  source: string;
  localNodes: BaseNode[];          // Nodes from this file
  nodeIndex: Map<string, string>;  // qualifiedName -> nodeId (all known nodes)
}

interface RelationshipExtractionOutput {
  edges: BaseEdge[];
}
```

**Algorithm (PHP example):**
1. **Inheritance:** Find `base_clause` in class declarations -> `EXTENDS` edge.
2. **Implementation:** Find `class_interface_clause` -> `IMPLEMENTS` edge.
3. **Trait usage:** Find `use_declaration` within class body -> `USES_TRAIT` edge.
4. **Imports:** Find `use_declaration` (namespace level) -> `IMPORTS` edge.
5. **Calls:** Find `member_call_expression` and `scoped_call_expression` -> `CALLS` edge. Resolve the target by matching the object type (from type hints, constructor injection, or property types) against known nodes.
6. **Instantiation:** Find `object_creation_expression` -> `INSTANTIATES` edge.
7. **Type references:** Find type hints in parameters, return types, property types -> `PARAMETER_TYPE`, `RETURNS_TYPE`, `PROPERTY_TYPE` edges.
8. **Dependency injection:** Find constructor parameters with type hints -> `INJECTS` edge.

**Target resolution strategy:**
- Fully qualified names resolve directly.
- Short names resolve via the file's `use` imports.
- Unresolved references are stored with a `?unresolved:ClassName` target and resolved in a second pass after all files are indexed.

### Pass 6: Hierarchy Construction

```typescript
interface HierarchyInput {
  allNodes: BaseNode[];
  projectConfig: ProjectConfig;
}

interface HierarchyOutput {
  systemNode: SystemNode;
  containerNodes: ContainerNode[];
  containmentEdges: ContainmentEdge[];
}
```

**Algorithm:**
1. Create a single `SYSTEM` node (L1) representing the project.
2. Group L3 nodes by namespace prefix. Each top-level namespace segment becomes a `CONTAINER` node (L2). For PHP with PSR-4 autoloading, map `composer.json` autoload entries to containers.
3. Create `CONTAINS` edges: System -> Container -> Component -> Code members.
4. Compute container metadata: file count, total LOC.

### Pass 7: Edge Aggregation

```typescript
interface AggregationInput {
  l4Edges: BaseEdge[];
  containmentMap: Map<string, string>;  // childId -> parentId
}

interface AggregationOutput {
  l3Edges: AggregatedEdge[];       // Component-level
  l2Edges: AggregatedEdge[];       // Container-level
}
```

**Algorithm:**
1. For each L4 edge (e.g., method A calls method B), find the L3 parent of each endpoint.
2. If the L3 parents differ, create or increment an `AGGREGATED_DEPENDENCY` edge between them.
3. Repeat: for each L3 aggregated edge, find L2 parents. If they differ, aggregate to L2.
4. Set weight = `constituentEdgeCount / maxConstituentEdgeCount` (normalized).

### Pass 8: Embedding Generation

```typescript
interface EmbeddingInput {
  nodes: BaseNode[];
  source: Map<string, string>;     // nodeId -> source code text
}

interface EmbeddingOutput {
  embeddings: Map<string, Float32Array>;  // nodeId -> 384-dim vector
}
```

**Algorithm:**
1. For each L3 node, construct a text representation:
   ```
   [CLASS] UserService
   namespace: App\Service
   extends: AbstractService
   implements: UserServiceInterface
   methods: createUser, findById, updateProfile
   dependencies: UserRepository, EventDispatcher, Logger
   ```
2. Batch texts into groups of 32.
3. Run through `all-MiniLM-L6-v2` via `@huggingface/transformers` (ONNX runtime, runs locally).
4. Store resulting 384-dimensional vectors.

### Pass 9: Persistence

**Algorithm:**
1. Begin a DuckDB transaction.
2. For deleted files: remove all nodes where `file_path` matches, cascade-delete edges.
3. For modified files: upsert nodes (INSERT ON CONFLICT UPDATE), delete edges from old version, insert new edges.
4. For added files: insert new nodes and edges.
5. Update `file_hashes` table with new SHA-256 values.
6. Commit transaction.
7. Upsert vector embeddings into sqlite-vec.
8. Write analysis run metadata.

---

## 5. Staleness and Freshness System

### Content Hashing

```typescript
// packages/core/src/freshness/content-hasher.ts

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

interface FileHash {
  filePath: string;
  contentHash: string;
  fileSize: number;
  lastModified: Date;
}

async function hashFile(absolutePath: string): Promise<FileHash> {
  const content = await readFile(absolutePath);
  const hash = createHash('sha256').update(content).digest('hex');
  const stat = await stat(absolutePath);
  return {
    filePath: absolutePath,
    contentHash: hash,
    fileSize: stat.size,
    lastModified: stat.mtime,
  };
}
```

### Hash Registry

```typescript
// packages/core/src/freshness/hash-registry.ts

interface HashRegistry {
  getHash(filePath: string): Promise<string | null>;
  setHash(filePath: string, hash: string, size: number): Promise<void>;
  getChangedFiles(currentHashes: FileHash[]): Promise<ChangeSet>;
  removeFile(filePath: string): Promise<void>;
  getAllTrackedPaths(): Promise<string[]>;
}

interface ChangeSet {
  added: string[];
  modified: string[];
  deleted: string[];
}
```

Backed by the `file_hashes` table in DuckDB.

### Cascade Invalidation Algorithm

When a file changes, its nodes update directly. But nodes in other files that _depend_ on changed nodes must be marked stale, because their relationship data may be incorrect.

```typescript
// packages/core/src/freshness/cascade-invalidator.ts

interface CascadeInvalidator {
  invalidate(changedNodeIds: string[]): Promise<InvalidationResult>;
}

interface InvalidationResult {
  directlyChanged: string[];       // Nodes in modified files
  cascadeInvalidated: string[];    // Dependent nodes marked stale
  totalAffected: number;
}
```

**Algorithm:**

```
function cascadeInvalidate(changedNodeIds: string[]): InvalidationResult {
    staleSet = new Set(changedNodeIds)
    queue = [...changedNodeIds]
    depth = 0
    MAX_DEPTH = 3  // Prevent runaway cascades

    while queue is not empty AND depth < MAX_DEPTH:
        nextQueue = []
        for each nodeId in queue:
            // Find nodes that DEPEND ON this node (reverse edges)
            dependents = graphQuery("""
                FROM GRAPH_TABLE(sniffo_graph
                    MATCH (dep:nodes)-[e:edges]->(target:nodes)
                    WHERE target.id = ?
                      AND e.type IN ('EXTENDS', 'IMPLEMENTS', 'USES_TRAIT',
                                     'INJECTS', 'CALLS', 'INSTANTIATES',
                                     'RETURNS_TYPE', 'PARAMETER_TYPE')
                    COLUMNS (dep.id AS dependent_id)
                )
            """, [nodeId])

            for each dependent in dependents:
                if dependent.id NOT IN staleSet:
                    staleSet.add(dependent.id)
                    nextQueue.push(dependent.id)

        queue = nextQueue
        depth += 1

    // Mark all nodes in staleSet as is_stale = true
    UPDATE nodes SET is_stale = true WHERE id IN (staleSet)

    return { directlyChanged, cascadeInvalidated, totalAffected }
}
```

**Key design decisions:**
- Max cascade depth of 3 prevents marking the entire graph stale when a foundational class changes.
- Only structural dependencies (extends, implements, injects) cascade. Weak references (calls) do NOT cascade beyond depth 1.
- Stale nodes remain queryable -- they just carry a warning flag.
- Re-analyzing a stale node clears its stale flag and triggers a fresh cascade check.

### Pre-Commit Hook Integration

```bash
#!/bin/sh
# scripts/pre-commit-hook.sh
# Installed to .git/hooks/pre-commit

# Get list of staged files
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM)

if [ -z "$STAGED_FILES" ]; then
    exit 0
fi

# Check if sniffo is initialized
if [ ! -d ".sniffo" ]; then
    exit 0
fi

# Run incremental analysis on staged files only
npx sniffo analyze --incremental --files "$STAGED_FILES" --quiet

# Stage any changes to .sniffo/ so the graph is committed alongside code
git add .sniffo/

exit 0
```

```typescript
// packages/cli/src/commands/hook.ts

interface HookCommand {
  install(): Promise<void>;   // Copy hook to .git/hooks/pre-commit
  uninstall(): Promise<void>; // Remove hook
  status(): Promise<boolean>; // Check if hook is installed
}
```

**Hook behavior:**
1. Collects staged file paths from git.
2. Runs incremental analysis (Passes 2-9 on changed files only).
3. Re-stages `.sniffo/` so the updated graph ships with the commit.
4. Exits 0 always -- analysis failure should not block commits. Errors are logged to `.sniffo/analysis.log`.

---

## 6. Storage Design

### Directory Structure

```
<target-project>/
└── .sniffo/
    ├── config.json                 # Project configuration
    ├── graph.duckdb                # DuckDB database (graph + file hashes)
    ├── graph.duckdb.wal            # DuckDB WAL file
    ├── vectors.sqlite              # SQLite database with sqlite-vec
    ├── analysis.log                # Last analysis log
    ├── models/                     # Cached ML models
    │   └── all-MiniLM-L6-v2/
    │       └── onnx/
    │           ├── model.onnx
    │           └── tokenizer.json
    └── cache/
        └── ast/                    # Optional: cached AST for large files
```

### Config File

```json
{
  "version": "1.0.0",
  "projectName": "my-symfony-app",
  "languages": ["php"],
  "include": ["src/**/*.php", "config/**/*.yaml"],
  "exclude": ["vendor/**", "var/**", "tests/fixtures/**"],
  "containers": {
    "strategy": "psr4",
    "overrides": {
      "App\\Infrastructure": { "label": "Infrastructure Layer" },
      "App\\Domain": { "label": "Domain Layer" }
    }
  },
  "analysis": {
    "maxFileSize": 1048576,
    "embeddingBatchSize": 32,
    "cascadeMaxDepth": 3
  }
}
```

### DuckDB Store Implementation

```typescript
// packages/core/src/storage/duckdb-store.ts

import duckdb from 'duckdb-async';

interface DuckDBStore {
  readonly db: duckdb.Database;

  initialize(): Promise<void>;
  runMigrations(): Promise<void>;
  close(): Promise<void>;

  // Node operations
  upsertNode(node: BaseNode): Promise<void>;
  upsertNodes(nodes: BaseNode[]): Promise<void>;
  getNode(id: string): Promise<BaseNode | null>;
  getNodesByFile(filePath: string): Promise<BaseNode[]>;
  getNodesByLevel(level: GraphLevel): Promise<BaseNode[]>;
  getNodesByType(type: NodeType): Promise<BaseNode[]>;
  deleteNodesByFile(filePath: string): Promise<void>;
  markStale(nodeIds: string[]): Promise<void>;
  clearStale(nodeIds: string[]): Promise<void>;

  // Edge operations
  upsertEdge(edge: BaseEdge): Promise<void>;
  upsertEdges(edges: BaseEdge[]): Promise<void>;
  getEdgesFrom(nodeId: string): Promise<BaseEdge[]>;
  getEdgesTo(nodeId: string): Promise<BaseEdge[]>;
  getEdgesByLevel(level: GraphLevel): Promise<BaseEdge[]>;
  deleteEdgesByNode(nodeId: string): Promise<void>;

  // Graph queries (DuckPGQ)
  findDependents(nodeId: string, maxDepth: number): Promise<BaseNode[]>;
  findDependencies(nodeId: string, maxDepth: number): Promise<BaseNode[]>;
  shortestPath(fromId: string, toId: string): Promise<BaseNode[]>;
  getSubgraph(centerNodeId: string, radius: number): Promise<{ nodes: BaseNode[]; edges: BaseEdge[] }>;

  // Bulk operations for level views
  getGraphAtLevel(level: GraphLevel): Promise<{ nodes: BaseNode[]; edges: BaseEdge[] }>;

  // File hash operations
  getFileHash(filePath: string): Promise<string | null>;
  setFileHash(filePath: string, hash: string, size: number): Promise<void>;
  getAllFileHashes(): Promise<Map<string, string>>;
  removeFileHash(filePath: string): Promise<void>;

  // Analysis runs
  createRun(trigger: string): Promise<string>;
  completeRun(id: string, stats: AnalysisStats): Promise<void>;
  failRun(id: string, error: string): Promise<void>;
}
```

### SQLite Vector Store

```sql
-- Vector store schema (sqlite-vec)

CREATE TABLE IF NOT EXISTS embeddings (
    node_id     TEXT PRIMARY KEY,
    embedding   FLOAT32[384] NOT NULL,  -- sqlite-vec vector type
    text_input  TEXT NOT NULL,           -- The text that was embedded
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- sqlite-vec virtual table for similarity search
CREATE VIRTUAL TABLE IF NOT EXISTS vec_embeddings USING vec0(
    node_id TEXT PRIMARY KEY,
    embedding FLOAT32[384]
);
```

```typescript
// packages/core/src/storage/sqlite-vector-store.ts

import Database from 'better-sqlite3';

interface VectorStore {
  initialize(): Promise<void>;
  close(): Promise<void>;

  upsertEmbedding(nodeId: string, vector: Float32Array, textInput: string): Promise<void>;
  upsertEmbeddings(items: Array<{ nodeId: string; vector: Float32Array; textInput: string }>): Promise<void>;
  deleteEmbedding(nodeId: string): Promise<void>;

  // Similarity search: returns nodeIds ordered by cosine similarity
  searchSimilar(queryVector: Float32Array, limit: number): Promise<Array<{ nodeId: string; distance: number }>>;

  // Convenience: embed text then search
  searchByText(text: string, limit: number): Promise<Array<{ nodeId: string; distance: number }>>;
}
```

---

## 7. MCP Server Design

### Server Registration

```typescript
// packages/mcp-server/src/server.ts

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new McpServer({
  name: 'sniffo',
  version: '1.0.0',
});
```

### Tool Definitions

#### Tool 1: `sniffo_analyze`

```typescript
server.tool(
  'sniffo_analyze',
  'Analyze a codebase to build or update the knowledge graph. Use "full" for first run or major changes, "incremental" for updates.',
  {
    projectPath: z.string().describe('Absolute path to the project root'),
    mode: z.enum(['full', 'incremental']).default('incremental').describe('Analysis mode'),
    files: z.array(z.string()).optional().describe('Specific files to analyze (incremental only)'),
  },
  async ({ projectPath, mode, files }) => {
    // Returns:
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          status: 'completed',
          filesAnalyzed: 142,
          nodesCreated: 856,
          edgesCreated: 2341,
          duration: '4.2s',
          staleNodes: 0,
        })
      }]
    };
  }
);
```

#### Tool 2: `sniffo_query_graph`

```typescript
server.tool(
  'sniffo_query_graph',
  'Query the code knowledge graph. Returns nodes and their relationships at the specified level.',
  {
    projectPath: z.string().describe('Absolute path to the project root'),
    level: z.enum(['L1_SYSTEM', 'L2_CONTAINER', 'L3_COMPONENT', 'L4_CODE']).describe('Graph detail level'),
    filter: z.object({
      nodeTypes: z.array(z.string()).optional().describe('Filter by node types, e.g., ["CLASS", "INTERFACE"]'),
      edgeTypes: z.array(z.string()).optional().describe('Filter by edge types, e.g., ["EXTENDS", "IMPLEMENTS"]'),
      namespace: z.string().optional().describe('Filter by namespace prefix'),
      isStale: z.boolean().optional().describe('Filter stale/fresh nodes'),
    }).optional(),
    centerNode: z.string().optional().describe('Qualified name of center node for subgraph query'),
    radius: z.number().optional().default(2).describe('Hops from center node'),
    limit: z.number().optional().default(100).describe('Max nodes returned'),
  },
  async (params) => {
    // Returns: { nodes: BaseNode[], edges: BaseEdge[], truncated: boolean }
  }
);
```

#### Tool 3: `sniffo_search`

```typescript
server.tool(
  'sniffo_search',
  'Semantic search across the codebase using natural language. Finds relevant classes, interfaces, and functions by meaning.',
  {
    projectPath: z.string().describe('Absolute path to the project root'),
    query: z.string().describe('Natural language search query, e.g., "user authentication handling"'),
    limit: z.number().optional().default(10).describe('Max results'),
    nodeTypes: z.array(z.string()).optional().describe('Restrict to specific node types'),
  },
  async ({ projectPath, query, limit, nodeTypes }) => {
    // Returns: Array<{ node: BaseNode, similarity: number, context: string }>
  }
);
```

#### Tool 4: `sniffo_get_context`

```typescript
server.tool(
  'sniffo_get_context',
  'Get rich context for a code element: its dependencies, dependents, inheritance chain, and related components. Ideal for understanding a class before modifying it.',
  {
    projectPath: z.string().describe('Absolute path to the project root'),
    qualifiedName: z.string().describe('Fully qualified name, e.g., "App\\Service\\UserService"'),
    depth: z.number().optional().default(2).describe('How many hops of relationships to include'),
    includeSource: z.boolean().optional().default(false).describe('Include source code snippets'),
  },
  async (params) => {
    // Returns:
    // {
    //   node: BaseNode,
    //   container: ContainerNode,
    //   extends: BaseNode | null,
    //   implements: BaseNode[],
    //   usesTraits: BaseNode[],
    //   dependencies: Array<{ node: BaseNode, edgeType: string }>,
    //   dependents: Array<{ node: BaseNode, edgeType: string }>,
    //   members: CodeNode[],     // L4 children
    //   isStale: boolean,
    //   staleDependencies: string[],
    //   source?: string,
    // }
  }
);
```

#### Tool 5: `sniffo_explain_path`

```typescript
server.tool(
  'sniffo_explain_path',
  'Find and explain the relationship path between two code elements. Shows how they are connected through the dependency graph.',
  {
    projectPath: z.string().describe('Absolute path to the project root'),
    from: z.string().describe('Qualified name of the source element'),
    to: z.string().describe('Qualified name of the target element'),
    maxDepth: z.number().optional().default(5).describe('Maximum path length'),
  },
  async (params) => {
    // Returns:
    // {
    //   pathFound: boolean,
    //   path: Array<{ node: BaseNode, edge: BaseEdge | null }>,
    //   pathLength: number,
    //   alternativePaths: number,
    // }
  }
);
```

#### Tool 6: `sniffo_staleness_report`

```typescript
server.tool(
  'sniffo_staleness_report',
  'Get a report of stale (potentially outdated) nodes in the graph. Use this to check if the graph is trustworthy before querying.',
  {
    projectPath: z.string().describe('Absolute path to the project root'),
    refresh: z.boolean().optional().default(false).describe('Re-check file hashes before reporting'),
  },
  async (params) => {
    // Returns:
    // {
    //   totalNodes: number,
    //   staleNodes: number,
    //   stalePercentage: number,
    //   staleFiles: Array<{ path: string, nodeCount: number, lastAnalyzed: string }>,
    //   recommendation: 'graph_is_fresh' | 'incremental_update_recommended' | 'full_reanalysis_recommended',
    // }
  }
);
```

#### Tool 7: `sniffo_impact_analysis`

```typescript
server.tool(
  'sniffo_impact_analysis',
  'Analyze the impact of changing a code element. Returns all directly and transitively affected components.',
  {
    projectPath: z.string().describe('Absolute path to the project root'),
    qualifiedName: z.string().describe('Qualified name of the element being changed'),
    changeType: z.enum(['modify', 'delete', 'rename']).describe('Type of change planned'),
  },
  async (params) => {
    // Returns:
    // {
    //   directImpact: Array<{ node: BaseNode, relationship: string, risk: 'high' | 'medium' | 'low' }>,
    //   transitiveImpact: Array<{ node: BaseNode, depth: number, pathDescription: string }>,
    //   affectedTests: BaseNode[],
    //   riskSummary: string,
    // }
  }
);
```

### MCP Server Claude Code Configuration

Users register the server in their Claude Code config:

```json
{
  "mcpServers": {
    "sniffo": {
      "command": "npx",
      "args": ["@sniffo/mcp-server"],
      "env": {}
    }
  }
}
```

---

## 8. Web Server Design

### Architecture

The CLI `serve` command starts a Fastify HTTP server that:
1. Serves the pre-built React SPA from `@sniffo/web-ui` dist.
2. Exposes a REST API for graph data.
3. Runs a WebSocket for live updates during analysis.

```typescript
// packages/web-server/src/server.ts

import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import { resolve } from 'node:path';

interface WebServerConfig {
  projectPath: string;
  port: number;          // default 9876
  host: string;          // default '127.0.0.1'
}

async function createServer(config: WebServerConfig) {
  const app = Fastify({ logger: true });

  await app.register(fastifyWebsocket);
  await app.register(fastifyStatic, {
    root: resolve(__dirname, '../../web-ui/dist'),
    prefix: '/',
  });

  // API routes
  await app.register(graphRoutes, { prefix: '/api' });
  await app.register(searchRoutes, { prefix: '/api' });
  await app.register(analysisRoutes, { prefix: '/api' });
  await app.register(stalenessRoutes, { prefix: '/api' });
  await app.register(nodeRoutes, { prefix: '/api' });

  // WebSocket
  await app.register(graphUpdatesWs);

  return app;
}
```

### REST API Endpoints

#### `GET /api/graph`

Returns the graph at a specified level for visualization.

```
Query params:
  level: 'L1_SYSTEM' | 'L2_CONTAINER' | 'L3_COMPONENT' | 'L4_CODE'
  container?: string       -- Filter to nodes within a container (L3/L4 only)
  nodeTypes?: string       -- Comma-separated node type filter
  edgeTypes?: string       -- Comma-separated edge type filter

Response 200:
{
  "nodes": [
    {
      "id": "abc123",
      "type": "CLASS",
      "level": "L3_COMPONENT",
      "qualifiedName": "App\\Service\\UserService",
      "shortName": "UserService",
      "isStale": false,
      "metadata": { ... },
      // Visualization hints:
      "x": null,           // null = let layout engine decide
      "y": null,
      "size": 12,          // proportional to LOC or edge count
      "color": "#4A90D9"   // determined by node type
    }
  ],
  "edges": [
    {
      "id": "def456",
      "source": "abc123",
      "target": "ghi789",
      "type": "DEPENDS_ON",
      "weight": 0.8,
      "metadata": { ... }
    }
  ],
  "stats": {
    "totalNodes": 856,
    "totalEdges": 2341,
    "returnedNodes": 100,
    "returnedEdges": 234,
    "truncated": true
  }
}
```

#### `GET /api/node/:id`

Returns full detail for a single node including relationships.

```
Response 200:
{
  "node": { ... },
  "incomingEdges": [ ... ],
  "outgoingEdges": [ ... ],
  "parent": { ... },           // Container for L3, Component for L4
  "children": [ ... ],         // Components for L2, Code for L3
  "source": "<?php\nclass UserService {\n  ...\n}",   // Source code if available
  "embedding": {
    "hasEmbedding": true,
    "textInput": "..."
  }
}
```

#### `POST /api/search`

Semantic search.

```
Body:
{
  "query": "handles user authentication",
  "limit": 20,
  "nodeTypes": ["CLASS", "INTERFACE"]
}

Response 200:
{
  "results": [
    {
      "node": { ... },
      "similarity": 0.847,
      "snippet": "class AuthenticationService implements AuthenticatorInterface"
    }
  ]
}
```

#### `POST /api/analyze`

Trigger analysis from the web UI.

```
Body:
{
  "mode": "incremental"
}

Response 202:
{
  "runId": "run_abc123",
  "status": "started",
  "wsChannel": "analysis:run_abc123"
}
```

Progress streams over WebSocket.

#### `GET /api/staleness`

```
Response 200:
{
  "totalNodes": 856,
  "freshNodes": 842,
  "staleNodes": 14,
  "stalePercentage": 1.6,
  "staleByFile": [
    { "path": "src/Service/UserService.php", "nodeCount": 3, "lastAnalyzed": "2026-03-21T14:30:00Z" }
  ],
  "lastFullAnalysis": "2026-03-20T09:00:00Z",
  "recommendation": "incremental_update_recommended"
}
```

#### `GET /api/impact/:nodeId`

```
Query params:
  changeType: 'modify' | 'delete' | 'rename'

Response 200:
{
  "directImpact": [ ... ],
  "transitiveImpact": [ ... ],
  "riskLevel": "medium"
}
```

### WebSocket Protocol

```
Channel: /ws

Client -> Server messages:
  { "type": "subscribe", "channel": "graph-updates" }
  { "type": "subscribe", "channel": "analysis:<runId>" }
  { "type": "unsubscribe", "channel": "..." }

Server -> Client messages:
  { "type": "analysis:progress", "data": { "phase": "parsing", "current": 42, "total": 142, "file": "src/Service/UserService.php" } }
  { "type": "analysis:complete", "data": { "runId": "...", "stats": { ... } } }
  { "type": "graph:node-updated", "data": { "nodeId": "...", "action": "upsert" } }
  { "type": "graph:edge-updated", "data": { "edgeId": "...", "action": "upsert" } }
```

### Web UI Graph Rendering

```typescript
// packages/web-ui/src/lib/graph-adapter.ts

import Graph from 'graphology';
import { Sigma } from 'sigma';

interface GraphAdapter {
  // Convert API response to Graphology graph
  loadGraph(data: { nodes: ApiNode[]; edges: ApiEdge[] }): Graph;

  // Apply force-directed layout
  applyLayout(graph: Graph, options: LayoutOptions): void;

  // Handle level transitions with animation
  transitionToLevel(newLevel: GraphLevel, container?: string): Promise<void>;
}

interface LayoutOptions {
  algorithm: 'forceAtlas2';        // Default
  iterations: number;              // 100 for initial, 50 for incremental
  gravity: number;                 // Scales with node count
  scalingRatio: number;
  strongGravityMode: boolean;
  barnesHutOptimize: boolean;      // true for > 500 nodes
}
```

**Multi-level navigation:**
- L1 (System): Shows system node + external system nodes. Click a system node to drill into L2.
- L2 (Container): Shows containers as large nodes with aggregated edges. Click a container to drill into its L3 components.
- L3 (Component): Shows classes, interfaces, etc., with dependency edges. Click a component to see its L4 code members.
- L4 (Code): Shows methods, properties within a single component and their relationships (calls, type references).

Each level transition triggers a new API call with the appropriate filter, followed by a force-atlas2 layout pass.

---

## 9. Extension Points

### Adding a New Language Parser

**Step 1:** Create extractor directory.

```
packages/core/src/analysis/extractors/python/
├── python-extractor.ts
├── class-extractor.ts
├── function-extractor.ts
└── import-extractor.ts
```

**Step 2:** Implement the `LanguageExtractor` interface.

```typescript
// packages/core/src/analysis/extractors/extractor.interface.ts

interface LanguageExtractor {
  readonly language: SupportedLanguage;
  readonly grammarPath: string;          // Path to .wasm grammar
  readonly fileExtensions: string[];

  extractSymbols(tree: Parser.Tree, source: string, filePath: string): ExtractedSymbol[];
  extractRelationships(
    tree: Parser.Tree,
    source: string,
    filePath: string,
    localNodes: BaseNode[],
    nodeIndex: Map<string, string>,
  ): BaseEdge[];
  inferContainers(nodes: BaseNode[]): ContainerNode[];
}

interface ExtractedSymbol {
  node: BaseNode;
  sourceSpan: { start: number; end: number };
}
```

**Step 3:** Register the extractor.

```typescript
// packages/core/src/analysis/extractors/registry.ts

class ExtractorRegistry {
  private extractors = new Map<SupportedLanguage, LanguageExtractor>();

  register(extractor: LanguageExtractor): void {
    this.extractors.set(extractor.language, extractor);
  }

  getForLanguage(lang: SupportedLanguage): LanguageExtractor | undefined {
    return this.extractors.get(lang);
  }

  getForFile(filePath: string): LanguageExtractor | undefined {
    const ext = path.extname(filePath);
    for (const extractor of this.extractors.values()) {
      if (extractor.fileExtensions.includes(ext)) return extractor;
    }
    return undefined;
  }
}
```

**Step 4:** Add the Tree-sitter WASM grammar to `tree-sitter-grammars/`.

**Step 5:** Add the language to the `SupportedLanguage` type union.

That is it. The pipeline automatically picks up any registered extractor.

### Adding New Relationship Types

**Step 1:** Add the new edge type to the `EdgeType` union in `graph-edges.ts`.

**Step 2:** Implement extraction logic in the appropriate language extractor. For example, to add `LISTENS_TO` for Symfony event listeners:

```typescript
// In php-extractor.ts, add to extractRelationships:

function extractEventListenerEdges(
  tree: Parser.Tree,
  source: string,
  nodeIndex: Map<string, string>,
): BaseEdge[] {
  // Find getSubscribedEvents() methods, parse the returned array
  // to map event names -> handler methods
  // Create LISTENS_TO edges from the listener class to the event class
}
```

**Step 3:** Add visual styling for the new edge type in the web UI.

```typescript
// packages/web-ui/src/lib/edge-styles.ts
EDGE_STYLES['LISTENS_TO'] = {
  color: '#9B59B6',
  style: 'dashed',
  label: 'listens to',
};
```

**Step 4:** Decide whether the new edge type should participate in cascade invalidation. If yes, add it to the `CASCADING_EDGE_TYPES` constant in `cascade-invalidator.ts`.

### Adding a New MCP Tool

1. Create a new file in `packages/mcp-server/src/tools/`.
2. Define the tool using `server.tool(name, description, schema, handler)`.
3. Import and register in `server.ts`.

The core query engine provides all graph traversal primitives, so new tools typically compose existing query methods.

---

## 10. Architecture Decision Records

### ADR-001: Graph Database Selection

**Status:** Accepted

**Context:**
We need an embedded graph database that runs locally without an external server. KuzuDB was the leading candidate but was archived in October 2025. We need a replacement that supports property graph queries, is embeddable in a Node.js process, and has no external server requirement.

**Options Evaluated:**

| Option | Pros | Cons |
|--------|------|------|
| **DuckDB + DuckPGQ** | Mature, excellent Node.js bindings (`duckdb-async`), SQL-based property graph queries via DuckPGQ extension, single-file storage, fast analytical queries, active development, large community | DuckPGQ is an extension (not core), graph query syntax less mature than dedicated graph DBs |
| **FalkorDB Lite** | Purpose-built graph DB, Cypher support | Requires Redis protocol, not truly embeddable, limited Node.js integration, small community |
| **LadybugDB** | Designed for embedded use | Very new (2025), minimal ecosystem, uncertain stability |
| **SQLite + adjacency list** | Universal, battle-tested, trivial embedding | No native graph traversal -- recursive CTEs are verbose and slow beyond 3-4 hops, no path-finding primitives |
| **Neo4j Embedded** | Most mature graph DB | JVM dependency, heavy footprint, not suited for CLI tool |

**Decision:** DuckDB with the DuckPGQ extension.

**Rationale:**
1. **Maturity:** DuckDB is production-grade with excellent Node.js bindings.
2. **DuckPGQ:** Provides SQL/PGQ graph queries (CREATE PROPERTY GRAPH, MATCH patterns, shortest path) directly within DuckDB. This gives us true graph traversal without a separate database.
3. **Single file:** The entire database is one `.duckdb` file, perfect for `.sniffo/`.
4. **Analytical capability:** DuckDB's columnar engine is fast for aggregation queries (edge rollups, statistics).
5. **Fallback:** If DuckPGQ proves insufficient, the relational tables still work with recursive CTEs. We are not locked in.

**Risks:**
- DuckPGQ extension maturity. Mitigation: abstract all graph queries behind the `DuckDBStore` interface so we can swap implementations.
- DuckDB file size growth. Mitigation: periodic VACUUM, and the data volumes are small (thousands of nodes, not millions).

---

### ADR-002: Tree-sitter vs Language-Specific Parsers

**Status:** Accepted

**Context:**
We need to parse source code to extract structural information (classes, methods, relationships). Options range from language-specific parsers (e.g., `php-parser` for PHP, TypeScript Compiler API for TS) to universal parsers like Tree-sitter.

**Options Evaluated:**

| Option | Pros | Cons |
|--------|------|------|
| **Tree-sitter (WASM)** | Single parsing API for all languages, incremental parsing, battle-tested (used in editors like Neovim, Zed), WASM grammars work in Node.js, error-tolerant | Less semantic depth than native parsers, query patterns must be written per language, no type resolution |
| **Language-specific parsers** | Maximum accuracy, full type information, semantic understanding | Different API per language, heavy dependencies (TypeScript compiler is 50MB+), no incremental parsing, some parsers crash on syntax errors |
| **Hybrid** | Best of both worlds | Complexity, two code paths to maintain |

**Decision:** Tree-sitter with WASM grammars as the universal parser.

**Rationale:**
1. **Uniformity:** One `Parser` interface, one AST walking strategy. The `LanguageExtractor` interface adapts per language, but the parsing infrastructure is shared.
2. **Error tolerance:** Tree-sitter produces partial ASTs even with syntax errors. Critical for analyzing work-in-progress code.
3. **Incremental parsing:** Tree-sitter can re-parse only the changed portion of a file. Combined with our content hashing, this makes incremental analysis very fast.
4. **Multi-language by design:** Adding Python or Go support means adding a WASM grammar and an extractor -- no new parser dependency.
5. **Size:** WASM grammars are 200-500KB each. Vastly lighter than pulling in `typescript` (50MB) or `nikic/php-parser` via a PHP subprocess.

**Trade-off:** We lose deep type resolution that native parsers provide. For example, we cannot resolve `$this->service->doSomething()` to a specific class without type inference. Mitigation: use constructor parameter types and property type hints as heuristics. This covers 80%+ of Symfony/PHP code where DI is explicit.

---

### ADR-003: Monorepo Structure

**Status:** Accepted

**Context:**
The project has multiple distinct deliverables (MCP server, CLI, web UI, core library). We need to decide between a monorepo and multi-repo approach.

**Decision:** TypeScript monorepo with npm workspaces and Turborepo.

**Rationale:**
1. **Shared types:** Core type definitions (`BaseNode`, `BaseEdge`, etc.) are imported directly by MCP server, CLI, and web server. No version synchronization needed.
2. **Atomic changes:** A change to the graph schema updates types, storage, API, and UI in one commit.
3. **Single CI pipeline:** One test suite, one build, one release.
4. **Developer experience:** `turbo run dev --parallel` starts everything. No need to link packages manually.

**Package boundaries:**
- `@sniffo/core` has zero UI or transport dependencies. It can be used as a library.
- `@sniffo/mcp-server` depends only on core + MCP SDK.
- `@sniffo/web-ui` has zero server-side dependencies. It communicates via HTTP/WS.
- `@sniffo/cli` is the user-facing entry point that composes everything.

**Build tool:** Turborepo for task orchestration. It handles dependency ordering, caching, and parallel builds across packages.

---

### ADR-004: Embedded vs Client-Server Architecture

**Status:** Accepted

**Context:**
We need to decide whether the sniffo runs as an embedded library (in-process) or as a separate server that tools communicate with via IPC/HTTP.

**Options Evaluated:**

| Option | Pros | Cons |
|--------|------|------|
| **Fully embedded** | Zero network overhead, simple deployment, single process | MCP server and web server must share process, concurrent access to DuckDB needs care |
| **Client-server** | Clean separation, multiple clients, language-agnostic API | Extra process to manage, network overhead, more complex deployment |
| **Hybrid: embedded core, optional web server** | Core runs in-process for MCP/CLI, web server spawns separately when needed | Slight complexity in process management |

**Decision:** Hybrid embedded architecture.

**Rationale:**
1. **MCP server runs embedded:** The MCP server communicates via stdio with Claude. The core engine runs in the same Node.js process. No network layer. This is the primary usage mode.
2. **CLI runs embedded:** Same as MCP. Direct function calls to core.
3. **Web server is a separate concern:** When the user runs `sniffo serve`, it starts a Fastify HTTP server in the same process that also loads core. The web UI is a static SPA served by Fastify. This is acceptable because the web server is interactive (user actively viewing) and does not run concurrently with the MCP server.
4. **DuckDB concurrency:** DuckDB supports multiple readers but single writer. Since analysis (write) and querying (read) do not run truly in parallel within a single Node.js process (single-threaded event loop), this is not a problem. The pre-commit hook is a separate short-lived process, so it acquires a write lock briefly.

**Deployment model:**
```
Claude Code session:
  claude -> stdio -> [MCP Server + Core (in-process)] -> .sniffo/

User browsing:
  browser -> HTTP -> [Web Server + Core (in-process)] -> .sniffo/

Pre-commit hook:
  git commit -> hook script -> [CLI + Core (short-lived process)] -> .sniffo/
```

Only one writer process accesses `.sniffo/` at a time. The pre-commit hook runs synchronously (git waits for it), so there is no race with a running MCP server in a different terminal.

---

*End of System Design Document*