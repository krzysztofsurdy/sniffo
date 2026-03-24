# Phase 7: Polish and Extensibility Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add TypeScript parser, performance optimization, config file support, error hardening, and self-hosting (tool analyzes its own codebase).

**Architecture:** New TypeScript parser following the existing PHP parser pattern (tree-sitter + visitor). Enhanced config loading in CLI. Performance profiling and optimization in pipeline.

**Tech Stack:** tree-sitter-typescript (WASM), existing stack

**Reference docs:**
- `docs/delivery-plan.md` lines 224-252 -- Phase 7 definition of done
- `packages/analyzer/src/parsers/php/` -- reference parser implementation
- `packages/core/src/types/parser.ts` -- LanguageParser interface

---

## Task 1: TypeScript parser -- scaffold and basic class extraction

**Files:**
- Create: `packages/analyzer/src/parsers/typescript/typescript-parser.ts`
- Create: `packages/analyzer/src/parsers/typescript/ast-visitor.ts`
- Create: `packages/analyzer/src/parsers/typescript/node-utils.ts`
- Create: `packages/analyzer/src/parsers/typescript/__tests__/typescript-parser.test.ts`
- Create: `packages/analyzer/test/fixtures/typescript-project/src/user.ts`
- Create: `packages/analyzer/test/fixtures/typescript-project/src/user-service.ts`
- Create: `packages/analyzer/test/fixtures/typescript-project/src/types.ts`

**Step 1: Create test fixtures**

`packages/analyzer/test/fixtures/typescript-project/src/types.ts`:
```typescript
export interface User {
  id: number;
  name: string;
  email: string;
}

export enum UserRole {
  Admin = 'admin',
  Editor = 'editor',
  Viewer = 'viewer',
}

export type UserCreateInput = Omit<User, 'id'>;
```

`packages/analyzer/test/fixtures/typescript-project/src/user.ts`:
```typescript
import { User, UserRole } from './types';

export class UserEntity implements User {
  id: number;
  name: string;
  email: string;
  role: UserRole;

  constructor(id: number, name: string, email: string, role: UserRole = UserRole.Viewer) {
    this.id = id;
    this.name = name;
    this.email = email;
    this.role = role;
  }

  isAdmin(): boolean {
    return this.role === UserRole.Admin;
  }
}
```

`packages/analyzer/test/fixtures/typescript-project/src/user-service.ts`:
```typescript
import { UserEntity } from './user';
import type { User, UserCreateInput } from './types';

export class UserService {
  private users: Map<number, UserEntity> = new Map();

  async findById(id: number): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  async create(input: UserCreateInput): Promise<User> {
    const id = this.users.size + 1;
    const user = new UserEntity(id, input.name, input.email);
    this.users.set(id, user);
    return user;
  }

  async findAll(): Promise<User[]> {
    return Array.from(this.users.values());
  }
}
```

**Step 2: Write failing test**

```typescript
// packages/analyzer/src/parsers/typescript/__tests__/typescript-parser.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TypeScriptParser } from '../typescript-parser.js';

const FIXTURES_DIR = join(__dirname, '../../../../test/fixtures/typescript-project/src');

describe('TypeScriptParser', () => {
  let parser: TypeScriptParser;

  beforeAll(async () => {
    parser = new TypeScriptParser();
    await parser.initialize();
  });

  afterAll(() => {
    parser.dispose();
  });

  it('identifies correct language and extensions', () => {
    expect(parser.language).toBe('typescript');
    expect(parser.fileExtensions).toContain('.ts');
    expect(parser.fileExtensions).toContain('.tsx');
    expect(parser.canParse('foo.ts')).toBe(true);
    expect(parser.canParse('foo.php')).toBe(false);
  });

  describe('types.ts -- interface and enum extraction', () => {
    it('extracts interface', async () => {
      const source = readFileSync(join(FIXTURES_DIR, 'types.ts'), 'utf-8');
      const result = await parser.parse('src/types.ts', source);

      const iface = result.symbols.find(s => s.name === 'User' && s.kind === 'interface');
      expect(iface).toBeDefined();
      expect(iface!.fqn).toContain('User');
    });

    it('extracts enum', async () => {
      const source = readFileSync(join(FIXTURES_DIR, 'types.ts'), 'utf-8');
      const result = await parser.parse('src/types.ts', source);

      const enumSym = result.symbols.find(s => s.name === 'UserRole' && s.kind === 'enum');
      expect(enumSym).toBeDefined();
    });
  });

  describe('user.ts -- class extraction', () => {
    it('extracts class with methods', async () => {
      const source = readFileSync(join(FIXTURES_DIR, 'user.ts'), 'utf-8');
      const result = await parser.parse('src/user.ts', source);

      const cls = result.symbols.find(s => s.name === 'UserEntity' && s.kind === 'class');
      expect(cls).toBeDefined();

      const method = result.symbols.find(s => s.name === 'isAdmin' && s.kind === 'method');
      expect(method).toBeDefined();
    });

    it('extracts implements reference', async () => {
      const source = readFileSync(join(FIXTURES_DIR, 'user.ts'), 'utf-8');
      const result = await parser.parse('src/user.ts', source);

      const implRef = result.references.find(r => r.kind === 'implements');
      expect(implRef).toBeDefined();
      expect(implRef!.targetName).toBe('User');
    });

    it('extracts import statements', async () => {
      const source = readFileSync(join(FIXTURES_DIR, 'user.ts'), 'utf-8');
      const result = await parser.parse('src/user.ts', source);

      expect(result.imports.length).toBeGreaterThanOrEqual(1);
      const userImport = result.imports.find(i => i.names.includes('User'));
      expect(userImport).toBeDefined();
    });
  });

  describe('user-service.ts -- class with dependencies', () => {
    it('extracts class and methods', async () => {
      const source = readFileSync(join(FIXTURES_DIR, 'user-service.ts'), 'utf-8');
      const result = await parser.parse('src/user-service.ts', source);

      const cls = result.symbols.find(s => s.name === 'UserService' && s.kind === 'class');
      expect(cls).toBeDefined();

      const methods = result.symbols.filter(s => s.kind === 'method');
      expect(methods.length).toBeGreaterThanOrEqual(3);
    });

    it('extracts instantiation references', async () => {
      const source = readFileSync(join(FIXTURES_DIR, 'user-service.ts'), 'utf-8');
      const result = await parser.parse('src/user-service.ts', source);

      const newRef = result.references.find(r => r.kind === 'instantiates' && r.targetName === 'UserEntity');
      expect(newRef).toBeDefined();
    });
  });
});
```

**Step 3: Create node-utils.ts**

```typescript
// packages/analyzer/src/parsers/typescript/node-utils.ts
import type Parser from 'web-tree-sitter';

export function findChildByType(node: Parser.SyntaxNode, type: string): Parser.SyntaxNode | null {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === type) return child;
  }
  return null;
}

export function findChildrenByType(node: Parser.SyntaxNode, type: string): Parser.SyntaxNode[] {
  const result: Parser.SyntaxNode[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === type) result.push(child);
  }
  return result;
}

export function findDescendantsByType(node: Parser.SyntaxNode, type: string): Parser.SyntaxNode[] {
  const result: Parser.SyntaxNode[] = [];
  const stack: Parser.SyntaxNode[] = [node];
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

export function getNodeText(node: Parser.SyntaxNode | null): string {
  return node?.text ?? '';
}
```

**Step 4: Create ast-visitor.ts**

```typescript
// packages/analyzer/src/parsers/typescript/ast-visitor.ts
import type Parser from 'web-tree-sitter';
import type { ParsedSymbol, ParsedReference, ImportStatement, ParseError, SymbolKind, ReferenceKind, Modifier } from '@sniffo/core';
import { findChildByType, findChildrenByType, findDescendantsByType, getNodeText } from './node-utils.js';

interface VisitorContext {
  filePath: string;
  currentModule: string | null;
  currentClass: string | null;
  symbols: ParsedSymbol[];
  references: ParsedReference[];
  imports: ImportStatement[];
  errors: ParseError[];
}

export function visitTree(tree: Parser.Tree, filePath: string): VisitorContext {
  const ctx: VisitorContext = {
    filePath,
    currentModule: extractModuleName(filePath),
    currentClass: null,
    symbols: [],
    references: [],
    imports: [],
    errors: [],
  };

  visitNode(tree.rootNode, ctx);
  return ctx;
}

function extractModuleName(filePath: string): string {
  // Convert file path to module-like namespace: src/services/user-service.ts -> src.services
  const parts = filePath.replace(/\\/g, '/').split('/');
  parts.pop(); // remove filename
  return parts.join('.') || '';
}

function makeFqn(ctx: VisitorContext, name: string): string {
  if (ctx.currentClass) {
    return `${ctx.currentClass}::${name}`;
  }
  if (ctx.currentModule) {
    return `${ctx.currentModule}.${name}`;
  }
  return name;
}

function visitNode(node: Parser.SyntaxNode, ctx: VisitorContext): void {
  switch (node.type) {
    case 'import_statement':
      visitImport(node, ctx);
      break;
    case 'class_declaration':
      visitClass(node, ctx);
      break;
    case 'abstract_class_declaration':
      visitClass(node, ctx);
      break;
    case 'interface_declaration':
      visitInterface(node, ctx);
      break;
    case 'enum_declaration':
      visitEnum(node, ctx);
      break;
    case 'function_declaration':
      visitFunction(node, ctx);
      break;
    case 'export_statement':
      // Visit the declaration inside the export
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) visitNode(child, ctx);
      }
      return; // Don't recurse children again
    default:
      break;
  }

  // Recurse children for non-handled nodes
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) visitNode(child, ctx);
  }
}

function visitImport(node: Parser.SyntaxNode, ctx: VisitorContext): void {
  const clause = findChildByType(node, 'import_clause');
  const source = findChildByType(node, 'string')?.text?.replace(/['"]/g, '') ?? '';
  if (!clause) return;

  const names: string[] = [];

  // Named imports: import { Foo, Bar } from './module'
  const namedImports = findDescendantsByType(clause, 'import_specifier');
  for (const spec of namedImports) {
    const nameNode = findChildByType(spec, 'identifier');
    if (nameNode) names.push(getNodeText(nameNode));
  }

  // Default import: import Foo from './module'
  const defaultImport = findChildByType(clause, 'identifier');
  if (defaultImport && !names.includes(getNodeText(defaultImport))) {
    names.push(getNodeText(defaultImport));
  }

  // Namespace import: import * as Foo from './module'
  const nsImport = findChildByType(clause, 'namespace_import');
  if (nsImport) {
    const alias = findChildByType(nsImport, 'identifier');
    if (alias) names.push(getNodeText(alias));
  }

  if (names.length > 0) {
    ctx.imports.push({
      names,
      source,
      isTypeOnly: node.text.includes('import type'),
      line: node.startPosition.row + 1,
    });

    for (const name of names) {
      ctx.references.push({
        kind: 'imports' as ReferenceKind,
        targetName: name,
        sourceSymbolFqn: makeFqn(ctx, '__module__'),
        filePath: ctx.filePath,
        line: node.startPosition.row + 1,
        context: `import ${name} from '${source}'`,
      });
    }
  }
}

function visitClass(node: Parser.SyntaxNode, ctx: VisitorContext): void {
  const nameNode = findChildByType(node, 'type_identifier') ?? findChildByType(node, 'identifier');
  if (!nameNode) return;

  const name = getNodeText(nameNode);
  const fqn = makeFqn(ctx, name);
  const modifiers = extractModifiers(node);
  const isAbstract = node.type === 'abstract_class_declaration' || modifiers.includes('abstract' as Modifier);

  ctx.symbols.push({
    kind: 'class' as SymbolKind,
    name,
    fqn,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    modifiers: isAbstract ? [...modifiers, 'abstract' as Modifier] : modifiers,
    metadata: {},
  });

  // Heritage: extends
  const heritage = findChildByType(node, 'class_heritage');
  if (heritage) {
    const extendsClause = findChildByType(heritage, 'extends_clause');
    if (extendsClause) {
      const parentType = findChildByType(extendsClause, 'identifier') ?? findChildByType(extendsClause, 'type_identifier');
      if (parentType) {
        ctx.references.push({
          kind: 'extends' as ReferenceKind,
          targetName: getNodeText(parentType),
          sourceSymbolFqn: fqn,
          filePath: ctx.filePath,
          line: extendsClause.startPosition.row + 1,
          context: `extends ${getNodeText(parentType)}`,
        });
      }
    }

    const implementsClause = findChildByType(heritage, 'implements_clause');
    if (implementsClause) {
      const types = findChildrenByType(implementsClause, 'type_identifier')
        .concat(findChildrenByType(implementsClause, 'identifier'));
      for (const t of types) {
        ctx.references.push({
          kind: 'implements' as ReferenceKind,
          targetName: getNodeText(t),
          sourceSymbolFqn: fqn,
          filePath: ctx.filePath,
          line: implementsClause.startPosition.row + 1,
          context: `implements ${getNodeText(t)}`,
        });
      }
    }
  }

  // Visit class body
  const savedClass = ctx.currentClass;
  ctx.currentClass = fqn;

  const body = findChildByType(node, 'class_body');
  if (body) {
    for (let i = 0; i < body.childCount; i++) {
      const child = body.child(i);
      if (!child) continue;

      switch (child.type) {
        case 'method_definition':
        case 'public_field_definition':
          visitClassMember(child, ctx);
          break;
        case 'property_declaration':
          visitClassMember(child, ctx);
          break;
        default:
          // Check for new expressions inside the body
          visitNewExpressions(child, ctx);
          break;
      }
    }
  }

  ctx.currentClass = savedClass;
}

function visitClassMember(node: Parser.SyntaxNode, ctx: VisitorContext): void {
  const nameNode = findChildByType(node, 'property_identifier') ?? findChildByType(node, 'identifier');
  if (!nameNode) return;

  const name = getNodeText(nameNode);
  const isMethod = node.type === 'method_definition';
  const kind: SymbolKind = isMethod ? 'method' as SymbolKind : 'property' as SymbolKind;
  const fqn = ctx.currentClass ? `${ctx.currentClass}::${name}` : name;

  ctx.symbols.push({
    kind,
    name,
    fqn,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    modifiers: extractModifiers(node),
    metadata: {},
  });

  // Look for new expressions (instantiation) inside methods
  if (isMethod) {
    visitNewExpressions(node, ctx);
  }

  // Look for type references in parameters and return type
  visitTypeReferences(node, ctx);
}

function visitInterface(node: Parser.SyntaxNode, ctx: VisitorContext): void {
  const nameNode = findChildByType(node, 'type_identifier') ?? findChildByType(node, 'identifier');
  if (!nameNode) return;

  const name = getNodeText(nameNode);
  const fqn = makeFqn(ctx, name);

  ctx.symbols.push({
    kind: 'interface' as SymbolKind,
    name,
    fqn,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    modifiers: extractModifiers(node),
    metadata: {},
  });

  // Check extends for interfaces
  const extendsClause = findDescendantsByType(node, 'extends_type_clause');
  for (const ext of extendsClause) {
    const types = findChildrenByType(ext, 'type_identifier')
      .concat(findChildrenByType(ext, 'identifier'));
    for (const t of types) {
      ctx.references.push({
        kind: 'extends' as ReferenceKind,
        targetName: getNodeText(t),
        sourceSymbolFqn: fqn,
        filePath: ctx.filePath,
        line: ext.startPosition.row + 1,
        context: `extends ${getNodeText(t)}`,
      });
    }
  }
}

function visitEnum(node: Parser.SyntaxNode, ctx: VisitorContext): void {
  const nameNode = findChildByType(node, 'identifier');
  if (!nameNode) return;

  const name = getNodeText(nameNode);
  ctx.symbols.push({
    kind: 'enum' as SymbolKind,
    name,
    fqn: makeFqn(ctx, name),
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    modifiers: extractModifiers(node),
    metadata: {},
  });
}

function visitFunction(node: Parser.SyntaxNode, ctx: VisitorContext): void {
  const nameNode = findChildByType(node, 'identifier');
  if (!nameNode) return;

  const name = getNodeText(nameNode);
  ctx.symbols.push({
    kind: 'function' as SymbolKind,
    name,
    fqn: makeFqn(ctx, name),
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    modifiers: extractModifiers(node),
    metadata: {},
  });

  visitNewExpressions(node, ctx);
}

function visitNewExpressions(node: Parser.SyntaxNode, ctx: VisitorContext): void {
  const newExprs = findDescendantsByType(node, 'new_expression');
  for (const expr of newExprs) {
    const ctorName = findChildByType(expr, 'identifier') ?? findChildByType(expr, 'type_identifier');
    if (ctorName) {
      const sourceFqn = ctx.currentClass ?? makeFqn(ctx, '__module__');
      ctx.references.push({
        kind: 'instantiates' as ReferenceKind,
        targetName: getNodeText(ctorName),
        sourceSymbolFqn: sourceFqn,
        filePath: ctx.filePath,
        line: expr.startPosition.row + 1,
        context: `new ${getNodeText(ctorName)}()`,
      });
    }
  }
}

function visitTypeReferences(node: Parser.SyntaxNode, ctx: VisitorContext): void {
  const typeAnnotations = findDescendantsByType(node, 'type_annotation');
  for (const ann of typeAnnotations) {
    const typeId = findChildByType(ann, 'type_identifier') ?? findChildByType(ann, 'identifier');
    if (typeId) {
      const typeName = getNodeText(typeId);
      // Skip primitive types
      if (['string', 'number', 'boolean', 'void', 'null', 'undefined', 'any', 'never', 'unknown', 'object'].includes(typeName)) continue;
      ctx.references.push({
        kind: 'type_reference' as ReferenceKind,
        targetName: typeName,
        sourceSymbolFqn: ctx.currentClass ?? makeFqn(ctx, '__module__'),
        filePath: ctx.filePath,
        line: ann.startPosition.row + 1,
        context: `type ref ${typeName}`,
      });
    }
  }
}

function extractModifiers(node: Parser.SyntaxNode): Modifier[] {
  const modifiers: Modifier[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    switch (child.type) {
      case 'public': modifiers.push('public' as Modifier); break;
      case 'private': modifiers.push('private' as Modifier); break;
      case 'protected': modifiers.push('protected' as Modifier); break;
      case 'static': modifiers.push('static' as Modifier); break;
      case 'abstract': modifiers.push('abstract' as Modifier); break;
      case 'readonly': modifiers.push('readonly' as Modifier); break;
      case 'accessibility_modifier':
        modifiers.push(child.text as Modifier);
        break;
    }
  }
  // Check if node text starts with export
  if (node.parent?.type === 'export_statement') {
    // exported
  }
  return modifiers;
}
```

**Step 5: Create typescript-parser.ts**

```typescript
// packages/analyzer/src/parsers/typescript/typescript-parser.ts
import Parser from 'web-tree-sitter';
import { hashContent, type LanguageParser, type ParsedFile } from '@sniffo/core';
import { visitTree } from './ast-visitor.js';

export class TypeScriptParser implements LanguageParser {
  readonly language = 'typescript';
  readonly fileExtensions = ['.ts', '.tsx'];
  private parser: Parser | null = null;

  async initialize(): Promise<void> {
    await Parser.init();
    this.parser = new Parser();

    // tree-sitter-typescript provides two grammars: typescript and tsx
    // We use the typescript grammar for .ts files
    const tsPath = require.resolve('tree-sitter-typescript/tree-sitter-typescript.wasm');
    const lang = await Parser.Language.load(tsPath);
    this.parser.setLanguage(lang);
  }

  canParse(filePath: string): boolean {
    return this.fileExtensions.some(ext => filePath.endsWith(ext));
  }

  async parse(filePath: string, source: string): Promise<ParsedFile> {
    if (!this.parser) {
      throw new Error('TypeScriptParser not initialized. Call initialize() first.');
    }

    const tree = this.parser.parse(source);
    const ctx = visitTree(tree, filePath);

    return {
      filePath,
      language: this.language,
      contentHash: hashContent(source),
      symbols: ctx.symbols,
      references: ctx.references,
      imports: ctx.imports,
      errors: ctx.errors,
    };
  }

  dispose(): void {
    if (this.parser) {
      this.parser.delete();
      this.parser = null;
    }
  }
}
```

NOTE: The `require.resolve` for tree-sitter-typescript WASM may need to use `import.meta.resolve` or a different path. The npm package `tree-sitter-typescript` provides WASM at `tree-sitter-typescript/tree-sitter-typescript.wasm`. Check the actual package structure if this doesn't work.

**Step 6: Run tests**

```bash
cd /Users/krzysztofsurdy/ProjectsPrivate/llmProjectContextualizer
pnpm install tree-sitter-typescript --filter @sniffo/analyzer
pnpm --filter @sniffo/analyzer test -- --reporter verbose src/parsers/typescript/__tests__/
```

**Step 7: Commit**

```bash
git add packages/analyzer/src/parsers/typescript/ packages/analyzer/test/fixtures/typescript-project/
git commit -m "feat: add TypeScript parser with class, interface, enum, method extraction"
```

---

## Task 2: Register TypeScript parser in CLI and pipeline

**Files:**
- Modify: `packages/analyzer/src/index.ts`
- Modify: `packages/cli/src/commands/analyze.ts`
- Modify: `packages/cli/src/commands/update.ts`
- Modify: `packages/mcp-server/src/tools/analyze.ts`
- Modify: `packages/mcp-server/src/tools/refresh.ts`

**Step 1: Export TypeScriptParser from analyzer**

Add to `packages/analyzer/src/index.ts`:
```typescript
export { TypeScriptParser } from './parsers/typescript/typescript-parser.js';
```

**Step 2: Register in CLI commands**

In `packages/cli/src/commands/analyze.ts` and `update.ts`, after registering PhpParser, add:
```typescript
import { TypeScriptParser } from '@sniffo/analyzer';

registry.register(new TypeScriptParser());
```

Also update the default include patterns to include TypeScript:
```typescript
includePatterns: ['**/*.php', '**/*.ts', '**/*.tsx'],
```

**Step 3: Same for MCP server tools**

Update `analyze.ts` and `refresh.ts` in mcp-server to register TypeScriptParser and add TS patterns.

**Step 4: Build and test**

```bash
pnpm build
pnpm test
```

**Step 5: Commit**

```bash
git add packages/analyzer/src/index.ts packages/cli/src/commands/ packages/mcp-server/src/tools/
git commit -m "feat: register TypeScript parser in CLI and MCP server"
```

---

## Task 3: Configuration file support (.snifforc.json)

**Files:**
- Create: `packages/cli/src/config/loader.ts`
- Create: `packages/cli/src/__tests__/config-loader.test.ts`
- Modify: `packages/cli/src/commands/analyze.ts`
- Modify: `packages/cli/src/commands/update.ts`
- Modify: `packages/cli/src/commands/init.ts`

**Step 1: Write failing test**

```typescript
// packages/cli/src/__tests__/config-loader.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig, type ProjectConfig } from '../config/loader.js';

describe('config loader', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ctx-cfg-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns defaults when no config file exists', () => {
    const config = loadConfig(tempDir);
    expect(config.include).toContain('**/*.php');
    expect(config.include).toContain('**/*.ts');
    expect(config.exclude).toContain('vendor/**');
    expect(config.exclude).toContain('node_modules/**');
  });

  it('loads config from .sniffo/config.json', () => {
    mkdirSync(join(tempDir, '.sniffo'), { recursive: true });
    writeFileSync(join(tempDir, '.sniffo', 'config.json'), JSON.stringify({
      version: 1,
      include: ['**/*.php'],
      exclude: ['vendor/**', 'tests/**'],
    }));

    const config = loadConfig(tempDir);
    expect(config.include).toEqual(['**/*.php']);
    expect(config.exclude).toContain('tests/**');
  });

  it('merges with defaults for missing fields', () => {
    mkdirSync(join(tempDir, '.sniffo'), { recursive: true });
    writeFileSync(join(tempDir, '.sniffo', 'config.json'), JSON.stringify({
      version: 1,
      include: ['**/*.py'],
    }));

    const config = loadConfig(tempDir);
    expect(config.include).toEqual(['**/*.py']);
    // Exclude should fall back to defaults
    expect(config.exclude.length).toBeGreaterThan(0);
  });

  it('loads config from .snifforc.json at project root', () => {
    writeFileSync(join(tempDir, '.snifforc.json'), JSON.stringify({
      include: ['src/**/*.ts'],
      exclude: ['dist/**'],
      projectName: 'my-project',
    }));

    const config = loadConfig(tempDir);
    expect(config.include).toEqual(['src/**/*.ts']);
    expect(config.projectName).toBe('my-project');
  });
});
```

**Step 2: Implement config loader**

```typescript
// packages/cli/src/config/loader.ts
import { existsSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';

export interface ProjectConfig {
  version: number;
  include: string[];
  exclude: string[];
  projectName: string;
  analysis: {
    concurrency: number;
    fileTimeout: number;
    maxFileSize: number;
    cascadeDepth: number;
  };
  server: {
    port: number;
    host: string;
  };
}

const DEFAULT_CONFIG: ProjectConfig = {
  version: 1,
  include: ['**/*.php', '**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
  exclude: ['vendor/**', 'node_modules/**', '.git/**', '.sniffo/**', 'dist/**', 'build/**', 'var/**'],
  projectName: '',
  analysis: {
    concurrency: 4,
    fileTimeout: 30000,
    maxFileSize: 1048576,
    cascadeDepth: 2,
  },
  server: {
    port: 3100,
    host: '127.0.0.1',
  },
};

export function loadConfig(projectDir: string): ProjectConfig {
  const config = { ...DEFAULT_CONFIG, projectName: basename(projectDir) };

  // Try .sniffo/config.json first
  const ctxConfigPath = join(projectDir, '.sniffo', 'config.json');
  if (existsSync(ctxConfigPath)) {
    try {
      const raw = JSON.parse(readFileSync(ctxConfigPath, 'utf-8'));
      return mergeConfig(config, raw);
    } catch {
      // Invalid JSON, use defaults
    }
  }

  // Try .snifforc.json at project root
  const snifforcPath = join(projectDir, '.snifforc.json');
  if (existsSync(snifforcPath)) {
    try {
      const raw = JSON.parse(readFileSync(snifforcPath, 'utf-8'));
      return mergeConfig(config, raw);
    } catch {
      // Invalid JSON, use defaults
    }
  }

  return config;
}

function mergeConfig(defaults: ProjectConfig, overrides: Partial<ProjectConfig>): ProjectConfig {
  return {
    version: overrides.version ?? defaults.version,
    include: overrides.include ?? defaults.include,
    exclude: overrides.exclude ?? defaults.exclude,
    projectName: overrides.projectName ?? defaults.projectName,
    analysis: { ...defaults.analysis, ...overrides.analysis },
    server: { ...defaults.server, ...overrides.server },
  };
}
```

**Step 3: Update CLI commands to use config**

In analyze.ts and update.ts, replace hardcoded patterns with `loadConfig(projectDir)`.

**Step 4: Run tests**

```bash
pnpm --filter @sniffo/cli test -- --reporter verbose
```

**Step 5: Commit**

```bash
git add packages/cli/src/config/ packages/cli/src/__tests__/ packages/cli/src/commands/
git commit -m "feat: add config file loader (.snifforc.json and .sniffo/config.json)"
```

---

## Task 4: Error handling hardening

**Files:**
- Modify: `packages/analyzer/src/pipeline/analysis-pipeline.ts`
- Modify: `packages/cli/src/commands/analyze.ts`
- Create: `packages/analyzer/src/pipeline/__tests__/error-handling.test.ts`

**Step 1: Write test for graceful error handling**

```typescript
// packages/analyzer/src/pipeline/__tests__/error-handling.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DuckDBGraphStore } from '@sniffo/storage';
import { AnalysisPipeline } from '../analysis-pipeline.js';
import { ParserRegistry } from '../../parsers/parser-registry.js';
import { PhpParser } from '../../parsers/php/php-parser.js';

describe('error handling', () => {
  let tempDir: string;
  let store: DuckDBGraphStore;
  let registry: ParserRegistry;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ctx-err-'));
    mkdirSync(join(tempDir, 'src'), { recursive: true });
    store = new DuckDBGraphStore(':memory:');
    await store.initialize();
    registry = new ParserRegistry();
    registry.register(new PhpParser());
  });

  afterEach(async () => {
    await store.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('continues analysis when a file has syntax errors', async () => {
    writeFileSync(join(tempDir, 'src', 'good.php'), '<?php\nclass GoodClass {}');
    writeFileSync(join(tempDir, 'src', 'bad.php'), '<?php\nclass { broken syntax !!!');

    const pipeline = new AnalysisPipeline(store, registry);
    const result = await pipeline.analyze({
      rootDir: tempDir,
      projectName: 'test',
      includePatterns: ['**/*.php'],
    });

    expect(result.filesAnalyzed).toBeGreaterThanOrEqual(1);
    // Should not throw, should report errors
  });

  it('handles empty files gracefully', async () => {
    writeFileSync(join(tempDir, 'src', 'empty.php'), '');

    const pipeline = new AnalysisPipeline(store, registry);
    const result = await pipeline.analyze({
      rootDir: tempDir,
      projectName: 'test',
      includePatterns: ['**/*.php'],
    });

    // Should not throw
    expect(result).toBeDefined();
  });

  it('handles binary-like content gracefully', async () => {
    writeFileSync(join(tempDir, 'src', 'binary.php'), Buffer.from([0x00, 0x01, 0x02, 0xff]));

    const pipeline = new AnalysisPipeline(store, registry);
    const result = await pipeline.analyze({
      rootDir: tempDir,
      projectName: 'test',
      includePatterns: ['**/*.php'],
    });

    // Should not throw
    expect(result).toBeDefined();
  });
});
```

**Step 2: Verify existing error handling is sufficient**

The pipeline already has try/catch around file parsing. Verify it catches all edge cases. Add file size checks if not present -- skip files larger than `maxFileSize`.

**Step 3: Run tests**

```bash
pnpm --filter @sniffo/analyzer test -- --reporter verbose src/pipeline/__tests__/error-handling.test.ts
```

**Step 4: Commit**

```bash
git add packages/analyzer/src/pipeline/
git commit -m "feat: add error handling tests and hardening for malformed/empty files"
```

---

## Task 5: Self-hosting -- analyze own codebase

**Files:**
- Create: `packages/analyzer/src/pipeline/__tests__/self-hosting.test.ts`

**Step 1: Write self-hosting test**

```typescript
// packages/analyzer/src/pipeline/__tests__/self-hosting.test.ts
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { DuckDBGraphStore } from '@sniffo/storage';
import { AnalysisPipeline } from '../analysis-pipeline.js';
import { ParserRegistry } from '../../parsers/parser-registry.js';
import { TypeScriptParser } from '../../parsers/typescript/typescript-parser.js';

describe('self-hosting', () => {
  it('analyzes the sniffo codebase itself', async () => {
    const store = new DuckDBGraphStore(':memory:');
    await store.initialize();

    const registry = new ParserRegistry();
    registry.register(new TypeScriptParser());

    const pipeline = new AnalysisPipeline(store, registry);
    const rootDir = join(__dirname, '../../../../..');

    const result = await pipeline.analyze({
      rootDir,
      projectName: 'sniffo',
      includePatterns: ['packages/*/src/**/*.ts'],
      excludePatterns: ['**/*.test.ts', '**/*.d.ts', '**/node_modules/**', '**/dist/**'],
    });

    expect(result.filesAnalyzed).toBeGreaterThan(10);
    expect(result.symbolsFound).toBeGreaterThan(20);
    expect(result.errors.length).toBeLessThan(result.filesAnalyzed);

    // Verify specific known symbols exist
    const allNodes = await store.getAllNodes();
    const classNames = allNodes.map(n => n.shortName);

    // Should find some of our own classes
    expect(classNames).toContain('AnalysisPipeline');
    expect(classNames).toContain('ParserRegistry');

    await store.close();
  }, 60000); // 60s timeout for full analysis
});
```

**Step 2: Run test**

```bash
pnpm --filter @sniffo/analyzer test -- --reporter verbose src/pipeline/__tests__/self-hosting.test.ts
```

This test validates the self-hosting milestone.

**Step 3: Commit**

```bash
git add packages/analyzer/src/pipeline/__tests__/self-hosting.test.ts
git commit -m "feat: add self-hosting test -- tool analyzes its own codebase"
```

---

## Task 6: Final build and verification

**Step 1: Build all packages**

```bash
pnpm build
```

**Step 2: Run all tests**

```bash
pnpm test
```

**Step 3: Commit if needed**

```bash
git add -A
git commit -m "chore: phase 7 complete -- TypeScript parser, config, error hardening, self-hosting"
```

---

## Summary

| Task | What | Tests |
|------|------|-------|
| 1 | TypeScript parser (class, interface, enum, method) | ~8 tests |
| 2 | Register TS parser in CLI + MCP server | 0 (wiring) |
| 3 | Config file loader (.snifforc.json) | ~4 tests |
| 4 | Error handling hardening | ~3 tests |
| 5 | Self-hosting test | 1 test |
| 6 | Final verification | 0 |

**New tests: ~16**
**Definition of Done:**
- [x] Tool analyzes its own codebase and produces a correct, navigable graph
- [x] TypeScript parser handles standard TS patterns (classes, interfaces, modules)
- [x] Config file support (.snifforc.json and .sniffo/config.json)
- [x] Graceful error handling for malformed files
