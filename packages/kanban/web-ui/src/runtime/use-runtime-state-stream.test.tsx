import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RuntimeStateStreamMessage } from "@/runtime/types";
import { type UseRuntimeStateStreamResult, useRuntimeStateStream } from "@/runtime/use-runtime-state-stream";

class MockWebSocket {
	static readonly OPEN = 1;
	static instances: MockWebSocket[] = [];

	readonly url: string;
	readyState = MockWebSocket.OPEN;
	onopen: (() => void) | null = null;
	onmessage: ((event: { data: string }) => void) | null = null;
	onerror: (() => void) | null = null;
	onclose: (() => void) | null = null;

	constructor(url: string) {
		this.url = url;
		MockWebSocket.instances.push(this);
	}

	send(): void {
		// Test double.
	}

	close(): void {
		this.readyState = 3;
	}

	emit(payload: RuntimeStateStreamMessage): void {
		this.onmessage?.({ data: JSON.stringify(payload) });
	}
}

function HookHarness({
	workspaceId,
	onSnapshot,
}: {
	workspaceId: string | null;
	onSnapshot: (snapshot: UseRuntimeStateStreamResult) => void;
}): null {
	const snapshot = useRuntimeStateStream(workspaceId);
	useEffect(() => {
		onSnapshot(snapshot);
	}, [onSnapshot, snapshot]);
	return null;
}

describe("useRuntimeStateStream", () => {
	let container: HTMLDivElement;
	let root: Root;
	let originalWebSocket: typeof WebSocket | undefined;

	beforeEach(() => {
		MockWebSocket.instances = [];
		originalWebSocket = globalThis.WebSocket;
		(globalThis as typeof globalThis & { WebSocket: typeof WebSocket }).WebSocket =
			MockWebSocket as unknown as typeof WebSocket;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => {
			root.unmount();
		});
		container.remove();
		if (originalWebSocket) {
			(globalThis as typeof globalThis & { WebSocket: typeof WebSocket }).WebSocket = originalWebSocket;
		}
		vi.restoreAllMocks();
	});

	it("exposes VCS project events for the active workspace only", async () => {
		let latestSnapshot: UseRuntimeStateStreamResult | null = null;

		await act(async () => {
			root.render(
				<HookHarness
					workspaceId="project-1"
					onSnapshot={(snapshot) => {
						latestSnapshot = snapshot;
					}}
				/>,
			);
		});

		const socket = MockWebSocket.instances[0];
		expect(socket).toBeTruthy();

		await act(async () => {
			socket?.emit({
				type: "snapshot",
				currentProjectId: "project-1",
				projects: [],
				workspaceState: null,
				workspaceMetadata: null,
				clineSessionContextVersion: 0,
			});
		});

		await act(async () => {
			socket?.emit({
				type: "vcs_project_event",
				workspaceId: "project-1",
				topic: "project://project-1/worktree_changes",
				kind: "worktree_changes",
				paths: [".changeyard/workspaces/CY-0001/repo/src/file.ts"],
				changedAt: 10,
				version: 1,
			});
		});

		const activeEventSnapshot = latestSnapshot as unknown as UseRuntimeStateStreamResult;
		expect(activeEventSnapshot.latestVcsProjectEvent?.version).toBe(1);
		expect(activeEventSnapshot.latestVcsProjectEvent?.paths).toEqual([
			".changeyard/workspaces/CY-0001/repo/src/file.ts",
		]);

		await act(async () => {
			socket?.emit({
				type: "vcs_project_event",
				workspaceId: "other-project",
				topic: "project://other-project/worktree_changes",
				kind: "worktree_changes",
				paths: ["README.md"],
				changedAt: 11,
				version: 2,
			});
		});

		const ignoredEventSnapshot = latestSnapshot as unknown as UseRuntimeStateStreamResult;
		expect(ignoredEventSnapshot.latestVcsProjectEvent?.version).toBe(1);
	});
});
