import { describe, expect, it } from 'vitest';
import { assertWithinWorkspaceRoot, resolveWithinWorkspace } from './path-safe.js';

describe('path-safe', () => {
  const root = '/workspace/proj';

  it('allows files inside workspace', () => {
    expect(resolveWithinWorkspace(root, 'src/index.ts')).toBe('/workspace/proj/src/index.ts');
  });

  it('blocks path traversal via sibling directory name', () => {
    expect(() => resolveWithinWorkspace(root, '../proj-evil/secret.txt')).toThrow(
      'Path escapes workspace root',
    );
  });

  it('blocks absolute escape paths', () => {
    expect(() => assertWithinWorkspaceRoot(root, '/workspace/proj-evil/file')).toThrow(
      'Path escapes workspace root',
    );
  });

  it('allows workspace root itself', () => {
    expect(() => assertWithinWorkspaceRoot(root, root)).not.toThrow();
  });
});
