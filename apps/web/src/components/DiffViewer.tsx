'use client';

import { DiffEditor } from '@monaco-editor/react';
import type { DiffPayload } from '@oaw/shared-types';

interface Props {
  diff: DiffPayload;
  onDecision: (decision: 'accept' | 'reject') => void;
}

export function DiffViewer({ diff, onDecision }: Props) {
  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <span>{diff.path}</span>
        <div style={styles.actions}>
          <button type="button" onClick={() => onDecision('accept')}>
            Accept
          </button>
          <button type="button" onClick={() => onDecision('reject')}>
            Reject
          </button>
        </div>
      </div>
      <div style={styles.editor}>
        <DiffEditor
          height="320px"
          language="plaintext"
          original={diff.before}
          modified={diff.after}
          theme="vs-dark"
          options={{ readOnly: true, renderSideBySide: true }}
        />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    borderTop: '1px solid #333',
    background: '#111',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    color: '#ccc',
    fontSize: 13,
  },
  actions: { display: 'flex', gap: 8 },
  editor: { borderTop: '1px solid #222' },
};
