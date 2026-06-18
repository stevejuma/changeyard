import { execFile as execFileCallback } from "node:child_process";
import { stat } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { promisify } from "node:util";

import type { RuntimeProjectWorkspaceSummary } from "../core/api-contract.js";
import type { RuntimeChangeyardApiAdapter } from "../trpc/changes-api.js";

const execFile = promisify(execFileCallback);

export interface ProjectWorkspaceSummaryDependencies {
	detectWorkspaceRepositoryKind: (path: string) => "git" | "jj" | null;
	changeyardApi?: RuntimeChangeyardApiAdapter | null;
	warn: (message: string) => void;
}

export function resolveProjectWorkspacePath(repoPath: string, workspacePath: string): string {
	return isAbsolute(workspacePath) ? resolve(workspacePath) : resolve(repoPath, workspacePath);
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

async function workspaceDirectoryExists(repoPath: string, workspacePath: string): Promise<boolean> {
	return pathIsDirectory(resolveProjectWorkspacePath(repoPath, workspacePath));
}

async function summarizeJjWorkspaces(
	repoPath: string,
	deps: ProjectWorkspaceSummaryDependencies,
): Promise<RuntimeProjectWorkspaceSummary[]> {
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
				"--color=never",
				"--no-pager",
				"workspace",
				"list",
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

export async function summarizeProjectWorkspaces(
	repoPath: string,
	deps: ProjectWorkspaceSummaryDependencies,
): Promise<RuntimeProjectWorkspaceSummary[]> {
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
				const absoluteWorkspacePath = workspace.path
					? resolveProjectWorkspacePath(repoPath, workspace.path)
					: null;
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

		for (const workspace of await summarizeJjWorkspaces(repoPath, deps)) {
			const absoluteWorkspacePath = workspace.path
				? resolveProjectWorkspacePath(repoPath, workspace.path)
				: null;
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
