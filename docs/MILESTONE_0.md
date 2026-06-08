# Milestone 0：最小可运行链路（Walking Skeleton）

目标：用最小代价打通 **"创建 Workspace → 新建会话 → 发 prompt → 流式回复 → 工具调用 → Diff 审查"** 的端到端链路。完成后即可在此骨架上迭代全部 P0 功能。

> 这是 LLM 开发的**第一个**目标。不要一次实现全部 P0，先让链路跑通。

---

## 1. 范围

### 包含

- 单用户、单 Workspace、单 Agent（先用 **mock agent**，再接 Claude Code）。
- SQLite 持久化（Workspace / Session / Message / ToolCall / Diff）。
- WebSocket 流式 Chat。
- 一个工具：`edit_file` → 产生 Diff → Accept/Reject。
- 基础权限：`file_write` 的 Allow Once / Reject。

### 不包含（留待后续）

- 多 Agent 切换、Agent Marketplace、协作、Session Replay。
- Redis、Kubernetes、鉴权登录。
- `run_command` / `search` / `git_push` 等其余工具与权限。

---

## 2. Mock Agent

为解耦真实 Agent 的接入复杂度，先实现一个 `mock-agent`：

- 实现 [`AgentAdapter`](../packages/shared-types/src/adapter.ts) 接口。
- 收到 `session/prompt` 后：
  1. 流式返回若干 `session/update { kind: 'text' }`。
  2. 发起一次 `edit_file` 工具调用 + `permission/request { scope: 'file_write' }`。
  3. 授权通过后推送 `diff`（对 Workspace 内某文件做简单修改）。
  4. 发送 `session/update { kind: 'done' }`。

这样无需任何外部 API Key 即可端到端联调。

---

## 3. 任务拆解（建议顺序）

> 每个任务应可独立提交，且提交后项目可启动。

| # | 任务 | 涉及包 | 产出 |
| --- | --- | --- | --- |
| 1 | 初始化 Monorepo（pnpm workspace、tsconfig base、eslint/prettier） | 根目录 | 可 `pnpm install` |
| 2 | 完成 `shared-types`（已就绪，按需补充） | `packages/shared-types` | 类型可被引用 |
| 3 | `apps/api`：SQLite 建表 + Workspace/Session/Message 的 CRUD | `apps/api`, `diff-engine` | HTTP 接口可用（见 API.md） |
| 4 | `packages/acp-client`：Envelope 编解码与校验 | `packages/acp-client` | 单元测试通过 |
| 5 | `packages/agent-registry` + `mock-agent` Adapter | `agent-registry` | 可列出并启动 mock agent |
| 6 | `apps/gateway`：WS 接入 + 进程管理 + 转发 + 权限拦截 | `apps/gateway`, `permission-engine` | WS 全流程可用 |
| 7 | `packages/diff-engine`：生成结构化 Diff + 应用到文件系统 | `diff-engine` | Accept 后文件被修改 |
| 8 | `apps/web`：Chat + File Tree + Diff Viewer(Monaco) + 权限弹窗 | `apps/web` | UI 端到端可用 |
| 9 | 接入真实 Claude Code Agent（替换 mock） | `agent-registry` | 真实 Agent 跑通 |

---

## 4. 验收标准（Definition of Done）

1. `pnpm install && pnpm dev` 可一键启动 web / gateway / api。
2. 在 UI 中创建 Workspace，指向本地一个目录。
3. 新建会话，输入 prompt，能看到**流式**文本回复。
4. Agent 触发 `edit_file`，UI 弹出 `file_write` 授权框。
5. 选择 Allow Once 后，UI 展示 Monaco Diff（Before/After）。
6. 点击 Accept，目标文件被实际修改；Reject 则不变。
7. 刷新页面后，能从历史接口恢复该会话的消息、工具调用与 Diff 记录。
8. 全程使用 `shared-types` 中的类型，`pnpm typecheck` 通过。

---

## 5. 联调顺序建议

```
acp-client(编解码) ──▶ mock-agent ──▶ gateway(WS) ──▶ 手动 WS 工具联调
                                                  │
                                          api(SQLite) 落库
                                                  │
                                              web(UI) 接入
                                                  │
                                          替换为真实 Agent
```

先用 WS 调试工具（如 `wscat`）直连 Gateway 验证协议，再接前端，可大幅降低排错成本。
