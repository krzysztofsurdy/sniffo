import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SymbolKind, ReferenceKind } from '@contextualizer/core';
import { TypeScriptParser } from '../typescript-parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, '../../../../test/fixtures/typescript-project/src');

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
    expect(parser.canParse('foo.tsx')).toBe(true);
    expect(parser.canParse('foo.php')).toBe(false);
  });

  describe('types.ts', () => {
    let result: Awaited<ReturnType<TypeScriptParser['parse']>>;

    beforeAll(async () => {
      const source = readFileSync(join(FIXTURES, 'types.ts'), 'utf-8');
      result = await parser.parse('src/types.ts', source);
    });

    it('extracts interface', () => {
      const iface = result.symbols.find(
        (s) => s.name === 'User' && s.kind === SymbolKind.Interface,
      );
      expect(iface).toBeDefined();
      expect(iface!.fqn).toBe('src.types.User');
    });

    it('extracts enum', () => {
      const enumSym = result.symbols.find(
        (s) => s.name === 'UserRole' && s.kind === SymbolKind.Enum,
      );
      expect(enumSym).toBeDefined();
      expect(enumSym!.fqn).toBe('src.types.UserRole');
    });

    it('has zero parse errors', () => {
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('user.ts', () => {
    let result: Awaited<ReturnType<TypeScriptParser['parse']>>;

    beforeAll(async () => {
      const source = readFileSync(join(FIXTURES, 'user.ts'), 'utf-8');
      result = await parser.parse('src/user.ts', source);
    });

    it('extracts class', () => {
      const cls = result.symbols.find(
        (s) => s.name === 'UserEntity' && s.kind === SymbolKind.Class,
      );
      expect(cls).toBeDefined();
      expect(cls!.fqn).toBe('src.user.UserEntity');
    });

    it('extracts method', () => {
      const method = result.symbols.find(
        (s) => s.name === 'isAdmin' && s.kind === SymbolKind.Method,
      );
      expect(method).toBeDefined();
      expect(method!.fqn).toBe('src.user.UserEntity::isAdmin');
    });

    it('extracts constructor', () => {
      const ctor = result.symbols.find(
        (s) => s.name === 'constructor' && s.kind === SymbolKind.Method,
      );
      expect(ctor).toBeDefined();
    });

    it('extracts implements reference', () => {
      const implRef = result.references.find((r) => r.kind === ReferenceKind.Implements);
      expect(implRef).toBeDefined();
      expect(implRef!.targetName).toBe('User');
    });

    it('extracts import statements', () => {
      expect(result.imports.length).toBeGreaterThanOrEqual(1);
      const userImport = result.imports.find((i) => i.originalName.includes('User'));
      expect(userImport).toBeDefined();
    });

    it('has zero parse errors', () => {
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('user-service.ts', () => {
    let result: Awaited<ReturnType<TypeScriptParser['parse']>>;

    beforeAll(async () => {
      const source = readFileSync(join(FIXTURES, 'user-service.ts'), 'utf-8');
      result = await parser.parse('src/user-service.ts', source);
    });

    it('extracts class', () => {
      const cls = result.symbols.find(
        (s) => s.name === 'UserService' && s.kind === SymbolKind.Class,
      );
      expect(cls).toBeDefined();
    });

    it('extracts methods', () => {
      const methods = result.symbols.filter((s) => s.kind === SymbolKind.Method);
      expect(methods.length).toBeGreaterThanOrEqual(3);
      const methodNames = methods.map((m) => m.name);
      expect(methodNames).toContain('findById');
      expect(methodNames).toContain('create');
      expect(methodNames).toContain('findAll');
    });

    it('extracts instantiation references', () => {
      const newRef = result.references.find(
        (r) => r.kind === ReferenceKind.Instantiates && r.targetName === 'UserEntity',
      );
      expect(newRef).toBeDefined();
    });

    it('extracts private property', () => {
      const prop = result.symbols.find(
        (s) => s.name === 'users' && s.kind === SymbolKind.Property,
      );
      expect(prop).toBeDefined();
    });

    it('has zero parse errors', () => {
      expect(result.errors).toHaveLength(0);
    });
  });
});
