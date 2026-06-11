import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RuntimeChangeyardChangeDetail, RuntimeChangeyardChangeListItem } from "@/runtime/types";
import { useChangeyardChanges } from "@/hooks/use-changeyard-changes";

const changesListQueryMock = vi.hoisted(() => vi.fn());
const changesGetQueryMock = vi.hoisted(() => vi.fn());

vi.mock("@/runtime/trpc-client", () => ({
	getRuntimeTrpcClient: () => ({
		changes: {
			list: {
				query: changesListQueryMock,
			},
			get: {
				query: changesGetQueryMock,
			},
		},
	}),
}));

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

	beforeEach(() => {
		changesListQueryMock.mockReset();
		changesGetQueryMock.mockReset();
		changesListQueryMock.mockResolvedValue({
			changes: [createChange("chg-1")],
		});
		changesGetQueryMock.mockResolvedValue(createChangeDetail("chg-1"));
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
				<HookHarness
					currentProjectId="project-1"
					selectedChangeId={null}
					renderToken={1}
					onSnapshot={(snapshot) => {
						snapshots.push(snapshot);
					}}
				/>,
			);
			await Promise.resolve();
		});

		expect(changesListQueryMock).toHaveBeenCalledTimes(1);
		expect(changesGetQueryMock).not.toHaveBeenCalled();
		expect(snapshots.at(-1)).toMatchObject({
			changesCount: 1,
			selectedChangeId: null,
			isLoading: false,
		});

		await act(async () => {
			root.render(
				<HookHarness
					currentProjectId="project-1"
					selectedChangeId={null}
					renderToken={2}
					onSnapshot={(snapshot) => {
						snapshots.push(snapshot);
					}}
				/>,
			);
			await Promise.resolve();
		});

		expect(changesListQueryMock).toHaveBeenCalledTimes(1);
		expect(changesGetQueryMock).not.toHaveBeenCalled();
	});

	it("loads selected change detail without retriggering the list query", async () => {
		await act(async () => {
			root.render(
				<HookHarness
					currentProjectId="project-1"
					selectedChangeId={null}
					renderToken={1}
					onSnapshot={() => {}}
				/>,
			);
			await Promise.resolve();
		});

		await act(async () => {
			root.render(
				<HookHarness
					currentProjectId="project-1"
					selectedChangeId="chg-1"
					renderToken={2}
					onSnapshot={() => {}}
				/>,
			);
			await Promise.resolve();
		});

		expect(changesListQueryMock).toHaveBeenCalledTimes(1);
		expect(changesGetQueryMock).toHaveBeenCalledTimes(1);
		expect(changesGetQueryMock).toHaveBeenCalledWith({ id: "chg-1" });
	});
});
