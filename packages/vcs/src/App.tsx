import { useEffect, useMemo, useReducer, useState } from "react";
import { ArrowRight, GitBranch, Layers3, ShieldAlert } from "lucide-react";
import {
	type AbandonChangePreviewRequest,
	type AbsorbFilePreviewRequest,
	createReorderPreviewRequest,
	initialPreviewUiState,
	previewUiReducer,
	type CreateChangePreviewRequest,
	type MoveBookmarkPreviewRequest,
	type RedoLastPreviewRequest,
	type RestoreFilePreviewRequest,
	type SquashChangePreviewRequest,
	type UndoLastPreviewRequest,
	validateReorderPreviewRequest,
	type CreateBookmarkPreviewRequest,
	type EditMessagePreviewRequest,
	type PreviewPlacement,
	type ReorderPreviewRequest,
} from "./preview-state";
import { canConfirmSubmit, getSubmitOutcomeMessage } from "./submit-state";
type VcsOperationRequest =
	| ReorderPreviewRequest
	| CreateBookmarkPreviewRequest
	| EditMessagePreviewRequest
	| CreateChangePreviewRequest
	| MoveBookmarkPreviewRequest
	| SquashChangePreviewRequest
	| AbsorbFilePreviewRequest
	| RestoreFilePreviewRequest
	| UndoLastPreviewRequest
	| RedoLastPreviewRequest
	| AbandonChangePreviewRequest;
type VcsDiagnostic = {
	level: "info" | "warning" | "error";
	code: string;
	message: string;
};

type VcsDetectResponse = {
	cwd: string;
	repository: {
		kind: "none" | "git" | "jj";
		root: string | null;
	};
	jj: {
		installed: boolean;
		version: string | null;
		repoRoot: string | null;
		currentBookmark: string | null;
		currentChangeId: string | null;
		defaultBase: string | null;
	};
	git: {
		remoteName: string | null;
		remoteUrl: string | null;
		provider: "none" | "github" | "gitlab" | "forgejo" | "unknown";
		defaultBranch: string | null;
	};
	publishing: {
		provider: "none" | "github" | "gitlab" | "forgejo" | "unknown";
		remoteName: string | null;
		available: boolean;
		authenticated: boolean;
		reason: string | null;
	};
	diagnostics: VcsDiagnostic[];
};

type VcsJjStateResponse = VcsDetectResponse & {
	bookmarks: Array<{
		name: string;
		changeId: string;
		commitId: string;
		synced: boolean;
		tracked: boolean;
	}>;
	changes: Array<{
		changeId: string;
		commitId: string;
		description: string;
		parentChangeIds: string[];
		bookmarks: string[];
		remoteBookmarks: string[];
		isCurrent: boolean;
	}>;
	lanes: Array<{
		id: string;
		headBookmark: string;
		segments: Array<{
			id: string;
			changeId: string;
			commitId: string;
			title: string;
			bookmarks: string[];
			remoteBookmarks: string[];
			isCurrent: boolean;
			isHead: boolean;
		}>;
	}>;
	unassignedChanges: Array<{
		path: string;
		status: "modified" | "added" | "deleted" | "renamed" | "copied" | "unknown";
	}>;
};

type VcsJjDiffResponse = {
	changeId: string | null;
	summary: string;
	patch: string;
	diagnostics: VcsDiagnostic[];
};

type VcsPreviewOperationResponse = {
	valid: boolean;
	operation: VcsOperationRequest;
	title: string;
	description: string;
	risk: "low" | "medium" | "high";
	commands: Array<{
		command: "jj";
		args: string[];
	}>;
	affectedChangeIds: string[];
	affectedBookmarks: string[];
	diagnostics: VcsDiagnostic[];
};

type VcsApplyOperationResponse = {
	ok: boolean;
	operation: VcsOperationRequest;
	title: string;
	description: string;
	risk: "low" | "medium" | "high";
	command: {
		command: "jj";
		args: string[];
	} | null;
	stdout: string;
	stderr: string;
	exitCode: number | null;
	affectedChangeIds: string[];
	affectedBookmarks: string[];
	diagnostics: VcsDiagnostic[];
};

type VcsSubmitStackPreviewResponse = {
	available: boolean;
	targetBookmark: string | null;
	remoteName: string | null;
	repoOwner: string | null;
	repoName: string | null;
	items: Array<{
		bookmarkName: string;
		changeId: string;
		title: string;
		baseBranch: string;
		needsPush: boolean;
		action: "none" | "push" | "create_pr" | "update_pr_base" | "push_and_create_pr";
		existingPr: {
			number: number;
			url: string | null;
			baseBranch: string;
		} | null;
	}>;
	commands: Array<{
		command: "jj";
		args: string[];
	}>;
	diagnostics: VcsDiagnostic[];
};

type VcsSubmitStackResponse = {
	ok: boolean;
	targetBookmark: string | null;
	remoteName: string | null;
	repoOwner: string | null;
	repoName: string | null;
	items: Array<{
		bookmarkName: string;
		changeId: string;
		title: string;
		baseBranch: string;
		needsPush: boolean;
		action: "none" | "push" | "create_pr" | "update_pr_base" | "push_and_create_pr";
		existingPr: {
			number: number;
			url: string | null;
			baseBranch: string;
		} | null;
		completed: boolean;
		resultPr: {
			number: number;
			url: string | null;
			baseBranch: string;
		} | null;
	}>;
	commands: Array<{
		command: "jj";
		args: string[];
	}>;
	diagnostics: VcsDiagnostic[];
};

type QueryState<T> =
	| { status: "loading" }
	| { status: "error"; message: string }
	| { status: "ready"; data: T };

type MutationState<T> =
	| { status: "idle" }
	| { status: "loading" }
	| { status: "error"; message: string }
	| { status: "ready"; data: T };

type VcsRoute =
	| { kind: "landing" }
	| { kind: "jj-board" }
	| { kind: "jj-branches" }
	| { kind: "jj-history" }
	| { kind: "settings" };

type BookmarkDraftState = {
	changeId: string;
	name: string;
};

type MessageDraftState = {
	changeId: string;
	message: string;
};

type CreateChangeDraftState = {
	anchorChangeId: string;
	placement: PreviewPlacement;
	message: string;
};

type MoveBookmarkDraftState = {
	sourceChangeId: string;
	bookmarkName: string;
	targetChangeId: string;
};

type SquashChangeDraftState = {
	sourceChangeId: string;
};

type AbsorbFileDraftState = {
	paths: string[];
};

export function resolveVcsRoute(pathname: string): VcsRoute {
	if (pathname.startsWith("/vcs/jj/branches")) {
		return { kind: "jj-branches" };
	}
	if (pathname.startsWith("/vcs/jj/history")) {
		return { kind: "jj-history" };
	}
	if (pathname.startsWith("/vcs/jj")) {
		return { kind: "jj-board" };
	}
	if (pathname.startsWith("/vcs/settings")) {
		return { kind: "settings" };
	}
	return { kind: "landing" };
}

function createBookmarkPreviewRequest(changeId: string, bookmarkName: string): CreateBookmarkPreviewRequest {
	return {
		kind: "create_bookmark",
		changeId,
		bookmarkName,
	};
}

function createEditMessagePreviewRequest(changeId: string, message: string): EditMessagePreviewRequest {
	return {
		kind: "edit_message",
		changeId,
		message,
	};
}

function createChangePreviewRequest(
	anchorChangeId: string,
	placement: PreviewPlacement,
	message: string,
): CreateChangePreviewRequest {
	return {
		kind: "create_change",
		anchorChangeId,
		placement,
		message,
	};
}

function createMoveBookmarkPreviewRequest(
	bookmarkName: string,
	targetChangeId: string,
): MoveBookmarkPreviewRequest {
	return {
		kind: "move_bookmark",
		bookmarkName,
		targetChangeId,
	};
}

function createAbandonChangePreviewRequest(changeId: string): AbandonChangePreviewRequest {
	return {
		kind: "abandon_change",
		changeId,
	};
}

function createSquashChangePreviewRequest(sourceChangeId: string, targetChangeId: string): SquashChangePreviewRequest {
	return {
		kind: "squash_change",
		sourceChangeId,
		targetChangeId,
	};
}

function createAbsorbFilePreviewRequest(targetChangeId: string, paths: string[]): AbsorbFilePreviewRequest {
	return {
		kind: "absorb_file",
		targetChangeId,
		paths,
	};
}

function createRestoreFilePreviewRequest(paths: string[]): RestoreFilePreviewRequest {
	return {
		kind: "restore_file",
		paths,
	};
}

function createUndoLastPreviewRequest(): UndoLastPreviewRequest {
	return {
		kind: "undo_last",
	};
}

function createRedoLastPreviewRequest(): RedoLastPreviewRequest {
	return {
		kind: "redo_last",
	};
}

function summarizeOperationRequest(request: VcsOperationRequest): string {
	switch (request.kind) {
		case "reorder_change":
			return `${request.sourceChangeId} ${request.placement} ${request.targetChangeId}`;
		case "create_bookmark":
			return `${request.bookmarkName} -> ${request.changeId}`;
		case "edit_message":
			return `${request.changeId} message update`;
		case "create_change":
			return `new change ${request.placement} ${request.anchorChangeId}`;
		case "move_bookmark":
			return `${request.bookmarkName} -> ${request.targetChangeId}`;
		case "squash_change":
			return `squash ${request.sourceChangeId} -> ${request.targetChangeId}`;
		case "absorb_file":
			return `absorb ${request.paths.join(", ")} -> ${request.targetChangeId}`;
		case "restore_file":
			return `restore ${request.paths.join(", ")}`;
		case "undo_last":
			return "undo last JJ operation";
		case "redo_last":
			return "redo last JJ operation";
		case "abandon_change":
			return `abandon ${request.changeId}`;
	}
}

async function fetchTrpcQuery<T>(path: string, input?: unknown): Promise<T> {
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

async function postTrpcMutation<T>(path: string, input: unknown): Promise<T> {
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

function useTrpcQuery<T>(path: string, message: string): { state: QueryState<T>; refresh: () => void } {
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
					setState({
						status: "error",
						message: error instanceof Error ? error.message : message,
					});
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

function useTrpcInputQuery<T>(
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
					setState({
						status: "error",
						message: error instanceof Error ? error.message : message,
					});
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

function usePreviewOperation() {
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

	function clear(): void {
		setState({ status: "loading" });
	}

	function showLocal(data: VcsPreviewOperationResponse): void {
		setState({ status: "ready", data });
	}

	return {
		state,
		preview,
		clear,
		showLocal,
	};
}

function useApplyOperation() {
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

	function clear(): void {
		setState({ status: "idle" });
	}

	return {
		state,
		apply,
		clear,
	};
}

function useSubmitStack() {
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

	function clear(): void {
		setState({ status: "idle" });
	}

	return {
		state,
		submit,
		clear,
	};
}

function DetectionPanel({ state }: { state: QueryState<VcsDetectResponse> }) {
	if (state.status === "loading") {
		return (
			<div className="panel">
				<div className="panel-copy">
					<h2>Repository Detection</h2>
					<p>Loading runtime repository state.</p>
				</div>
			</div>
		);
	}

	if (state.status === "error") {
		return (
			<div className="panel warning">
				<div className="panel-copy">
					<h2>Repository Detection</h2>
					<p>{state.message}</p>
				</div>
			</div>
		);
	}

	const { data } = state;
	return (
		<div className="panel">
			<div className="panel-copy">
				<h2>Repository Detection</h2>
				<p>
					{data.repository.kind.toUpperCase()} repository
					{data.repository.root ? ` at ${data.repository.root}` : " not detected"}.
				</p>
				<p>
					Default base: <code>{data.jj.defaultBase ?? data.git.defaultBranch ?? "unknown"}</code>
				</p>
				<p>
					Remote: <code>{data.git.remoteName ?? "none"}</code>
					{data.git.provider !== "none" ? ` (${data.git.provider})` : ""}
				</p>
			</div>
		</div>
	);
}

function DiagnosticsPanel({ diagnostics }: { diagnostics: VcsDiagnostic[] }) {
	if (diagnostics.length === 0) {
		return null;
	}
	return (
		<div className="panel warning">
			<div className="panel-copy">
				<h2>Diagnostics</h2>
				{diagnostics.map((diagnostic) => (
					<p key={`${diagnostic.code}-${diagnostic.message}`}>
						<strong>{diagnostic.level}</strong>: {diagnostic.message}
					</p>
				))}
			</div>
		</div>
	);
}

function VcsNav({ currentPath }: { currentPath: string }) {
	const links = [
		{ href: "/vcs", label: "Overview" },
		{ href: "/vcs/jj", label: "JJ Board" },
		{ href: "/vcs/jj/branches", label: "Branches" },
		{ href: "/vcs/jj/history", label: "History" },
		{ href: "/vcs/settings", label: "Settings" },
	];

	return (
		<nav className="route-nav" aria-label="VCS routes">
			{links.map((link) => {
				const active = currentPath === link.href || currentPath.startsWith(`${link.href}/`);
				return (
					<a
						key={link.href}
						className={`button subtle${active ? " active" : ""}`}
						href={link.href}
						aria-current={active ? "page" : undefined}
					>
						{link.label}
					</a>
				);
			})}
		</nav>
	);
}

function LandingView({ state }: { state: QueryState<VcsDetectResponse> }) {
	const diagnostics = state.status === "ready" ? state.data.diagnostics : [];

	return (
		<main className="shell">
			<section className="hero">
				<div className="eyebrow">Changeyard / VCS</div>
				<h1>JJ-first repository operations, isolated from the board.</h1>
				<p className="lede">
					This surface is enabled behind <code>CHANGEYARD_VCS=1</code>. Detection and the JJ read model now run
					through the existing tRPC runtime boundary.
				</p>
				<VcsNav currentPath={window.location.pathname} />
			</section>

			<section className="grid">
				<a className="panel panel-link" href="/vcs/jj">
					<div className="panel-icon">
						<Layers3 size={18} />
					</div>
					<div className="panel-copy">
						<h2>JJ Stack View</h2>
						<p>Read-only lanes for bookmarks, stacked changes, and working-copy file summaries.</p>
					</div>
					<ArrowRight size={16} />
				</a>

				<DetectionPanel state={state} />

				<div className="panel">
					<div className="panel-icon">
						<GitBranch size={18} />
					</div>
					<div className="panel-copy">
						<h2>Feature Gate</h2>
						<p>Requests under <code>/vcs</code> are served only when the runtime sees <code>CHANGEYARD_VCS=1</code>.</p>
					</div>
				</div>

				<div className="panel warning">
					<div className="panel-icon">
						<ShieldAlert size={18} />
					</div>
					<div className="panel-copy">
						<h2>Mutation Safety</h2>
						<p>JJ mutations and stacked PR publishing remain disabled while previews and confirmations are still pending.</p>
					</div>
				</div>

				<DiagnosticsPanel diagnostics={diagnostics} />
			</section>
		</main>
	);
}

function JjBranchesView({ state }: { state: QueryState<VcsJjStateResponse> }) {
	if (state.status === "loading") {
		return (
			<main className="shell">
				<section className="hero compact">
					<div className="eyebrow">Changeyard / VCS / JJ</div>
					<h1>Bookmark Inventory</h1>
					<p className="lede">Loading bookmark and stack lane inventory.</p>
					<VcsNav currentPath={window.location.pathname} />
				</section>
			</main>
		);
	}

	if (state.status === "error") {
		return (
			<main className="shell">
				<section className="hero compact">
					<div className="eyebrow">Changeyard / VCS / JJ</div>
					<h1>Bookmark Inventory</h1>
					<p className="lede">{state.message}</p>
					<VcsNav currentPath={window.location.pathname} />
				</section>
			</main>
		);
	}

	const { data } = state;
	return (
		<main className="shell">
			<section className="hero compact">
				<div className="eyebrow">Changeyard / VCS / JJ</div>
				<h1>Bookmark Inventory</h1>
				<p className="lede">Inspect local bookmarks, current heads, and stack lanes without mutating the repository.</p>
				<VcsNav currentPath={window.location.pathname} />
			</section>
			<section className="grid">
				<div className="panel">
					<div className="panel-copy">
						<h2>Current bookmark</h2>
						<p>
							{data.jj.currentBookmark ? <code>{data.jj.currentBookmark}</code> : "No current JJ bookmark is associated with @."}
						</p>
					</div>
				</div>
				<div className="panel">
					<div className="panel-copy">
						<h2>Stack lanes</h2>
						<p>{data.lanes.length} bookmark-backed lane{data.lanes.length === 1 ? "" : "s"} currently detected.</p>
					</div>
				</div>
				<div className="panel">
					<div className="panel-copy">
						<h2>Remote tracking</h2>
						<p>{data.bookmarks.filter((bookmark) => bookmark.tracked || bookmark.synced).length} bookmark(s) have tracked or synced remote state.</p>
					</div>
				</div>
			</section>
			<section className="board">
				<section className="column" style={{ gridColumn: "span 2" }}>
					<h2>Bookmarks</h2>
					{data.bookmarks.length === 0 ? (
						<p className="muted">No local JJ bookmarks were detected.</p>
					) : (
						data.bookmarks.map((bookmark) => (
							<div className="stub" key={bookmark.name}>
								<span className="stub-label">{bookmark.name}</span>
								<span className="stub-value">
									<code>{bookmark.changeId}</code> · <code>{bookmark.commitId}</code>
								</span>
								<div className="card-subtle">
									{bookmark.tracked ? "tracked" : "local only"}
									{bookmark.synced ? " · synced" : ""}
								</div>
							</div>
						))
					)}
				</section>
				<aside className="column side">
					<h2>Lane heads</h2>
					{data.lanes.length === 0 ? (
						<p className="muted">No bookmark-backed stacks found.</p>
					) : (
						data.lanes.map((lane) => (
							<div className="stub" key={lane.id}>
								<span className="stub-label">{lane.headBookmark}</span>
								<span className="stub-value">{lane.segments.length} change segments</span>
							</div>
						))
					)}
				</aside>
			</section>
			<section className="grid diagnostics-grid">
				<DiagnosticsPanel diagnostics={data.diagnostics} />
			</section>
		</main>
	);
}

function JjHistoryView({ state }: { state: QueryState<VcsJjStateResponse> }) {
	if (state.status === "loading") {
		return (
			<main className="shell">
				<section className="hero compact">
					<div className="eyebrow">Changeyard / VCS / JJ</div>
					<h1>Operation History</h1>
					<p className="lede">Loading recent JJ actions.</p>
					<VcsNav currentPath={window.location.pathname} />
				</section>
			</main>
		);
	}

	if (state.status === "error") {
		return (
			<main className="shell">
				<section className="hero compact">
					<div className="eyebrow">Changeyard / VCS / JJ</div>
					<h1>Operation History</h1>
					<p className="lede">{state.message}</p>
					<VcsNav currentPath={window.location.pathname} />
				</section>
			</main>
		);
	}

	const { data } = state;
	const recentChanges = [...data.changes].reverse().slice(0, 12);
	return (
		<main className="shell">
			<section className="hero compact">
				<div className="eyebrow">Changeyard / VCS / JJ</div>
				<h1>Operation History</h1>
				<p className="lede">Recent JJ actions and change history context, with undo and redo available from the main board preview flow.</p>
				<VcsNav currentPath={window.location.pathname} />
			</section>
			<section className="grid">
				<div className="panel">
					<div className="panel-copy">
						<h2>Undo / Redo</h2>
						<p>Use the board’s preview-and-confirm flow to issue `jj undo` or `jj redo` after reviewing the pending operation.</p>
					</div>
				</div>
				<div className="panel">
					<div className="panel-copy">
						<h2>Recent JJ actions</h2>
						<p>{recentChanges.length} recent change entries are available from the current read model.</p>
					</div>
				</div>
				<div className="panel">
					<div className="panel-copy">
						<h2>Working copy</h2>
						<p>{data.unassignedChanges.length} file change(s) are currently outside bookmark cards.</p>
					</div>
				</div>
			</section>
			<section className="board">
				<section className="column" style={{ gridColumn: "span 2" }}>
					<h2>Recent change history</h2>
					{recentChanges.length === 0 ? (
						<p className="muted">No JJ changes were available from the runtime state.</p>
					) : (
						recentChanges.map((change) => (
							<div className="stub" key={change.changeId}>
								<span className="stub-label">{change.description}</span>
								<span className="stub-value">
									<code>{change.changeId}</code> · <code>{change.commitId}</code>
								</span>
								<div className="card-subtle">
									Parents: {change.parentChangeIds.length > 0 ? change.parentChangeIds.join(", ") : "root"}
									{change.bookmarks.length > 0 ? ` · bookmarks: ${change.bookmarks.join(", ")}` : ""}
								</div>
							</div>
						))
					)}
				</section>
				<aside className="column side">
					<h2>Restore context</h2>
					<p className="muted">File restore remains available from the board and working-copy panels where specific file selections can be previewed safely.</p>
				</aside>
			</section>
			<section className="grid diagnostics-grid">
				<DiagnosticsPanel diagnostics={data.diagnostics} />
			</section>
		</main>
	);
}

function SettingsView({ state }: { state: QueryState<VcsDetectResponse> }) {
	if (state.status === "loading") {
		return (
			<main className="shell">
				<section className="hero compact">
					<div className="eyebrow">Changeyard / VCS</div>
					<h1>VCS Settings</h1>
					<p className="lede">Loading runtime VCS configuration diagnostics.</p>
					<VcsNav currentPath={window.location.pathname} />
				</section>
			</main>
		);
	}

	if (state.status === "error") {
		return (
			<main className="shell">
				<section className="hero compact">
					<div className="eyebrow">Changeyard / VCS</div>
					<h1>VCS Settings</h1>
					<p className="lede">{state.message}</p>
					<VcsNav currentPath={window.location.pathname} />
				</section>
			</main>
		);
	}

	const { data } = state;
	return (
		<main className="shell">
			<section className="hero compact">
				<div className="eyebrow">Changeyard / VCS</div>
				<h1>VCS Settings</h1>
				<p className="lede">Read-only runtime diagnostics for the feature flag, repository detection, and GitHub submit readiness.</p>
				<VcsNav currentPath={window.location.pathname} />
			</section>
			<section className="grid">
				<div className="panel">
					<div className="panel-copy">
						<h2>Feature flag</h2>
						<p>`CHANGEYARD_VCS=1` is required for the standalone VCS surface to be served.</p>
					</div>
				</div>
				<div className="panel">
					<div className="panel-copy">
						<h2>GitHub submit readiness</h2>
						<p>{data.publishing.available ? data.publishing.reason ?? "Publishing is available." : data.publishing.reason ?? "Publishing is unavailable."}</p>
					</div>
				</div>
				<div className="panel">
					<div className="panel-copy">
						<h2>Detected repository</h2>
						<p>{data.repository.root ? data.repository.root : "No repository root detected."}</p>
					</div>
				</div>
			</section>
			<section className="board">
				<section className="column" style={{ gridColumn: "span 2" }}>
					<h2>Current configuration</h2>
					<div className="stub">
						<span className="stub-label">Workspace cwd</span>
						<span className="stub-value">{data.cwd}</span>
					</div>
					<div className="stub">
						<span className="stub-label">JJ root</span>
						<span className="stub-value">{data.jj.repoRoot ?? "Unavailable"}</span>
					</div>
					<div className="stub">
						<span className="stub-label">Default base</span>
						<span className="stub-value">
							<code>{data.jj.defaultBase ?? data.git.defaultBranch ?? "unknown"}</code>
						</span>
					</div>
					<div className="stub">
						<span className="stub-label">Remote</span>
						<span className="stub-value">
							<code>{data.git.remoteName ?? "none"}</code>
							{data.git.remoteUrl ? ` · ${data.git.remoteUrl}` : ""}
						</span>
					</div>
				</section>
				<aside className="column side">
					<h2>Provider state</h2>
					<div className="stub">
						<span className="stub-label">Provider</span>
						<span className="stub-value">{data.git.provider}</span>
					</div>
					<div className="stub">
						<span className="stub-label">Authenticated</span>
						<span className="stub-value">{data.publishing.authenticated ? "yes" : "no"}</span>
					</div>
				</aside>
			</section>
			<section className="grid diagnostics-grid">
				<DiagnosticsPanel diagnostics={data.diagnostics} />
			</section>
		</main>
	);
}

function statusLabel(status: VcsJjStateResponse["unassignedChanges"][number]["status"]): string {
	switch (status) {
		case "modified":
			return "M";
		case "added":
			return "A";
		case "deleted":
			return "D";
		case "renamed":
			return "R";
		case "copied":
			return "C";
		default:
			return "?";
	}
}

function PreviewDialog({
	request,
	previewState,
	applyState,
	onApply,
	onClose,
}: {
	request: VcsOperationRequest | null;
	previewState: QueryState<VcsPreviewOperationResponse>;
	applyState: MutationState<VcsApplyOperationResponse>;
	onApply: () => void;
	onClose: () => void;
}) {
	if (!request) {
		return null;
	}
	return (
		<div className="dialog-backdrop" role="presentation" onClick={onClose}>
			<div className="dialog" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
				<div className="dialog-header">
					<div>
						<h2>Operation Preview</h2>
						<p className="muted">{summarizeOperationRequest(request)}</p>
					</div>
					<button className="button subtle" type="button" onClick={onClose}>
						Close
					</button>
				</div>
				{previewState.status === "loading" ? (
					<p className="muted">Loading preview.</p>
				) : previewState.status === "error" ? (
					<p className="muted">{previewState.message}</p>
				) : (
					<div className="dialog-body">
						<div className="stub">
							<span className="stub-label">Risk</span>
							<span className="stub-value">{previewState.data.risk}</span>
						</div>
						<div className="stub">
							<span className="stub-label">Summary</span>
							<span className="stub-value">{previewState.data.description}</span>
						</div>
						<div className="stub">
							<span className="stub-label">Command Preview</span>
							<pre className="pre">
								{previewState.data.commands.length > 0
									? previewState.data.commands.map((command) => [command.command, ...command.args].join(" ")).join("\n")
									: "No commands available."}
							</pre>
						</div>
						{previewState.data.affectedBookmarks.length > 0 ? (
							<div className="stub">
								<span className="stub-label">Affected Bookmarks</span>
								<span className="stub-value">{previewState.data.affectedBookmarks.join(", ")}</span>
							</div>
						) : null}
						{previewState.data.diagnostics.length > 0 ? (
							<div className="stub">
								<span className="stub-label">Warnings</span>
								{previewState.data.diagnostics.map((diagnostic) => (
									<p className="muted" key={`${diagnostic.code}-${diagnostic.message}`}>
										<strong>{diagnostic.level}</strong>: {diagnostic.message}
									</p>
								))}
							</div>
						) : null}
						<div className="dialog-header">
							{applyState.status === "error" ? <p className="muted">{applyState.message}</p> : null}
							{applyState.status === "ready" ? (
								<p className="muted">
									{applyState.data.ok ? "Applied." : "Apply failed."} {applyState.data.description}
								</p>
							) : null}
							<button
								className="button"
								type="button"
								disabled={!previewState.data.valid || previewState.data.commands.length === 0 || applyState.status === "loading"}
								onClick={onApply}
							>
								{applyState.status === "loading" ? "Applying..." : "Apply operation"}
							</button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

function SubmitStackDialog({
	preview,
	submitState,
	onSubmit,
	onClose,
}: {
	preview: VcsSubmitStackPreviewResponse | null;
	submitState: MutationState<VcsSubmitStackResponse>;
	onSubmit: () => void;
	onClose: () => void;
}) {
	if (!preview) {
		return null;
	}

	const submitMessage = getSubmitOutcomeMessage(submitState);
	const submitEnabled = canConfirmSubmit(preview, submitState);

	return (
		<div className="dialog-backdrop" role="presentation" onClick={onClose}>
			<div className="dialog" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
				<div className="dialog-header">
					<div>
						<h2>Submit Stacked PRs</h2>
						<p className="muted">
							{preview.repoOwner}/{preview.repoName}
							{preview.remoteName ? ` via ${preview.remoteName}` : ""}
						</p>
					</div>
					<button className="button subtle" type="button" onClick={onClose}>
						Close
					</button>
				</div>
				<div className="dialog-body">
					<div className="stub">
						<span className="stub-label">Target Bookmark</span>
						<span className="stub-value">{preview.targetBookmark ?? "Unknown"}</span>
					</div>
					<div className="stub">
						<span className="stub-label">Planned Actions</span>
						{preview.items.map((item) => (
							<p className="muted" key={`${item.bookmarkName}-${item.changeId}`}>
								<strong>{item.bookmarkName}</strong>: {item.action.replaceAll("_", " ")} on <code>{item.baseBranch}</code>
								{item.existingPr ? ` (PR #${item.existingPr.number})` : ""}
							</p>
						))}
					</div>
					<div className="stub">
						<span className="stub-label">Command Preview</span>
						<pre className="pre">
							{preview.commands.length > 0
								? preview.commands.map((command) => [command.command, ...command.args].join(" ")).join("\n")
								: "No JJ push commands required."}
						</pre>
					</div>
					{preview.diagnostics.length > 0 ? (
						<div className="stub">
							<span className="stub-label">Warnings</span>
							{preview.diagnostics.map((diagnostic) => (
								<p className="muted" key={`${diagnostic.code}-${diagnostic.message}`}>
									<strong>{diagnostic.level}</strong>: {diagnostic.message}
								</p>
							))}
						</div>
					) : null}
					{submitState.status === "ready" ? (
						<div className="stub">
							<span className="stub-label">Submit Result</span>
							{submitState.data.items.length > 0 ? (
								submitState.data.items.map((item) => (
									<p className="muted" key={`${item.bookmarkName}-${item.changeId}`}>
										<strong>{item.bookmarkName}</strong>: {item.completed ? "completed" : "not completed"}
										{item.resultPr ? ` (PR #${item.resultPr.number})` : ""}
									</p>
								))
							) : (
								<p className="muted">No stacked PR actions were completed.</p>
							)}
							{submitState.data.diagnostics.map((diagnostic) => (
								<p className="muted" key={`${diagnostic.code}-${diagnostic.message}`}>
									<strong>{diagnostic.level}</strong>: {diagnostic.message}
								</p>
							))}
						</div>
					) : null}
					<div className="dialog-header">
						{submitMessage ? <p className="muted">{submitMessage}</p> : null}
						<button className="button" type="button" disabled={!submitEnabled} onClick={onSubmit}>
							{submitState.status === "loading" ? "Submitting..." : "Confirm submit"}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

function JjView({
	state,
	refreshState,
	diffState,
	refreshDiff,
}: {
	state: QueryState<VcsJjStateResponse>;
	refreshState: () => void;
	diffState: QueryState<VcsJjDiffResponse>;
	refreshDiff: () => void;
}) {
	const [previewUiState, dispatchPreviewUi] = useReducer(previewUiReducer, initialPreviewUiState);
	const previewOperation = usePreviewOperation();
	const applyOperation = useApplyOperation();
	const submitStack = useSubmitStack();
	const [lastApplyResult, setLastApplyResult] = useState<VcsApplyOperationResponse | null>(null);
	const [bookmarkDraft, setBookmarkDraft] = useState<BookmarkDraftState | null>(null);
	const [messageDraft, setMessageDraft] = useState<MessageDraftState | null>(null);
	const [createChangeDraft, setCreateChangeDraft] = useState<CreateChangeDraftState | null>(null);
	const [moveBookmarkDraft, setMoveBookmarkDraft] = useState<MoveBookmarkDraftState | null>(null);
	const [squashDraft, setSquashDraft] = useState<SquashChangeDraftState | null>(null);
	const [absorbDraft, setAbsorbDraft] = useState<AbsorbFileDraftState | null>(null);
	const [submitTargetBookmark, setSubmitTargetBookmark] = useState<string>("");
	const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
	const readyData = state.status === "ready" ? state.data : null;
	const summary = useMemo(() => {
		if (state.status !== "ready") {
			return {
				repository: "Loading",
				base: "Loading",
				bookmarks: "Loading",
			};
		}
		return {
			repository: state.data.jj.currentBookmark ?? state.data.jj.currentChangeId ?? "JJ detected",
			base: state.data.jj.defaultBase ?? state.data.git.defaultBranch ?? "Unknown",
			bookmarks: `${state.data.bookmarks.length} local`,
		};
	}, [state]);

	const submitPreviewQuery = useTrpcInputQuery<VcsSubmitStackPreviewResponse>(
		"vcs.submitStackPreview",
		{ targetBookmark: submitTargetBookmark || undefined },
		"Failed to load stacked PR preview.",
		submitTargetBookmark.trim().length > 0,
	);

	useEffect(() => {
		if (!readyData) {
			return;
		}
		if (!submitTargetBookmark) {
			const defaultBookmark = readyData.jj.currentBookmark ?? readyData.bookmarks[0]?.name ?? "";
			if (defaultBookmark) {
				setSubmitTargetBookmark(defaultBookmark);
			}
		}
	}, [readyData, submitTargetBookmark]);

	if (state.status === "loading") {
		return (
			<main className="shell">
				<section className="hero compact">
					<div className="eyebrow">Changeyard / VCS / JJ</div>
					<h1>JJ stack board</h1>
					<p className="lede">Loading stack lanes and working-copy state.</p>
					<VcsNav currentPath={window.location.pathname} />
				</section>
			</main>
		);
	}

	if (state.status === "error") {
		return (
			<main className="shell">
				<section className="hero compact">
					<div className="eyebrow">Changeyard / VCS / JJ</div>
					<h1>JJ stack board</h1>
					<p className="lede">{state.message}</p>
					<VcsNav currentPath={window.location.pathname} />
				</section>
			</main>
		);
	}

	const { data } = state;
	const activeSourceId = previewUiState.dragSourceId ?? previewUiState.armedSourceId;

	function openPreview(sourceChangeId: string, targetChangeId: string, placement: PreviewPlacement): void {
		const validation = validateReorderPreviewRequest(data.changes, sourceChangeId, targetChangeId, placement);
		if (!validation.valid) {
			const request = createReorderPreviewRequest(sourceChangeId, targetChangeId, placement);
			dispatchPreviewUi({ type: "preview", request });
			previewOperation.showLocal({
				valid: false,
				operation: request,
				title: "Preview unavailable",
				description: validation.reason ?? "This reorder is not valid.",
				risk: "high",
				commands: [],
				affectedChangeIds: [sourceChangeId, targetChangeId],
				affectedBookmarks: [],
				diagnostics: [
					{
						level: "error",
						code: "preview_invalid",
						message: validation.reason ?? "This reorder is not valid.",
					},
				],
			});
			return;
		}
		const request = createReorderPreviewRequest(sourceChangeId, targetChangeId, placement);
		dispatchPreviewUi({ type: "preview", request });
		void previewOperation.preview(request);
	}

	async function handleSubmitStack(): Promise<void> {
		if (submitPreviewQuery.state.status !== "ready" || !submitPreviewQuery.state.data.available) {
			return;
		}
		const result = await submitStack.submit({ targetBookmark: submitTargetBookmark || undefined });
		if (result?.ok) {
			setSubmitDialogOpen(false);
			refreshState();
			refreshDiff();
			submitPreviewQuery.refresh();
		}
	}

	function openCreateBookmarkPreview(changeId: string, bookmarkName: string): void {
		const normalizedName = bookmarkName.trim();
		const request = createBookmarkPreviewRequest(changeId, normalizedName);
		if (!normalizedName) {
			dispatchPreviewUi({ type: "preview", request });
			previewOperation.showLocal({
				valid: false,
				operation: request,
				title: "Preview unavailable",
				description: "Enter a bookmark name before previewing.",
				risk: "high",
				commands: [],
				affectedChangeIds: [changeId],
				affectedBookmarks: [],
				diagnostics: [
					{
						level: "error",
						code: "bookmark_name_required",
						message: "Enter a bookmark name before previewing.",
					},
				],
			});
			return;
		}
		if (data.bookmarks.some((bookmark) => bookmark.name === normalizedName)) {
			dispatchPreviewUi({ type: "preview", request });
			previewOperation.showLocal({
				valid: false,
				operation: request,
				title: "Preview unavailable",
				description: `Bookmark ${normalizedName} already exists.`,
				risk: "high",
				commands: [],
				affectedChangeIds: [changeId],
				affectedBookmarks: [normalizedName],
				diagnostics: [
					{
						level: "error",
						code: "bookmark_exists",
						message: `Bookmark ${normalizedName} already exists.`,
					},
				],
			});
			return;
		}
		setBookmarkDraft((current) => (current ? { ...current, name: normalizedName } : current));
		dispatchPreviewUi({ type: "preview", request });
		void previewOperation.preview(request);
	}

	function openEditMessagePreview(changeId: string, message: string): void {
		const normalizedMessage = message.trim();
		const request = createEditMessagePreviewRequest(changeId, normalizedMessage);
		if (normalizedMessage.length === 0) {
			dispatchPreviewUi({ type: "preview", request });
			previewOperation.showLocal({
				valid: false,
				operation: request,
				title: "Preview unavailable",
				description: "Enter a non-empty change description before previewing.",
				risk: "high",
				commands: [],
				affectedChangeIds: [changeId],
				affectedBookmarks: [],
				diagnostics: [
					{
						level: "error",
						code: "message_required",
						message: "Enter a non-empty change description before previewing.",
					},
				],
			});
			return;
		}
		setMessageDraft((current) => (current ? { ...current, message: normalizedMessage } : current));
		dispatchPreviewUi({ type: "preview", request });
		void previewOperation.preview(request);
	}

	function openCreateChangePreview(anchorChangeId: string, placement: PreviewPlacement, message: string): void {
		const normalizedMessage = message.trim();
		const request = createChangePreviewRequest(anchorChangeId, placement, normalizedMessage);
		if (normalizedMessage.length === 0) {
			dispatchPreviewUi({ type: "preview", request });
			previewOperation.showLocal({
				valid: false,
				operation: request,
				title: "Preview unavailable",
				description: "Enter a non-empty change description before previewing.",
				risk: "high",
				commands: [],
				affectedChangeIds: [anchorChangeId],
				affectedBookmarks: [],
				diagnostics: [
					{
						level: "error",
						code: "message_required",
						message: "Enter a non-empty change description before previewing.",
					},
				],
			});
			return;
		}
		setCreateChangeDraft((current) => (current ? { ...current, message: normalizedMessage } : current));
		dispatchPreviewUi({ type: "preview", request });
		void previewOperation.preview(request);
	}

	function openMoveBookmarkPreview(bookmarkName: string, sourceChangeId: string, targetChangeId: string): void {
		const normalizedName = bookmarkName.trim();
		const request = createMoveBookmarkPreviewRequest(normalizedName, targetChangeId);
		if (!normalizedName) {
			dispatchPreviewUi({ type: "preview", request });
			previewOperation.showLocal({
				valid: false,
				operation: request,
				title: "Preview unavailable",
				description: "Choose a bookmark before previewing.",
				risk: "high",
				commands: [],
				affectedChangeIds: [sourceChangeId],
				affectedBookmarks: [],
				diagnostics: [
					{
						level: "error",
						code: "bookmark_name_required",
						message: "Choose a bookmark before previewing.",
					},
				],
			});
			return;
		}
		if (sourceChangeId === targetChangeId) {
			dispatchPreviewUi({ type: "preview", request });
			previewOperation.showLocal({
				valid: false,
				operation: request,
				title: "Preview unavailable",
				description: `Bookmark ${normalizedName} already points to ${targetChangeId}.`,
				risk: "high",
				commands: [],
				affectedChangeIds: [sourceChangeId],
				affectedBookmarks: [normalizedName],
				diagnostics: [
					{
						level: "error",
						code: "bookmark_already_targeted",
						message: `Bookmark ${normalizedName} already points to ${targetChangeId}.`,
					},
				],
			});
			return;
		}
		setMoveBookmarkDraft((current) => (current ? { ...current, bookmarkName: normalizedName, targetChangeId } : current));
		dispatchPreviewUi({ type: "preview", request });
		void previewOperation.preview(request);
	}

	function openAbandonChangePreview(changeId: string): void {
		const request = createAbandonChangePreviewRequest(changeId);
		dispatchPreviewUi({ type: "preview", request });
		void previewOperation.preview(request);
	}

	function openAbsorbFilePreview(targetChangeId: string, paths: string[]): void {
		const normalizedPaths = [...new Set(paths.map((path) => path.trim()).filter(Boolean))];
		const request = createAbsorbFilePreviewRequest(targetChangeId, normalizedPaths);
		if (normalizedPaths.length === 0) {
			dispatchPreviewUi({ type: "preview", request });
			previewOperation.showLocal({
				valid: false,
				operation: request,
				title: "Preview unavailable",
				description: "Choose at least one working-copy file before previewing.",
				risk: "high",
				commands: [],
				affectedChangeIds: [targetChangeId],
				affectedBookmarks: [],
				diagnostics: [
					{
						level: "error",
						code: "absorb_paths_required",
						message: "Choose at least one working-copy file before previewing.",
					},
				],
			});
			return;
		}
		dispatchPreviewUi({ type: "preview", request });
		void previewOperation.preview(request);
	}

	function openRestoreFilePreview(paths: string[]): void {
		const normalizedPaths = [...new Set(paths.map((path) => path.trim()).filter(Boolean))];
		const request = createRestoreFilePreviewRequest(normalizedPaths);
		if (normalizedPaths.length === 0) {
			dispatchPreviewUi({ type: "preview", request });
			previewOperation.showLocal({
				valid: false,
				operation: request,
				title: "Preview unavailable",
				description: "Choose at least one working-copy file before previewing.",
				risk: "high",
				commands: [],
				affectedChangeIds: data.jj.currentChangeId ? [data.jj.currentChangeId] : [],
				affectedBookmarks: [],
				diagnostics: [
					{
						level: "error",
						code: "restore_paths_required",
						message: "Choose at least one working-copy file before previewing.",
					},
				],
			});
			return;
		}
		dispatchPreviewUi({ type: "preview", request });
		void previewOperation.preview(request);
	}

	function openUndoLastPreview(): void {
		const request = createUndoLastPreviewRequest();
		dispatchPreviewUi({ type: "preview", request });
		void previewOperation.preview(request);
	}

	function openRedoLastPreview(): void {
		const request = createRedoLastPreviewRequest();
		dispatchPreviewUi({ type: "preview", request });
		void previewOperation.preview(request);
	}

	function openSquashChangePreview(sourceChangeId: string, targetChangeId: string): void {
		const request = createSquashChangePreviewRequest(sourceChangeId, targetChangeId);
		if (sourceChangeId === targetChangeId) {
			dispatchPreviewUi({ type: "preview", request });
			previewOperation.showLocal({
				valid: false,
				operation: request,
				title: "Preview unavailable",
				description: "Source and target changes must be different.",
				risk: "high",
				commands: [],
				affectedChangeIds: [sourceChangeId],
				affectedBookmarks: [],
				diagnostics: [
					{
						level: "error",
						code: "squash_same_target",
						message: "Source and target changes must be different.",
					},
				],
			});
			return;
		}
		dispatchPreviewUi({ type: "preview", request });
		void previewOperation.preview(request);
	}

	async function applyPreview(): Promise<void> {
		if (!previewUiState.pendingRequest) {
			return;
		}
		const result = await applyOperation.apply(previewUiState.pendingRequest);
		if (!result?.ok) {
			return;
		}
		setLastApplyResult(result);
		refreshState();
		refreshDiff();
		dispatchPreviewUi({ type: "close-preview" });
		dispatchPreviewUi({ type: "clear-arm" });
		setBookmarkDraft(null);
		setMessageDraft(null);
		setCreateChangeDraft(null);
		setMoveBookmarkDraft(null);
		setSquashDraft(null);
		setAbsorbDraft(null);
		previewOperation.clear();
		applyOperation.clear();
	}

	return (
		<main className="shell">
			<section className="hero compact">
				<div className="eyebrow">Changeyard / VCS / JJ</div>
				<h1>JJ stack board</h1>
				<p className="lede">Read-only stack lanes are live. Mutations, diff previews, and submit workflows remain gated.</p>
				<VcsNav currentPath={window.location.pathname} />
			</section>

			<section className="board">
				<aside className="column side">
					<h2>Repository</h2>
					{lastApplyResult ? (
						<div className="stub">
							<span className="stub-label">Last operation</span>
							<span className="stub-value">
								{lastApplyResult.ok ? "Applied" : "Failed"} {lastApplyResult.command ? `${lastApplyResult.command.command} ${lastApplyResult.command.args.join(" ")}` : ""}
							</span>
							<div className="drop-actions">
								{lastApplyResult.ok && lastApplyResult.operation.kind === "undo_last" ? (
									<button className="button subtle" type="button" onClick={openRedoLastPreview}>
										Redo
									</button>
								) : lastApplyResult.ok ? (
									<button className="button subtle" type="button" onClick={openUndoLastPreview}>
										Undo
									</button>
								) : null}
							</div>
						</div>
					) : null}
					<div className="stub">
						<span className="stub-label">Current</span>
						<span className="stub-value">{summary.repository}</span>
					</div>
					<div className="stub">
						<span className="stub-label">Base</span>
						<span className="stub-value">{summary.base}</span>
					</div>
					<div className="stub">
						<span className="stub-label">Bookmarks</span>
						<span className="stub-value">{summary.bookmarks}</span>
					</div>
					<div className="stub">
						<span className="stub-label">Publishing</span>
						<span className="stub-value">
							{data.publishing.authenticated ? "GitHub ready" : data.publishing.reason ?? "Unavailable"}
						</span>
					</div>
					<div className="stub">
						<span className="stub-label">Stack submit preview</span>
						<div className="bookmark-form">
							<select
								className="text-input select-input"
								value={submitTargetBookmark}
								onChange={(event) => setSubmitTargetBookmark(event.target.value)}
							>
								<option value="" disabled>
									Select a bookmark
								</option>
								{data.bookmarks.map((bookmark) => (
									<option key={bookmark.name} value={bookmark.name}>
										{bookmark.name}
									</option>
								))}
							</select>
							<div className="drop-actions">
								<button className="button subtle" type="button" onClick={() => submitPreviewQuery.refresh()}>
									Refresh preview
								</button>
								<button
									className="button"
									type="button"
									disabled={
										submitPreviewQuery.state.status !== "ready" ||
										!submitPreviewQuery.state.data.available ||
										submitStack.state.status === "loading"
									}
									onClick={() => {
										submitStack.clear();
										setSubmitDialogOpen(true);
									}}
								>
									Submit stack
								</button>
							</div>
							{submitStack.state.status === "error" ? <p className="muted">{submitStack.state.message}</p> : null}
							{submitStack.state.status === "ready" ? (
								<p className="muted">
									{submitStack.state.data.ok ? "Stack submit finished." : "Stack submit stopped."}
								</p>
							) : null}
							{submitPreviewQuery.state.status === "loading" ? (
								<p className="muted">Loading submit preview.</p>
							) : submitPreviewQuery.state.status === "error" ? (
								<p className="muted">{submitPreviewQuery.state.message}</p>
							) : submitPreviewQuery.state.data.available ? (
								<div className="submit-preview">
									<div className="card-subtle">
										{submitPreviewQuery.state.data.repoOwner}/{submitPreviewQuery.state.data.repoName}
										{submitPreviewQuery.state.data.remoteName
											? ` via ${submitPreviewQuery.state.data.remoteName}`
											: ""}
									</div>
									{submitPreviewQuery.state.data.items.map((item) => (
										<div className="stub" key={`${item.bookmarkName}-${item.changeId}`}>
											<span className="stub-label">{item.bookmarkName}</span>
											<span className="stub-value">{item.action.replaceAll("_", " ")}</span>
											<div className="card-subtle">
												Base <code>{item.baseBranch}</code>
												{item.existingPr ? (
													<>
														{" · "}PR #{item.existingPr.number}
													</>
												) : null}
											</div>
										</div>
									))}
									{submitPreviewQuery.state.data.commands.length > 0 ? (
										<pre className="pre">
											{submitPreviewQuery.state.data.commands
												.map((command) => [command.command, ...command.args].join(" "))
												.join("\n")}
										</pre>
									) : null}
									{submitStack.state.status === "ready" ? (
										<div className="card-subtle">
											{submitStack.state.data.items
												.map((item) =>
													`${item.bookmarkName}: ${item.completed ? "done" : "failed"}${
														item.resultPr ? ` (PR #${item.resultPr.number})` : ""
													}`,
												)
												.join(" | ")}
										</div>
									) : null}
								</div>
							) : (
								<div className="submit-preview">
									<p className="muted">
										{submitPreviewQuery.state.data.diagnostics[0]?.message ?? "Stack submit preview is unavailable."}
									</p>
								</div>
							)}
						</div>
					</div>
				</aside>

				<section className="lanes">
					{data.lanes.map((lane) => (
						<section className="column lane" key={lane.id}>
							<header className="lane-header">
								<span className="badge">{lane.headBookmark}</span>
								<span className="muted">{lane.segments.length} changes</span>
							</header>
							{lane.segments.map((segment) => (
								<article
									className={`card interactive${segment.isCurrent ? " current" : ""}${
										activeSourceId === segment.changeId ? " armed" : ""
									}`}
									key={`${lane.id}-${segment.id}`}
									draggable
									onDragStart={() => dispatchPreviewUi({ type: "start-drag", sourceChangeId: segment.changeId })}
									onDragEnd={() => dispatchPreviewUi({ type: "end-drag" })}
								>
									<div className="card-title-row">
										<div className="card-title">{segment.title}</div>
										<div className="card-actions">
											{segment.isHead ? <span className="chip">head</span> : null}
											<button
												className="button subtle"
												type="button"
												onClick={() =>
													setCreateChangeDraft((current) =>
														current?.anchorChangeId === segment.changeId
															? null
															: {
																	anchorChangeId: segment.changeId,
																	placement: "after",
																	message: "New change",
																},
													)
												}
											>
												{createChangeDraft?.anchorChangeId === segment.changeId ? "Cancel insert" : "Insert change"}
											</button>
											<button
												className="button subtle"
												type="button"
												onClick={() =>
													setMoveBookmarkDraft((current) =>
														current?.sourceChangeId === segment.changeId
															? null
															: {
																	sourceChangeId: segment.changeId,
																	bookmarkName: segment.bookmarks[0] ?? "",
																	targetChangeId: segment.changeId,
																},
													)
												}
												disabled={segment.bookmarks.length === 0}
											>
												{moveBookmarkDraft?.sourceChangeId === segment.changeId ? "Cancel move bookmark" : "Move bookmark"}
											</button>
											<button
												className="button subtle"
												type="button"
												onClick={() =>
													setSquashDraft((current) =>
														current?.sourceChangeId === segment.changeId
															? null
															: {
																	sourceChangeId: segment.changeId,
																},
													)
												}
											>
												{squashDraft?.sourceChangeId === segment.changeId ? "Cancel squash" : "Squash into..."}
											</button>
											<button
												className="button subtle"
												type="button"
												onClick={() =>
													setBookmarkDraft((current) =>
														current?.changeId === segment.changeId
															? null
															: {
																	changeId: segment.changeId,
																	name: "",
																},
													)
												}
											>
												{bookmarkDraft?.changeId === segment.changeId ? "Cancel bookmark" : "Bookmark"}
											</button>
											<button
												className="button subtle"
												type="button"
												onClick={() => openAbandonChangePreview(segment.changeId)}
											>
												Abandon
											</button>
											<button
												className="button subtle"
												type="button"
												onClick={() =>
													setMessageDraft((current) =>
														current?.changeId === segment.changeId
															? null
															: {
																	changeId: segment.changeId,
																	message: segment.title,
																},
													)
												}
											>
												{messageDraft?.changeId === segment.changeId ? "Cancel edit" : "Edit message"}
											</button>
											<button
												className="button subtle"
												type="button"
												onClick={() => dispatchPreviewUi({ type: "arm-source", sourceChangeId: segment.changeId })}
											>
												{previewUiState.armedSourceId === segment.changeId ? "Cancel" : "Move"}
											</button>
										</div>
									</div>
									<div className="card-meta">
										<code>{segment.changeId}</code>
										{" · "}
										<code>{segment.commitId}</code>
										{segment.bookmarks.length > 0 ? ` · ${segment.bookmarks.join(", ")}` : ""}
									</div>
									{segment.remoteBookmarks.length > 0 ? (
										<div className="card-subtle">Remote: {segment.remoteBookmarks.join(", ")}</div>
									) : null}
									{bookmarkDraft?.changeId === segment.changeId ? (
										<div className="bookmark-form">
											<input
												className="text-input"
												type="text"
												value={bookmarkDraft.name}
												placeholder="feature/new-bookmark"
												onChange={(event) =>
													setBookmarkDraft({
														changeId: segment.changeId,
														name: event.target.value,
													})
												}
											/>
											<div className="drop-actions">
												<button
													className="button"
													type="button"
													disabled={bookmarkDraft.name.trim().length === 0}
													onClick={() => openCreateBookmarkPreview(segment.changeId, bookmarkDraft.name)}
												>
													Preview bookmark
												</button>
												<button className="button subtle" type="button" onClick={() => setBookmarkDraft(null)}>
													Cancel
												</button>
											</div>
										</div>
									) : null}
									{moveBookmarkDraft?.sourceChangeId === segment.changeId ? (
										<div className="bookmark-form">
											<select
												className="text-input"
												value={moveBookmarkDraft.bookmarkName}
												onChange={(event) =>
													setMoveBookmarkDraft({
														...moveBookmarkDraft,
														bookmarkName: event.target.value,
													})
												}
											>
												{segment.bookmarks.map((bookmarkName) => (
													<option key={bookmarkName} value={bookmarkName}>
														{bookmarkName}
													</option>
												))}
											</select>
											<select
												className="text-input select-input"
												value={moveBookmarkDraft.targetChangeId}
												onChange={(event) =>
													setMoveBookmarkDraft({
														...moveBookmarkDraft,
														targetChangeId: event.target.value,
													})
												}
											>
												{data.changes.map((change) => (
													<option key={change.changeId} value={change.changeId}>
														{change.changeId} - {change.description}
													</option>
												))}
											</select>
											<div className="drop-actions">
												<button
													className="button"
													type="button"
													disabled={
														moveBookmarkDraft.bookmarkName.trim().length === 0 ||
														moveBookmarkDraft.targetChangeId === segment.changeId
													}
													onClick={() =>
														openMoveBookmarkPreview(
															moveBookmarkDraft.bookmarkName,
															segment.changeId,
															moveBookmarkDraft.targetChangeId,
														)
													}
												>
													Preview move bookmark
												</button>
												<button className="button subtle" type="button" onClick={() => setMoveBookmarkDraft(null)}>
													Cancel
												</button>
											</div>
										</div>
									) : null}
									{createChangeDraft?.anchorChangeId === segment.changeId ? (
										<div className="bookmark-form">
											<div className="drop-actions">
												<button
													className={`button subtle${createChangeDraft.placement === "before" ? " active" : ""}`}
													type="button"
													onClick={() =>
														setCreateChangeDraft({
															...createChangeDraft,
															placement: "before",
														})
													}
												>
													Before
												</button>
												<button
													className={`button subtle${createChangeDraft.placement === "after" ? " active" : ""}`}
													type="button"
													onClick={() =>
														setCreateChangeDraft({
															...createChangeDraft,
															placement: "after",
														})
													}
												>
													After
												</button>
											</div>
											<textarea
												className="text-input text-area"
												value={createChangeDraft.message}
												onChange={(event) =>
													setCreateChangeDraft({
														...createChangeDraft,
														message: event.target.value,
													})
												}
											/>
											<div className="drop-actions">
												<button
													className="button"
													type="button"
													disabled={createChangeDraft.message.trim().length === 0}
													onClick={() =>
														openCreateChangePreview(
															segment.changeId,
															createChangeDraft.placement,
															createChangeDraft.message,
														)
													}
												>
													Preview insert
												</button>
												<button className="button subtle" type="button" onClick={() => setCreateChangeDraft(null)}>
													Cancel
												</button>
											</div>
										</div>
									) : null}
									{messageDraft?.changeId === segment.changeId ? (
										<div className="bookmark-form">
											<textarea
												className="text-input text-area"
												value={messageDraft.message}
												onChange={(event) =>
													setMessageDraft({
														changeId: segment.changeId,
														message: event.target.value,
													})
												}
											/>
											<div className="drop-actions">
												<button
													className="button"
													type="button"
													disabled={messageDraft.message.trim().length === 0}
													onClick={() => openEditMessagePreview(segment.changeId, messageDraft.message)}
												>
													Preview message
												</button>
												<button className="button subtle" type="button" onClick={() => setMessageDraft(null)}>
													Cancel
												</button>
											</div>
										</div>
									) : null}
									{squashDraft?.sourceChangeId && squashDraft.sourceChangeId !== segment.changeId ? (
										<div className="drop-actions">
											<button
												className="button"
												type="button"
												onClick={() => openSquashChangePreview(squashDraft.sourceChangeId, segment.changeId)}
											>
												Preview squash here
											</button>
											<div className="card-subtle">
												Source: <code>{squashDraft.sourceChangeId}</code>
											</div>
										</div>
									) : null}
									{absorbDraft?.paths.length ? (
										<div className="drop-actions">
											<button
												className="button"
												type="button"
												disabled={data.jj.currentChangeId === segment.changeId}
												onClick={() => openAbsorbFilePreview(segment.changeId, absorbDraft.paths)}
											>
												Preview absorb here
											</button>
											<div className="card-subtle">
												Files: {absorbDraft.paths.join(", ")}
											</div>
										</div>
									) : null}
									{activeSourceId && activeSourceId !== segment.changeId ? (
										(() => {
											const beforeValidation = validateReorderPreviewRequest(
												data.changes,
												activeSourceId,
												segment.changeId,
												"before",
											);
											const afterValidation = validateReorderPreviewRequest(
												data.changes,
												activeSourceId,
												segment.changeId,
												"after",
											);
											const allowDrop = beforeValidation.valid || afterValidation.valid;
											return (
												<div
													className="drop-actions"
													onDragOver={(event) => {
														if (allowDrop) {
															event.preventDefault();
														}
													}}
												>
													<button
														className="button"
														type="button"
														disabled={!beforeValidation.valid}
														title={beforeValidation.reason ?? undefined}
														onClick={() => openPreview(activeSourceId, segment.changeId, "before")}
														onDrop={(event) => {
															if (!beforeValidation.valid) {
																return;
															}
															event.preventDefault();
															openPreview(activeSourceId, segment.changeId, "before");
														}}
													>
														Preview before
													</button>
													<button
														className="button"
														type="button"
														disabled={!afterValidation.valid}
														title={afterValidation.reason ?? undefined}
														onClick={() => openPreview(activeSourceId, segment.changeId, "after")}
														onDrop={(event) => {
															if (!afterValidation.valid) {
																return;
															}
															event.preventDefault();
															openPreview(activeSourceId, segment.changeId, "after");
														}}
													>
														Preview after
													</button>
													{!allowDrop ? (
														<div className="card-subtle">{beforeValidation.reason ?? afterValidation.reason}</div>
													) : null}
												</div>
											);
										})()
									) : null}
								</article>
							))}
						</section>
					))}
					{data.lanes.length === 0 ? (
						<section className="column lane">
							<header className="lane-header">
								<span className="badge">No stacks</span>
							</header>
							<article className="card ghost">
								<div className="card-title">No bookmark-backed stacks found</div>
								<div className="card-meta">Create or import local JJ bookmarks to populate stack lanes here.</div>
							</article>
						</section>
					) : null}
				</section>

				<section className="column lane">
					<header className="lane-header">
						<span className="badge">Details</span>
						<span className="muted">{diffState.status === "ready" ? diffState.data.changeId ?? "none" : "loading"}</span>
					</header>
					{diffState.status === "ready" ? (
						<article className="card">
							<div className="card-title">Current change diff</div>
							<div className="card-meta">
								{diffState.data.changeId ? <code>{diffState.data.changeId}</code> : "No current change selected."}
							</div>
							{diffState.data.summary ? <pre className="pre">{diffState.data.summary}</pre> : null}
						</article>
					) : diffState.status === "error" ? (
						<article className="card ghost">
							<div className="card-title">Diff unavailable</div>
							<div className="card-meta">{diffState.message}</div>
						</article>
					) : (
						<article className="card ghost">
							<div className="card-title">Loading diff</div>
						</article>
					)}
					<header className="lane-header lane-subheader">
						<span className="badge">Working Copy</span>
						<span className="muted">{data.unassignedChanges.length} files</span>
					</header>
					{data.unassignedChanges.length === 0 ? (
						<article className="card">
							<div className="card-title">Clean working copy</div>
							<div className="card-meta">No unassigned file changes are pending in the current JJ working copy.</div>
						</article>
					) : (
						data.unassignedChanges.map((change) => (
							<article className="card" key={`${change.status}-${change.path}`}>
								<div className="card-title-row">
									<div className="card-title">{change.path}</div>
									<div className="card-actions">
										<span className="chip">{statusLabel(change.status)}</span>
										<button
											className="button subtle"
											type="button"
											onClick={() =>
												setAbsorbDraft((current) =>
													current?.paths[0] === change.path
														? null
														: {
																paths: [change.path],
															},
												)
											}
										>
											{absorbDraft?.paths[0] === change.path ? "Cancel absorb" : "Absorb into..."}
										</button>
										<button className="button subtle" type="button" onClick={() => openRestoreFilePreview([change.path])}>
											Restore
										</button>
									</div>
								</div>
							</article>
						))
					)}
					<article className="card ghost">
						<div className="card-title">Preview interactions</div>
						<div className="card-meta">
							Drag a change onto another card, or use the move button to preview before/after reordering without mutating the repository.
						</div>
					</article>
				</section>
			</section>

			<section className="grid diagnostics-grid">
				<DiagnosticsPanel diagnostics={data.diagnostics} />
			</section>
			<PreviewDialog
				request={previewUiState.pendingRequest}
				previewState={previewOperation.state}
				applyState={applyOperation.state}
				onApply={() => {
					void applyPreview();
				}}
				onClose={() => {
					dispatchPreviewUi({ type: "close-preview" });
					dispatchPreviewUi({ type: "clear-arm" });
					setBookmarkDraft(null);
					setMessageDraft(null);
					setCreateChangeDraft(null);
					setMoveBookmarkDraft(null);
					setSquashDraft(null);
					setAbsorbDraft(null);
					previewOperation.clear();
					applyOperation.clear();
				}}
			/>
			{submitDialogOpen ? (
				<SubmitStackDialog
					preview={submitPreviewQuery.state.status === "ready" ? submitPreviewQuery.state.data : null}
					submitState={submitStack.state}
					onSubmit={() => {
						void handleSubmitStack();
					}}
					onClose={() => {
						if (submitStack.state.status !== "loading") {
							setSubmitDialogOpen(false);
						}
					}}
				/>
			) : null}
		</main>
	);
}

export default function App() {
	const detectQuery = useTrpcQuery<VcsDetectResponse>("vcs.detect", "Failed to load VCS detection.");
	const jjDiffQuery = useTrpcQuery<VcsJjDiffResponse>("vcs.jjDiff", "Failed to load JJ diff.");
	const jjStateQuery = useTrpcQuery<VcsJjStateResponse>("vcs.jjState", "Failed to load JJ state.");
	const route = resolveVcsRoute(window.location.pathname);
	switch (route.kind) {
		case "jj-board":
			return (
				<JjView
					state={jjStateQuery.state}
					refreshState={jjStateQuery.refresh}
					diffState={jjDiffQuery.state}
					refreshDiff={jjDiffQuery.refresh}
				/>
			);
		case "jj-branches":
			return <JjBranchesView state={jjStateQuery.state} />;
		case "jj-history":
			return <JjHistoryView state={jjStateQuery.state} />;
		case "settings":
			return <SettingsView state={detectQuery.state} />;
		default:
			return <LandingView state={detectQuery.state} />;
	}
}
