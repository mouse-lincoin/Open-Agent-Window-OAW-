import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  Diff,
  Message,
  MessageRole,
  PermissionDecision,
  PermissionGrant,
  PermissionScope,
  Session,
  SessionStatus,
  ToolCall,
  ToolCallStatus,
  ToolName,
  Workspace,
} from '@oaw/shared-types';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class OawDatabase {
  private db: Database.Database;

  constructor(databasePath: string) {
    this.db = new Database(databasePath);
    this.db.pragma('foreign_keys = ON');
    this.migrate();
  }

  private migrate(): void {
    const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
    this.db.exec(schema);
  }

  close(): void {
    this.db.close();
  }

  // ---------- Workspace ----------

  createWorkspace(input: { name: string; rootPath: string }): Workspace {
    const now = Date.now();
    const workspace: Workspace = {
      id: crypto.randomUUID(),
      name: input.name,
      rootPath: input.rootPath,
      createdAt: now,
      updatedAt: now,
    };
    this.db
      .prepare(
        `INSERT INTO workspaces (id, name, root_path, created_at, updated_at)
         VALUES (@id, @name, @rootPath, @createdAt, @updatedAt)`,
      )
      .run(workspace);
    return workspace;
  }

  listWorkspaces(): Workspace[] {
    const rows = this.db
      .prepare(`SELECT * FROM workspaces ORDER BY created_at DESC`)
      .all() as Record<string, unknown>[];
    return rows.map(rowToWorkspace);
  }

  getWorkspace(id: string): Workspace | null {
    const row = this.db.prepare(`SELECT * FROM workspaces WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToWorkspace(row) : null;
  }

  deleteWorkspace(id: string): boolean {
    const result = this.db.prepare(`DELETE FROM workspaces WHERE id = ?`).run(id);
    return result.changes > 0;
  }

  // ---------- Session ----------

  createSession(input: {
    workspaceId: string;
    agentId: string;
    title?: string;
  }): Session {
    const session: Session = {
      id: crypto.randomUUID(),
      workspaceId: input.workspaceId,
      agentId: input.agentId,
      title: input.title,
      status: 'active',
      createdAt: Date.now(),
    };
    this.db
      .prepare(
        `INSERT INTO sessions (id, workspace_id, agent_id, title, status, created_at)
         VALUES (@id, @workspaceId, @agentId, @title, @status, @createdAt)`,
      )
      .run(session);
    return session;
  }

  getSession(id: string): Session | null {
    const row = this.db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToSession(row) : null;
  }

  listSessionsByWorkspace(workspaceId: string): Session[] {
    const rows = this.db
      .prepare(`SELECT * FROM sessions WHERE workspace_id = ? ORDER BY created_at DESC`)
      .all(workspaceId) as Record<string, unknown>[];
    return rows.map(rowToSession);
  }

  endSession(id: string, _reason = 'ended'): Session | null {
    const now = Date.now();
    this.db
      .prepare(`UPDATE sessions SET status = 'ended', ended_at = ? WHERE id = ?`)
      .run(now, id);
    return this.getSession(id);
  }

  deleteSession(id: string): boolean {
    const result = this.db.prepare(`DELETE FROM sessions WHERE id = ?`).run(id);
    return result.changes > 0;
  }

  // ---------- Message ----------

  createMessage(input: {
    sessionId: string;
    role: MessageRole;
    content?: string;
    id?: string;
  }): Message {
    const message: Message = {
      id: input.id ?? crypto.randomUUID(),
      sessionId: input.sessionId,
      role: input.role,
      content: input.content ?? '',
      createdAt: Date.now(),
    };
    this.db
      .prepare(
        `INSERT INTO messages (id, session_id, role, content, created_at)
         VALUES (@id, @sessionId, @role, @content, @createdAt)`,
      )
      .run(message);
    return message;
  }

  updateMessageContent(id: string, content: string): void {
    this.db.prepare(`UPDATE messages SET content = ? WHERE id = ?`).run(content, id);
  }

  listMessages(sessionId: string): Message[] {
    const rows = this.db
      .prepare(`SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC`)
      .all(sessionId) as Record<string, unknown>[];
    return rows.map(rowToMessage);
  }

  // ---------- ToolCall ----------

  upsertToolCall(input: {
    id: string;
    messageId: string;
    tool: ToolName;
    input: Record<string, unknown>;
    status: ToolCallStatus;
    result?: string;
  }): ToolCall {
    const now = Date.now();
    const existing = this.db.prepare(`SELECT id FROM tool_calls WHERE id = ?`).get(input.id) as
      | Record<string, unknown>
      | undefined;
    if (existing) {
      this.db
        .prepare(
          `UPDATE tool_calls SET status = @status, result = @result, updated_at = @updatedAt
           WHERE id = @id`,
        )
        .run({
          id: input.id,
          status: input.status,
          result: input.result ?? null,
          updatedAt: now,
        });
    } else {
      this.db
        .prepare(
          `INSERT INTO tool_calls (id, message_id, tool, input_json, result, status, created_at, updated_at)
           VALUES (@id, @messageId, @tool, @inputJson, @result, @status, @createdAt, @updatedAt)`,
        )
        .run({
          id: input.id,
          messageId: input.messageId,
          tool: input.tool,
          inputJson: JSON.stringify(input.input),
          result: input.result ?? null,
          status: input.status,
          createdAt: now,
          updatedAt: now,
        });
    }
    return this.getToolCall(input.id)!;
  }

  getToolCall(id: string): ToolCall | null {
    const row = this.db.prepare(`SELECT * FROM tool_calls WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToToolCall(row) : null;
  }

  listToolCallsByMessage(messageId: string): ToolCall[] {
    const rows = this.db
      .prepare(`SELECT * FROM tool_calls WHERE message_id = ? ORDER BY created_at ASC`)
      .all(messageId) as Record<string, unknown>[];
    return rows.map(rowToToolCall);
  }

  // ---------- Diff ----------

  createDiff(input: {
    id: string;
    sessionId: string;
    toolCallId?: string;
    path: string;
    beforeText: string;
    afterText: string;
  }): Diff {
    const diff: Diff = {
      id: input.id,
      sessionId: input.sessionId,
      toolCallId: input.toolCallId,
      path: input.path,
      beforeText: input.beforeText,
      afterText: input.afterText,
      decision: 'pending',
      createdAt: Date.now(),
    };
    this.db
      .prepare(
        `INSERT INTO diffs (id, session_id, tool_call_id, path, before_text, after_text, decision, created_at)
         VALUES (@id, @sessionId, @toolCallId, @path, @beforeText, @afterText, @decision, @createdAt)`,
      )
      .run({
        ...diff,
        toolCallId: diff.toolCallId ?? null,
      });
    return diff;
  }

  decideDiff(id: string, decision: 'accept' | 'reject'): Diff | null {
    const now = Date.now();
    this.db
      .prepare(`UPDATE diffs SET decision = ?, decided_at = ? WHERE id = ? AND decision = 'pending'`)
      .run(decision, now, id);
    const row = this.db.prepare(`SELECT * FROM diffs WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToDiff(row) : null;
  }

  getDiff(id: string): Diff | null {
    const row = this.db.prepare(`SELECT * FROM diffs WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToDiff(row) : null;
  }

  // ---------- Permission ----------

  createPermissionGrant(input: {
    sessionId: string;
    scope: PermissionScope;
    decision: PermissionDecision;
    detail?: string;
  }): PermissionGrant {
    const grant: PermissionGrant = {
      id: crypto.randomUUID(),
      sessionId: input.sessionId,
      scope: input.scope,
      decision: input.decision,
      detail: input.detail,
      createdAt: Date.now(),
    };
    this.db
      .prepare(
        `INSERT INTO permission_grants (id, session_id, scope, decision, detail, created_at)
         VALUES (@id, @sessionId, @scope, @decision, @detail, @createdAt)`,
      )
      .run({ ...grant, detail: grant.detail ?? null });
    return grant;
  }

  listPermissionGrants(sessionId: string): PermissionGrant[] {
    const rows = this.db
      .prepare(`SELECT * FROM permission_grants WHERE session_id = ? ORDER BY created_at ASC`)
      .all(sessionId) as Record<string, unknown>[];
    return rows.map(rowToPermissionGrant);
  }
}

function rowToWorkspace(row: Record<string, unknown>): Workspace {
  return {
    id: String(row.id),
    name: String(row.name),
    rootPath: String(row.root_path),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function rowToSession(row: Record<string, unknown>): Session {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    agentId: String(row.agent_id),
    title: row.title != null ? String(row.title) : undefined,
    status: String(row.status) as SessionStatus,
    createdAt: Number(row.created_at),
    endedAt: row.ended_at != null ? Number(row.ended_at) : undefined,
  };
}

function rowToMessage(row: Record<string, unknown>): Message {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    role: String(row.role) as MessageRole,
    content: String(row.content),
    createdAt: Number(row.created_at),
  };
}

function rowToToolCall(row: Record<string, unknown>): ToolCall {
  return {
    id: String(row.id),
    messageId: String(row.message_id),
    tool: String(row.tool) as ToolName,
    input: JSON.parse(String(row.input_json)) as Record<string, unknown>,
    result: row.result != null ? String(row.result) : undefined,
    status: String(row.status) as ToolCallStatus,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function rowToDiff(row: Record<string, unknown>): Diff {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    toolCallId: row.tool_call_id != null ? String(row.tool_call_id) : undefined,
    path: String(row.path),
    beforeText: String(row.before_text),
    afterText: String(row.after_text),
    decision: String(row.decision) as Diff['decision'],
    createdAt: Number(row.created_at),
    decidedAt: row.decided_at != null ? Number(row.decided_at) : undefined,
  };
}

function rowToPermissionGrant(row: Record<string, unknown>): PermissionGrant {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    scope: String(row.scope) as PermissionScope,
    decision: String(row.decision) as PermissionDecision,
    detail: row.detail != null ? String(row.detail) : undefined,
    createdAt: Number(row.created_at),
  };
}

export function resolveDatabasePath(databaseUrl: string): string {
  if (databaseUrl.startsWith('file:')) {
    return databaseUrl.slice('file:'.length);
  }
  return databaseUrl;
}

/** 将 DATABASE_URL 解析为绝对路径（Monorepo 内 apps/* 共用 data/oaw.db）。 */
export function resolveDefaultDatabasePath(metaUrl: string): string {
  const url = process.env.DATABASE_URL ?? 'file:./data/oaw.db';
  const relative = resolveDatabasePath(url);
  if (relative.startsWith('/')) {
    return relative;
  }
  const appSrcDir = dirname(fileURLToPath(metaUrl));
  const monorepoRoot = resolve(appSrcDir, '../../..');
  return resolve(monorepoRoot, relative);
}
