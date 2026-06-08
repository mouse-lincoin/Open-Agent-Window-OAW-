# 数据模型（Data Model）

OAW MVP 使用 **SQLite** 作为结构化存储（本地文件 `data/oaw.db`），Workspace 的代码文件存放在文件系统。本文档定义表结构、关系与索引。

> 类型与 ACP 字段对应见 [ACP_PROTOCOL.md](./ACP_PROTOCOL.md)，TS 类型见 [`packages/shared-types`](../packages/shared-types)。

---

## 1. 实体关系（ER）

```
Workspace 1───* Session 1───* Message 1───* ToolCall
     │                │                          │
     │                └───* PermissionGrant      └───* Diff
     └───(目录) 文件系统
```

| 实体 | 说明 |
| --- | --- |
| Workspace | 工作区，对应文件系统的一个目录 |
| Session | 一次 Agent 会话 |
| Message | 会话中的一条消息（用户或 Agent） |
| ToolCall | Agent 的一次工具调用 |
| Diff | 一次代码变更及其审查结果 |
| PermissionGrant | 一次权限授权记录 |

---

## 2. 表结构（SQLite DDL）

所有时间字段使用 `INTEGER`（Unix 毫秒时间戳）。ID 使用 `TEXT`（UUID v4）。

### 2.1 `workspaces`

```sql
CREATE TABLE workspaces (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  root_path   TEXT NOT NULL,             -- 工作区在文件系统的绝对路径
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
```

### 2.2 `sessions`

```sql
CREATE TABLE sessions (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_id      TEXT NOT NULL,           -- 取自 agent-registry
  title         TEXT,                    -- 可由首条 prompt 生成
  status        TEXT NOT NULL DEFAULT 'active',  -- active | ended | error
  created_at    INTEGER NOT NULL,
  ended_at      INTEGER
);

CREATE INDEX idx_sessions_workspace ON sessions(workspace_id);
CREATE INDEX idx_sessions_status    ON sessions(status);
```

### 2.3 `messages`

```sql
CREATE TABLE messages (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role        TEXT NOT NULL,             -- user | agent | system
  content     TEXT NOT NULL DEFAULT '',  -- 流式累积后的完整文本
  created_at  INTEGER NOT NULL
);

CREATE INDEX idx_messages_session ON messages(session_id, created_at);
```

### 2.4 `tool_calls`

```sql
CREATE TABLE tool_calls (
  id          TEXT PRIMARY KEY,          -- = ACP toolCallId
  message_id  TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  tool        TEXT NOT NULL,             -- read_file | edit_file | run_command | search
  input_json  TEXT NOT NULL,             -- 序列化的入参
  result      TEXT,                      -- 工具输出
  status      TEXT NOT NULL DEFAULT 'pending', -- pending | running | success | error
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE INDEX idx_tool_calls_message ON tool_calls(message_id);
```

### 2.5 `diffs`

```sql
CREATE TABLE diffs (
  id            TEXT PRIMARY KEY,        -- = ACP diffId
  session_id    TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  tool_call_id  TEXT REFERENCES tool_calls(id) ON DELETE SET NULL,
  path          TEXT NOT NULL,
  before_text   TEXT NOT NULL DEFAULT '',
  after_text    TEXT NOT NULL DEFAULT '',
  decision      TEXT NOT NULL DEFAULT 'pending', -- pending | accept | reject
  created_at    INTEGER NOT NULL,
  decided_at    INTEGER
);

CREATE INDEX idx_diffs_session ON diffs(session_id);
```

### 2.6 `permission_grants`

```sql
CREATE TABLE permission_grants (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  scope       TEXT NOT NULL,             -- file_write | terminal_execute | git_push | system_access
  decision    TEXT NOT NULL,             -- allow_once | allow_session | reject
  detail      TEXT,                      -- 触发授权的操作描述
  created_at  INTEGER NOT NULL
);

CREATE INDEX idx_grants_session_scope ON permission_grants(session_id, scope);
```

---

## 3. 权限解析规则

判断一次操作是否放行时，按 `session_id + scope` 查询 `permission_grants`：

1. 若存在 `allow_session` 记录 → 直接放行。
2. 否则发起 `permission/request`，等待用户决策。
3. 决策结果写入 `permission_grants`；`allow_once` 仅对本次有效，不影响后续。
4. `reject` 记录用于审计，不阻止后续重新询问。

---

## 4. 迁移与初始化

- MVP 用单个初始化脚本建表（`apps/api` 启动时执行 `schema.sql` 或迁移工具）。
- 推荐使用 `better-sqlite3`（同步、快、适合本地）或 Prisma（带迁移）。`shared-types` 中的类型应与表结构保持一致。
- 数据库文件路径通过环境变量 `DATABASE_URL`（如 `file:./data/oaw.db`）配置，见 [.env.example](../.env.example)。

---

## 5. 升级到 PostgreSQL 的注意点

后续若切换到 PostgreSQL（见 PRD Roadmap）：

- 时间戳可改为 `TIMESTAMPTZ`；ID 可保留 `TEXT`/`UUID`。
- `*_json` 字段可改为 `JSONB`。
- 外键、索引语义一致，DDL 基本可平移。
- 通过 ORM（Prisma）可降低迁移成本，应用层尽量不写方言相关 SQL。
