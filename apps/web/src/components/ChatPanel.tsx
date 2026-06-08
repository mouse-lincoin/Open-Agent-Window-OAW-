'use client';

import { useChatStore } from '@/store/chat-store';

interface Props {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export function ChatPanel({ onSend, disabled }: Props) {
  const messages = useChatStore((s) => s.messages);
  const streamingText = useChatStore((s) => s.streamingText);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const input = form.elements.namedItem('prompt') as HTMLInputElement;
    const text = input.value.trim();
    if (!text) return;
    onSend(text);
    input.value = '';
  };

  return (
    <div style={styles.container}>
      <div style={styles.messages}>
        {messages.map((m) => (
          <div key={m.id} style={m.role === 'user' ? styles.user : styles.agent}>
            <strong>{m.role === 'user' ? '你' : 'Agent'}</strong>
            <p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{m.content}</p>
          </div>
        ))}
        {streamingText && (
          <div style={styles.agent}>
            <strong>Agent</strong>
            <p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{streamingText}</p>
          </div>
        )}
      </div>
      <form onSubmit={handleSubmit} style={styles.form}>
        <input
          name="prompt"
          placeholder="输入 prompt…"
          disabled={disabled}
          style={styles.input}
        />
        <button type="submit" disabled={disabled}>
          发送
        </button>
      </form>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%' },
  messages: { flex: 1, overflow: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 },
  user: { alignSelf: 'flex-end', background: '#2b5278', padding: 10, borderRadius: 8, maxWidth: '80%' },
  agent: { alignSelf: 'flex-start', background: '#2a2a2a', padding: 10, borderRadius: 8, maxWidth: '80%' },
  form: { display: 'flex', gap: 8, padding: 12, borderTop: '1px solid #333' },
  input: { flex: 1, padding: '8px 12px', borderRadius: 6, border: '1px solid #444', background: '#1a1a1a', color: '#fff' },
};
