import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PhpParser } from '../php-parser.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SymbolKind, Modifier } from '@contextualizer/core';

const __dirname = dirname(fileURLToPath(import.meta.url));
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

    it('has zero parse errors', () => {
      expect(result.errors).toHaveLength(0);
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

    it('has zero parse errors', () => {
      expect(result.errors).toHaveLength(0);
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

      expect(result.errors).toHaveLength(0);
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

      expect(result.errors).toHaveLength(0);
    });
  });

  describe('UserStatus.php', () => {
    it('extracts enum', async () => {
      const source = readFileSync(join(FIXTURES, 'Enum/UserStatus.php'), 'utf-8');
      const result = await parser.parse('src/Enum/UserStatus.php', source);

      const enumNode = result.symbols.find((s) => s.kind === SymbolKind.Enum);
      expect(enumNode).toBeDefined();
      expect(enumNode!.fqn).toBe('App\\Enum\\UserStatus');

      expect(result.errors).toHaveLength(0);
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
