---
description: Ask JVibe Planner to decompose a task into work packages and acceptance criteria.
argument-hint: "<task>"
---

Use the `planner` project subagent to plan this task:

$@

Requirements:
- Use project agent discovery (`agentScope: "project"` or equivalent).
- Return the Planner YAML result to the parent conversation.
- Do not implement changes.
- Ensure the output includes `work_packages` and `acceptance_criteria`.
