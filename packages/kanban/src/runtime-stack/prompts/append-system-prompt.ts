import type { RuntimeAgentId } from "../core/api-contract.js";
import { isHomeAgentSessionId } from "../core/home-agent-session.js";
import { renderChangeyardSidebarPrompt } from "./changeyard-workflow-prompt.js";

const DEFAULT_COMMAND_PREFIX = "cy";

export interface ResolveAppendSystemPromptCommandPrefixOptions {
	currentVersion?: string;
	argv?: string[];
	execArgv?: string[];
	execPath?: string;
	cwd?: string;
	projectRoot?: string | null;
	vcsEngine?: "git" | "jj" | string | null;
	resolveRealPath?: (path: string) => string;
}

export interface RenderAppendSystemPromptOptions {
	agentId?: RuntimeAgentId | null;
	projectRoot?: string | null;
	vcsEngine?: "git" | "jj" | string | null;
}

const APPEND_PROMPT_AGENT_IDS: readonly RuntimeAgentId[] = [
	"claude",
	"codex",
	"cline",
	"copilot",
	"cursor",
	"droid",
	"kiro",
	"gemini",
	"opencode",
];

function isRuntimeAgentId(value: string): value is RuntimeAgentId {
	return APPEND_PROMPT_AGENT_IDS.includes(value as RuntimeAgentId);
}

function resolveHomeAgentId(taskId: string): RuntimeAgentId | null {
	if (!isHomeAgentSessionId(taskId)) {
		return null;
	}
	const parts = taskId.split(":");
	const maybeAgentId = parts.at(-1) ?? null;
	if (!maybeAgentId || !isRuntimeAgentId(maybeAgentId)) {
		return null;
	}
	return maybeAgentId;
}

function renderLinearSetupGuidanceForAgent(agentId: RuntimeAgentId | null): string {
	switch (agentId) {
		case "cline":
			return "- If Linear MCP is not available in the current agent (ChangeYard), direct the user to open settings and go to the MCP section where they can add the Linear integration.";
		case "claude":
			return "- If Linear MCP is not available in the current agent (Claude Code), suggest running: `claude mcp add --transport http --scope user linear https://mcp.linear.app/mcp`";
		case "codex":
			return "- If Linear MCP is not available in the current agent (OpenAI Codex), suggest running: `codex mcp add linear --url https://mcp.linear.app/mcp`";
		case "copilot":
			return "- If Linear MCP is not available in the current agent (GitHub Copilot CLI), suggest running: `/mcp add`, then use name `linear` and URL `https://mcp.linear.app/mcp`.";
		case "cursor":
			return "- If Linear MCP is not available in the current agent (Cursor Agent CLI), suggest adding a Linear MCP server entry to `.cursor/mcp.json` with URL `https://mcp.linear.app/mcp`, then run `agent mcp login linear`.";
		case "gemini":
			return "- If Linear MCP is not available in the current agent (Gemini CLI), suggest running: `gemini mcp add linear https://mcp.linear.app/mcp --transport http --scope user`";
		case "opencode":
			return "- If Linear MCP is not available in the current agent (OpenCode), suggest running `opencode mcp add`, then use name `linear` and URL `https://mcp.linear.app/mcp`.";
		case "droid":
			return "- If Linear MCP is not available in the current agent (Droid), suggest running: `droid mcp add linear https://mcp.linear.app/mcp --type http`";
		case "kiro":
			return "- If Linear MCP is not available in the current agent (Kiro CLI), suggest running: `kiro-cli mcp add --name linear --url https://mcp.linear.app/mcp --scope global`";
		default:
			return "- If Linear MCP is not available, provide setup instructions for the active agent only, then continue once OAuth is complete.";
	}
}

export function resolveAppendSystemPromptCommandPrefix(
	_options: ResolveAppendSystemPromptCommandPrefixOptions = {},
): string {
	return DEFAULT_COMMAND_PREFIX;
}

export function renderAppendSystemPrompt(commandPrefix: string, options: RenderAppendSystemPromptOptions = {}): string {
	const changeyardCommand = commandPrefix.trim() || DEFAULT_COMMAND_PREFIX;
	const selectedAgentId = options.agentId ?? null;
	return `${renderChangeyardSidebarPrompt({
		commandPrefix: changeyardCommand,
		agentId: selectedAgentId,
		projectRoot: options.projectRoot,
		vcsEngine: options.vcsEngine,
	})}

# GitHub and Linear Guidance

- If the user asks for GitHub work (issues, PRs, repos, comments, labels, milestones) or includes a \`github.com\` URL, prefer the \`gh\` CLI first.
- Prefer native GitHub commands over manual browser walkthroughs when possible, for example: \`gh issue view\`, \`gh pr view\`, \`gh repo view\`, \`gh pr checks\`, \`gh pr diff\`.
- If \`gh\` is missing, guide installation based on platform:
  - macOS: \`brew install gh\`
  - Windows: \`winget install --id GitHub.cli\`
  - Linux: use the distro package or official instructions at \`https://cli.github.com/\`

- If the user references Linear (Linear links, Linear issue IDs, or Linear workflows), prefer Linear MCP tools when available.
- Current home agent: \`${selectedAgentId ?? "unknown"}\`
${renderLinearSetupGuidanceForAgent(selectedAgentId)}
- After setup, run the agent MCP auth flow (often \`/mcp\`) and complete OAuth before using Linear tools.
- Linear MCP docs: \`https://linear.app/docs/mcp\`
`;
}

export function resolveHomeAgentAppendSystemPrompt(
	taskId: string,
	options: ResolveAppendSystemPromptCommandPrefixOptions = {},
): string | null {
	if (!isHomeAgentSessionId(taskId)) {
		return null;
	}
	return renderAppendSystemPrompt(resolveAppendSystemPromptCommandPrefix(options), {
		agentId: resolveHomeAgentId(taskId),
		projectRoot: options.projectRoot ?? options.cwd,
		vcsEngine: options.vcsEngine,
	});
}
