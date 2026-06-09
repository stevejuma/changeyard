import path from "node:path";
import type { CommandContent, ToolCommandAdapter } from "../types.js";
import { escapeYamlValue, formatTagsArray } from "../yaml.js";

export const claudeAdapter: ToolCommandAdapter = {
  toolId: "claude",
  getFilePath(commandId: string) {
    return path.join(".claude", "commands", "cy", `${commandId}.md`);
  },
  formatFile(content: CommandContent) {
    return `---
name: ${escapeYamlValue(content.name)}
description: ${escapeYamlValue(content.description)}
category: ${escapeYamlValue(content.category)}
tags: ${formatTagsArray(content.tags)}
---

${content.body}
`;
  },
};
