'use client';

import type { Session } from '@oaw/shared-types';

interface Props {
  sessions: Session[];
  activeSessionId: string | null;
  onSelect: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
}

export function SessionList({ sessions, activeSessionId, onSelect, onDelete }: Props) {
  if (sessions.length === 0) {
    return <p style={{ fontSize: 12, color: '#666', padding: '0 12px' }}>暂无历史会话</p>;
  }

  return (
    <ul style={styles.list}>
      {sessions.map((session) => (
        <li key={session.id} style={styles.row}>
          <button
            type="button"
            style={{
              ...styles.item,
              ...(activeSessionId === session.id ? styles.active : {}),
            }}
            onClick={() => onSelect(session.id)}
          >
            <span style={styles.title}>
              {session.title ?? `会话 ${session.id.slice(0, 8)}`}
            </span>
            <span style={styles.meta}>
              {session.agentId} · {new Date(session.createdAt).toLocaleString()}
            </span>
          </button>
          <button
            type="button"
            style={styles.deleteBtn}
            title="删除会话"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(session.id);
            }}
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}

const styles: Record<string, React.CSSProperties> = {
  list: { listStyle: 'none', margin: 0, padding: '0 8px 8px', maxHeight: 160, overflow: 'auto' },
  row: { display: 'flex', alignItems: 'stretch', gap: 4, marginBottom: 4 },
  item: {
    flex: 1,
    textAlign: 'left',
    padding: '8px 10px',
    background: 'transparent',
    border: '1px solid #333',
    borderRadius: 6,
    color: '#ccc',
    cursor: 'pointer',
  },
  active: { background: '#2a2a2a', borderColor: '#555', color: '#fff' },
  title: { display: 'block', fontSize: 13 },
  meta: { display: 'block', fontSize: 11, color: '#888', marginTop: 2 },
  deleteBtn: {
    width: 28,
    flexShrink: 0,
    background: 'transparent',
    border: '1px solid #333',
    borderRadius: 6,
    color: '#888',
    cursor: 'pointer',
    fontSize: 16,
    lineHeight: 1,
  },
};
