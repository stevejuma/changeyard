import { useEffect, useState } from "react";

import type {
	MutationState,
	QueryState,
	VcsApplyOperationResponse,
	VcsOperationRequest,
	VcsPreviewOperationResponse,
	VcsSubmitStackResponse,
} from "@/runtime/types";

export async function fetchTrpcQuery<T>(path: string, input?: unknown): Promise<T> {
	const searchParams = new URLSearchParams();
	searchParams.set("input", JSON.stringify(input ?? {}));
	const response = await fetch(`/api/trpc/${path}?${searchParams.toString()}`);
	if (!response.ok) {
		throw new Error(`Request failed with status ${response.status}`);
	}
	const payload = (await response.json()) as { result?: { data?: T } } | Array<{ result?: { data?: T } }>;
	if (Array.isArray(payload)) {
		return payload[0]?.result?.data as T;
	}
	return payload.result?.data as T;
}

export async function postTrpcMutation<T>(path: string, input: unknown): Promise<T> {
	const response = await fetch(`/api/trpc/${path}`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
		},
		body: JSON.stringify(input),
	});
	if (!response.ok) {
		throw new Error(`Request failed with status ${response.status}`);
	}
	const payload = (await response.json()) as { result?: { data?: T } };
	return payload.result?.data as T;
}

export function useTrpcQuery<T>(path: string, message: string): { state: QueryState<T>; refresh: () => void } {
	const [state, setState] = useState<QueryState<T>>({ status: "loading" });
	const [refreshToken, setRefreshToken] = useState(0);

	useEffect(() => {
		let cancelled = false;
		void fetchTrpcQuery<T>(path)
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
	}, [message, path, refreshToken]);

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
		void fetchTrpcQuery<T>(path, input)
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
	}, [enabled, inputKey, message, path, refreshToken]);

	return {
		state,
		refresh: () => setRefreshToken((current) => current + 1),
	};
}

export function usePreviewOperation() {
	const [state, setState] = useState<QueryState<VcsPreviewOperationResponse>>({ status: "loading" });

	async function preview(input: VcsOperationRequest): Promise<void> {
		setState({ status: "loading" });
		try {
			const data = await fetchTrpcQuery<VcsPreviewOperationResponse>("vcs.previewOperation", input);
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

export function useApplyOperation() {
	const [state, setState] = useState<MutationState<VcsApplyOperationResponse>>({ status: "idle" });

	async function apply(input: VcsOperationRequest): Promise<VcsApplyOperationResponse | null> {
		setState({ status: "loading" });
		try {
			const data = await postTrpcMutation<VcsApplyOperationResponse>("vcs.applyOperation", input);
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

export function useSubmitStack() {
	const [state, setState] = useState<MutationState<VcsSubmitStackResponse>>({ status: "idle" });

	async function submit(input: { targetBookmark?: string | null; remoteName?: string | null }): Promise<VcsSubmitStackResponse | null> {
		setState({ status: "loading" });
		try {
			const data = await postTrpcMutation<VcsSubmitStackResponse>("vcs.submitStack", input);
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
