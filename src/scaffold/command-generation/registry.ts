import type { ToolCommandAdapter } from "./types.js";
import { claudeAdapter } from "./adapters/claude.js";
import { clineAdapter } from "./adapters/cline.js";
import { codexAdapter } from "./adapters/codex.js";
import { copilotAdapter } from "./adapters/copilot.js";
import { cursorAdapter } from "./adapters/cursor.js";
import { droidAdapter } from "./adapters/droid.js";
import { geminiAdapter } from "./adapters/gemini.js";
import { kiroAdapter } from "./adapters/kiro.js";
import { opencodeAdapter } from "./adapters/opencode.js";

const adapters = new Map<string, ToolCommandAdapter>([
  [cursorAdapter.toolId, cursorAdapter],
  [claudeAdapter.toolId, claudeAdapter],
  [clineAdapter.toolId, clineAdapter],
  [codexAdapter.toolId, codexAdapter],
  [copilotAdapter.toolId, copilotAdapter],
  [opencodeAdapter.toolId, opencodeAdapter],
  [geminiAdapter.toolId, geminiAdapter],
  [kiroAdapter.toolId, kiroAdapter],
  [droidAdapter.toolId, droidAdapter],
]);

export function getCommandAdapter(toolId: string): ToolCommandAdapter | undefined {
  return adapters.get(toolId);
}

export function listCommandAdapters(): ToolCommandAdapter[] {
  return [...adapters.values()];
}
