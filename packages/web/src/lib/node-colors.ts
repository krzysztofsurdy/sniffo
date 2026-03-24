export const NODE_COLORS: Record<string, string> = {
  CLASS: '#48A9E0',
  INTERFACE: '#8BC37A',
  TRAIT: '#FBCB5F',
  ENUM: '#FBCB5F',
  FUNCTION: '#48A9E0',
  METHOD: '#48A9E0',
  PROPERTY: '#644D73',
  CONSTANT: '#644D73',
  MODULE: '#F18BB3',
  PACKAGE: '#FBCB5F',
  SYSTEM: '#F18BB3',
};

export const EDGE_COLORS: Record<string, string> = {
  CALLS: '#48A9E0',
  EXTENDS: '#644D73',
  IMPLEMENTS: '#8BC37A',
  USES_TRAIT: '#FBCB5F',
  INJECTS: '#F18BB3',
  CONTAINS: '#644D73',
  IMPORTS: '#8BC37A',
  DEPENDS_ON: '#644D73',
  INSTANTIATES: '#48A9E0',
};

export function getNodeColor(type: string): string {
  return NODE_COLORS[type] ?? '#64748B';
}

export function getEdgeColor(type: string): string {
  return EDGE_COLORS[type] ?? '#45526E';
}
