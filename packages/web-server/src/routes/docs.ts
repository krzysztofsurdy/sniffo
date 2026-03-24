import type { FastifyInstance } from 'fastify';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const EXCLUDED_DIRS = new Set(['node_modules', 'vendor', '.git']);

interface FileNode {
  name: string;
  type: 'file';
  path: string;
}

interface DirectoryNode {
  name: string;
  type: 'directory';
  children: TreeNode[];
}

type TreeNode = FileNode | DirectoryNode;

async function buildTree(dir: string, rootDir: string): Promise<TreeNode[]> {
  const entries = await readdir(dir, { withFileTypes: true });

  const dirs: DirectoryNode[] = [];
  const files: FileNode[] = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) {
        continue;
      }
      const children = await buildTree(join(dir, entry.name), rootDir);
      if (children.length > 0) {
        dirs.push({ name: entry.name, type: 'directory', children });
      }
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      const absolutePath = join(dir, entry.name);
      const relativePath = relative(rootDir, absolutePath);
      files.push({ name: entry.name, type: 'file', path: relativePath });
    }
  }

  dirs.sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => a.name.localeCompare(b.name));

  return [...dirs, ...files];
}

export function registerDocsRoutes(app: FastifyInstance, rootDir: string): void {
  const docsDir = join(rootDir, '.sniffo', 'docs');

  app.get('/api/docs', async (_request, reply) => {
    try {
      const tree = await buildTree(docsDir, docsDir);
      return { success: true, data: { tree } };
    } catch (err) {
      return { success: true, data: { tree: [] } };
    }
  });

  app.get<{ Params: { '*': string } }>('/api/docs/*', async (request, reply) => {
    const filePath = request.params['*'];

    if (!filePath.endsWith('.md')) {
      return reply.status(400).send({ success: false, error: 'Only markdown files are supported' });
    }

    const absolutePath = join(docsDir, filePath);

    if (!absolutePath.startsWith(docsDir)) {
      return reply.status(400).send({ success: false, error: 'Invalid file path' });
    }

    try {
      const content = await readFile(absolutePath, 'utf-8');
      return { success: true, data: { path: filePath, content } };
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
        return reply.status(404).send({ success: false, error: 'File not found' });
      }
      return reply.status(500).send({ success: false, error: 'Failed to read file' });
    }
  });
}
