import { createEnvelope, encodeEnvelope } from '@oaw/acp-client';
import {
  configureStdioAcpAgent,
  createAgent,
  isStdioAcpAgent,
  listAgents,
  MockAgentAdapter,
} from '@oaw/agent-registry';
import type { OawDatabase } from '@oaw/db';
import { deriveSessionTitle } from '@oaw/db';
import { applyDiff, readWorkspaceFile } from '@oaw/diff-engine';
import {
  checkPermission,
  createPendingRequestId,
  isAllowDecision,
} from '@oaw/permission-engine';
import type {
  DiffDecisionPayload,
  DiffPayload,
  Envelope,
  PermissionRequestPayload,
  PermissionResponsePayload,
  Session,
  Workspace,
} from '@oaw/shared-types';
import type { WebSocket } from 'ws';

interface PendingPermission {
  requestId: string;
  scope: PermissionRequestPayload['scope'];
  resolve: (decision: PermissionResponsePayload['decision']) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface ActiveSession {
  sessionId: string;
  workspaceId: string;
  agentId: string;
  agent: ReturnType<typeof createAgent>;
  ws: WebSocket;
  agentMessageId: string | null;
  agentText: string;
  decidedDiffs: Set<string>;
}

export class SessionManager {
  private sessions = new Map<string, ActiveSession>();
  private connectionSessions = new Map<WebSocket, Set<string>>();
  private pendingPermissions = new Map<string, PendingPermission>();
  private stdioPermissionTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private permissionRequestScopes = new Map<string, PermissionRequestPayload['scope']>();
  private recordedGrantRequestIds = new Set<string>();
  private readonly permissionTimeoutMs: number;

  constructor(
    private readonly db: OawDatabase,
    permissionTimeoutMs = 60_000,
  ) {
    this.permissionTimeoutMs = permissionTimeoutMs;
  }

  /** 当前内存中保持活跃 Agent 的会话数（用于监控/测试）。 */
  activeSessionCount(): number {
    return this.sessions.size;
  }

  registerConnection(ws: WebSocket): void {
    if (!this.connectionSessions.has(ws)) {
      this.connectionSessions.set(ws, new Set());
    }
  }

  async handleConnectionClosed(ws: WebSocket): Promise<void> {
    const sessionIds = this.connectionSessions.get(ws);
    if (sessionIds) {
      for (const sessionId of sessionIds) {
        await this.detachSession(sessionId);
      }
      this.connectionSessions.delete(ws);
    }
  }

  async handleClientMessage(ws: WebSocket, raw: Envelope): Promise<void> {
    this.registerConnection(ws);

    switch (raw.type) {
      case 'ping':
        this.send(ws, createEnvelope('pong', {}));
        break;
      case 'initialize':
        await this.handleInitialize(ws, raw);
        break;
      case 'session/new':
        await this.handleSessionNew(ws, raw);
        break;
      case 'session/prompt':
        await this.handleSessionPrompt(ws, raw);
        break;
      case 'session/end':
        await this.handleSessionEnd(ws, raw);
        break;
      case 'permission/response':
        await this.handlePermissionResponse(ws, raw);
        this.forwardToSessionAgent(raw);
        break;
      case 'diff/decision':
        await this.handleDiffDecision(raw);
        this.forwardToSessionAgent(raw);
        break;
      default:
        this.sendError(ws, raw.sessionId, 'INVALID_MESSAGE', `Unsupported type: ${raw.type}`);
    }
  }

  private async handleInitialize(ws: WebSocket, raw: Envelope): Promise<void> {
    const defaultAgentId = process.env.DEFAULT_AGENT_ID ?? 'mock-agent';
    const agent = createAgent(defaultAgentId);
    await agent.start();

    const onInitialized = (message: Envelope) => {
      if (message.type === 'initialized') {
        this.send(ws, message);
        agent.onMessage(() => {});
        void agent.stop();
      }
    };
    agent.onMessage(onInitialized);
    agent.send(raw);
  }

  private async handleSessionNew(ws: WebSocket, raw: Envelope): Promise<void> {
    const payload = raw.payload as { workspaceId: string; agentId: string };
    const workspace = this.db.getWorkspace(payload.workspaceId);
    if (!workspace) {
      this.sendError(ws, undefined, 'WORKSPACE_NOT_FOUND', 'workspace not found');
      return;
    }

    const knownAgent = listAgents().some((agent) => agent.id === payload.agentId);
    if (!knownAgent) {
      this.sendError(ws, undefined, 'INVALID_MESSAGE', `Unknown agent: ${payload.agentId}`);
      return;
    }

    let session: Session | undefined;
    try {
      session = this.db.createSession({
        workspaceId: payload.workspaceId,
        agentId: payload.agentId,
      });
      await this.attachAgentToSession(ws, session, workspace);
    } catch (err) {
      if (session) {
        this.db.deleteSession(session.id);
      }
      this.sendError(
        ws,
        undefined,
        'INVALID_MESSAGE',
        err instanceof Error ? err.message : 'failed to start agent',
      );
      return;
    }

    this.send(
      ws,
      createEnvelope('session/created', { sessionId: session.id }, { sessionId: session.id }),
    );
  }

  private async attachAgentToSession(
    ws: WebSocket,
    session: Session,
    workspace: Workspace,
  ): Promise<ActiveSession> {
    const agent = createAgent(session.agentId);
    configureStdioAcpAgent(agent, {
      workspaceRoot: workspace.rootPath,
      oawSessionId: session.id,
    });
    await agent.start();
    agent.onMessage((message) => {
      void this.handleAgentMessage(session.id, message);
    });

    const active: ActiveSession = {
      sessionId: session.id,
      workspaceId: session.workspaceId,
      agentId: session.agentId,
      agent,
      ws,
      agentMessageId: null,
      agentText: '',
      decidedDiffs: new Set(),
    };
    this.sessions.set(session.id, active);
    this.trackSessionOnConnection(ws, session.id);
    await this.enforceSingleActiveSession(ws, session.id);

    agent.send(
      createEnvelope(
        'session/new',
        { workspaceId: session.workspaceId, agentId: session.agentId },
        { sessionId: session.id },
      ),
    );

    return active;
  }

  private async ensureActiveSession(
    ws: WebSocket,
    sessionId: string,
  ): Promise<ActiveSession | null> {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      existing.ws = ws;
      this.trackSessionOnConnection(ws, sessionId);
      await this.enforceSingleActiveSession(ws, sessionId);
      return existing;
    }

    const session = this.db.getSession(sessionId);
    if (!session || session.status !== 'active') return null;

    const workspace = this.db.getWorkspace(session.workspaceId);
    if (!workspace) return null;

    return this.attachAgentToSession(ws, session, workspace);
  }

  private async handleSessionPrompt(ws: WebSocket, raw: Envelope): Promise<void> {
    const sessionId = raw.sessionId;
    if (!sessionId) return;

    const active = await this.ensureActiveSession(ws, sessionId);
    if (!active) {
      this.sendError(ws, sessionId, 'SESSION_NOT_FOUND', 'session not found or ended');
      return;
    }

    const prompt = raw.payload as { text: string };
    const session = this.db.getSession(sessionId);
    if (session && !session.title) {
      this.db.updateSessionTitle(sessionId, deriveSessionTitle(prompt.text));
    }
    this.db.createMessage({ sessionId, role: 'user', content: prompt.text });

    const agentMessage = this.db.createMessage({
      sessionId,
      role: 'agent',
      content: '',
    });
    active.agentMessageId = agentMessage.id;
    active.agentText = '';

    active.agent.send(raw);
  }

  private async handleSessionEnd(ws: WebSocket, raw: Envelope): Promise<void> {
    const sessionId = raw.sessionId;
    if (!sessionId) return;

    await this.detachSession(sessionId);
    this.db.endSession(sessionId);
    this.send(
      ws,
      createEnvelope('session/ended', { sessionId, reason: 'ended' }, { sessionId }),
    );
  }

  private async handlePermissionResponse(ws: WebSocket, raw: Envelope): Promise<void> {
    const payload = raw.payload as PermissionResponsePayload;
    const sessionId = raw.sessionId;
    const scope = this.permissionRequestScopes.get(payload.requestId);

    this.clearStdioPermissionTimer(payload.requestId);

    const pending = this.pendingPermissions.get(payload.requestId);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingPermissions.delete(payload.requestId);
      this.permissionRequestScopes.delete(payload.requestId);
      pending.resolve(payload.decision);
      return;
    }

    if (sessionId && scope) {
      this.recordPermissionGrant(payload.requestId, {
        sessionId,
        scope,
        decision: payload.decision,
      });
      this.permissionRequestScopes.delete(payload.requestId);
    }
  }

  /**
   * 按 requestId 去重写入授权记录，避免「超时拒绝 + 迟到的用户响应」或重复响应
   * 在 permission_grants 中产生重复行。
   */
  private recordPermissionGrant(
    requestId: string,
    input: {
      sessionId: string;
      scope: PermissionRequestPayload['scope'];
      decision: PermissionResponsePayload['decision'];
      detail?: string;
    },
  ): void {
    if (this.recordedGrantRequestIds.has(requestId)) return;
    this.recordedGrantRequestIds.add(requestId);
    this.db.createPermissionGrant(input);
  }

  private async handleDiffDecision(raw: Envelope): Promise<void> {
    const sessionId = raw.sessionId;
    if (!sessionId) return;

    const payload = raw.payload as DiffDecisionPayload;
    const diff = this.db.getDiff(payload.diffId);
    if (!diff || diff.sessionId !== sessionId || diff.decision !== 'pending') return;

    const active = this.sessions.get(sessionId);
    if (active?.decidedDiffs.has(payload.diffId)) return;
    active?.decidedDiffs.add(payload.diffId);

    const session = this.db.getSession(sessionId);
    if (!session) return;

    const workspace = this.db.getWorkspace(session.workspaceId);
    if (!workspace) return;

    const decided = this.db.decideDiff(payload.diffId, payload.decision);
    if (!decided) return;

    if (payload.decision === 'accept') {
      await applyDiff(workspace.rootPath, {
        path: diff.path,
        after: diff.afterText,
      });
    }
  }

  private async handleAgentMessage(sessionId: string, message: Envelope): Promise<void> {
    const active = this.sessions.get(sessionId);
    if (!active) return;

    const ws = active.ws;

    if (message.type === 'permission/request') {
      const payload = message.payload as PermissionRequestPayload;
      this.permissionRequestScopes.set(payload.requestId, payload.scope);

      if (isStdioAcpAgent(active.agent)) {
        const grants = this.db.listPermissionGrants(sessionId);
        if (checkPermission(grants, payload.scope).allowed) {
          active.agent.send(
            createEnvelope(
              'permission/response',
              { requestId: payload.requestId, decision: 'allow_session' },
              { sessionId },
            ),
          );
          return;
        }

        await this.persistAgentEvent(sessionId, message);
        this.send(ws, { ...message, sessionId });
        this.scheduleStdioPermissionTimeout(ws, sessionId, payload.requestId);
        return;
      }

      const allowed = await this.interceptPermission(ws, sessionId, message);
      if (!allowed) return;
      await this.continueAfterPermission(sessionId, message);
      return;
    }

    const outbound = await this.prepareOutboundMessage(sessionId, message);
    await this.persistAgentEvent(sessionId, outbound);
    this.send(ws, { ...outbound, sessionId });
  }

  private async prepareOutboundMessage(sessionId: string, message: Envelope): Promise<Envelope> {
    if (message.type !== 'diff') return message;

    const active = this.sessions.get(sessionId);
    if (!active) return message;

    const workspace = this.db.getWorkspace(active.workspaceId);
    if (!workspace) return message;

    const payload = message.payload as DiffPayload;
    const before = await readWorkspaceFile(workspace.rootPath, payload.path);
    return {
      ...message,
      payload: { ...payload, before },
    };
  }

  private async interceptPermission(
    ws: WebSocket,
    sessionId: string,
    message: Envelope,
  ): Promise<boolean> {
    const payload = message.payload as PermissionRequestPayload;
    const grants = this.db.listPermissionGrants(sessionId);
    const check = checkPermission(grants, payload.scope);

    if (check.allowed) {
      return true;
    }

    const requestId = payload.requestId || createPendingRequestId();
    this.send(
      ws,
      createEnvelope('permission/request', { ...payload, requestId }, { sessionId }),
    );

    const decision = await new Promise<PermissionResponsePayload['decision']>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingPermissions.delete(requestId);
        this.permissionRequestScopes.delete(requestId);
        resolve('reject');
      }, this.permissionTimeoutMs);

      this.pendingPermissions.set(requestId, {
        requestId,
        scope: payload.scope,
        resolve,
        timer,
      });
    });

    this.recordPermissionGrant(requestId, {
      sessionId,
      scope: payload.scope,
      decision,
      detail: payload.detail,
    });

    if (!isAllowDecision(decision)) {
      const active = this.sessions.get(sessionId);
      if (active?.agent instanceof MockAgentAdapter) {
        active.agent.cancelPendingEdit();
      }
      this.sendError(ws, sessionId, 'PERMISSION_DENIED', 'Permission rejected or timed out');
      return false;
    }

    return true;
  }

  private scheduleStdioPermissionTimeout(
    ws: WebSocket,
    sessionId: string,
    requestId: string,
  ): void {
    this.clearStdioPermissionTimer(requestId);

    const timer = setTimeout(() => {
      this.stdioPermissionTimers.delete(requestId);
      this.permissionRequestScopes.delete(requestId);

      const active = this.sessions.get(sessionId);
      if (active && isStdioAcpAgent(active.agent)) {
        active.agent.send(
          createEnvelope('permission/response', { requestId, decision: 'reject' }, { sessionId }),
        );
      }

      this.sendError(ws, sessionId, 'PERMISSION_DENIED', 'Permission timed out');
    }, this.permissionTimeoutMs);

    this.stdioPermissionTimers.set(requestId, timer);
  }

  private clearStdioPermissionTimer(requestId: string): void {
    const timer = this.stdioPermissionTimers.get(requestId);
    if (timer) {
      clearTimeout(timer);
      this.stdioPermissionTimers.delete(requestId);
    }
  }

  private async continueAfterPermission(
    sessionId: string,
    message: Envelope,
  ): Promise<void> {
    const active = this.sessions.get(sessionId);
    if (!active || !(active.agent instanceof MockAgentAdapter)) return;

    const workspace = this.db.getWorkspace(active.workspaceId);
    if (!workspace) return;

    const payload = message.payload as PermissionRequestPayload;
    const targetPath = payload.detail.match(/修改文件: (.+)/)?.[1] ?? 'README.md';
    const before = await readWorkspaceFile(workspace.rootPath, targetPath);
    const after = active.agent.buildAfterContent(before);
    await active.agent.completePendingEdit(after);
  }

  private async persistAgentEvent(sessionId: string, message: Envelope): Promise<void> {
    const active = this.sessions.get(sessionId);
    if (!active?.agentMessageId) return;

    if (message.type === 'session/update') {
      const payload = message.payload as { kind: string; delta?: string };
      if (payload.kind === 'text' && payload.delta) {
        active.agentText += payload.delta;
        this.db.updateMessageContent(active.agentMessageId, active.agentText);
      }
      if (payload.kind === 'done') {
        this.db.updateMessageContent(active.agentMessageId, active.agentText);
      }
    }

    if (message.type === 'tool/call') {
      const toolCall = message.payload as {
        toolCallId: string;
        tool: 'edit_file';
        input: Record<string, unknown>;
        status: 'pending' | 'running' | 'success' | 'error';
        result?: string;
      };
      this.db.upsertToolCall({
        id: toolCall.toolCallId,
        messageId: active.agentMessageId,
        tool: toolCall.tool,
        input: toolCall.input,
        status: toolCall.status,
        result: toolCall.result,
      });
    }

    if (message.type === 'diff') {
      const diff = message.payload as DiffPayload;
      const existing = this.db.getDiff(diff.diffId);
      if (!existing) {
        this.db.createDiff({
          id: diff.diffId,
          sessionId,
          toolCallId: diff.toolCallId,
          path: diff.path,
          beforeText: diff.before,
          afterText: diff.after,
        });
      }
    }
  }

  private trackSessionOnConnection(ws: WebSocket, sessionId: string): void {
    this.registerConnection(ws);
    this.connectionSessions.get(ws)!.add(sessionId);
  }

  /**
   * 保证同一个浏览器连接同时只有一个活跃 Agent：当一个会话被挂载/激活时，
   * 停止该连接上其它会话的 Agent 进程（仅停进程，DB 会话状态保持 active 以便后续恢复），
   * 避免切换/新建会话造成 Agent 子进程堆积泄漏。
   */
  private async enforceSingleActiveSession(ws: WebSocket, keepSessionId: string): Promise<void> {
    const sessionIds = this.connectionSessions.get(ws);
    if (!sessionIds) return;
    const others = [...sessionIds].filter((id) => id !== keepSessionId);
    for (const id of others) {
      await this.detachSession(id);
    }
  }

  private async detachSession(sessionId: string): Promise<void> {
    const active = this.sessions.get(sessionId);
    if (!active) return;

    await active.agent.stop();
    this.sessions.delete(sessionId);

    for (const [ws, sessionIds] of this.connectionSessions) {
      sessionIds.delete(sessionId);
      if (sessionIds.size === 0) {
        this.connectionSessions.delete(ws);
      }
    }
  }

  private send(ws: WebSocket, envelope: Envelope): void {
    if (ws.readyState === ws.OPEN) {
      ws.send(encodeEnvelope(envelope));
    }
  }

  private forwardToSessionAgent(raw: Envelope): void {
    const sessionId = raw.sessionId;
    if (!sessionId) return;
    const active = this.sessions.get(sessionId);
    if (!active || !isStdioAcpAgent(active.agent)) return;
    active.agent.send(raw);
  }

  private sendError(
    ws: WebSocket,
    sessionId: string | undefined,
    code: 'INVALID_MESSAGE' | 'SESSION_NOT_FOUND' | 'WORKSPACE_NOT_FOUND' | 'PERMISSION_DENIED',
    message: string,
  ): void {
    this.send(ws, createEnvelope('error', { code, message }, { sessionId }));
  }
}
