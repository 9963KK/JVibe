# JVibe 内核演化

> 记录如何把上游 coding-agent 能力内化为个人专属 Agent：JVibe。
> 更新时机：决定吸收上游新能力、修改 JVibe 默认工作流、迁移 Hook/Agent 定义或调整产品边界时。

---

## 1. 核心判断

JVibe 不是某个外部工作流包，也不是另一个工具的适配层。JVibe 是以 coding-agent 能力为基底，持续加入个人工作方式后形成的新 Agent。

设计判断优先级：

1. **个人工作流体验优先**：是否让日常开发、复盘、规划、测试更顺手。
2. **默认能力优先**：高频机制应成为 JVibe 默认行为，而不是每次手动加载。
3. **可迭代优先**：先用 prompt/skill/extension 实验，稳定后再内置进 runtime。
4. **上游可吸收，但不被上游牵引**：上游更新是能力来源，不是 JVibe 边界。

---

## 2. 值得吸收的基建

| 能力 | JVibe 用法 |
|---------|-----------|
| Session runtime | 保留会话树、fork、compact、handoff 等长期工作能力 |
| Extensions | 承载 JVibe Hook、权限保护、状态同步、结构化输出 |
| Skills | 承载低频但复杂的专项工作流 |
| Prompt templates | 承载高频命令，如 plan、keepgo、review、status |
| Packages | 后续把 JVibe 能力打包，便于迁移到新环境 |
| Tool interception | 在 `tool_call` 阶段实现受保护路径、危险命令和输出约束 |

---

## 3. 原 JVibe 机制的归宿

| 原机制 | 目标形态 | 说明 |
|--------|----------|------|
| `kernel/` | JVibe 内核 | 契约和调度策略 SoT |
| `state/` | 运行时状态层 | 任务交接、功能追踪 |
| `config/` | 配置层 | 插件注册表 |
| `docs/` | 人读文档层 | 架构、设计、规范 |
| `legacy/claude/*` / `legacy/codex/*` | 迁移素材 | 稳定后转为 prompts、skills 或 runtime 行为 |
| `.jvibe/extensions/` | JVibe extensions | 按事件迁移 Shell Hook |
| `skills/` | JVibe skills | 按 JVibe skill 规则整理 |

---

## 4. 迁移顺序

### Phase 1：设计对齐 ✅

- 明确 JVibe = 内化上游 coding-agent 能力的新 Agent。
- 提取内核层（`kernel/`），分离状态（`state/`）、配置（`config/`）和文档（`docs/`）。
- 标注 `legacy/` 中资产为迁移素材。

### Phase 2：资源映射

- 把 `/JVibe:status`、`/JVibe:keepgo`、`/JVibe:pr` 映射为 prompt templates。
- 把稳定技能整理为 JVibe-compatible skills。

### Phase 3：Extension 化

- 将上下文加载、文档 hash 检测、功能状态同步迁移为 JVibe extensions。
- 新增 protected paths / dirty state / structured output 等运行时保护。
- 保留 Shell Hook 作为过渡 fallback。

### Phase 4：Runtime 内置

- 高频且稳定的 extension 行为进入 JVibe runtime 默认能力。
- 根据个人使用数据继续删减、合并或重命名 Agent 角色。
- 形成可长期迭代的 JVibe CLI。

---

## 5. 不做什么

- 不把 JVibe 做成多个宿主之间的通用适配层。
- 不为了兼容所有 Agent 工具牺牲个人默认体验。
- 不一次性重写底层 runtime；先通过资源和 extension 试验，再决定是否内置。
- 不把所有规则塞进系统提示；继续使用 progressive disclosure。

---

## 6. v0.1 可运行骨架

v0.1 采用 **Hybrid 内化**：当前仓库先作为 JVibe 项目运行，通过 project-local package、prompt template、subagent 定义和 MCP 配置跑通 JVibe 的最小闭环。

### 6.1 本轮落地范围

| 资源 | 路径 | 作用 |
|------|------|------|
| JVibe 项目设置 | `.jvibe/settings.json` | 声明 subagent、MCP、prompt 和 skill 资源 |
| JVibe kernel extension | `.jvibe/extensions/jvibe-kernel.ts` | 在 `before_agent_start` 注入默认角色调度策略 |
| CLI 启动器 | `jvibe` | 默认启动 JVibe runtime；旧管理命令继续保留 |
| Subagent 定义 | `.jvibe/agents/*.md` | 定义 planner、builder、tester、reviewer 四角色 |
| Prompt templates | `.jvibe/prompts/*.md` | 提供 `/jvibe-plan`、`/jvibe-keepgo`、`/jvibe-review` 高频入口 |
| MCP 配置 | `.mcp.json` | 使用 MCP adapter 读取标准 MCP server 配置 |

### 6.2 Package 选择

| Package | 版本目标 | 用法 |
|---------|----------|------|
| subagent package | project-local install | 负责发现 `.jvibe/agents`，提供 `/run`、`/chain`、`/parallel` 和 `subagent` 工具 |
| MCP adapter package | project-local install | 读取 `.mcp.json`，优先提供 `mcp` proxy tool |

### 6.3 运行与验证

最小 smoke test：
1. `jvibe runtime --version` 应显示当前 JVibe runtime 版本。
2. 启动 `jvibe`，确认 prompt templates、packages 和 `jvibe-kernel` extension 被加载。
3. 执行 `/subagents-doctor` 或请求 "Show me the available subagents"，确认 project agents 中存在 `planner`、`builder`、`tester`、`reviewer`。
4. 执行 `/jvibe-plan 检查当前文档架构`，确认 Planner 输出包含 `work_packages` 和 `acceptance_criteria`。
5. 执行 `/mcp` 或 `mcp({ search: "screenshot" })`，确认 MCP adapter 能读取 `.mcp.json`。
