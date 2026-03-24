import { existsSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import fg from 'fast-glob';

export interface WorkspacePackage {
  name: string;
  relativePath: string;
  absolutePath: string;
}

export interface WorkspaceInfo {
  type: 'pnpm' | 'npm' | 'composer';
  rootDir: string;
  packages: WorkspacePackage[];
}

export async function detectWorkspaces(rootDir: string): Promise<WorkspaceInfo | null> {
  const pnpmResult = await detectPnpmWorkspaces(rootDir);
  if (pnpmResult) return pnpmResult;

  const npmResult = await detectNpmWorkspaces(rootDir);
  if (npmResult) return npmResult;

  const composerResult = await detectComposerWorkspaces(rootDir);
  if (composerResult) return composerResult;

  return null;
}

async function detectPnpmWorkspaces(rootDir: string): Promise<WorkspaceInfo | null> {
  const yamlPath = join(rootDir, 'pnpm-workspace.yaml');
  if (!existsSync(yamlPath)) return null;

  const content = readFileSync(yamlPath, 'utf-8');
  const patterns = parsePnpmYaml(content);
  if (patterns.length === 0) return null;

  const packages = await resolvePackageDirs(rootDir, patterns, 'package.json', 'name');
  if (packages.length === 0) return null;

  return { type: 'pnpm', rootDir, packages };
}

async function detectNpmWorkspaces(rootDir: string): Promise<WorkspaceInfo | null> {
  const pkgJsonPath = join(rootDir, 'package.json');
  if (!existsSync(pkgJsonPath)) return null;

  try {
    const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
    let patterns: string[] = [];

    if (Array.isArray(pkg.workspaces)) {
      patterns = pkg.workspaces;
    } else if (pkg.workspaces && Array.isArray(pkg.workspaces.packages)) {
      patterns = pkg.workspaces.packages;
    }

    if (patterns.length === 0) return null;

    const packages = await resolvePackageDirs(rootDir, patterns, 'package.json', 'name');
    if (packages.length === 0) return null;

    return { type: 'npm', rootDir, packages };
  } catch {
    return null;
  }
}

async function detectComposerWorkspaces(rootDir: string): Promise<WorkspaceInfo | null> {
  const composerPath = join(rootDir, 'composer.json');
  if (!existsSync(composerPath)) return null;

  try {
    const composer = JSON.parse(readFileSync(composerPath, 'utf-8'));
    if (!Array.isArray(composer.repositories)) return null;

    const pathRepos = composer.repositories.filter(
      (r: Record<string, unknown>) => r.type === 'path' && typeof r.url === 'string',
    );

    const patterns = pathRepos.map((r: { url: string }) => r.url);
    if (patterns.length === 0) return null;

    const packages = await resolvePackageDirs(rootDir, patterns, 'composer.json', 'name');
    if (packages.length === 0) return null;

    return { type: 'composer', rootDir, packages };
  } catch {
    return null;
  }
}

function parsePnpmYaml(content: string): string[] {
  const patterns: string[] = [];
  let inPackages = false;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();

    if (trimmed === 'packages:') {
      inPackages = true;
      continue;
    }

    if (inPackages && /^\w+:/.test(trimmed) && trimmed !== 'packages:') {
      break;
    }

    if (inPackages && trimmed.startsWith('- ')) {
      const pattern = trimmed
        .slice(2)
        .trim()
        .replace(/^['"]/, '')
        .replace(/['"]$/, '');
      if (pattern) patterns.push(pattern);
    }
  }

  return patterns;
}

async function resolvePackageDirs(
  rootDir: string,
  patterns: string[],
  manifestFile: string,
  nameField: string,
): Promise<WorkspacePackage[]> {
  const globPatterns = patterns.map((p) => {
    const clean = p.replace(/\/+$/, '');
    return `${clean}/${manifestFile}`;
  });

  const matches = await fg(globPatterns, {
    cwd: rootDir,
    absolute: false,
    onlyFiles: true,
  });

  const packages: WorkspacePackage[] = [];

  for (const match of matches) {
    const pkgDir = match.replace(`/${manifestFile}`, '');
    const absPath = join(rootDir, pkgDir);
    const manifestPath = join(rootDir, match);

    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      const name = manifest[nameField] ?? basename(pkgDir);

      packages.push({
        name,
        relativePath: pkgDir,
        absolutePath: absPath,
      });
    } catch {
      packages.push({
        name: basename(pkgDir),
        relativePath: pkgDir,
        absolutePath: absPath,
      });
    }
  }

  packages.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return packages;
}
