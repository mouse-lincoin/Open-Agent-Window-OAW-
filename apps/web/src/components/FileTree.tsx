'use client';

import type { FileNode } from '@oaw/shared-types';

interface Props {
  tree: FileNode[];
}

export function FileTree({ tree }: Props) {
  return (
    <div style={{ padding: 8, fontSize: 13, color: '#ccc' }}>
      {tree.length === 0 ? <p>空目录</p> : tree.map((node) => <Node key={node.path} node={node} depth={0} />)}
    </div>
  );
}

function Node({ node, depth }: { node: FileNode; depth: number }) {
  if (node.type === 'file') {
    return (
      <div style={{ paddingLeft: depth * 12, lineHeight: '22px' }}>
        📄 {node.name}
      </div>
    );
  }
  return (
    <div>
      <div style={{ paddingLeft: depth * 12, lineHeight: '22px' }}>📁 {node.name}</div>
      {node.children.map((child) => (
        <Node key={child.path} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}
