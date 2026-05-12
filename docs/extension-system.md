# Extension / Hook 机制

> 说明 JVibe 如何把原 Shell Hook 机制演化为 JVibe extension event 机制。
> 运行时实现在 `.jvibe/extensions/`。过渡资产在 `legacy/claude/hooks/`。

---

## 1. 设计目标

Extension / Hook 机制用于在 JVibe 工作流的关键节点自动补充上下文、同步状态和执行轻量保护。当前 `legacy/claude/hooks/*.sh` 是过渡资产；最终方向是把这些机制迁移为 JVibe extensions，并让它们成为 JVibe 的默认能力。

核心原则：
- **默认 fail-open**：上下文注入、统计输出、状态摘要异常时不能阻塞主流程。
- **保护 fail-safe**：危险写入、受保护路径、破坏性命令等权限保护可以阻断操作。
- **轻量输出**：只输出摘要，不输出长文档全文。
- **职责单一**：每个 extension handler 只处理一个生命周期目的。
- **不做业务决策**：extension 可以提示、拦截或同步，复杂规划仍由 JVibe 的角色能力处理。

---

## 2. 生命周期事件

| JVibe 机制 | 当前脚本（过渡） | JVibe 目标事件 | 职责 |
|---|---|---|---|
| 上下文加载 | `load-jvibe-full-context.sh` | `session_start` / `before_agent_start` | 注入核心文档、Agent、命令和插件摘要 |
| 文档变更检测 | `sync-jvibe-context.sh` | `before_agent_start` | 检测核心文档变更并注入差异摘要 |
| 功能状态同步 | `sync-feature-status.sh` | `tool_result` / `turn_end` | 当功能清单变更时推导功能状态 |
| 输出保护 | `guard-output.sh` | `message_end` / `agent_end` | 提示过长且非结构化的输出 |
| 统计输出 | `sync-stats.sh` | `turn_end` / `agent_end` | 输出功能统计摘要 |
| 权限保护 | 待新增 | `tool_call` | 阻断受保护路径或危险命令 |

---

## 3. Extension 职责边界

### 3.1 可以做

- 读取核心文档和状态文件
- 计算文档 hash，检测核心文档变化
- 统计 `state/features.yaml` 中功能状态
- 输出短摘要或提示信息
- 在 `tool_call` 阶段阻断受保护路径或危险命令

### 3.2 不应该做

- 不直接规划新功能
- 不跨越 Agent 契约修改任务流
- 不在后台静默执行网络调用或安装依赖
- 不写入密钥、Token 或外部配置
- 不因非保护类错误中断主流程

---

## 4. 输出协议

当前 Shell Hook 若需要被调用方解析，必须输出 JSON。人类可读日志优先输出到 `stderr`。

迁移到 JVibe extension 后，优先使用 extension return value、UI notify 或 structured tool result 表达结果。

---

## 5. 状态文件

| 文件 | 用途 | 写入者 |
|------|------|--------|
| `.jvibe-state.json` | 初始化状态和首次会话标记 | 初始化脚本、上下文 Hook |
| `.jvibe-doc-hash.json` | 核心文档 hash 快照 | 文档同步 Hook |
| `state/tasks.yaml` | active/archive 任务交接 | 主 Agent、指定子 Agent |

状态文件应只保存运行状态，不保存业务细节或敏感信息。

---

## 6. 新增 / 迁移检查清单

- [ ] 明确 JVibe event 或过渡 Hook event
- [ ] 明确职责，避免和现有 handler 重叠
- [ ] 设置合理 timeout
- [ ] 区分 fail-open 和 fail-safe
- [ ] 若输出 JSON，确保 `stdout` 不混入普通日志
- [ ] JVibe extension 更新对应 extension 注册点
- [ ] 更新本文档

---

## 7. v0.1 迁移标记

v0.1 已新增 `.jvibe/extensions/jvibe-kernel.ts` 作为第一条 project-local extension。它负责在 `before_agent_start` 注入 JVibe 的默认角色调度策略（来自 `kernel/orchestration.md`）。

旧 Hook 迁移保持设计记录，等 subagent 和 MCP 流程稳定后再逐项内化。

| 旧 Hook / 机制 | v0.1 状态 | 后续 JVibe extension 方向 |
|----------------|-----------|------------------------|
| JVibe 角色调度 | 已新增 `jvibe-kernel.ts` | 后续进入 JVibe runtime base prompt |
| `load-jvibe-full-context.sh` | 保留为过渡资产 | `before_agent_start` 注入核心上下文摘要 |
| `sync-jvibe-context.sh` | 保留为过渡资产 | 检测文档 hash 并提示变更 |
| `sync-feature-status.sh` | 保留为过渡资产 | 监听功能清单变化 |
| `guard-output.sh` | 保留为过渡资产 | 轻量输出保护 |
| `sync-stats.sh` | 保留为过渡资产 | 输出短统计 |
| 受保护路径 / 危险命令 | v0.1 暂不新增 | `tool_call` fail-safe 拦截 |

迁移顺序建议：
1. 先做只读上下文类 extension，验证 JVibe event 和输出形态。
2. 再做状态同步类 extension，确保 fail-open。
3. 最后做权限保护类 extension，因为它可以阻断工具调用，必须有更严格的测试。
