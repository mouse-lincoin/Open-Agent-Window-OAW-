'use client';

import type { TimelineEntry } from '@/store/chat-store';

interface Props {
  entries: TimelineEntry[];
}

const TOOL_LABELS: Record<TimelineEntry['tool'], string> = {
  read_file: 'Read File',
  edit_file: 'Edit File',
  run_command: 'Run Command',
  search: 'Search',
};

export function ToolTimeline({ entries }: Props) {
  if (entries.length === 0) {
    return (
      <div style={styles.empty}>
        <p style={{ margin: 0, fontSize: 12, color: '#666' }}>暂无工具调用</p>
      </div>
    );
  }

  return (
    <div style={styles.panel}>
      <h4 style={styles.heading}>工具时间线</h4>
      <ul style={styles.list}>
        {entries.map((entry) => (
          <li key={entry.id} style={styles.item}>
            <div style={styles.row}>
              <strong>{TOOL_LABELS[entry.tool]}</strong>
              <span style={styles.status}>{entry.status}</span>
            </div>
            <pre style={styles.input}>{formatInput(entry.input)}</pre>
            {entry.result && <pre style={styles.result}>{entry.result}</pre>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatInput(input: Record<string, unknown>): string {
  const path = input.path;
  if (typeof path === 'string') return path;
  const title = input.title;
  if (typeof title === 'string') return title;
  return JSON.stringify(input, null, 2);
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    borderTop: '1px solid #333',
    background: '#111',
    maxHeight: 220,
    overflow: 'auto',
  },
  heading: { margin: '8px 12px', fontSize: 13, color: '#aaa', fontWeight: 600 },
  empty: { padding: 12, borderTop: '1px solid #333' },
  list: { listStyle: 'none', margin: 0, padding: '0 12px 12px' },
  item: {
    padding: '8px 10px',
    marginBottom: 6,
    background: '#1a1a1a',
    borderRadius: 6,
    border: '1px solid #2a2a2a',
  },
  row: { display: 'flex', justifyContent: 'space-between', fontSize: 12 },
  status: { color: '#888', textTransform: 'uppercase', fontSize: 11 },
  input: {
    margin: '6px 0 0',
    fontSize: 11,
    color: '#9cdcfe',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
  },
  result: {
    margin: '4px 0 0',
    fontSize: 11,
    color: '#888',
    whiteSpace: 'pre-wrap',
  },
};
