import { statSync } from 'node:fs';
import { resolve } from 'node:path';

export function validateWorkspaceRootPath(rootPath: string): string | null {
  if (!rootPath.trim()) {
    return 'rootPath is required';
  }

  try {
    const absolute = resolve(rootPath);
    const stats = statSync(absolute);
    if (!stats.isDirectory()) {
      return 'rootPath must be an existing directory';
    }
    return null;
  } catch {
    return 'rootPath must be an existing directory';
  }
}
