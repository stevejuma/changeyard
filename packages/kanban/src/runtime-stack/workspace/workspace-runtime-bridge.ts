import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { runGit } from "./git-utils.js";
import { getJjCurrentBookmark, getJjStdout, runJj } from "./jj-utils.js";

const ROOT_WORKSPACE_RUNTIME_BRIDGE_MODULE_URL = new URL(
	"../../../../../dist/src/workspace/runtimeBridge.js",
	import.meta.url,
);

export type WorkspaceRepositoryKind = "git" | "jj";

export interface TaskWorkspaceCreateResult {
	ok: boolean;
	headCommit: string | null;
	error?: string;
}

export interface TaskWorkspaceDeleteResult {
	ok: boolean;
	error?: string;
}

export interface TaskWorkspaceHeadInfo {
	branch: string | null;
	headCommit: string | null;
	isDetached: boolean;
}

export interface TaskWorkspaceVerifyResult {
	ok: boolean;
	errors: string[];
}

export interface TaskWorkspacePublishResult {
	ok: boolean;
	branch: string;
	remote: string | null;
	error?: string;
}

interface RootWorkspaceRuntimeBridgeModule {
	createTaskWorkspace: (options: {
		repositoryKind: WorkspaceRepositoryKind;
		repoRoot: string;
		workspacePath: string;
		revision: string;
		workspaceName?: string;
	}) => TaskWorkspaceCreateResult;
	deleteTaskWorkspace: (options: {
		repositoryKind: WorkspaceRepositoryKind;
		repoRoot: string;
		workspacePath: string;
		workspaceName?: string;
	}) => TaskWorkspaceDeleteResult;
	readTaskWorkspaceHead: (options: {
		repositoryKind: WorkspaceRepositoryKind;
		cwd: string;
	}) => TaskWorkspaceHeadInfo;
	verifyTaskWorkspace: (options: {
		repositoryKind: WorkspaceRepositoryKind;
		workspacePath: string;
		workspaceName?: string;
	}) => TaskWorkspaceVerifyResult;
	publishTaskWorkspace: (options: {
		repositoryKind: WorkspaceRepositoryKind;
		cwd: string;
		branch: string;
	}) => TaskWorkspacePublishResult;
}

let cachedRootBridgePromise: Promise<RootWorkspaceRuntimeBridgeModule | null> | null = null;

async function loadRootWorkspaceRuntimeBridge(): Promise<RootWorkspaceRuntimeBridgeModule | null> {
	if (!cachedRootBridgePromise) {
		cachedRootBridgePromise = import(ROOT_WORKSPACE_RUNTIME_BRIDGE_MODULE_URL.href)
			.then((module) => {
				if (
					typeof module.createTaskWorkspace === "function" &&
					typeof module.deleteTaskWorkspace === "function" &&
					typeof module.readTaskWorkspaceHead === "function" &&
					typeof module.verifyTaskWorkspace === "function" &&
					typeof module.publishTaskWorkspace === "function"
				) {
					return module as RootWorkspaceRuntimeBridgeModule;
				}
				return null;
			})
			.catch(() => null);
	}
	return await cachedRootBridgePromise;
}

export async function createTaskWorkspaceViaBridge(options: {
	repositoryKind: WorkspaceRepositoryKind;
	repoRoot: string;
	workspacePath: string;
	revision: string;
	workspaceName?: string;
}): Promise<TaskWorkspaceCreateResult> {
	const bridge = await loadRootWorkspaceRuntimeBridge();
	if (bridge) {
		return bridge.createTaskWorkspace(options);
	}

	await mkdir(dirname(options.workspacePath), { recursive: true });
	if (options.repositoryKind === "jj") {
		if (!options.workspaceName) {
			return {
				ok: false,
				headCommit: null,
				error: "JJ task workspace creation requires a workspace name.",
			};
		}
		const addResult = await runJj(options.repoRoot, [
			"workspace",
			"add",
			"--name",
			options.workspaceName,
			"-r",
			options.revision,
			options.workspacePath,
		]);
		if (!addResult.ok) {
			return {
				ok: false,
				headCommit: null,
				error: addResult.error ?? addResult.output,
			};
		}
		const headCommit = await getJjStdout(["log", "-r", "@", "--no-graph", "-T", "commit_id"], options.workspacePath).catch(
			() => null,
		);
		return {
			ok: true,
			headCommit,
		};
	}

	const addResult = await runGit(options.repoRoot, ["worktree", "add", "--detach", options.workspacePath, options.revision]);
	if (!addResult.ok) {
		return {
			ok: false,
			headCommit: null,
			error: addResult.error ?? addResult.output,
		};
	}
	return {
		ok: true,
		headCommit: addResult.ok ? await readTaskWorkspaceHeadViaBridge({ repositoryKind: "git", cwd: options.workspacePath }).then((info) => info.headCommit) : null,
	};
}

export async function deleteTaskWorkspaceViaBridge(options: {
	repositoryKind: WorkspaceRepositoryKind;
	repoRoot: string;
	workspacePath: string;
	workspaceName?: string;
}): Promise<TaskWorkspaceDeleteResult> {
	const bridge = await loadRootWorkspaceRuntimeBridge();
	if (bridge) {
		return bridge.deleteTaskWorkspace(options);
	}

	if (options.repositoryKind === "jj") {
		if (!options.workspaceName) {
			return { ok: true };
		}
		const forgetResult = await runJj(options.repoRoot, ["workspace", "forget", options.workspaceName]).catch(() => null);
		return forgetResult?.ok === false
			? { ok: true, error: forgetResult.error ?? forgetResult.output }
			: { ok: true };
	}

	const removeResult = await runGit(options.repoRoot, ["worktree", "remove", "--force", options.workspacePath]);
	if (removeResult.ok) {
		return { ok: true };
	}
	const pruneResult = await runGit(options.repoRoot, ["worktree", "prune"]);
	if (pruneResult.ok) {
		return { ok: true, error: removeResult.error ?? removeResult.output };
	}
	return {
		ok: false,
		error: pruneResult.error ?? pruneResult.output ?? removeResult.error ?? removeResult.output,
	};
}

export async function readTaskWorkspaceHeadViaBridge(options: {
	repositoryKind: WorkspaceRepositoryKind;
	cwd: string;
}): Promise<TaskWorkspaceHeadInfo> {
	const bridge = await loadRootWorkspaceRuntimeBridge();
	if (bridge) {
		return bridge.readTaskWorkspaceHead(options);
	}

	if (options.repositoryKind === "jj") {
		const [headCommit, branch] = await Promise.all([
			getJjStdout(["log", "-r", "@", "--no-graph", "-T", "commit_id"], options.cwd).catch(() => null),
			getJjCurrentBookmark(options.cwd),
		]);
		return {
			branch,
			headCommit,
			isDetached: false,
		};
	}

	const [headResult, branchResult] = await Promise.all([
		runGit(options.cwd, ["rev-parse", "--verify", "HEAD"]),
		runGit(options.cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"]),
	]);
	return {
		branch: branchResult.ok ? branchResult.stdout : null,
		headCommit: headResult.ok ? headResult.stdout : null,
		isDetached: headResult.ok && !branchResult.ok,
	};
}

export async function verifyTaskWorkspaceViaBridge(options: {
	repositoryKind: WorkspaceRepositoryKind;
	workspacePath: string;
	workspaceName?: string;
}): Promise<TaskWorkspaceVerifyResult> {
	const bridge = await loadRootWorkspaceRuntimeBridge();
	if (bridge) {
		return bridge.verifyTaskWorkspace(options);
	}

	if (options.repositoryKind === "jj") {
		const [rootResult, listResult, statusResult] = await Promise.all([
			runJj(options.workspacePath, ["workspace", "root"]),
			options.workspaceName ? runJj(options.workspacePath, ["workspace", "list"]) : Promise.resolve(null),
			runJj(options.workspacePath, ["status"]),
		]);
		const errors: string[] = [];
		if (!rootResult.ok || !rootResult.stdout) {
			errors.push(rootResult.error ?? rootResult.output ?? "Could not resolve jj workspace root.");
		}
		if (listResult && (!listResult.ok || !listResult.stdout.includes(options.workspaceName ?? ""))) {
			errors.push(
				listResult.error ??
					listResult.output ??
					`jj workspace list does not include ${options.workspaceName ?? "the requested workspace"}.`,
			);
		}
		if (!statusResult.ok) {
			errors.push(statusResult.error ?? statusResult.output ?? "Could not inspect jj workspace status.");
		} else if (/conflict/i.test(statusResult.stdout)) {
			errors.push("jj workspace reports conflicts");
		}
		return {
			ok: errors.length === 0,
			errors,
		};
	}

	const [rootResult, statusResult] = await Promise.all([
		runGit(options.workspacePath, ["rev-parse", "--show-toplevel"]),
		runGit(options.workspacePath, ["status", "--porcelain"]),
	]);
	const errors: string[] = [];
	if (!rootResult.ok || !rootResult.stdout) {
		errors.push(rootResult.error ?? rootResult.output ?? "Could not resolve git workspace root.");
	}
	if (!statusResult.ok) {
		errors.push(statusResult.error ?? statusResult.output ?? "Could not inspect git workspace status.");
	} else if (statusResult.stdout.includes("UU ")) {
		errors.push("Git workspace has unresolved conflicts");
	}
	return {
		ok: errors.length === 0,
		errors,
	};
}

export async function publishTaskWorkspaceViaBridge(options: {
	repositoryKind: WorkspaceRepositoryKind;
	cwd: string;
	branch: string;
}): Promise<TaskWorkspacePublishResult> {
	const bridge = await loadRootWorkspaceRuntimeBridge();
	if (bridge) {
		return bridge.publishTaskWorkspace(options);
	}

	const branch = options.branch.trim();
	if (!branch) {
		return {
			ok: false,
			branch: "",
			remote: null,
			error: "Publish requires a branch or bookmark name.",
		};
	}

	if (options.repositoryKind === "jj") {
		const bookmarkResult = await runJj(options.cwd, ["bookmark", "set", branch, "-r", "@"]);
		if (!bookmarkResult.ok) {
			return {
				ok: false,
				branch,
				remote: null,
				error: bookmarkResult.error ?? bookmarkResult.output ?? "Failed to set jj bookmark before publish.",
			};
		}
		const pushResult = await runJj(options.cwd, ["git", "push", "--bookmark", branch]);
		return pushResult.ok
			? { ok: true, branch, remote: "origin" }
			: {
					ok: false,
					branch,
					remote: null,
					error: pushResult.error ?? pushResult.output ?? "Failed to publish jj workspace.",
				};
	}

	const pushResult = await runGit(options.cwd, ["push", "-u", "origin", branch]);
	return pushResult.ok
		? { ok: true, branch, remote: "origin" }
		: {
				ok: false,
				branch,
				remote: null,
				error: pushResult.error ?? pushResult.output ?? "Failed to publish git workspace.",
			};
}
