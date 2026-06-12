import { useCallback, useEffect, useRef, useState } from "react";

import type {
	MutationState,
	QueryState,
	RuntimeGitLogRequest,
	RuntimeGitLogResponse,
	VcsApplyOperationResponse,
	VcsJjOperationDiffResponse,
	VcsJjOperationsResponse,
	VcsOperationRequest,
	VcsPreviewOperationResponse,
	VcsSubmitStackResponse,
} from "@/runtime/types";

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

function isAbortError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}
	const name = error.name.toLowerCase();
	const message = error.message.toLowerCase();
	return name === "aborterror" || message.includes("aborted") || message.includes("aborterror");
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

export function useTrpcQuery<T>(
	path: string,
	message: string,
	workspaceId?: string | null,
	enabled = true,
): { state: QueryState<T>; refresh: () => void } {
	const [state, setState] = useState<QueryState<T>>({ status: "loading" });
	const [refreshToken, setRefreshToken] = useState(0);

	useEffect(() => {
		if (!enabled) {
			setState({ status: "error", message });
			return;
		}
		let cancelled = false;
		setState({ status: "loading" });
		void fetchTrpcQuery<T>(path, undefined, workspaceId)
			.then((data) => {
				if (!cancelled) {
					setState({ status: "ready", data });
				}
			})
			.catch((error: unknown) => {
				if (!cancelled) {
					setState({ status: "error", message: error instanceof Error ? error.message : message });
				}
			});
		return () => {
			cancelled = true;
		};
	}, [enabled, message, path, refreshToken, workspaceId]);

	return {
		state,
		refresh: () => setRefreshToken((current) => current + 1),
	};
}

export function useTrpcInputQuery<T>(
	path: string,
	input: unknown,
	message: string,
	enabled = true,
	workspaceId?: string | null,
): { state: QueryState<T>; refresh: () => void } {
	const [state, setState] = useState<QueryState<T>>({ status: "loading" });
	const [refreshToken, setRefreshToken] = useState(0);
	const inputKey = JSON.stringify(input ?? {});

	useEffect(() => {
		if (!enabled) {
			setState({ status: "error", message });
			return;
		}
		let cancelled = false;
		setState({ status: "loading" });
		void fetchTrpcQuery<T>(path, input, workspaceId)
			.then((data) => {
				if (!cancelled) {
					setState({ status: "ready", data });
				}
			})
			.catch((error: unknown) => {
				if (!cancelled) {
					setState({ status: "error", message: error instanceof Error ? error.message : message });
				}
			});
		return () => {
			cancelled = true;
		};
	}, [enabled, inputKey, message, path, refreshToken, workspaceId]);

	return {
		state,
		refresh: () => setRefreshToken((current) => current + 1),
	};
}

export function usePaginatedRepositoryLog({
	input,
	message,
	enabled,
	workspaceId,
	pageSize = 50,
}: {
	input: Omit<RuntimeGitLogRequest, "maxCount" | "skip">;
	message: string;
	enabled: boolean;
	workspaceId?: string | null;
	pageSize?: number;
}): {
	state: QueryState<RuntimeGitLogResponse>;
	isLoadingMore: boolean;
	hasMore: boolean;
	loadMore: () => void;
	refresh: () => void;
} {
	const [state, setState] = useState<QueryState<RuntimeGitLogResponse>>({ status: "loading" });
	const [isLoadingMore, setIsLoadingMore] = useState(false);
	const [refreshToken, setRefreshToken] = useState(0);
	const abortRef = useRef<AbortController | null>(null);
	const isLoadingMoreRef = useRef(false);
	const inputKey = JSON.stringify(input ?? {});

	const loadPage = useCallback(
		async ({ skip, append }: { skip: number; append: boolean }) => {
			if (!enabled || !workspaceId) {
				abortRef.current?.abort();
				setState({ status: "error", message });
				isLoadingMoreRef.current = false;
				setIsLoadingMore(false);
				return;
			}
			if (append && isLoadingMoreRef.current) {
				return;
			}
			abortRef.current?.abort();
			const abortController = new AbortController();
			abortRef.current = abortController;
			if (append) {
				isLoadingMoreRef.current = true;
				setIsLoadingMore(true);
			} else {
				setState({ status: "loading" });
			}
			try {
				const payload = await fetchTrpcQuery<RuntimeGitLogResponse>(
					"workspace.getRepositoryLog",
					{ ...input, maxCount: pageSize, skip },
					workspaceId,
					{ signal: abortController.signal },
				);
				if (abortController.signal.aborted || abortRef.current !== abortController) {
					return;
				}
				setState((current) => {
					if (!append || current.status !== "ready" || !current.data.ok || !payload.ok) {
						return { status: "ready", data: payload };
					}
					const existingHashes = new Set(current.data.commits.map((commit) => commit.hash));
					const nextCommits = payload.commits.filter((commit) => !existingHashes.has(commit.hash));
					return {
						status: "ready",
						data: {
							...payload,
							commits: [...current.data.commits, ...nextCommits],
						},
					};
				});
			} catch (error) {
				if (abortController.signal.aborted || abortRef.current !== abortController || isAbortError(error)) {
					return;
				}
				setState({ status: "error", message: error instanceof Error ? error.message : message });
			} finally {
				if (abortRef.current === abortController) {
					abortRef.current = null;
					isLoadingMoreRef.current = false;
					setIsLoadingMore(false);
				}
			}
		},
		[enabled, input, message, pageSize, workspaceId],
	);

	useEffect(() => {
		void loadPage({ skip: 0, append: false });
		return () => {
			abortRef.current?.abort();
		};
	}, [inputKey, loadPage, refreshToken]);

	const hasMore = state.status === "ready" && state.data.ok && state.data.commits.length < state.data.totalCount;

	return {
		state,
		isLoadingMore,
		hasMore,
		loadMore: () => {
			if (state.status !== "ready" || !state.data.ok || isLoadingMore || !hasMore) {
				return;
			}
			void loadPage({ skip: state.data.commits.length, append: true });
		},
		refresh: () => setRefreshToken((current) => current + 1),
	};
}

export function usePaginatedJjOperations({
	message,
	enabled,
	workspaceId,
	pageSize = 50,
}: {
	message: string;
	enabled: boolean;
	workspaceId?: string | null;
	pageSize?: number;
}): {
	state: QueryState<VcsJjOperationsResponse>;
	isLoadingMore: boolean;
	hasMore: boolean;
	loadMore: () => void;
	refresh: () => void;
} {
	const [state, setState] = useState<QueryState<VcsJjOperationsResponse>>({ status: "loading" });
	const [isLoadingMore, setIsLoadingMore] = useState(false);
	const [refreshToken, setRefreshToken] = useState(0);
	const abortRef = useRef<AbortController | null>(null);
	const isLoadingMoreRef = useRef(false);

	const loadLimit = useCallback(
		async ({ limit, append }: { limit: number; append: boolean }) => {
			if (!enabled || !workspaceId) {
				abortRef.current?.abort();
				setState({ status: "error", message });
				isLoadingMoreRef.current = false;
				setIsLoadingMore(false);
				return;
			}
			if (append && isLoadingMoreRef.current) {
				return;
			}
			abortRef.current?.abort();
			const abortController = new AbortController();
			abortRef.current = abortController;
			if (append) {
				isLoadingMoreRef.current = true;
				setIsLoadingMore(true);
			} else {
				setState({ status: "loading" });
			}
			try {
				const payload = await fetchTrpcQuery<VcsJjOperationsResponse>(
					"vcs.jjOperations",
					{ limit },
					workspaceId,
					{ signal: abortController.signal },
				);
				if (abortController.signal.aborted || abortRef.current !== abortController) {
					return;
				}
				const seen = new Set<string>();
				const operations = payload.operations.filter((operation) => {
					if (seen.has(operation.id)) {
						return false;
					}
					seen.add(operation.id);
					return true;
				});
				setState({ status: "ready", data: { ...payload, operations } });
			} catch (error) {
				if (abortController.signal.aborted || abortRef.current !== abortController || isAbortError(error)) {
					return;
				}
				setState({ status: "error", message: error instanceof Error ? error.message : message });
			} finally {
				if (abortRef.current === abortController) {
					abortRef.current = null;
					isLoadingMoreRef.current = false;
					setIsLoadingMore(false);
				}
			}
		},
		[enabled, message, workspaceId],
	);

	useEffect(() => {
		void loadLimit({ limit: pageSize, append: false });
		return () => {
			abortRef.current?.abort();
		};
	}, [loadLimit, pageSize, refreshToken]);

	const hasMore = state.status === "ready" && state.data.hasMore;

	return {
		state,
		isLoadingMore,
		hasMore,
		loadMore: () => {
			if (state.status !== "ready" || isLoadingMore || !hasMore) {
				return;
			}
			void loadLimit({ limit: state.data.operations.length + pageSize, append: true });
		},
		refresh: () => setRefreshToken((current) => current + 1),
	};
}

export function usePaginatedJjOperationDiff({
	operationId,
	message,
	enabled,
	workspaceId,
	pageSize = 50,
}: {
	operationId: string | null;
	message: string;
	enabled: boolean;
	workspaceId?: string | null;
	pageSize?: number;
}): {
	state: QueryState<VcsJjOperationDiffResponse>;
	isLoadingMore: boolean;
	hasMore: boolean;
	loadMore: () => void;
	refresh: () => void;
} {
	const [state, setState] = useState<QueryState<VcsJjOperationDiffResponse>>({ status: "loading" });
	const [isLoadingMore, setIsLoadingMore] = useState(false);
	const [refreshToken, setRefreshToken] = useState(0);
	const abortRef = useRef<AbortController | null>(null);
	const isLoadingMoreRef = useRef(false);

	const loadPage = useCallback(
		async ({ skip, append }: { skip: number; append: boolean }) => {
			if (!enabled || !workspaceId || !operationId) {
				abortRef.current?.abort();
				setState({ status: "error", message });
				isLoadingMoreRef.current = false;
				setIsLoadingMore(false);
				return;
			}
			if (append && isLoadingMoreRef.current) {
				return;
			}
			abortRef.current?.abort();
			const abortController = new AbortController();
			abortRef.current = abortController;
			if (append) {
				isLoadingMoreRef.current = true;
				setIsLoadingMore(true);
			} else {
				setState({ status: "loading" });
			}
			try {
				const payload = await fetchTrpcQuery<VcsJjOperationDiffResponse>(
					"vcs.jjOperationDiff",
					{ operationId, commitSkip: skip, commitLimit: pageSize },
					workspaceId,
					{ signal: abortController.signal },
				);
				if (abortController.signal.aborted || abortRef.current !== abortController) {
					return;
				}
				setState((current) => {
					if (!append || current.status !== "ready") {
						return { status: "ready", data: payload };
					}
					const existingHashes = new Set(current.data.commits.map((commit) => commit.hash));
					const nextCommits = payload.commits.filter((commit) => !existingHashes.has(commit.hash));
					return {
						status: "ready",
						data: {
							...payload,
							commits: [...current.data.commits, ...nextCommits],
						},
					};
				});
			} catch (error) {
				if (abortController.signal.aborted || abortRef.current !== abortController || isAbortError(error)) {
					return;
				}
				setState({ status: "error", message: error instanceof Error ? error.message : message });
			} finally {
				if (abortRef.current === abortController) {
					abortRef.current = null;
					isLoadingMoreRef.current = false;
					setIsLoadingMore(false);
				}
			}
		},
		[enabled, message, operationId, pageSize, workspaceId],
	);

	useEffect(() => {
		void loadPage({ skip: 0, append: false });
		return () => {
			abortRef.current?.abort();
		};
	}, [loadPage, operationId, refreshToken]);

	const hasMore = state.status === "ready" && state.data.hasMoreCommits;

	return {
		state,
		isLoadingMore,
		hasMore,
		loadMore: () => {
			if (state.status !== "ready" || isLoadingMore || !hasMore) {
				return;
			}
			void loadPage({ skip: state.data.commits.length, append: true });
		},
		refresh: () => setRefreshToken((current) => current + 1),
	};
}

export function usePreviewOperation(workspaceId?: string | null) {
	const [state, setState] = useState<QueryState<VcsPreviewOperationResponse>>({ status: "loading" });

	async function preview(input: VcsOperationRequest): Promise<void> {
		setState({ status: "loading" });
		try {
			const data = await fetchTrpcQuery<VcsPreviewOperationResponse>("vcs.previewOperation", input, workspaceId);
			setState({ status: "ready", data });
		} catch (error) {
			setState({
				status: "error",
				message: error instanceof Error ? error.message : "Failed to load VCS preview.",
			});
		}
	}

	return {
		state,
		preview,
		clear: () => setState({ status: "loading" }),
		showLocal: (data: VcsPreviewOperationResponse) => setState({ status: "ready", data }),
	};
}

export function useApplyOperation(workspaceId?: string | null) {
	const [state, setState] = useState<MutationState<VcsApplyOperationResponse>>({ status: "idle" });

	async function apply(input: VcsOperationRequest): Promise<VcsApplyOperationResponse | null> {
		setState({ status: "loading" });
		try {
			const data = await postTrpcMutation<VcsApplyOperationResponse>("vcs.applyOperation", input, workspaceId);
			setState({ status: "ready", data });
			return data;
		} catch (error) {
			setState({
				status: "error",
				message: error instanceof Error ? error.message : "Failed to apply VCS operation.",
			});
			return null;
		}
	}

	return {
		state,
		apply,
		clear: () => setState({ status: "idle" }),
	};
}

export function useSubmitStack(workspaceId?: string | null) {
	const [state, setState] = useState<MutationState<VcsSubmitStackResponse>>({ status: "idle" });

	async function submit(input: { targetBookmark?: string | null; remoteName?: string | null }): Promise<VcsSubmitStackResponse | null> {
		setState({ status: "loading" });
		try {
			const data = await postTrpcMutation<VcsSubmitStackResponse>("vcs.submitStack", input, workspaceId);
			setState({ status: "ready", data });
			return data;
		} catch (error) {
			setState({
				status: "error",
				message: error instanceof Error ? error.message : "Failed to submit stacked PRs.",
			});
			return null;
		}
	}

	return {
		state,
		submit,
		clear: () => setState({ status: "idle" }),
	};
}
