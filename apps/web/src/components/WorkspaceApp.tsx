'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createEnvelope } from '@oaw/acp-client';
import type { FileNode, Workspace } from '@oaw/shared-types';
import { api } from '@/lib/api';
import { WsClient } from '@/lib/ws-client';
import { useChatStore } from '@/store/chat-store';
import { ChatPanel } from './ChatPanel';
import { DiffViewer } from './DiffViewer';
import { FileTree } from './FileTree';
import { PermissionDialog } from './PermissionDialog';

export function WorkspaceApp() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [ready, setReady] = useState(false);
  const wsRef = useRef<WsClient | null>(null);

  const sessionId = useChatStore((s) => s.sessionId);
  const pendingPermission = useChatStore((s) => s.pendingPermission);
  const pendingDiff = useChatStore((s) => s.pendingDiff);
  const setSessionId = useChatStore((s) => s.setSessionId);
  const addUserMessage = useChatStore((s) => s.addUserMessage);
  const appendStream = useChatStore((s) => s.appendStream);
  const finalizeStream = useChatStore((s) => s.finalizeStream);
  const setPendingPermission = useChatStore((s) => s.setPendingPermission);
  const setPendingDiff = useChatStore((s) => s.setPendingDiff);
  const reset = useChatStore((s) => s.reset);

  const refreshWorkspaces = useCallback(async () => {
    const { workspaces: list } = await api.listWorkspaces();
    setWorkspaces(list);
  }, []);

  useEffect(() => {
    void refreshWorkspaces();
  }, [refreshWorkspaces]);

  useEffect(() => {
    const ws = new WsClient();
    wsRef.current = ws;

    const unsubscribe = ws.onMessage((envelope) => {
      switch (envelope.type) {
        case 'initialized':
          setReady(true);
          break;
        case 'session/created': {
          const payload = envelope.payload as { sessionId: string };
          setSessionId(payload.sessionId);
          break;
        }
        case 'session/update': {
          const payload = envelope.payload as { kind: string; delta?: string };
          if (payload.kind === 'text' && payload.delta) appendStream(payload.delta);
          if (payload.kind === 'done') finalizeStream();
          break;
        }
        case 'permission/request':
          setPendingPermission(envelope.payload as Parameters<typeof setPendingPermission>[0]);
          break;
        case 'diff':
          finalizeStream();
          setPendingDiff(envelope.payload as Parameters<typeof setPendingDiff>[0]);
          break;
        case 'error': {
          const payload = envelope.payload as { message: string };
          console.error(payload.message);
          break;
        }
        default:
          break;
      }
    });

    void ws.connect().catch(console.error);

    return () => {
      unsubscribe();
      ws.close();
    };
  }, [
    appendStream,
    finalizeStream,
    setPendingDiff,
    setPendingPermission,
    setSessionId,
  ]);

  useEffect(() => {
    if (!workspaceId) return;
    void api.getFileTree(workspaceId).then((res) => setFileTree(res.tree));
  }, [workspaceId, pendingDiff]);

  const handleCreateWorkspace = async () => {
    const name = prompt('Workspace 名称', 'demo');
    const rootPath = prompt('本地目录绝对路径', '/workspace');
    if (!name || !rootPath) return;
    const ws = await api.createWorkspace({ name, rootPath });
    await refreshWorkspaces();
    setWorkspaceId(ws.id);
  };

  const handleNewSession = () => {
    if (!workspaceId || !wsRef.current) return;
    reset();
    wsRef.current.sendRaw(
      createEnvelope('session/new', { workspaceId, agentId: 'mock-agent' }),
    );
  };

  const handleSend = (text: string) => {
    if (!sessionId || !wsRef.current) return;
    addUserMessage(text);
    wsRef.current.sendRaw(
      createEnvelope('session/prompt', { text }, { sessionId }),
    );
  };

  const handlePermission = (decision: 'allow_once' | 'allow_session' | 'reject') => {
    if (!pendingPermission || !sessionId || !wsRef.current) return;
    wsRef.current.sendRaw(
      createEnvelope(
        'permission/response',
        { requestId: pendingPermission.requestId, decision },
        { sessionId },
      ),
    );
    setPendingPermission(null);
  };

  const handleDiffDecision = (decision: 'accept' | 'reject') => {
    if (!pendingDiff || !sessionId || !wsRef.current) return;
    wsRef.current.sendRaw(
      createEnvelope('diff/decision', { diffId: pendingDiff.diffId, decision }, { sessionId }),
    );
    setPendingDiff(null);
    if (workspaceId) {
      void api.getFileTree(workspaceId).then((res) => setFileTree(res.tree));
    }
  };

  return (
    <div style={styles.layout}>
      <aside style={styles.sidebar}>
        <header style={styles.sidebarHeader}>
          <h2 style={{ margin: 0, fontSize: 16 }}>OAW</h2>
          <button type="button" onClick={() => void handleCreateWorkspace()}>
            + Workspace
          </button>
        </header>
        <ul style={styles.workspaceList}>
          {workspaces.map((w) => (
            <li key={w.id}>
              <button
                type="button"
                style={{
                  ...styles.workspaceBtn,
                  ...(workspaceId === w.id ? styles.workspaceActive : {}),
                }}
                onClick={() => setWorkspaceId(w.id)}
              >
                {w.name}
              </button>
            </li>
          ))}
        </ul>
        {workspaceId && (
          <>
            <button type="button" onClick={handleNewSession} disabled={!ready} style={{ margin: 8 }}>
              新建会话
            </button>
            <FileTree tree={fileTree} />
          </>
        )}
      </aside>
      <main style={styles.main}>
        <ChatPanel onSend={handleSend} disabled={!sessionId || !ready} />
        {pendingDiff && <DiffViewer diff={pendingDiff} onDecision={handleDiffDecision} />}
      </main>
      {pendingPermission && (
        <PermissionDialog request={pendingPermission} onDecision={handlePermission} />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  layout: { display: 'flex', height: '100vh', background: '#0d0d0d', color: '#eee' },
  sidebar: {
    width: 280,
    borderRight: '1px solid #333',
    display: 'flex',
    flexDirection: 'column',
    background: '#141414',
  },
  sidebarHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottom: '1px solid #333',
  },
  workspaceList: { listStyle: 'none', margin: 0, padding: 8 },
  workspaceBtn: {
    width: '100%',
    textAlign: 'left',
    padding: '8px 10px',
    background: 'transparent',
    border: 'none',
    color: '#ccc',
    borderRadius: 6,
    cursor: 'pointer',
  },
  workspaceActive: { background: '#2a2a2a', color: '#fff' },
  main: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 },
};
