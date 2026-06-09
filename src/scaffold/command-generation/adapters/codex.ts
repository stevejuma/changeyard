import os from "node:os";
import path from "node:path";
import type { CommandContent, ToolCommandAdapter } from "../types.js";

function getCodexHome(): string {
  const envHome = process.env.CODEX_HOME?.trim();
  return path.resolve(envHome ? envHome : path.join(os.homedir(), ".codex"));
}

export const codexAdapter: ToolCommandAdapter = {
  toolId: "codex",
  isGlobalPath: true,
  getFilePath(commandId: string) {
    return path.join(getCodexHome(), "prompts", `cy-${commandId}.md`);
  },
  formatFile(content: CommandContent) {
    return `---
description: ${content.description}
argument-hint: change id or title
---

${content.body}
`;
  },
};

export function resolveCodexHomeForTests(): string {
  return getCodexHome();
}
