import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PhpParser } from '../php-parser.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ReferenceKind } from '@sniffo/core';

const __dirname = dirname(fileURLToPath(import.meta.url));
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
