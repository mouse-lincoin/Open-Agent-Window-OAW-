# 架构设计（Architecture）

本文档描述 Open Agent Window（OAW）的系统架构、组件职责与数据流，作为研发落地的技术基准。产品需求见 [PRD.md](../PRD.md)，整体介绍见 [README.md](../README.md)。

---

## 1. 总览

OAW 是 ACP 生态的通用客户端，核心是把"前端 UI、客户端逻辑、Agent 进程、工作区"解耦：

```
┌──────────┐   WebSocket   ┌──────────┐   stdio / ACP   ┌──────────┐
│  Browser  │ ◀──────────▶ │  Gateway  │ ◀────────────▶ │   Agent   │
│  (web)    │               │ (gateway) │                │ (process) │
└──────────┘               └────┬─────┘                └──────────┘
                                 │ HTTP
                            ┌────▼─────┐
                            │   API     │
                            │  (api)    │
                            └────┬─────┘
                                 │
                         ┌───────▼────────┐
                         │ SQLite + 文件系统 │
                         └────────────────┘
```

| 组件 | 包 | 职责 |
| --- | --- | --- |
| Web | `apps/web` | 前端 UI：会话、文件树、Diff、工具时间线、权限弹窗 |
| Gateway | `apps/gateway` | Agent 进程管理、ACP 传输、会话隔离、权限拦截 |
| API | `apps/api` | 业务数据：Workspace / Session / Permission 持久化与查询 |
| 存储 | — | SQLite（结构化数据）+ 文件系统（Workspace 文件） |

---

## 2. 组件职责

### 2.1 Web（前端）

- 通过 WebSocket 与 Gateway 建立长连接，收发 ACP 事件。
- 通过 HTTP 调用 API 获取 Workspace / Session 列表等业务数据。
- 负责所有可视化：Chat、File Tree、Diff Viewer（Monaco）、Tool Timeline、Permission Dialog。
- 不直接与 Agent 通信，所有 Agent 交互经 Gateway 转发。

### 2.2 Gateway（网关）

OAW 的核心运行时，详见 [ACP_PROTOCOL.md](./ACP_PROTOCOL.md)。

- **Agent 进程管理**：`spawn()` / `kill()` / `restart()`，每个会话对应一个 Agent 子进程。
- **ACP 传输**：浏览器侧用 WebSocket，Agent 侧用 stdio，双向转发 ACP 消息。
- **会话隔离**：每个 Session 绑定独立 Workspace，文件与进程互不干扰。
- **权限拦截**：Agent 发起的敏感操作（写文件、执行命令）先暂停，等待用户授权后再放行。

### 2.3 API（业务服务）

- 基于 **Fastify** 的 HTTP REST 服务（`apps/api`）。
- Workspace / Session / Message / Diff 的 CRUD 与文件树查询。
- 通过 `@oaw/db` 访问 SQLite；文件路径校验复用 `@oaw/diff-engine` 的 path-safe 工具。
- 权限决策与 Agent 交互在 **Gateway** 侧完成（`permission-engine` 不由 API 直接依赖）。

### 2.4 存储

- **SQLite**：结构化数据（Workspace、Session、Message、Permission、ToolCall）。MVP 阶段使用本地文件 `data/oaw.db`，无需独立数据库服务。
- **文件系统**：每个 Workspace 对应一个目录，Agent 在其中读写代码文件。
- **Redis（可选）**：仅在需要横向扩展或跨实例共享会话状态时引入；MVP 单实例可用内存替代。

---

## 3. 关键数据流

### 3.1 发起一次提示（prompt）

```
用户输入 prompt
   │
Web ──(WS: prompt)──▶ Gateway
                        │ 写入 Message(role=user) ──▶ API/SQLite
                        │ session/prompt ──(stdio)──▶ Agent
Agent ──(stdio: update)──▶ Gateway ──(WS: update)──▶ Web（流式渲染）
                        │ 累积写入 Message(role=agent)
```

### 3.2 权限拦截

```
Agent 请求执行命令
   │ (stdio: requestPermission)
Gateway 暂停该工具调用
   │ (WS: permission/request)
Web 弹窗：Allow Once / Allow Session / Reject
   │ (WS: permission/response)
Gateway 记录决策 ──▶ API/SQLite
   │ 放行或拒绝 ──(stdio)──▶ Agent
```

### 3.3 Diff 审查

```
Agent 产生 Patch ──▶ Gateway ──▶ diff-engine 生成结构化 Diff
   │ (WS: diff)
Web 用 Monaco Diff 展示 Before/After
   │ 用户 Accept / Reject (WS: diff/decision)
Gateway ──▶ diff-engine 应用或丢弃 ──▶ 文件系统
```

---

## 4. 包依赖关系

```
apps/web ─────────────┐
apps/gateway ─────────┼──▶ packages/shared-types   （所有人共享类型）
apps/api ─────────────┘

apps/gateway ──▶ packages/acp-client        （ACP 协议编解码）
apps/gateway ──▶ packages/agent-registry    （Agent 定义与发现）
apps/gateway ──▶ packages/db                  （会话落库）
apps/gateway ──▶ packages/permission-engine （授权决策）
apps/gateway ──▶ packages/diff-engine       （Diff 生成与应用）
apps/api     ──▶ packages/db
apps/api     ──▶ packages/diff-engine       （文件树路径安全）
```

`packages/shared-types` 是所有组件的契约源头，不依赖任何其他包。

---

## 5. 设计原则

1. **协议优先**：先确定 ACP 消息与类型契约（`shared-types`），再写实现。
2. **Agent 无关**：上层不感知具体 Agent，差异由 `agent-registry` + Adapter 抹平。
3. **会话隔离**：进程与文件按 Workspace/Session 隔离，保证安全与稳定。
4. **可降级**：MVP 不强依赖 Redis / Kubernetes，单机 + SQLite 即可运行。
5. **可审计**：权限决策、工具调用全部落库，可回溯。

---

## 6. MVP 简化项

为快速跑通首个垂直切片（见 [MILESTONE_0.md](./MILESTONE_0.md)），MVP 暂作如下简化：

| 项 | 正式方案 | MVP 方案 |
| --- | --- | --- |
| 数据库 | PostgreSQL | SQLite 本地文件 |
| 会话状态 | Redis | 进程内内存 |
| 部署 | Kubernetes | 单进程 / docker-compose |
| 多 Agent | 全量支持 | mock + Claude Code / Codex / Gemini CLI / Cursor CLI |
| 协作 | 多人共享 | 单用户单 Workspace |
