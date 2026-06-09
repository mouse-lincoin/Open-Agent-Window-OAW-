'use client';

import type { FileNode } from '@oaw/shared-types';

interface Props {
  tree: FileNode[];
  selectedPath?: string | null;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSelectFile: (path: string) => void;
}

export function FileTree({
  tree,
  selectedPath,
  searchQuery,
  onSearchChange,
  onSelectFile,
}: Props) {
  return (
    <div style={styles.container}>
      <input
        type="search"
        placeholder="搜索文件…"
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        style={styles.search}
      />
      <div style={styles.tree}>
        {tree.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12, color: '#666' }}>无匹配文件</p>
        ) : (
          tree.map((node) => (
            <Node
              key={node.path}
              node={node}
              depth={0}
              selectedPath={selectedPath}
              onSelectFile={onSelectFile}
            />
          ))
        )}
      </div>
    </div>
  );
}

function Node({
  node,
  depth,
  selectedPath,
  onSelectFile,
}: {
  node: FileNode;
  depth: number;
  selectedPath?: string | null;
  onSelectFile: (path: string) => void;
}) {
  if (node.type === 'file') {
    const selected = selectedPath === node.path;
    return (
      <button
        type="button"
        onClick={() => onSelectFile(node.path)}
        style={{
          ...styles.fileBtn,
          paddingLeft: depth * 12 + 8,
          ...(selected ? styles.selected : {}),
        }}
      >
        📄 {node.name}
      </button>
    );
  }
  return (
    <div>
      <div style={{ paddingLeft: depth * 12 + 8, lineHeight: '22px', fontSize: 13 }}>
        📁 {node.name}
      </div>
      {node.children.map((child) => (
        <Node
          key={child.path}
          node={child}
          depth={depth + 1}
          selectedPath={selectedPath}
          onSelectFile={onSelectFile}
        />
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: 8 },
  search: {
    width: '100%',
    padding: '6px 8px',
    marginBottom: 8,
    background: '#1a1a1a',
    border: '1px solid #444',
    borderRadius: 6,
    color: '#eee',
    fontSize: 12,
  },
  tree: { flex: 1, overflow: 'auto', fontSize: 13, color: '#ccc' },
  fileBtn: {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    lineHeight: '22px',
    background: 'transparent',
    border: 'none',
    color: 'inherit',
    cursor: 'pointer',
    borderRadius: 4,
  },
  selected: { background: '#2b5278', color: '#fff' },
};
