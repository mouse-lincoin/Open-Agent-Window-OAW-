import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { assertWithinWorkspaceRoot, resolveWithinWorkspace } from '@oaw/diff-engine';

export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileTreeNode[];
}

export async function buildFileTree(
  rootPath: string,
  relativePath = '',
  maxDepth = 4,
): Promise<FileTreeNode[]> {
  const fullPath = resolveWithinWorkspace(rootPath, relativePath);
  assertWithinWorkspaceRoot(rootPath, fullPath);

  const entries = await readdir(fullPath, { withFileTypes: true });
  const nodes: FileTreeNode[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') {
      continue;
    }

    const entryRelativePath = relativePath ? join(relativePath, entry.name) : entry.name;
    const node: FileTreeNode = {
      name: entry.name,
      path: entryRelativePath.replace(/\\/g, '/'),
      type: entry.isDirectory() ? 'directory' : 'file',
    };

    if (entry.isDirectory() && maxDepth > 0) {
      node.children = await buildFileTree(rootPath, entryRelativePath, maxDepth - 1);
    }

    nodes.push(node);
  }

  return nodes.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}

export async function readWorkspaceFileContent(
  rootPath: string,
  relativePath: string,
): Promise<string> {
  const fullPath = resolveWithinWorkspace(rootPath, relativePath);
  assertWithinWorkspaceRoot(rootPath, fullPath);
  return readFile(fullPath, 'utf8');
}
