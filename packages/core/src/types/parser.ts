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
