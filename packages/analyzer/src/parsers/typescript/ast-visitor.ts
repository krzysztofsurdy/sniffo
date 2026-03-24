import type { Node } from 'web-tree-sitter';
import {
  type ParsedSymbol,
  type ParsedReference,
  type ImportStatement,
  type ParseError,
  SymbolKind,
  Modifier,
  ReferenceKind,
} from '@sniffo/core';
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
    .replace(/\.(ts|tsx)$/, '')
    .replace(/\//g, '.')
    .replace(/\\/g, '.');
}

function fqn(ctx: VisitorContext, name: string): string {
  if (ctx.currentClass) {
    return `${ctx.moduleName}.${ctx.currentClass}::${name}`;
  }
  return `${ctx.moduleName}.${name}`;
}

function classFqn(ctx: VisitorContext, name: string): string {
  return `${ctx.moduleName}.${name}`;
}

function visitNode(node: Node, ctx: VisitorContext): void {
  switch (node.type) {
    case 'import_statement':
      visitImport(node, ctx);
      break;
    case 'class_declaration':
      visitClass(node, ctx);
      return;
    case 'abstract_class_declaration':
      visitClass(node, ctx);
      return;
    case 'interface_declaration':
      visitInterface(node, ctx);
      return;
    case 'enum_declaration':
      visitEnum(node, ctx);
      return;
    case 'function_declaration':
      visitFunction(node, ctx);
      return;
    case 'export_statement':
      visitExportStatement(node, ctx);
      return;
    case 'ERROR':
      ctx.errors.push({
        message: 'Parse error at node',
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

function visitExportStatement(node: Node, ctx: VisitorContext): void {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) visitNode(child, ctx);
  }
}

function visitImport(node: Node, ctx: VisitorContext): void {
  const sourceNode = findChildByType(node, 'string');
  if (!sourceNode) return;

  const source = sourceNode.text.replace(/['"]/g, '');
  const importClause = findChildByType(node, 'import_clause');
  if (!importClause) return;

  const namedImports = findDescendantsByType(importClause, 'import_specifier');
  for (const specifier of namedImports) {
    const nameNode = findChildByType(specifier, 'identifier');
    const aliasNode = findChildrenByType(specifier, 'identifier');

    const originalName = nameNode?.text ?? specifier.text;
    const alias = aliasNode.length > 1 ? aliasNode[aliasNode.length - 1]!.text : null;

    ctx.imports.push({
      originalName: `${source}.${originalName}`,
      alias,
      line: node.startPosition.row + 1,
    });
  }

  const defaultImport = findChildByType(importClause, 'identifier');
  if (defaultImport && namedImports.length === 0) {
    ctx.imports.push({
      originalName: `${source}.${defaultImport.text}`,
      alias: null,
      line: node.startPosition.row + 1,
    });
  }
}

function extractModifiers(node: Node): Modifier[] {
  const mods: Modifier[] = [];
  const modMap: Record<string, Modifier> = {
    public: Modifier.Public,
    protected: Modifier.Protected,
    private: Modifier.Private,
    static: Modifier.Static,
    abstract: Modifier.Abstract,
    readonly: Modifier.Readonly,
  };

  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    if (child.type === 'accessibility_modifier') {
      const mod = modMap[child.text];
      if (mod) mods.push(mod);
    }
    if (child.text === 'static' && child.type !== 'identifier') {
      if (!mods.includes(Modifier.Static)) mods.push(Modifier.Static);
    }
    if (child.text === 'abstract' && child.type !== 'identifier') {
      if (!mods.includes(Modifier.Abstract)) mods.push(Modifier.Abstract);
    }
    if (child.text === 'readonly' && child.type !== 'identifier') {
      if (!mods.includes(Modifier.Readonly)) mods.push(Modifier.Readonly);
    }
    if (child.type === 'override_modifier') {
      // skip override for now
    }
  }

  return mods;
}

function visitClass(node: Node, ctx: VisitorContext): void {
  const nameNode = findChildByType(node, 'type_identifier');
  if (!nameNode) return;

  const name = nameNode.text;
  const prevClass = ctx.currentClass;
  ctx.currentClass = name;

  const modifiers = extractModifiers(node);
  if (node.type === 'abstract_class_declaration' && !modifiers.includes(Modifier.Abstract)) {
    modifiers.push(Modifier.Abstract);
  }

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

  const heritage = findChildByType(node, 'class_heritage');
  if (heritage) {
    visitClassHeritage(heritage, name, ctx);
  }

  visitClassBody(node, ctx);
  ctx.currentClass = prevClass;
}

function visitClassHeritage(heritage: Node, className: string, ctx: VisitorContext): void {
  const extendsClause = findChildByType(heritage, 'extends_clause');
  if (extendsClause) {
    const typeId = findChildByType(extendsClause, 'type_identifier')
      || findChildByType(extendsClause, 'identifier');
    if (typeId) {
      ctx.references.push({
        kind: ReferenceKind.Extends,
        sourceSymbolFqn: classFqn(ctx, className),
        targetName: typeId.text,
        targetFqn: null,
        filePath: ctx.filePath,
        line: typeId.startPosition.row + 1,
        column: typeId.startPosition.column,
        context: `extends ${typeId.text}`,
      });
    }
  }

  const implementsClause = findChildByType(heritage, 'implements_clause');
  if (implementsClause) {
    const types = findDescendantsByType(implementsClause, 'type_identifier');
    for (const t of types) {
      ctx.references.push({
        kind: ReferenceKind.Implements,
        sourceSymbolFqn: classFqn(ctx, className),
        targetName: t.text,
        targetFqn: null,
        filePath: ctx.filePath,
        line: t.startPosition.row + 1,
        column: t.startPosition.column,
        context: `implements ${t.text}`,
      });
    }
  }
}

function visitClassBody(node: Node, ctx: VisitorContext): void {
  const body = findChildByType(node, 'class_body');
  if (!body) return;

  for (let i = 0; i < body.childCount; i++) {
    const child = body.child(i);
    if (!child) continue;

    switch (child.type) {
      case 'method_definition':
        visitMethod(child, ctx);
        break;
      case 'public_field_definition':
        visitProperty(child, ctx);
        break;
      case 'property_definition':
        visitProperty(child, ctx);
        break;
    }

    const newExpressions = findDescendantsByType(child, 'new_expression');
    for (const newExpr of newExpressions) {
      visitNewExpression(newExpr, ctx);
    }
  }
}

function visitInterface(node: Node, ctx: VisitorContext): void {
  const nameNode = findChildByType(node, 'type_identifier');
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

  ctx.currentClass = prevClass;
}

function visitEnum(node: Node, ctx: VisitorContext): void {
  const nameNode = findChildByType(node, 'identifier');
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

function visitFunction(node: Node, ctx: VisitorContext): void {
  const nameNode = findChildByType(node, 'identifier');
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

function visitMethod(node: Node, ctx: VisitorContext): void {
  const nameNode = findChildByType(node, 'property_identifier');
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
}

function visitProperty(node: Node, ctx: VisitorContext): void {
  const modifiers = extractModifiers(node);
  const nameNode = findChildByType(node, 'property_identifier');
  if (!nameNode) return;

  ctx.symbols.push({
    kind: SymbolKind.Property,
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
}

function visitNewExpression(node: Node, ctx: VisitorContext): void {
  const nameNode = findChildByType(node, 'identifier')
    || findChildByType(node, 'type_identifier');
  if (!nameNode) return;

  const sourceSymbolFqn = ctx.currentClass
    ? classFqn(ctx, ctx.currentClass)
    : ctx.filePath;

  ctx.references.push({
    kind: ReferenceKind.Instantiates,
    sourceSymbolFqn,
    targetName: nameNode.text,
    targetFqn: null,
    filePath: ctx.filePath,
    line: nameNode.startPosition.row + 1,
    column: nameNode.startPosition.column,
    context: `new ${nameNode.text}`,
  });
}
