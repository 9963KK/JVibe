# JVibe 调度策略

> 内核的默认 Agent 调度策略。不是死规则，Agent 可在合理范围内偏离，但偏离必须记录。

---

## 1. 任务分类

每收到一个任务请求，主 Agent 先分类：

| 分类 | 特征 | 动作 |
|------|------|------|
| **direct** | 琐碎、单步、无歧义 | 直接回答或执行，不调用子 Agent |
| **plan-needed** | 模糊、多步骤、跨文件、有风险 | 调用 Planner |
| **build-needed** | 已有明确计划或单个工作包可执行 | 调用 Builder |
| **verify-needed** | Builder 完成、有验收标准 | 调用 Tester |
| **review-needed** | Tester 判定偏离、或任务完成值得沉淀 | 调用 Reviewer |

---

## 2. 默认循环

```
需求理解 → Planner 拆解 → Builder 执行 → Tester 验证 → Reviewer 审查/沉淀 → 收尾
```

### 2.1 触发条件

Planner、Builder、Tester、Reviewer 是默认内部工作机制，不是用户必须手动输入的命令。主 Agent 根据任务特征自行决定调用，只在需要解释执行路径时简要说明。

`/jvibe-plan`、`/jvibe-keepgo`、`/jvibe-review` 等命令保留为调试和手动控制入口。

### 2.2 详细规则

| 情况 | 调用 |
|------|------|
| 用户目标模糊、跨多个文件/主题、需要拆解 | Planner |
| 已有明确计划或单个工作包可执行 | Builder |
| Builder 完成后、用户要求验证、任务有验收标准 | Tester |
| Tester 判定未完成 | Builder |
| Tester 判定计划不足 | Planner |
| Tester 判定执行偏离 | Reviewer |
| 任务完成且值得沉淀经验 | Reviewer |

---

## 3. 循环规则

### 3.1 Tester 结果路由

| Tester 判定 | 路由目标 | 说明 |
|-------------|----------|------|
| `pass` | main | 任务完成，收尾 |
| `partial` | builder | 部分完成，继续执行 |
| `fail`（计划不足） | planner | 重新规划 |
| `fail`（执行不足） | builder | 按计划重做 |
| `deviated` | reviewer | 审查偏离是否合理 |

### 3.2 Reviewer 结果路由

| Reviewer 判定 | 路由目标 | 说明 |
|---------------|----------|------|
| `accept_deviation` | main | 偏离合理，接受结果 |
| `capture_learning` | main | 经验已记录，收尾 |
| `revise_plan` | planner | 计划不足，重新规划 |
| `redo_build` | builder | 偏离不合理，重做 |
| `needs_human` | main | 需用户确认 |

---

## 4. 子 Agent 职责边界

| 角色 | 核心问题 | 默认职责 | 权限 |
|------|----------|----------|------|
| Planner | 这件事应该怎么拆？ | 任务理解、拆解、验收标准、分派建议 | 只读 |
| Builder | 现在具体要做什么？ | 执行计划、产出结果、记录偏差和阻塞 | 读写 |
| Tester | 做完了吗？做对了吗？ | 验证计划完成度、检查结果和偏离 | 只读 + bash |
| Reviewer | 这条路径是否值得保留？ | 审查流程、判断偏离合理性、沉淀经验 | 只读 + bash |

---

## 5. 交接协议

所有子 Agent 输入输出遵循 `kernel/contracts.yaml` 定义的格式。

- **task_input**：包含 `type`、`goal`、`feature_id`、`plan` 等字段的 YAML
- **result**：包含 `feature_id`、完成状态、产出、偏离等字段的 YAML
- **handoff**：指定 `target`（下一个 Agent）、`reason`、`payload`

---

## 6. Reviewer 经验处理

Reviewer 产出的经验是建议，不是命令：

- **不自动写入**长期规则、spec、skill、prompt 或文档
- 主 Agent 判断是否询问用户持久化
- 用户明确要求持久化时才写入目标位置

---

## 7. 异常处理

| 异常 | 行为 |
|------|------|
| `subagent` 工具不可用 | 主 Agent 内部模拟角色行为，说清做了什么 |
| Planner 返回澄清请求 | 暂停执行，将问题呈现给用户 |
| Builder 报告阻塞 | 尝试绕过、降级或交回 Planner |
| Tester 无法验证 | 标记 `not_checked`，记录原因 |
| 循环超过 3 轮 | 主 Agent 介入汇总，询问用户 |
