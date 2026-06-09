import path from "node:path";
import type { CommandContent, ToolCommandAdapter } from "../types.js";

export const geminiAdapter: ToolCommandAdapter = {
  toolId: "gemini",
  getFilePath(commandId: string) {
    return path.join(".gemini", "commands", "cy", `${commandId}.toml`);
  },
  formatFile(content: CommandContent) {
    return `description = "${content.description.replace(/"/g, '\\"')}"

prompt = """
${content.body}
"""
`;
  },
};
