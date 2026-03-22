import { describe, it, expect } from 'vitest';
import {
  type BaseNode,
  type ComponentNode,
  type CodeNode,
  GraphLevel,
  NodeType,
  createNodeId,
} from '../graph-nodes.js';

describe('GraphNodes', () => {
  describe('createNodeId', () => {
    it('generates deterministic ID from type and qualified name', () => {
      const id1 = createNodeId(NodeType.CLASS, 'App\\Service\\UserService');
      const id2 = createNodeId(NodeType.CLASS, 'App\\Service\\UserService');
      expect(id1).toBe(id2);
    });

    it('generates different IDs for different inputs', () => {
      const id1 = createNodeId(NodeType.CLASS, 'App\\Service\\UserService');
      const id2 = createNodeId(NodeType.INTERFACE, 'App\\Service\\UserService');
      expect(id1).not.toBe(id2);
    });
  });

  describe('GraphLevel', () => {
    it('defines all four levels', () => {
      expect(GraphLevel.SYSTEM).toBe('L1_SYSTEM');
      expect(GraphLevel.CONTAINER).toBe('L2_CONTAINER');
      expect(GraphLevel.COMPONENT).toBe('L3_COMPONENT');
      expect(GraphLevel.CODE).toBe('L4_CODE');
    });
  });

  describe('NodeType', () => {
    it('includes PHP-specific types', () => {
      expect(NodeType.TRAIT).toBe('TRAIT');
      expect(NodeType.ENUM).toBe('ENUM');
      expect(NodeType.ABSTRACT_CLASS).toBe('ABSTRACT_CLASS');
    });
  });
});
