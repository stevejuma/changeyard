import path from "node:path";
import type { AgentToolId } from "./agent-tools.js";

type GeneratedHookFile = {
  path: string;
  fileContent: string;
  executable?: boolean;
};

type HookEvent = "to_review" | "to_in_progress" | "activity";

function quoteShellArg(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function quotePowerShellArg(value: string): string {
  return `"${value.replaceAll("`", "``").replaceAll('"', '`"')}"`;
}

function hookCommandParts(event: HookEvent, source: string): string[] {
  return ["cy", "hooks", "notify", "--event", event, "--source", source];
}

function shellCommand(event: HookEvent, source: string): string {
  return hookCommandParts(event, source).map(quoteShellArg).join(" ");
}

function powerShellCommand(event: HookEvent, source: string): string {
  return hookCommandParts(event, source).map(quotePowerShellArg).join(" ");
}

function cursorHookScript(event: HookEvent): string {
  const command = shellCommand(event, "cursor");
  return `#!/usr/bin/env bash
INPUT="$(cat || true)"
printf '%s' "$INPUT" | ${command} >/dev/null 2>&1 || true
exit 0
`;
}

function cursorHookCommand(relativeScriptPath: string): { command: string } {
  return { command: relativeScriptPath };
}

function cursorHooks(): GeneratedHookFile[] {
  const scripts = {
    stop: "kanban-stop",
    beforeSubmitPrompt: "kanban-before-submit-prompt",
    preToolUse: "kanban-pre-tool-use",
    postToolUse: "kanban-post-tool-use",
    subagentStop: "kanban-subagent-stop",
  } as const;
  const files: GeneratedHookFile[] = [
    {
      path: path.join(".cursor", "hooks.json"),
      fileContent: `${JSON.stringify({
        version: 1,
        hooks: {
          stop: [cursorHookCommand(".cursor/hooks/kanban-stop")],
          beforeSubmitPrompt: [cursorHookCommand(".cursor/hooks/kanban-before-submit-prompt")],
          preToolUse: [cursorHookCommand(".cursor/hooks/kanban-pre-tool-use")],
          postToolUse: [cursorHookCommand(".cursor/hooks/kanban-post-tool-use")],
          subagentStop: [cursorHookCommand(".cursor/hooks/kanban-subagent-stop")],
        },
      }, null, 2)}\n`,
    },
  ];
  files.push(
    { path: path.join(".cursor", "hooks", scripts.stop), fileContent: cursorHookScript("to_review"), executable: true },
    { path: path.join(".cursor", "hooks", scripts.beforeSubmitPrompt), fileContent: cursorHookScript("to_in_progress"), executable: true },
    { path: path.join(".cursor", "hooks", scripts.preToolUse), fileContent: cursorHookScript("activity"), executable: true },
    { path: path.join(".cursor", "hooks", scripts.postToolUse), fileContent: cursorHookScript("to_in_progress"), executable: true },
    { path: path.join(".cursor", "hooks", scripts.subagentStop), fileContent: cursorHookScript("activity"), executable: true },
  );
  return files;
}

function copilotHookEntry(event: HookEvent): { type: "command"; bash: string; powershell: string; timeoutSec: number } {
  return {
    type: "command",
    bash: shellCommand(event, "copilot"),
    powershell: powerShellCommand(event, "copilot"),
    timeoutSec: 5,
  };
}

function copilotHooks(): GeneratedHookFile[] {
  return [
    {
      path: path.join(".github", "hooks", "kanban.json"),
      fileContent: `${JSON.stringify({
        version: 1,
        hooks: {
          agentStop: [copilotHookEntry("to_review")],
          subagentStop: [copilotHookEntry("activity")],
          preToolUse: [copilotHookEntry("activity")],
          permissionRequest: [copilotHookEntry("activity")],
          postToolUse: [copilotHookEntry("activity")],
          postToolUseFailure: [copilotHookEntry("activity")],
          userPromptSubmitted: [copilotHookEntry("to_in_progress")],
          notification: [copilotHookEntry("activity")],
        },
      }, null, 2)}\n`,
    },
  ];
}

export function generateHooksForTool(toolId: AgentToolId): GeneratedHookFile[] {
  if (toolId === "cursor") return cursorHooks();
  if (toolId === "copilot") return copilotHooks();
  return [];
}
