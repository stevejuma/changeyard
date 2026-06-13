function trpcHeaders(workspaceId?: string | null): HeadersInit {
	return workspaceId ? { "x-kanban-workspace-id": workspaceId } : {};
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
	if (!response.ok) {
		throw new Error(`Request failed with status ${response.status}`);
	}
	const payload = (await response.json()) as { result?: { data?: T } } | Array<{ result?: { data?: T } }>;
	if (Array.isArray(payload)) {
		return payload[0]?.result?.data as T;
	}
	return payload.result?.data as T;
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
	if (!response.ok) {
		throw new Error(`Request failed with status ${response.status}`);
	}
	const payload = (await response.json()) as { result?: { data?: T } };
	return payload.result?.data as T;
}
