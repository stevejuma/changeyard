import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RuntimeChangeyardChangeDetail, RuntimeChangeyardChangeListItem } from "@/runtime/types";
import { useChangeyardChanges } from "@/hooks/use-changeyard-changes";
import { kanbanApi } from "@/runtime/kanban-api";
import { kanbanStore } from "@/runtime/kanban-store";

function createChange(id: string): RuntimeChangeyardChangeListItem {
	return {
		id,
		title: `Change ${id}`,
		type: "feature",
		status: "draft",
		path: `/tmp/${id}.md`,
		labels: [],
		dependencies: { blockedBy: [], blocks: [] },
		updatedAt: "2026-06-09T00:00:00.000Z",
		planning: null,
	};
}

function createChangeDetail(id: string): RuntimeChangeyardChangeDetail {
	return {
		...createChange(id),
		body: `# ${id}\n`,
		sections: [],
	};
}

interface HookSnapshot {
	changesCount: number;
	selectedChangeId: string | null;
	isLoading: boolean;
	isSelectedChangeLoading: boolean;
	isSelectedChangeFetching: boolean;
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

function HookHarness({
	currentProjectId,
	selectedChangeId,
	renderToken,
	onSnapshot,
}: {
	currentProjectId: string | null;
	selectedChangeId: string | null;
	renderToken: number;
	onSnapshot: (snapshot: HookSnapshot) => void;
}): null {
	void renderToken;
	const changeyardChanges = useChangeyardChanges(currentProjectId, selectedChangeId);

	useEffect(() => {
		onSnapshot({
			changesCount: changeyardChanges.changeyardChanges.length,
			selectedChangeId: changeyardChanges.selectedChangeDetail?.id ?? null,
			isLoading: changeyardChanges.isChangeyardChangesLoading,
			isSelectedChangeLoading: changeyardChanges.isSelectedChangeLoading,
			isSelectedChangeFetching: changeyardChanges.isSelectedChangeFetching,
		});
	}, [
		changeyardChanges.changeyardChanges,
		changeyardChanges.isChangeyardChangesLoading,
		changeyardChanges.selectedChangeDetail,
		onSnapshot,
	]);

	return null;
}

describe("useChangeyardChanges", () => {
	let container: HTMLDivElement;
	let root: Root;
	let previousActEnvironment: boolean | undefined;
	let fetchMock: ReturnType<typeof vi.fn>;

	function mockTrpcResponse(data: unknown): Response {
		return new Response(JSON.stringify({ result: { data } }), {
			status: 200,
			headers: { "content-type": "application/json" },
		});
	}

	beforeEach(() => {
		kanbanStore.dispatch(kanbanApi.util.resetApiState());
		fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.startsWith("/api/trpc/changes.list")) {
				return mockTrpcResponse({ changes: [createChange("chg-1")] });
			}
			if (url.startsWith("/api/trpc/changes.get")) {
				const detailId = decodeURIComponent(url).includes('"id":"chg-2"') ? "chg-2" : "chg-1";
				return mockTrpcResponse(createChangeDetail(detailId));
			}
			return new Response("Not found", { status: 404 });
		});
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
		container.remove();
		vi.unstubAllGlobals();
		if (previousActEnvironment === undefined) {
			delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
		} else {
			(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
				previousActEnvironment;
		}
	});

	it("does not refetch the changes list on unrelated rerenders", async () => {
		const snapshots: HookSnapshot[] = [];

		await act(async () => {
			root.render(
				<Provider store={kanbanStore}>
					<HookHarness
						currentProjectId="project-1"
						selectedChangeId={null}
						renderToken={1}
						onSnapshot={(snapshot) => {
							snapshots.push(snapshot);
						}}
					/>
				</Provider>,
			);
		});
		await flushAsyncWork();

		await waitForExpect(() => {
			expect(fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/trpc/changes.list"))).toHaveLength(1);
			expect(fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/trpc/changes.get"))).toHaveLength(0);
			expect(snapshots.at(-1)).toMatchObject({
				changesCount: 1,
				selectedChangeId: null,
				isLoading: false,
			});
		});

		await act(async () => {
			root.render(
				<Provider store={kanbanStore}>
					<HookHarness
						currentProjectId="project-1"
						selectedChangeId={null}
						renderToken={2}
						onSnapshot={(snapshot) => {
							snapshots.push(snapshot);
						}}
					/>
				</Provider>,
			);
		});
		await flushAsyncWork();

		await waitForExpect(() => {
			expect(fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/trpc/changes.list"))).toHaveLength(1);
			expect(fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/trpc/changes.get"))).toHaveLength(0);
		});
	});

	it("loads selected change detail without retriggering the list query", async () => {
		await act(async () => {
			root.render(
				<Provider store={kanbanStore}>
					<HookHarness
						currentProjectId="project-1"
						selectedChangeId={null}
						renderToken={1}
						onSnapshot={() => {}}
					/>
				</Provider>,
			);
		});
		await flushAsyncWork();

		await act(async () => {
			root.render(
				<Provider store={kanbanStore}>
					<HookHarness
						currentProjectId="project-1"
						selectedChangeId="chg-1"
						renderToken={2}
						onSnapshot={() => {}}
					/>
				</Provider>,
			);
		});
		await flushAsyncWork();

		await waitForExpect(() => {
			expect(fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/trpc/changes.list"))).toHaveLength(1);
			const getCalls = fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/trpc/changes.get"));
			expect(getCalls).toHaveLength(1);
			expect(String(getCalls[0]?.[0])).toContain(encodeURIComponent(JSON.stringify({ id: "chg-1" })));
		});
	});

	it("returns null selected detail while a new selected change is loading", async () => {
		const snapshots: HookSnapshot[] = [];
		let resolveChangeTwo: ((response: Response) => void) | null = null;
		fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.startsWith("/api/trpc/changes.list")) {
				return mockTrpcResponse({ changes: [createChange("chg-1"), createChange("chg-2")] });
			}
			if (url.startsWith("/api/trpc/changes.get")) {
				const decodedUrl = decodeURIComponent(url);
				if (decodedUrl.includes('"id":"chg-2"')) {
					return await new Promise<Response>((resolve) => {
						resolveChangeTwo = resolve;
					});
				}
				return mockTrpcResponse(createChangeDetail("chg-1"));
			}
			return new Response("Not found", { status: 404 });
		});

		await act(async () => {
			root.render(
				<Provider store={kanbanStore}>
					<HookHarness
						currentProjectId="project-1"
						selectedChangeId="chg-1"
						renderToken={1}
						onSnapshot={(snapshot) => {
							snapshots.push(snapshot);
						}}
					/>
				</Provider>,
			);
		});

		await waitForExpect(() => {
			expect(snapshots.at(-1)).toMatchObject({
				selectedChangeId: "chg-1",
				isSelectedChangeLoading: false,
			});
		});

		await act(async () => {
			root.render(
				<Provider store={kanbanStore}>
					<HookHarness
						currentProjectId="project-1"
						selectedChangeId="chg-2"
						renderToken={2}
						onSnapshot={(snapshot) => {
							snapshots.push(snapshot);
						}}
					/>
				</Provider>,
			);
		});

		await waitForExpect(() => {
			expect(snapshots.some((snapshot) => snapshot.selectedChangeId === null && snapshot.isSelectedChangeLoading)).toBe(
				true,
			);
		});

		await act(async () => {
			resolveChangeTwo?.(mockTrpcResponse(createChangeDetail("chg-2")));
			await Promise.resolve();
		});

		await waitForExpect(() => {
			expect(snapshots.at(-1)).toMatchObject({
				selectedChangeId: "chg-2",
				isSelectedChangeLoading: false,
			});
		});
	});
});
