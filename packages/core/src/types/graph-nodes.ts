import { createHash } from 'node:crypto';

export enum GraphLevel {
  SYSTEM = 'L1_SYSTEM',
  CONTAINER = 'L2_CONTAINER',
  COMPONENT = 'L3_COMPONENT',
  CODE = 'L4_CODE',
}

export enum NodeType {
  // L1
  SYSTEM = 'SYSTEM',
  // L2
  CONTAINER = 'CONTAINER',
  MODULE = 'MODULE',
  PACKAGE = 'PACKAGE',
  BUNDLE = 'BUNDLE',
  // L3
  CLASS = 'CLASS',
  INTERFACE = 'INTERFACE',
  TRAIT = 'TRAIT',
  ENUM = 'ENUM',
  ABSTRACT_CLASS = 'ABSTRACT_CLASS',
  FUNCTION = 'FUNCTION',
  // L4
  METHOD = 'METHOD',
  PROPERTY = 'PROPERTY',
  CONSTANT = 'CONSTANT',
  CONSTRUCTOR = 'CONSTRUCTOR',
}

export interface BaseNode {
  id: string;
  type: NodeType;
  level: GraphLevel;
  qualifiedName: string;
  shortName: string;
  filePath: string | null;
  startLine: number | null;
  endLine: number | null;
  contentHash: string | null;
  isStale: boolean;
  lastAnalyzedAt: string;
  metadata: Record<string, unknown>;
}

export interface SystemNode extends BaseNode {
  level: GraphLevel.SYSTEM;
  type: NodeType.SYSTEM;
}

export interface ContainerNode extends BaseNode {
  level: GraphLevel.CONTAINER;
  type: NodeType.CONTAINER | NodeType.MODULE | NodeType.PACKAGE | NodeType.BUNDLE;
  metadata: {
    namespace: string;
    directory: string;
    fileCount: number;
  };
}

export interface ComponentNode extends BaseNode {
  level: GraphLevel.COMPONENT;
  type:
    | NodeType.CLASS
    | NodeType.INTERFACE
    | NodeType.TRAIT
    | NodeType.ENUM
    | NodeType.ABSTRACT_CLASS
    | NodeType.FUNCTION;
  metadata: {
    namespace: string;
    isAbstract: boolean;
    isFinal: boolean;
    visibility: 'public' | 'protected' | 'private' | null;
    loc: number;
  };
}

export interface CodeNode extends BaseNode {
  level: GraphLevel.CODE;
  type: NodeType.METHOD | NodeType.PROPERTY | NodeType.CONSTANT | NodeType.CONSTRUCTOR;
  metadata: {
    visibility: 'public' | 'protected' | 'private';
    isStatic: boolean;
    returnType: string | null;
    parameterTypes: string[];
  };
}

export type GraphNode = SystemNode | ContainerNode | ComponentNode | CodeNode;

export function createNodeId(type: NodeType, qualifiedName: string): string {
  return createHash('sha256')
    .update(`${type}::${qualifiedName}`)
    .digest('hex')
    .slice(0, 16);
}
