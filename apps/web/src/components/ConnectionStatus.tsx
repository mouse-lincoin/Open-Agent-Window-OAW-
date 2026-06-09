'use client';

import type { WsConnectionState } from '@/lib/ws-client';

interface Props {
  state: WsConnectionState;
}

const LABELS: Record<WsConnectionState, string> = {
  connecting: '连接中…',
  connected: '已连接',
  reconnecting: '重连中…',
  disconnected: '已断开',
};

const COLORS: Record<WsConnectionState, string> = {
  connecting: '#aa8',
  connected: '#6c6',
  reconnecting: '#ca6',
  disconnected: '#c66',
};

export function ConnectionStatus({ state }: Props) {
  return (
    <span style={styles.wrap} title={LABELS[state]}>
      <span style={{ ...styles.dot, background: COLORS[state] }} />
      <span style={styles.label}>{LABELS[state]}</span>
    </span>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#888' },
  dot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  label: { whiteSpace: 'nowrap' },
};
