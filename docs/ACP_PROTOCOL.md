# ACP 消息契约（Protocol Contract）

本文档定义 OAW 内部使用的 ACP（Agent Client Protocol）消息格式，覆盖三段链路：

```
Browser ──(WebSocket JSON)──▶ Gateway ──(stdio JSON-RPC)──▶ Agent
```

> 说明：ACP 上游规范仍在演进，本文是 OAW 在 MVP 阶段采用的**最小可用子集**与内部约定。所有类型以 [`packages/shared-types`](../packages/shared-types) 为权威定义，本文档与代码不一致时以代码为准。

---

## 1. 传输层

| 链路 | 协议 | 编码 | 帧格式 |
| --- | --- | --- | --- |
| Browser ↔ Gateway | WebSocket | JSON 文本帧 | 每帧一个 `Envelope` |
| Gateway ↔ Agent | stdio（子进程） | JSON-RPC 2.0 | 行分隔（每行一个 JSON） |

---

## 2. 通用消息信封（Envelope）

浏览器与 Gateway 之间所有消息统一包裹为 `Envelope`：

```ts
interface Envelope<T = unknown> {
  id: string;          // 消息唯一 ID（uuid）
  type: MessageType;   // 消息类型，见下表
  sessionId?: string;  // 关联会话（除 initialize 外必填）
  ts: number;          // 毫秒时间戳
  payload: T;          // 类型对应的载荷
}
```

### 2.1 消息类型一览

| `type` | 方向 | 说明 | payload |
| --- | --- | --- | --- |
| `initialize` | C→G | 握手，协商能力 | `InitializePayload` |
| `initialized` | G→C | 握手结果 | `InitializedPayload` |
| `session/new` | C→G | 新建会话 | `SessionNewPayload` |
| `session/created` | G→C | 会话已创建 | `{ sessionId }` |
| `session/prompt` | C→G | 发送用户提示 | `PromptPayload` |
| `session/update` | G→C | 流式更新（文本/工具） | `UpdatePayload` |
| `session/end` | C→G | 结束会话 | `{ sessionId }` |
| `session/ended` | G→C | 会话已结束 | `{ sessionId, reason }` |
| `tool/call` | G→C | 通知一次工具调用 | `ToolCallPayload` |
| `permission/request` | G→C | 请求敏感操作授权 | `PermissionRequestPayload` |
| `permission/response` | C→G | 用户授权决策 | `PermissionResponsePayload` |
| `diff` | G→C | 推送一个待审查 Diff | `DiffPayload` |
| `diff/decision` | C→G | Accept / Reject | `DiffDecisionPayload` |
| `ping` | C→G | 应用层心跳探测 | `{}` |
| `pong` | G→C | 心跳响应 | `{}` |
| `error` | G→C | 错误 | `ErrorPayload` |

> C = Client(浏览器)，G = Gateway。

---

## 3. 载荷定义（Payloads）

### 3.1 握手

```ts
interface InitializePayload {
  clientName: string;        // "open-agent-window"
  clientVersion: string;     // 语义化版本
  protocolVersion: string;   // 采用的 ACP 子集版本，如 "0.1"
}

interface InitializedPayload {
  agentName: string;         // 实际 Agent 名称
  capabilities: {
    streaming: boolean;
    tools: string[];         // 支持的工具，如 ["read_file","edit_file","run_command","search"]
    diff: boolean;
  };
}
```

### 3.2 会话

```ts
interface SessionNewPayload {
  workspaceId: string;
  agentId: string;           // 取自 agent-registry
}

interface PromptPayload {
  text: string;
  // 可选：附带文件引用 / 选区，MVP 可省略
  attachments?: { path: string }[];
}
```

### 3.3 流式更新

`session/update` 是 Agent 回复的核心，按 `kind` 区分：

```ts
type UpdatePayload =
  | { kind: 'text'; delta: string }                 // 流式文本增量
  | { kind: 'tool_call'; toolCall: ToolCallPayload } // 工具调用开始
  | { kind: 'tool_result'; toolCallId: string; result: string }
  | { kind: 'thinking'; delta: string }             // 可选：思考过程
  | { kind: 'done'; messageId: string };            // 本轮结束
```

### 3.4 工具调用

```ts
type ToolName = 'read_file' | 'edit_file' | 'run_command' | 'search';

interface ToolCallPayload {
  toolCallId: string;
  tool: ToolName;
  input: Record<string, unknown>;  // 各工具的参数
  status: 'pending' | 'running' | 'success' | 'error';
}
```

各工具的 `input` 约定：

| tool | input |
| --- | --- |
| `read_file` | `{ path: string }` |
| `edit_file` | `{ path: string }`（变更通过 `diff` 消息单独推送） |
| `run_command` | `{ command: string; cwd?: string }` |
| `search` | `{ query: string; glob?: string }` |

### 3.5 权限

```ts
type PermissionScope = 'file_write' | 'terminal_execute' | 'git_push' | 'system_access';

interface PermissionRequestPayload {
  requestId: string;
  scope: PermissionScope;
  detail: string;           // 给用户看的描述，如 "执行: rm -rf build"
  toolCallId?: string;
}

interface PermissionResponsePayload {
  requestId: string;
  decision: 'allow_once' | 'allow_session' | 'reject';
}
```

### 3.6 Diff

```ts
interface DiffPayload {
  diffId: string;
  path: string;
  before: string;           // 原文件内容（不存在则为 ""）
  after: string;            // 变更后内容
  toolCallId?: string;
}

interface DiffDecisionPayload {
  diffId: string;
  decision: 'accept' | 'reject';
}
```

### 3.7 错误

```ts
interface ErrorPayload {
  code: ErrorCode;
  message: string;
  detail?: unknown;
}

type ErrorCode =
  | 'AGENT_SPAWN_FAILED'
  | 'AGENT_CRASHED'
  | 'SESSION_NOT_FOUND'
  | 'WORKSPACE_NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'INVALID_MESSAGE'
  | 'INTERNAL';
```

---

## 4. 典型时序

### 4.1 一次完整问答

```
C → G  initialize
G → C  initialized
C → G  session/new        { workspaceId, agentId }
G → C  session/created    { sessionId }
C → G  session/prompt     { text }
G → C  session/update     { kind: 'text', delta: '...' }   (多次)
G → C  session/update     { kind: 'tool_call', ... }
G → C  permission/request { scope: 'file_write', ... }
C → G  permission/response{ decision: 'allow_once' }
G → C  diff               { path, before, after }
C → G  diff/decision      { decision: 'accept' }
G → C  session/update     { kind: 'done', messageId }
```

---

## 5. 约定与规则

1. 除 `initialize` / `initialized` / `ping` / `pong` 外，所有消息必须携带有效 `sessionId`。
2. Gateway 收到非法或未知 `type` 时回 `error`（`INVALID_MESSAGE`），不断开连接。
3. `permission/request` 未在超时时间内得到响应，按 `reject` 处理（默认 60s，可配置）。同一 `requestId` 的授权记录只落库一次（去重）。
4. 同一 `diffId` 的 `diff/decision` 只接受一次，重复忽略。Diff 决策仅凭 `sessionId` + 数据库即可处理，不依赖 Gateway 内存中的活跃会话。
5. 所有 `id` / `*Id` 字段统一用 UUID v4。
6. **心跳**：服务端每 30s 发送 WebSocket 协议级 ping（浏览器自动 pong）。由于浏览器无法主动发送协议级 ping，客户端额外使用应用层 `ping`/`pong` 探测半开连接：发出 `ping` 后若在超时内未收到 `pong`，则主动断开并重连。
7. **单活跃会话**：同一个 WebSocket 连接同时只保留一个活跃 Agent 进程。当连接挂载/激活一个会话时，该连接上其它会话的 Agent 进程会被停止（DB 会话状态保持 `active`，可后续恢复），以避免 Agent 子进程堆积。
