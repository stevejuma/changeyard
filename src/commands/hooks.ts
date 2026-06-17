import { readFileSync } from "node:fs";
import { cwd } from "node:process";
import { findWorkspaceMarker, type WorkspaceMarker } from "../workspace/marker.js";

type HookEvent = "to_review" | "to_in_progress" | "activity";
type HookFlags = Record<string, string | boolean | string[]>;

const DEFAULT_RUNTIME_HOST = "127.0.0.1";
const DEFAULT_RUNTIME_PORT = "3484";
const INTERNAL_AUTH_TOKEN_ENV = "KANBAN_INTERNAL_AUTH_TOKEN";
const HOOK_TASK_ID_ENV = "KANBAN_HOOK_TASK_ID";
const HOOK_WORKSPACE_ID_ENV = "KANBAN_HOOK_WORKSPACE_ID";

function stringFlag(flags: HookFlags, name: string): string | undefined {
  const value = flags[name];
  return typeof value === "string" ? value : undefined;
}

function parseHookEvent(value: string | undefined): HookEvent {
  if (value === "to_review" || value === "to_in_progress" || value === "activity") return value;
  throw new Error("Missing or invalid hook event. Expected: --event <to_review|to_in_progress|activity>");
}

function runtimeOrigin(): string {
  const protocol = process.env.KANBAN_RUNTIME_HTTPS === "1" ? "https" : "http";
  const host = process.env.KANBAN_RUNTIME_HOST || DEFAULT_RUNTIME_HOST;
  const port = process.env.KANBAN_RUNTIME_PORT || DEFAULT_RUNTIME_PORT;
  return `${protocol}://${host}:${port}`;
}

function readHookMetadata(flags: HookFlags): Record<string, string> | undefined {
  const metadata: Record<string, string> = {};
  const source = stringFlag(flags, "source");
  const activityText = stringFlag(flags, "activity-text");
  const hookEventName = stringFlag(flags, "hook-event-name");
  const notificationType = stringFlag(flags, "notification-type");

  if (source) metadata.source = source;
  if (activityText) metadata.activityText = activityText;
  if (hookEventName) metadata.hookEventName = hookEventName;
  if (notificationType) metadata.notificationType = notificationType;

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function readWorkspaceMarkerTaskId(): string | undefined {
  const markerPath = findWorkspaceMarker(cwd());
  if (!markerPath) return undefined;
  try {
    const marker = JSON.parse(readFileSync(markerPath, "utf8")) as Partial<WorkspaceMarker>;
    return typeof marker.changeId === "string" && marker.changeId.trim() ? marker.changeId.trim() : undefined;
  } catch {
    return undefined;
  }
}

async function readHookPayloadFromStdin(): Promise<unknown | null> {
  const stdin = (process as unknown as {
    stdin?: AsyncIterable<unknown> & { isTTY?: boolean; setEncoding?: (encoding: string) => void };
  }).stdin;
  if (!stdin || stdin.isTTY) return null;
  let raw = "";
  stdin.setEncoding?.("utf8");
  for await (const chunk of stdin) {
    raw += String(chunk);
  }
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function findStringByKey(value: unknown, keys: Set<string>, depth = 0): string | null {
  if (depth > 8) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findStringByKey(item, keys, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  for (const [key, child] of Object.entries(value)) {
    if (keys.has(key) && typeof child === "string" && child.trim()) {
      return child.trim();
    }
  }
  for (const child of Object.values(value)) {
    const found = findStringByKey(child, keys, depth + 1);
    if (found) return found;
  }
  return null;
}

function externalCodexSessionFromPayload(payload: unknown, flags: HookFlags) {
  const sessionId =
    stringFlag(flags, "session-id") ??
    findStringByKey(payload, new Set(["session_id", "sessionId", "thread_id", "threadId"]));
  const transcriptPath =
    stringFlag(flags, "transcript-path") ??
    findStringByKey(payload, new Set(["transcript_path", "transcriptPath", "session_path", "sessionPath"]));
  return {
    provider: "codex",
    sessionId: sessionId ?? null,
    transcriptPath: transcriptPath ?? null,
    resumeCommand: sessionId ? ["codex", "resume", sessionId] : [],
    source: "cli",
  };
}

function shouldRegisterExternalCodexSession(subcommand: string, flags: HookFlags, workspaceId: string | undefined): boolean {
  if (subcommand !== "codex-hook") return false;
  if (flags["external-session"] === true) return true;
  const taskIdFromEnv = process.env[HOOK_TASK_ID_ENV]?.trim();
  const workspaceIdFromEnv = process.env[HOOK_WORKSPACE_ID_ENV]?.trim();
  return !taskIdFromEnv || !workspaceIdFromEnv || !workspaceId;
}

function metadataFromPayload(metadata: Record<string, string> | undefined, payload: unknown): Record<string, string> | undefined {
  const next = { ...(metadata ?? {}) };
  const toolName = findStringByKey(payload, new Set(["tool_name", "toolName", "command"]));
  const hookEventName = findStringByKey(payload, new Set(["hook_event_name", "hookEventName", "event_name", "eventName"]));
  const assistantMessage = findStringByKey(payload, new Set(["last_assistant_message", "lastAssistantMessage", "assistant_text", "assistantText"]));
  if (toolName && !next.toolName) next.toolName = toolName;
  if (hookEventName && !next.hookEventName) next.hookEventName = hookEventName;
  if (assistantMessage && !next.finalMessage) next.finalMessage = assistantMessage;
  if (assistantMessage && !next.activityText) next.activityText = `Assistant: ${assistantMessage.slice(0, 240)}`;
  return Object.keys(next).length > 0 ? next : undefined;
}

function trpcErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as { error?: { message?: unknown }; result?: { data?: unknown } };
  if (typeof root.error?.message === "string") return root.error.message;
  const resultData = root.result?.data;
  const data = resultData && typeof resultData === "object" && "json" in resultData
    ? (resultData as { json?: unknown }).json
    : resultData;
  if (data && typeof data === "object") {
    const result = data as { ok?: unknown; error?: unknown };
    if (result.ok === false && typeof result.error === "string") return result.error;
  }
  return null;
}

function parseJsonResponse(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function runHooks(positional: string[], flags: HookFlags): Promise<string> {
  const subcommand = positional[0] ?? "";
  if (subcommand !== "ingest" && subcommand !== "notify" && subcommand !== "codex-hook") {
    throw new Error("Unknown hooks command. Expected: cy hooks ingest|notify|codex-hook --event <to_review|to_in_progress|activity>");
  }

  const hookPayload = subcommand === "codex-hook" ? await readHookPayloadFromStdin() : null;
  const workspaceId = stringFlag(flags, "workspace-id") ?? process.env[HOOK_WORKSPACE_ID_ENV]?.trim() ?? undefined;
  const workspacePath = stringFlag(flags, "workspace-path") ?? cwd();
  const taskId =
    stringFlag(flags, "task-id") ??
    process.env[HOOK_TASK_ID_ENV]?.trim() ??
    readWorkspaceMarkerTaskId();
  if (!taskId) {
    throw new Error(`Missing task id. Set ${HOOK_TASK_ID_ENV}, pass --task-id, or run inside a Changeyard workspace.`);
  }

  const body = {
    taskId,
    workspaceId,
    workspacePath,
    event: parseHookEvent(stringFlag(flags, "event")),
    metadata: metadataFromPayload(readHookMetadata(flags), hookPayload),
    externalSession: shouldRegisterExternalCodexSession(subcommand, flags, workspaceId)
      ? externalCodexSessionFromPayload(hookPayload, flags)
      : undefined,
  };
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (body.workspaceId) headers["x-kanban-workspace-id"] = body.workspaceId;
  const authToken = process.env[INTERNAL_AUTH_TOKEN_ENV];
  if (authToken) headers.authorization = `Bearer ${authToken}`;

  const response = await fetch(`${runtimeOrigin()}/api/trpc/hooks.ingest`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const payload = parseJsonResponse(await response.text());
  const errorMessage = trpcErrorMessage(payload);

  if (!response.ok || errorMessage) {
    throw new Error(errorMessage ?? `Hook ingest failed with HTTP ${response.status}`);
  }

  return "";
}
