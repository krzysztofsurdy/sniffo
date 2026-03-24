# Phase 10: Python Parser, Architectural Metrics & MCP Tools Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Python language support, expose blast radius and cycle detection as MCP tools for Claude Code, and add architectural metrics (coupling, cohesion, complexity) to the graph.

**Architecture:** Python parser follows the same tree-sitter WASM pattern as PHP and TypeScript -- a `PythonParser` class with an `ast-visitor` that extracts classes, functions, decorators, imports, and inheritance. New MCP tools expose `blast_radius` and `detect_cycles` directly to Claude. Architectural metrics are computed post-analysis as a new pipeline step that annotates nodes with afferent/efferent coupling counts and instability scores.

**Tech Stack:** tree-sitter-python (WASM), existing @modelcontextprotocol/sdk, existing analysis pipeline.

---

## Task 1: Python parser -- tree-sitter setup and basic extraction

**Files:**
- Create: `packages/analyzer/src/parsers/python/python-parser.ts`
- Create: `packages/analyzer/src/parsers/python/ast-visitor.ts`
- Create: `packages/analyzer/src/parsers/python/node-utils.ts`
- Create: `packages/analyzer/src/parsers/python/__tests__/python-parser.test.ts`
- Create: `packages/analyzer/test/fixtures/python-project/app/models.py`
- Create: `packages/analyzer/test/fixtures/python-project/app/services.py`
- Create: `packages/analyzer/test/fixtures/python-project/app/utils.py`

**Step 1: Create test fixtures**

```python
# packages/analyzer/test/fixtures/python-project/app/models.py
from dataclasses import dataclass
from typing import Optional

class BaseModel:
    def save(self):
        pass

    def delete(self):
        pass

@dataclass
class User(BaseModel):
    name: str
    email: str
    age: Optional[int] = None

    def validate(self) -> bool:
        return len(self.name) > 0

class Admin(User):
    role: str = "admin"

    def grant_access(self, resource: str) -> bool:
        return True
```

```python
# packages/analyzer/test/fixtures/python-project/app/services.py
from app.models import User, Admin

class UserService:
    def __init__(self):
        self.users: list[User] = []

    def create_user(self, name: str, email: str) -> User:
        user = User(name=name, email=email)
        user.save()
        return user

    def find_admin(self, name: str) -> Admin:
        return Admin(name=name, email=f"{name}@admin.com")

def get_service() -> UserService:
    return UserService()
```

```python
# packages/analyzer/test/fixtures/python-project/app/utils.py
from typing import TypeVar, Generic

T = TypeVar('T')

class Repository(Generic[T]):
    def find_all(self) -> list[T]:
        return []

    def find_by_id(self, id: int) -> T:
        raise NotImplementedError

def helper_function(x: int, y: int) -> int:
    return x + y

class Singleton:
    _instance = None

    @classmethod
    def instance(cls) -> 'Singleton':
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance
```

**Step 2: Write failing tests**

```typescript
// packages/analyzer/src/parsers/python/__tests__/python-parser.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PythonParser } from '../python-parser.js';

const FIXTURES = join(import.meta.dirname, '../../../../test/fixtures/python-project');

describe('PythonParser', () => {
  let parser: PythonParser;

  beforeAll(async () => {
    parser = new PythonParser();
    await parser.initialize();
  });

  afterAll(() => {
    parser.dispose();
  });

  it('canParse returns true for .py files', () => {
    expect(parser.canParse('app/models.py')).toBe(true);
    expect(parser.canParse('test.pyx')).toBe(false);
    expect(parser.canParse('script.ts')).toBe(false);
  });

  it('extracts classes from models.py', async () => {
    const source = readFileSync(join(FIXTURES, 'app/models.py'), 'utf-8');
    const result = await parser.parse('app/models.py', source);

    const classNames = result.symbols
      .filter(s => s.kind === 'class')
      .map(s => s.name);

    expect(classNames).toContain('BaseModel');
    expect(classNames).toContain('User');
    expect(classNames).toContain('Admin');
  });

  it('extracts methods from classes', async () => {
    const source = readFileSync(join(FIXTURES, 'app/models.py'), 'utf-8');
    const result = await parser.parse('app/models.py', source);

    const methods = result.symbols
      .filter(s => s.kind === 'method')
      .map(s => s.name);

    expect(methods).toContain('save');
    expect(methods).toContain('delete');
    expect(methods).toContain('validate');
    expect(methods).toContain('grant_access');
  });

  it('extracts standalone functions', async () => {
    const source = readFileSync(join(FIXTURES, 'app/utils.py'), 'utf-8');
    const result = await parser.parse('app/utils.py', source);

    const funcs = result.symbols
      .filter(s => s.kind === 'function')
      .map(s => s.name);

    expect(funcs).toContain('helper_function');
  });

  it('extracts inheritance references', async () => {
    const source = readFileSync(join(FIXTURES, 'app/models.py'), 'utf-8');
    const result = await parser.parse('app/models.py', source);

    const extendsRefs = result.references
      .filter(r => r.kind === 'extends')
      .map(r => ({ source: r.sourceSymbolFqn, target: r.targetName }));

    expect(extendsRefs).toContainEqual(
      expect.objectContaining({ target: 'BaseModel' }),
    );
    expect(extendsRefs).toContainEqual(
      expect.objectContaining({ target: 'User' }),
    );
  });

  it('extracts import statements', async () => {
    const source = readFileSync(join(FIXTURES, 'app/services.py'), 'utf-8');
    const result = await parser.parse('app/services.py', source);

    expect(result.imports.length).toBeGreaterThan(0);

    const importedNames = result.references
      .filter(r => r.kind === 'imports')
      .map(r => r.targetName);

    expect(importedNames).toContain('User');
    expect(importedNames).toContain('Admin');
  });

  it('extracts instantiation references', async () => {
    const source = readFileSync(join(FIXTURES, 'app/services.py'), 'utf-8');
    const result = await parser.parse('app/services.py', source);

    const instantiations = result.references
      .filter(r => r.kind === 'instantiates')
      .map(r => r.targetName);

    expect(instantiations).toContain('User');
    expect(instantiations).toContain('Admin');
  });

  it('uses module path as namespace', async () => {
    const source = readFileSync(join(FIXTURES, 'app/models.py'), 'utf-8');
    const result = await parser.parse('app/models.py', source);

    const userClass = result.symbols.find(s => s.name === 'User' && s.kind === 'class');
    expect(userClass).toBeDefined();
    expect(userClass!.fqn).toBe('app.models.User');
  });

  it('handles decorated classes', async () => {
    const source = readFileSync(join(FIXTURES, 'app/models.py'), 'utf-8');
    const result = await parser.parse('app/models.py', source);

    const user = result.symbols.find(s => s.name === 'User' && s.kind === 'class');
    expect(user).toBeDefined();
  });

  it('extracts classmethod decorators', async () => {
    const source = readFileSync(join(FIXTURES, 'app/utils.py'), 'utf-8');
    const result = await parser.parse('app/utils.py', source);

    const instanceMethod = result.symbols.find(s => s.name === 'instance' && s.kind === 'method');
    expect(instanceMethod).toBeDefined();
  });
});
```

**Step 3: Run tests to verify they fail**

```bash
cd /Users/krzysztofsurdy/ProjectsPrivate/llmProjectContextualizer
pnpm install tree-sitter-python --filter @contextualizer/analyzer
pnpm --filter @contextualizer/analyzer test -- --reporter verbose src/parsers/python/__tests__/
```

**Step 4: Create node-utils.ts**

```typescript
// packages/analyzer/src/parsers/python/node-utils.ts
// Same utility pattern as PHP and TypeScript parsers
import type { Node } from 'web-tree-sitter';

export function findChildByType(node: Node, type: string): Node | null {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === type) return child;
  }
  return null;
}

export function findChildrenByType(node: Node, type: string): Node[] {
  const result: Node[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === type) result.push(child);
  }
  return result;
}

export function findDescendantsByType(node: Node, type: string): Node[] {
  const result: Node[] = [];
  const stack: Node[] = [node];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current.type === type) result.push(current);
    for (let i = current.childCount - 1; i >= 0; i--) {
      const child = current.child(i);
      if (child) stack.push(child);
    }
  }
  return result;
}
```

**Step 5: Create ast-visitor.ts**

```typescript
// packages/analyzer/src/parsers/python/ast-visitor.ts
import type { Node } from 'web-tree-sitter';
import { SymbolKind, Modifier, ReferenceKind } from '@contextualizer/core';
import type { ParsedSymbol, ParsedReference, ImportStatement, ParseError } from '@contextualizer/core';
import { findChildByType, findChildrenByType, findDescendantsByType } from './node-utils.js';

interface VisitorContext {
  filePath: string;
  moduleName: string;
  currentClass: string | null;
  symbols: ParsedSymbol[];
  references: ParsedReference[];
  imports: ImportStatement[];
  errors: ParseError[];
}

export function visitTree(rootNode: Node, filePath: string): VisitorContext {
  const moduleName = filePathToModule(filePath);
  const ctx: VisitorContext = {
    filePath,
    moduleName,
    currentClass: null,
    symbols: [],
    references: [],
    imports: [],
    errors: [],
  };

  visitNode(rootNode, ctx);
  return ctx;
}

function filePathToModule(filePath: string): string {
  return filePath
    .replace(/\.py$/, '')
    .replace(/\//g, '.')
    .replace(/\\/g, '.');
}

function makeFqn(ctx: VisitorContext, name: string): string {
  if (ctx.currentClass) {
    return `${ctx.moduleName}.${ctx.currentClass}::${name}`;
  }
  return `${ctx.moduleName}.${name}`;
}

function visitNode(node: Node, ctx: VisitorContext): void {
  switch (node.type) {
    case 'import_statement':
    case 'import_from_statement':
      visitImport(node, ctx);
      break;
    case 'class_definition':
      visitClass(node, ctx);
      return; // Don't recurse; handled inside visitClass
    case 'decorated_definition':
      visitDecorated(node, ctx);
      return;
    case 'function_definition':
      if (!ctx.currentClass) {
        visitFunction(node, ctx);
        return;
      }
      break;
    case 'ERROR':
      ctx.errors.push({
        message: 'Parse error',
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

function visitDecorated(node: Node, ctx: VisitorContext): void {
  // decorated_definition has decorator(s) followed by the actual definition
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    if (child.type === 'class_definition') {
      visitClass(child, ctx);
    } else if (child.type === 'function_definition') {
      if (ctx.currentClass) {
        visitMethod(child, ctx);
      } else {
        visitFunction(child, ctx);
      }
    }
  }
}

function visitImport(node: Node, ctx: VisitorContext): void {
  if (node.type === 'import_from_statement') {
    // from X import Y, Z
    const moduleNode = findChildByType(node, 'dotted_name') ?? findChildByType(node, 'relative_import');
    const modulePath = moduleNode?.text ?? '';

    const importedNames = findDescendantsByType(node, 'dotted_name')
      .filter(n => n !== moduleNode);
    // Also check for aliased imports
    const aliasedImports = findDescendantsByType(node, 'aliased_import');

    const names: string[] = [];

    for (const nameNode of importedNames) {
      const name = nameNode.text;
      if (name && name !== modulePath) {
        names.push(name);
      }
    }

    for (const alias of aliasedImports) {
      const nameNode = findChildByType(alias, 'dotted_name') ?? findChildByType(alias, 'identifier');
      if (nameNode) names.push(nameNode.text);
    }

    // Deduplicate
    const uniqueNames = [...new Set(names)];

    for (const name of uniqueNames) {
      ctx.imports.push({
        originalName: `${modulePath}.${name}`,
        alias: null,
        line: node.startPosition.row + 1,
      });

      ctx.references.push({
        kind: ReferenceKind.Imports,
        sourceSymbolFqn: makeFqn(ctx, '__module__'),
        targetName: name,
        targetFqn: null,
        filePath: ctx.filePath,
        line: node.startPosition.row + 1,
        column: node.startPosition.column,
        context: node.text.split('\n')[0],
      });
    }
  } else if (node.type === 'import_statement') {
    // import X, import X as Y
    const names = findDescendantsByType(node, 'dotted_name');
    for (const nameNode of names) {
      const name = nameNode.text;
      ctx.imports.push({
        originalName: name,
        alias: null,
        line: node.startPosition.row + 1,
      });
    }
  }
}

function visitClass(node: Node, ctx: VisitorContext): void {
  const nameNode = findChildByType(node, 'identifier');
  if (!nameNode) return;

  const name = nameNode.text;
  const classFqn = makeFqn(ctx, name);

  ctx.symbols.push({
    kind: SymbolKind.Class,
    name,
    fqn: classFqn,
    filePath: ctx.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    startColumn: node.startPosition.column,
    endColumn: node.endPosition.column,
    modifiers: [],
    metadata: {},
  });

  // Superclasses: class Foo(Bar, Baz):
  const argList = findChildByType(node, 'argument_list');
  if (argList) {
    for (let i = 0; i < argList.childCount; i++) {
      const arg = argList.child(i);
      if (!arg) continue;
      if (arg.type === 'identifier' || arg.type === 'attribute') {
        const parentName = arg.text;
        // Skip Generic[T], ABC, etc. but include real class names
        if (parentName !== 'Generic' && parentName !== 'ABC') {
          ctx.references.push({
            kind: ReferenceKind.Extends,
            sourceSymbolFqn: classFqn,
            targetName: parentName,
            targetFqn: null,
            filePath: ctx.filePath,
            line: arg.startPosition.row + 1,
            column: arg.startPosition.column,
            context: `class ${name}(${parentName})`,
          });
        }
      }
    }
  }

  // Visit class body
  const savedClass = ctx.currentClass;
  ctx.currentClass = name;

  const body = findChildByType(node, 'block');
  if (body) {
    for (let i = 0; i < body.childCount; i++) {
      const child = body.child(i);
      if (!child) continue;

      if (child.type === 'function_definition') {
        visitMethod(child, ctx);
      } else if (child.type === 'decorated_definition') {
        visitDecorated(child, ctx);
      } else {
        // Look for calls/instantiations in class body
        visitCalls(child, ctx);
      }
    }
  }

  ctx.currentClass = savedClass;
}

function visitMethod(node: Node, ctx: VisitorContext): void {
  const nameNode = findChildByType(node, 'identifier');
  if (!nameNode) return;

  const name = nameNode.text;
  const methodFqn = makeFqn(ctx, name);

  const modifiers: Modifier[] = [];
  // Check for decorators on parent decorated_definition
  if (node.parent?.type === 'decorated_definition') {
    const decorators = findChildrenByType(node.parent, 'decorator');
    for (const dec of decorators) {
      const decName = dec.text.replace('@', '').trim();
      if (decName === 'staticmethod') modifiers.push(Modifier.Static);
      if (decName === 'classmethod') modifiers.push(Modifier.Static);
    }
  }

  // Private naming convention
  if (name.startsWith('__') && !name.endsWith('__')) {
    modifiers.push(Modifier.Private);
  } else if (name.startsWith('_')) {
    modifiers.push(Modifier.Protected);
  } else {
    modifiers.push(Modifier.Public);
  }

  ctx.symbols.push({
    kind: SymbolKind.Method,
    name,
    fqn: methodFqn,
    filePath: ctx.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    startColumn: node.startPosition.column,
    endColumn: node.endPosition.column,
    modifiers,
    metadata: {},
  });

  // Look for calls/instantiations inside method body
  const body = findChildByType(node, 'block');
  if (body) visitCalls(body, ctx);
}

function visitFunction(node: Node, ctx: VisitorContext): void {
  const nameNode = findChildByType(node, 'identifier');
  if (!nameNode) return;

  const name = nameNode.text;

  ctx.symbols.push({
    kind: SymbolKind.Function,
    name,
    fqn: makeFqn(ctx, name),
    filePath: ctx.filePath,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    startColumn: node.startPosition.column,
    endColumn: node.endPosition.column,
    modifiers: [],
    metadata: {},
  });

  const body = findChildByType(node, 'block');
  if (body) visitCalls(body, ctx);
}

function visitCalls(node: Node, ctx: VisitorContext): void {
  const calls = findDescendantsByType(node, 'call');
  for (const call of calls) {
    const funcNode = call.child(0);
    if (!funcNode) continue;

    let name: string;
    if (funcNode.type === 'identifier') {
      name = funcNode.text;
    } else if (funcNode.type === 'attribute') {
      // obj.method() -- extract the method name
      const attr = findChildByType(funcNode, 'identifier');
      if (attr) {
        name = attr.text;
      } else {
        continue;
      }
    } else {
      continue;
    }

    // Skip built-ins and common non-class calls
    const builtins = new Set(['print', 'len', 'range', 'str', 'int', 'float', 'list', 'dict', 'set', 'tuple', 'isinstance', 'type', 'super', 'property', 'classmethod', 'staticmethod', 'dataclass']);
    if (builtins.has(name)) continue;
    if (name.startsWith('_')) continue;

    // Heuristic: if name starts uppercase, it's likely instantiation
    const isInstantiation = /^[A-Z]/.test(name);

    ctx.references.push({
      kind: isInstantiation ? ReferenceKind.Instantiates : ReferenceKind.Calls,
      sourceSymbolFqn: ctx.currentClass ? makeFqn(ctx, '__body__') : makeFqn(ctx, '__module__'),
      targetName: name,
      targetFqn: null,
      filePath: ctx.filePath,
      line: call.startPosition.row + 1,
      column: call.startPosition.column,
      context: call.text.split('\n')[0].slice(0, 80),
    });
  }
}
```

**Step 6: Create python-parser.ts**

```typescript
// packages/analyzer/src/parsers/python/python-parser.ts
import { Parser, Language } from 'web-tree-sitter';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import type { LanguageParser, ParsedFile } from '@contextualizer/core';
import { visitTree } from './ast-visitor.js';

export class PythonParser implements LanguageParser {
  readonly language = 'python';
  readonly fileExtensions = ['.py'];

  private parser: Parser | null = null;

  async initialize(): Promise<void> {
    await Parser.init();
    this.parser = new Parser();

    const require = createRequire(import.meta.url);
    const grammarPath = require.resolve('tree-sitter-python/tree-sitter-python.wasm');
    const lang = await Language.load(grammarPath);
    this.parser.setLanguage(lang);
  }

  canParse(filePath: string): boolean {
    return this.fileExtensions.some((ext) => filePath.endsWith(ext));
  }

  async parse(filePath: string, source: string): Promise<ParsedFile> {
    if (!this.parser) throw new Error('Parser not initialized. Call initialize() first.');

    const tree = this.parser.parse(source);
    if (!tree) throw new Error(`Failed to parse ${filePath}`);
    const ctx = visitTree(tree.rootNode, filePath);

    const contentHash = createHash('sha256').update(source).digest('hex');

    return {
      filePath,
      language: 'python',
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
pnpm --filter @contextualizer/analyzer test -- --reporter verbose src/parsers/python/__tests__/
```

**Step 8: Export and register**

Add to `packages/analyzer/src/index.ts`:
```typescript
export { PythonParser } from './parsers/python/python-parser.js';
```

**Step 9: Commit**

```bash
git add packages/analyzer/src/parsers/python/ packages/analyzer/test/fixtures/python-project/ packages/analyzer/src/index.ts
git commit -m "feat: add Python parser with class, function, import, and inheritance extraction"
```

---

## Task 2: Register Python parser in CLI, MCP server, and config

**Files:**
- Modify: `packages/cli/src/commands/analyze.ts`
- Modify: `packages/cli/src/commands/update.ts`
- Modify: `packages/mcp-server/src/tools/analyze.ts`
- Modify: `packages/mcp-server/src/tools/refresh.ts`
- Modify: `packages/mcp-server/src/index.ts`
- Modify: `packages/cli/src/config/loader.ts`

**Step 1: Register PythonParser alongside PHP and TypeScript**

In each file that creates a `ParserRegistry`, add:
```typescript
import { PythonParser } from '@contextualizer/analyzer';
await registry.register(new PythonParser());
```

Files to update:
- `packages/cli/src/commands/analyze.ts` -- add `await registry.register(new PythonParser());`
- `packages/cli/src/commands/update.ts` -- same
- `packages/mcp-server/src/tools/analyze.ts` -- same, also update default includePatterns to include `**/*.py`
- `packages/mcp-server/src/tools/refresh.ts` -- same
- `packages/mcp-server/src/index.ts` -- update the auto-analyze includePatterns to include `**/*.py`

**Step 2: Update config defaults**

In `packages/cli/src/config/loader.ts`, add `'**/*.py'` to the `DEFAULT_CONFIG.include` array if not already there.

In `packages/cli/src/commands/init.ts`, add `'**/*.py'` to `DEFAULT_CONFIG.include` if not already there.

**Step 3: Update file discovery language map**

In `packages/analyzer/src/pipeline/file-discovery.ts`, verify `'.py': 'python'` exists in `EXTENSION_TO_LANGUAGE` (it already does based on earlier reading).

**Step 4: Build and test**

```bash
pnpm build && pnpm test
```

**Step 5: Commit**

```bash
git add packages/cli/ packages/mcp-server/ packages/analyzer/src/pipeline/file-discovery.ts
git commit -m "feat: register Python parser in CLI, MCP server, and config defaults"
```

---

## Task 3: Blast radius MCP tool

**Files:**
- Create: `packages/mcp-server/src/tools/blast-radius.ts`
- Modify: `packages/mcp-server/src/server.ts`

**Step 1: Create blast-radius MCP tool**

```typescript
// packages/mcp-server/src/tools/blast-radius.ts
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GraphStore } from '@contextualizer/storage';
import { computeBlastRadius, searchSymbols } from '@contextualizer/analyzer';

export function registerBlastRadiusTool(server: McpServer, store: GraphStore): void {
  server.tool(
    'blast_radius',
    'Compute the blast radius of a symbol -- find all components that would be affected if it changes. Returns affected nodes grouped by depth.',
    {
      symbol: z.string().describe('Symbol name or FQN to compute blast radius for'),
      depth: z.number().min(1).max(5).optional().describe('Max traversal depth (default: 2, max: 5)'),
    },
    async ({ symbol, depth }) => {
      // Resolve symbol name to node ID
      const matches = await searchSymbols(store, symbol);
      if (matches.length === 0) {
        return { content: [{ type: 'text' as const, text: `No symbol found matching "${symbol}".` }] };
      }

      const targetNode = matches[0];
      const result = await computeBlastRadius(store, targetNode.id, depth ?? 2);

      if (result.affectedNodes.length === 0) {
        return { content: [{ type: 'text' as const, text: `No affected components found for "${targetNode.qualifiedName}".` }] };
      }

      const lines = [
        `Blast radius for: ${targetNode.qualifiedName}`,
        `Depth: ${result.maxDepth}`,
        `Affected components: ${result.affectedNodes.length}`,
        '',
      ];

      // Group by depth
      const byDepth = new Map<number, typeof result.affectedNodes>();
      for (const node of result.affectedNodes) {
        const group = byDepth.get(node.depth) ?? [];
        group.push(node);
        byDepth.set(node.depth, group);
      }

      for (const [d, nodes] of [...byDepth].sort((a, b) => a[0] - b[0])) {
        lines.push(`--- Depth ${d} (${nodes.length} components) ---`);
        for (const n of nodes) {
          lines.push(`  ${n.type} ${n.qualifiedName}${n.filePath ? ` (${n.filePath})` : ''}`);
        }
      }

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );
}
```

**Step 2: Register in server.ts**

In `packages/mcp-server/src/server.ts`, add:
```typescript
import { registerBlastRadiusTool } from './tools/blast-radius.js';
```

And in `createMcpServer()`:
```typescript
registerBlastRadiusTool(server, store);
```

**Step 3: Build and test**

```bash
pnpm build && pnpm --filter @contextualizer/mcp-server test -- --reporter verbose
```

**Step 4: Commit**

```bash
git add packages/mcp-server/src/tools/blast-radius.ts packages/mcp-server/src/server.ts
git commit -m "feat: add blast_radius MCP tool for impact analysis"
```

---

## Task 4: Cycle detection MCP tool

**Files:**
- Create: `packages/mcp-server/src/tools/cycles.ts`
- Modify: `packages/mcp-server/src/server.ts`

**Step 1: Create cycles MCP tool**

```typescript
// packages/mcp-server/src/tools/cycles.ts
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GraphStore } from '@contextualizer/storage';
import { detectCycles } from '@contextualizer/analyzer';

export function registerCyclesTool(server: McpServer, store: GraphStore): void {
  server.tool(
    'detect_cycles',
    'Detect circular dependencies in the codebase. Returns all cycles found between components.',
    {},
    async () => {
      const cycles = await detectCycles(store);

      if (cycles.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No circular dependencies detected.' }] };
      }

      const lines = [
        `Found ${cycles.length} circular dependency chain(s):`,
        '',
      ];

      for (let i = 0; i < cycles.length; i++) {
        const cycle = cycles[i];
        // Resolve node IDs to names
        const names: string[] = [];
        for (const nodeId of cycle) {
          const node = await store.getNodeById(nodeId);
          names.push(node?.shortName ?? nodeId);
        }
        names.push(names[0]); // Close the cycle visually
        lines.push(`${i + 1}. ${names.join(' -> ')}`);
      }

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );
}
```

**Step 2: Register in server.ts**

```typescript
import { registerCyclesTool } from './tools/cycles.js';
// in createMcpServer():
registerCyclesTool(server, store);
```

**Step 3: Build and test**

```bash
pnpm build && pnpm --filter @contextualizer/mcp-server test -- --reporter verbose
```

**Step 4: Commit**

```bash
git add packages/mcp-server/src/tools/cycles.ts packages/mcp-server/src/server.ts
git commit -m "feat: add detect_cycles MCP tool for circular dependency detection"
```

---

## Task 5: Architectural metrics -- coupling and instability

**Files:**
- Create: `packages/analyzer/src/query/metrics.ts`
- Create: `packages/analyzer/src/query/__tests__/metrics.test.ts`
- Modify: `packages/analyzer/src/index.ts`

Computes per-component metrics:
- **Afferent coupling (Ca)**: number of incoming dependencies (who depends on me)
- **Efferent coupling (Ce)**: number of outgoing dependencies (what I depend on)
- **Instability (I)**: Ce / (Ca + Ce) -- 0 = maximally stable, 1 = maximally unstable
- **Component count per package**: for package-level summary

**Step 1: Write failing tests**

```typescript
// packages/analyzer/src/query/__tests__/metrics.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DuckDBGraphStore } from '@contextualizer/storage';
import { GraphLevel, NodeType, EdgeType, createNodeId, createEdgeId } from '@contextualizer/core';
import { computeMetrics, type ComponentMetrics } from '../metrics.js';

describe('architectural metrics', () => {
  let store: DuckDBGraphStore;

  beforeEach(async () => {
    store = new DuckDBGraphStore(':memory:');
    await store.initialize();
  });

  afterEach(async () => {
    await store.close();
  });

  async function addNode(name: string, type: NodeType = NodeType.CLASS): Promise<string> {
    const id = createNodeId(type, name);
    await store.upsertNode({
      id,
      type,
      level: GraphLevel.COMPONENT,
      qualifiedName: name,
      shortName: name.split('.').pop()!,
      filePath: null,
      startLine: null,
      endLine: null,
      contentHash: null,
      isStale: false,
      lastAnalyzedAt: new Date().toISOString(),
      metadata: {},
    });
    return id;
  }

  async function addEdge(sourceId: string, targetId: string, type: EdgeType = EdgeType.DEPENDS_ON): Promise<void> {
    await store.upsertEdge({
      id: createEdgeId(sourceId, targetId, type),
      source: sourceId,
      target: targetId,
      type,
      level: GraphLevel.COMPONENT,
      weight: 1,
      metadata: {},
    });
  }

  it('computes coupling and instability for components', async () => {
    const a = await addNode('A');
    const b = await addNode('B');
    const c = await addNode('C');

    // A depends on B, A depends on C, B depends on C
    await addEdge(a, b);
    await addEdge(a, c);
    await addEdge(b, c);

    const metrics = await computeMetrics(store);

    const metricsA = metrics.find(m => m.shortName === 'A')!;
    expect(metricsA.efferentCoupling).toBe(2); // A -> B, A -> C
    expect(metricsA.afferentCoupling).toBe(0); // nothing depends on A
    expect(metricsA.instability).toBe(1.0); // fully unstable

    const metricsC = metrics.find(m => m.shortName === 'C')!;
    expect(metricsC.efferentCoupling).toBe(0); // C depends on nothing
    expect(metricsC.afferentCoupling).toBe(2); // A and B depend on C
    expect(metricsC.instability).toBe(0.0); // fully stable

    const metricsB = metrics.find(m => m.shortName === 'B')!;
    expect(metricsB.efferentCoupling).toBe(1);
    expect(metricsB.afferentCoupling).toBe(1);
    expect(metricsB.instability).toBeCloseTo(0.5);
  });

  it('handles isolated components with zero coupling', async () => {
    await addNode('Isolated');

    const metrics = await computeMetrics(store);
    const m = metrics.find(m => m.shortName === 'Isolated')!;

    expect(m.afferentCoupling).toBe(0);
    expect(m.efferentCoupling).toBe(0);
    expect(m.instability).toBe(0);
  });

  it('excludes CONTAINS edges from coupling', async () => {
    const parent = await addNode('Parent');
    const child = await addNode('Child');

    await addEdge(parent, child, EdgeType.CONTAINS);

    const metrics = await computeMetrics(store);
    const parentM = metrics.find(m => m.shortName === 'Parent')!;
    expect(parentM.efferentCoupling).toBe(0); // CONTAINS doesn't count
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
pnpm --filter @contextualizer/analyzer test -- --reporter verbose src/query/__tests__/metrics.test.ts
```

**Step 3: Implement metrics**

```typescript
// packages/analyzer/src/query/metrics.ts
import type { GraphStore } from '@contextualizer/storage';
import { GraphLevel, EdgeType } from '@contextualizer/core';

export interface ComponentMetrics {
  id: string;
  qualifiedName: string;
  shortName: string;
  type: string;
  filePath: string | null;
  afferentCoupling: number;  // Ca: who depends on me
  efferentCoupling: number;  // Ce: what I depend on
  instability: number;        // I = Ce / (Ca + Ce), 0=stable, 1=unstable
}

const DEPENDENCY_TYPES = new Set([
  EdgeType.EXTENDS, EdgeType.IMPLEMENTS, EdgeType.USES_TRAIT,
  EdgeType.CALLS, EdgeType.INJECTS, EdgeType.DEPENDS_ON,
  EdgeType.INSTANTIATES, EdgeType.IMPORTS,
]);

export async function computeMetrics(store: GraphStore): Promise<ComponentMetrics[]> {
  const allNodes = await store.getAllNodes();
  const componentNodes = allNodes.filter(n => n.level === GraphLevel.COMPONENT);
  const componentIds = new Set(componentNodes.map(n => n.id));

  const allEdges = await store.getAllEdges();

  // Only count dependency edges between components
  const depEdges = allEdges.filter(
    e => DEPENDENCY_TYPES.has(e.type) && componentIds.has(e.source) && componentIds.has(e.target) && e.source !== e.target,
  );

  // Count afferent (incoming) and efferent (outgoing) per component
  const afferent = new Map<string, Set<string>>();
  const efferent = new Map<string, Set<string>>();

  for (const id of componentIds) {
    afferent.set(id, new Set());
    efferent.set(id, new Set());
  }

  for (const edge of depEdges) {
    efferent.get(edge.source)?.add(edge.target);
    afferent.get(edge.target)?.add(edge.source);
  }

  return componentNodes.map(node => {
    const ca = afferent.get(node.id)?.size ?? 0;
    const ce = efferent.get(node.id)?.size ?? 0;
    const total = ca + ce;

    return {
      id: node.id,
      qualifiedName: node.qualifiedName,
      shortName: node.shortName,
      type: node.type,
      filePath: node.filePath,
      afferentCoupling: ca,
      efferentCoupling: ce,
      instability: total === 0 ? 0 : ce / total,
    };
  });
}
```

**Step 4: Export from analyzer index**

Add to `packages/analyzer/src/index.ts`:
```typescript
export { computeMetrics, type ComponentMetrics } from './query/metrics.js';
```

**Step 5: Run tests**

```bash
pnpm --filter @contextualizer/analyzer test -- --reporter verbose src/query/__tests__/metrics.test.ts
```

**Step 6: Commit**

```bash
git add packages/analyzer/src/query/metrics.ts packages/analyzer/src/query/__tests__/metrics.test.ts packages/analyzer/src/index.ts
git commit -m "feat: add architectural metrics -- coupling and instability scores"
```

---

## Task 6: Metrics MCP tool and API endpoint

**Files:**
- Create: `packages/mcp-server/src/tools/metrics.ts`
- Modify: `packages/mcp-server/src/server.ts`
- Create: `packages/web-server/src/routes/metrics.ts`
- Modify: `packages/web-server/src/server.ts`

**Step 1: Create metrics MCP tool**

```typescript
// packages/mcp-server/src/tools/metrics.ts
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GraphStore } from '@contextualizer/storage';
import { computeMetrics } from '@contextualizer/analyzer';

export function registerMetricsTool(server: McpServer, store: GraphStore): void {
  server.tool(
    'get_metrics',
    'Get architectural metrics (coupling, instability) for components. Optionally filter by symbol name. Sort by instability to find the most volatile components.',
    {
      symbol: z.string().optional().describe('Filter by symbol name (substring match). Omit for all components.'),
      sortBy: z.enum(['instability', 'afferent', 'efferent', 'name']).optional().describe('Sort field (default: instability desc)'),
      limit: z.number().optional().describe('Max results to return (default: 20)'),
    },
    async ({ symbol, sortBy, limit }) => {
      let metrics = await computeMetrics(store);

      if (symbol) {
        const lower = symbol.toLowerCase();
        metrics = metrics.filter(m =>
          m.shortName.toLowerCase().includes(lower) ||
          m.qualifiedName.toLowerCase().includes(lower),
        );
      }

      const sort = sortBy ?? 'instability';
      metrics.sort((a, b) => {
        switch (sort) {
          case 'instability': return b.instability - a.instability;
          case 'afferent': return b.afferentCoupling - a.afferentCoupling;
          case 'efferent': return b.efferentCoupling - a.efferentCoupling;
          case 'name': return a.shortName.localeCompare(b.shortName);
          default: return 0;
        }
      });

      const maxResults = limit ?? 20;
      const sliced = metrics.slice(0, maxResults);

      if (sliced.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No components found.' }] };
      }

      const lines = [
        `Architectural Metrics (${sliced.length}/${metrics.length} components):`,
        '',
        'Name | Ca (in) | Ce (out) | Instability',
        '---- | ------- | -------- | -----------',
      ];

      for (const m of sliced) {
        lines.push(`${m.shortName} | ${m.afferentCoupling} | ${m.efferentCoupling} | ${m.instability.toFixed(2)}`);
      }

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );
}
```

**Step 2: Register in MCP server**

In `packages/mcp-server/src/server.ts`:
```typescript
import { registerMetricsTool } from './tools/metrics.js';
// in createMcpServer():
registerMetricsTool(server, store);
```

**Step 3: Create API endpoint**

```typescript
// packages/web-server/src/routes/metrics.ts
import type { FastifyInstance } from 'fastify';
import type { GraphStore } from '@contextualizer/storage';
import { computeMetrics } from '@contextualizer/analyzer';

export function registerMetricsRoutes(app: FastifyInstance, store: GraphStore): void {
  app.get('/api/metrics', async () => {
    const metrics = await computeMetrics(store);
    metrics.sort((a, b) => b.instability - a.instability);
    return { success: true, data: metrics };
  });
}
```

**Step 4: Register route in web server**

In `packages/web-server/src/server.ts`:
```typescript
import { registerMetricsRoutes } from './routes/metrics.js';
// in createServer():
registerMetricsRoutes(app, options.store);
```

**Step 5: Build and test**

```bash
pnpm build && pnpm test
```

**Step 6: Commit**

```bash
git add packages/mcp-server/src/tools/metrics.ts packages/mcp-server/src/server.ts packages/web-server/src/routes/metrics.ts packages/web-server/src/server.ts
git commit -m "feat: add metrics MCP tool and API endpoint for coupling/instability"
```

---

## Task 7: Update plugin skills for new tools

**Files:**
- Modify: `plugin/skills/explore/SKILL.md`
- Create: `plugin/skills/metrics/SKILL.md`

**Step 1: Update explore skill to mention blast_radius and detect_cycles**

Append to `plugin/skills/explore/SKILL.md`:
```markdown

5. **blast_radius** -- Compute what breaks if a symbol changes. Shows affected components by depth.
6. **detect_cycles** -- Find circular dependencies between components.

## Impact Analysis

When the user asks "what would break if I change X?":
1. Use `blast_radius` with the symbol name and depth 2-3
2. Summarize by depth level
3. Highlight the most critical dependencies
```

**Step 2: Create metrics skill**

```markdown
<!-- plugin/skills/metrics/SKILL.md -->
---
name: metrics
description: Analyze architectural health metrics like coupling and instability. Use when the user asks about code quality, coupling, stability, or which components are most volatile.
---

# Architectural Metrics

Use the `get_metrics` MCP tool to analyze coupling and stability.

## Key Metrics

- **Afferent Coupling (Ca)**: How many components depend on this one (incoming). High = many dependents.
- **Efferent Coupling (Ce)**: How many components this depends on (outgoing). High = many dependencies.
- **Instability (I)**: Ce / (Ca + Ce). Range 0-1. 0 = stable (hard to change), 1 = unstable (easy to change but risky).

## Workflow

1. Use `get_metrics` with `sortBy: "instability"` to find the most volatile components
2. Use `get_metrics` with `sortBy: "afferent"` to find the most depended-upon (risky to change)
3. Cross-reference with `blast_radius` for specific impact analysis

## Interpretation

- Components with high instability AND high afferent coupling are architectural risks
- Components with I=0 are maximally stable -- changes here ripple widely
- Components with I=1 are maximally unstable -- easy to change but may have fragile dependencies
```

**Step 3: Commit**

```bash
git add plugin/skills/
git commit -m "feat: update plugin skills for blast radius, cycles, and metrics tools"
```

---

## Task 8: Final build and verification

**Step 1: Build all packages**

```bash
pnpm build
```

**Step 2: Run all tests**

```bash
pnpm test
```

**Step 3: Verify plugin structure**

```bash
ls plugin/skills/*/SKILL.md
```

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: phase 10 complete -- Python parser, architectural metrics, blast radius + cycles MCP tools"
```

---

## Summary

| Task | What | Tests |
|------|------|-------|
| 1 | Python parser (classes, functions, imports, inheritance) | ~10 tests |
| 2 | Register Python parser in CLI + MCP + config | 0 (wiring) |
| 3 | Blast radius MCP tool | 0 (MCP runtime) |
| 4 | Cycle detection MCP tool | 0 (MCP runtime) |
| 5 | Architectural metrics (coupling, instability) | ~3 tests |
| 6 | Metrics MCP tool + API endpoint | 0 (wiring) |
| 7 | Plugin skills for new tools | 0 (content) |
| 8 | Final verification | 0 |

**New tests: ~13**

**Definition of Done:**
- [ ] Python parser extracts classes, functions, methods, imports, inheritance
- [ ] Python registered in CLI, MCP server, and config defaults
- [ ] `blast_radius` MCP tool lets Claude assess change impact
- [ ] `detect_cycles` MCP tool lets Claude find circular dependencies
- [ ] Coupling/instability metrics computed per component
- [ ] `get_metrics` MCP tool + `/api/metrics` endpoint
- [ ] Plugin skills updated for all new capabilities
- [ ] 3 languages supported: PHP, TypeScript, Python
