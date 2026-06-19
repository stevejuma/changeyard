import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { kanbanApi } from "@/runtime/kanban-api";
import { kanbanStore } from "@/runtime/kanban-store";
import type { RuntimeWorkspaceChangesResponse } from "@/runtime/types";
import { useRuntimeChangeWorkspaceChanges } from "@/runtime/use-runtime-change-workspace-changes";

function createTrpcResponse(data: unknown): Response {
	return new Response(JSON.stringify({ result: { data } }), {
		status: 200,
		headers: { "content-type": "application/json" },
	});
}

function createWorkspaceChangesResponse(path: string): RuntimeWorkspaceChangesResponse {
	return {
		repoRoot: "/tmp/project",
		generatedAt: Date.now(),
		files: [
			{
				path,
				status: "modified",
				additions: 3,
				deletions: 1,
				oldText: "old line\n",
				newText: "new line\n",
			},
		],
	};
}

async function flushAsyncWork(): Promise<void> {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
}

async function waitForExpect(assertion: () => void): Promise<void> {
	let lastError: unknown;
	for (let attempt = 0; attempt < 25; attempt += 1) {
		try {
			assertion();
			return;
		} catch (error) {
			lastError = error;
		}
		await flushAsyncWork();
	}
	throw lastError;
}

interface HookSnapshot {
	label: string;
	paths: string[];
	isLoading: boolean;
	isRuntimeAvailable: boolean;
}

function HookHarness({
	label,
	onSnapshot,
}: {
	label: string;
	onSnapshot: (snapshot: HookSnapshot) => void;
}): null {
	const workspaceChanges = useRuntimeChangeWorkspaceChanges("CY-0001", "project-1", 100);

	useEffect(() => {
		onSnapshot({
			label,
			paths: workspaceChanges.changes?.files.map((file) => file.path) ?? [],
			isLoading: workspaceChanges.isLoading,
			isRuntimeAvailable: workspaceChanges.isRuntimeAvailable,
		});
	}, [
		label,
		onSnapshot,
		workspaceChanges.changes,
		workspaceChanges.isLoading,
		workspaceChanges.isRuntimeAvailable,
	]);

	return null;
}

describe("useRuntimeChangeWorkspaceChanges", () => {
	let container: HTMLDivElement;
	let root: Root;
	let previousActEnvironment: boolean | undefined;
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		kanbanStore.dispatch(kanbanApi.util.resetApiState());
		fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		previousActEnvironment = (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
			.IS_REACT_ACT_ENVIRONMENT;
		(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => {
			root.unmount();
		});
		kanbanStore.dispatch(kanbanApi.util.resetApiState());
		container.remove();
		vi.unstubAllGlobals();
		if (previousActEnvironment === undefined) {
			delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
		} else {
			(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
				previousActEnvironment;
		}
	});

	it("shares change workspace diff requests through the RTK Query cache", async () => {
		fetchMock.mockResolvedValue(createTrpcResponse(createWorkspaceChangesResponse("first.ts")));
		const snapshots: HookSnapshot[] = [];

		await act(async () => {
			root.render(
				<Provider store={kanbanStore}>
					<HookHarness label="first" onSnapshot={(snapshot) => snapshots.push(snapshot)} />
					<HookHarness label="second" onSnapshot={(snapshot) => snapshots.push(snapshot)} />
				</Provider>,
			);
			await Promise.resolve();
		});

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/api/trpc/changes.getWorkspaceChanges");
		expect(String(fetchMock.mock.calls[0]?.[0])).toContain(encodeURIComponent(JSON.stringify({ id: "CY-0001" })));

		await waitForExpect(() => {
			expect(snapshots.at(-1)).toMatchObject({
				paths: ["first.ts"],
				isLoading: false,
				isRuntimeAvailable: true,
			});
		});

		expect(snapshots.filter((snapshot) => snapshot.paths.includes("first.ts"))).toHaveLength(2);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
