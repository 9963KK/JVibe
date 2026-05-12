---
description: Continue the current JVibe workflow through planning, building, and testing.
argument-hint: "[task or current context]"
---

Continue the JVibe workflow for:

$@

Use this default loop:
1. If the task is not already decomposed, run `planner`.
2. Run `builder` on the next concrete work package.
3. Run `tester` against the plan and Builder output.
4. If Tester returns `partial` or `fail`, route back to `builder` or `planner` based on the reason.
5. If Tester returns `deviated`, run `reviewer` for deviation judgment.
6. If the task is complete and there is a useful process lesson, run `reviewer` for a retrospective proposal.

Keep the parent response focused on the current outcome, changed files, verification, and next action.
