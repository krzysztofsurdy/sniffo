# Backend Technical Specification -- llmProjectContextualizer

Version: 1.0.0
Date: 2026-03-22
Status: Draft

---

## Table of Contents

1. [Parser Interface & PHP Implementation](#1-parser-interface--php-implementation)
2. [Analysis Pipeline Implementation](#2-analysis-pipeline-implementation)
3. [Incremental Update Algorithm](#3-incremental-update-algorithm)
4. [HTTP API Specification](#4-http-api-specification)
5. [MCP Tool Definitions](#5-mcp-tool-definitions)
6. [CLI Command Specs](#6-cli-command-specs)
7. [Error Handling & Edge Cases](#7-error-handling--edge-cases)

---

## 1. Parser Interface & PHP Implementation

### 1.1 Language Parser Interface

```typescript
// src/parsers/types.ts

interface ParsedSymbol {
  kind: SymbolKind;
  name: string;
  fqn: string; // Fully qualified name: App\Service\UserService
  filePath: string;
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
  modifiers: Modifier[];
  rawSource: string; // The source text of the entire declaration
  metadata: Record<string, unknown>;
}

enum SymbolKind {
  Namespace = 'namespace',
  Class = 'class',
  Interface = 'interface',
  Trait = 'trait',
  Enum = 'enum',
  Method = 'method',
  Function = 'function',
  Property = 'property',
  Constant = 'constant',
}

enum Modifier {
  Public = 'public',
  Protected = 'protected',
  Private = 'private',
  Static = 'static',
  Abstract = 'abstract',
  Final = 'final',
  Readonly = 'readonly',
}

interface ParsedReference {
  kind: ReferenceKind;
  sourceSymbolFqn: string;
  targetName: string; // May be unresolved short name, e.g. "UserService"
  targetFqn: string | null; // Resolved after cross-file pass, null initially
  filePath: string;
  line: number;
  column: number;
  context: string; // Short snippet for sourceContext on edge
}

enum ReferenceKind {
  Extends = 'extends',
  Implements = 'implements',
  Uses = 'uses', // trait use
  Calls = 'calls',
  Instantiates = 'instantiates',
  TypeReference = 'type_reference', // type hints, return types
  Imports = 'imports', // use statements
  Injects = 'injects', // constructor injection
}

interface ParsedFile {
  filePath: string;
  language: string;
  contentHash: string;
  symbols: ParsedSymbol[];
  references: ParsedReference[];
  imports: ImportStatement[];
  errors: ParseError[];
}

interface ImportStatement {
  originalName: string; // Full namespace path: App\Entity\User
  alias: string | null; // Alias if 'use ... as Alias'
  line: number;
}

interface ParseError {
  message: string;
  line: number;
  column: number;
  nodeType: string;
}

interface LanguageParser {
  readonly language: string;
  readonly fileExtensions: string[];

  initialize(): Promise<void>;
  canParse(filePath: string): boolean;
  parse(filePath: string, source: string): Promise<ParsedFile>;
  dispose(): void;
}
```

### 1.2 PHP Parser Implementation

```typescript
// src/parsers/php-parser.ts

import Parser from 'tree-sitter';
import PHP from 'tree-sitter-php';

class PhpParser implements LanguageParser {
  readonly language = 'php';
  readonly fileExtensions = ['.php'];

  private parser: Parser;
  private phpLanguage: any;

  async initialize(): Promise<void> {
    this.parser = new Parser();
    // tree-sitter-php exports { php, phpOnly } -- use php which handles <?php tags
    this.phpLanguage = PHP.php;
    this.parser.setLanguage(this.phpLanguage);
  }

  canParse(filePath: string): boolean {
    return this.fileExtensions.some(ext => filePath.endsWith(ext));
  }

  parse(filePath: string, source: string): Promise<ParsedFile> {
    // Implementation below
  }

  dispose(): void {
    // Tree-sitter parser cleanup if needed
  }
}
```

### 1.3 Tree-sitter Node Type Mapping

The PHP grammar (`tree-sitter-php`) produces an AST with specific node types. Below is the exhaustive mapping from Tree-sitter node types to graph symbols and references.

#### Symbol Extraction (AST Node -> Graph Node)

| Tree-sitter Node Type | Graph SymbolKind | Key Child Nodes |
|---|---|---|
| `namespace_definition` | Namespace | `name` (namespace_name) |
| `class_declaration` | Class | `name`, `base_clause`, `class_interface_clause`, `declaration_list` |
| `interface_declaration` | Interface | `name`, `base_clause`, `declaration_list` |
| `trait_declaration` | Trait | `name`, `declaration_list` |
| `enum_declaration` | Enum | `name`, `class_interface_clause`, `declaration_list` |
| `method_declaration` | Method | `name`, `visibility_modifier`, `formal_parameters`, `return_type`, `body` |
| `function_definition` | Function | `name`, `formal_parameters`, `return_type`, `body` |
| `property_declaration` | Property | `visibility_modifier`, `property_element` (contains `variable_name`) |
| `const_declaration` | Constant | `const_element` (contains `name`, `value`) |

#### Reference Extraction (AST Node -> Graph Edge)

| Tree-sitter Pattern | ReferenceKind | How to Extract |
|---|---|---|
| `class_declaration > base_clause > name` | Extends | Parent class name from `base_clause` |
| `class_declaration > class_interface_clause > name` | Implements | Each name in the interface clause |
| `use_declaration > name` (inside class body) | Uses (trait) | Trait names in `use_declaration` within `declaration_list` |
| `namespace_use_declaration` | Imports | Each `namespace_use_clause` child gives `originalName`; check for `namespace_aliasing_clause` for alias |
| `object_creation_expression` | Instantiates | The class name node (`name` or `qualified_name`) |
| `member_call_expression` | Calls | `name` child is the method name; `object` child is the receiver |
| `scoped_call_expression` | Calls (static) | `scope` is the class, `name` is the method |
| `function_call_expression` | Calls | `function` child gives the function name |
| Simple parameter type hints | TypeReference | `type` child of `simple_parameter`; union types via `union_type` |
| `return_type` | TypeReference | Return type declaration on method/function |
| `property_declaration > type` | TypeReference | Property type hint |
| Constructor parameter promotion | Injects + Property | `property_promotion_parameter` in constructor `formal_parameters`; the promoted parameter becomes both a Property symbol and an Injects reference |

#### AST Traversal Strategy

```typescript
// Visitor pattern over the Tree-sitter CST (concrete syntax tree)

interface AstVisitor {
  visitNamespace(node: Parser.SyntaxNode, ctx: VisitorContext): void;
  visitClass(node: Parser.SyntaxNode, ctx: VisitorContext): void;
  visitInterface(node: Parser.SyntaxNode, ctx: VisitorContext): void;
  visitTrait(node: Parser.SyntaxNode, ctx: VisitorContext): void;
  visitEnum(node: Parser.SyntaxNode, ctx: VisitorContext): void;
  visitMethod(node: Parser.SyntaxNode, ctx: VisitorContext): void;
  visitFunction(node: Parser.SyntaxNode, ctx: VisitorContext): void;
  visitProperty(node: Parser.SyntaxNode, ctx: VisitorContext): void;
  visitConstant(node: Parser.SyntaxNode, ctx: VisitorContext): void;
  visitUseDeclaration(node: Parser.SyntaxNode, ctx: VisitorContext): void;
  visitTraitUse(node: Parser.SyntaxNode, ctx: VisitorContext): void;
  visitExpression(node: Parser.SyntaxNode, ctx: VisitorContext): void;
}

interface VisitorContext {
  filePath: string;
  currentNamespace: string | null;
  currentClass: string | null;
  currentMethod: string | null;
  imports: Map<string, string>; // alias/short -> FQN
  symbols: ParsedSymbol[];
  references: ParsedReference[];
  errors: ParseError[];
}
```

The traversal walks the tree depth-first. When entering a `namespace_definition`, the `currentNamespace` is set and remains in scope until the next namespace or end of file. Class/interface/trait declarations push onto `currentClass`. Method/function declarations push onto `currentMethod`. These establish the FQN for every symbol:

- Namespace: `App\Service`
- Class inside namespace: `App\Service\UserService`
- Method inside class: `App\Service\UserService::findById`
- Property inside class: `App\Service\UserService::$repository`

#### Constructor Injection Detection

PHP constructor injection is the primary DI pattern in Symfony:

```typescript
// When visiting a method_declaration named "__construct":
// 1. Check each formal_parameter for `property_promotion_parameter` node type
// 2. If promoted: create both a Property symbol and an Injects reference
// 3. If not promoted but has a type hint with a class name: create Injects reference
//
// Example PHP:
//   public function __construct(
//     private readonly UserRepository $userRepository, // promoted
//     LoggerInterface $logger,                          // injected, not promoted
//   ) {}
//
// Produces:
//   - Property: UserService::$userRepository (from promotion)
//   - Reference(Injects): UserService -> UserRepository
//   - Reference(Injects): UserService -> LoggerInterface
//   - Reference(TypeReference): UserService -> LoggerInterface (the param type)
```

### 1.4 Parser Registry

```typescript
// src/parsers/parser-registry.ts

class ParserRegistry {
  private parsers: Map<string, LanguageParser> = new Map();

  async register(parser: LanguageParser): Promise<void> {
    await parser.initialize();
    this.parsers.set(parser.language, parser);
  }

  getParserForFile(filePath: string): LanguageParser | null {
    for (const parser of this.parsers.values()) {
      if (parser.canParse(filePath)) {
        return parser;
      }
    }
    return null;
  }

  getSupportedExtensions(): string[] {
    return Array.from(this.parsers.values()).flatMap(p => p.fileExtensions);
  }

  dispose(): void {
    for (const parser of this.parsers.values()) {
      parser.dispose();
    }
    this.parsers.clear();
  }
}
```

---

## 2. Analysis Pipeline Implementation

The analysis pipeline runs in five sequential passes. Each pass produces output consumed by the next. The pipeline is orchestrated by `AnalysisOrchestrator`.

```typescript
// src/analysis/orchestrator.ts

interface AnalysisOptions {
  rootDir: string;
  files?: string[];        // If set, only these files (incremental mode)
  skipEmbeddings?: boolean; // For fast mode / pre-commit hook
  concurrency?: number;    // Max parallel file parses (default: 4)
  timeout?: number;        // Per-file timeout in ms (default: 30000)
}

interface AnalysisResult {
  filesScanned: number;
  filesAnalyzed: number;
  filesSkipped: number;   // Unchanged (same content hash)
  filesFailed: number;
  symbolsFound: number;
  referencesResolved: number;
  referencesUnresolved: number;
  durationMs: number;
  errors: AnalysisError[];
}

interface AnalysisError {
  phase: 'scan' | 'parse' | 'resolve' | 'cluster' | 'embed';
  filePath: string | null;
  message: string;
  recoverable: boolean;
}

class AnalysisOrchestrator {
  constructor(
    private parserRegistry: ParserRegistry,
    private graphStore: GraphStore,
    private embeddingService: EmbeddingService,
    private config: AnalysisOptions,
  ) {}

  async analyze(): Promise<AnalysisResult> {
    const result = createEmptyResult();

    const scanResult = await this.pass1_scan();
    const parseResults = await this.pass2_parse(scanResult);
    const resolveResult = await this.pass3_resolve(parseResults);
    await this.pass4_cluster();
    if (!this.config.skipEmbeddings) {
      await this.pass5_embed();
    }

    return result;
  }
}
```

### 2.1 Pass 1: File System Scan

**Purpose**: Build the File and Folder graph nodes, determine which files need re-parsing.

**Input**: Root directory path, optional file list (incremental mode).

**Output**: `ScanResult` -- list of files to parse, folder structure.

```typescript
interface ScanResult {
  filesToParse: FileEntry[];   // Files that changed or are new
  filesToSkip: FileEntry[];    // Files with matching content hash
  filesToRemove: string[];     // Files in graph but no longer on disk
  folders: FolderEntry[];
}

interface FileEntry {
  path: string;          // Relative to rootDir
  absolutePath: string;
  contentHash: string;   // SHA-256 of file content
  sizeBytes: number;
  language: string | null;
}

interface FolderEntry {
  path: string;
  absolutePath: string;
  childFiles: string[];
  childFolders: string[];
}
```

**Algorithm**:

```
PASS1_SCAN(rootDir, fileList?):
  1. If fileList provided (incremental mode):
       candidates = fileList
     Else:
       candidates = recursively walk rootDir
       Exclude: .git, vendor, node_modules, .contextualizer, patterns from .gitignore

  2. For each candidate file:
       a. Check parserRegistry.getParserForFile(file) -- skip unsupported
       b. Compute contentHash = SHA-256(readFile(file))
       c. Query graph: existingNode = graphStore.getFileNode(file)
       d. If existingNode is null OR existingNode.contentHash != contentHash:
            Add to filesToParse
       Else:
            Add to filesToSkip

  3. If full scan (no fileList):
       a. Query all File nodes in graph
       b. For each graph file not found on disk:
            Add to filesToRemove

  4. Build folder tree from all candidate paths
       a. Upsert Folder nodes
       b. Create CONTAINS edges: Folder -> File, Folder -> Folder

  RETURN ScanResult
```

**Performance considerations**:
- File hashing is I/O bound. Use `crypto.createHash('sha256')` with streaming for files over 1MB.
- Cap at 50,000 files. Emit warning and skip beyond that.
- Respect `.gitignore` patterns using the `ignore` npm package parsing `.gitignore` at each directory level.

**Error handling**:
- Permission denied on file read: log warning, skip file, add to `errors` as recoverable.
- Symlink loops: track visited inodes, skip duplicates.

### 2.2 Pass 2: AST Parsing (Per-File Symbols)

**Purpose**: Parse each changed file, extract symbols and unresolved references.

**Input**: `ScanResult.filesToParse`

**Output**: `Map<string, ParsedFile>` -- one entry per successfully parsed file.

**Algorithm**:

```
PASS2_PARSE(filesToParse):
  results = new Map<string, ParsedFile>()
  queue = new AsyncQueue(concurrency = config.concurrency)

  For each file in filesToParse:
    queue.add(async () => {
      parser = parserRegistry.getParserForFile(file.path)
      source = readFile(file.absolutePath)

      parsedFile = await withTimeout(
        parser.parse(file.path, source),
        config.timeout
      )

      // Persist: upsert File node with new contentHash and lastAnalyzedAt
      graphStore.upsertFileNode({
        id: deterministicId(file.path),
        filePath: file.path,
        contentHash: file.contentHash,
        lastAnalyzedAt: Date.now(),
        language: parser.language,
      })

      // Remove old symbols for this file, then insert new ones
      graphStore.removeSymbolsForFile(file.path)

      For each symbol in parsedFile.symbols:
        graphStore.upsertSymbolNode(symbol)
        graphStore.createEdge('DEFINES', fileNodeId, symbol.id)
        if symbol is inside a class:
          graphStore.createEdge('MEMBER_OF', symbol.id, classNodeId)

      results.set(file.path, parsedFile)
    })

  await queue.drain()
  RETURN results
```

**Concurrency model**: Use a bounded async queue (e.g., `p-limit` or custom). Default concurrency of 4 balances CPU (Tree-sitter parsing) and memory (AST retention).

**Per-file timeout**: 30 seconds default. Files exceeding this are logged as errors, skipped, and the File node is marked with `analysisError: 'timeout'`.

**Error handling**:
- Tree-sitter parse errors: Tree-sitter is error-tolerant; it produces a tree with `ERROR` nodes. Collect these as `ParseError` entries but still extract what is possible from the valid portions.
- File read errors mid-parse (deleted between scan and parse): skip, log as recoverable error.

**Content hash as deterministic ID seed**: Node IDs are generated as `sha256(filePath + '::' + fqn)`. This gives stable IDs across runs for the same symbol at the same path.

### 2.3 Pass 3: Cross-File Resolution

**Purpose**: Resolve unresolved references using import tables and the full symbol index. Create edges between symbols.

**Input**: `Map<string, ParsedFile>` from Pass 2, plus existing graph data.

**Output**: Resolved edges persisted to graph. Unresolved references logged.

```
PASS3_RESOLVE(parsedFiles):
  // Build the global symbol index from graph
  symbolIndex = graphStore.getAllSymbols()
  // Map<fqn, NodeId>

  For each (filePath, parsedFile) in parsedFiles:
    importMap = buildImportMap(parsedFile.imports)
    // importMap: shortName -> FQN
    // e.g., "User" -> "App\Entity\User"
    // Also includes current namespace for unqualified lookups

    For each ref in parsedFile.references:
      resolvedFqn = resolveReference(ref.targetName, importMap, parsedFile.currentNamespace)

      If resolvedFqn is null:
        // Try fuzzy: search symbolIndex for symbols ending with ref.targetName
        candidates = symbolIndex.findByShortName(ref.targetName)
        If candidates.length == 1:
          resolvedFqn = candidates[0].fqn
          confidence = 0.8  // Lower confidence for fuzzy match
        Else:
          Log unresolved reference
          Continue

      targetNodeId = symbolIndex.get(resolvedFqn)
      If targetNodeId is null:
        Log unresolved (symbol not in graph -- may be external/vendor)
        Continue

      sourceNodeId = symbolIndex.get(ref.sourceSymbolFqn)
      edgeType = mapReferenceKindToEdgeType(ref.kind)

      graphStore.upsertEdge({
        type: edgeType,
        sourceId: sourceNodeId,
        targetId: targetNodeId,
        confidence: confidence ?? 1.0,
        relationType: ref.kind,
        sourceContext: ref.context,
        filePath: filePath,
        line: ref.line,
        lastAnalyzedAt: Date.now(),
      })
```

**Reference resolution order**:
1. Exact match against import map (alias -> FQN)
2. Same-namespace lookup (currentNamespace + `\` + shortName)
3. Global namespace lookup (`\` + shortName)
4. Fuzzy single-candidate match (short name suffix search)

**Edge type mapping**:

| ReferenceKind | Edge Type |
|---|---|
| Extends | EXTENDS |
| Implements | IMPLEMENTS |
| Uses (trait) | USES |
| Calls | CALLS |
| Instantiates | CALLS (with relationType: 'instantiates') |
| TypeReference | USES (with relationType: 'type_reference') |
| Imports | IMPORTS |
| Injects | INJECTS |

**Confidence values**:
- 1.0: Exact match via import map or FQN
- 0.8: Fuzzy single-candidate match
- 0.6: Fuzzy multi-candidate with heuristic selection (not recommended, prefer logging as unresolved)

**Performance considerations**:
- The symbol index should be loaded into an in-memory Map for O(1) lookups by FQN.
- A secondary index by short name (last segment of FQN) is needed for fuzzy matching, stored as `Map<string, NodeId[]>`.
- For large codebases (10k+ symbols), the index fits comfortably in memory (< 50MB).

### 2.4 Pass 4: Community Detection / Clustering

**Purpose**: Group related nodes into logical modules for the web UI's hierarchical view.

**Input**: The graph with all nodes and edges.

**Output**: `Module` nodes and `CONTAINS` edges from Module to its members.

**Algorithm**: Label Propagation (simple, deterministic enough for this use case).

```
PASS4_CLUSTER():
  // Use namespace hierarchy as the primary clustering signal
  // This is a PHP-aware heuristic: namespace = module

  allClasses = graphStore.getNodesByKind(['class', 'interface', 'trait', 'enum'])

  namespaceGroups = groupBy(allClasses, node => {
    // Extract top-level namespace segment(s)
    // "App\Service\User\UserService" -> "App\Service\User"
    parts = node.fqn.split('\\')
    return parts.slice(0, -1).join('\\')  // Everything except the class name
  })

  For each (namespace, members) in namespaceGroups:
    moduleId = deterministicId('module::' + namespace)
    graphStore.upsertNode({
      id: moduleId,
      kind: 'module',
      name: namespace,
      filePath: null,
      metadata: { memberCount: members.length },
    })

    For each member in members:
      graphStore.upsertEdge({
        type: 'CONTAINS',
        sourceId: moduleId,
        targetId: member.id,
      })

  // Secondary: detect cross-module coupling
  // Count edges between modules; store as Module-to-Module CALLS edges
  // with weight = edge count (useful for UI visualization)
  modulePairs = graphStore.query(`
    MATCH (m1:Module)-[:CONTAINS]->(a)-[e:CALLS|USES|INJECTS]->(b)<-[:CONTAINS]-(m2:Module)
    WHERE m1 <> m2
    RETURN m1.id, m2.id, COUNT(e) AS weight
  `)

  For each (m1Id, m2Id, weight) in modulePairs:
    graphStore.upsertEdge({
      type: 'CALLS',
      sourceId: m1Id,
      targetId: m2Id,
      metadata: { weight, relationType: 'module_coupling' },
    })
```

**Performance**: This pass is a graph-only operation. For a codebase with 500 classes in 50 namespaces, it completes in milliseconds against KuzuDB.

### 2.5 Pass 5: Embedding Generation

**Purpose**: Generate vector embeddings for semantic search.

**Input**: All symbol nodes (new or changed since last embedding).

**Output**: Embeddings stored alongside nodes.

```typescript
interface EmbeddingService {
  initialize(): Promise<void>;
  embed(texts: string[]): Promise<Float32Array[]>;
  search(query: string, topK: number): Promise<EmbeddingSearchResult[]>;
  dispose(): void;
}

interface EmbeddingSearchResult {
  nodeId: string;
  score: number; // cosine similarity
}

// Implementation using transformers.js
// Model: Xenova/all-MiniLM-L6-v2 (384-dimensional embeddings)
// Runs locally, no API calls.
```

**Algorithm**:

```
PASS5_EMBED():
  // Get nodes that need embedding (new or changed)
  nodes = graphStore.getNodesNeedingEmbedding()

  // Build embedding text for each node
  texts = nodes.map(node => buildEmbeddingText(node))

  // Batch embed (transformers.js supports batching)
  BATCH_SIZE = 64
  For each batch of texts (size BATCH_SIZE):
    embeddings = await embeddingService.embed(batch)
    For each (node, embedding) in zip(batchNodes, embeddings):
      graphStore.storeEmbedding(node.id, embedding)

FUNCTION buildEmbeddingText(node):
  // Concatenate meaningful text for embedding quality
  parts = []
  parts.push(node.kind + ': ' + node.name)
  parts.push('namespace: ' + extractNamespace(node.fqn))
  If node.kind == 'method' or node.kind == 'function':
    parts.push('parameters: ' + node.metadata.parameterSignature)
    parts.push('returns: ' + node.metadata.returnType)
  If node.metadata.docblock:
    parts.push(node.metadata.docblock)
  RETURN parts.join(' | ')
```

**Embedding storage**: Store embeddings as a separate table/column in KuzuDB or as a flat binary file (`.contextualizer/embeddings.bin`) with an index mapping nodeId to byte offset. KuzuDB does not natively support vector search, so a lightweight in-memory index is built at startup using brute-force cosine similarity. For codebases under 50k symbols, brute-force over 384-dimensional vectors is sub-100ms.

**Performance considerations**:
- First run of transformers.js downloads the model (~80MB). Cache in `.contextualizer/models/`.
- Embedding 1000 texts at batch size 64 takes roughly 10-15 seconds on CPU.
- Pre-commit hook uses `skipEmbeddings: true` to skip this pass entirely.

---

## 3. Incremental Update Algorithm

### 3.1 Update Flow

```
INCREMENTAL_UPDATE(changedFiles: string[]):

  // PHASE 1: Determine what changed
  changedSet = new Set<string>()
  For each file in changedFiles:
    currentHash = SHA-256(readFile(file))
    storedHash = graphStore.getFileNode(file)?.contentHash
    If currentHash != storedHash:
      changedSet.add(file)

  If changedSet.size == 0:
    RETURN "Nothing changed"

  // PHASE 2: Re-parse changed files (Pass 2)
  parseResults = await pass2_parse(changedSet)

  // PHASE 3: Cascade invalidation
  invalidatedNodeIds = cascadeInvalidation(changedSet)

  // PHASE 4: Re-resolve references for changed + invalidated files
  filesToResolve = union(changedSet, getFilesForNodes(invalidatedNodeIds))
  await pass3_resolve(filesToResolve)

  // PHASE 5: Update clusters if structural changes occurred
  If hasStructuralChanges(parseResults):
    await pass4_cluster()

  // PHASE 6: Re-embed changed nodes (if not skipped)
  await pass5_embed()  // Only embeds nodes flagged as needing it
```

### 3.2 Content Hash Comparison

```typescript
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

async function computeContentHash(filePath: string): Promise<string> {
  const content = await readFile(filePath);
  return createHash('sha256').update(content).digest('hex');
}

// Content hash is stored on every File node and every symbol node.
// File-level hash: hash of the entire file content.
// Symbol-level hash: hash of the raw source text of the symbol declaration.
// Symbol-level hashes allow detecting that a class changed but a specific
// method within it did not (future optimization for finer-grained skipping).
```

### 3.3 Cascade Invalidation Algorithm

When a file changes, symbols defined in that file may have changed signature/behavior. Any edge pointing TO those symbols from OTHER files must be marked as stale (needs re-verification).

```
CASCADE_INVALIDATION(changedFiles: Set<string>):
  // Step 1: Collect all symbol node IDs defined in changed files
  changedNodeIds = new Set<string>()
  For each file in changedFiles:
    symbols = graphStore.getSymbolsInFile(file)
    For each symbol in symbols:
      changedNodeIds.add(symbol.id)

  // Step 2: BFS -- find all edges pointing TO changed nodes
  invalidatedEdges = new Set<string>()
  invalidatedNodes = new Set<string>()
  queue = [...changedNodeIds]
  visited = new Set<string>(changedNodeIds)
  depth = 0
  MAX_DEPTH = 2  // Limit cascade to 2 hops to avoid avalanche

  While queue.length > 0 AND depth < MAX_DEPTH:
    nextQueue = []
    For each nodeId in queue:
      // Find all edges where targetId == nodeId (incoming edges)
      incomingEdges = graphStore.getIncomingEdges(nodeId)
      For each edge in incomingEdges:
        invalidatedEdges.add(edge.id)
        // Mark edge as stale
        graphStore.markEdgeStale(edge.id, {
          staleReason: 'target_changed',
          staleSince: Date.now(),
        })

        // The source node of this edge may need re-verification
        If NOT visited.has(edge.sourceId):
          // Only cascade through EXTENDS and IMPLEMENTS (structural inheritance)
          // Do NOT cascade through CALLS (too many false positives)
          If edge.type IN ['EXTENDS', 'IMPLEMENTS', 'USES']:
            visited.add(edge.sourceId)
            nextQueue.push(edge.sourceId)
          invalidatedNodes.add(edge.sourceId)

    queue = nextQueue
    depth++

  RETURN {
    invalidatedEdges,
    invalidatedNodes,
    stats: {
      directlyChanged: changedNodeIds.size,
      cascadeInvalidated: invalidatedNodes.size,
      edgesMarkedStale: invalidatedEdges.size,
      cascadeDepth: depth,
    }
  }
```

**Key design decisions**:
- **MAX_DEPTH = 2**: Limits cascade to prevent marking the entire graph stale when a widely-used base class changes. Depth 2 covers: direct dependents and their structural parents.
- **Only cascade through structural edges**: EXTENDS, IMPLEMENTS, USES (trait). A change to ClassA that is extended by ClassB means ClassB's contract may have changed. But ClassC that merely calls ClassA does not need its own dependents invalidated.
- **CALLS edges are marked stale but not cascaded**: If ClassA changes, all CALLS edges pointing to ClassA are marked stale, but the source nodes of those CALLS edges do not propagate further.

### 3.4 State Categories

Every node and edge is in one of three states:

| State | Meaning | Visual in UI |
|---|---|---|
| `clean` | Analyzed and up to date | Green / normal |
| `stale` | Target changed, edge may be incorrect | Yellow / warning |
| `dirty` | File changed, not yet re-analyzed | Red / error |

```typescript
interface FreshnessMetadata {
  state: 'clean' | 'stale' | 'dirty';
  staleSince?: number;       // Timestamp when marked stale
  staleReason?: string;      // Why it was invalidated
  lastAnalyzedAt: number;    // When last successfully analyzed
  contentHash: string;       // Hash at time of analysis
}
```

---

## 4. HTTP API Specification

Base URL: `http://localhost:{port}/api` (default port: 3100)

All responses follow this envelope:

```typescript
interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: {
    code: string;
    message: string;
  };
  meta?: {
    total?: number;
    page?: number;
    pageSize?: number;
    durationMs: number;
  };
}
```

### 4.1 GET /api/graph/:level

Returns graph data at the specified abstraction level for the web UI visualization.

**Path parameters**:
- `level`: `'module'` | `'namespace'` | `'class'` | `'method'`

**Query parameters**:
- `namespace?: string` -- Filter to a specific namespace subtree
- `maxNodes?: number` -- Limit node count (default: 200)
- `includeStale?: boolean` -- Include stale edges (default: true)

**Response**:

```typescript
interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
  levels: string[];        // Available drill-down levels
  currentLevel: string;
}

interface GraphNode {
  id: string;
  kind: SymbolKind | 'module' | 'file' | 'folder';
  name: string;
  fqn: string;
  filePath: string | null;
  childCount: number;      // Number of children for drill-down indicator
  state: 'clean' | 'stale' | 'dirty';
  metadata: Record<string, unknown>;
}

interface GraphEdge {
  id: string;
  source: string;          // Source node ID
  target: string;          // Target node ID
  type: string;            // CALLS, EXTENDS, etc.
  label: string;           // Human-readable label
  state: 'clean' | 'stale' | 'dirty';
  confidence: number;
  weight?: number;         // For module-level coupling
}
```

**Example**: `GET /api/graph/module` returns all Module nodes with inter-module edges (CALLS with weight). `GET /api/graph/class?namespace=App\Service` returns all classes in that namespace with their inter-class edges.

### 4.2 GET /api/node/:id

Returns full details for a single node.

**Response**:

```typescript
interface NodeDetailResponse {
  node: GraphNode & {
    startLine: number;
    endLine: number;
    modifiers: string[];
    contentHash: string;
    lastAnalyzedAt: number;
    source?: string;        // Raw source code (if requested)
  };
  incomingEdges: GraphEdge[];   // Edges pointing TO this node
  outgoingEdges: GraphEdge[];   // Edges FROM this node
  breadcrumb: BreadcrumbItem[]; // Module > Namespace > Class > Method
}

interface BreadcrumbItem {
  id: string;
  name: string;
  kind: string;
}
```

### 4.3 GET /api/node/:id/children

Returns the direct children of a node for drill-down navigation.

**Query parameters**:
- `kind?: string` -- Filter children by kind (e.g., 'method', 'property')
- `page?: number` -- Pagination (default: 1)
- `pageSize?: number` -- Items per page (default: 50)

**Response**:

```typescript
interface ChildrenResponse {
  parentId: string;
  children: GraphNode[];
  edges: GraphEdge[];  // Edges between children (for sub-graph view)
}
```

### 4.4 GET /api/edges

Returns edges filtered by type and optionally scoped.

**Query parameters**:
- `type: string` -- Edge type: CALLS, EXTENDS, IMPLEMENTS, USES, INJECTS, IMPORTS, CONTAINS, DEFINES, MEMBER_OF
- `sourceId?: string` -- Filter by source node
- `targetId?: string` -- Filter by target node
- `state?: string` -- Filter by state: clean, stale, dirty
- `minConfidence?: number` -- Minimum confidence threshold (default: 0.0)
- `page?: number`
- `pageSize?: number` (default: 100)

**Response**:

```typescript
interface EdgesResponse {
  edges: (GraphEdge & {
    sourceName: string;
    targetName: string;
    sourceContext: string;
    filePath: string;
    line: number;
  })[];
}
```

### 4.5 GET /api/search

Performs combined text and semantic search.

**Query parameters**:
- `q: string` -- Search query
- `kind?: string` -- Filter by symbol kind
- `mode?: 'text' | 'semantic' | 'hybrid'` (default: 'hybrid')
- `limit?: number` (default: 20)

**Response**:

```typescript
interface SearchResponse {
  results: SearchResult[];
}

interface SearchResult {
  node: GraphNode;
  score: number;        // Combined relevance score (0-1)
  matchType: 'text' | 'semantic' | 'both';
  highlights: string[]; // Matched fragments for text results
}
```

**Search algorithm**:
- `text`: FQN substring match + name match, scored by match quality.
- `semantic`: Embed query via transformers.js, cosine similarity against stored embeddings.
- `hybrid`: Run both, merge results. Text matches get a 0.3 boost (exact matches are more relevant). De-duplicate by nodeId, take the higher score.

### 4.6 POST /api/refresh

Triggers an incremental analysis.

**Request body**:

```typescript
interface RefreshRequest {
  files?: string[];       // Specific files to re-analyze (default: detect changed via git)
  full?: boolean;         // Force full re-analysis (default: false)
  skipEmbeddings?: boolean;
}
```

**Response**:

```typescript
interface RefreshResponse {
  status: 'started' | 'already_running';
  jobId: string;
}
```

Analysis runs in the background. Poll status via `GET /api/status`.

### 4.7 GET /api/status

Returns the current analysis status and freshness report.

**Response**:

```typescript
interface StatusResponse {
  analysisState: 'idle' | 'running' | 'error';
  currentJob?: {
    jobId: string;
    phase: string;       // 'scan', 'parse', 'resolve', 'cluster', 'embed'
    progress: number;    // 0-100
    startedAt: number;
  };
  freshness: {
    totalNodes: number;
    cleanNodes: number;
    staleNodes: number;
    dirtyNodes: number;
    totalEdges: number;
    cleanEdges: number;
    staleEdges: number;
    lastFullAnalysis: number | null; // Timestamp
    lastIncrementalUpdate: number | null;
  };
  database: {
    sizeBytes: number;
    nodeCount: number;
    edgeCount: number;
  };
}
```

### 4.8 CORS & Security

- CORS: Allow only `localhost` origins (configurable).
- No authentication (local tool only, not exposed to network by default).
- Bind to `127.0.0.1` by default, not `0.0.0.0`.
- Rate limit `POST /api/refresh` to 1 concurrent job.

---

## 5. MCP Tool Definitions

All tools are registered via `@modelcontextprotocol/sdk` and exposed to Claude via the MCP protocol.

```typescript
// src/mcp/tools.ts

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
```

### 5.1 analyze_project

Full project analysis.

```typescript
server.tool(
  'analyze_project',
  'Run a full analysis of the project codebase. Parses all supported files, extracts symbols and relationships, builds the knowledge graph, and generates embeddings for semantic search.',
  {
    rootDir: z.string().describe('Absolute path to the project root directory'),
    skipEmbeddings: z.boolean().optional().describe('Skip embedding generation for faster analysis'),
  },
  async ({ rootDir, skipEmbeddings }) => {
    // Returns: { filesAnalyzed, symbolsFound, edgesCreated, durationMs, errors[] }
  }
);
```

**Returns**: Text summary of analysis results suitable for Claude to read.

### 5.2 analyze_path

Scoped analysis of a specific directory or file.

```typescript
server.tool(
  'analyze_path',
  'Analyze a specific file or directory within the project. Useful for focusing on a subsystem.',
  {
    path: z.string().describe('Relative or absolute path to analyze'),
    recursive: z.boolean().optional().default(true).describe('Include subdirectories'),
  },
  async ({ path, recursive }) => {
    // Runs pipeline scoped to path
  }
);
```

### 5.3 query_graph

Execute a raw Cypher query against the knowledge graph.

```typescript
server.tool(
  'query_graph',
  'Execute a Cypher query against the knowledge graph. Use this for custom graph traversals not covered by other tools.',
  {
    query: z.string().describe('Cypher query string. Available node labels: Module, Namespace, Class, Interface, Trait, Method, Function, Property, File, Folder. Available edge types: CONTAINS, DEFINES, IMPORTS, CALLS, EXTENDS, IMPLEMENTS, USES, INJECTS, MEMBER_OF.'),
    params: z.record(z.unknown()).optional().describe('Query parameters as key-value pairs'),
  },
  async ({ query, params }) => {
    // Execute against KuzuDB, return tabular results formatted as markdown table
  }
);
```

### 5.4 find_references

Find all references to a symbol.

```typescript
server.tool(
  'find_references',
  'Find all places where a symbol is referenced (called, extended, implemented, used, injected). Returns the list of referencing symbols with file locations.',
  {
    symbolName: z.string().describe('Fully qualified name or short name of the symbol'),
    referenceTypes: z.array(z.enum([
      'CALLS', 'EXTENDS', 'IMPLEMENTS', 'USES', 'INJECTS', 'IMPORTS',
    ])).optional().describe('Filter by reference types. Default: all types.'),
  },
  async ({ symbolName, referenceTypes }) => {
    // Query: MATCH (source)-[e]->(target) WHERE target.fqn CONTAINS symbolName
    // Filter by edge types if provided
    // Return: list of { source, edgeType, filePath, line, context }
  }
);
```

### 5.5 find_dependencies

What does symbol X depend on?

```typescript
server.tool(
  'find_dependencies',
  'Find all symbols that a given symbol depends on (outgoing relationships). Shows what a class/method calls, extends, implements, uses, or injects.',
  {
    symbolName: z.string().describe('Fully qualified name or short name'),
    depth: z.number().optional().default(1).describe('How many hops to traverse (1 = direct deps, 2 = transitive)'),
    edgeTypes: z.array(z.string()).optional().describe('Filter by edge types'),
  },
  async ({ symbolName, depth, edgeTypes }) => {
    // BFS outgoing edges from the symbol, up to depth
    // Return tree structure of dependencies
  }
);
```

### 5.6 find_dependents

What depends on symbol X?

```typescript
server.tool(
  'find_dependents',
  'Find all symbols that depend on a given symbol (incoming relationships). Shows what calls, extends, implements, uses, or injects the target.',
  {
    symbolName: z.string().describe('Fully qualified name or short name'),
    depth: z.number().optional().default(1).describe('How many hops to traverse'),
    edgeTypes: z.array(z.string()).optional().describe('Filter by edge types'),
  },
  async ({ symbolName, depth, edgeTypes }) => {
    // BFS incoming edges to the symbol, up to depth
  }
);
```

### 5.7 semantic_search

Vector similarity search.

```typescript
server.tool(
  'semantic_search',
  'Search for symbols by natural language description. Uses vector embeddings to find semantically similar code elements.',
  {
    query: z.string().describe('Natural language description of what you are looking for'),
    limit: z.number().optional().default(10).describe('Maximum results to return'),
    kind: z.enum([
      'class', 'interface', 'trait', 'method', 'function', 'property',
    ]).optional().describe('Filter by symbol kind'),
  },
  async ({ query, limit, kind }) => {
    // Embed query, cosine similarity search, return ranked results
  }
);
```

### 5.8 get_freshness

Staleness report.

```typescript
server.tool(
  'get_freshness',
  'Get a freshness report showing which parts of the codebase are up-to-date, stale, or dirty. Useful for understanding analysis coverage and reliability.',
  {
    scope: z.string().optional().describe('Namespace or path to scope the report'),
    verbose: z.boolean().optional().default(false).describe('Include per-file details'),
  },
  async ({ scope, verbose }) => {
    // Query all nodes, group by state, return summary
    // If verbose: include list of stale/dirty files with reasons
  }
);
```

### 5.9 refresh

Trigger incremental update.

```typescript
server.tool(
  'refresh',
  'Trigger an incremental update of the knowledge graph. Detects changed files, re-parses them, and updates relationships. Use after making code changes.',
  {
    files: z.array(z.string()).optional().describe('Specific files to refresh. Default: auto-detect via git diff.'),
    full: z.boolean().optional().default(false).describe('Force full re-analysis'),
  },
  async ({ files, full }) => {
    // If no files specified, use: git diff --name-only HEAD
    // Run incremental update pipeline
    // Return summary of changes
  }
);
```

---

## 6. CLI Command Specs

CLI built with Commander.js. Binary name: `contextualizer`.

```typescript
// src/cli/index.ts

import { Command } from 'commander';

const program = new Command()
  .name('contextualizer')
  .description('Codebase knowledge graph analyzer')
  .version('0.1.0');
```

### 6.1 contextualizer init

```
Usage: contextualizer init [options]

Setup the contextualizer for a project.

Options:
  --no-hooks    Skip git hook installation
  --db-path     Custom path for the database (default: .contextualizer/)

Behavior:
  1. Create .contextualizer/ directory in project root
     .contextualizer/
       config.json        -- project configuration
       db/                -- KuzuDB database files
       embeddings/        -- embedding vectors
       models/            -- cached ML models
  2. Create .contextualizer/config.json with defaults:
     {
       "version": 1,
       "rootDir": ".",
       "include": ["**/*.php"],
       "exclude": ["vendor/**", "tests/**", "var/**"],
       "analysis": {
         "concurrency": 4,
         "fileTimeout": 30000,
         "maxFileSize": 1048576,
         "cascadeDepth": 2
       },
       "server": {
         "port": 3100,
         "host": "127.0.0.1"
       }
     }
  3. Install git pre-commit hook (unless --no-hooks):
     Append to .git/hooks/pre-commit:
       contextualizer update --changed-only
     Make hook executable.
  4. Add .contextualizer/db/ and .contextualizer/embeddings/ to .gitignore
     (config.json SHOULD be committed for team sharing)
  5. Print setup summary.
```

### 6.2 contextualizer analyze

```
Usage: contextualizer analyze [options]

Run full codebase analysis.

Options:
  --skip-embeddings    Skip embedding generation (faster)
  --concurrency <n>    Number of parallel file parses (default: 4)
  --verbose            Show per-file progress

Behavior:
  1. Load config from .contextualizer/config.json
  2. Initialize parser registry (PHP parser)
  3. Initialize KuzuDB connection
  4. Run full 5-pass analysis pipeline
  5. Print summary: files analyzed, symbols found, edges created, duration
  6. Exit with code 0 on success, 1 on partial failure, 2 on fatal error

Output example:
  Analysis complete.
  Files: 342 analyzed, 0 skipped, 2 failed
  Symbols: 1,847 (412 classes, 1,203 methods, 232 properties)
  Edges: 4,521 (2,103 CALLS, 847 USES, 312 EXTENDS, ...)
  Unresolved: 23 references (see --verbose for details)
  Duration: 12.4s
```

### 6.3 contextualizer update

```
Usage: contextualizer update [options]

Incremental update of the knowledge graph.

Options:
  --files <paths...>    Specific files to re-analyze
  --changed-only        Auto-detect changed files via git (for pre-commit hook)
  --skip-embeddings     Skip embedding generation

Behavior:
  --changed-only mode (pre-commit hook):
    1. Run: git diff --cached --name-only --diff-filter=ACM
       (staged files that are Added, Changed, or Modified)
    2. Filter to supported file extensions
    3. Run incremental update pipeline
    4. Exit 0 always (analysis failure must not block commits)
       Log errors to .contextualizer/update.log

  --files mode:
    1. Validate provided file paths exist
    2. Run incremental update pipeline for those files

  Neither flag:
    1. Run: git diff --name-only HEAD
    2. Run incremental update
```

### 6.4 contextualizer serve

```
Usage: contextualizer serve [options]

Start the HTTP API server for the web UI.

Options:
  --port <n>       Port number (default: from config or 3100)
  --host <addr>    Bind address (default: 127.0.0.1)
  --open           Open browser after starting
  --no-mcp         Disable MCP server (HTTP API only)

Behavior:
  1. Load config
  2. Initialize graph store (read-only connection for queries)
  3. Start Fastify HTTP server with API routes
  4. Start MCP server on stdio (unless --no-mcp)
  5. Serve static web UI files from bundled dist/
  6. Print: "Contextualizer running at http://127.0.0.1:3100"
  7. Handle SIGINT/SIGTERM for graceful shutdown
```

### 6.5 contextualizer status

```
Usage: contextualizer status [options]

Show freshness report.

Options:
  --json         Output as JSON
  --verbose      Show per-file details

Behavior:
  1. Load graph store
  2. Query freshness statistics
  3. Print report:

  Freshness Report
  ----------------
  Nodes: 1,847 total | 1,802 clean | 32 stale | 13 dirty
  Edges: 4,521 total | 4,389 clean | 132 stale
  Last full analysis: 2026-03-21 14:30:00
  Last incremental: 2026-03-22 09:15:00

  Stale namespaces:
    App\Service\Payment (12 stale edges)
    App\Entity (8 stale edges)
```

### 6.6 contextualizer query

```
Usage: contextualizer query <cypher> [options]

Execute a Cypher query against the knowledge graph.

Options:
  --format <fmt>   Output format: table, json, csv (default: table)
  --limit <n>      Max rows (default: 100)

Behavior:
  1. Load graph store
  2. Execute Cypher query against KuzuDB
  3. Format and print results

Example:
  contextualizer query "MATCH (c:Class)-[:EXTENDS]->(p:Class) RETURN c.name, p.name LIMIT 10"
```

---

## 7. Error Handling & Edge Cases

### 7.1 Parse Errors (Invalid PHP)

**Problem**: Files with syntax errors cannot be fully parsed.

**Strategy**: Tree-sitter is error-tolerant. It marks unparsable regions with `ERROR` or `MISSING` nodes but still produces a tree for the valid portions.

```typescript
// After parsing, walk the tree and collect error nodes
function collectParseErrors(tree: Parser.Tree, filePath: string): ParseError[] {
  const errors: ParseError[] = [];
  const cursor = tree.walk();

  function visit(): void {
    const node = cursor.currentNode;
    if (node.type === 'ERROR' || node.isMissing) {
      errors.push({
        message: node.isMissing
          ? `Missing expected node: ${node.type}`
          : `Parse error at ${node.startPosition.row + 1}:${node.startPosition.column}`,
        line: node.startPosition.row + 1,
        column: node.startPosition.column,
        nodeType: node.type,
      });
    }
    if (cursor.gotoFirstChild()) {
      do { visit(); } while (cursor.gotoNextSibling());
      cursor.gotoParent();
    }
  }

  visit();
  return errors;
}

// The File node is stored with:
//   analysisStatus: errors.length > 0 ? 'partial' : 'complete'
//   parseErrors: errors.length
// Symbols extracted from valid regions are still stored.
// The file is NOT skipped entirely.
```

### 7.2 Circular Dependencies

**Problem**: Class A extends B, B extends A. Or circular CALLS chains.

**Detection**:

```typescript
async function detectCircularDependencies(
  graphStore: GraphStore,
  edgeTypes: string[] = ['EXTENDS', 'IMPLEMENTS', 'USES'],
): Promise<Cycle[]> {
  // Use Cypher variable-length path matching
  const query = `
    MATCH path = (a)-[:${edgeTypes.join('|')}*2..10]->(a)
    RETURN nodes(path) AS cycle
    LIMIT 100
  `;
  const results = await graphStore.query(query);
  return results.map(r => ({
    nodes: r.cycle.map((n: any) => n.fqn),
    edgeTypes,
  }));
}

interface Cycle {
  nodes: string[];   // FQN chain forming the cycle
  edgeTypes: string[];
}
```

**Handling**:
- Circular dependencies do not break the analysis pipeline. They are valid graph structures.
- During cascade invalidation, the `visited` set prevents infinite loops in BFS.
- The freshness report includes a "circular dependencies" section listing detected cycles.
- The web UI highlights cycles with a distinct visual indicator.

### 7.3 Missing Files (Deleted But Still Referenced)

**Problem**: A file is deleted from disk but graph still has File and symbol nodes referencing it.

**Detection**: Pass 1 (scan) identifies `filesToRemove`.

```typescript
async function handleDeletedFiles(
  graphStore: GraphStore,
  deletedFilePaths: string[],
): Promise<void> {
  for (const filePath of deletedFilePaths) {
    // Get all symbol nodes for this file
    const symbols = await graphStore.getSymbolsInFile(filePath);

    for (const symbol of symbols) {
      // Mark all incoming edges as stale with reason 'target_deleted'
      const incomingEdges = await graphStore.getIncomingEdges(symbol.id);
      for (const edge of incomingEdges) {
        await graphStore.markEdgeStale(edge.id, {
          staleReason: 'target_deleted',
          staleSince: Date.now(),
        });
      }

      // Remove the symbol node and all its outgoing edges
      await graphStore.removeNode(symbol.id);
    }

    // Remove the File node
    await graphStore.removeNode(deterministicId(filePath));
  }
}
```

**Important**: Incoming edges from OTHER files are not removed, only marked stale. This preserves the information that "ClassX used to call ClassY" until the source file is re-analyzed and the edge is either re-created or naturally cleaned up.

### 7.4 Large Files / Timeout Handling

**Thresholds**:

| Condition | Threshold | Action |
|---|---|---|
| File size | > 1MB (`maxFileSize` config) | Skip with warning |
| Parse time | > 30s (`fileTimeout` config) | Abort, mark as timeout |
| AST node count | > 100,000 nodes | Skip extraction, mark as too-complex |
| Symbol count per file | > 500 symbols | Process but log warning |

```typescript
async function parseWithGuardrails(
  parser: LanguageParser,
  filePath: string,
  source: string,
  config: AnalysisOptions,
): Promise<ParsedFile | null> {
  // Guard: file size
  if (Buffer.byteLength(source) > (config.maxFileSize ?? 1_048_576)) {
    return {
      filePath,
      language: parser.language,
      contentHash: computeHashSync(source),
      symbols: [],
      references: [],
      imports: [],
      errors: [{
        message: `File exceeds size limit (${Buffer.byteLength(source)} bytes)`,
        line: 0,
        column: 0,
        nodeType: 'file',
      }],
    };
  }

  // Guard: timeout
  const result = await Promise.race([
    parser.parse(filePath, source),
    new Promise<null>((_, reject) =>
      setTimeout(() => reject(new Error('Parse timeout')), config.timeout ?? 30_000)
    ),
  ]);

  return result;
}
```

### 7.5 Concurrent Access (Two Terminals Running Analysis)

**Problem**: Two processes writing to KuzuDB simultaneously.

**Strategy**: File-based lock using a lockfile.

```typescript
// src/storage/lock.ts

import { writeFileSync, unlinkSync, existsSync, readFileSync } from 'node:fs';

const LOCK_FILE = '.contextualizer/analysis.lock';

interface LockInfo {
  pid: number;
  startedAt: number;
  command: string;
}

function acquireLock(command: string): boolean {
  if (existsSync(LOCK_FILE)) {
    const existing: LockInfo = JSON.parse(readFileSync(LOCK_FILE, 'utf-8'));

    // Check if the holding process is still alive
    try {
      process.kill(existing.pid, 0); // Signal 0 = check existence
      // Process is alive -- lock is held
      return false;
    } catch {
      // Process is dead -- stale lock, safe to take over
      unlinkSync(LOCK_FILE);
    }
  }

  const lockInfo: LockInfo = {
    pid: process.pid,
    startedAt: Date.now(),
    command,
  };

  writeFileSync(LOCK_FILE, JSON.stringify(lockInfo), { flag: 'wx' }); // wx = exclusive create
  return true;
}

function releaseLock(): void {
  try {
    unlinkSync(LOCK_FILE);
  } catch {
    // Ignore -- may already be cleaned up
  }
}
```

**Behavior when lock is held**:
- `contextualizer analyze`: Print "Analysis already running (PID {pid}, started at {time}). Use --force to override." Exit code 3.
- `contextualizer update --changed-only` (pre-commit hook): Log to `.contextualizer/update.log` and exit 0. Never block a commit.
- `POST /api/refresh`: Return `{ status: 'already_running' }` with 409 Conflict.
- KuzuDB read queries (graph exploration, search) are NOT blocked. KuzuDB supports concurrent read access.

### 7.6 Vendor / External Dependencies

**Problem**: References to classes in `vendor/` (Composer dependencies) cannot be resolved because vendor files are excluded from analysis.

**Strategy**: Create stub nodes for unresolved external references.

```typescript
// When a reference cannot be resolved and the target looks like a vendor class
// (e.g., starts with a known vendor namespace prefix or is not in the project namespace):

function handleUnresolvedReference(
  ref: ParsedReference,
  graphStore: GraphStore,
): void {
  const stubId = deterministicId('external::' + ref.targetName);

  graphStore.upsertNode({
    id: stubId,
    kind: 'class', // Best guess
    name: ref.targetName,
    fqn: ref.targetName,
    filePath: null,
    metadata: { external: true, stub: true },
  });

  graphStore.upsertEdge({
    type: mapReferenceKindToEdgeType(ref.kind),
    sourceId: resolveSourceNode(ref),
    targetId: stubId,
    confidence: 0.5,
    relationType: ref.kind,
    sourceContext: ref.context,
    metadata: { external: true },
  });
}
```

External/stub nodes are visually distinct in the UI (dashed border, grayed out) and filtered from freshness calculations.

### 7.7 Encoding Issues

**Problem**: PHP files may use non-UTF-8 encoding.

```typescript
// Read files as Buffer first, detect encoding, convert to UTF-8
import { detect } from 'chardet';

async function readSourceFile(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  const encoding = detect(buffer);

  // Tree-sitter requires UTF-8 or UTF-16
  if (encoding && encoding !== 'UTF-8' && encoding !== 'ascii') {
    // Convert using iconv-lite or TextDecoder
    const decoder = new TextDecoder(encoding);
    return decoder.decode(buffer);
  }

  return buffer.toString('utf-8');
}
```

### 7.8 Recovery from Corrupted State

If the KuzuDB database becomes corrupted (crash during write, disk full):

```
contextualizer analyze --rebuild
```

This drops all tables, recreates the schema, and runs a full analysis from scratch. The `.contextualizer/db/` directory can also be safely deleted and `analyze` re-run.

---

## Appendix A: Graph Store Interface

```typescript
// src/storage/graph-store.ts

interface GraphStore {
  initialize(dbPath: string): Promise<void>;
  close(): Promise<void>;

  // Node operations
  upsertNode(node: NodeData): Promise<void>;
  getNode(id: string): Promise<NodeData | null>;
  getNodeByFqn(fqn: string): Promise<NodeData | null>;
  getNodesByKind(kinds: string[]): Promise<NodeData[]>;
  getSymbolsInFile(filePath: string): Promise<NodeData[]>;
  getFileNode(filePath: string): Promise<NodeData | null>;
  removeNode(id: string): Promise<void>;
  removeSymbolsForFile(filePath: string): Promise<void>;

  // Edge operations
  upsertEdge(edge: EdgeData): Promise<void>;
  getIncomingEdges(nodeId: string): Promise<EdgeData[]>;
  getOutgoingEdges(nodeId: string): Promise<EdgeData[]>;
  getEdgesByType(type: string): Promise<EdgeData[]>;
  markEdgeStale(edgeId: string, reason: StaleInfo): Promise<void>;
  removeEdgesForNode(nodeId: string): Promise<void>;

  // Bulk operations
  getAllSymbols(): Promise<Map<string, string>>; // fqn -> nodeId
  getNodesNeedingEmbedding(): Promise<NodeData[]>;

  // Embedding operations
  storeEmbedding(nodeId: string, vector: Float32Array): Promise<void>;
  searchEmbeddings(queryVector: Float32Array, topK: number): Promise<EmbeddingSearchResult[]>;

  // Query
  query(cypher: string, params?: Record<string, unknown>): Promise<Record<string, unknown>[]>;

  // Freshness
  getFreshnessStats(scope?: string): Promise<FreshnessStats>;
}

interface NodeData {
  id: string;
  kind: string;
  name: string;
  fqn: string;
  filePath: string | null;
  startLine?: number;
  endLine?: number;
  contentHash?: string;
  lastAnalyzedAt?: number;
  state?: 'clean' | 'stale' | 'dirty';
  metadata?: Record<string, unknown>;
}

interface EdgeData {
  id?: string;     // Auto-generated if not provided
  type: string;
  sourceId: string;
  targetId: string;
  confidence?: number;
  relationType?: string;
  sourceContext?: string;
  filePath?: string;
  line?: number;
  lastAnalyzedAt?: number;
  state?: 'clean' | 'stale' | 'dirty';
  metadata?: Record<string, unknown>;
}

interface FreshnessStats {
  totalNodes: number;
  cleanNodes: number;
  staleNodes: number;
  dirtyNodes: number;
  totalEdges: number;
  cleanEdges: number;
  staleEdges: number;
  lastFullAnalysis: number | null;
  lastIncrementalUpdate: number | null;
}
```

## Appendix B: KuzuDB Schema (Cypher DDL)

```cypher
// Node tables
CREATE NODE TABLE File (
  id STRING PRIMARY KEY,
  name STRING,
  fqn STRING,
  filePath STRING,
  contentHash STRING,
  lastAnalyzedAt INT64,
  state STRING DEFAULT 'clean',
  language STRING,
  sizeBytes INT64,
  parseErrors INT32 DEFAULT 0,
  analysisStatus STRING DEFAULT 'complete'
);

CREATE NODE TABLE Folder (
  id STRING PRIMARY KEY,
  name STRING,
  fqn STRING,
  filePath STRING,
  lastAnalyzedAt INT64
);

CREATE NODE TABLE Module (
  id STRING PRIMARY KEY,
  name STRING,
  fqn STRING,
  memberCount INT32 DEFAULT 0,
  lastAnalyzedAt INT64
);

CREATE NODE TABLE Namespace (
  id STRING PRIMARY KEY,
  name STRING,
  fqn STRING,
  filePath STRING,
  lastAnalyzedAt INT64
);

CREATE NODE TABLE Class (
  id STRING PRIMARY KEY,
  name STRING,
  fqn STRING,
  filePath STRING,
  startLine INT32,
  endLine INT32,
  contentHash STRING,
  lastAnalyzedAt INT64,
  state STRING DEFAULT 'clean',
  modifiers STRING[],
  external BOOLEAN DEFAULT FALSE
);

CREATE NODE TABLE Interface (
  id STRING PRIMARY KEY,
  name STRING,
  fqn STRING,
  filePath STRING,
  startLine INT32,
  endLine INT32,
  contentHash STRING,
  lastAnalyzedAt INT64,
  state STRING DEFAULT 'clean',
  modifiers STRING[],
  external BOOLEAN DEFAULT FALSE
);

CREATE NODE TABLE Trait (
  id STRING PRIMARY KEY,
  name STRING,
  fqn STRING,
  filePath STRING,
  startLine INT32,
  endLine INT32,
  contentHash STRING,
  lastAnalyzedAt INT64,
  state STRING DEFAULT 'clean'
);

CREATE NODE TABLE Method (
  id STRING PRIMARY KEY,
  name STRING,
  fqn STRING,
  filePath STRING,
  startLine INT32,
  endLine INT32,
  contentHash STRING,
  lastAnalyzedAt INT64,
  state STRING DEFAULT 'clean',
  modifiers STRING[],
  parameterSignature STRING,
  returnType STRING
);

CREATE NODE TABLE Function (
  id STRING PRIMARY KEY,
  name STRING,
  fqn STRING,
  filePath STRING,
  startLine INT32,
  endLine INT32,
  contentHash STRING,
  lastAnalyzedAt INT64,
  state STRING DEFAULT 'clean',
  parameterSignature STRING,
  returnType STRING
);

CREATE NODE TABLE Property (
  id STRING PRIMARY KEY,
  name STRING,
  fqn STRING,
  filePath STRING,
  startLine INT32,
  endLine INT32,
  contentHash STRING,
  lastAnalyzedAt INT64,
  state STRING DEFAULT 'clean',
  modifiers STRING[],
  propertyType STRING
);

// Edge tables
CREATE REL TABLE CONTAINS (FROM Folder TO File, FROM Folder TO Folder, FROM Module TO Class, FROM Module TO Interface, FROM Module TO Trait);
CREATE REL TABLE DEFINES (FROM File TO Class, FROM File TO Interface, FROM File TO Trait, FROM File TO Function, FROM File TO Namespace);
CREATE REL TABLE MEMBER_OF (FROM Method TO Class, FROM Method TO Interface, FROM Method TO Trait, FROM Property TO Class, FROM Property TO Trait);
CREATE REL TABLE IMPORTS (FROM File TO Class, FROM File TO Interface, FROM File TO Trait, FROM File TO Function, line INT32, alias STRING);
CREATE REL TABLE EXTENDS (FROM Class TO Class, FROM Interface TO Interface, confidence DOUBLE DEFAULT 1.0, sourceContext STRING, lastAnalyzedAt INT64, state STRING DEFAULT 'clean');
CREATE REL TABLE IMPLEMENTS (FROM Class TO Interface, confidence DOUBLE DEFAULT 1.0, sourceContext STRING, lastAnalyzedAt INT64, state STRING DEFAULT 'clean');
CREATE REL TABLE USES (FROM Class TO Trait, FROM Class TO Class, FROM Method TO Class, confidence DOUBLE DEFAULT 1.0, relationType STRING, sourceContext STRING, lastAnalyzedAt INT64, state STRING DEFAULT 'clean');
CREATE REL TABLE CALLS (FROM Method TO Method, FROM Method TO Function, FROM Function TO Method, FROM Function TO Function, FROM Module TO Module, confidence DOUBLE DEFAULT 1.0, relationType STRING, sourceContext STRING, filePath STRING, line INT32, lastAnalyzedAt INT64, state STRING DEFAULT 'clean', weight INT32 DEFAULT 1);
CREATE REL TABLE INJECTS (FROM Class TO Class, FROM Class TO Interface, confidence DOUBLE DEFAULT 1.0, sourceContext STRING, parameterName STRING, lastAnalyzedAt INT64, state STRING DEFAULT 'clean');
```

## Appendix C: Directory Structure

```
llmProjectContextualizer/
  src/
    cli/
      index.ts              -- Commander.js entry point
      commands/
        init.ts
        analyze.ts
        update.ts
        serve.ts
        status.ts
        query.ts
    parsers/
      types.ts              -- LanguageParser interface, symbol types
      parser-registry.ts
      php/
        php-parser.ts       -- PhpParser implementation
        ast-visitor.ts      -- AST traversal and symbol extraction
        reference-extractor.ts
    analysis/
      orchestrator.ts       -- 5-pass pipeline orchestrator
      scanner.ts            -- Pass 1: file system scan
      resolver.ts           -- Pass 3: cross-file resolution
      clusterer.ts          -- Pass 4: module detection
      embedder.ts           -- Pass 5: embedding generation
    storage/
      graph-store.ts        -- GraphStore interface
      kuzu-store.ts         -- KuzuDB implementation
      embedding-store.ts    -- Vector storage and search
      lock.ts               -- File-based concurrency lock
      schema.ts             -- DDL statements and migrations
    mcp/
      server.ts             -- MCP server setup
      tools.ts              -- Tool definitions
    http/
      server.ts             -- Fastify setup
      routes/
        graph.ts            -- /api/graph routes
        node.ts             -- /api/node routes
        edges.ts            -- /api/edges routes
        search.ts           -- /api/search routes
        refresh.ts          -- /api/refresh routes
        status.ts           -- /api/status routes
    shared/
      config.ts             -- Configuration loading
      hashing.ts            -- Content hashing utilities
      logger.ts             -- Structured logging
      errors.ts             -- Custom error types
  dist/                     -- Compiled JS output
  web/                      -- Web UI (separate build)
  package.json
  tsconfig.json
```
