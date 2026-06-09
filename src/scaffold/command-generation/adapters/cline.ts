import path from "node:path";
import type { CommandContent, ToolCommandAdapter } from "../types.js";

export const clineAdapter: ToolCommandAdapter = {
  toolId: "cline",
  getFilePath(commandId: string) {
    return path.join(".clinerules", "workflows", `cy-${commandId}.md`);
  },
  formatFile(content: CommandContent) {
    return `# ${content.name}

${content.description}

${content.body}
`;
  },
};
