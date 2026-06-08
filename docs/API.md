# 接口契约（API & WebSocket）

OAW 前端通过两类接口与后端交互：

- **HTTP REST**（`apps/api`）：业务数据的增删改查（Workspace / Session / 历史消息）。
- **WebSocket**（`apps/gateway`）：实时的 Agent 交互，承载 ACP `Envelope`（见 [ACP_PROTOCOL.md](./ACP_PROTOCOL.md)）。

所有 HTTP 响应为 JSON；字段命名用 `camelCase`；时间为 Unix 毫秒。

---

## 1. HTTP REST（API）

Base URL：`/api/v1`

### 1.1 Workspace

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/workspaces` | 列出全部 Workspace |
| `POST` | `/workspaces` | 创建 Workspace |
| `GET` | `/workspaces/:id` | 获取详情 |
| `DELETE` | `/workspaces/:id` | 删除 |
| `GET` | `/workspaces/:id/files` | 列出文件树 |
| `GET` | `/workspaces/:id/files/content?path=` | 读取单个文件内容 |

**创建 Workspace** `POST /workspaces`

```jsonc
// Request
{ "name": "my-project", "rootPath": "/abs/path/to/project" }

// Response 201
{ "id": "uuid", "name": "my-project", "rootPath": "/abs/...", "createdAt": 1700000000000 }
```

**文件树** `GET /workspaces/:id/files`

```jsonc
// Response 200
{
  "tree": [
    { "type": "dir", "name": "src", "path": "src",
      "children": [ { "type": "file", "name": "index.ts", "path": "src/index.ts" } ] }
  ]
}
```

### 1.2 Session

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/workspaces/:id/sessions` | 列出某 Workspace 的会话 |
| `GET` | `/sessions/:id` | 会话详情 |
| `GET` | `/sessions/:id/messages` | 会话历史消息（含工具调用与 Diff） |
| `DELETE` | `/sessions/:id` | 删除会话 |

> 注意：**创建会话与发送 prompt 走 WebSocket**（`session/new`、`session/prompt`），而非 HTTP，以保证流式与实时性。HTTP 仅用于读取历史。

**历史消息** `GET /sessions/:id/messages`

```jsonc
// Response 200
{
  "messages": [
    { "id": "uuid", "role": "user", "content": "修复登录 bug", "createdAt": 1700000000000 },
    { "id": "uuid", "role": "agent", "content": "...", "createdAt": 1700000001000,
      "toolCalls": [ { "id": "uuid", "tool": "edit_file", "status": "success" } ] }
  ]
}
```

### 1.3 Agent

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/agents` | 列出已注册的可用 Agent（来自 agent-registry） |

```jsonc
// Response 200
{
  "agents": [
    { "id": "claude-code", "name": "Claude Code", "capabilities": { "streaming": true, "diff": true } }
  ]
}
```

### 1.4 错误格式

所有错误返回统一结构，HTTP 状态码 + body：

```jsonc
{ "error": { "code": "WORKSPACE_NOT_FOUND", "message": "workspace not found" } }
```

`code` 复用 [ACP_PROTOCOL.md](./ACP_PROTOCOL.md#37-错误) 中的 `ErrorCode`。

---

## 2. WebSocket（Gateway）

### 2.1 连接

```
ws(s)://<host>/ws
```

- 连接建立后，客户端首先发送 `initialize`。
- 之后所有消息均为 [`Envelope`](./ACP_PROTOCOL.md#2-通用消息信封envelope) JSON。
- 一条 WS 连接可承载多个 `sessionId`（通过 Envelope 区分）。

### 2.2 客户端可发送

`initialize`、`session/new`、`session/prompt`、`session/end`、`permission/response`、`diff/decision`

### 2.3 服务端可推送

`initialized`、`session/created`、`session/update`、`session/ended`、`tool/call`、`permission/request`、`diff`、`error`

### 2.4 心跳与重连

- 客户端每 30s 发送 WS ping；Gateway 回 pong。
- 断线重连后，客户端用 HTTP `GET /sessions/:id/messages` 拉取最新历史补齐 UI，再继续 WS 交互。

---

## 3. 前后端职责边界

| 能力 | 走 HTTP | 走 WebSocket |
| --- | --- | --- |
| 列表 / 详情 / 历史读取 | ✅ | |
| 创建/删除 Workspace | ✅ | |
| 创建会话、发 prompt、流式回复 | | ✅ |
| 权限弹窗、Diff 审查 | | ✅ |
| 文件树 / 文件内容读取 | ✅ | |
