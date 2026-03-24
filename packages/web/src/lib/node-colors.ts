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
  CALLS: '#3B8DBF',
  EXTENDS: '#4F3D5E',
  IMPLEMENTS: '#6FA462',
  USES_TRAIT: '#D4A94C',
  INJECTS: '#CC7495',
  CONTAINS: '#4F3D5E',
  IMPORTS: '#6FA462',
  DEPENDS_ON: '#4F3D5E',
  INSTANTIATES: '#3B8DBF',
};

export function getNodeColor(type: string): string {
  return NODE_COLORS[type] ?? '#64748B';
}

export function getEdgeColor(type: string): string {
  return EDGE_COLORS[type] ?? '#45526E';
}
