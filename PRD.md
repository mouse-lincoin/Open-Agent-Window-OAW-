# Open Agent Window（OAW）PRD v1.0

## 1. 产品背景

随着 ACP（Agent Client Protocol）逐渐成为 Agent 交互标准，不同 Agent（Claude Code、Codex、Gemini CLI、Kiro、OpenHands、自研 Agent）正在具备统一接入能力。

目前市场存在两个问题：

1. 每个 Agent 都有自己的 UI
2. Agent 切换成本极高

用户希望：

* 一个 UI
* 多个 Agent
* 一个 Workspace
* 统一权限管理
* 统一 Diff 查看

因此需要构建：

Open Agent Window（OAW）

作为 ACP 生态中的 Universal Client。

---

## 2. 产品目标

### 核心目标

实现：

Any ACP Agent
↕
Open Agent Window
↕
Any Workspace

### 用户价值

用户无需学习多个 Agent UI。

只需切换 Agent：

* Claude Code
* Codex
* Gemini
* Kiro
* OpenHands
* Custom Agent

即可在同一工作区工作。

---

## 3. 用户角色

### Individual Developer

个人开发者

需求：

* 项目问答
* 自动改代码
* Bug 修复
* Diff 查看

---

### Team

团队

需求：

* Agent 共享
* Workspace 共享
* 权限控制

---

### AI Startup

需求：

* 快速接入 ACP
* 不开发 UI

---

## 4. MVP 功能

### P0

#### Agent Chat

支持：

* 新建会话
* 历史会话
* Streaming

---

#### File Tree

展示：

* 文件夹
* 文件

支持搜索

---

#### Diff Viewer

展示：

* Before
* After

支持：

* Accept
* Reject

---

#### Tool Timeline

展示：

* Read File
* Edit File
* Run Command
* Search

---

#### Permission System

弹窗：

Allow Once

Allow Session

Reject

---

#### Multi Agent

支持：

* Claude Code
* Codex
* Gemini CLI

---

### P1

#### Agent Marketplace

Agent Registry

---

#### Shared Workspace

多人协作

---

#### Session Replay

Agent 执行录像

---

#### Prompt Library

共享 Prompt

---

### P2

#### Multi-Agent

多个 Agent 协同

例如：

Architect Agent
↓
Coder Agent
↓
Reviewer Agent

---

## 5. 非功能需求

### 响应速度

首 Token：

< 1s

---

### 并发

单实例：

1000 Session

---

### 可扩展性

Agent Adapter 插件化

新增 Agent：

< 1 天

---

## 6. 成功指标

DAU

Workspace 数量

ACP Agent 数量

Session 数量

Diff Accept Rate

Agent Retention
