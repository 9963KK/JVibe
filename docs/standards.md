# JVibe 规范索引

> 编码规范、文档编写规则、任务流程的入口。具体条目见 [参考材料](./appendix.md)。

---

## 1. 文档体系（已内核化）

```
JVibe/
├── kernel/               ← 内核（契约 + 调度）
│   ├── README.md
│   ├── contracts.yaml    ← Agent I/O 契约 SoT
│   └── orchestration.md  ← 默认调度策略
│
├── state/                ← 运行时状态
│   ├── tasks.yaml        ← 任务交接
│   └── features.yaml     ← 功能追踪（替代原 Feature-List.md）
│
├── config/               ← 配置
│   └── plugins.yaml      ← 插件注册表
│
├── docs/                 ← 人读文档
│   ├── README.md         ← 索引入口
│   ├── architecture.md   ← 系统架构
│   ├── kernel-design.md  ← 内核设计决策
│   ├── agent-system.md   ← Agent 系统
│   ├── extension-system.md ← 扩展机制
│   ├── evolution.md      ← 演化路线
│   ├── standards.md      ← 本文件
│   └── appendix.md       ← 参考材料
│
├── skills/               ← 技能
└── legacy/               ← 过渡资产
```

---

## 2. 任务流程

```
需求理解 → Planner 拆解 → Builder 执行 → Tester 验证 → Reviewer 审查/沉淀 → 收尾
```

### 2.1 任务添加

用户通过自然语言描述需求，JVibe 自动识别意图并决定是否调用 Planner。

| 用户说... | JVibe 识别为 | 执行动作 |
|-----------|-------------|----------|
| "添加用户注册功能" | 添加功能 | 调用 Planner |
| "重新设计 Agent 角色" | 架构/流程设计 | 调用 Planner |
| "整理这轮经验" | 复盘沉淀 | 调用 Reviewer |
| "把这份文档改成新版结构" | 文档任务 | Planner 或 Builder |

### 2.2 各角色操作

| 角色 | 操作 | 产出 |
|------|------|------|
| Planner | 拆解任务、定义边界和验收标准 | plan / work_packages |
| Builder | 执行计划、记录产出和偏离 | completed_work / outputs |
| Tester | 验证计划完成度和结果质量 | verdict / next_action |
| Reviewer | 审查流程、判断偏离、沉淀经验 | review_decision / lessons |

### 2.3 任务执行检查清单

- [ ] 需要追踪的任务在 `state/features.yaml` 创建条目
- [ ] Planner 给出验收标准
- [ ] Builder 记录完成项、产出、阻塞和偏离
- [ ] Tester 给出 `pass` / `partial` / `fail` / `deviated`
- [ ] 偏离或值得沉淀时调用 Reviewer
- [ ] 必要时更新功能状态

---

## 3. 文档更新规则

| 变更类型 | 需更新 |
|----------|--------|
| Agent 契约变更 | `kernel/contracts.yaml` + `docs/agent-system.md` |
| 调度策略变更 | `kernel/orchestration.md` |
| 新增功能 | `state/features.yaml` |
| 新增规范/标准 | `docs/appendix.md` |
| 架构变更 | `docs/architecture.md` |
| 新增扩展/技能 | `.jvibe/extensions/` 或 `skills/` |

---

## 4. 输出协议

- 默认使用 fenced block 输出（```yaml / ```json）
- 超过 12 行必须结构化输出，避免长段落总结
- **统一字段命名**：`feature_id`、`handoff`、`doc_updates`
- 子 Agent 输入输出严格遵循 `kernel/contracts.yaml`

---

## 5. 环境隔离

```yaml
env_isolation:
  required: true
  forbid: [base, global]
  allowed:
    - .venv
    - .conda
  install:
    python: "<env>/bin/python -m pip install ..."
    node: "npm ci (project root)"
```

---

## 6. PR描述模板

```markdown
## 命中规范条目
- [ ] CS-___ : [说明如何满足]
- [ ] SEC-___ : [说明如何满足]

## 变更说明
...
```
