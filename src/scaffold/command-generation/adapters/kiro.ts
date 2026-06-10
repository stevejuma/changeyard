import path from "node:path";
import type { CommandContent, ToolCommandAdapter } from "../types.js";
import { escapeYamlValue } from "../yaml.js";

export const kiroAdapter: ToolCommandAdapter = {
  toolId: "kiro",
  getFilePath(commandId: string) {
    return path.join(".kiro", "prompts", `cy-${commandId}.prompt.md`);
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
