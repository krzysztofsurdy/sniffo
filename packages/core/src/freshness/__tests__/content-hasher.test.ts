import { describe, it, expect } from 'vitest';
import { hashContent, hashFile } from '../content-hasher.js';

describe('ContentHasher', () => {
  it('produces consistent hash for same content', () => {
    const h1 = hashContent('<?php class Foo {}');
    const h2 = hashContent('<?php class Foo {}');
    expect(h1).toBe(h2);
  });

  it('produces different hash for different content', () => {
    const h1 = hashContent('<?php class Foo {}');
    const h2 = hashContent('<?php class Bar {}');
    expect(h1).not.toBe(h2);
  });

  it('returns a 64-char hex string', () => {
    const h = hashContent('test');
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });

  it('detects whitespace changes', () => {
    const h1 = hashContent('<?php class Foo {}');
    const h2 = hashContent('<?php class Foo {  }');
    expect(h1).not.toBe(h2);
  });
});
