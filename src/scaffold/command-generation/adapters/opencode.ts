import path from "node:path";
import type { CommandContent, ToolCommandAdapter } from "../types.js";
import { escapeYamlValue } from "../yaml.js";

export const opencodeAdapter: ToolCommandAdapter = {
  toolId: "opencode",
  getFilePath(commandId: string) {
    return path.join(".opencode", "commands", `cy-${commandId}.md`);
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
