import fg from 'fast-glob';
import { stat } from 'node:fs/promises';
import { join, extname } from 'node:path';

export interface DiscoveredFile {
  relativePath: string;
  absolutePath: string;
  language: string;
  sizeBytes: number;
}

const DEFAULT_EXCLUDES = [
  'vendor/**',
  'node_modules/**',
  '.git/**',
  '.contextualizer/**',
  'dist/**',
  'build/**',
];

const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  '.php': 'php',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.py': 'python',
};

export async function discoverFiles(
  rootDir: string,
  includePatterns: string[] = ['**/*'],
  excludePatterns: string[] = [],
): Promise<DiscoveredFile[]> {
  const allExcludes = [...DEFAULT_EXCLUDES, ...excludePatterns];

  const entries = await fg(includePatterns, {
    cwd: rootDir,
    ignore: allExcludes,
    absolute: false,
    onlyFiles: true,
    dot: false,
  });

  const results: DiscoveredFile[] = [];

  for (const relativePath of entries) {
    const ext = extname(relativePath);
    const language = EXTENSION_TO_LANGUAGE[ext];

    if (!language) {
      continue;
    }

    const absolutePath = join(rootDir, relativePath);

    try {
      const fileStat = await stat(absolutePath);
      results.push({
        relativePath,
        absolutePath,
        language,
        sizeBytes: fileStat.size,
      });
    } catch {
      // File may have disappeared between glob and stat
    }
  }

  results.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  return results;
}
