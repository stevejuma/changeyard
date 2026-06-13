import path from "node:path";
import chokidar, { type FSWatcher } from "chokidar";

export type VcsProjectEventKind = "worktree_changes" | "vcs/activity" | "vcs/head" | "vcs/fetch";

export interface VcsProjectEvent {
	projectId: string;
	topic: `project://${string}/${VcsProjectEventKind}`;
	kind: VcsProjectEventKind;
	root: string;
	paths: string[];
	changedAt: number;
	version: number;
}

export interface VcsProjectWatcher {
	start(projectId: string, root: string): Promise<void>;
	stop(projectId: string): Promise<void>;
	onEvent(listener: (event: VcsProjectEvent) => void): () => void;
	close(): Promise<void>;
}

interface WatchedProject {
	projectId: string;
	root: string;
	watcher: FSWatcher;
	usesPolling: boolean;
	isStarting: boolean;
	isRestarting: boolean;
	pending: Map<VcsProjectEventKind, Set<string>>;
	timers: Map<VcsProjectEventKind, NodeJS.Timeout>;
	version: number;
}

const WATCH_DEBOUNCE_MS = 150;
const WATCH_READY_TIMEOUT_MS = 5_000;
const WATCH_POLL_INTERVAL_MS = 700;
const WATCH_BINARY_POLL_INTERVAL_MS = 1_500;
const IGNORED_DIRECTORY_NAMES = new Set([
	"node_modules",
	".cache",
	".next",
	".turbo",
	"dist",
	"build",
	"coverage",
	"target",
	".svelte-kit",
	".vite",
]);

function toRelativePath(root: string, candidatePath: string): string {
	const relative = path.relative(root, candidatePath);
	if (!relative || relative === ".") {
		return "";
	}
	return relative.split(path.sep).join("/");
}

function isPathInside(child: string, parent: string): boolean {
	return child === parent || child.startsWith(`${parent}/`);
}

export function shouldIgnoreVcsWatchPath(root: string, candidatePath: string): boolean {
	const relativePath = toRelativePath(root, candidatePath);
	if (!relativePath) {
		return false;
	}
	const parts = relativePath.split("/");
	if (parts.some((part) => IGNORED_DIRECTORY_NAMES.has(part))) {
		return true;
	}
	if (
		relativePath === ".jj" ||
		relativePath === ".jj/repo" ||
		relativePath === ".jj/repo/op_heads" ||
		isPathInside(relativePath, ".jj/repo/op_heads") ||
		relativePath === ".jj/working_copy" ||
		isPathInside(relativePath, ".jj/working_copy")
	) {
		return false;
	}
	if (
		relativePath === ".git" ||
		relativePath === ".git/refs" ||
		relativePath === ".git/refs/remotes" ||
		relativePath === ".git/FETCH_HEAD" ||
		isPathInside(relativePath, ".git/refs/remotes")
	) {
		return false;
	}
	if (parts[0] === ".jj" || parts[0] === ".git") {
		return true;
	}
	return false;
}

export function classifyVcsWatchPath(relativePath: string): VcsProjectEventKind {
	if (relativePath === ".jj/repo/op_heads" || isPathInside(relativePath, ".jj/repo/op_heads")) {
		return "vcs/activity";
	}
	if (relativePath === ".jj/working_copy" || isPathInside(relativePath, ".jj/working_copy")) {
		return "vcs/head";
	}
	if (relativePath === ".git/FETCH_HEAD" || isPathInside(relativePath, ".git/refs/remotes")) {
		return "vcs/fetch";
	}
	return "worktree_changes";
}

function isWatcherLimitError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return message.includes("EMFILE") || message.includes("ENOSPC");
}

export function createChokidarVcsProjectWatcher(): VcsProjectWatcher {
	const projects = new Map<string, WatchedProject>();
	const listeners = new Set<(event: VcsProjectEvent) => void>();

	function emit(event: VcsProjectEvent): void {
		for (const listener of listeners) {
			try {
				listener(event);
			} catch {
				// Listener failures should not tear down the shared watcher.
			}
		}
	}

	function flush(project: WatchedProject, kind: VcsProjectEventKind): void {
		const paths = Array.from(project.pending.get(kind) ?? []).sort();
		project.pending.delete(kind);
		const timer = project.timers.get(kind);
		if (timer) {
			clearTimeout(timer);
			project.timers.delete(kind);
		}
		if (paths.length === 0) {
			return;
		}
		project.version += 1;
		emit({
			projectId: project.projectId,
			topic: `project://${project.projectId}/${kind}`,
			kind,
			root: project.root,
			paths,
			changedAt: Date.now(),
			version: project.version,
		});
	}

	function queue(project: WatchedProject, absolutePath: string): void {
		const relativePath = toRelativePath(project.root, absolutePath);
		if (!relativePath || shouldIgnoreVcsWatchPath(project.root, absolutePath)) {
			return;
		}
		const kind = classifyVcsWatchPath(relativePath);
		const pendingPaths = project.pending.get(kind) ?? new Set<string>();
		pendingPaths.add(relativePath);
		project.pending.set(kind, pendingPaths);
		if (project.timers.has(kind)) {
			return;
		}
		const timer = setTimeout(() => flush(project, kind), WATCH_DEBOUNCE_MS);
		timer.unref();
		project.timers.set(kind, timer);
	}

	function createWatcher(root: string, usePolling: boolean): FSWatcher {
		return chokidar.watch(root, {
			ignoreInitial: true,
			persistent: true,
			ignored: (candidatePath) => shouldIgnoreVcsWatchPath(root, candidatePath),
			usePolling,
			interval: WATCH_POLL_INTERVAL_MS,
			binaryInterval: WATCH_BINARY_POLL_INTERVAL_MS,
			awaitWriteFinish: {
				stabilityThreshold: 80,
				pollInterval: 20,
			},
		});
	}

	function attachWatcher(project: WatchedProject): void {
		const { watcher } = project;
		watcher.on("add", (filePath) => queue(project, filePath));
		watcher.on("change", (filePath) => queue(project, filePath));
		watcher.on("unlink", (filePath) => queue(project, filePath));
		watcher.on("addDir", (filePath) => queue(project, filePath));
		watcher.on("unlinkDir", (filePath) => queue(project, filePath));
		watcher.on("error", (error) => {
			if (project.isStarting) {
				return;
			}
			if (isWatcherLimitError(error) && !project.usesPolling && !project.isRestarting) {
				project.isRestarting = true;
				void restartWithPolling(project).catch((restartError) => {
					project.isRestarting = false;
					project.version += 1;
					emit({
						projectId: project.projectId,
						topic: `project://${project.projectId}/vcs/activity`,
						kind: "vcs/activity",
						root: project.root,
						paths: [`watcher-error:${restartError instanceof Error ? restartError.message : String(restartError)}`],
						changedAt: Date.now(),
						version: project.version,
					});
				});
				return;
			}
			project.version += 1;
			emit({
				projectId: project.projectId,
				topic: `project://${project.projectId}/vcs/activity`,
				kind: "vcs/activity",
				root: project.root,
				paths: [`watcher-error:${error instanceof Error ? error.message : String(error)}`],
				changedAt: Date.now(),
				version: project.version,
			});
		});
	}

	function waitUntilReady(watcher: FSWatcher): Promise<void> {
		return new Promise((resolve, reject) => {
			let settled = false;
			const cleanup = () => {
				watcher.off("ready", onReady);
				watcher.off("error", onError);
				clearTimeout(timeout);
			};
			const settle = (callback: () => void) => {
				if (settled) {
					return;
				}
				settled = true;
				cleanup();
				callback();
			};
			const onReady = () => settle(resolve);
			const onError = (error: unknown) => {
				settle(() => reject(error instanceof Error ? error : new Error(String(error))));
			};
			const timeout = setTimeout(() => {
				settle(() => reject(new Error("Timed out while starting VCS project watcher.")));
			}, WATCH_READY_TIMEOUT_MS);
			timeout.unref();
			watcher.once("ready", onReady);
			watcher.once("error", onError);
		});
	}

	async function restartWithPolling(project: WatchedProject): Promise<void> {
		const previousWatcher = project.watcher;
		const nextWatcher = createWatcher(project.root, true);
		project.watcher = nextWatcher;
		project.usesPolling = true;
		attachWatcher(project);
		await previousWatcher.close();
		await waitUntilReady(nextWatcher);
		project.isStarting = false;
		project.isRestarting = false;
		project.version += 1;
		emit({
			projectId: project.projectId,
			topic: `project://${project.projectId}/vcs/activity`,
			kind: "vcs/activity",
			root: project.root,
			paths: ["watcher-fallback:polling"],
			changedAt: Date.now(),
			version: project.version,
		});
	}

	async function stop(projectId: string): Promise<void> {
		const project = projects.get(projectId);
		if (!project) {
			return;
		}
		projects.delete(projectId);
		for (const timer of project.timers.values()) {
			clearTimeout(timer);
		}
		project.timers.clear();
		project.pending.clear();
		await project.watcher.close();
	}

	return {
		start: async (projectId: string, root: string) => {
			const existing = projects.get(projectId);
			if (existing?.root === root) {
				return;
			}
			if (existing) {
				await stop(projectId);
			}
			const watcher = createWatcher(root, false);
			const project: WatchedProject = {
				projectId,
				root,
				watcher,
				usesPolling: false,
				isStarting: true,
				isRestarting: false,
				pending: new Map(),
				timers: new Map(),
				version: 0,
			};
			attachWatcher(project);
			projects.set(projectId, project);
			try {
				await waitUntilReady(watcher);
				project.isStarting = false;
			} catch (error) {
				await watcher.close();
				if (!isWatcherLimitError(error)) {
					projects.delete(projectId);
					throw error;
				}
				const fallbackWatcher = createWatcher(root, true);
				project.watcher = fallbackWatcher;
				project.usesPolling = true;
				project.isStarting = true;
				attachWatcher(project);
				try {
					await waitUntilReady(fallbackWatcher);
					project.isStarting = false;
					project.version += 1;
					emit({
						projectId: project.projectId,
						topic: `project://${project.projectId}/vcs/activity`,
						kind: "vcs/activity",
						root: project.root,
						paths: ["watcher-fallback:polling"],
						changedAt: Date.now(),
						version: project.version,
					});
				} catch (fallbackError) {
					projects.delete(projectId);
					await fallbackWatcher.close();
					throw fallbackError;
				}
			}
		},
		stop,
		onEvent: (listener) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		close: async () => {
			await Promise.all(Array.from(projects.keys()).map((projectId) => stop(projectId)));
			listeners.clear();
		},
	};
}
