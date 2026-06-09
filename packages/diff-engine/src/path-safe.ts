import { resolve, sep } from 'node:path';

/** 校验绝对路径位于 workspace 根目录内（防 path traversal）。 */
export function assertWithinWorkspaceRoot(workspaceRoot: string, fullPath: string): void {
  const root = resolve(workspaceRoot);
  const resolved = resolve(fullPath);
  if (resolved !== root && !resolved.startsWith(root + sep)) {
    throw new Error('Path escapes workspace root');
  }
}

export function resolveWithinWorkspace(workspaceRoot: string, relativePath: string): string {
  const root = resolve(workspaceRoot);
  const fullPath = resolve(root, relativePath);
  assertWithinWorkspaceRoot(root, fullPath);
  return fullPath;
}

export function toRelativeWorkspacePath(workspaceRoot: string, absolutePath: string): string {
  const root = resolve(workspaceRoot);
  const full = resolve(absolutePath);
  assertWithinWorkspaceRoot(root, full);
  if (full === root) return '';
  return full.slice(root.length + 1);
}
