# Phase 0 (Spikes) + Phase 1 (Foundation) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Establish the monorepo, core type system, parser interface, and a working PHP parser that extracts classes, interfaces, traits, enums, functions, methods, properties, and constants from single PHP files with intra-file relationship extraction.

**Architecture:** TypeScript monorepo (pnpm workspaces + Turborepo) with two packages: `@sniffo/core` (types, parser interface, graph schema) and `@sniffo/analyzer` (Tree-sitter PHP integration, single-file extraction). Storage abstraction defined but not implemented until Phase 2.

**Tech Stack:** TypeScript 5.7+, pnpm workspaces, Turborepo, Vitest, Tree-sitter (web-tree-sitter + tree-sitter-php WASM), Node.js 20+

**Reference docs:**
- `docs/system-design.md` -- package structure, graph schema, types
- `docs/backend-specification.md` -- parser interface, Tree-sitter node mapping, AST traversal
- `docs/test-strategy.md` -- PHP fixture structure, accuracy test patterns
- `docs/delivery-plan.md` -- Phase 1 definition of done, quality gates

---

## Task 0: Technical Spike -- Tree-sitter PHP Grammar

**Goal:** Verify that `tree-sitter-php` handles PHP 8.3+ syntax. Decision: proceed or find alternative.

**Files:**
- Create: `spikes/tree-sitter-php/spike.ts`
- Create: `spikes/tree-sitter-php/fixtures/modern-php.php`
- Create: `spikes/tree-sitter-php/package.json`

**Step 1: Create spike project**

```bash
mkdir -p spikes/tree-sitter-php
cd spikes/tree-sitter-php
npm init -y
npm install web-tree-sitter
```

Download the PHP WASM grammar from tree-sitter-php releases:
```bash
mkdir -p grammars
curl -L -o grammars/tree-sitter-php.wasm https://github.com/nicktomlin/tree-sitter-grammars/raw/master/php.wasm
```

If that URL fails, build from source:
```bash
npm install tree-sitter-php
npx tree-sitter build --wasm node_modules/tree-sitter-php
cp node_modules/tree-sitter-php/tree-sitter-php.wasm grammars/
```

**Step 2: Create PHP 8.3 fixture**

```php
<?php
// spikes/tree-sitter-php/fixtures/modern-php.php
declare(strict_types=1);

namespace App\Domain;

// Enum (PHP 8.1+)
enum Status: string
{
    case Active = 'active';
    case Inactive = 'inactive';
}

// Readonly class (PHP 8.2+)
readonly class UserDTO
{
    public function __construct(
        public string $name,
        public Status $status,
    ) {}
}

// Intersection types (PHP 8.1+)
interface Loggable {}
interface Serializable {}

class UserService
{
    // Constructor promotion with readonly (PHP 8.1+)
    public function __construct(
        private readonly UserRepository $repo,
        private LoggerInterface $logger,
    ) {}

    // Union return type (PHP 8.0+)
    public function find(int $id): UserDTO|null
    {
        return $this->repo->findById($id);
    }

    // Intersection type param (PHP 8.1+)
    public function process(Loggable&Serializable $entity): void
    {
        $this->logger->info('processing');
    }

    // First-class callable (PHP 8.1+)
    public function getMapper(): \Closure
    {
        return $this->find(...);
    }

    // Fibers (PHP 8.1+) -- just syntax, not runtime
    public function async(): void
    {
        $fiber = new \Fiber(function (): void {
            \Fiber::suspend('test');
        });
    }

    // DNF types (PHP 8.2+)
    public function dnfParam((Loggable&Serializable)|null $x): void {}
}

// Interface with return type
interface UserRepository
{
    public function findById(int $id): ?UserDTO;
}

// Trait
trait TimestampTrait
{
    private \DateTimeImmutable $createdAt;

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }
}

// Abstract class using trait
abstract class BaseEntity
{
    use TimestampTrait;

    abstract public function getId(): int;
}

// Constants in interface (PHP 8.2+ allows types)
interface HasVersion
{
    const string VERSION = '1.0';
}
```

**Step 3: Write spike script**

```typescript
// spikes/tree-sitter-php/spike.ts
import Parser from 'web-tree-sitter';
import { readFileSync } from 'fs';
import { join } from 'path';

async function main() {
  await Parser.init();
  const parser = new Parser();

  const Lang = await Parser.Language.load(join(__dirname, 'grammars/tree-sitter-php.wasm'));
  parser.setLanguage(Lang);

  const source = readFileSync(join(__dirname, 'fixtures/modern-php.php'), 'utf-8');
  const tree = parser.parse(source);

  const checks = [
    { name: 'enum_declaration', desc: 'PHP 8.1 enums' },
    { name: 'readonly_modifier', desc: 'PHP 8.2 readonly class' },
    { name: 'intersection_type', desc: 'PHP 8.1 intersection types' },
    { name: 'union_type', desc: 'PHP 8.0 union types' },
    { name: 'property_promotion_parameter', desc: 'Constructor promotion' },
    { name: 'class_declaration', desc: 'Class declarations' },
    { name: 'interface_declaration', desc: 'Interface declarations' },
    { name: 'trait_declaration', desc: 'Trait declarations' },
    { name: 'namespace_definition', desc: 'Namespace' },
    { name: 'method_declaration', desc: 'Methods' },
  ];

  function findNodes(node: Parser.SyntaxNode, type: string): Parser.SyntaxNode[] {
    const results: Parser.SyntaxNode[] = [];
    if (node.type === type) results.push(node);
    for (let i = 0; i < node.childCount; i++) {
      results.push(...findNodes(node.child(i)!, type));
    }
    return results;
  }

  console.log('=== Tree-sitter PHP Grammar Spike ===\n');

  let allPassed = true;
  for (const check of checks) {
    const nodes = findNodes(tree.rootNode, check.name);
    const passed = nodes.length > 0;
    console.log(`${passed ? 'PASS' : 'FAIL'} ${check.desc}: found ${nodes.length} ${check.name} nodes`);
    if (!passed) allPassed = false;
  }

  // Check for ERROR nodes
  const errors = findNodes(tree.rootNode, 'ERROR');
  console.log(`\nERROR nodes: ${errors.length}`);
  for (const err of errors) {
    console.log(`  Line ${err.startPosition.row + 1}: ${err.text.slice(0, 80)}`);
  }

  console.log(`\n=== Result: ${allPassed && errors.length === 0 ? 'PROCEED with tree-sitter' : 'INVESTIGATE GAPS'} ===`);
}

main().catch(console.error);
```

**Step 4: Run spike**

```bash
npx tsx spike.ts
```

Expected: All checks PASS, 0 ERROR nodes. If some fail, document which features have gaps and decide if workarounds are acceptable.

**Step 5: Document decision**

Create `spikes/tree-sitter-php/DECISION.md` with findings. If all pass, the decision is: **proceed with web-tree-sitter + tree-sitter-php WASM**.

**Step 6: Commit**

```bash
git add spikes/
git commit -m "spike: verify tree-sitter-php grammar for PHP 8.3+ features"
```

---

## Task 1: Monorepo Scaffolding

**Goal:** Set up the pnpm workspace with Turborepo, shared TypeScript config, ESLint, Vitest.

**Files:**
- Create: `package.json` (workspace root)
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `tsconfig.base.json`
- Create: `.eslintrc.cjs`
- Create: `.gitignore`
- Create: `.nvmrc`
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/index.ts`
- Create: `packages/analyzer/package.json`
- Create: `packages/analyzer/tsconfig.json`
- Create: `packages/analyzer/src/index.ts`

**Step 1: Initialize git repo**

```bash
cd /Users/krzysztofsurdy/ProjectsPrivate/llmProjectSniffo
git init
```

**Step 2: Create root package.json**

```json
{
  "name": "llm-project-sniffo",
  "private": true,
  "packageManager": "pnpm@9.15.0",
  "engines": {
    "node": ">=20.0.0"
  },
  "scripts": {
    "build": "turbo run build",
    "test": "turbo run test",
    "test:watch": "turbo run test:watch",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck"
  }
}
```

**Step 3: Create pnpm-workspace.yaml**

```yaml
packages:
  - "packages/*"
```

**Step 4: Create turbo.json**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["build"]
    },
    "test:watch": {
      "cache": false,
      "persistent": true
    },
    "lint": {},
    "typecheck": {
      "dependsOn": ["^build"]
    }
  }
}
```

**Step 5: Create tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "resolveJsonModule": true,
    "isolatedModules": true
  }
}
```

**Step 6: Create .gitignore**

```
node_modules/
dist/
.turbo/
.sniffo/
*.wasm
!packages/analyzer/grammars/.gitkeep
.env
.DS_Store
coverage/
```

**Step 7: Create .nvmrc**

```
20
```

**Step 8: Create @sniffo/core package**

`packages/core/package.json`:
```json
{
  "name": "@sniffo/core",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit"
  }
}
```

`packages/core/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

`packages/core/src/index.ts`:
```typescript
export * from './types/graph-nodes.js';
export * from './types/graph-edges.js';
export * from './types/analysis.js';
export * from './types/parser.js';
```

**Step 9: Create @sniffo/analyzer package**

`packages/analyzer/package.json`:
```json
{
  "name": "@sniffo/analyzer",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@sniffo/core": "workspace:*"
  }
}
```

`packages/analyzer/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "references": [
    { "path": "../core" }
  ]
}
```

`packages/analyzer/src/index.ts`:
```typescript
export * from './parsers/parser-registry.js';
```

**Step 10: Install dependencies**

```bash
pnpm install
pnpm add -D turbo typescript vitest @types/node eslint -w
```

**Step 11: Verify build**

```bash
pnpm build
pnpm typecheck
```

Expected: Both succeed with no errors.

**Step 12: Commit**

```bash
git add -A
git commit -m "chore: scaffold monorepo with pnpm workspaces and turborepo"
```

---

## Task 2: Core Type Definitions -- Graph Nodes

**Goal:** Define all node types for the L1-L4 graph hierarchy.

**Files:**
- Create: `packages/core/src/types/graph-nodes.ts`
- Test: `packages/core/src/types/__tests__/graph-nodes.test.ts`

**Step 1: Write the test**

```typescript
// packages/core/src/types/__tests__/graph-nodes.test.ts
import { describe, it, expect } from 'vitest';
import {
  type BaseNode,
  type ComponentNode,
  type CodeNode,
  GraphLevel,
  NodeType,
  createNodeId,
} from '../graph-nodes.js';

describe('GraphNodes', () => {
  describe('createNodeId', () => {
    it('generates deterministic ID from type and qualified name', () => {
      const id1 = createNodeId(NodeType.CLASS, 'App\\Service\\UserService');
      const id2 = createNodeId(NodeType.CLASS, 'App\\Service\\UserService');
      expect(id1).toBe(id2);
    });

    it('generates different IDs for different inputs', () => {
      const id1 = createNodeId(NodeType.CLASS, 'App\\Service\\UserService');
      const id2 = createNodeId(NodeType.INTERFACE, 'App\\Service\\UserService');
      expect(id1).not.toBe(id2);
    });
  });

  describe('GraphLevel', () => {
    it('defines all four levels', () => {
      expect(GraphLevel.SYSTEM).toBe('L1_SYSTEM');
      expect(GraphLevel.CONTAINER).toBe('L2_CONTAINER');
      expect(GraphLevel.COMPONENT).toBe('L3_COMPONENT');
      expect(GraphLevel.CODE).toBe('L4_CODE');
    });
  });

  describe('NodeType', () => {
    it('includes PHP-specific types', () => {
      expect(NodeType.TRAIT).toBe('TRAIT');
      expect(NodeType.ENUM).toBe('ENUM');
      expect(NodeType.ABSTRACT_CLASS).toBe('ABSTRACT_CLASS');
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/core && pnpm test
```

Expected: FAIL -- modules not found.

**Step 3: Write implementation**

```typescript
// packages/core/src/types/graph-nodes.ts
import { createHash } from 'node:crypto';

export enum GraphLevel {
  SYSTEM = 'L1_SYSTEM',
  CONTAINER = 'L2_CONTAINER',
  COMPONENT = 'L3_COMPONENT',
  CODE = 'L4_CODE',
}

export enum NodeType {
  // L1
  SYSTEM = 'SYSTEM',
  // L2
  CONTAINER = 'CONTAINER',
  MODULE = 'MODULE',
  PACKAGE = 'PACKAGE',
  BUNDLE = 'BUNDLE',
  // L3
  CLASS = 'CLASS',
  INTERFACE = 'INTERFACE',
  TRAIT = 'TRAIT',
  ENUM = 'ENUM',
  ABSTRACT_CLASS = 'ABSTRACT_CLASS',
  FUNCTION = 'FUNCTION',
  // L4
  METHOD = 'METHOD',
  PROPERTY = 'PROPERTY',
  CONSTANT = 'CONSTANT',
  CONSTRUCTOR = 'CONSTRUCTOR',
}

export interface BaseNode {
  id: string;
  type: NodeType;
  level: GraphLevel;
  qualifiedName: string;
  shortName: string;
  filePath: string | null;
  startLine: number | null;
  endLine: number | null;
  contentHash: string | null;
  isStale: boolean;
  lastAnalyzedAt: string;
  metadata: Record<string, unknown>;
}

export interface SystemNode extends BaseNode {
  level: GraphLevel.SYSTEM;
  type: NodeType.SYSTEM;
}

export interface ContainerNode extends BaseNode {
  level: GraphLevel.CONTAINER;
  type: NodeType.CONTAINER | NodeType.MODULE | NodeType.PACKAGE | NodeType.BUNDLE;
  metadata: {
    namespace: string;
    directory: string;
    fileCount: number;
  };
}

export interface ComponentNode extends BaseNode {
  level: GraphLevel.COMPONENT;
  type:
    | NodeType.CLASS
    | NodeType.INTERFACE
    | NodeType.TRAIT
    | NodeType.ENUM
    | NodeType.ABSTRACT_CLASS
    | NodeType.FUNCTION;
  metadata: {
    namespace: string;
    isAbstract: boolean;
    isFinal: boolean;
    visibility: 'public' | 'protected' | 'private' | null;
    loc: number;
  };
}

export interface CodeNode extends BaseNode {
  level: GraphLevel.CODE;
  type: NodeType.METHOD | NodeType.PROPERTY | NodeType.CONSTANT | NodeType.CONSTRUCTOR;
  metadata: {
    visibility: 'public' | 'protected' | 'private';
    isStatic: boolean;
    returnType: string | null;
    parameterTypes: string[];
  };
}

export type GraphNode = SystemNode | ContainerNode | ComponentNode | CodeNode;

export function createNodeId(type: NodeType, qualifiedName: string): string {
  return createHash('sha256')
    .update(`${type}::${qualifiedName}`)
    .digest('hex')
    .slice(0, 16);
}
```

**Step 4: Run test to verify it passes**

```bash
cd packages/core && pnpm test
```

Expected: PASS

**Step 5: Commit**

```bash
git add packages/core/src/types/graph-nodes.ts packages/core/src/types/__tests__/graph-nodes.test.ts
git commit -m "feat(core): add graph node type definitions for L1-L4 hierarchy"
```

---

## Task 3: Core Type Definitions -- Graph Edges

**Files:**
- Create: `packages/core/src/types/graph-edges.ts`
- Test: `packages/core/src/types/__tests__/graph-edges.test.ts`

**Step 1: Write the test**

```typescript
// packages/core/src/types/__tests__/graph-edges.test.ts
import { describe, it, expect } from 'vitest';
import { EdgeType, createEdgeId } from '../graph-edges.js';

describe('GraphEdges', () => {
  describe('EdgeType', () => {
    it('includes all relationship types', () => {
      expect(EdgeType.EXTENDS).toBe('EXTENDS');
      expect(EdgeType.IMPLEMENTS).toBe('IMPLEMENTS');
      expect(EdgeType.USES_TRAIT).toBe('USES_TRAIT');
      expect(EdgeType.CALLS).toBe('CALLS');
      expect(EdgeType.INJECTS).toBe('INJECTS');
      expect(EdgeType.CONTAINS).toBe('CONTAINS');
      expect(EdgeType.IMPORTS).toBe('IMPORTS');
      expect(EdgeType.INSTANTIATES).toBe('INSTANTIATES');
    });
  });

  describe('createEdgeId', () => {
    it('generates deterministic ID', () => {
      const id1 = createEdgeId('src1', 'tgt1', EdgeType.CALLS);
      const id2 = createEdgeId('src1', 'tgt1', EdgeType.CALLS);
      expect(id1).toBe(id2);
    });

    it('generates different IDs for different edges', () => {
      const id1 = createEdgeId('src1', 'tgt1', EdgeType.CALLS);
      const id2 = createEdgeId('src1', 'tgt1', EdgeType.EXTENDS);
      expect(id1).not.toBe(id2);
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/core && pnpm test
```

**Step 3: Write implementation**

```typescript
// packages/core/src/types/graph-edges.ts
import { createHash } from 'node:crypto';
import type { GraphLevel } from './graph-nodes.js';

export enum EdgeType {
  CONTAINS = 'CONTAINS',
  EXTENDS = 'EXTENDS',
  IMPLEMENTS = 'IMPLEMENTS',
  USES_TRAIT = 'USES_TRAIT',
  DEPENDS_ON = 'DEPENDS_ON',
  IMPORTS = 'IMPORTS',
  INJECTS = 'INJECTS',
  CALLS = 'CALLS',
  INSTANTIATES = 'INSTANTIATES',
  RETURNS_TYPE = 'RETURNS_TYPE',
  PARAMETER_TYPE = 'PARAMETER_TYPE',
  PROPERTY_TYPE = 'PROPERTY_TYPE',
}

export interface BaseEdge {
  id: string;
  source: string;
  target: string;
  type: EdgeType;
  level: GraphLevel;
  weight: number;
  metadata: Record<string, unknown>;
}

export interface SourceLocationMeta {
  sourceLocation: { file: string; line: number } | null;
}

export interface DependencyEdge extends BaseEdge {
  type:
    | EdgeType.DEPENDS_ON
    | EdgeType.IMPORTS
    | EdgeType.INJECTS
    | EdgeType.CALLS
    | EdgeType.INSTANTIATES;
  metadata: SourceLocationMeta;
}

export interface InheritanceEdge extends BaseEdge {
  type: EdgeType.EXTENDS | EdgeType.IMPLEMENTS | EdgeType.USES_TRAIT;
}

export interface ContainmentEdge extends BaseEdge {
  type: EdgeType.CONTAINS;
}

export interface TypeReferenceEdge extends BaseEdge {
  type: EdgeType.RETURNS_TYPE | EdgeType.PARAMETER_TYPE | EdgeType.PROPERTY_TYPE;
  metadata: {
    isNullable: boolean;
  };
}

export type GraphEdge =
  | DependencyEdge
  | InheritanceEdge
  | ContainmentEdge
  | TypeReferenceEdge;

export function createEdgeId(source: string, target: string, type: EdgeType): string {
  return createHash('sha256')
    .update(`${source}->${target}::${type}`)
    .digest('hex')
    .slice(0, 16);
}
```

**Step 4: Run test to verify it passes**

```bash
cd packages/core && pnpm test
```

**Step 5: Commit**

```bash
git add packages/core/src/types/graph-edges.ts packages/core/src/types/__tests__/graph-edges.test.ts
git commit -m "feat(core): add graph edge type definitions for all relationship types"
```

---

## Task 4: Core Type Definitions -- Parser Interface

**Files:**
- Create: `packages/core/src/types/parser.ts`
- Create: `packages/core/src/types/analysis.ts`

**Step 1: Write parser.ts**

```typescript
// packages/core/src/types/parser.ts

export enum SymbolKind {
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

export enum Modifier {
  Public = 'public',
  Protected = 'protected',
  Private = 'private',
  Static = 'static',
  Abstract = 'abstract',
  Final = 'final',
  Readonly = 'readonly',
}

export enum ReferenceKind {
  Extends = 'extends',
  Implements = 'implements',
  UsesTrait = 'uses_trait',
  Calls = 'calls',
  Instantiates = 'instantiates',
  TypeReference = 'type_reference',
  Imports = 'imports',
  Injects = 'injects',
}

export interface ParsedSymbol {
  kind: SymbolKind;
  name: string;
  fqn: string;
  filePath: string;
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
  modifiers: Modifier[];
  metadata: Record<string, unknown>;
}

export interface ParsedReference {
  kind: ReferenceKind;
  sourceSymbolFqn: string;
  targetName: string;
  targetFqn: string | null;
  filePath: string;
  line: number;
  column: number;
  context: string;
}

export interface ImportStatement {
  originalName: string;
  alias: string | null;
  line: number;
}

export interface ParseError {
  message: string;
  line: number;
  column: number;
  nodeType: string;
}

export interface ParsedFile {
  filePath: string;
  language: string;
  contentHash: string;
  symbols: ParsedSymbol[];
  references: ParsedReference[];
  imports: ImportStatement[];
  errors: ParseError[];
}

export interface LanguageParser {
  readonly language: string;
  readonly fileExtensions: string[];
  initialize(): Promise<void>;
  canParse(filePath: string): boolean;
  parse(filePath: string, source: string): Promise<ParsedFile>;
  dispose(): void;
}
```

**Step 2: Write analysis.ts**

```typescript
// packages/core/src/types/analysis.ts

export interface AnalysisOptions {
  rootDir: string;
  files?: string[];
  skipEmbeddings?: boolean;
  concurrency?: number;
  timeout?: number;
}

export interface AnalysisResult {
  filesScanned: number;
  filesAnalyzed: number;
  filesSkipped: number;
  filesFailed: number;
  symbolsFound: number;
  referencesFound: number;
  durationMs: number;
  errors: AnalysisError[];
}

export interface AnalysisError {
  phase: 'scan' | 'parse' | 'resolve' | 'cluster' | 'embed';
  filePath: string | null;
  message: string;
  recoverable: boolean;
}
```

**Step 3: Update core/src/index.ts exports**

Already done in Task 1 -- verify exports match.

**Step 4: Build and typecheck**

```bash
pnpm build && pnpm typecheck
```

**Step 5: Commit**

```bash
git add packages/core/src/types/parser.ts packages/core/src/types/analysis.ts
git commit -m "feat(core): add parser interface and analysis type definitions"
```

---

## Task 5: Parser Registry

**Files:**
- Create: `packages/analyzer/src/parsers/parser-registry.ts`
- Test: `packages/analyzer/src/parsers/__tests__/parser-registry.test.ts`

**Step 1: Write the test**

```typescript
// packages/analyzer/src/parsers/__tests__/parser-registry.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ParserRegistry } from '../parser-registry.js';
import type { LanguageParser, ParsedFile } from '@sniffo/core';

function createMockParser(lang: string, extensions: string[]): LanguageParser {
  return {
    language: lang,
    fileExtensions: extensions,
    initialize: vi.fn().mockResolvedValue(undefined),
    canParse: (fp: string) => extensions.some((ext) => fp.endsWith(ext)),
    parse: vi.fn().mockResolvedValue({} as ParsedFile),
    dispose: vi.fn(),
  };
}

describe('ParserRegistry', () => {
  it('registers a parser and retrieves it by file extension', async () => {
    const registry = new ParserRegistry();
    const phpParser = createMockParser('php', ['.php']);

    await registry.register(phpParser);

    expect(registry.getParserForFile('src/User.php')).toBe(phpParser);
    expect(phpParser.initialize).toHaveBeenCalledOnce();
  });

  it('returns null for unsupported file types', async () => {
    const registry = new ParserRegistry();
    expect(registry.getParserForFile('file.rs')).toBeNull();
  });

  it('lists supported extensions', async () => {
    const registry = new ParserRegistry();
    await registry.register(createMockParser('php', ['.php']));

    expect(registry.getSupportedExtensions()).toEqual(['.php']);
  });

  it('disposes all parsers', async () => {
    const registry = new ParserRegistry();
    const parser = createMockParser('php', ['.php']);
    await registry.register(parser);

    registry.dispose();

    expect(parser.dispose).toHaveBeenCalledOnce();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/analyzer && pnpm test
```

**Step 3: Write implementation**

```typescript
// packages/analyzer/src/parsers/parser-registry.ts
import type { LanguageParser } from '@sniffo/core';

export class ParserRegistry {
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
    return Array.from(this.parsers.values()).flatMap((p) => p.fileExtensions);
  }

  dispose(): void {
    for (const parser of this.parsers.values()) {
      parser.dispose();
    }
    this.parsers.clear();
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd packages/analyzer && pnpm test
```

**Step 5: Commit**

```bash
git add packages/analyzer/src/parsers/
git commit -m "feat(analyzer): add parser registry for multi-language support"
```

---

## Task 6: PHP Fixtures for Testing

**Goal:** Create the golden fixture PHP files that all parser tests will run against.

**Files:**
- Create: `packages/analyzer/test/fixtures/php-project/src/Controller/UserController.php`
- Create: `packages/analyzer/test/fixtures/php-project/src/Service/UserService.php`
- Create: `packages/analyzer/test/fixtures/php-project/src/Service/UserServiceInterface.php`
- Create: `packages/analyzer/test/fixtures/php-project/src/Repository/UserRepository.php`
- Create: `packages/analyzer/test/fixtures/php-project/src/Repository/BaseRepository.php`
- Create: `packages/analyzer/test/fixtures/php-project/src/Model/User.php`
- Create: `packages/analyzer/test/fixtures/php-project/src/Trait/TimestampableTrait.php`
- Create: `packages/analyzer/test/fixtures/php-project/src/Enum/UserStatus.php`

**Step 1: Create fixture files**

`UserController.php`:
```php
<?php
declare(strict_types=1);

namespace App\Controller;

use App\Service\UserServiceInterface;
use App\Service\UserService;

abstract class AbstractController
{
    abstract protected function handle(): void;
}

class UserController extends AbstractController
{
    public function __construct(
        private readonly UserServiceInterface $userService,
    ) {}

    protected function handle(): void {}

    public function index(): array
    {
        return $this->userService->findAll();
    }

    public function show(int $id): ?array
    {
        return $this->userService->findById($id);
    }
}
```

`UserServiceInterface.php`:
```php
<?php
declare(strict_types=1);

namespace App\Service;

interface UserServiceInterface
{
    public function findAll(): array;
    public function findById(int $id): ?array;
}
```

`UserService.php`:
```php
<?php
declare(strict_types=1);

namespace App\Service;

use App\Repository\UserRepository;
use App\Trait\TimestampableTrait;

class UserService implements UserServiceInterface
{
    use TimestampableTrait;

    public function __construct(
        private readonly UserRepository $repository,
    ) {}

    public function findAll(): array
    {
        return $this->repository->findAll();
    }

    public function findById(int $id): ?array
    {
        return $this->repository->find($id);
    }

    public static function create(UserRepository $repo): static
    {
        return new static($repo);
    }
}
```

`BaseRepository.php`:
```php
<?php
declare(strict_types=1);

namespace App\Repository;

abstract class BaseRepository
{
    abstract public function find(int $id): ?array;
    abstract public function findAll(): array;
}
```

`UserRepository.php`:
```php
<?php
declare(strict_types=1);

namespace App\Repository;

use App\Model\User;

class UserRepository extends BaseRepository
{
    public function find(int $id): ?array
    {
        return null;
    }

    public function findAll(): array
    {
        return [];
    }

    public function findByStatus(string $status): array
    {
        return [];
    }
}
```

`User.php`:
```php
<?php
declare(strict_types=1);

namespace App\Model;

use App\Enum\UserStatus;
use App\Trait\TimestampableTrait;

class User
{
    use TimestampableTrait;

    public function __construct(
        private readonly int $id,
        private string $name,
        private UserStatus $status = UserStatus::Active,
    ) {}

    public function getId(): int
    {
        return $this->id;
    }

    public function getName(): string
    {
        return $this->name;
    }

    public function getStatus(): UserStatus
    {
        return $this->status;
    }
}
```

`TimestampableTrait.php`:
```php
<?php
declare(strict_types=1);

namespace App\Trait;

trait TimestampableTrait
{
    private \DateTimeImmutable $createdAt;

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }
}
```

`UserStatus.php`:
```php
<?php
declare(strict_types=1);

namespace App\Enum;

enum UserStatus: string
{
    case Active = 'active';
    case Inactive = 'inactive';
    case Suspended = 'suspended';
}
```

**Step 2: Commit fixtures**

```bash
git add packages/analyzer/test/fixtures/
git commit -m "test(analyzer): add PHP fixture project for parser accuracy tests"
```

---

## Task 7: Tree-sitter PHP Parser -- Symbol Extraction

**Goal:** Implement the PHP parser that extracts symbols (classes, interfaces, traits, enums, methods, properties, constants) from a single file.

**Files:**
- Create: `packages/analyzer/src/parsers/php/php-parser.ts`
- Create: `packages/analyzer/src/parsers/php/ast-visitor.ts`
- Create: `packages/analyzer/src/parsers/php/node-utils.ts`
- Test: `packages/analyzer/src/parsers/php/__tests__/symbol-extraction.test.ts`

**Step 1: Install tree-sitter dependencies**

```bash
cd packages/analyzer
pnpm add web-tree-sitter
```

Download WASM grammar:
```bash
mkdir -p grammars
# Use the grammar built in Task 0, or download from releases
```

**Step 2: Write the failing test**

```typescript
// packages/analyzer/src/parsers/php/__tests__/symbol-extraction.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PhpParser } from '../php-parser.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SymbolKind, Modifier } from '@sniffo/core';

const FIXTURES = join(__dirname, '../../../../test/fixtures/php-project/src');

describe('PHP Symbol Extraction', () => {
  let parser: PhpParser;

  beforeAll(async () => {
    parser = new PhpParser();
    await parser.initialize();
  });

  afterAll(() => {
    parser.dispose();
  });

  describe('UserController.php', () => {
    let result: Awaited<ReturnType<PhpParser['parse']>>;

    beforeAll(async () => {
      const filePath = 'src/Controller/UserController.php';
      const source = readFileSync(join(FIXTURES, 'Controller/UserController.php'), 'utf-8');
      result = await parser.parse(filePath, source);
    });

    it('extracts the abstract class', () => {
      const cls = result.symbols.find((s) => s.name === 'AbstractController');
      expect(cls).toBeDefined();
      expect(cls!.kind).toBe(SymbolKind.Class);
      expect(cls!.fqn).toBe('App\\Controller\\AbstractController');
      expect(cls!.modifiers).toContain(Modifier.Abstract);
    });

    it('extracts the concrete class', () => {
      const cls = result.symbols.find((s) => s.name === 'UserController');
      expect(cls).toBeDefined();
      expect(cls!.kind).toBe(SymbolKind.Class);
      expect(cls!.fqn).toBe('App\\Controller\\UserController');
    });

    it('extracts methods', () => {
      const methods = result.symbols.filter((s) => s.kind === SymbolKind.Method);
      const methodNames = methods.map((m) => m.name);
      expect(methodNames).toContain('__construct');
      expect(methodNames).toContain('handle');
      expect(methodNames).toContain('index');
      expect(methodNames).toContain('show');
    });

    it('extracts promoted property from constructor', () => {
      const prop = result.symbols.find(
        (s) => s.kind === SymbolKind.Property && s.name === 'userService',
      );
      expect(prop).toBeDefined();
      expect(prop!.modifiers).toContain(Modifier.Private);
      expect(prop!.modifiers).toContain(Modifier.Readonly);
    });
  });

  describe('UserService.php', () => {
    let result: Awaited<ReturnType<PhpParser['parse']>>;

    beforeAll(async () => {
      const filePath = 'src/Service/UserService.php';
      const source = readFileSync(join(FIXTURES, 'Service/UserService.php'), 'utf-8');
      result = await parser.parse(filePath, source);
    });

    it('extracts the class', () => {
      const cls = result.symbols.find((s) => s.name === 'UserService');
      expect(cls).toBeDefined();
      expect(cls!.fqn).toBe('App\\Service\\UserService');
    });

    it('extracts methods including static', () => {
      const create = result.symbols.find((s) => s.name === 'create');
      expect(create).toBeDefined();
      expect(create!.modifiers).toContain(Modifier.Static);
      expect(create!.modifiers).toContain(Modifier.Public);
    });
  });

  describe('UserServiceInterface.php', () => {
    it('extracts interface with methods', async () => {
      const source = readFileSync(
        join(FIXTURES, 'Service/UserServiceInterface.php'),
        'utf-8',
      );
      const result = await parser.parse('src/Service/UserServiceInterface.php', source);

      const iface = result.symbols.find((s) => s.kind === SymbolKind.Interface);
      expect(iface).toBeDefined();
      expect(iface!.fqn).toBe('App\\Service\\UserServiceInterface');

      const methods = result.symbols.filter((s) => s.kind === SymbolKind.Method);
      expect(methods).toHaveLength(2);
    });
  });

  describe('TimestampableTrait.php', () => {
    it('extracts trait with methods and properties', async () => {
      const source = readFileSync(join(FIXTURES, 'Trait/TimestampableTrait.php'), 'utf-8');
      const result = await parser.parse('src/Trait/TimestampableTrait.php', source);

      const trait = result.symbols.find((s) => s.kind === SymbolKind.Trait);
      expect(trait).toBeDefined();
      expect(trait!.fqn).toBe('App\\Trait\\TimestampableTrait');

      const prop = result.symbols.find((s) => s.kind === SymbolKind.Property);
      expect(prop).toBeDefined();
      expect(prop!.name).toBe('createdAt');
    });
  });

  describe('UserStatus.php', () => {
    it('extracts enum', async () => {
      const source = readFileSync(join(FIXTURES, 'Enum/UserStatus.php'), 'utf-8');
      const result = await parser.parse('src/Enum/UserStatus.php', source);

      const enumNode = result.symbols.find((s) => s.kind === SymbolKind.Enum);
      expect(enumNode).toBeDefined();
      expect(enumNode!.fqn).toBe('App\\Enum\\UserStatus');
    });
  });

  describe('imports extraction', () => {
    it('extracts use statements from UserController', async () => {
      const source = readFileSync(
        join(FIXTURES, 'Controller/UserController.php'),
        'utf-8',
      );
      const result = await parser.parse('src/Controller/UserController.php', source);

      expect(result.imports).toHaveLength(2);
      expect(result.imports.map((i) => i.originalName)).toContain(
        'App\\Service\\UserServiceInterface',
      );
      expect(result.imports.map((i) => i.originalName)).toContain(
        'App\\Service\\UserService',
      );
    });
  });
});
```

**Step 3: Run test to verify it fails**

```bash
cd packages/analyzer && pnpm test
```

**Step 4: Write node-utils.ts**

```typescript
// packages/analyzer/src/parsers/php/node-utils.ts
import type Parser from 'web-tree-sitter';

export function findChildByType(
  node: Parser.SyntaxNode,
  type: string,
): Parser.SyntaxNode | null {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === type) return child;
  }
  return null;
}

export function findChildrenByType(
  node: Parser.SyntaxNode,
  type: string,
): Parser.SyntaxNode[] {
  const results: Parser.SyntaxNode[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === type) results.push(child);
  }
  return results;
}

export function findDescendantsByType(
  node: Parser.SyntaxNode,
  type: string,
): Parser.SyntaxNode[] {
  const results: Parser.SyntaxNode[] = [];
  const walk = (n: Parser.SyntaxNode) => {
    if (n.type === type) results.push(n);
    for (let i = 0; i < n.childCount; i++) {
      const child = n.child(i);
      if (child) walk(child);
    }
  };
  walk(node);
  return results;
}

export function getNodeText(node: Parser.SyntaxNode | null): string {
  return node?.text ?? '';
}
```

**Step 5: Write ast-visitor.ts**

```typescript
// packages/analyzer/src/parsers/php/ast-visitor.ts
import type Parser from 'web-tree-sitter';
import {
  type ParsedSymbol,
  type ParsedReference,
  type ImportStatement,
  type ParseError,
  SymbolKind,
  Modifier,
  ReferenceKind,
} from '@sniffo/core';
import { findChildByType, findChildrenByType, findDescendantsByType, getNodeText } from './node-utils.js';

interface VisitorContext {
  filePath: string;
  currentNamespace: string | null;
  currentClass: string | null;
  symbols: ParsedSymbol[];
  references: ParsedReference[];
  imports: ImportStatement[];
  errors: ParseError[];
}

export function visitTree(rootNode: Parser.SyntaxNode, filePath: string): VisitorContext {
  const ctx: VisitorContext = {
    filePath,
    currentNamespace: null,
    currentClass: null,
    symbols: [],
    references: [],
    imports: [],
    errors: [],
  };

  visitNode(rootNode, ctx);
  return ctx;
}

function visitNode(node: Parser.SyntaxNode, ctx: VisitorContext): void {
  switch (node.type) {
    case 'namespace_definition':
      visitNamespace(node, ctx);
      return;
    case 'namespace_use_declaration':
      visitUseDeclaration(node, ctx);
      break;
    case 'class_declaration':
      visitClass(node, ctx);
      return;
    case 'interface_declaration':
      visitInterface(node, ctx);
      return;
    case 'trait_declaration':
      visitTrait(node, ctx);
      return;
    case 'enum_declaration':
      visitEnum(node, ctx);
      return;
    case 'function_definition':
      visitFunction(node, ctx);
      return;
    case 'ERROR':
      ctx.errors.push({
        message: `Parse error at node`,
        line: node.startPosition.row + 1,
        column: node.startPosition.column,
        nodeType: 'ERROR',
      });
      break;
  }

  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) visitNode(child, ctx);
  }
}

function fqn(ctx: VisitorContext, name: string): string {
  const parts: string[] = [];
  if (ctx.currentNamespace) parts.push(ctx.currentNamespace);
  if (ctx.currentClass) parts.push(ctx.currentClass);
  parts.push(name);
  return ctx.currentClass
    ? `${ctx.currentNamespace ? ctx.currentNamespace + '\\' : ''}${ctx.currentClass}::${name}`
    : parts.join('\\');
}

function classFqn(ctx: VisitorContext, name: string): string {
  return ctx.currentNamespace ? `${ctx.currentNamespace}\\${name}` : name;
}

function extractModifiers(node: Parser.SyntaxNode): Modifier[] {
  const mods: Modifier[] = [];
  const modMap: Record<string, Modifier> = {
    public: Modifier.Public,
    protected: Modifier.Protected,
    private: Modifier.Private,
    static: Modifier.Static,
    abstract: Modifier.Abstract,
    final: Modifier.Final,
    readonly: Modifier.Readonly,
  };

  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    // visibility_modifier, static_modifier, abstract_modifier, final_modifier, readonly_modifier
    if (child.type.endsWith('_modifier') || child.type === 'readonly') {
      const mod = modMap[child.text];
      if (mod) mods.push(mod);
    }
    if (child.type === 'abstract') mods.push(Modifier.Abstract);
  }

  return mods;
}

function visitNamespace(node: Parser.SyntaxNode, ctx: VisitorContext): void {
  const nameNode = findChildByType(node, 'namespace_name');
  if (nameNode) {
    ctx.currentNamespace = nameNode.text;
  }

  const body = findChildByType(node, 'compound_statement') || findChildByType(node, 'declaration_list');
  if (body) {
    for (let i = 0; i < body.childCount; i++) {
      const child = body.child(i);
      if (child) visitNode(child, ctx);
    }
  } else {
    // Namespace without braces -- applies to rest of file
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child && child.type !== 'namespace_name' && child.type !== 'namespace' && child.type !== ';') {
        visitNode(child, ctx);
      }
    }
  }
}

function visitUseDeclaration(node: Parser.SyntaxNode, ctx: VisitorContext): void {
  const clauses = findDescendantsByType(node, 'namespace_use_clause');
  for (const clause of clauses) {
    const nameNode = findChildByType(clause, 'qualified_name') || findChildByType(clause, 'name');
    const aliasNode = findChildByType(clause, 'namespace_aliasing_clause');

    if (nameNode) {
      ctx.imports.push({
        originalName: nameNode.text,
        alias: aliasNode ? getNodeText(findChildByType(aliasNode, 'name')) || null : null,
        line: node.startPosition.row + 1,
      });
    }
  }
}

function visitClass(node: Parser.SyntaxNode, ctx: VisitorContext): void {
  const nameNode = findChildByType(node, 'name');
  if (!nameNode) return;

  const name = nameNode.text;
  const prevClass = ctx.currentClass;
  ctx.currentClass = name;

  const modifiers = extractModifiers(node);

  ctx.symbols.push({
    kind: SymbolKind.Class,
    name,
    fqn: classFqn(ctx, name),
    filePath: ctx.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    startColumn: node.startPosition.column,
    endColumn: node.endPosition.column,
    modifiers,
    metadata: {},
  });

  // Extract extends
  const baseClause = findChildByType(node, 'base_clause');
  if (baseClause) {
    const baseName = findChildByType(baseClause, 'name') || findChildByType(baseClause, 'qualified_name');
    if (baseName) {
      ctx.references.push({
        kind: ReferenceKind.Extends,
        sourceSymbolFqn: classFqn(ctx, name),
        targetName: baseName.text,
        targetFqn: null,
        filePath: ctx.filePath,
        line: baseName.startPosition.row + 1,
        column: baseName.startPosition.column,
        context: `extends ${baseName.text}`,
      });
    }
  }

  // Extract implements
  const ifaceClause = findChildByType(node, 'class_interface_clause');
  if (ifaceClause) {
    const names = findChildrenByType(ifaceClause, 'name')
      .concat(findChildrenByType(ifaceClause, 'qualified_name'));
    for (const n of names) {
      ctx.references.push({
        kind: ReferenceKind.Implements,
        sourceSymbolFqn: classFqn(ctx, name),
        targetName: n.text,
        targetFqn: null,
        filePath: ctx.filePath,
        line: n.startPosition.row + 1,
        column: n.startPosition.column,
        context: `implements ${n.text}`,
      });
    }
  }

  // Visit body
  const body = findChildByType(node, 'declaration_list');
  if (body) {
    for (let i = 0; i < body.childCount; i++) {
      const child = body.child(i);
      if (!child) continue;

      switch (child.type) {
        case 'method_declaration':
          visitMethod(child, ctx);
          break;
        case 'property_declaration':
          visitProperty(child, ctx);
          break;
        case 'const_declaration':
          visitConstant(child, ctx);
          break;
        case 'use_declaration':
          visitTraitUse(child, ctx);
          break;
      }
    }
  }

  ctx.currentClass = prevClass;
}

function visitInterface(node: Parser.SyntaxNode, ctx: VisitorContext): void {
  const nameNode = findChildByType(node, 'name');
  if (!nameNode) return;

  const name = nameNode.text;
  const prevClass = ctx.currentClass;
  ctx.currentClass = name;

  ctx.symbols.push({
    kind: SymbolKind.Interface,
    name,
    fqn: classFqn(ctx, name),
    filePath: ctx.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    startColumn: node.startPosition.column,
    endColumn: node.endPosition.column,
    modifiers: [],
    metadata: {},
  });

  const body = findChildByType(node, 'declaration_list');
  if (body) {
    for (let i = 0; i < body.childCount; i++) {
      const child = body.child(i);
      if (child?.type === 'method_declaration') visitMethod(child, ctx);
    }
  }

  ctx.currentClass = prevClass;
}

function visitTrait(node: Parser.SyntaxNode, ctx: VisitorContext): void {
  const nameNode = findChildByType(node, 'name');
  if (!nameNode) return;

  const name = nameNode.text;
  const prevClass = ctx.currentClass;
  ctx.currentClass = name;

  ctx.symbols.push({
    kind: SymbolKind.Trait,
    name,
    fqn: classFqn(ctx, name),
    filePath: ctx.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    startColumn: node.startPosition.column,
    endColumn: node.endPosition.column,
    modifiers: [],
    metadata: {},
  });

  const body = findChildByType(node, 'declaration_list');
  if (body) {
    for (let i = 0; i < body.childCount; i++) {
      const child = body.child(i);
      if (!child) continue;
      if (child.type === 'method_declaration') visitMethod(child, ctx);
      if (child.type === 'property_declaration') visitProperty(child, ctx);
    }
  }

  ctx.currentClass = prevClass;
}

function visitEnum(node: Parser.SyntaxNode, ctx: VisitorContext): void {
  const nameNode = findChildByType(node, 'name');
  if (!nameNode) return;

  const name = nameNode.text;

  ctx.symbols.push({
    kind: SymbolKind.Enum,
    name,
    fqn: classFqn(ctx, name),
    filePath: ctx.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    startColumn: node.startPosition.column,
    endColumn: node.endPosition.column,
    modifiers: [],
    metadata: {},
  });
}

function visitFunction(node: Parser.SyntaxNode, ctx: VisitorContext): void {
  const nameNode = findChildByType(node, 'name');
  if (!nameNode) return;

  ctx.symbols.push({
    kind: SymbolKind.Function,
    name: nameNode.text,
    fqn: fqn(ctx, nameNode.text),
    filePath: ctx.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    startColumn: node.startPosition.column,
    endColumn: node.endPosition.column,
    modifiers: [],
    metadata: {},
  });
}

function visitMethod(node: Parser.SyntaxNode, ctx: VisitorContext): void {
  const nameNode = findChildByType(node, 'name');
  if (!nameNode) return;

  const modifiers = extractModifiers(node);
  if (modifiers.length === 0) modifiers.push(Modifier.Public);

  ctx.symbols.push({
    kind: SymbolKind.Method,
    name: nameNode.text,
    fqn: fqn(ctx, nameNode.text),
    filePath: ctx.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    startColumn: node.startPosition.column,
    endColumn: node.endPosition.column,
    modifiers,
    metadata: {},
  });

  // Check for constructor with promoted properties
  if (nameNode.text === '__construct') {
    const params = findChildByType(node, 'formal_parameters');
    if (params) {
      visitConstructorParams(params, ctx);
    }
  }
}

function visitConstructorParams(node: Parser.SyntaxNode, ctx: VisitorContext): void {
  const params = findDescendantsByType(node, 'property_promotion_parameter');
  for (const param of params) {
    const modifiers = extractModifiers(param);
    const varNode = findChildByType(param, 'variable_name');
    if (!varNode) continue;

    const propName = varNode.text.replace(/^\$/, '');

    ctx.symbols.push({
      kind: SymbolKind.Property,
      name: propName,
      fqn: fqn(ctx, propName),
      filePath: ctx.filePath,
      startLine: param.startPosition.row + 1,
      endLine: param.endPosition.row + 1,
      startColumn: param.startPosition.column,
      endColumn: param.endPosition.column,
      modifiers,
      metadata: { promoted: true },
    });

    // Extract type for injection reference
    const typeNode = findChildByType(param, 'named_type')
      || findChildByType(param, 'qualified_name')
      || findChildByType(param, 'name');
    if (typeNode && !isScalarType(typeNode.text)) {
      ctx.references.push({
        kind: ReferenceKind.Injects,
        sourceSymbolFqn: ctx.currentClass
          ? classFqn(ctx, ctx.currentClass)
          : ctx.filePath,
        targetName: typeNode.text,
        targetFqn: null,
        filePath: ctx.filePath,
        line: typeNode.startPosition.row + 1,
        column: typeNode.startPosition.column,
        context: `injects ${typeNode.text}`,
      });
    }
  }
}

function visitProperty(node: Parser.SyntaxNode, ctx: VisitorContext): void {
  const modifiers = extractModifiers(node);
  const elements = findDescendantsByType(node, 'property_element');
  for (const el of elements) {
    const varNode = findChildByType(el, 'variable_name');
    if (!varNode) continue;

    const propName = varNode.text.replace(/^\$/, '');

    ctx.symbols.push({
      kind: SymbolKind.Property,
      name: propName,
      fqn: fqn(ctx, propName),
      filePath: ctx.filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      startColumn: node.startPosition.column,
      endColumn: node.endPosition.column,
      modifiers,
      metadata: {},
    });
  }
}

function visitConstant(node: Parser.SyntaxNode, ctx: VisitorContext): void {
  const elements = findDescendantsByType(node, 'const_element');
  for (const el of elements) {
    const nameNode = findChildByType(el, 'name');
    if (!nameNode) continue;

    ctx.symbols.push({
      kind: SymbolKind.Constant,
      name: nameNode.text,
      fqn: fqn(ctx, nameNode.text),
      filePath: ctx.filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      startColumn: node.startPosition.column,
      endColumn: node.endPosition.column,
      modifiers: [],
      metadata: {},
    });
  }
}

function visitTraitUse(node: Parser.SyntaxNode, ctx: VisitorContext): void {
  const names = findChildrenByType(node, 'name')
    .concat(findChildrenByType(node, 'qualified_name'));
  for (const n of names) {
    ctx.references.push({
      kind: ReferenceKind.UsesTrait,
      sourceSymbolFqn: ctx.currentClass
        ? classFqn(ctx, ctx.currentClass)
        : ctx.filePath,
      targetName: n.text,
      targetFqn: null,
      filePath: ctx.filePath,
      line: n.startPosition.row + 1,
      column: n.startPosition.column,
      context: `use ${n.text}`,
    });
  }
}

function isScalarType(name: string): boolean {
  return ['int', 'string', 'float', 'bool', 'array', 'void', 'null', 'mixed', 'never', 'object', 'callable', 'iterable', 'self', 'static', 'parent', 'true', 'false'].includes(name.toLowerCase());
}
```

**Step 6: Write php-parser.ts**

```typescript
// packages/analyzer/src/parsers/php/php-parser.ts
import Parser from 'web-tree-sitter';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LanguageParser, ParsedFile } from '@sniffo/core';
import { visitTree } from './ast-visitor.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class PhpParser implements LanguageParser {
  readonly language = 'php';
  readonly fileExtensions = ['.php'];

  private parser: Parser | null = null;

  async initialize(): Promise<void> {
    await Parser.init();
    this.parser = new Parser();

    const grammarPath = join(__dirname, '../../../grammars/tree-sitter-php.wasm');
    const lang = await Parser.Language.load(grammarPath);
    this.parser.setLanguage(lang);
  }

  canParse(filePath: string): boolean {
    return this.fileExtensions.some((ext) => filePath.endsWith(ext));
  }

  async parse(filePath: string, source: string): Promise<ParsedFile> {
    if (!this.parser) throw new Error('Parser not initialized. Call initialize() first.');

    const tree = this.parser.parse(source);
    const ctx = visitTree(tree.rootNode, filePath);

    const contentHash = createHash('sha256').update(source).digest('hex');

    return {
      filePath,
      language: 'php',
      contentHash,
      symbols: ctx.symbols,
      references: ctx.references,
      imports: ctx.imports,
      errors: ctx.errors,
    };
  }

  dispose(): void {
    this.parser?.delete();
    this.parser = null;
  }
}
```

**Step 7: Run tests**

```bash
cd packages/analyzer && pnpm test
```

Expected: All symbol extraction tests pass. If any fail, debug by inspecting the AST output of the specific fixture.

**Step 8: Commit**

```bash
git add packages/analyzer/src/parsers/php/ packages/analyzer/src/parsers/__tests__/
git commit -m "feat(analyzer): implement PHP parser with Tree-sitter for symbol extraction"
```

---

## Task 8: PHP Parser -- Reference Extraction Tests

**Goal:** Verify intra-file reference extraction: extends, implements, trait use, constructor injection, imports.

**Files:**
- Test: `packages/analyzer/src/parsers/php/__tests__/reference-extraction.test.ts`

**Step 1: Write the test**

```typescript
// packages/analyzer/src/parsers/php/__tests__/reference-extraction.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PhpParser } from '../php-parser.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ReferenceKind } from '@sniffo/core';

const FIXTURES = join(__dirname, '../../../../test/fixtures/php-project/src');

describe('PHP Reference Extraction', () => {
  let parser: PhpParser;

  beforeAll(async () => {
    parser = new PhpParser();
    await parser.initialize();
  });

  afterAll(() => {
    parser.dispose();
  });

  describe('extends', () => {
    it('detects class extends', async () => {
      const source = readFileSync(join(FIXTURES, 'Controller/UserController.php'), 'utf-8');
      const result = await parser.parse('src/Controller/UserController.php', source);

      const extendsRef = result.references.find(
        (r) => r.kind === ReferenceKind.Extends && r.sourceSymbolFqn.includes('UserController'),
      );
      expect(extendsRef).toBeDefined();
      expect(extendsRef!.targetName).toBe('AbstractController');
    });

    it('detects abstract class extends', async () => {
      const source = readFileSync(join(FIXTURES, 'Repository/UserRepository.php'), 'utf-8');
      const result = await parser.parse('src/Repository/UserRepository.php', source);

      const extendsRef = result.references.find((r) => r.kind === ReferenceKind.Extends);
      expect(extendsRef).toBeDefined();
      expect(extendsRef!.targetName).toBe('BaseRepository');
    });
  });

  describe('implements', () => {
    it('detects interface implementation', async () => {
      const source = readFileSync(join(FIXTURES, 'Service/UserService.php'), 'utf-8');
      const result = await parser.parse('src/Service/UserService.php', source);

      const implRef = result.references.find((r) => r.kind === ReferenceKind.Implements);
      expect(implRef).toBeDefined();
      expect(implRef!.targetName).toBe('UserServiceInterface');
    });
  });

  describe('trait usage', () => {
    it('detects use trait', async () => {
      const source = readFileSync(join(FIXTURES, 'Service/UserService.php'), 'utf-8');
      const result = await parser.parse('src/Service/UserService.php', source);

      const traitRef = result.references.find((r) => r.kind === ReferenceKind.UsesTrait);
      expect(traitRef).toBeDefined();
      expect(traitRef!.targetName).toBe('TimestampableTrait');
    });

    it('detects multiple trait usage', async () => {
      const source = readFileSync(join(FIXTURES, 'Model/User.php'), 'utf-8');
      const result = await parser.parse('src/Model/User.php', source);

      const traitRefs = result.references.filter((r) => r.kind === ReferenceKind.UsesTrait);
      expect(traitRefs).toHaveLength(1);
      expect(traitRefs[0].targetName).toBe('TimestampableTrait');
    });
  });

  describe('constructor injection', () => {
    it('detects promoted property injection', async () => {
      const source = readFileSync(join(FIXTURES, 'Controller/UserController.php'), 'utf-8');
      const result = await parser.parse('src/Controller/UserController.php', source);

      const injectRef = result.references.find((r) => r.kind === ReferenceKind.Injects);
      expect(injectRef).toBeDefined();
      expect(injectRef!.targetName).toBe('UserServiceInterface');
    });

    it('detects injection in service constructor', async () => {
      const source = readFileSync(join(FIXTURES, 'Service/UserService.php'), 'utf-8');
      const result = await parser.parse('src/Service/UserService.php', source);

      const injectRef = result.references.find((r) => r.kind === ReferenceKind.Injects);
      expect(injectRef).toBeDefined();
      expect(injectRef!.targetName).toBe('UserRepository');
    });
  });

  describe('imports', () => {
    it('extracts all use statements', async () => {
      const source = readFileSync(join(FIXTURES, 'Model/User.php'), 'utf-8');
      const result = await parser.parse('src/Model/User.php', source);

      expect(result.imports).toHaveLength(2);
      const names = result.imports.map((i) => i.originalName);
      expect(names).toContain('App\\Enum\\UserStatus');
      expect(names).toContain('App\\Trait\\TimestampableTrait');
    });
  });
});
```

**Step 2: Run tests**

```bash
cd packages/analyzer && pnpm test
```

Expected: All PASS. If reference extraction tests fail, adjust the AST visitor logic.

**Step 3: Commit**

```bash
git add packages/analyzer/src/parsers/php/__tests__/reference-extraction.test.ts
git commit -m "test(analyzer): add reference extraction tests for PHP parser"
```

---

## Task 9: Content Hasher Utility

**Goal:** Implement SHA-256 content hashing for files, used by the freshness system.

**Files:**
- Create: `packages/core/src/freshness/content-hasher.ts`
- Test: `packages/core/src/freshness/__tests__/content-hasher.test.ts`

**Step 1: Write the test**

```typescript
// packages/core/src/freshness/__tests__/content-hasher.test.ts
import { describe, it, expect } from 'vitest';
import { hashContent, hashFile } from '../content-hasher.js';

describe('ContentHasher', () => {
  it('produces consistent hash for same content', () => {
    const h1 = hashContent('<?php class Foo {}');
    const h2 = hashContent('<?php class Foo {}');
    expect(h1).toBe(h2);
  });

  it('produces different hash for different content', () => {
    const h1 = hashContent('<?php class Foo {}');
    const h2 = hashContent('<?php class Bar {}');
    expect(h1).not.toBe(h2);
  });

  it('returns a 64-char hex string', () => {
    const h = hashContent('test');
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });

  it('detects whitespace changes', () => {
    const h1 = hashContent('<?php class Foo {}');
    const h2 = hashContent('<?php class Foo {  }');
    expect(h1).not.toBe(h2);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/core && pnpm test
```

**Step 3: Write implementation**

```typescript
// packages/core/src/freshness/content-hasher.ts
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

export async function hashFile(filePath: string): Promise<string> {
  const content = await readFile(filePath, 'utf-8');
  return hashContent(content);
}
```

**Step 4: Run test to verify it passes**

```bash
cd packages/core && pnpm test
```

**Step 5: Update core/src/index.ts**

Add: `export * from './freshness/content-hasher.js';`

**Step 6: Commit**

```bash
git add packages/core/src/freshness/
git commit -m "feat(core): add SHA-256 content hasher for file freshness tracking"
```

---

## Task 10: Vitest Configuration and CI

**Goal:** Configure Vitest properly for the monorepo and add GitHub Actions CI.

**Files:**
- Create: `packages/core/vitest.config.ts`
- Create: `packages/analyzer/vitest.config.ts`
- Create: `.github/workflows/ci.yml`

**Step 1: Create Vitest configs**

`packages/core/vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    include: ['src/**/__tests__/**/*.test.ts'],
  },
});
```

`packages/analyzer/vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    include: ['src/**/__tests__/**/*.test.ts'],
    testTimeout: 30_000,
  },
});
```

**Step 2: Create CI workflow**

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [20, 22]

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile

      - run: pnpm typecheck

      - run: pnpm test
```

**Step 3: Run full test suite locally**

```bash
pnpm test
```

Expected: All tests pass across both packages.

**Step 4: Commit**

```bash
git add packages/core/vitest.config.ts packages/analyzer/vitest.config.ts .github/
git commit -m "chore: add Vitest configuration and GitHub Actions CI"
```

---

## Quality Gate Checklist (Phase 1 Complete)

Before proceeding to Phase 2, verify:

- [ ] `pnpm test` passes with 0 failures
- [ ] `pnpm typecheck` passes with 0 errors
- [ ] PHP parser extracts all symbol types from fixtures: class, abstract class, interface, trait, enum, method, property, constant
- [ ] PHP parser extracts intra-file references: extends, implements, use trait, constructor injection, imports
- [ ] Content hasher produces deterministic SHA-256 hashes
- [ ] Parser Registry supports registering and querying parsers by file extension
- [ ] All fixture files parse with 0 ERROR nodes from Tree-sitter
- [ ] Clone + install + test completes in under 2 minutes

Run accuracy check:
```bash
cd packages/analyzer && pnpm test -- --reporter=verbose 2>&1 | grep -E '(PASS|FAIL|Tests)'
```

Expected: >= 95% of structural elements correctly extracted from fixture files.
