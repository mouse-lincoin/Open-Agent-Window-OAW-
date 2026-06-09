'use client';

interface Props {
  message: string | null;
  onDismiss: () => void;
}

export function Toast({ message, onDismiss }: Props) {
  if (!message) return null;

  return (
    <div style={styles.container} role="status">
      <span style={styles.text}>{message}</span>
      <button type="button" style={styles.dismiss} onClick={onDismiss} aria-label="关闭">
        ×
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed',
    bottom: 24,
    right: 24,
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    maxWidth: 420,
    padding: '10px 14px',
    background: '#2a1515',
    border: '1px solid #633',
    borderRadius: 8,
    color: '#fcc',
    fontSize: 13,
    boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
  },
  text: { flex: 1, lineHeight: 1.4 },
  dismiss: {
    background: 'transparent',
    border: 'none',
    color: '#faa',
    fontSize: 18,
    cursor: 'pointer',
    padding: 0,
    lineHeight: 1,
  },
};
