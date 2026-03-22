import { describe, it, expect, vi } from 'vitest';
import { ParserRegistry } from '../parser-registry.js';
import type { LanguageParser, ParsedFile } from '@contextualizer/core';

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
