import type { FileNode } from '@oaw/shared-types';

export function filterFileTree(tree: FileNode[], query: string): FileNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return tree;

  const filtered: FileNode[] = [];
  for (const node of tree) {
    if (node.type === 'file') {
      if (node.name.toLowerCase().includes(q) || node.path.toLowerCase().includes(q)) {
        filtered.push(node);
      }
    } else {
      const children = filterFileTree(node.children, q);
      if (children.length > 0 || node.name.toLowerCase().includes(q)) {
        filtered.push({ ...node, children });
      }
    }
  }
  return filtered;
}

export function guessLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    json: 'json',
    md: 'markdown',
    css: 'css',
    html: 'html',
    sql: 'sql',
    py: 'python',
    go: 'go',
    rs: 'rust',
    yaml: 'yaml',
    yml: 'yaml',
  };
  return map[ext ?? ''] ?? 'plaintext';
}
