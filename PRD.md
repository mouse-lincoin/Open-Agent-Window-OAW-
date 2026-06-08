# Open Agent Window（OAW）产品需求文档（PRD）v1.0

> 文档状态：草案（Draft）
> 适用版本：MVP / v1.0
> 最近更新：2026-06

---

## 0. 文档说明

本 PRD 描述 **Open Agent Window（OAW）** 的产品定位、目标用户、功能范围、非功能需求与成功指标，作为产品、设计、研发与测试的统一参考。文档遵循"先约束范围、再细化功能"的原则，并以 ACP（Agent Client Protocol）为核心技术前提。

| 名称 | 含义 |
| --- | --- |
| OAW | Open Agent Window，本产品 |
| ACP | Agent Client Protocol，Agent 与客户端之间的统一交互协议 |
| Agent | 具备代码理解与执行能力的 AI 智能体（如 Claude Code、Codex、Gemini CLI 等） |
| Workspace | 一个隔离的工作区，包含文件、会话、Agent 与权限配置 |
| Session | 一次 Agent 会话，包含完整的提示、工具调用与结果 |
| Gateway | 负责 Agent 进程管理与 ACP 传输的服务端组件 |

---

## 1. 产品背景

随着 ACP（Agent Client Protocol）逐渐成为 Agent 交互标准，不同 Agent（Claude Code、Codex、Gemini CLI、Kiro、OpenHands、自研 Agent）正在具备统一接入能力。

### 1.1 当前痛点

目前市场存在以下问题：

1. **UI 碎片化**：每个 Agent 都有自己的 UI，交互逻辑、快捷键、Diff 展示方式各不相同。
2. **切换成本极高**：在不同 Agent 间切换时，用户需要重新学习界面、重新配置工作区，无法复用上下文。
3. **权限管理分散**：每个 Agent 对文件写入、终端执行、Git 操作的授权机制不一致，缺乏统一管控。
4. **协作能力缺失**：现有工具大多面向单人单机，缺乏团队级别的 Agent 与 Workspace 共享能力。

### 1.2 用户期望

用户希望获得：

- **一个 UI**：统一的交互界面，降低学习成本。
- **多个 Agent**：在同一界面下自由切换不同 Agent。
- **一个 Workspace**：共享同一份文件与上下文。
- **统一权限管理**：集中、可审计的授权机制。
- **统一 Diff 查看**：一致的代码变更审查体验。

### 1.3 产品定位

因此需要构建 **Open Agent Window（OAW）**，作为 ACP 生态中的 **Universal Client（通用客户端）**。

```
Any ACP Agent  ⇕  Open Agent Window  ⇕  Any Workspace
```

OAW 不生产 Agent，也不绑定特定模型，而是为所有遵循 ACP 的 Agent 提供统一、可靠、可扩展的人机交互入口。

---

## 2. 产品目标

### 2.1 核心目标

实现 Agent、客户端与工作区三者的解耦与自由组合：

```
Any ACP Agent
     ↕
Open Agent Window
     ↕
Any Workspace
```

### 2.2 用户价值

用户无需学习多个 Agent 的 UI，只需在统一界面中切换 Agent：

- Claude Code
- Codex
- Gemini CLI
- Kiro
- OpenHands
- Custom Agent

即可在同一工作区内连续工作，上下文、文件与权限保持一致。

### 2.3 业务目标

| 维度 | 目标 |
| --- | --- |
| 生态 | 成为 ACP 生态中接入 Agent 数量最多的通用客户端 |
| 体验 | 提供优于单一 Agent 自带 UI 的统一交互体验 |
| 扩展 | 让新 Agent 接入成本降至 1 天以内 |
| 协作 | 支撑从个人到团队再到企业的多层级使用场景 |

---

## 3. 用户角色

### 3.1 Individual Developer（个人开发者）

**画像**：独立开发者、开源贡献者、自由职业者。

**核心需求**：

- 项目问答与代码理解
- 自动改代码与重构
- Bug 定位与修复
- Diff 查看与确认

**关键场景**：在本地或远程工作区中，让 Agent 完成一个功能，并逐项审查 Diff 后接受或拒绝。

### 3.2 Team（团队）

**画像**：中小型研发团队、内部工具团队。

**核心需求**：

- Agent 共享：团队成员复用同一套 Agent 配置
- Workspace 共享：多人协作于同一工作区
- 权限控制：按角色控制文件写入、终端执行等权限

**关键场景**：团队为某个仓库配置标准 Agent 与权限策略，成员在受控环境下安全地使用 Agent。

### 3.3 AI Startup（AI 创业公司）

**画像**：自研 Agent / 模型的创业团队。

**核心需求**：

- 快速接入 ACP
- 无需自建 UI 即可对外提供完整产品体验

**关键场景**：创业公司将自研 Agent 接入 OAW，直接复用其前端、权限、Diff 与会话能力，专注于 Agent 本身的能力建设。

---

## 4. 功能需求

功能按优先级划分为 P0（MVP 必须）、P1（增强）、P2（进阶）。

### 4.1 P0 — MVP 核心功能

#### 4.1.1 Agent Chat（会话）

支持与 Agent 的对话式交互。

- 新建会话
- 历史会话查看与恢复
- Streaming 流式输出
- 多轮上下文保持

**验收标准**：用户可发起会话、实时看到流式回复、关闭后可在历史中恢复同一会话。

#### 4.1.2 File Tree（文件树）

展示工作区文件结构。

- 文件夹与文件层级展示
- 文件搜索（按名称 / 路径）
- 点击文件查看内容

**验收标准**：能正确展示工作区目录结构，支持模糊搜索并快速定位文件。

#### 4.1.3 Diff Viewer（差异查看器）

展示 Agent 产生的代码变更。

- Before / After 对比
- Accept（接受）/ Reject（拒绝）
- 基于 Monaco Diff 的高亮展示

**验收标准**：每个文件变更都可独立审查，接受后写入工作区，拒绝后丢弃变更。

#### 4.1.4 Tool Timeline（工具时间线）

展示 Agent 执行的工具调用过程。

- Read File（读取文件）
- Edit File（编辑文件）
- Run Command（执行命令）
- Search（搜索）

**验收标准**：按时间顺序展示工具调用及其输入输出，便于回溯 Agent 行为。

#### 4.1.5 Permission System（权限系统）

在敏感操作前进行授权确认，弹窗提供三种选择：

| 选项 | 含义 |
| --- | --- |
| Allow Once | 仅本次允许 |
| Allow Session | 整个会话期间允许 |
| Reject | 拒绝该操作 |

**验收标准**：文件写入、终端执行等敏感操作触发授权弹窗，选择被正确记录并应用。

#### 4.1.6 Multi Agent（多 Agent 接入）

支持在同一界面切换多个 Agent：

- Claude Code
- Codex
- Gemini CLI

**验收标准**：用户可在不重建工作区的前提下切换上述 Agent 并继续工作。

### 4.2 P1 — 增强功能

| 功能 | 说明 |
| --- | --- |
| Agent Marketplace | Agent Registry，集中发现、安装与管理 Agent |
| Shared Workspace | 多人实时协作于同一工作区 |
| Session Replay | Agent 执行过程录像与回放 |
| Prompt Library | 团队内共享的 Prompt 模板库 |

### 4.3 P2 — 进阶功能

#### Multi-Agent 协同

多个 Agent 按角色协同完成任务：

```
Architect Agent
      ↓
Coder Agent
      ↓
Reviewer Agent
```

**说明**：由架构 Agent 设计、编码 Agent 实现、审查 Agent 复核，形成自动化的多 Agent 流水线。

---

## 5. 非功能需求

### 5.1 响应速度

- 首 Token 时间：**< 1s**
- 文件树加载（万级文件）：< 2s

### 5.2 并发

- 单实例支持：**1000 Session** 并发
- Session 间相互隔离，互不影响

### 5.3 可扩展性

- Agent Adapter 插件化
- 新增一个 Agent 的接入成本：**< 1 天**

### 5.4 可靠性与安全

- Agent 进程崩溃可自动重启，会话状态可恢复
- Workspace 间文件与权限严格隔离
- 所有敏感操作可审计（记录操作人、时间、授权方式）

---

## 6. 成功指标

| 指标 | 说明 |
| --- | --- |
| DAU | 日活跃用户数 |
| Workspace 数量 | 活跃工作区总数 |
| ACP Agent 数量 | 已接入并可用的 Agent 数量 |
| Session 数量 | 累计 / 周期内会话数 |
| Diff Accept Rate | Agent 产生变更的接受率，衡量输出质量 |
| Agent Retention | Agent 使用留存率，衡量长期价值 |

---

## 7. 里程碑（与 Roadmap 对应）

| 版本 | 范围 |
| --- | --- |
| v1 | 单 Agent，MVP 全部 P0 功能 |
| v2 | 多 Agent 切换与协同 |
| v3 | Agent Marketplace |
| v4 | Cloud Workspace（云端工作区） |
| v5 | Enterprise Edition（企业版） |

---

## 8. 风险与依赖

| 类型 | 描述 | 应对 |
| --- | --- | --- |
| 协议依赖 | 强依赖 ACP 规范的稳定性 | 跟进协议演进，适配层兼容多版本 |
| Agent 兼容性 | 不同 Agent 对 ACP 实现存在差异 | 通过 Adapter 抹平差异，建立兼容性测试集 |
| 安全风险 | Agent 可执行命令、修改文件 | 权限系统 + Workspace 隔离 + 审计日志 |
| 性能风险 | 高并发会话下的资源消耗 | 进程隔离、资源限额、横向扩展 |
