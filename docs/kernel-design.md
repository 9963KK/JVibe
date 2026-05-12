# JVibe 内核设计

> 描述内核的设计决策：为什么内核只放这些、模块如何围绕内核组织。

---

## 1. 内核设计原则

### 1.1 最小内核

内核只放不可少的东西。当前内核 = Agent 契约 + 调度策略。

**不在内核的常见候选**：
- 功能追踪 → 可变状态，非内核
- 插件注册 → 配置，非内核
- Agent 运行时定义 → 实现，非契约（契约在 kernel/，实现在 .jvibe/）
- 规范与参考 → 人读文档，非内核
- 技能 → 可扩展模块，非内核

### 1.2 分层依赖

```
kernel/            ← 不依赖任何东西
  ↑
.jvibe/               ← 依赖 kernel/contracts.yaml
  ↑
state/ + config/   ← 依赖 kernel/ 的 schema 定义
  ↑
docs/              ← 依赖 kernel/，描述设计和决策
  ↑
skills/            ← 依赖所有下层
```

### 1.3 契约即真相

`kernel/contracts.yaml` 是 Agent 协作的**单一真相来源（SoT）**。`.jvibe/agents/*.md` 是运行时适配，实现契约但不能推翻契约。当两者冲突时，以契约为准。

---

## 2. 内核模块

### 2.1 AgentContracts（Agent I/O 契约）

**职责**：
- 定义 Planner / Builder / Tester / Reviewer 的 `task_input`、`result`、`handoff` 结构
- 约束跨 Agent 协作格式，避免上下文和交接漂移
- 作为 Agent 定义和调度规则的机器可读来源

**代码落点**：`kernel/contracts.yaml`

### 2.2 Orchestration（调度策略）

**职责**：
- 定义何时调用哪个 Agent 的默认规则
- 定义循环规则（partial → builder, fail → planner, deviated → reviewer）
- 定义 Reviewer 经验处理的边界

**代码落点**：`kernel/orchestration.md`

---

## 3. 运行时模块（.jvibe/）

这些是实现内核设计的运行时组件，不是内核本身。

### 3.1 AgentDefinitions（Agent 运行时定义）

**职责**：定义 Planner / Builder / Tester / Reviewer 的运行时行为、工具权限和输出格式。

**代码落点**：`.jvibe/agents/*.md`

### 3.2 KernelExtension（内核策略注入）

**职责**：在 `before_agent_start` 事件中将内核调度策略注入主 Agent 的系统提示。

**代码落点**：`.jvibe/extensions/jvibe-kernel.ts`

### 3.3 PromptTemplates（Prompt 模板）

**职责**：为高频命令（plan、keepgo、review）提供可调用的 Prompt 模板。

**代码落点**：`.jvibe/prompts/`

---

## 4. 状态与配置模块

### 4.1 TaskHandoff（任务交接）

**职责**：维护进行中任务和历史归档，作为跨 Agent 协作的单一交接点。

**代码落点**：`state/tasks.yaml`

### 4.2 FeatureRegistry（功能追踪）

**职责**：以结构化 YAML 维护功能条目和状态。

**代码落点**：`state/features.yaml`

### 4.3 PackageRegistry（插件注册表）

**职责**：记录期望启用的工具和插件，不保存密钥。

**代码落点**：`config/plugins.yaml`

---

## 5. JVibe Runtime 演化

JVibe 以内化后的 coding-agent runtime 为代码基底，逐步加入个人工作方式。设计判断优先级：

1. **个人工作流体验优先**
2. **默认能力优先**：高频机制应成为默认行为
3. **可迭代优先**：先用 prompt/skill/extension 实验，稳定后再内置
4. **上游可吸收，但不被上游牵引**

当前 v0.1 采用 Hybrid 内化：通过 project-local package、prompt template、subagent 定义和 MCP 配置跑通最小闭环。
