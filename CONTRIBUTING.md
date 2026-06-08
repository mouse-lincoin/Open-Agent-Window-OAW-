# 贡献与开发约定（Contributing）

本文件定义 Open Agent Window（OAW）的工程约定，供人类开发者与 LLM 协作开发时共同遵循。开始写代码前请先通读本文件与 [docs/](./docs) 下的契约文档。

---

## 1. 必读文档

| 文档 | 内容 |
| --- | --- |
| [PRD.md](./PRD.md) | 产品需求、功能范围与优先级 |
| [README.md](./README.md) | 项目概览与技术栈 |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | 组件职责与数据流 |
| [docs/ACP_PROTOCOL.md](./docs/ACP_PROTOCOL.md) | ACP 消息契约 |
| [docs/DATA_MODEL.md](./docs/DATA_MODEL.md) | SQLite 数据模型 |
| [docs/API.md](./docs/API.md) | HTTP / WebSocket 接口契约 |
| [docs/MILESTONE_0.md](./docs/MILESTONE_0.md) | 首个垂直切片任务拆解 |

**契约优先原则**：`packages/shared-types` 是类型的唯一权威来源。任何前后端交互都必须使用其中定义的类型；文档与代码不一致时以 `shared-types` 为准，并同步修订文档。

---

## 2. 技术与工具链

- **语言**：TypeScript（`strict: true`）。
- **运行时**：Node.js ≥ 18。
- **包管理器**：**pnpm**（统一使用，禁止混用 npm/yarn 产生多份 lockfile）。
- **Monorepo**：pnpm workspace，结构见 [README](./README.md#项目结构)。
- **数据库**：MVP 使用 SQLite（`better-sqlite3` 或 Prisma），见 [DATA_MODEL.md](./docs/DATA_MODEL.md)。

### pnpm workspace

根目录 `pnpm-workspace.yaml`：

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

包间引用使用 workspace 协议，例如：

```jsonc
{ "dependencies": { "@oaw/shared-types": "workspace:*" } }
```

---

## 3. 代码风格

- 使用 ESLint + Prettier，提交前自动格式化。
- 命名：变量/函数 `camelCase`，类型/类 `PascalCase`，常量 `UPPER_SNAKE_CASE`。
- 接口字段统一 `camelCase`（含 HTTP/WS payload）。
- 禁止 `any`，确需逃逸用 `unknown` 并收窄。
- 注释只解释"为什么"，不复述"做了什么"。

---

## 4. 目录与命名

- 应用放 `apps/`，可复用逻辑放 `packages/`。
- 每个 `package` 必须有清晰的 `index.ts` 导出边界。
- 仅 `shared-types` 可被所有人依赖；它本身不依赖任何内部包。

---

## 5. Git 工作流

- 分支命名：`feat/xxx`、`fix/xxx`、`docs/xxx`、`chore/xxx`。
- Commit 遵循 [Conventional Commits](https://www.conventionalcommits.org/)：`type(scope): subject`，如 `feat(gateway): 实现 session/new`。
- 每个 PR 聚焦一件事；改动契约（shared-types / 协议）需在描述中显式说明。
- 合并前确保 `pnpm typecheck`、`pnpm lint`、`pnpm test` 通过。

---

## 6. 给 LLM 开发者的提示

1. **先读契约，再写实现**：动手前确认涉及的 `shared-types` 类型与对应文档。
2. **小步垂直切片**：优先打通端到端最小链路（见 [MILESTONE_0.md](./docs/MILESTONE_0.md)），不要一次实现所有 P0。
3. **不破坏契约**：如需修改协议/类型，先改 `shared-types` 与文档，再改实现，并在 PR 中标注 breaking change。
4. **保持可运行**：每次提交后项目应可 `pnpm dev` 启动；不要留下编译不过的中间状态。
5. **写最小测试**：核心逻辑（diff-engine、permission-engine、acp-client 编解码）需有单元测试。
