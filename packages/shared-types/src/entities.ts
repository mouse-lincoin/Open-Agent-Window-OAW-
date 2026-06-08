/**
 * 持久化实体类型。
 * 与 docs/DATA_MODEL.md 的 SQLite 表结构一一对应。
 * 时间字段为 Unix 毫秒；ID 为 UUID v4。
 */

import type {
  DiffDecision,
  PermissionDecision,
  PermissionScope,
  ToolCallStatus,
  ToolName,
} from './protocol.js';

export interface Workspace {
  id: string;
  name: string;
  rootPath: string;
  createdAt: number;
  updatedAt: number;
}

export type SessionStatus = 'active' | 'ended' | 'error';

export interface Session {
  id: string;
  workspaceId: string;
  agentId: string;
  title?: string;
  status: SessionStatus;
  createdAt: number;
  endedAt?: number;
}

export type MessageRole = 'user' | 'agent' | 'system';

export interface Message {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  createdAt: number;
}

export interface ToolCall {
  id: string;
  messageId: string;
  tool: ToolName;
  input: Record<string, unknown>;
  result?: string;
  status: ToolCallStatus;
  createdAt: number;
  updatedAt: number;
}

export interface Diff {
  id: string;
  sessionId: string;
  toolCallId?: string;
  path: string;
  beforeText: string;
  afterText: string;
  decision: 'pending' | DiffDecision;
  createdAt: number;
  decidedAt?: number;
}

export interface PermissionGrant {
  id: string;
  sessionId: string;
  scope: PermissionScope;
  decision: PermissionDecision;
  detail?: string;
  createdAt: number;
}
