'use client';

import type { PermissionRequestPayload } from '@oaw/shared-types';

interface Props {
  request: PermissionRequestPayload;
  onDecision: (decision: 'allow_once' | 'allow_session' | 'reject') => void;
}

export function PermissionDialog({ request, onDecision }: Props) {
  return (
    <div style={styles.overlay}>
      <div style={styles.dialog}>
        <h3>权限请求</h3>
        <p>
          <strong>{request.scope}</strong>
        </p>
        <p>{request.detail}</p>
        <div style={styles.actions}>
          <button type="button" onClick={() => onDecision('allow_once')}>
            Allow Once
          </button>
          <button type="button" onClick={() => onDecision('allow_session')}>
            Allow Session
          </button>
          <button type="button" onClick={() => onDecision('reject')}>
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  dialog: {
    background: '#1e1e1e',
    color: '#fff',
    padding: 24,
    borderRadius: 8,
    minWidth: 360,
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  },
  actions: {
    display: 'flex',
    gap: 8,
    marginTop: 16,
    flexWrap: 'wrap',
  },
};
