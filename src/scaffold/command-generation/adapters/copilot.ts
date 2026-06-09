import path from "node:path";
import type { CommandContent, ToolCommandAdapter } from "../types.js";
import { escapeYamlValue } from "../yaml.js";

export const copilotAdapter: ToolCommandAdapter = {
  toolId: "copilot",
  getFilePath(commandId: string) {
    return path.join(".github", "prompts", `cy-${commandId}.prompt.md`);
  },
  formatFile(content: CommandContent) {
    return `---
name: ${escapeYamlValue(content.name)}
description: ${escapeYamlValue(content.description)}
---

${content.body}
`;
  },
};
