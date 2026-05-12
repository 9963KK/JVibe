# JVibe 文档

> 基于 JVibe Kernel 的文档体系。所有文档描述内核如何使用，不是内核本身。

---

## 快速导航

| 我想... | 查看 |
|---------|------|
| 了解整体架构 | [architecture.md](./architecture.md) |
| 理解内核设计 | [kernel-design.md](./kernel-design.md) |
| 了解 TUI / Visual 双模式 | [interface-modes.md](./interface-modes.md) |
| 了解 Agent 系统 | [agent-system.md](./agent-system.md) |
| 了解 Extension 机制 | [extension-system.md](./extension-system.md) |
| 查阅演化路线 | [evolution.md](./evolution.md) |
| 查阅编码规范 | [standards.md](./standards.md) |
| 查阅参考材料 | [appendix.md](./appendix.md) |

---

## 文档分层

```
JVibe/
├── kernel/               ← 内核（契约 + 调度）
│   ├── README.md
│   ├── contracts.yaml    ← Agent I/O 契约 SoT
│   └── orchestration.md  ← 默认调度策略
│
├── state/                ← 运行时状态
│   ├── tasks.yaml        ← 任务交接
│   └── features.yaml     ← 功能追踪
│
├── config/               ← 配置
│   └── plugins.yaml      ← 插件注册表
│
├── docs/                 ← 人读文档（本层）
│   ├── README.md         ← 索引入口
│   ├── architecture.md   ← 系统架构
│   ├── kernel-design.md  ← 内核设计决策
│   ├── interface-modes.md ← TUI / Visual 双模式
│   ├── agent-system.md   ← Agent 系统
│   ├── extension-system.md ← 扩展机制
│   ├── evolution.md      ← 演化路线
│   ├── standards.md      ← 规范索引
│   └── appendix.md       ← 参考材料
│
├── skills/               ← 技能
├── legacy/               ← 过渡资产
└── .jvibe/                  ← JVibe 运行时绑定
```

---

## 文档编写规则

1. **内核文档**（`kernel/`）：只描述契约和调度，不含具体实现细节。
2. **状态文件**（`state/`）：结构化 YAML，机器可读写。
3. **配置文件**（`config/`）：声明选择，不存密钥。
4. **人读文档**（`docs/`）：面向人类阅读，描述"是什么"和"为什么"，不替代契约。

### 更新时机

| 变更类型 | 需更新 |
|----------|--------|
| Agent 契约变更 | `kernel/contracts.yaml` + `docs/agent-system.md` |
| 调度策略变更 | `kernel/orchestration.md` |
| 新增功能 | `state/features.yaml` |
| 任务状态变更 | `state/tasks.yaml` |
| 新增规范/标准 | `docs/standards.md` 或 `docs/appendix.md` |
| 架构变更 | `docs/architecture.md` |
