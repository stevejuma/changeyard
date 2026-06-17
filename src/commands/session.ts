import { cwd } from "node:process";

type SessionFlags = Record<string, string | boolean | string[]>;

const DEFAULT_RUNTIME_HOST = "127.0.0.1";
const DEFAULT_RUNTIME_PORT = "3484";
const INTERNAL_AUTH_TOKEN_ENV = "KANBAN_INTERNAL_AUTH_TOKEN";

export interface SessionAttachResponse {
	ok: boolean;
	summary?: unknown;
	workspaceId?: string | null;
	workspacePath?: string | null;
	error?: string;
}

function stringFlag(flags: SessionFlags, name: string): string | undefined {
	const value = flags[name];
	return typeof value === "string" ? value : undefined;
}

function runtimeOrigin(): string {
	const protocol = process.env.KANBAN_RUNTIME_HTTPS === "1" ? "https" : "http";
	const host = process.env.KANBAN_RUNTIME_HOST || DEFAULT_RUNTIME_HOST;
	const port = process.env.KANBAN_RUNTIME_PORT || DEFAULT_RUNTIME_PORT;
	return `${protocol}://${host}:${port}`;
}

function parseResumeCommand(value: string | undefined): string[] | undefined {
	const parts = value?.trim().split(/\s+/).filter(Boolean);
	return parts && parts.length > 0 ? parts : undefined;
}

function parseJsonResponse(text: string): unknown {
	if (!text) return null;
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

function trpcData(payload: unknown): SessionAttachResponse | null {
	if (!payload || typeof payload !== "object") return null;
	const resultData = (payload as { result?: { data?: unknown } }).result?.data;
	const data = resultData && typeof resultData === "object" && "json" in resultData
		? (resultData as { json?: unknown }).json
		: resultData;
	return data && typeof data === "object" ? (data as SessionAttachResponse) : null;
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

function buildAttachBody(flags: SessionFlags) {
	const taskId = stringFlag(flags, "task-id")?.trim();
	const provider = stringFlag(flags, "provider")?.trim();
	if (!taskId) {
		throw new Error("Missing required option: --task-id <id>");
	}
	if (!provider) {
		throw new Error("Missing required option: --provider <name>");
	}
	return {
		taskId,
		provider,
		sessionId: stringFlag(flags, "session-id")?.trim() || undefined,
		transcriptPath: stringFlag(flags, "transcript-path")?.trim() || undefined,
		resumeCommand: parseResumeCommand(stringFlag(flags, "resume-command")),
		workspaceId: stringFlag(flags, "workspace-id")?.trim() || undefined,
		workspacePath: stringFlag(flags, "workspace-path")?.trim() || cwd(),
		source: stringFlag(flags, "source")?.trim() || undefined,
	};
}

export async function attachSession(positional: string[], flags: SessionFlags): Promise<SessionAttachResponse> {
	const subcommand = positional[0] ?? "";
	if (subcommand !== "attach") {
		throw new Error("Unknown session command. Expected: cy session attach --task-id <id> --provider <name>");
	}

	const body = buildAttachBody(flags);
	const headers: Record<string, string> = {
		"content-type": "application/json",
	};
	if (body.workspaceId) headers["x-kanban-workspace-id"] = body.workspaceId;
	const authToken = process.env[INTERNAL_AUTH_TOKEN_ENV];
	if (authToken) headers.authorization = `Bearer ${authToken}`;

	const response = await fetch(`${runtimeOrigin()}/api/trpc/session.attach`, {
		method: "POST",
		headers,
		body: JSON.stringify(body),
	});
	const payload = parseJsonResponse(await response.text());
	const errorMessage = trpcErrorMessage(payload);
	if (!response.ok || errorMessage) {
		throw new Error(errorMessage ?? `Session attach failed with HTTP ${response.status}`);
	}
	const data = trpcData(payload);
	if (!data) {
		throw new Error("Session attach returned an invalid runtime response.");
	}
	return data;
}

export async function runSession(positional: string[], flags: SessionFlags): Promise<string> {
	const response = await attachSession(positional, flags);
	if (!response.ok) {
		throw new Error(response.error ?? "Session attach failed.");
	}
	const taskId = stringFlag(flags, "task-id")?.trim() ?? "";
	const provider = stringFlag(flags, "provider")?.trim() ?? "";
	return `Attached ${provider} session to ${taskId}.`;
}
