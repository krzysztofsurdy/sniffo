import { readFile, writeFile, mkdir, unlink, chmod, access, constants } from 'node:fs/promises';
import { join } from 'node:path';

const MARKER_START = '# --- contextualizer pre-commit hook start ---';
const MARKER_END = '# --- contextualizer pre-commit hook end ---';
const SHEBANG = '#!/bin/sh';

const HOOK_CONTENT = `${MARKER_START}
STAGED_PHP_FILES=$(git diff --cached --name-only --diff-filter=ACM -- '*.php')
if [ -n "$STAGED_PHP_FILES" ]; then
  if command -v lpc &> /dev/null; then
    echo "[contextualizer] Updating graph for staged PHP files..."
    lpc update -d "$(git rev-parse --show-toplevel)" 2>/dev/null || true
  fi
fi
${MARKER_END}`;

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function installHook(projectDir: string): Promise<void> {
  const gitDir = join(projectDir, '.git');
  if (!(await fileExists(gitDir))) {
    throw new Error(`Not a git repository: ${projectDir}`);
  }

  const hooksDir = join(gitDir, 'hooks');
  await mkdir(hooksDir, { recursive: true });

  const hookPath = join(hooksDir, 'pre-commit');

  if (await fileExists(hookPath)) {
    const existing = await readFile(hookPath, 'utf-8');

    if (existing.includes(MARKER_START)) {
      return;
    }

    const updated = existing.trimEnd() + '\n\n' + HOOK_CONTENT + '\n';
    await writeFile(hookPath, updated, 'utf-8');
  } else {
    const content = SHEBANG + '\n\n' + HOOK_CONTENT + '\n';
    await writeFile(hookPath, content, 'utf-8');
  }

  await chmod(hookPath, 0o755);
}

export async function uninstallHook(projectDir: string): Promise<void> {
  const hookPath = join(projectDir, '.git', 'hooks', 'pre-commit');

  if (!(await fileExists(hookPath))) {
    return;
  }

  const content = await readFile(hookPath, 'utf-8');

  if (!content.includes(MARKER_START)) {
    return;
  }

  const startIdx = content.indexOf(MARKER_START);
  const endIdx = content.indexOf(MARKER_END);

  if (startIdx === -1 || endIdx === -1) {
    return;
  }

  const before = content.substring(0, startIdx);
  const after = content.substring(endIdx + MARKER_END.length);
  const cleaned = (before + after).trim();

  if (cleaned === SHEBANG || cleaned === '') {
    await unlink(hookPath);
  } else {
    await writeFile(hookPath, cleaned + '\n', 'utf-8');
  }
}
