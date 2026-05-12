import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

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
	return truncateToWidth(normalized, Math.max(12, width), "...");
}

function formatContextUsage(ctx: ExtensionContext): string {
	const usage = ctx.getContextUsage?.();
	if (usage?.percent === null || usage?.percent === undefined) return "ctx: n/a";
	return `ctx: ${Math.round(usage.percent)}%`;
}

function formatTools(runtime: ExtensionAPI): string | undefined {
	try {
		const tools = runtime.getActiveTools?.() ?? [];
		return tools.length > 0 ? `tools ${tools.length}` : undefined;
	}
	catch {
		return undefined;
	}
}

type FooterData = {
	getGitBranch(): string | null;
	getExtensionStatuses(): ReadonlyMap<string, string>;
};

function getMcpStatus(footerData: FooterData): string | undefined {
	const mcpStatus = Array.from(footerData.getExtensionStatuses().values()).find((status) => status.includes("MCP:"));
	if (!mcpStatus) return undefined;
	return mcpStatus.replace(/^MCP:\s*/i, "mcp ");
}

function oneLine(parts: string[], width: number, separator: string): string {
	const visibleSeparatorWidth = visibleWidth(separator);
	const result: string[] = [];
	let remaining = width;
	for (const part of parts) {
		const separatorWidth = result.length === 0 ? 0 : visibleSeparatorWidth;
		const partWidth = visibleWidth(part);
		if (separatorWidth + partWidth <= remaining) {
			result.push(part);
			remaining -= separatorWidth + partWidth;
			continue;
		}

		const available = remaining - separatorWidth;
		if (available > 8) {
			result.push(truncateToWidth(part, available, "..."));
		}
		break;
	}
	return result.join(separator);
}

function buildMinimalFooter(ctx: ExtensionContext, runtime: ExtensionAPI) {
	return (_tui: unknown, theme: Theme, footerData: FooterData): Component => {
		return {
			invalidate() {},
			render(width: number): string[] {
				const compact = width < 90;
				const project = shortPath(ctx.cwd, compact ? 24 : 36);
				const branch = footerData.getGitBranch();
				const model = truncateToWidth(ctx.model?.id ?? "unknown", compact ? 18 : 30, "...");
				const tools = formatTools(runtime);
				const mcp = getMcpStatus(footerData);
				const parts = [
					theme.bold(theme.fg("accent", "jvibe")),
					theme.bold(project),
					...(branch ? [theme.fg("success", branch)] : []),
					theme.fg("accent", model),
					formatContextUsage(ctx),
					...(tools ? [tools] : []),
					...(mcp && !compact ? [theme.fg("accent", mcp)] : []),
					"auto",
				];
				return [oneLine(parts, width, theme.fg("dim", "  ·  "))];
			},
		};
	};
}

export default function jvibeKernel(runtime: ExtensionAPI) {
	runtime.on("session_start", (_event, ctx) => {
		if (!ctx.hasUI) return;
		ctx.ui.setTitle("JVibe");
		ctx.ui.setHeader(() => ({ invalidate() {}, render: () => [] }));
		ctx.ui.setFooter(buildMinimalFooter(ctx, runtime));
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
