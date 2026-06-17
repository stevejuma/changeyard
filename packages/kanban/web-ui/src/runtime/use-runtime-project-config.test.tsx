import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { kanbanApi } from "@/runtime/kanban-api";
import { kanbanStore } from "@/runtime/kanban-store";
import type { RuntimeConfigResponse } from "@/runtime/types";
import { type UseRuntimeProjectConfigResult, useRuntimeProjectConfig } from "@/runtime/use-runtime-project-config";

const fetchRuntimeConfigMock = vi.hoisted(() => vi.fn());

function createDeferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((nextResolve, nextReject) => {
		resolve = nextResolve;
		reject = nextReject;
	});
	return { promise, resolve, reject };
}

function createRuntimeConfigResponse(
	selectedAgentId: RuntimeConfigResponse["selectedAgentId"],
	shortcuts: RuntimeConfigResponse["shortcuts"],
): RuntimeConfigResponse {
	return {
		selectedAgentId,
		selectedShortcutLabel: shortcuts[0]?.label ?? null,
		agentAutonomousModeEnabled: true,
		effectiveCommand: selectedAgentId,
		globalConfigPath: "/tmp/global-config.json",
		projectConfigPath: "/tmp/project/.changeyard/kanban/config.json",
		readyForReviewNotificationsEnabled: true,
		detectedCommands: [selectedAgentId],
		agents: [
			{
				id: "claude",
				label: "Claude Code",
				binary: "claude",
				command: "claude",
				defaultArgs: [],
				installed: selectedAgentId === "claude",
				configured: selectedAgentId === "claude",
			},
			{
				id: "codex",
				label: "OpenAI Codex",
				binary: "codex",
				command: "codex",
				defaultArgs: [],
				installed: selectedAgentId === "codex",
				configured: selectedAgentId === "codex",
			},
		],
		shortcuts,
		clineProviderSettings: {
			providerId: null,
			modelId: null,
			baseUrl: null,
			apiKeyConfigured: false,
			oauthProvider: null,
			oauthAccessTokenConfigured: false,
			oauthRefreshTokenConfigured: false,
			oauthAccountId: null,
			oauthExpiresAt: null,
		},
		commitPromptTemplate: "",
		openPrPromptTemplate: "",
		commitPromptTemplateDefault: "",
		openPrPromptTemplateDefault: "",
	};
}

type HookSnapshot = UseRuntimeProjectConfigResult;

function findLatestLoadedSnapshot(snapshots: HookSnapshot[]): HookSnapshot | null {
	for (let index = snapshots.length - 1; index >= 0; index -= 1) {
		const snapshot = snapshots[index];
		if (snapshot && snapshot.config !== null) {
			return snapshot;
		}
	}
	return null;
}

function HookBody({
	workspaceId,
	onSnapshot,
}: {
	workspaceId: string | null;
	onSnapshot: (snapshot: HookSnapshot) => void;
}): null {
	const snapshot = useRuntimeProjectConfig(workspaceId);

	useEffect(() => {
		onSnapshot(snapshot);
	}, [onSnapshot, snapshot]);

	return null;
}

function HookHarness(props: {
	workspaceId: string | null;
	onSnapshot: (snapshot: HookSnapshot) => void;
}): React.ReactElement {
	return (
		<Provider store={kanbanStore}>
			<HookBody {...props} />
		</Provider>
	);
}

function mockTrpcResponse(data: unknown): Response {
	return new Response(JSON.stringify({ result: { data } }), {
		status: 200,
		headers: { "content-type": "application/json" },
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
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
	}
	throw lastError;
}

describe("useRuntimeProjectConfig", () => {
	let container: HTMLDivElement;
	let root: Root;
	let previousActEnvironment: boolean | undefined;
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		kanbanStore.dispatch(kanbanApi.util.resetApiState());
		fetchRuntimeConfigMock.mockReset();
		fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = new URL(String(input), "http://localhost");
			if (url.pathname !== "/api/trpc/runtime.getConfig") {
				return new Response("Not found", { status: 404 });
			}
			return mockTrpcResponse(await fetchRuntimeConfigMock(url.searchParams.get("workspaceId")));
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

	it("clears the previous project config immediately when switching workspaces", async () => {
		const projectAConfig = createRuntimeConfigResponse("claude", [
			{ label: "Ship it", command: "pnpm run ship", icon: "rocket" },
		]);
		const projectBDeferred = createDeferred<RuntimeConfigResponse>();
		fetchRuntimeConfigMock.mockResolvedValueOnce(projectAConfig);
		fetchRuntimeConfigMock.mockImplementationOnce(() => projectBDeferred.promise);

		let snapshots: HookSnapshot[] = [];

		await act(async () => {
			root.render(
				<HookHarness
					workspaceId="project-a"
					onSnapshot={(snapshot) => {
						snapshots = [...snapshots, snapshot];
					}}
				/>,
			);
		});

		await waitForExpect(() => {
			const loadedProjectASnapshot = findLatestLoadedSnapshot(snapshots);
			expect(fetchRuntimeConfigMock).toHaveBeenCalledWith("project-a");
			expect(loadedProjectASnapshot?.config?.shortcuts).toHaveLength(1);
		});

		await act(async () => {
			root.render(
				<HookHarness
					workspaceId="project-b"
					onSnapshot={(snapshot) => {
						snapshots = [...snapshots, snapshot];
					}}
				/>,
			);
		});

		expect(fetchRuntimeConfigMock).toHaveBeenCalledWith("project-b");
		expect(snapshots.at(-1)?.config).toBeNull();

		await act(async () => {
			projectBDeferred.resolve(createRuntimeConfigResponse("codex", []));
			await projectBDeferred.promise;
		});

		await waitForExpect(() => {
			expect(snapshots.at(-1)?.config?.shortcuts).toEqual([]);
		});
	});

	it("loads runtime config without a selected project", async () => {
		const startupConfig = createRuntimeConfigResponse("codex", []);
		fetchRuntimeConfigMock.mockResolvedValue(startupConfig);
		let latestSnapshot: HookSnapshot | null = null;

		await act(async () => {
			root.render(
				<HookHarness
					workspaceId={null}
					onSnapshot={(snapshot) => {
						latestSnapshot = snapshot;
					}}
				/>,
			);
		});

		await waitForExpect(() => {
			expect(fetchRuntimeConfigMock).toHaveBeenCalledWith(null);
			if (latestSnapshot === null) {
				throw new Error("Expected a runtime project config snapshot.");
			}
			const snapshot = latestSnapshot as HookSnapshot;
			expect(snapshot.config?.selectedAgentId).toBe("codex");
			expect(snapshot.isLoading).toBe(false);
		});
	});
});
