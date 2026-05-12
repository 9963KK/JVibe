import {
	AssistantMessageComponent,
	CustomMessageComponent,
	CustomEditor,
	ToolExecutionComponent,
	UserMessageComponent,
	type ExtensionAPI,
	type ExtensionContext,
	type KeybindingsManager,
	type Theme,
} from "@earendil-works/pi-coding-agent";
import type { Component, EditorTheme, TUI } from "@earendil-works/pi-tui";
import { CURSOR_MARKER, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

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

const JVIBE_THEME_NAME = "jvibe-opencode-light";
const CLEAR_VIEWPORT = "\x1b[2J\x1b[H";
const OSC133_ZONE_START = "\x1b]133;A\x07";
const OSC133_ZONE_END = "\x1b]133;B\x07";
const OSC133_ZONE_FINAL = "\x1b]133;C\x07";
const WIDE_LAYOUT_COLUMNS = 120;
const SIDEBAR_WIDTH = 42;
const SIDEBAR_GAP = 4;
const COMPOSER_BOTTOM_PADDING = 2;
const PROMPT_BG = "#F3F5F7";
const TEXT = "#252A31";
const MUTED = "#6F7782";
const DIM = "#9AA2AB";
const PANEL_BORDER = "#C8D0D8";
const ACCENT = "#00C8D7";
const SUCCESS = "#2F9E55";
let sidebarRenderActive = false;

type RoleKey = "user" | "jvibe" | "planner" | "builder" | "tester" | "reviewer" | "subagent";

const ROLE_BADGES: Record<RoleKey, { label: string; icon: string; color: string }> = {
	user: { label: "User", icon: "●", color: "#2F7DCE" },
	jvibe: { label: "JVibe", icon: "✦", color: ACCENT },
	planner: { label: "Planner", icon: "◇", color: "#B7791F" },
	builder: { label: "Builder", icon: "▣", color: SUCCESS },
	tester: { label: "Tester", icon: "✓", color: "#2F7DCE" },
	reviewer: { label: "Reviewer", icon: "◈", color: "#8A5CF6" },
	subagent: { label: "Subagent", icon: "◆", color: ACCENT },
};

function shortPath(cwd: string, width: number): string {
	const home = process.env.HOME;
	const normalized = home && cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd;
	return truncateToWidth(normalized, Math.max(12, width), "...");
}

function isWideLayout(width: number): boolean {
	return width >= WIDE_LAYOUT_COLUMNS;
}

function mainContentWidth(width: number): number {
	if (!isWideLayout(width)) return width;
	return Math.max(54, width - SIDEBAR_WIDTH - SIDEBAR_GAP);
}

function padToWidth(line: string, width: number): string {
	return `${line}${" ".repeat(Math.max(0, width - visibleWidth(line)))}`;
}

function roleFromText(text: string | undefined): RoleKey | undefined {
	const normalized = text?.toLowerCase() ?? "";
	if (normalized.includes("planner")) return "planner";
	if (normalized.includes("builder")) return "builder";
	if (normalized.includes("tester")) return "tester";
	if (normalized.includes("reviewer")) return "reviewer";
	if (normalized.includes("jvibe")) return "jvibe";
	if (normalized.includes("user")) return "user";
	return undefined;
}

function roleBadge(role: RoleKey, colorOverride?: string): string {
	const badge = ROLE_BADGES[role];
	const color = colorOverride ?? badge.color;
	return `${ansiRgb(color, badge.icon)} ${ansiRgb(color, badge.label)}`;
}

function roleLabel(label: string): string {
	const role = roleFromText(label) ?? "subagent";
	return `${ROLE_BADGES[role].icon} ${label}`;
}

function roleFromArgs(args: Record<string, unknown> | undefined): RoleKey | undefined {
	if (!args) return undefined;
	const keys = ["agentName", "agent", "subagent", "role", "name", "type"];
	for (const key of keys) {
		const value = args[key];
		if (typeof value !== "string") continue;
		const role = roleFromText(value);
		if (role) return role;
	}
	return undefined;
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

type WelcomeStatusSnapshot = {
	branch?: string;
	mcp?: string;
};

function getMcpStatus(footerData: FooterData): string | undefined {
	const mcpStatus = Array.from(footerData.getExtensionStatuses().values()).find((status) => status.includes("MCP:"));
	if (!mcpStatus) return undefined;
	return mcpStatus.replace(/^.*?MCP:\s*/i, "");
}

function renderSessionPanel(ctx: ExtensionContext, runtime: ExtensionAPI, snapshot: WelcomeStatusSnapshot, width: number, compact = false): string[] {
	const innerWidth = Math.max(24, width - 3);
	const model = truncateToWidth(ctx.model?.id ?? "unknown", Math.max(10, innerWidth - 9), "...");
	const tools = formatTools(runtime)?.replace(/^tools\s+/, "") ?? "0";
	const mcp = stripAnsi(snapshot.mcp?.replace(/^mcp\s+/, "") || "auto");
	const branch = stripAnsi(snapshot.branch || "unknown");
	const project = shortPath(ctx.cwd, Math.max(10, innerWidth - 9));
	const context = formatContextUsage(ctx).replace(/^ctx:\s*/, "");
	const section = (text: string) => bold(ansiRgb(TEXT, text));
	const label = (text: string) => ansiRgb(MUTED, text);
	const value = (text: string) => ansiRgb(TEXT, text);
	const bullet = (color: string, text: string) => `${ansiRgb(color, "•")} ${text}`;
	const line = (content = "") => {
		const trimmed = truncateToWidth(content, innerWidth, "...");
		const padding = " ".repeat(Math.max(0, innerWidth - visibleWidth(trimmed)));
		return `  ${trimmed}${padding}`;
	};

	if (compact) {
		return [
			line(`${section("JVibe")} ${label(project)}`),
			line(`${label(context)} ${label("ctx")}  ${label(tools)} ${label("tools")}  ${bullet(mcp.includes("0/") ? DIM : SUCCESS, label(mcp))}`),
			line(`${label("model")} ${value(model)}  ${label("branch")} ${value(branch)}`),
		];
	}

	return [
		line(section("JVibe")),
		line(label(project)),
		line(),
		line(section("Context")),
		line(label(`${context} used`)),
		line(label(`${tools} tools`)),
		line(),
		line(section("Agents")),
		line(`${roleBadge("builder")} ${label("active")}`),
		line(`${roleBadge("planner")} ${label("->")} ${roleBadge("builder")}`),
		line(`${roleBadge("tester")} ${label("->")} ${roleBadge("reviewer")}`),
		line(),
		line(section("MCP")),
		line(bullet(mcp.includes("0/") ? DIM : SUCCESS, label(mcp))),
		line(),
		line(section("Runtime")),
		line(`${label("model")} ${value(model)}`),
		line(`${label("branch")} ${value(branch)}`),
	];
}

type SidebarTUI = TUI & {
	__jvibeSidebarPatched?: boolean;
	__jvibeSidebarState?: {
		ctx: ExtensionContext;
		runtime: ExtensionAPI;
		getStatusSnapshot: () => WelcomeStatusSnapshot;
	};
	render(width: number): string[];
};

function composeSidebarRows(left: string[], right: string[], leftWidth: number, gap: number): string[] {
	const rowCount = Math.max(left.length, right.length);
	const rail = ansiRgb(PANEL_BORDER, "│");
	return Array.from({ length: rowCount }, (_, index) => {
		const leftLine = truncateToWidth(left[index] ?? "", leftWidth, "");
		const rightLine = right[index] ?? "";
		return `${padToWidth(leftLine, leftWidth)}${" ".repeat(gap)}${rail}${rightLine}`;
	});
}

function findComposerStart(lines: string[]): number {
	const markerIndex = lines.findLastIndex((line) => {
		const clean = stripAnsi(line);
		return clean.includes("Ask JVibe anything") || clean.includes("ctrl+p") || clean.includes("commands");
	});
	if (markerIndex === -1) return -1;

	for (let index = markerIndex; index >= 0; index--) {
		if (stripAnsi(lines[index]).includes("┌")) return index;
	}
	return markerIndex;
}

function pinComposerToBottom(lines: string[], terminalRows: number): string[] {
	const composerStart = findComposerStart(lines);
	if (composerStart === -1 || terminalRows <= 0) return lines;

	const spacerCount = Math.max(0, terminalRows - lines.length - COMPOSER_BOTTOM_PADDING);
	if (spacerCount === 0) return lines;

	return [
		...lines.slice(0, composerStart),
		...emptyLines(spacerCount),
		...lines.slice(composerStart),
	];
}

function installSidebarRenderer(tui: TUI, state: NonNullable<SidebarTUI["__jvibeSidebarState"]>): void {
	const patchable = tui as SidebarTUI;
	patchable.__jvibeSidebarState = state;
	if (patchable.__jvibeSidebarPatched) return;

	const originalRender = patchable.render.bind(tui);
	patchable.render = (width: number): string[] => {
		const current = patchable.__jvibeSidebarState;
		if (!current || !isWideLayout(width) || !hasVisibleConversation(current.ctx)) {
			return originalRender(width);
		}

		const leftWidth = mainContentWidth(width);
		sidebarRenderActive = true;
		try {
			const rows = (patchable as { terminal?: { rows?: number } }).terminal?.rows ?? 0;
			const left = pinComposerToBottom(originalRender(leftWidth), rows);
			const right = renderSessionPanel(current.ctx, current.runtime, current.getStatusSnapshot(), SIDEBAR_WIDTH);
			return composeSidebarRows(left, right, leftWidth, SIDEBAR_GAP);
		}
		finally {
			sidebarRenderActive = false;
		}
	};
	patchable.__jvibeSidebarPatched = true;
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

function ansiRgb(hex: string, text: string): string {
	const normalized = hex.replace("#", "");
	const r = Number.parseInt(normalized.slice(0, 2), 16);
	const g = Number.parseInt(normalized.slice(2, 4), 16);
	const b = Number.parseInt(normalized.slice(4, 6), 16);
	return `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`;
}

function ansiBg(hex: string, text: string): string {
	const normalized = hex.replace("#", "");
	const r = Number.parseInt(normalized.slice(0, 2), 16);
	const g = Number.parseInt(normalized.slice(2, 4), 16);
	const b = Number.parseInt(normalized.slice(4, 6), 16);
	return `\x1b[48;2;${r};${g};${b}m${text}\x1b[49m`;
}

function bold(text: string): string {
	return `\x1b[1m${text}\x1b[22m`;
}

function centerLine(line: string, width: number): string {
	const padding = Math.max(0, Math.floor((width - visibleWidth(line)) / 2));
	return `${" ".repeat(padding)}${line}`;
}

function centerBlock(lines: string[], width: number): string[] {
	return lines.map((line) => centerLine(line, width));
}

function emptyLines(count: number): string[] {
	return Array.from({ length: Math.max(0, count) }, () => "");
}

function hasVisibleConversation(ctx: ExtensionContext): boolean {
	return ctx.sessionManager.getEntries().some((entry) => entry.type === "message" || entry.type === "custom_message");
}

function stripShellZone(line: string): string {
	return line
		.replace(/\x1b\][^\x07]*\x07/g, "")
		.replaceAll(OSC133_ZONE_START, "")
		.replaceAll(OSC133_ZONE_END, "")
		.replaceAll(OSC133_ZONE_FINAL, "");
}

function stripAnsi(line: string): string {
	return stripShellZone(line).replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "");
}

function normalizeMessageBody(lines: string[]): string[] {
	const normalized = lines
		.map((line) => stripAnsi(line).trimEnd())
		.map((line) => line.trim().length === 0 ? "" : line.trimStart())
		.filter((line, index, all) => {
			if (line.trim().length > 0) return true;
			const hasBefore = all.slice(0, index).some((item) => item.trim().length > 0);
			const hasAfter = all.slice(index + 1).some((item) => item.trim().length > 0);
			return hasBefore && hasAfter;
		});
	return normalized.length > 0 ? normalized : [""];
}

function decorateTimelineLines(lines: string[], width: number, label: string, color: string, accent = false): string[] {
	if (lines.length === 0) return lines;
	const clean = normalizeMessageBody(lines);
	const displayLabel = roleLabel(label);
	const meta = `${ansiRgb("#9AA2AB", "     ")}${accent ? bold(ansiRgb(color, displayLabel)) : ansiRgb(color, displayLabel)}`;
	const body = clean.map((line) => truncateToWidth(`  ${line}`, width, "..."));
	return [
		`${OSC133_ZONE_START}${truncateToWidth(meta, width, "...")}`,
		...body,
		`${OSC133_ZONE_END}${OSC133_ZONE_FINAL}`,
	];
}

type ToolExecutionLike = {
	toolName?: string;
	args?: Record<string, unknown>;
	result?: {
		content?: Array<{ type: string; text?: string }>;
		isError?: boolean;
		details?: unknown;
	};
	isPartial?: boolean;
	executionStarted?: boolean;
};

type CustomMessageLike = {
	message?: {
		customType?: string;
		content?: string | Array<{ type?: string; text?: string }>;
	};
	_expanded?: boolean;
};

function stringArg(args: Record<string, unknown> | undefined, key: string): string | undefined {
	const value = args?.[key];
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function shortInline(text: string | undefined, fallback: string, maxWidth = 58): string {
	if (!text) return fallback;
	return truncateToWidth(text.replace(/\s+/g, " "), maxWidth, "...");
}

function summarizeToolExecution(tool: ToolExecutionLike): string {
	const name = tool.toolName ?? "tool";
	const args = tool.args;
	const path = stringArg(args, "path") ?? stringArg(args, "file") ?? stringArg(args, "filePath");
	const pattern = stringArg(args, "pattern") ?? stringArg(args, "query");
	const command = stringArg(args, "command") ?? stringArg(args, "cmd");
	const failed = tool.result?.isError === true;
	const pending = tool.isPartial === true || (tool.executionStarted === true && !tool.result);
	const icon = failed ? "!" : pending ? "->" : "✓";
	const verb = failed ? "failed" : pending ? "using" : "used";
	const agentRole = roleFromText(name) ?? roleFromArgs(args);

	if (agentRole && (name.toLowerCase().includes("agent") || name.toLowerCase().includes("subagent"))) {
		const action = failed ? "failed" : pending ? "assigned" : "finished";
		return `${icon} ${ROLE_BADGES[agentRole].icon} ${ROLE_BADGES[agentRole].label} ${action}`;
	}

	switch (name) {
		case "read":
			return `${icon} read ${shortInline(path, "file")}`;
		case "write":
			return `${icon} wrote ${shortInline(path, "file")}`;
		case "edit":
			return `${icon} edited ${shortInline(path, "file")}`;
		case "bash":
			return `${icon} ran ${shortInline(command, "command")}`;
		case "grep":
			return `${icon} searched ${shortInline(pattern, "pattern")}${path ? ` in ${shortInline(path, "path", 28)}` : ""}`;
		case "find":
			return `${icon} found ${shortInline(pattern, path ?? "files")}`;
		case "ls":
			return `${icon} listed ${shortInline(path, "directory")}`;
		default:
			return `${icon} ${verb} ${shortInline(name, "tool")}`;
	}
}

function extractCustomMessageText(message: CustomMessageLike["message"]): string {
	const content = message?.content;
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.filter((item) => item.type === "text" && typeof item.text === "string")
		.map((item) => item.text)
		.join("\n");
}

function formatCustomType(customType: string): string {
	if (customType.startsWith("mcp_server_")) {
		return `mcp ${customType.replace(/^mcp_server_/, "").replaceAll("_", ".")}`;
	}
	return customType.replaceAll("_", ".");
}

function classifyPayload(text: string): string {
	const trimmed = text.trim();
	if (!trimmed) return "empty result";
	if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
		try {
			const parsed = JSON.parse(trimmed) as unknown;
			if (parsed && typeof parsed === "object" && "markdown" in parsed) return "markdown result";
			if (parsed && typeof parsed === "object" && "web" in parsed) return "web result";
			return "JSON result";
		}
		catch {
			return "structured result";
		}
	}
	if (/https?:\/\//.test(trimmed)) return "web result";
	if (trimmed.includes("\n")) return "text result";
	return "result";
}

function summarizeCustomMessage(component: CustomMessageLike): string {
	const customType = component.message?.customType ?? "extension";
	const text = extractCustomMessageText(component.message);
	const source = formatCustomType(customType);
	const payload = classifyPayload(text);
	const size = text.trim().length > 0 ? ` · ${text.length.toLocaleString()} chars` : "";
	return `✓ ${source} returned ${payload}${size}`;
}

function installConversationRenderers(): void {
	const userProto = UserMessageComponent.prototype as unknown as { render(width: number): string[]; __jvibeTimeline?: boolean };
	if (!userProto.__jvibeTimeline) {
		const originalUserRender = userProto.render;
		userProto.render = function patchedUserRender(this: unknown, width: number): string[] {
			const contentWidth = mainContentWidth(width);
			return decorateTimelineLines(originalUserRender.call(this, contentWidth), contentWidth, "User", "#2F7DCE");
		};
		userProto.__jvibeTimeline = true;
	}

	const assistantProto = AssistantMessageComponent.prototype as unknown as {
		render(width: number): string[];
		updateContent(message: { content?: Array<{ type?: string }> }): void;
		__jvibeTimeline?: boolean;
	};
	if (!assistantProto.__jvibeTimeline) {
		const originalAssistantRender = assistantProto.render;
		const originalUpdateContent = assistantProto.updateContent;
		assistantProto.updateContent = function patchedAssistantUpdateContent(this: unknown, message: { content?: Array<{ type?: string }> }): void {
			const filteredMessage = {
				...message,
				content: message.content?.filter((content) => content.type !== "thinking") ?? [],
			};
			originalUpdateContent.call(this, filteredMessage);
		};
		assistantProto.render = function patchedAssistantRender(this: unknown, width: number): string[] {
			const contentWidth = mainContentWidth(width);
			return decorateTimelineLines(originalAssistantRender.call(this, contentWidth), contentWidth, "JVibe", "#00C8D7", true);
		};
		assistantProto.__jvibeTimeline = true;
	}

	const toolProto = ToolExecutionComponent.prototype as unknown as { render(width: number): string[]; __jvibeTimeline?: boolean };
	if (!toolProto.__jvibeTimeline) {
		toolProto.render = function patchedToolRender(this: unknown, width: number): string[] {
			const contentWidth = mainContentWidth(width);
			const summary = summarizeToolExecution(this as ToolExecutionLike);
			const clean = stripAnsi(summary);
			const color = clean.startsWith("!") ? "#D24B45" : clean.startsWith("✓") ? "#2F9E55" : "#00C8D7";
			return [truncateToWidth(`  ${ansiRgb(color, clean.slice(0, clean.indexOf(" ") > -1 ? clean.indexOf(" ") : clean.length))}${clean.includes(" ") ? clean.slice(clean.indexOf(" ")) : ""}`, contentWidth, "...")];
		};
		toolProto.__jvibeTimeline = true;
	}

	const customProto = CustomMessageComponent.prototype as unknown as { render(width: number): string[]; __jvibeTimeline?: boolean };
	if (!customProto.__jvibeTimeline) {
		const originalCustomRender = customProto.render;
		customProto.render = function patchedCustomRender(this: unknown, width: number): string[] {
			const component = this as CustomMessageLike;
			if (component._expanded) return originalCustomRender.call(this, width);

			const summary = summarizeCustomMessage(component);
			return [truncateToWidth(`  ${ansiRgb("#2F9E55", "✓")} ${summary.replace(/^✓\s*/, "")}`, mainContentWidth(width), "...")];
		};
		customProto.__jvibeTimeline = true;
	}
}

function buildConversationHeader(ctx: ExtensionContext, runtime: ExtensionAPI, getStatusSnapshot: () => WelcomeStatusSnapshot) {
	return (tui: TUI, _theme: Theme): Component => {
		installSidebarRenderer(tui, { ctx, runtime, getStatusSnapshot });
		return ({
		invalidate() {},
		render(): string[] {
			return [];
		},
	});
	};
}

class JVibeWelcomeEditor extends CustomEditor {
	constructor(
		tui: TUI,
		editorTheme: EditorTheme,
		keybindings: KeybindingsManager,
		private readonly ctx: ExtensionContext,
		private readonly runtime: ExtensionAPI,
		private readonly getStatusSnapshot: () => WelcomeStatusSnapshot,
	) {
		super(tui, editorTheme, keybindings, {
			autocompleteMaxVisible: 8,
			paddingX: 0,
		});
	}

	private hasConversation(): boolean {
		return hasVisibleConversation(this.ctx);
	}

	private renderInputBox(width: number): string[] {
		const innerWidth = Math.max(8, width - 4);
		const lines = super.render(innerWidth);
		let contentLines = lines.length >= 3 ? lines.slice(1, -1) : lines;
		if (contentLines.length === 0) contentLines = [""];

		if (this.getText().length === 0) {
			const placeholder = ansiRgb(MUTED, "Ask JVibe anything...");
			const cursor = `${this.focused ? CURSOR_MARKER : ""}\x1b[7m \x1b[27m`;
			contentLines = [` ${cursor} ${placeholder}`];
		}

		const border = ansiRgb(ACCENT, `┌${"─".repeat(innerWidth + 2)}┐`);
		const bottomBorder = ansiRgb(ACCENT, `└${"─".repeat(innerWidth + 2)}┘`);
		const promptLine = (line: string) => {
			const trimmed = truncateToWidth(line, innerWidth, "...");
			const padding = " ".repeat(Math.max(0, innerWidth - visibleWidth(trimmed)));
			return `${ansiRgb(ACCENT, "│")}${ansiBg(PROMPT_BG, ` ${trimmed}${padding} `)}${ansiRgb(ACCENT, "│")}`;
		};
		const snapshot = this.getStatusSnapshot();
		const branch = stripAnsi(snapshot.branch || "main");
		const model = truncateToWidth(this.ctx.model?.id ?? "unknown", Math.max(10, Math.floor(innerWidth * 0.36)), "...");
		const leftMeta = [
			ansiRgb(ACCENT, "JVibe"),
			ansiRgb(TEXT, model),
			ansiRgb(MUTED, "Ollama Cloud"),
		].join(ansiRgb(DIM, "  ·  "));
		const rightMeta = [
			ansiRgb(TEXT, "tab"),
			ansiRgb(MUTED, "agents"),
			ansiRgb(TEXT, "ctrl+p"),
			ansiRgb(MUTED, "commands"),
		].join(" ");
		const available = Math.max(0, innerWidth - visibleWidth(leftMeta) - visibleWidth(rightMeta) - 2);
		const meta = `${leftMeta}${" ".repeat(available)}${rightMeta}`;
		const footer = `${ansiRgb(DIM, shortPath(this.ctx.cwd, Math.max(16, Math.floor(innerWidth * 0.38))))}${ansiRgb(DIM, "  ·  ")}${ansiRgb(SUCCESS, branch)}${ansiRgb(DIM, "  ·  ")}${formatContextUsage(this.ctx)}`;

		return [
			border,
			...contentLines.map(promptLine),
			promptLine(` ${meta}`),
			bottomBorder,
			ansiRgb(DIM, ` ${footer}`),
		];
	}

	private renderStatusPanel(width: number): string[] {
		return renderSessionPanel(this.ctx, this.runtime, this.getStatusSnapshot(), width);
	}

	private composeColumns(left: string[], right: string[], width: number, gap: number): string[] {
		const contentWidth = width + gap + visibleWidth(stripAnsi(right[0] ?? ""));
		const leftPad = Math.max(0, Math.floor((this.tui.terminal.columns - contentWidth) / 2));
		const rowCount = Math.max(left.length, right.length);
		return Array.from({ length: rowCount }, (_, index) => {
			const leftLine = left[index] ?? "";
			const rightLine = right[index] ?? "";
			const leftPadding = " ".repeat(Math.max(0, width - visibleWidth(leftLine)));
			return `${" ".repeat(leftPad)}${leftLine}${leftPadding}${" ".repeat(gap)}${rightLine}`;
		});
	}

	render(width: number): string[] {
		if (this.hasConversation()) return this.renderInputBox(mainContentWidth(width));

		const columns = Math.max(40, width);
		const rows = Math.max(18, this.tui.terminal.rows);
		const showPanel = columns >= 112;
		const panelWidth = showPanel ? Math.min(36, Math.max(30, Math.floor(columns * 0.22))) : 0;
		const gap = showPanel ? 5 : 0;
		const maxMainWidth = showPanel ? columns - panelWidth - gap - 8 : columns - 10;
		const boxWidth = Math.min(Math.max(52, Math.floor(columns * 0.52)), Math.max(30, maxMainWidth));
		const mainLines = [
			centerLine(bold(ansiRgb("#00C8D7", "JVibe")), boxWidth),
			centerLine(ansiRgb("#6F7782", "Personal coding agent workbench"), boxWidth),
			"",
			...this.renderInputBox(boxWidth),
			"",
			centerLine(`${ansiRgb("#00C8D7", "tab")} ${ansiRgb("#6F7782", "agents")}   ${bold("/")} ${ansiRgb("#6F7782", "commands")}   ${bold("!")} ${ansiRgb("#6F7782", "bash")}`, boxWidth),
		];
		const contentLines = showPanel
			? this.composeColumns(mainLines, this.renderStatusPanel(panelWidth), boxWidth, gap)
			: centerBlock(mainLines, columns);
		const contentHeight = contentLines.length;
		const topSpacer = Math.max(2, Math.floor((rows - contentHeight - 2) * 0.36));

		return [
			...emptyLines(topSpacer),
			...contentLines,
		];
	}
}

function buildMinimalFooter(ctx: ExtensionContext, runtime: ExtensionAPI, statusSnapshot: WelcomeStatusSnapshot) {
	return (_tui: unknown, theme: Theme, footerData: FooterData): Component => {
		return {
			invalidate() {},
			render(width: number): string[] {
				statusSnapshot.branch = stripAnsi(footerData.getGitBranch() ?? "");
				statusSnapshot.mcp = stripAnsi(getMcpStatus(footerData) ?? "");
				if (sidebarRenderActive || width >= 112) return [];

				const compact = width < 90;
				const project = shortPath(ctx.cwd, compact ? 24 : 36);
				const branch = statusSnapshot.branch;
				const model = truncateToWidth(ctx.model?.id ?? "unknown", compact ? 18 : 30, "...");
				const tools = formatTools(runtime);
				const mcp = statusSnapshot.mcp;
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
	installConversationRenderers();
	const statusSnapshot: WelcomeStatusSnapshot = {};

	runtime.on("session_start", (_event, ctx) => {
		if (!ctx.hasUI) return;
		if (!hasVisibleConversation(ctx) && process.stdout.isTTY) {
			process.stdout.write(CLEAR_VIEWPORT);
		}
		ctx.ui.setTheme(JVIBE_THEME_NAME);
		ctx.ui.setTitle("JVibe");
		ctx.ui.setHeader(buildConversationHeader(ctx, runtime, () => statusSnapshot));
		ctx.ui.setEditorComponent((tui, editorTheme, keybindings) => new JVibeWelcomeEditor(tui, editorTheme, keybindings, ctx, runtime, () => statusSnapshot));
		ctx.ui.setFooter(buildMinimalFooter(ctx, runtime, statusSnapshot));
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
