import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { AGENT_TOOLS, type AgentToolId, type AgentToolOption } from "./agent-tools.js";

function pathExists(projectPath: string, relativePath: string): boolean {
  try {
    statSync(path.join(projectPath, relativePath));
    return true;
  } catch {
    return false;
  }
}

export function isAgentToolPresent(projectPath: string, tool: AgentToolOption): boolean {
  if (tool.detectionPaths && tool.detectionPaths.length > 0) {
    return tool.detectionPaths.some((entry) => pathExists(projectPath, entry));
  }
  const skillsRoot = path.join(projectPath, tool.skillsDir);
  try {
    return statSync(skillsRoot).isDirectory();
  } catch {
    return false;
  }
}

export function getAvailableAgentTools(projectPath: string): AgentToolOption[] {
  return AGENT_TOOLS.filter((tool) => isAgentToolPresent(projectPath, tool));
}

export function resolveSelectedAgentTools(
  projectPath: string,
  tools: AgentToolId[] | "all" | "none" | "detect",
): AgentToolOption[] {
  if (tools === "none") {
    return [];
  }
  if (tools === "all") {
    return [...AGENT_TOOLS];
  }
  if (tools === "detect") {
    return getAvailableAgentTools(projectPath);
  }
  return tools.map((toolId) => {
    const tool = AGENT_TOOLS.find((entry) => entry.value === toolId);
    if (!tool) {
      throw new Error(`Unknown agent tool: ${toolId}`);
    }
    return tool;
  });
}

export function agentToolAlreadyPresent(projectPath: string, toolId: AgentToolId): boolean {
  const tool = AGENT_TOOLS.find((entry) => entry.value === toolId);
  if (!tool) {
    return false;
  }
  return isAgentToolPresent(projectPath, tool);
}

export function shouldInstallAgentTool(projectPath: string, tool: AgentToolOption, explicitSelection: boolean): boolean {
  if (explicitSelection) {
    return true;
  }
  return existsSync(path.join(projectPath, tool.skillsDir)) || isAgentToolPresent(projectPath, tool);
}
