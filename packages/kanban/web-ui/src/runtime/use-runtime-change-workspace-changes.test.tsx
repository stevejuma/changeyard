import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RuntimeWorkspaceChangesResponse } from "@/runtime/types";
import { useRuntimeChangeWorkspaceChanges } from "@/runtime/use-runtime-change-workspace-changes";

const getWorkspaceChangesQueryMock = vi.hoisted(() => vi.fn());

vi.mock("@/runtime/trpc-client", () => ({
	getRuntimeTrpcClient: () => ({
		changes: {
			getWorkspaceChanges: {
				query: getWorkspaceChangesQueryMock,
			},
		},
	}),
}));

function createDeferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((nextResolve) => {
		resolve = nextResolve;
	});
	return { promise, resolve };
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

function HookHarness({
	onSnapshot,
}: {
	onSnapshot: (snapshot: { paths: string[]; isLoading: boolean }) => void;
}): null {
	const workspaceChanges = useRuntimeChangeWorkspaceChanges("CY-0001", "project-1", 100);

	useEffect(() => {
		onSnapshot({
			paths: workspaceChanges.changes?.files.map((file) => file.path) ?? [],
			isLoading: workspaceChanges.isLoading,
		});
	}, [onSnapshot, workspaceChanges.changes, workspaceChanges.isLoading]);

	return null;
}

describe("useRuntimeChangeWorkspaceChanges", () => {
	let container: HTMLDivElement;
	let root: Root;
	let previousActEnvironment: boolean | undefined;

	beforeEach(() => {
		vi.useFakeTimers();
		getWorkspaceChangesQueryMock.mockReset();
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
		container.remove();
		vi.useRealTimers();
		if (previousActEnvironment === undefined) {
			delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
		} else {
			(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
				previousActEnvironment;
		}
	});

	it("does not start overlapping poll requests while a diff request is still loading", async () => {
		const firstDiffDeferred = createDeferred<RuntimeWorkspaceChangesResponse>();
		getWorkspaceChangesQueryMock
			.mockImplementationOnce(() => firstDiffDeferred.promise)
			.mockResolvedValue(createWorkspaceChangesResponse("next.ts"));
		const snapshots: Array<{ paths: string[]; isLoading: boolean }> = [];

		await act(async () => {
			root.render(
				<HookHarness
					onSnapshot={(snapshot) => {
						snapshots.push(snapshot);
					}}
				/>,
			);
			await Promise.resolve();
		});

		expect(getWorkspaceChangesQueryMock).toHaveBeenCalledTimes(1);

		await act(async () => {
			await vi.advanceTimersByTimeAsync(300);
		});

		expect(getWorkspaceChangesQueryMock).toHaveBeenCalledTimes(1);

		await act(async () => {
			firstDiffDeferred.resolve(createWorkspaceChangesResponse("first.ts"));
			await firstDiffDeferred.promise;
		});

		expect(snapshots.at(-1)).toMatchObject({
			paths: ["first.ts"],
			isLoading: false,
		});

		await act(async () => {
			await vi.advanceTimersByTimeAsync(100);
		});

		expect(getWorkspaceChangesQueryMock).toHaveBeenCalledTimes(2);
	});
});
