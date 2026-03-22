import { describe, it, expect } from 'vitest';
import { EdgeType, createEdgeId } from '../graph-edges.js';

describe('GraphEdges', () => {
  describe('EdgeType', () => {
    it('includes all relationship types', () => {
      expect(EdgeType.EXTENDS).toBe('EXTENDS');
      expect(EdgeType.IMPLEMENTS).toBe('IMPLEMENTS');
      expect(EdgeType.USES_TRAIT).toBe('USES_TRAIT');
      expect(EdgeType.CALLS).toBe('CALLS');
      expect(EdgeType.INJECTS).toBe('INJECTS');
      expect(EdgeType.CONTAINS).toBe('CONTAINS');
      expect(EdgeType.IMPORTS).toBe('IMPORTS');
      expect(EdgeType.INSTANTIATES).toBe('INSTANTIATES');
    });
  });

  describe('createEdgeId', () => {
    it('generates deterministic ID', () => {
      const id1 = createEdgeId('src1', 'tgt1', EdgeType.CALLS);
      const id2 = createEdgeId('src1', 'tgt1', EdgeType.CALLS);
      expect(id1).toBe(id2);
    });

    it('generates different IDs for different edges', () => {
      const id1 = createEdgeId('src1', 'tgt1', EdgeType.CALLS);
      const id2 = createEdgeId('src1', 'tgt1', EdgeType.EXTENDS);
      expect(id1).not.toBe(id2);
    });
  });
});
