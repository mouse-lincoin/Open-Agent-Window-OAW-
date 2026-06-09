/**
 * ACP 协议契约类型。
 * 与 docs/ACP_PROTOCOL.md 保持一致，是浏览器 ↔ Gateway ↔ Agent 三方的权威定义。
 */

/** 当前 OAW 采用的 ACP 子集版本。 */
export const PROTOCOL_VERSION = '0.1';

export type MessageType =
  | 'initialize'
  | 'initialized'
  | 'session/new'
  | 'session/created'
  | 'session/prompt'
  | 'session/update'
  | 'session/end'
  | 'session/ended'
  | 'tool/call'
  | 'permission/request'
  | 'permission/response'
  | 'diff'
  | 'diff/decision'
  | 'ping'
  | 'pong'
  | 'error';

/** 浏览器与 Gateway 之间所有消息的统一信封。 */
export interface Envelope<T = unknown> {
  id: string;
  type: MessageType;
  sessionId?: string;
  ts: number;
  payload: T;
}

// ---------- 握手 ----------

export interface InitializePayload {
  clientName: string;
  clientVersion: string;
  protocolVersion: string;
}

export interface AgentCapabilities {
  streaming: boolean;
  tools: ToolName[];
  diff: boolean;
}

export interface InitializedPayload {
  agentName: string;
  capabilities: AgentCapabilities;
}

// ---------- 会话 ----------

export interface SessionNewPayload {
  workspaceId: string;
  agentId: string;
}

export interface SessionCreatedPayload {
  sessionId: string;
}

export interface PromptPayload {
  text: string;
  attachments?: { path: string }[];
}

export interface SessionEndPayload {
  sessionId: string;
}

export interface SessionEndedPayload {
  sessionId: string;
  reason: string;
}

// ---------- 流式更新 ----------

export type UpdatePayload =
  | { kind: 'text'; delta: string }
  | { kind: 'tool_call'; toolCall: ToolCallPayload }
  | { kind: 'tool_result'; toolCallId: string; result: string }
  | { kind: 'thinking'; delta: string }
  | { kind: 'done'; messageId: string };

// ---------- 工具调用 ----------

export type ToolName = 'read_file' | 'edit_file' | 'run_command' | 'search';

export type ToolCallStatus = 'pending' | 'running' | 'success' | 'error';

export interface ToolCallPayload {
  toolCallId: string;
  tool: ToolName;
  input: Record<string, unknown>;
  status: ToolCallStatus;
}

// ---------- 权限 ----------

export type PermissionScope =
  | 'file_write'
  | 'terminal_execute'
  | 'git_push'
  | 'system_access';

export type PermissionDecision = 'allow_once' | 'allow_session' | 'reject';

export interface PermissionRequestPayload {
  requestId: string;
  scope: PermissionScope;
  detail: string;
  toolCallId?: string;
}

export interface PermissionResponsePayload {
  requestId: string;
  decision: PermissionDecision;
}

// ---------- Diff ----------

export type DiffDecision = 'accept' | 'reject';

export interface DiffPayload {
  diffId: string;
  path: string;
  before: string;
  after: string;
  toolCallId?: string;
}

export interface DiffDecisionPayload {
  diffId: string;
  decision: DiffDecision;
}

// ---------- 错误 ----------

export type ErrorCode =
  | 'AGENT_SPAWN_FAILED'
  | 'AGENT_CRASHED'
  | 'SESSION_NOT_FOUND'
  | 'WORKSPACE_NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'INVALID_MESSAGE'
  | 'INTERNAL';

export interface ErrorPayload {
  code: ErrorCode;
  message: string;
  detail?: unknown;
}
