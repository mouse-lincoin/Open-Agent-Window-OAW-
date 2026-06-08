# Open Agent Window

**Universal ACP Client** — 面向 ACP（Agent Client Protocol）生态的通用客户端。

Open Agent Window（OAW）为所有遵循 ACP 的 Agent（Claude Code、Codex、Gemini CLI、Kiro、OpenHands、自研 Agent 等）提供统一的交互界面、统一的权限管理和统一的 Diff 审查体验。一个 UI，多个 Agent，一个 Workspace。

> 产品需求详见 [PRD.md](./PRD.md)。

---

## 目录

- [核心特性](#核心特性)
- [架构概览](#架构概览)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [快速开始](#快速开始)
- [ACP 流程](#acp-流程)
- [会话生命周期](#会话生命周期)
- [Gateway 职责](#gateway-职责)
- [Agent Adapter](#agent-adapter)
- [支持的 Agent](#支持的-agent)
- [Workspace 模型](#workspace-模型)
- [权限级别](#权限级别)
- [Diff 流程](#diff-流程)
- [未来规划](#未来规划)

---

## 核心特性

- **统一界面**：所有 Agent 共用一套 UI，无需为每个 Agent 重新学习交互。
- **多 Agent 切换**：在同一 Workspace 内自由切换不同 Agent，保持上下文一致。
- **统一权限管理**：集中、可审计的授权机制，敏感操作前确认。
- **可视化 Diff 审查**：基于 Monaco 的 Before/After 对比，逐项 Accept / Reject。
- **工具时间线**：完整记录 Agent 的文件读写、命令执行与搜索行为。
- **插件化扩展**：通过 Agent Adapter 接入新 Agent，成本低于 1 天。

---

## 架构概览

```
Browser
   │  (WebSocket)
   ▼
Gateway
   │  (ACP)
   ▼
Agent
```

- **Browser**：前端 UI，通过 WebSocket 与 Gateway 实时通信。
- **Gateway**：负责 Agent 进程管理、ACP 传输与会话隔离。
- **Agent**：遵循 ACP 的智能体，通过 stdio 与 Gateway 通信。

---

## 技术栈

### 前端（Frontend）

- Next.js
- React
- TypeScript
- Monaco Editor（代码与 Diff 展示）
- Zustand（状态管理）
- TanStack Query（数据请求与缓存）

### 后端（Backend）

- NestJS
- WebSocket
- Redis（会话状态 / 缓存）
- PostgreSQL（持久化）

### 基础设施（Infra）

- Docker
- Kubernetes
- Nginx

---

## 项目结构

采用 Monorepo 组织，应用与可复用包分离：

```
.
├── apps/
│   ├── web/        # 前端应用（Next.js）
│   ├── gateway/    # ACP 网关与 Agent 进程管理
│   └── api/        # 业务 API（NestJS）
└── packages/
    ├── acp-client/         # ACP 协议客户端实现
    ├── agent-registry/     # Agent 注册与发现
    ├── diff-engine/        # Diff 生成与应用
    ├── permission-engine/  # 权限校验与授权管理
    └── shared-types/       # 跨包共享的类型定义
```

---

## 快速开始

> 以下为约定的开发流程，具体命令以各子应用的脚本为准。

### 环境要求

- Node.js ≥ 18
- pnpm（推荐）或 npm
- Docker（用于本地启动 Redis / PostgreSQL）

### 安装与启动

```bash
# 安装依赖
pnpm install

# 启动本地依赖服务（Redis / PostgreSQL）
docker compose up -d

# 启动开发环境（web / gateway / api）
pnpm dev
```

启动后：

- 前端默认运行于 `http://localhost:3000`
- Gateway 通过 WebSocket 暴露 ACP 通道
- 在 UI 中选择一个 Agent 并创建 Workspace 即可开始

---

## ACP 流程

浏览器到 Agent 的完整消息链路：

```
Browser
   ↓
ACP Client
   ↓
Gateway
   ↓
ACP Agent
```

前端通过 `acp-client` 将用户操作编码为 ACP 消息，经 Gateway 转发至具体 Agent，再将 Agent 的流式更新回传给浏览器。

---

## 会话生命周期

```
initialize
   ↓
session/new
   ↓
session/prompt
   ↓
session/update   (流式更新，可多次)
   ↓
session/end
```

| 阶段 | 说明 |
| --- | --- |
| `initialize` | 客户端与 Agent 握手，协商能力 |
| `session/new` | 创建新会话，绑定 Workspace |
| `session/prompt` | 发送用户提示 |
| `session/update` | Agent 流式返回内容与工具调用 |
| `session/end` | 结束会话，释放资源 |

---

## Gateway 职责

1. **Agent 进程管理**
   - `spawn()` 启动 Agent 进程
   - `kill()` 终止进程
   - `restart()` 异常重启
2. **ACP 传输**
   - 通过 `stdio` 与 Agent 通信
   - 通过 `WebSocket` 与浏览器通信
3. **会话隔离**
   - 每个会话绑定独立的 Workspace，互不干扰
4. **权限管理**
   - 命令执行等敏感操作的审批与拦截

---

## Agent Adapter

新增 Agent 只需实现统一的适配器接口：

```ts
interface AgentAdapter {
  name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  send(message: AcpMessage): void;
  onMessage(callback: (message: AcpMessage) => void): void;
}
```

适配器抹平不同 Agent 在传输与消息格式上的差异，使上层无需感知具体 Agent 实现。

---

## 支持的 Agent

| Agent | 状态 |
| --- | --- |
| Claude Code | 支持 |
| Codex | 支持 |
| Gemini CLI | 支持 |
| Kiro | 规划中 |
| OpenHands | 规划中 |
| Custom ACP Agent | 通过 Adapter 接入 |

---

## Workspace 模型

```
Workspace
├── Files         # 工作区文件
├── Sessions      # 关联的会话
├── Agents        # 可用的 Agent
└── Permissions   # 权限配置
```

每个 Workspace 是一个隔离单元，拥有独立的文件、会话、Agent 与权限策略。

---

## 权限级别

由低到高：

| 级别 | 能力 |
| --- | --- |
| Read Only | 仅读取文件 |
| File Write | 写入 / 修改文件 |
| Terminal Execute | 执行终端命令 |
| Git Push | 推送代码到远端 |
| System Access | 系统级访问 |

---

## Diff 流程

```
Agent
   ↓
Patch          (Agent 产生变更补丁)
   ↓
Diff Engine    (生成结构化 Diff)
   ↓
Monaco Diff    (前端可视化对比)
   ↓
Accept / Reject
```

用户在 UI 中逐项审查变更，接受后由 `diff-engine` 应用到工作区，拒绝则丢弃。

---

## 未来规划

| 版本 | 主题 |
| --- | --- |
| v1 | Single Agent（单 Agent） |
| v2 | Multi Agent（多 Agent） |
| v3 | Agent Marketplace（Agent 市场） |
| v4 | Cloud Workspace（云端工作区） |
| v5 | Enterprise Edition（企业版） |
