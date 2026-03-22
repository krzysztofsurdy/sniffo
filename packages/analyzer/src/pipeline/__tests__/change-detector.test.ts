import { describe, it, expect, vi } from 'vitest';
import type { DiscoveredFile } from '../file-discovery.js';
import { detectChanges } from '../change-detector.js';

function makeFile(relativePath: string): DiscoveredFile {
  return {
    relativePath,
    absolutePath: `/project/${relativePath}`,
    language: 'php',
    sizeBytes: 100,
  };
}

describe('detectChanges', () => {
  it('marks all files as added when store is empty', async () => {
    const files = [makeFile('src/App.php'), makeFile('src/Service.php')];

    const result = await detectChanges(
      files,
      vi.fn().mockResolvedValue(null),
      vi.fn().mockResolvedValue([]),
      vi.fn().mockResolvedValue('hash-abc'),
    );

    expect(result.added).toHaveLength(2);
    expect(result.added[0].file.relativePath).toBe('src/App.php');
    expect(result.added[0].newHash).toBe('hash-abc');
    expect(result.modified).toHaveLength(0);
    expect(result.deleted).toHaveLength(0);
    expect(result.unchanged).toHaveLength(0);
  });

  it('marks files as unchanged when hash matches', async () => {
    const files = [makeFile('src/App.php')];

    const result = await detectChanges(
      files,
      vi.fn().mockResolvedValue('same-hash'),
      vi.fn().mockResolvedValue(['src/App.php']),
      vi.fn().mockResolvedValue('same-hash'),
    );

    expect(result.unchanged).toHaveLength(1);
    expect(result.unchanged[0].relativePath).toBe('src/App.php');
    expect(result.added).toHaveLength(0);
    expect(result.modified).toHaveLength(0);
    expect(result.deleted).toHaveLength(0);
  });

  it('marks files as modified when hash differs', async () => {
    const files = [makeFile('src/App.php')];

    const result = await detectChanges(
      files,
      vi.fn().mockResolvedValue('old-hash'),
      vi.fn().mockResolvedValue(['src/App.php']),
      vi.fn().mockResolvedValue('new-hash'),
    );

    expect(result.modified).toHaveLength(1);
    expect(result.modified[0].file.relativePath).toBe('src/App.php');
    expect(result.modified[0].newHash).toBe('new-hash');
    expect(result.added).toHaveLength(0);
    expect(result.deleted).toHaveLength(0);
    expect(result.unchanged).toHaveLength(0);
  });

  it('detects deleted files not present in discovered files', async () => {
    const files = [makeFile('src/App.php')];

    const result = await detectChanges(
      files,
      vi.fn().mockResolvedValue('same-hash'),
      vi.fn().mockResolvedValue(['src/App.php', 'src/Removed.php', 'src/Gone.php']),
      vi.fn().mockResolvedValue('same-hash'),
    );

    expect(result.deleted).toEqual(['src/Removed.php', 'src/Gone.php']);
    expect(result.unchanged).toHaveLength(1);
    expect(result.added).toHaveLength(0);
    expect(result.modified).toHaveLength(0);
  });
});
