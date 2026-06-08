/**
 * HTTP REST 接口的请求/响应类型。
 * 与 docs/API.md 保持一致。
 */

import type { AgentCapabilities } from './protocol.js';
import type { Message, Session, ToolCall, Workspace } from './entities.js';

// ---------- Workspace ----------

export interface CreateWorkspaceRequest {
  name: string;
  rootPath: string;
}

export type FileNode =
  | { type: 'file'; name: string; path: string }
  | { type: 'dir'; name: string; path: string; children: FileNode[] };

export interface FileTreeResponse {
  tree: FileNode[];
}

export interface FileContentResponse {
  path: string;
  content: string;
}

// ---------- Session ----------

export interface MessageWithToolCalls extends Message {
  toolCalls?: ToolCall[];
}

export interface SessionMessagesResponse {
  messages: MessageWithToolCalls[];
}

export interface WorkspaceSessionsResponse {
  sessions: Session[];
}

export interface WorkspacesResponse {
  workspaces: Workspace[];
}

// ---------- Agent ----------

export interface AgentInfo {
  id: string;
  name: string;
  capabilities: AgentCapabilities;
}

export interface AgentsResponse {
  agents: AgentInfo[];
}

// ---------- 错误 ----------

import type { ErrorCode } from './protocol.js';

export interface ApiError {
  error: {
    code: ErrorCode;
    message: string;
    detail?: unknown;
  };
}
