import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { Container, Spacer, Text, truncateToWidth } from "@earendil-works/pi-tui";

const JVIBE_KERNEL_PROMPT = `
## JVibe Kernel Orchestration

You are running inside JVibe, a personal agent runtime. JVibe's Planner / Builder / Tester / Reviewer flow is a default runtime behavior, not a user-facing command ritual.

Use the project subagents implicitly when they materially improve the task:

- Use project \`planner\` when the user goal is ambiguous, multi-step, cross-file, risky, or benefits from explicit work packages and acceptance criteria.
- Use project \`builder\` when a planned work package should be executed in a focused child session, especially when parallel or isolated implementation would reduce drift.
- Use project \`tester\` after implementation, document changes, configuration changes, or any task with acceptance criteria.
- Use project \`reviewer\` when Tester reports \`deviated\`, when a deviation needs judgment, or when a completed workflow has reusable lessons worth proposing.

Default loop:
1. Classify the task: direct, plan-needed, build-needed, verify-needed, or review-needed.
2. For tiny direct tasks, answer or act directly without ceremony.
3. For non-trivial tasks, inspect available subagents if needed, then prefer \`agentScope: "project"\` for \`planner\`, \`builder\`, \`tester\`, and \`reviewer\`.
4. Keep the parent session responsible for orchestration, user communication, final synthesis, and deciding whether to persist Reviewer lessons.
5. Do not ask the user to invoke \`/run\`, \`/chain\`, or \`/jvibe-*\` unless they explicitly ask for command-level usage. Those commands are diagnostic and convenience paths, not the normal JVibe interface.
6. If the \`subagent\` tool is unavailable, continue using the same roles internally and say only what matters to the user.

Role contracts live in \`kernel/contracts.yaml\`. Runtime role prompts live in \`.jvibe/agents/\`. When these conflict, treat the contract as the source of truth and the runtime prompts as executable role adapters.

Reviewer lessons are proposals only. Do not automatically write long-term rules, specs, skills, prompts, or documentation from Reviewer output unless the parent agent decides to ask the user or the user has already requested persistence.
`;

function shortPath(cwd: string, width: number): string {
	const home = process.env.HOME;
	const normalized = home && cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd;
	return truncateToWidth(normalized, Math.max(24, width), "...");
}

function buildWorkbenchHeader(ctx: ExtensionContext) {
	return (_tui: unknown, theme: Theme) => {
		const width = Math.max(56, Math.min((process.stdout.columns || 96) - 4, 112));
		const line = theme.fg("dim", "-".repeat(width));
		const project = shortPath(ctx.cwd, Math.floor(width * 0.56));
		const model = ctx.model?.id ?? "default";
		const usage = ctx.getContextUsage?.();
		const context = usage?.percent === null || usage?.percent === undefined
			? "ctx n/a"
			: `ctx ${Math.round(usage.percent)}%`;

		const title = [
			theme.bold(theme.fg("accent", "JVIBE WORKBENCH")),
			theme.fg("dim", "personal agent runtime"),
			theme.fg("dim", "v0.1"),
		].join("  ");
		const runtime = [
			`${theme.fg("muted", "proj")} ${theme.bold(project)}`,
			`${theme.fg("muted", "model")} ${model}`,
			`${theme.fg("muted", "ready")}`,
			`${theme.fg("muted", context)}`,
		].join(theme.fg("dim", "  |  "));
		const roles = [
			`${theme.fg("muted", "roles")} ${theme.fg("accent", "Planner")} > ${theme.fg("accent", "Builder")} > ${theme.fg("accent", "Tester")} > ${theme.fg("accent", "Reviewer")}`,
			`${theme.fg("muted", "mcp")} .mcp.json`,
			`${theme.fg("muted", "idx")} .jvibe`,
		].join(theme.fg("dim", "  |  "));
		const controls = [
			`${theme.fg("muted", "enter")} send`,
			`${theme.fg("muted", "/")} command palette`,
			`${theme.fg("muted", "!")} shell`,
			`${theme.fg("muted", "ctrl+c")} interrupt`,
		].join(theme.fg("dim", "  |  "));

		const box = new Container();
		box.addChild(new Spacer(1));
		box.addChild(new Text(line, 1, 0));
		box.addChild(new Text(truncateToWidth(title, width, ""), 1, 0));
		box.addChild(new Text(truncateToWidth(runtime, width, ""), 1, 0));
		box.addChild(new Text(truncateToWidth(roles, width, ""), 1, 0));
		box.addChild(new Text(truncateToWidth(controls, width, ""), 1, 0));
		box.addChild(new Text(line, 1, 0));
		box.addChild(new Spacer(1));
		return box;
	};
}

export default function jvibeKernel(runtime: ExtensionAPI) {
	runtime.on("session_start", (_event, ctx) => {
		if (!ctx.hasUI) return;
		ctx.ui.setTitle("JVibe Workbench");
		ctx.ui.setHeader(buildWorkbenchHeader(ctx));
		ctx.ui.setStatus("jvibe", "JVibe Workbench");
		ctx.ui.setStatus("roles", "Planner/Builder/Tester/Reviewer");
		ctx.ui.setWorkingMessage("JVibe is working");
	});

	runtime.on("before_agent_start", async (event) => {
		const prompt = event.prompt?.toLowerCase() ?? "";
		if (prompt.includes("jvibe kernel:off") || prompt.includes("disable jvibe kernel")) {
			return undefined;
		}

		return {
			systemPrompt: `${event.systemPrompt}\n\n${JVIBE_KERNEL_PROMPT}`,
		};
	});
}
