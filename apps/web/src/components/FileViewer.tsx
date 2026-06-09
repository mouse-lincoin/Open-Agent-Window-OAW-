'use client';

import Editor from '@monaco-editor/react';
import { guessLanguage } from '@/lib/file-tree-utils';

interface Props {
  path: string | null;
  content: string;
  loading?: boolean;
}

export function FileViewer({ path, content, loading }: Props) {
  if (!path) {
    return (
      <div style={styles.placeholder}>
        <p style={{ margin: 0, color: '#666', fontSize: 13 }}>点击文件树中的文件以预览</p>
      </div>
    );
  }

  return (
    <div style={styles.panel}>
      <div style={styles.header}>{path}</div>
      {loading ? (
        <div style={styles.placeholder}>加载中…</div>
      ) : (
        <Editor
          height="100%"
          language={guessLanguage(path)}
          value={content}
          theme="vs-dark"
          options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13 }}
        />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: '#1e1e1e' },
  header: {
    padding: '6px 12px',
    fontSize: 12,
    color: '#aaa',
    borderBottom: '1px solid #333',
    background: '#141414',
  },
  placeholder: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#1a1a1a',
    minHeight: 120,
  },
};
