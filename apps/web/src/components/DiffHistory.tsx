'use client';

import type { DecidedDiff } from '@/store/chat-store';

interface Props {
  entries: DecidedDiff[];
}

export function DiffHistory({ entries }: Props) {
  if (entries.length === 0) return null;

  return (
    <div style={styles.panel}>
      <h4 style={styles.heading}>变更记录</h4>
      <ul style={styles.list}>
        {entries.map((entry) => (
          <li key={entry.diffId} style={styles.item}>
            <span style={styles.path}>{entry.path}</span>
            <span
              style={{
                ...styles.badge,
                ...(entry.decision === 'accept' ? styles.accept : styles.reject),
              }}
            >
              {entry.decision === 'accept' ? 'Accepted' : 'Rejected'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: { borderTop: '1px solid #333', background: '#111' },
  heading: { margin: '8px 12px', fontSize: 13, color: '#aaa', fontWeight: 600 },
  list: { listStyle: 'none', margin: 0, padding: '0 12px 12px' },
  item: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 10px',
    marginBottom: 6,
    background: '#1a1a1a',
    borderRadius: 6,
    border: '1px solid #2a2a2a',
    fontSize: 12,
  },
  path: { color: '#9cdcfe', wordBreak: 'break-all' },
  badge: {
    flexShrink: 0,
    marginLeft: 8,
    padding: '2px 8px',
    borderRadius: 10,
    fontSize: 11,
    textTransform: 'uppercase',
  },
  accept: { background: '#173a1f', color: '#6ee787' },
  reject: { background: '#3a1717', color: '#f78686' },
};
