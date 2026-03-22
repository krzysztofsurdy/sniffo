export const NODE_COLORS: Record<string, string> = {
  CLASS: '#7C3AED',
  INTERFACE: '#06B6D4',
  TRAIT: '#F59E0B',
  ENUM: '#F59E0B',
  FUNCTION: '#3B82F6',
  METHOD: '#3B82F6',
  PROPERTY: '#64748B',
  CONSTANT: '#64748B',
  MODULE: '#A78BFA',
  SYSTEM: '#EC4899',
};

export const EDGE_COLORS: Record<string, string> = {
  CALLS: '#4B7BEC',
  EXTENDS: '#A55EEA',
  IMPLEMENTS: '#26DE81',
  USES_TRAIT: '#778CA3',
  INJECTS: '#FD9644',
  CONTAINS: '#45526E',
  IMPORTS: '#20BF6B',
  DEPENDS_ON: '#778CA3',
  INSTANTIATES: '#4B7BEC',
};

export function getNodeColor(type: string): string {
  return NODE_COLORS[type] ?? '#64748B';
}

export function getEdgeColor(type: string): string {
  return EDGE_COLORS[type] ?? '#45526E';
}
