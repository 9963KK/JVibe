# Agent 系统

> 说明 JVibe 的子 Agent 角色、调用意图、输出契约和流程审查方式。
> Agent 契约 SoT：`kernel/contracts.yaml`。运行时定义：`.jvibe/agents/`。

---

## 1. 设计目标

JVibe 的子 Agent 系统面向**通用任务**，不限于代码开发。代码任务只是通用任务的一种表现；研究、文档、流程设计、工具配置、复盘沉淀也可以进入同一套任务流。

核心目标：
- **Planner 负责拆解**：把模糊目标变成可执行结构；简单任务也要判断是否能拆成步骤、模块或并行工作包。
- **Builder 负责执行**：拿到计划后真正做事，权限较大，但必须围绕计划目标和安全边界行动。
- **Tester 负责验证**：验证计划是否完成、结果是否符合原目标、执行是否偏离。
- **Reviewer 负责审查和沉淀**：在流程完成或出现偏离时审查过程，判断偏离是否合理，并提炼可优化 JVibe 的经验。

这些角色不是固定流水线按钮。模型可以根据任务复杂度、上下文和风险自行决定调用时机；`kernel/orchestration.md` 提供默认判断标准。

---

## 2. 角色总览

| 角色 | 核心问题 | 默认职责 | 典型输出 |
|------|----------|----------|----------|
| Planner | 这件事应该怎么拆？ | 任务理解、步骤/模块拆解、验收标准、分派建议 | `plan`、`work_packages`、`acceptance_criteria` |
| Builder | 现在具体要做什么？ | 执行计划、产出结果、记录偏差和阻塞 | `completed_work`、`changes`、`deviations` |
| Tester | 做完了吗？做对了吗？ | 验证计划完成度、检查结果和偏离 | `verdict`、`completion_check`、`next_action` |
| Reviewer | 这条路径是否值得保留？ | 审查流程、判断偏离合理性、沉淀经验 | `review_decision`、`lessons`、`agent_improvements` |

---

## 3. Planner

Planner 是任务拆解者。它不只是把复杂任务拆成多个步骤，也要处理简单任务：

- 简单任务：给出最小可执行步骤，判断是否可以直接交给 Builder。
- 中等任务：拆成阶段、模块或工作包，明确每个 Builder 应做什么。
- 复杂任务：拆成多轮计划，定义依赖关系、验收标准和风险检查点。
- 模糊任务：先提出澄清问题，或给出假设版计划并标注需要确认的部分。

Planner 输出必须包含：
- 任务目标
- 拆解方式：步骤、模块、工作包或直接执行
- 每个工作包的输入、输出、边界
- Tester 的验证标准
- 是否建议 Reviewer 在结束后复盘

---

## 4. Builder

Builder 是执行者。它可以拥有较大的工具权限，因为它负责真正完成任务，包括代码、文档、调研、配置、分析、文件操作等。

Builder 的边界：
- 按 Planner 的目标和工作包执行。
- 可以在必要时做合理偏离，但必须记录 `deviations`。
- 如果发现计划不可执行，应停止并交回 Planner 或主 Agent。
- 不能把"完成了动作"等同于"完成了任务"，必须说明产出如何对应计划。

Builder 输出必须包含：
- 完成了哪些工作包
- 产出了什么
- 修改了哪些文件或状态
- 有哪些阻塞、假设和偏离
- 建议 Tester 验证什么

---

## 5. Tester

Tester 是验证者。它不只运行测试，也验证"计划是否被完成"和"结果是否满足原目标"。

Tester 的判断包括：
- **pass**：计划完成，结果符合验收标准，没有关键偏离。
- **partial**：部分完成，或存在可接受缺口，需要 Builder 继续。
- **fail**：任务未完成、结果错误、无法验证或偏离严重。
- **deviated**：执行明显偏离原计划，需要 Reviewer 判断偏离是否合理。

Tester 的下一步建议：
- 任务未完成：交回 Builder 继续执行。
- 计划不充分：交回 Planner 重新规划。
- 偏离轨道：交给 Reviewer 审查偏离。
- 已完成：交给主 Agent 收尾；必要时主动调用 Reviewer 做经验沉淀。

---

## 6. Reviewer

Reviewer 是流程审查者和经验沉淀者，有两种调用场景：

### 6.1 主动复盘

当任务按步骤完成后，主 Agent 可以调用 Reviewer，总结本轮和 Agent 的交流、判断、计划和执行方式，提炼可沉淀的经验。

输出重点：
- 哪些决策有效
- 哪些提示或约束值得加入 JVibe
- 哪些角色边界需要调整
- 是否建议写入规范、skill、prompt 或 runtime 默认行为

### 6.2 偏离审查

当 Tester 发现执行偏离计划时，Reviewer 判断偏离是否合理。

审查结论：
- **accept_deviation**：偏离合理，接受 Builder 的结果，并补充记录为什么合理。
- **revise_plan**：计划本身不足，交回 Planner 重新规划。
- **redo_build**：Builder 偏离不合理，要求 Builder 按计划重做。
- **needs_human**：偏离涉及用户偏好或关键取舍，需要用户确认。

---

## 7. 默认调用策略

模型可以自行决定调用时机，但默认遵循 `kernel/orchestration.md` 定义的调度策略。该策略由 `.jvibe/extensions/jvibe-kernel.ts` 注入到每轮 `before_agent_start`。

用户不需要显式输入 `/run planner`、`/chain` 或 `/jvibe-plan`。这些命令保留为调试和手动控制入口。

---

## 8. 定义来源

| 文件 | 用途 | 说明 |
|------|------|------|
| `kernel/contracts.yaml` | 契约 SoT | 定义输入输出结构和硬规则 |
| `kernel/orchestration.md` | 调度策略 | 默认调用规则 |
| `.jvibe/extensions/jvibe-kernel.ts` | 默认调度注入 | 将策略嵌入每轮 agent 启动上下文 |
| `.jvibe/agents/*.md` | 运行时定义 | v0.1 可运行角色文件，由 subagent package 发现 |
| `state/tasks.yaml` | 任务交接 | 记录 active/archive 任务 |

当不同文件冲突时，以 `kernel/contracts.yaml` 为准。

---

## 9. JVibe Subagent 文件映射

| 角色 | JVibe 文件 | 权限边界 | 默认输出 |
|------|---------|----------|----------|
| Planner | `.jvibe/agents/planner.md` | 只读，负责任务拆解和验收标准 | `plan.md` |
| Builder | `.jvibe/agents/builder.md` | 读写、bash、MCP proxy | `builder-result.md` |
| Tester | `.jvibe/agents/tester.md` | 只读、bash、MCP proxy | `test-result.md` |
| Reviewer | `.jvibe/agents/reviewer.md` | 只读、bash | `review.md` |

---

## 10. 命名与调整规则

- 子 Agent 名称统一为：`planner`、`builder`、`tester`、`reviewer`。
- 新增角色必须先补齐 contract，再决定它应该落为 prompt、skill、extension 还是 runtime 内置能力。
- 删除或合并角色前，必须确认没有 active 任务指向该角色。
- Reviewer 产出的经验不自动写入规范；由主 Agent 判断是否询问用户持久化。
