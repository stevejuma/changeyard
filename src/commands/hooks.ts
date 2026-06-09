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

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
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

function trpcErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as { error?: { message?: unknown }; result?: { data?: { json?: { ok?: unknown; error?: unknown } } } };
  if (typeof root.error?.message === "string") return root.error.message;
  const data = root.result?.data?.json;
  if (data?.ok === false && typeof data.error === "string") return data.error;
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

  const body = {
    taskId: requiredEnv(HOOK_TASK_ID_ENV),
    workspaceId: requiredEnv(HOOK_WORKSPACE_ID_ENV),
    event: parseHookEvent(stringFlag(flags, "event")),
    metadata: readHookMetadata(flags),
  };
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-kanban-workspace-id": body.workspaceId,
  };
  const authToken = process.env[INTERNAL_AUTH_TOKEN_ENV];
  if (authToken) headers.authorization = `Bearer ${authToken}`;

  const response = await fetch(`${runtimeOrigin()}/api/trpc/hooks.ingest`, {
    method: "POST",
    headers,
    body: JSON.stringify({ json: body }),
  });
  const payload = parseJsonResponse(await response.text());
  const errorMessage = trpcErrorMessage(payload);

  if (!response.ok || errorMessage) {
    throw new Error(errorMessage ?? `Hook ingest failed with HTTP ${response.status}`);
  }

  return "";
}
