import { execFile as execFileCallback } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { promisify } from "node:util";
import type {
	RuntimeBoardData,
	RuntimeDirectoryListResponse,
	RuntimeProjectAddResponse,
	RuntimeProjectSummary,
	RuntimeProjectTaskCounts,
	RuntimeProjectWorkspaceSummary,
} from "../core/api-contract.js";
import { parseDirectoryListRequest, parseProjectAddRequest, parseProjectRemoveRequest } from "../core/api-validation.js";
import {
	listWorkspaceIndexEntries,
	loadWorkspaceContext,
	loadWorkspaceContextById,
	loadWorkspaceState,
	removeWorkspaceIndexEntry,
	removeWorkspaceStateFiles,
} from "../state/workspace-state.js";
import type { TerminalSessionManager } from "../terminal/session-manager.js";
import { cloneGitRepository } from "../workspace/git-clone.js";
import { ensureInitialCommit, initializeGitRepository } from "../workspace/initialize-repo.js";
import { isPathWithinRoot } from "../workspace/path-sandbox.js";
import { deleteTaskWorktree } from "../workspace/task-worktree.js";
import type { RuntimeTrpcContext } from "./app-router.js";
import type { RuntimeChangeyardApiAdapter } from "./changes-api.js";

const execFile = promisify(execFileCallback);

interface DisposeWorkspaceOptions {
	stopTerminalSessions?: boolean;
}

export interface CreateProjectsApiDependencies {
	getActiveWorkspacePath: () => string | null;
	getActiveWorkspaceId: () => string | null;
	rememberWorkspace: (workspaceId: string, repoPath: string) => void;
	setActiveWorkspace: (workspaceId: string, repoPath: string) => Promise<void>;
	clearActiveWorkspace: () => void;
	resolveProjectInputPath: (inputPath: string, cwd: string) => string;
	assertPathIsDirectory: (path: string) => Promise<void>;
	detectWorkspaceRepositoryKind: (path: string) => "git" | "jj" | null;
	summarizeProjectTaskCounts: (workspaceId: string, repoPath: string) => Promise<RuntimeProjectTaskCounts>;
	createProjectSummary: (project: {
		workspaceId: string;
		repoPath: string;
		taskCounts: RuntimeProjectTaskCounts;
	}) => RuntimeProjectSummary;
	broadcastRuntimeProjectsUpdated: (preferredCurrentProjectId: string | null) => Promise<void> | void;
	getTerminalManagerForWorkspace: (workspaceId: string) => TerminalSessionManager | null;
	disposeWorkspace: (
		workspaceId: string,
		options?: DisposeWorkspaceOptions,
	) => { terminalManager: TerminalSessionManager | null; workspacePath: string | null };
	collectProjectWorktreeTaskIdsForRemoval: (board: RuntimeBoardData) => Set<string>;
	warn: (message: string) => void;
	buildProjectsPayload: (preferredCurrentProjectId: string | null) => Promise<{
		currentProjectId: string | null;
		projects: RuntimeProjectSummary[];
	}>;
	pickDirectoryPathFromSystemDialog: () => string | null;
	changeyardApi?: RuntimeChangeyardApiAdapter | null;
	serverCwd: string;
}

export function createProjectsApi(deps: CreateProjectsApiDependencies): RuntimeTrpcContext["projectsApi"] {
	const filesystemRoot = resolve(deps.serverCwd, "/");

	async function summarizeJjWorkspaces(repoPath: string): Promise<RuntimeProjectWorkspaceSummary[]> {
		if (deps.detectWorkspaceRepositoryKind(repoPath) !== "jj") {
			return [];
		}
		if (!(await pathExists(resolve(repoPath, ".jj/repo/store/type")))) {
			return [];
		}
		try {
			const result = await execFile(
				"jj",
				[
					"--no-pager",
					"workspace",
					"list",
					"--color=never",
					"--template",
					'name ++ "\\t" ++ root ++ "\\n"',
				],
				{ cwd: repoPath, encoding: "utf8", maxBuffer: 10 * 1024 * 1024, timeout: 2_000 },
			);
			const rootPath = resolve(repoPath);
			return result.stdout
				.split("\n")
				.map((line) => line.trim())
				.filter(Boolean)
				.map((line) => {
					const [name, workspaceRoot] = line.split("\t");
					return name && workspaceRoot ? { name, path: resolve(workspaceRoot) } : null;
				})
				.filter((entry): entry is { name: string; path: string } => Boolean(entry))
				.filter((entry) => entry.name !== "default" && entry.path !== rootPath)
				.map((entry) => ({
					id: `jj-workspace:${entry.name}`,
					title: entry.name,
					engine: "jj",
					name: entry.name,
					path: entry.path,
				}))
				.sort((a, b) => (a.name ?? a.title).localeCompare(b.name ?? b.title));
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			deps.warn(`Failed to summarize JJ workspaces for ${repoPath}: ${message}`);
			return [];
		}
	}

	async function summarizeProjectWorkspaces(repoPath: string): Promise<RuntimeProjectWorkspaceSummary[]> {
		const seenIds = new Set<string>();
		const seenPaths = new Set<string>();
		const workspaces: RuntimeProjectWorkspaceSummary[] = [];
		try {
			if (deps.changeyardApi) {
				const changes = await deps.changeyardApi.listChanges(repoPath);
				for (const change of changes) {
					const workspace = change.workspace;
					if (!workspace?.path && !workspace?.branch && !workspace?.name) {
						continue;
					}
					if (workspace.path && !(await workspaceDirectoryExists(repoPath, workspace.path))) {
						continue;
					}
					const id = change.id;
					const absoluteWorkspacePath = workspace.path ? resolveWorkspacePath(repoPath, workspace.path) : null;
					if (seenIds.has(id) || (absoluteWorkspacePath && seenPaths.has(absoluteWorkspacePath))) {
						continue;
					}
					seenIds.add(id);
					if (absoluteWorkspacePath) {
						seenPaths.add(absoluteWorkspacePath);
					}
					workspaces.push({
						id,
						title: change.title,
						status: change.status,
						engine: workspace.engine,
						name: workspace.name,
						path: workspace.path,
						branch: workspace.branch,
					});
				}
			}

			for (const workspace of await summarizeJjWorkspaces(repoPath)) {
				const absoluteWorkspacePath = workspace.path ? resolveWorkspacePath(repoPath, workspace.path) : null;
				if (seenIds.has(workspace.id) || (absoluteWorkspacePath && seenPaths.has(absoluteWorkspacePath))) {
					continue;
				}
				if (workspace.path && !(await workspaceDirectoryExists(repoPath, workspace.path))) {
					continue;
				}
				seenIds.add(workspace.id);
				if (absoluteWorkspacePath) {
					seenPaths.add(absoluteWorkspacePath);
				}
				workspaces.push(workspace);
			}

			return workspaces.sort((a, b) => a.title.localeCompare(b.title));
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			deps.warn(`Failed to summarize project workspaces for ${repoPath}: ${message}`);
			return [];
		}
	}

	async function workspaceDirectoryExists(repoPath: string, workspacePath: string): Promise<boolean> {
		const absolutePath = resolveWorkspacePath(repoPath, workspacePath);
		return pathIsDirectory(absolutePath);
	}

	async function pathExists(path: string): Promise<boolean> {
		try {
			await stat(path);
			return true;
		} catch {
			return false;
		}
	}

	async function pathIsDirectory(path: string): Promise<boolean> {
		try {
			return (await stat(path)).isDirectory();
		} catch {
			return false;
		}
	}

	function resolveWorkspacePath(repoPath: string, workspacePath: string): string {
		return isAbsolute(workspacePath) ? resolve(workspacePath) : resolve(repoPath, workspacePath);
	}

	async function enrichProjectSummary(project: RuntimeProjectSummary): Promise<RuntimeProjectSummary> {
		const workspaces = await summarizeProjectWorkspaces(project.path);
		return workspaces.length > 0 ? { ...project, workspaces } : project;
	}

	async function enrichProjectsPayload(payload: {
		currentProjectId: string | null;
		projects: RuntimeProjectSummary[];
	}): Promise<{
		currentProjectId: string | null;
		projects: RuntimeProjectSummary[];
	}> {
		return {
			currentProjectId: payload.currentProjectId,
			projects: await Promise.all(payload.projects.map((project) => enrichProjectSummary(project))),
		};
	}

	return {
		listProjects: async (preferredWorkspaceId) => {
			const payload = await enrichProjectsPayload(await deps.buildProjectsPayload(preferredWorkspaceId));
			return {
				currentProjectId: payload.currentProjectId,
				projects: payload.projects,
			};
		},
		addProject: async (preferredWorkspaceId, input) => {
			const body = parseProjectAddRequest(input);
			const preferredWorkspaceContext = preferredWorkspaceId
				? await loadWorkspaceContextById(preferredWorkspaceId)
				: null;
			const resolveBasePath = preferredWorkspaceContext?.repoPath ?? deps.getActiveWorkspacePath() ?? process.cwd();
			try {
				let projectPath: string;
				if (body.gitUrl) {
					// Clone from Git URL. If a custom path is provided alongside
					// gitUrl, use it as the clone destination. Otherwise derive
					// a destination from the URL.
					// Resolve relative to serverCwd (the default clone base), not the
					// active project — the clone target belongs under the kanban
					// working directory, not inside another project.
					const customDest = body.path ? deps.resolveProjectInputPath(body.path, deps.serverCwd) : undefined;
					const cloneResult = await cloneGitRepository(body.gitUrl, deps.serverCwd, customDest, filesystemRoot);
					if (!cloneResult.ok) {
						return {
							ok: false,
							project: null,
							error: cloneResult.error ?? "Git clone failed.",
						} satisfies RuntimeProjectAddResponse;
					}
					projectPath = cloneResult.clonedPath;
				} else {
					// path is guaranteed to exist here by the schema refine and the gitUrl branch above.
					projectPath = deps.resolveProjectInputPath(body.path as string, resolveBasePath);
				}
				await deps.assertPathIsDirectory(projectPath);
				const repositoryKind = deps.detectWorkspaceRepositoryKind(projectPath);
				if (!repositoryKind) {
					if (!body.initializeGit) {
						return {
							ok: false,
							project: null,
							requiresGitInitialization: true,
							error: "This folder is not a Git or JJ repository. ChangeYard can initialize Git to continue.",
						} satisfies RuntimeProjectAddResponse;
					}
					const initResult = await initializeGitRepository(projectPath);
					if (!initResult.ok) {
						return {
							ok: false,
							project: null,
							error: initResult.error ?? "Failed to initialize git repository.",
						} satisfies RuntimeProjectAddResponse;
					}
				} else if (repositoryKind === "git") {
					const commitResult = await ensureInitialCommit(projectPath);
					if (!commitResult.ok) {
						return {
							ok: false,
							project: null,
							error: commitResult.error ?? "Failed to ensure initial commit.",
						} satisfies RuntimeProjectAddResponse;
					}
				}
				const context = await loadWorkspaceContext(projectPath);
				deps.rememberWorkspace(context.workspaceId, context.repoPath);
				const projectsAfterAdd = await listWorkspaceIndexEntries();
				const activeWorkspaceId = deps.getActiveWorkspaceId();
				const hasActiveWorkspace = activeWorkspaceId
					? projectsAfterAdd.some((project) => project.workspaceId === activeWorkspaceId)
					: false;
				if (!hasActiveWorkspace) {
					await deps.setActiveWorkspace(context.workspaceId, context.repoPath);
				}
				const taskCounts = await deps.summarizeProjectTaskCounts(context.workspaceId, context.repoPath);
				void deps.broadcastRuntimeProjectsUpdated(context.workspaceId);
				const project = await enrichProjectSummary(
					deps.createProjectSummary({
						workspaceId: context.workspaceId,
						repoPath: context.repoPath,
						taskCounts,
					}),
				);
				return {
					ok: true,
					project,
				} satisfies RuntimeProjectAddResponse;
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return {
					ok: false,
					project: null,
					error: message,
				} satisfies RuntimeProjectAddResponse;
			}
		},
		removeProject: async (_preferredWorkspaceId, input) => {
			try {
				const body = parseProjectRemoveRequest(input);
				const projectsBeforeRemoval = await listWorkspaceIndexEntries();
				const projectToRemove = projectsBeforeRemoval.find((project) => project.workspaceId === body.projectId);
				if (!projectToRemove) {
					return {
						ok: false,
						error: `Unknown project ID: ${body.projectId}`,
					};
				}

				const taskIdsToCleanup = new Set<string>();
				try {
					const workspaceState = await loadWorkspaceState(projectToRemove.repoPath);
					for (const taskId of deps.collectProjectWorktreeTaskIdsForRemoval(workspaceState.board)) {
						taskIdsToCleanup.add(taskId);
					}
				} catch {
					// Best effort: if board state cannot be read, skip worktree cleanup IDs.
				}

				const removedTerminalManager = deps.getTerminalManagerForWorkspace(body.projectId);
				if (removedTerminalManager) {
					removedTerminalManager.markInterruptedAndStopAll();
				}

				const removed = await removeWorkspaceIndexEntry(body.projectId);
				if (!removed) {
					throw new Error(`Could not remove project index entry for "${body.projectId}".`);
				}
				await removeWorkspaceStateFiles(body.projectId);
				deps.disposeWorkspace(body.projectId, {
					stopTerminalSessions: false,
				});

				if (deps.getActiveWorkspaceId() === body.projectId) {
					const remaining = await listWorkspaceIndexEntries();
					const fallbackWorkspace = remaining[0];
					if (fallbackWorkspace) {
						await deps.setActiveWorkspace(fallbackWorkspace.workspaceId, fallbackWorkspace.repoPath);
					} else {
						deps.clearActiveWorkspace();
					}
				}
				void deps.broadcastRuntimeProjectsUpdated(deps.getActiveWorkspaceId());
				if (taskIdsToCleanup.size > 0) {
					const cleanupTaskIds = Array.from(taskIdsToCleanup);
					void (async () => {
						const deletions = await Promise.all(
							cleanupTaskIds.map(async (taskId) => ({
								taskId,
								deleted: await deleteTaskWorktree({
									repoPath: projectToRemove.repoPath,
									taskId,
								}),
							})),
						);
						for (const { taskId, deleted } of deletions) {
							if (deleted.ok) {
								continue;
							}
							const message = deleted.error ?? `Could not delete task workspace for task "${taskId}".`;
							deps.warn(message);
						}
					})();
				}
				return {
					ok: true,
				};
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return {
					ok: false,
					error: message,
				};
			}
		},
		pickProjectDirectory: async () => {
			try {
				const selectedPath = deps.pickDirectoryPathFromSystemDialog();
				if (!selectedPath) {
					return {
						ok: false,
						path: null,
						error: "No directory was selected.",
					};
				}
				return {
					ok: true,
					path: selectedPath,
				};
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return {
					ok: false,
					path: null,
					error: message,
				};
			}
		},
		listDirectoryContents: async (_preferredWorkspaceId, input) => {
			const body = parseDirectoryListRequest(input);
			const rootPath = filesystemRoot;
			const requestedPath = body.path?.trim() || "";
			// Reject absolute paths that fall outside the sandbox
			if (requestedPath && isAbsolute(requestedPath)) {
				if (!isPathWithinRoot(rootPath, requestedPath)) {
					return {
						ok: false,
						currentPath: rootPath,
						parentPath: null,
						rootPath,
						entries: [],
						error: "Access denied: absolute path is outside the server root directory.",
					} satisfies RuntimeDirectoryListResponse;
				}
				// Absolute path is within sandbox — fall through to existing stat/readdir logic
			}
			const resolvedPath = resolve(rootPath, requestedPath) || rootPath;

			if (!isPathWithinRoot(rootPath, resolvedPath)) {
				return {
					ok: false,
					currentPath: rootPath,
					parentPath: null,
					rootPath,
					entries: [],
					error: "Access denied: path is outside the server root directory.",
				} satisfies RuntimeDirectoryListResponse;
			}

			try {
				const dirStat = await stat(resolvedPath);
				if (!dirStat.isDirectory()) {
					return {
						ok: false,
						currentPath: resolvedPath,
						parentPath: null,
						rootPath,
						entries: [],
						error: "The specified path is not a directory.",
					} satisfies RuntimeDirectoryListResponse;
				}

				const dirEntries = await readdir(resolvedPath, { withFileTypes: true });
				const directoryEntries = dirEntries.filter((entry) => {
					if (!entry.isDirectory()) {
						return false;
					}
					if (entry.name.startsWith(".")) {
						return false;
					}
					return true;
				});

				directoryEntries.sort((a, b) => a.name.localeCompare(b.name));

				const entries = await Promise.all(
					directoryEntries.map(async (entry) => {
						const entryPath = resolve(resolvedPath, entry.name);
						let isGitRepository = false;
						try {
							const gitDirStat = await stat(resolve(entryPath, ".git"));
							isGitRepository = gitDirStat.isDirectory() || gitDirStat.isFile();
						} catch {
							// .git does not exist or is not accessible
						}
						return {
							name: entry.name,
							path: entryPath,
							isGitRepository,
						};
					}),
				);

				const isAtRoot = resolvedPath === rootPath;
				const rawParent = dirname(resolvedPath);
				const parentIsWithinRoot = isPathWithinRoot(rootPath, rawParent);
				const parentPath = isAtRoot ? null : parentIsWithinRoot ? rawParent : null;

				return {
					ok: true,
					currentPath: resolvedPath,
					parentPath,
					rootPath,
					entries,
				} satisfies RuntimeDirectoryListResponse;
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				const isPermissionError =
					error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "EACCES";
				const isNotFoundError =
					error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
				return {
					ok: false,
					currentPath: resolvedPath,
					parentPath: null,
					rootPath,
					entries: [],
					error: isPermissionError
						? "Permission denied: cannot read this directory."
						: isNotFoundError
							? "Directory not found."
							: message,
				} satisfies RuntimeDirectoryListResponse;
			}
		},
	};
}
