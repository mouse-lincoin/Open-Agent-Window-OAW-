import { describe, expect, it } from 'vitest';
import { filterFileTree, guessLanguage } from './file-tree-utils.js';
import type { FileNode } from '@oaw/shared-types';

const tree: FileNode[] = [
  {
    type: 'dir',
    name: 'src',
    path: 'src',
    children: [
      { type: 'file', name: 'index.ts', path: 'src/index.ts' },
      { type: 'file', name: 'app.tsx', path: 'src/app.tsx' },
    ],
  },
  { type: 'file', name: 'README.md', path: 'README.md' },
];

describe('file-tree-utils', () => {
  it('filters files by name', () => {
    const result = filterFileTree(tree, 'index');
    expect(result).toHaveLength(1);
    expect(result[0]?.type).toBe('dir');
    if (result[0]?.type === 'dir') {
      expect(result[0].children).toHaveLength(1);
    }
  });

  it('guesses language from extension', () => {
    expect(guessLanguage('src/index.ts')).toBe('typescript');
    expect(guessLanguage('README.md')).toBe('markdown');
  });
});
