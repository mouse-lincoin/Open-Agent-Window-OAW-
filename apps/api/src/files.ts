import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { FileNode } from '@oaw/shared-types';

export async function buildFileTree(rootPath: string): Promise<FileNode[]> {
  return buildTree(rootPath, rootPath, 0);
}

async function buildTree(
  rootPath: string,
  currentPath: string,
  depth: number,
): Promise<FileNode[]> {
  if (depth > 6) return [];

  const entries = await readdir(currentPath, { withFileTypes: true });
  const nodes: FileNode[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

    const fullPath = join(currentPath, entry.name);
    const relativePath = fullPath.slice(rootPath.length + 1);

    if (entry.isDirectory()) {
      const children = await buildTree(rootPath, fullPath, depth + 1);
      nodes.push({
        type: 'dir',
        name: entry.name,
        path: relativePath,
        children,
      });
    } else if (entry.isFile()) {
      nodes.push({ type: 'file', name: entry.name, path: relativePath });
    }
  }

  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return nodes;
}

export async function readWorkspaceFileContent(
  rootPath: string,
  relativePath: string,
): Promise<string> {
  const fullPath = resolve(rootPath, relativePath);
  const root = resolve(rootPath);
  if (!fullPath.startsWith(root)) {
    throw new Error('Path escapes workspace root');
  }
  return readFile(fullPath, 'utf8');
}

export async function pathExists(rootPath: string, relativePath: string): Promise<boolean> {
  try {
    const fullPath = resolve(rootPath, relativePath);
    await stat(fullPath);
    return true;
  } catch {
    return false;
  }
}
