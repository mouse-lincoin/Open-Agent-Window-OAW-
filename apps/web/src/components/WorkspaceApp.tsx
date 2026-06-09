'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createEnvelope } from '@oaw/acp-client';
import type { AgentInfo, FileNode, Session, Workspace } from '@oaw/shared-types';
import { filterFileTree } from '@/lib/file-tree-utils';
import { api } from '@/lib/api';
import { WsClient } from '@/lib/ws-client';
import { useChatStore } from '@/store/chat-store';
import { ChatPanel } from './ChatPanel';
import { DiffViewer } from './DiffViewer';
import { FileTree } from './FileTree';
import { FileViewer } from './FileViewer';
import { PermissionDialog } from './PermissionDialog';
import { SessionList } from './SessionList';
import { ToolTimeline } from './ToolTimeline';

export function WorkspaceApp() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [fileSearch, setFileSearch] = useState('');
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [fileLoading, setFileLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState('mock-agent');
  const wsRef = useRef<WsClient | null>(null);

  const sessionId = useChatStore((s) => s.sessionId);
  const pendingPermission = useChatStore((s) => s.pendingPermission);
  const pendingDiff = useChatStore((s) => s.pendingDiff);
  const toolTimeline = useChatStore((s) => s.toolTimeline);
  const setSessionId = useChatStore((s) => s.setSessionId);
  const addUserMessage = useChatStore((s) => s.addUserMessage);
  const appendStream = useChatStore((s) => s.appendStream);
  const finalizeStream = useChatStore((s) => s.finalizeStream);
  const upsertToolCall = useChatStore((s) => s.upsertToolCall);
  const loadHistory = useChatStore((s) => s.loadHistory);
  const setPendingPermission = useChatStore((s) => s.setPendingPermission);
  const setPendingDiff = useChatStore((s) => s.setPendingDiff);
  const reset = useChatStore((s) => s.reset);

  const filteredTree = useMemo(
    () => filterFileTree(fileTree, fileSearch),
    [fileTree, fileSearch],
  );

  const refreshWorkspaces = useCallback(async () => {
    const { workspaces: list } = await api.listWorkspaces();
    setWorkspaces(list);
  }, []);

  const refreshSessions = useCallback(async (wsId: string) => {
    const { sessions: list } = await api.listSessions(wsId);
    setSessions(list);
  }, []);

  const refreshFileTree = useCallback(async (wsId: string) => {
    const { tree } = await api.getFileTree(wsId);
    setFileTree(tree);
  }, []);

  useEffect(() => {
    void refreshWorkspaces();
    void api.listAgents().then((res) => {
      setAgents(res.agents);
      if (res.agents.length > 0) {
        setSelectedAgentId((current) =>
          res.agents.some((agent) => agent.id === current) ? current : res.agents[0]!.id,
        );
      }
    });
  }, [refreshWorkspaces]);

  useEffect(() => {
    if (!workspaceId) return;
    void refreshSessions(workspaceId);
    void refreshFileTree(workspaceId);
  }, [workspaceId, refreshSessions, refreshFileTree]);

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
          if (workspaceId) void refreshSessions(workspaceId);
          break;
        }
        case 'session/update': {
          const payload = envelope.payload as { kind: string; delta?: string };
          if (payload.kind === 'text' && payload.delta) appendStream(payload.delta);
          if (payload.kind === 'done') finalizeStream();
          break;
        }
        case 'tool/call': {
          const payload = envelope.payload as {
            toolCallId: string;
            tool: 'read_file' | 'edit_file' | 'run_command' | 'search';
            input: Record<string, unknown>;
            status: 'pending' | 'running' | 'success' | 'error';
            result?: string;
          };
          upsertToolCall(payload);
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
    upsertToolCall,
    workspaceId,
    refreshSessions,
  ]);

  useEffect(() => {
    if (!workspaceId || !selectedFilePath) return;
    setFileLoading(true);
    void api
      .getFileContent(workspaceId, selectedFilePath)
      .then((res) => setFileContent(res.content))
      .catch(() => setFileContent(''))
      .finally(() => setFileLoading(false));
  }, [workspaceId, selectedFilePath, pendingDiff]);

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
    setSelectedFilePath(null);
    wsRef.current.sendRaw(
      createEnvelope('session/new', { workspaceId, agentId: selectedAgentId }),
    );
  };

  const handleSelectSession = async (id: string) => {
    setSessionId(id);
    setSelectedFilePath(null);
    const { messages } = await api.getMessages(id);
    loadHistory(messages);
  };

  const handleSend = (text: string) => {
    if (!sessionId || !wsRef.current) return;
    const isFirstMessage = useChatStore.getState().messages.length === 0;
    addUserMessage(text);
    wsRef.current.sendRaw(
      createEnvelope('session/prompt', { text }, { sessionId }),
    );
    if (isFirstMessage && workspaceId) {
      window.setTimeout(() => void refreshSessions(workspaceId), 400);
    }
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
      void refreshFileTree(workspaceId);
      if (selectedFilePath) {
        void api.getFileContent(workspaceId, selectedFilePath).then((res) => {
          setFileContent(res.content);
        });
      }
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
                onClick={() => {
                  setWorkspaceId(w.id);
                  reset();
                  setSelectedFilePath(null);
                }}
              >
                {w.name}
              </button>
            </li>
          ))}
        </ul>
        {workspaceId && (
          <>
            <div style={styles.section}>
              <label style={styles.label}>
                Agent
                <select
                  value={selectedAgentId}
                  onChange={(e) => setSelectedAgentId(e.target.value)}
                  style={styles.select}
                >
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={handleNewSession} disabled={!ready}>
                新建会话
              </button>
            </div>
            <div style={styles.sectionHeader}>历史会话</div>
            <SessionList
              sessions={sessions}
              activeSessionId={sessionId}
              onSelect={(id) => void handleSelectSession(id)}
            />
            <div style={styles.sectionHeader}>文件</div>
            <FileTree
              tree={filteredTree}
              selectedPath={selectedFilePath}
              searchQuery={fileSearch}
              onSearchChange={setFileSearch}
              onSelectFile={setSelectedFilePath}
            />
          </>
        )}
      </aside>
      <main style={styles.main}>
        <div style={styles.contentRow}>
          <div style={styles.chatColumn}>
            <ChatPanel onSend={handleSend} disabled={!sessionId || !ready} />
            {pendingDiff && <DiffViewer diff={pendingDiff} onDecision={handleDiffDecision} />}
          </div>
          <FileViewer path={selectedFilePath} content={fileContent} loading={fileLoading} />
        </div>
        <ToolTimeline entries={toolTimeline} />
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
    width: 300,
    borderRight: '1px solid #333',
    display: 'flex',
    flexDirection: 'column',
    background: '#141414',
    minHeight: 0,
  },
  sidebarHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottom: '1px solid #333',
    flexShrink: 0,
  },
  workspaceList: { listStyle: 'none', margin: 0, padding: 8, flexShrink: 0 },
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
  section: { padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 },
  sectionHeader: {
    padding: '8px 12px 4px',
    fontSize: 11,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    flexShrink: 0,
  },
  label: { fontSize: 12, color: '#999' },
  select: {
    display: 'block',
    width: '100%',
    marginTop: 4,
    padding: '6px 8px',
    background: '#1a1a1a',
    color: '#eee',
    border: '1px solid #444',
    borderRadius: 6,
  },
  main: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 },
  contentRow: { flex: 1, display: 'flex', minHeight: 0 },
  chatColumn: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, borderRight: '1px solid #333' },
};
