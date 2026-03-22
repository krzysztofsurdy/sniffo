import type { LanguageParser } from '@contextualizer/core';

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
