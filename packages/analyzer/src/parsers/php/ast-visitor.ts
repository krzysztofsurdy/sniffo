import type { Node } from 'web-tree-sitter';
import {
  type ParsedSymbol,
  type ParsedReference,
  type ImportStatement,
  type ParseError,
  SymbolKind,
  Modifier,
  ReferenceKind,
} from '@contextualizer/core';
import { findChildByType, findChildrenByType, findDescendantsByType, getNodeText } from './node-utils.js';

interface VisitorContext {
  filePath: string;
  currentNamespace: string | null;
  currentClass: string | null;
  symbols: ParsedSymbol[];
  references: ParsedReference[];
  imports: ImportStatement[];
  errors: ParseError[];
}

export function visitTree(rootNode: Node, filePath: string): VisitorContext {
  const ctx: VisitorContext = {
    filePath,
    currentNamespace: null,
    currentClass: null,
    symbols: [],
    references: [],
    imports: [],
    errors: [],
  };

  visitNode(rootNode, ctx);
  return ctx;
}

function visitNode(node: Node, ctx: VisitorContext): void {
  switch (node.type) {
    case 'namespace_definition':
      visitNamespace(node, ctx);
      return;
    case 'namespace_use_declaration':
      visitUseDeclaration(node, ctx);
      break;
    case 'class_declaration':
      visitClass(node, ctx);
      return;
    case 'interface_declaration':
      visitInterface(node, ctx);
      return;
    case 'trait_declaration':
      visitTrait(node, ctx);
      return;
    case 'enum_declaration':
      visitEnum(node, ctx);
      return;
    case 'function_definition':
      visitFunction(node, ctx);
      return;
    case 'ERROR':
      ctx.errors.push({
        message: `Parse error at node`,
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

function fqn(ctx: VisitorContext, name: string): string {
  const ns = ctx.currentNamespace ? ctx.currentNamespace + '\\' : '';
  if (ctx.currentClass) {
    return `${ns}${ctx.currentClass}::${name}`;
  }
  return `${ns}${name}`;
}

function classFqn(ctx: VisitorContext, name: string): string {
  return ctx.currentNamespace ? `${ctx.currentNamespace}\\${name}` : name;
}

function extractModifiers(node: Node): Modifier[] {
  const mods: Modifier[] = [];
  const modMap: Record<string, Modifier> = {
    public: Modifier.Public,
    protected: Modifier.Protected,
    private: Modifier.Private,
    static: Modifier.Static,
    abstract: Modifier.Abstract,
    final: Modifier.Final,
    readonly: Modifier.Readonly,
  };

  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    if (child.type.endsWith('_modifier') || child.type === 'readonly') {
      const mod = modMap[child.text];
      if (mod) mods.push(mod);
    }
    if (child.type === 'abstract') mods.push(Modifier.Abstract);
  }

  return mods;
}

function visitNamespace(node: Node, ctx: VisitorContext): void {
  const nameNode = findChildByType(node, 'namespace_name');
  if (nameNode) {
    ctx.currentNamespace = nameNode.text;
  }

  const body = findChildByType(node, 'compound_statement') || findChildByType(node, 'declaration_list');
  if (body) {
    for (let i = 0; i < body.childCount; i++) {
      const child = body.child(i);
      if (child) visitNode(child, ctx);
    }
  } else {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child && child.type !== 'namespace_name' && child.type !== 'namespace' && child.type !== ';') {
        visitNode(child, ctx);
      }
    }
  }
}

function visitUseDeclaration(node: Node, ctx: VisitorContext): void {
  const clauses = findDescendantsByType(node, 'namespace_use_clause');
  for (const clause of clauses) {
    const nameNode = findChildByType(clause, 'qualified_name') || findChildByType(clause, 'name');
    const aliasNode = findChildByType(clause, 'namespace_aliasing_clause');

    if (nameNode) {
      ctx.imports.push({
        originalName: nameNode.text,
        alias: aliasNode ? getNodeText(findChildByType(aliasNode, 'name')) || null : null,
        line: node.startPosition.row + 1,
      });
    }
  }
}

function visitClass(node: Node, ctx: VisitorContext): void {
  const nameNode = findChildByType(node, 'name');
  if (!nameNode) return;

  const name = nameNode.text;
  const prevClass = ctx.currentClass;
  ctx.currentClass = name;

  const modifiers = extractModifiers(node);

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

  const baseClause = findChildByType(node, 'base_clause');
  if (baseClause) {
    const baseName = findChildByType(baseClause, 'name') || findChildByType(baseClause, 'qualified_name');
    if (baseName) {
      ctx.references.push({
        kind: ReferenceKind.Extends,
        sourceSymbolFqn: classFqn(ctx, name),
        targetName: baseName.text,
        targetFqn: null,
        filePath: ctx.filePath,
        line: baseName.startPosition.row + 1,
        column: baseName.startPosition.column,
        context: `extends ${baseName.text}`,
      });
    }
  }

  const ifaceClause = findChildByType(node, 'class_interface_clause');
  if (ifaceClause) {
    const names = findChildrenByType(ifaceClause, 'name')
      .concat(findChildrenByType(ifaceClause, 'qualified_name'));
    for (const n of names) {
      ctx.references.push({
        kind: ReferenceKind.Implements,
        sourceSymbolFqn: classFqn(ctx, name),
        targetName: n.text,
        targetFqn: null,
        filePath: ctx.filePath,
        line: n.startPosition.row + 1,
        column: n.startPosition.column,
        context: `implements ${n.text}`,
      });
    }
  }

  visitClassBody(node, ctx);
  ctx.currentClass = prevClass;
}

function visitClassBody(node: Node, ctx: VisitorContext): void {
  const body = findChildByType(node, 'declaration_list');
  if (!body) return;

  for (let i = 0; i < body.childCount; i++) {
    const child = body.child(i);
    if (!child) continue;

    switch (child.type) {
      case 'method_declaration':
        visitMethod(child, ctx);
        break;
      case 'property_declaration':
        visitProperty(child, ctx);
        break;
      case 'const_declaration':
        visitConstant(child, ctx);
        break;
      case 'use_declaration':
        visitTraitUse(child, ctx);
        break;
    }
  }
}

function visitInterface(node: Node, ctx: VisitorContext): void {
  const nameNode = findChildByType(node, 'name');
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

  const body = findChildByType(node, 'declaration_list');
  if (body) {
    for (let i = 0; i < body.childCount; i++) {
      const child = body.child(i);
      if (child?.type === 'method_declaration') visitMethod(child, ctx);
    }
  }

  ctx.currentClass = prevClass;
}

function visitTrait(node: Node, ctx: VisitorContext): void {
  const nameNode = findChildByType(node, 'name');
  if (!nameNode) return;

  const name = nameNode.text;
  const prevClass = ctx.currentClass;
  ctx.currentClass = name;

  ctx.symbols.push({
    kind: SymbolKind.Trait,
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

  const body = findChildByType(node, 'declaration_list');
  if (body) {
    for (let i = 0; i < body.childCount; i++) {
      const child = body.child(i);
      if (!child) continue;
      if (child.type === 'method_declaration') visitMethod(child, ctx);
      if (child.type === 'property_declaration') visitProperty(child, ctx);
    }
  }

  ctx.currentClass = prevClass;
}

function visitEnum(node: Node, ctx: VisitorContext): void {
  const nameNode = findChildByType(node, 'name');
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
  const nameNode = findChildByType(node, 'name');
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
  const nameNode = findChildByType(node, 'name');
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

  if (nameNode.text === '__construct') {
    const params = findChildByType(node, 'formal_parameters');
    if (params) {
      visitConstructorParams(params, ctx);
    }
  }
}

function visitConstructorParams(node: Node, ctx: VisitorContext): void {
  const params = findDescendantsByType(node, 'property_promotion_parameter');
  for (const param of params) {
    const modifiers = extractModifiers(param);
    const varNode = findChildByType(param, 'variable_name');
    if (!varNode) continue;

    const propName = varNode.text.replace(/^\$/, '');

    ctx.symbols.push({
      kind: SymbolKind.Property,
      name: propName,
      fqn: fqn(ctx, propName),
      filePath: ctx.filePath,
      startLine: param.startPosition.row + 1,
      endLine: param.endPosition.row + 1,
      startColumn: param.startPosition.column,
      endColumn: param.endPosition.column,
      modifiers,
      metadata: { promoted: true },
    });

    const typeNode = findChildByType(param, 'named_type')
      || findChildByType(param, 'qualified_name')
      || findChildByType(param, 'name');
    if (typeNode && !isScalarType(typeNode.text)) {
      ctx.references.push({
        kind: ReferenceKind.Injects,
        sourceSymbolFqn: ctx.currentClass
          ? classFqn(ctx, ctx.currentClass)
          : ctx.filePath,
        targetName: typeNode.text,
        targetFqn: null,
        filePath: ctx.filePath,
        line: typeNode.startPosition.row + 1,
        column: typeNode.startPosition.column,
        context: `injects ${typeNode.text}`,
      });
    }
  }
}

function visitProperty(node: Node, ctx: VisitorContext): void {
  const modifiers = extractModifiers(node);
  const elements = findDescendantsByType(node, 'property_element');
  for (const el of elements) {
    const varNode = findChildByType(el, 'variable_name');
    if (!varNode) continue;

    const propName = varNode.text.replace(/^\$/, '');

    ctx.symbols.push({
      kind: SymbolKind.Property,
      name: propName,
      fqn: fqn(ctx, propName),
      filePath: ctx.filePath,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      startColumn: node.startPosition.column,
      endColumn: node.endPosition.column,
      modifiers,
      metadata: {},
    });
  }
}

function visitConstant(node: Node, ctx: VisitorContext): void {
  const elements = findDescendantsByType(node, 'const_element');
  for (const el of elements) {
    const nameNode = findChildByType(el, 'name');
    if (!nameNode) continue;

    ctx.symbols.push({
      kind: SymbolKind.Constant,
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
}

function visitTraitUse(node: Node, ctx: VisitorContext): void {
  const names = findChildrenByType(node, 'name')
    .concat(findChildrenByType(node, 'qualified_name'));
  for (const n of names) {
    ctx.references.push({
      kind: ReferenceKind.UsesTrait,
      sourceSymbolFqn: ctx.currentClass
        ? classFqn(ctx, ctx.currentClass)
        : ctx.filePath,
      targetName: n.text,
      targetFqn: null,
      filePath: ctx.filePath,
      line: n.startPosition.row + 1,
      column: n.startPosition.column,
      context: `use ${n.text}`,
    });
  }
}

function isScalarType(name: string): boolean {
  return ['int', 'string', 'float', 'bool', 'array', 'void', 'null', 'mixed', 'never', 'object', 'callable', 'iterable', 'self', 'static', 'parent', 'true', 'false'].includes(name.toLowerCase());
}
