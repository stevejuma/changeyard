import path from "node:path";
import type { CommandContent, ToolCommandAdapter } from "../types.js";
import { escapeYamlValue } from "../yaml.js";

export const droidAdapter: ToolCommandAdapter = {
  toolId: "droid",
  getFilePath(commandId: string) {
    return path.join(".factory", "commands", `cy-${commandId}.md`);
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
