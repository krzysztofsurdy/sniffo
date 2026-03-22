import type { DiscoveredFile } from './file-discovery.js';

export interface FileChange {
  file: DiscoveredFile;
  newHash: string;
}

export interface ChangeSet {
  added: FileChange[];
  modified: FileChange[];
  deleted: string[];
  unchanged: DiscoveredFile[];
}

export async function detectChanges(
  discoveredFiles: DiscoveredFile[],
  getStoredHash: (filePath: string) => Promise<string | null>,
  getAllTrackedPaths: () => Promise<string[]>,
  computeHash: (absolutePath: string) => Promise<string>,
): Promise<ChangeSet> {
  const added: FileChange[] = [];
  const modified: FileChange[] = [];
  const unchanged: DiscoveredFile[] = [];

  const discoveredPaths = new Set<string>();

  for (const file of discoveredFiles) {
    discoveredPaths.add(file.relativePath);

    const newHash = await computeHash(file.absolutePath);
    const storedHash = await getStoredHash(file.relativePath);

    if (storedHash === null) {
      added.push({ file, newHash });
    } else if (storedHash !== newHash) {
      modified.push({ file, newHash });
    } else {
      unchanged.push(file);
    }
  }

  const trackedPaths = await getAllTrackedPaths();
  const deleted = trackedPaths.filter((path) => !discoveredPaths.has(path));

  return { added, modified, deleted, unchanged };
}
