import path from "node:path";
import type { CommandContent, ToolCommandAdapter } from "../types.js";
import { escapeYamlValue } from "../yaml.js";

export const cursorAdapter: ToolCommandAdapter = {
  toolId: "cursor",
  getFilePath(commandId: string) {
    return path.join(".cursor", "commands", `cy-${commandId}.md`);
  },
  formatFile(content: CommandContent) {
    return `---
name: /cy-${content.id}
id: cy-${content.id}
category: ${escapeYamlValue(content.category)}
description: ${escapeYamlValue(content.description)}
---

${content.body}
`;
  },
};
