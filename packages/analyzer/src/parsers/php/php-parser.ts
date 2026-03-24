import { Parser, Language } from 'web-tree-sitter';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import type { LanguageParser, ParsedFile } from '@sniffo/core';
import { visitTree } from './ast-visitor.js';

export class PhpParser implements LanguageParser {
  readonly language = 'php';
  readonly fileExtensions = ['.php'];

  private parser: Parser | null = null;

  async initialize(): Promise<void> {
    await Parser.init();
    this.parser = new Parser();

    const require = createRequire(import.meta.url);
    const grammarPath = require.resolve('tree-sitter-php/tree-sitter-php.wasm');
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
