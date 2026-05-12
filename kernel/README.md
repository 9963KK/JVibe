# JVibe Kernel

## 内核是什么

JVibe Kernel 是 JVibe 的最小、稳定核心。它定义了 JVibe 的**本质行为**——Agent 协作契约、调度策略和角色边界。一切其他组件（状态、配置、文档、技能、扩展）都依赖内核，但内核不依赖它们。

**内核 = 契约 + 调度**，仅此两件事。

## 内核边界

### 内核包含

| 文件 | 职责 | 性质 |
|------|------|------|
| `contracts.yaml` | Agent I/O 契约：定义 Planner / Builder / Tester / Reviewer 的输入输出结构、硬规则、交接协议 | **不可变 SoT** |
| `orchestration.md` | 默认调度策略：何时调用哪个 Agent、循环规则、回退逻辑 | **稳定策略** |
| `README.md` | 内核自身说明 | 元文档 |

### 内核不包含

- **运行时状态**：任务交接、功能追踪 → `state/`
- **配置**：插件注册表 → `config/`
- **文档**：架构说明、设计决策、规范 → `docs/`
- **技能**：可扩展工作流模块 → `skills/`
- **运行时绑定**：JVibe runtime adapter、扩展代码、Prompt 模板 → `.jvibe/`

## 设计原则

1. **最小内核**：只放不可少的东西。放多了就不是内核。
2. **稳定优先**：内核变更必须经过 Planner + Reviewer 流程。
3. **契约即真相**：`contracts.yaml` 是 Agent 协作的单一真相来源。运行时定义（`.jvibe/agents/`）实现契约，不能推翻契约。
4. **调度是默认，不是命令**：`orchestration.md` 定义默认策略，Agent 可在合理范围内偏离，但偏离必须记录。
5. **内核不存状态**：所有可变数据在 `state/`，配置在 `config/`。内核文件本身是设计和规则，不是运行数据。

## 依赖关系

```
kernel/ (契约 + 调度)
  ↑ 被依赖
  ├── .jvibe/agents/      (运行时 Agent 定义)
  ├── .jvibe/extensions/  (运行时调度注入)
  ├── state/           (运行状态，按契约格式)
  ├── docs/            (人读文档，描述内核设计)
  └── skills/          (技能，遵守契约)
```

## 启动入口

默认用户入口是 `jvibe`。当前全局 `jvibe` CLI 保留原有管理命令，同时直接启动 JVibe runtime：

| 命令 | 行为 |
|------|------|
| `jvibe` | 启动 JVibe Agent，加载当前项目或默认 JVibe home 的 `.jvibe/settings.json` |
| `jvibe agent ...` | 显式把参数转发给 JVibe runtime |
| `jvibe runtime ...` | 调试入口，直接查看 JVibe runtime 参数和版本 |
| `jvibe init/status/validate/setup` | 保留旧 JVibe 管理命令 |

启动器会优先寻找当前目录向上的 `.jvibe/settings.json`。如果找不到，则回退到个人 JVibe home：`/Users/jenkinschen5/Desktop/ManyThings/LLM/JVibe`。

## 变更规则

- 修改 `contracts.yaml` 前，必须在 Planner 中评估影响范围
- 修改 `orchestration.md` 前，必须确认不会破坏现有工作流
- 每次内核变更后，必须通过 Tester 验证所有 Agent 仍能正确协作
- 重大内核变更必须由 Reviewer 审查
