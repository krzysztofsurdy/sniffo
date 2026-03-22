import { createHash } from 'node:crypto';
import type { GraphLevel } from './graph-nodes.js';

export enum EdgeType {
  CONTAINS = 'CONTAINS',
  EXTENDS = 'EXTENDS',
  IMPLEMENTS = 'IMPLEMENTS',
  USES_TRAIT = 'USES_TRAIT',
  DEPENDS_ON = 'DEPENDS_ON',
  IMPORTS = 'IMPORTS',
  INJECTS = 'INJECTS',
  CALLS = 'CALLS',
  INSTANTIATES = 'INSTANTIATES',
  RETURNS_TYPE = 'RETURNS_TYPE',
  PARAMETER_TYPE = 'PARAMETER_TYPE',
  PROPERTY_TYPE = 'PROPERTY_TYPE',
}

export interface BaseEdge {
  id: string;
  source: string;
  target: string;
  type: EdgeType;
  level: GraphLevel;
  weight: number;
  metadata: Record<string, unknown>;
}

export interface SourceLocationMeta {
  sourceLocation: { file: string; line: number } | null;
  [key: string]: unknown;
}

export interface DependencyEdge extends BaseEdge {
  type:
    | EdgeType.DEPENDS_ON
    | EdgeType.IMPORTS
    | EdgeType.INJECTS
    | EdgeType.CALLS
    | EdgeType.INSTANTIATES;
  metadata: SourceLocationMeta;
}

export interface InheritanceEdge extends BaseEdge {
  type: EdgeType.EXTENDS | EdgeType.IMPLEMENTS | EdgeType.USES_TRAIT;
}

export interface ContainmentEdge extends BaseEdge {
  type: EdgeType.CONTAINS;
}

export interface TypeReferenceEdge extends BaseEdge {
  type: EdgeType.RETURNS_TYPE | EdgeType.PARAMETER_TYPE | EdgeType.PROPERTY_TYPE;
  metadata: {
    isNullable: boolean;
    [key: string]: unknown;
  };
}

export type GraphEdge =
  | DependencyEdge
  | InheritanceEdge
  | ContainmentEdge
  | TypeReferenceEdge;

export function createEdgeId(source: string, target: string, type: EdgeType): string {
  return createHash('sha256')
    .update(`${source}->${target}::${type}`)
    .digest('hex')
    .slice(0, 16);
}
