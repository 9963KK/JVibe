import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { spawnSync } from "node:child_process";
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

function getGitBranch(cwd: string): string {
	const result = spawnSync("git", ["--no-optional-locks", "branch", "--show-current"], {
		cwd,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "ignore"],
	});
	const branch = result.stdout?.trim();
	return branch || "detached";
}

function formatContextUsage(ctx: ExtensionContext): string {
	const usage = ctx.getContextUsage?.();
	if (usage?.percent === null || usage?.percent === undefined) return "ctx: n/a";
	return `ctx: ${Math.round(usage.percent)}%`;
}

function formatTools(runtime: ExtensionAPI): string {
	try {
		const tools = runtime.getActiveTools?.() ?? [];
		return tools.length > 0 ? `tools: ${tools.length}` : "tools: auto";
	}
	catch {
		return "tools: auto";
	}
}

function buildWorkbenchHeader(ctx: ExtensionContext, runtime: ExtensionAPI) {
	return (_tui: unknown, theme: Theme) => {
		const width = Math.max(64, Math.min((process.stdout.columns || 96) - 2, 140));
		const compact = width < 90;
		const project = shortPath(ctx.cwd, compact ? 20 : Math.min(40, Math.floor(width * 0.3)));
		const branch = getGitBranch(ctx.cwd);
		const model = truncateToWidth(ctx.model?.id ?? "default", compact ? 16 : 28, "...");
		const status = [
			theme.bold(theme.fg("accent", "JVibe")),
			theme.bold(project),
			compact ? theme.fg("success", branch) : `${theme.fg("muted", "branch:")} ${theme.fg("success", branch)}`,
			compact ? theme.fg("accent", model) : `${theme.fg("muted", "model:")} ${theme.fg("accent", model)}`,
			formatContextUsage(ctx),
			...(width >= 88 ? [formatTools(runtime)] : []),
			...(width >= 104 ? [`${theme.fg("success", "online")} mcp: auto`] : []),
		].join(theme.fg("dim", "  |  "));

		const flowItems = width < 90
			? [theme.fg("success", "Builder active"), "auto orchestration"]
			: [theme.fg("success", "Builder active"), "auto orchestration", "Planner -> Builder -> Tester -> Reviewer"];
		const flow = flowItems.join(theme.fg("dim", "  ·  "));

		const box = new Container();
		box.addChild(new Spacer(1));
		box.addChild(new Text(status, 1, 0));
		box.addChild(new Text(flow, 1, 0));
		box.addChild(new Spacer(1));
		return box;
	};
}

export default function jvibeKernel(runtime: ExtensionAPI) {
	runtime.on("session_start", (_event, ctx) => {
		if (!ctx.hasUI) return;
		ctx.ui.setTitle("JVibe");
		ctx.ui.setHeader(buildWorkbenchHeader(ctx, runtime));
		ctx.ui.setStatus("jvibe", "auto");
		ctx.ui.setStatus("roles", undefined);
		ctx.ui.setWorkingMessage("Working");
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
