export type AgentToolId =
  | "cursor"
  | "claude"
  | "cline"
  | "codex"
  | "copilot"
  | "opencode"
  | "gemini"
  | "kiro"
  | "droid";

export type AgentToolOption = {
  name: string;
  value: AgentToolId;
  skillsDir: string;
  detectionPaths?: string[];
  hasCommandAdapter: boolean;
};

export const AGENT_TOOLS: AgentToolOption[] = [
  { name: "Cursor", value: "cursor", skillsDir: ".cursor", hasCommandAdapter: true },
  { name: "Claude Code", value: "claude", skillsDir: ".claude", hasCommandAdapter: true },
  { name: "Cline / ChangeYard", value: "cline", skillsDir: ".cline", hasCommandAdapter: true },
  { name: "OpenAI Codex", value: "codex", skillsDir: ".codex", hasCommandAdapter: true },
  {
    name: "GitHub Copilot",
    value: "copilot",
    skillsDir: ".github",
    detectionPaths: [".github/copilot-instructions.md", ".github/instructions", ".github/prompts", ".github/skills", ".github/agents"],
    hasCommandAdapter: true,
  },
  { name: "OpenCode", value: "opencode", skillsDir: ".opencode", hasCommandAdapter: true },
  { name: "Gemini CLI", value: "gemini", skillsDir: ".gemini", hasCommandAdapter: true },
  { name: "Kiro", value: "kiro", skillsDir: ".kiro", hasCommandAdapter: true },
  { name: "Factory Droid", value: "droid", skillsDir: ".factory", hasCommandAdapter: true },
];

export const AGENT_TOOL_IDS = AGENT_TOOLS.map((tool) => tool.value);

export function getAgentToolOption(toolId: string): AgentToolOption | undefined {
  return AGENT_TOOLS.find((tool) => tool.value === toolId);
}

export function parseAgentToolsValue(value: string | undefined): AgentToolId[] | "all" | "none" | "detect" {
  if (value === undefined || value.trim() === "") {
    return "detect";
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "all") {
    return "all";
  }
  if (normalized === "none") {
    return "none";
  }
  const ids = normalized.split(",").map((part) => part.trim()).filter(Boolean);
  for (const id of ids) {
    if (!getAgentToolOption(id)) {
      throw new Error(`Unknown agent tool "${id}". Expected one of: ${AGENT_TOOL_IDS.join(", ")}, all, none`);
    }
  }
  return ids as AgentToolId[];
}
