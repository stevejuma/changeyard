import type { CommandContent, GeneratedCommand, ToolCommandAdapter } from "./types.js";
import { getCommandContents } from "../templates/commands.js";

export function generateCommandsForTool(adapter: ToolCommandAdapter): GeneratedCommand[] {
  return getCommandContents().map((content) => ({
    path: adapter.getFilePath(content.id),
    fileContent: adapter.formatFile(content),
    global: adapter.isGlobalPath === true,
    displayPath: adapter.getDisplayPath?.(content.id),
  }));
}

export function formatCommandPreview(content: CommandContent, adapter: ToolCommandAdapter): string {
  return adapter.formatFile(content);
}
