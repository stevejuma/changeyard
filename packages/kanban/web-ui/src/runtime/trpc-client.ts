import type { RuntimeAppRouter } from "@runtime-trpc";
import { createTRPCProxyClient, httpLink, TRPCClientError } from "@trpc/client";

interface TrpcErrorDataWithConflictRevision {
	code?: string;
	conflictRevision?: number | null;
	conflictUpdatedAt?: string | null;
}

type RuntimeTrpcClient = ReturnType<typeof createTRPCProxyClient<RuntimeAppRouter>>;

const clientByWorkspaceId = new Map<string, RuntimeTrpcClient>();

export class TrpcHttpError extends Error {
	readonly status: number;
	readonly data: TrpcErrorDataWithConflictRevision | null;

	constructor(status: number, message: string, data: TrpcErrorDataWithConflictRevision | null = null) {
		super(message);
		this.name = "TrpcHttpError";
		this.status = status;
		this.data = data;
	}
}

function trpcHeaders(workspaceId?: string | null): HeadersInit {
	return workspaceId ? { "x-kanban-workspace-id": workspaceId } : {};
}

function readPayloadResult<T>(payload: unknown): T {
	if (Array.isArray(payload)) {
		return (payload[0] as { result?: { data?: T } } | undefined)?.result?.data as T;
	}
	return (payload as { result?: { data?: T } }).result?.data as T;
}

function readErrorPayload(payload: unknown): { message: string; data: TrpcErrorDataWithConflictRevision | null } {
	const error = Array.isArray(payload)
		? (payload[0] as { error?: unknown } | undefined)?.error
		: (payload as { error?: unknown }).error;
	const jsonError = typeof error === "object" && error && "json" in error
		? (error as { json?: unknown }).json
		: error;
	const message =
		typeof jsonError === "object" && jsonError && "message" in jsonError && typeof jsonError.message === "string"
			? jsonError.message
			: "Request failed.";
	const data =
		typeof jsonError === "object" && jsonError && "data" in jsonError && typeof jsonError.data === "object"
			? (jsonError.data as TrpcErrorDataWithConflictRevision)
			: null;
	return { message, data };
}

async function parseTrpcResponse<T>(response: Response): Promise<T> {
	const payload = (await response.json().catch(() => null)) as unknown;
	if (!response.ok) {
		const errorPayload = readErrorPayload(payload);
		throw new TrpcHttpError(response.status, errorPayload.message || `Request failed with status ${response.status}`, errorPayload.data);
	}
	return readPayloadResult<T>(payload);
}

export async function fetchTrpcQuery<T>(
	path: string,
	input?: unknown,
	workspaceId?: string | null,
	options: { signal?: AbortSignal } = {},
): Promise<T> {
	const searchParams = new URLSearchParams();
	searchParams.set("input", JSON.stringify(input ?? {}));
	if (workspaceId) {
		searchParams.set("workspaceId", workspaceId);
	}
	const response = await fetch(`/api/trpc/${path}?${searchParams.toString()}`, {
		headers: trpcHeaders(workspaceId),
		signal: options.signal,
	});
	return await parseTrpcResponse<T>(response);
}

export async function postTrpcMutation<T>(path: string, input: unknown, workspaceId?: string | null): Promise<T> {
	const response = await fetch(`/api/trpc/${path}`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			...trpcHeaders(workspaceId),
		},
		body: JSON.stringify(input),
	});
	return await parseTrpcResponse<T>(response);
}

export function getRuntimeTrpcClient(workspaceId: string | null): RuntimeTrpcClient {
	const key = workspaceId ?? "__unscoped__";
	const existing = clientByWorkspaceId.get(key);
	if (existing) {
		return existing;
	}
	const created = createTRPCProxyClient<RuntimeAppRouter>({
		links: [
			httpLink({
				url: "/api/trpc",
				headers: () => (workspaceId ? { "x-kanban-workspace-id": workspaceId } : {}),
			}),
		],
	});
	clientByWorkspaceId.set(key, created);
	return created;
}

export function createWorkspaceTrpcClient(workspaceId: string): RuntimeTrpcClient {
	return getRuntimeTrpcClient(workspaceId);
}

function readTrpcErrorData(error: TRPCClientError<RuntimeAppRouter>): TrpcErrorDataWithConflictRevision | null {
	const data = error.data as TrpcErrorDataWithConflictRevision | undefined;
	if (!data || typeof data !== "object") {
		return null;
	}
	return data;
}

function readPlainTrpcErrorData(error: unknown): TrpcErrorDataWithConflictRevision | null {
	if (!error || typeof error !== "object") {
		return null;
	}
	const maybeData = error as TrpcErrorDataWithConflictRevision;
	if (
		typeof maybeData.code === "string" ||
		typeof maybeData.conflictRevision === "number" ||
		typeof maybeData.conflictUpdatedAt === "string"
	) {
		return maybeData;
	}
	return null;
}

export function readTrpcConflictRevision(error: unknown): number | null {
	if (error instanceof TrpcHttpError) {
		const data = error.data;
		if (data?.code !== "CONFLICT") {
			return null;
		}
		return typeof data.conflictRevision === "number" ? data.conflictRevision : null;
	}
	if (!(error instanceof TRPCClientError)) {
		const data = readPlainTrpcErrorData(error);
		if (data?.code !== "CONFLICT") {
			return null;
		}
		return typeof data.conflictRevision === "number" ? data.conflictRevision : null;
	}
	const data = readTrpcErrorData(error);
	if (data?.code !== "CONFLICT") {
		return null;
	}
	return typeof data.conflictRevision === "number" ? data.conflictRevision : null;
}

export function readTrpcConflictUpdatedAt(error: unknown): string | null {
	if (error instanceof TrpcHttpError) {
		const data = error.data;
		if (data?.code !== "CONFLICT") {
			return null;
		}
		return typeof data.conflictUpdatedAt === "string" ? data.conflictUpdatedAt : null;
	}
	if (!(error instanceof TRPCClientError)) {
		const data = readPlainTrpcErrorData(error);
		if (data?.code !== "CONFLICT") {
			return null;
		}
		return typeof data.conflictUpdatedAt === "string" ? data.conflictUpdatedAt : null;
	}
	const data = readTrpcErrorData(error);
	if (data?.code !== "CONFLICT") {
		return null;
	}
	return typeof data.conflictUpdatedAt === "string" ? data.conflictUpdatedAt : null;
}
