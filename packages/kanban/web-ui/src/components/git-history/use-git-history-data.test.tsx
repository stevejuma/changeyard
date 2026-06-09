import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useGitHistoryData } from "@/components/git-history/use-git-history-data";
import type {
	RuntimeGitCommitDiffResponse,
	RuntimeGitLogResponse,
	RuntimeGitRefsResponse,
	RuntimeGitSyncSummary,
	RuntimeWorkspaceChangesResponse,
} from "@/runtime/types";

const getRepositoryRefsQueryMock = vi.hoisted(() => vi.fn());
const getRepositoryLogQueryMock = vi.hoisted(() => vi.fn());
const getRepositoryCommitDiffQueryMock = vi.hoisted(() => vi.fn());
const getChangesQueryMock = vi.hoisted(() => vi.fn());
const getWorkspaceChangesQueryMock = vi.hoisted(() => vi.fn());

vi.mock("@/runtime/trpc-client", () => ({
	getRuntimeTrpcClient: () => ({
		workspace: {
			getRepositoryRefs: {
				query: getRepositoryRefsQueryMock,
			},
			getRepositoryLog: {
				query: getRepositoryLogQueryMock,
			},
			getRepositoryCommitDiff: {
				query: getRepositoryCommitDiffQueryMock,
			},
			getChanges: {
				query: getChangesQueryMock,
			},
			getWorkspaceChanges: {
				query: getWorkspaceChangesQueryMock,
			},
		},
	}),
}));

interface HookSnapshot {
	refs: string[];
	activeRefName: string | null;
	commits: string[];
	selectedCommitHash: string | null;
	isRefsLoading: boolean;
	isLogLoading: boolean;
	isDiffLoading: boolean;
}

function createGitSummary(branch: string): RuntimeGitSyncSummary {
	return {
		currentBranch: branch,
		jjChangeId: null,
		upstreamBranch: `origin/${branch}`,
		changedFiles: 0,
		additions: 0,
		deletions: 0,
		aheadCount: 0,
		behindCount: 0,
	};
}

function createJjSummary(branch: string | null, changeId: string): RuntimeGitSyncSummary {
	return {
		currentBranch: branch,
		jjChangeId: changeId,
		upstreamBranch: null,
		changedFiles: 0,
		additions: 0,
		deletions: 0,
		aheadCount: 0,
		behindCount: 0,
	};
}

function createRefsResponse(
	branch: string,
	hash: string,
	options?: { includeRemote?: boolean; remoteHash?: string },
): RuntimeGitRefsResponse {
	return {
		ok: true,
		refs: [
			{
				name: branch,
				type: "branch",
				hash,
				isHead: true,
				upstreamName: options?.includeRemote ? `origin/${branch}` : undefined,
				ahead: 0,
				behind: 0,
			},
			...(options?.includeRemote
				? [
						{
							name: `origin/${branch}`,
							type: "remote" as const,
							hash: options.remoteHash ?? hash,
							isHead: false,
						},
					]
				: []),
		],
	};
}

function createLogResponse(
	hashOrCommits:
		| string
		| Array<{
				hash: string;
				message: string;
				changeId?: string;
				relation?: "selected" | "upstream" | "shared";
		  }>,
	message?: string,
): RuntimeGitLogResponse {
	const commits =
		typeof hashOrCommits === "string"
			? [
					{
						hash: hashOrCommits,
						message: message ?? "Test commit",
					},
				]
			: hashOrCommits;

	return {
		ok: true,
		totalCount: commits.length,
		commits: commits.map((commit) => ({
			hash: commit.hash,
			shortHash: commit.hash.slice(0, 8),
			changeId: commit.changeId,
			authorName: "Test User",
			authorEmail: "test@example.com",
			date: "2026-03-12T00:00:00.000Z",
			message: commit.message,
			parentHashes: [],
			relation: commit.relation,
		})),
	};
}

function createDiffResponse(hash: string): RuntimeGitCommitDiffResponse {
	return {
		ok: true,
		commitHash: hash,
		files: [],
	};
}

function createWorkspaceChangesResponse(): RuntimeWorkspaceChangesResponse {
	return {
		repoRoot: "/tmp/project",
		generatedAt: Date.now(),
		files: [],
	};
}

async function flushPromises(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
}

function HookHarness({
	taskScope,
	enabled = true,
	gitSummary,
	onRender,
}: {
	taskScope: { taskId: string; baseRef: string } | null;
	enabled?: boolean;
	gitSummary?: RuntimeGitSyncSummary;
	onRender: (snapshot: HookSnapshot) => void;
}): null {
	const gitHistory = useGitHistoryData({
		workspaceId: "project-1",
		taskScope,
		gitSummary: gitSummary ?? createGitSummary(taskScope ? "task-branch" : "main"),
		enabled,
	});

	onRender({
		refs: gitHistory.refs.map((ref) => ref.name),
		activeRefName: gitHistory.activeRef?.name ?? null,
		commits: gitHistory.commits.map((commit) => commit.hash),
		selectedCommitHash: gitHistory.selectedCommitHash,
		isRefsLoading: gitHistory.isRefsLoading,
		isLogLoading: gitHistory.isLogLoading,
		isDiffLoading: gitHistory.isDiffLoading,
	});

	return null;
}

describe("useGitHistoryData", () => {
	let container: HTMLDivElement;
	let root: Root;
	let previousActEnvironment: boolean | undefined;

	beforeEach(() => {
		getRepositoryRefsQueryMock.mockReset();
		getRepositoryLogQueryMock.mockReset();
		getRepositoryCommitDiffQueryMock.mockReset();
		getChangesQueryMock.mockReset();
		getWorkspaceChangesQueryMock.mockReset();

		getRepositoryRefsQueryMock.mockImplementation(async (taskScope: { taskId: string; baseRef: string } | null) =>
			taskScope ? createRefsResponse("task-branch", "taskhash1") : createRefsResponse("main", "homehash1"),
		);
		getRepositoryLogQueryMock.mockImplementation(
			async ({ taskScope }: { taskScope?: { taskId: string; baseRef: string } | null }) =>
				taskScope ? createLogResponse("taskhash1", "Task commit") : createLogResponse("homehash1", "Home commit"),
		);
		getRepositoryCommitDiffQueryMock.mockImplementation(async ({ commitHash }: { commitHash: string }) =>
			createDiffResponse(commitHash),
		);
		getChangesQueryMock.mockImplementation(async () => createWorkspaceChangesResponse());
		getWorkspaceChangesQueryMock.mockImplementation(async () => createWorkspaceChangesResponse());

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

	it("does not expose home git history data during a task scope transition", async () => {
		const snapshots: HookSnapshot[] = [];

		await act(async () => {
			root.render(
				<HookHarness
					taskScope={null}
					onRender={(snapshot) => {
						snapshots.push(snapshot);
					}}
				/>,
			);
			await flushPromises();
		});

		const settledHomeSnapshot = snapshots.at(-1);
		expect(settledHomeSnapshot).toMatchObject({
			refs: ["main"],
			activeRefName: "main",
			commits: ["homehash1"],
		});

		const firstTaskScopeSnapshotIndex = snapshots.length;
		await act(async () => {
			root.render(
				<HookHarness
					taskScope={{
						taskId: "task-1",
						baseRef: "main",
					}}
					onRender={(snapshot) => {
						snapshots.push(snapshot);
					}}
				/>,
			);
			await flushPromises();
		});

		const transitionSnapshot = snapshots[firstTaskScopeSnapshotIndex];
		expect(transitionSnapshot).toMatchObject({
			refs: [],
			activeRefName: null,
			commits: [],
			selectedCommitHash: null,
			isRefsLoading: true,
			isLogLoading: true,
			isDiffLoading: true,
		});
	});

	it("reports loading on the first render before git history queries resolve", async () => {
		const snapshots: HookSnapshot[] = [];

		await act(async () => {
			root.render(
				<HookHarness
					taskScope={null}
					onRender={(snapshot) => {
						snapshots.push(snapshot);
					}}
				/>,
			);
		});

		const firstSnapshot = snapshots[0];
		expect(firstSnapshot).toMatchObject({
			refs: [],
			activeRefName: null,
			commits: [],
			selectedCommitHash: null,
			isRefsLoading: true,
			isLogLoading: true,
			isDiffLoading: true,
		});
	});

	it("clears cached refs and diff data when the panel closes so reopen starts cleanly", async () => {
		const snapshots: HookSnapshot[] = [];

		await act(async () => {
			root.render(
				<HookHarness
					taskScope={null}
					onRender={(snapshot) => {
						snapshots.push(snapshot);
					}}
				/>,
			);
			await flushPromises();
		});

		expect(snapshots.at(-1)).toMatchObject({
			refs: ["main"],
			activeRefName: "main",
			commits: ["homehash1"],
			selectedCommitHash: "homehash1",
			isRefsLoading: false,
			isLogLoading: false,
			isDiffLoading: false,
		});

		await act(async () => {
			root.render(
				<HookHarness
					taskScope={null}
					enabled={false}
					onRender={(snapshot) => {
						snapshots.push(snapshot);
					}}
				/>,
			);
			await flushPromises();
		});

		const snapshotsBeforeReopen = snapshots.length;
		await act(async () => {
			root.render(
				<HookHarness
					taskScope={null}
					enabled={true}
					onRender={(snapshot) => {
						snapshots.push(snapshot);
					}}
				/>,
			);
		});

		const reopenSnapshot = snapshots[snapshotsBeforeReopen];
		expect(reopenSnapshot).toMatchObject({
			refs: [],
			activeRefName: null,
			commits: [],
			selectedCommitHash: null,
			isRefsLoading: true,
			isLogLoading: true,
			isDiffLoading: true,
		});
	});

	it("loads the active branch together with its upstream remote when both refs are available", async () => {
		getRepositoryRefsQueryMock.mockResolvedValue(createRefsResponse("main", "homehash1", { includeRemote: true }));

		await act(async () => {
			root.render(<HookHarness taskScope={null} onRender={() => {}} />);
			await flushPromises();
		});

		expect(getRepositoryLogQueryMock).toHaveBeenCalledWith(
			expect.objectContaining({
				ref: "main",
				refs: ["main", "origin/main"],
			}),
			expect.anything(),
		);
	});

	it("selects the checked out branch head by default when the remote has newer commits", async () => {
		const snapshots: HookSnapshot[] = [];

		getRepositoryRefsQueryMock.mockResolvedValue(
			createRefsResponse("main", "homehash1", {
				includeRemote: true,
				remoteHash: "remotehash1",
			}),
		);
		getRepositoryLogQueryMock.mockResolvedValue(
			createLogResponse([
				{ hash: "remotehash1", message: "Remote commit", relation: "upstream" },
				{ hash: "homehash1", message: "Local head", relation: "selected" },
				{ hash: "basehash1", message: "Base commit", relation: "shared" },
			]),
		);

		await act(async () => {
			root.render(
				<HookHarness
					taskScope={null}
					onRender={(snapshot) => {
						snapshots.push(snapshot);
					}}
				/>,
			);
			await flushPromises();
		});

		expect(snapshots.at(-1)).toMatchObject({
			activeRefName: "main",
			commits: ["remotehash1", "homehash1", "basehash1"],
			selectedCommitHash: "homehash1",
		});
	});

	it("defaults JJ history to the current head change when bookmarks lag behind it", async () => {
		const snapshots: HookSnapshot[] = [];

		getRepositoryRefsQueryMock.mockResolvedValue({
			ok: true,
			refs: [
				{
					name: "sqxqrtuorxzn",
					type: "detached",
					hash: "headhash1",
					changeId: "sqxqrtuorxzn",
					isHead: true,
				},
				{
					name: "main",
					type: "branch",
					hash: "bookmarkhash1",
					isHead: false,
				},
			],
		});
		getRepositoryLogQueryMock.mockResolvedValue(
			createLogResponse([
				{ hash: "headhash1", changeId: "sqxqrtuorxzn", message: "Current change" },
				{ hash: "bookmarkhash1", changeId: "kwkovtzrtvkl", message: "Bookmarked change" },
			]),
		);

		await act(async () => {
			root.render(
				<HookHarness
					taskScope={null}
					gitSummary={createJjSummary("main", "sqxqrtuorxzn")}
					onRender={(snapshot) => {
						snapshots.push(snapshot);
					}}
				/>,
			);
			await flushPromises();
		});

		expect(getRepositoryLogQueryMock).toHaveBeenCalledWith(
			expect.objectContaining({
				ref: "headhash1",
				refs: ["headhash1"],
			}),
			expect.anything(),
		);
		expect(snapshots.at(-1)).toMatchObject({
			refs: ["sqxqrtuorxzn", "main"],
			activeRefName: "sqxqrtuorxzn",
			commits: ["headhash1", "bookmarkhash1"],
			selectedCommitHash: "headhash1",
		});
	});
});
