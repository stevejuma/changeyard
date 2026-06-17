import type { RuntimeChangeyardChangeListItem } from "@/runtime/types";

export function normalizeKanbanEventPath(input: string | null | undefined): string {
	return (input ?? "").replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\.\//, "").replace(/\/$/, "");
}

function normalizeWorkspacePathForEvent(workspacePath: string | null | undefined, repoRoot: string | null | undefined): string | null {
	const normalizedWorkspacePath = normalizeKanbanEventPath(workspacePath);
	if (!normalizedWorkspacePath) {
		return null;
	}
	const normalizedRepoRoot = normalizeKanbanEventPath(repoRoot);
	if (
		normalizedRepoRoot &&
		normalizedWorkspacePath !== normalizedRepoRoot &&
		normalizedWorkspacePath.startsWith(`${normalizedRepoRoot}/`)
	) {
		return normalizedWorkspacePath.slice(normalizedRepoRoot.length + 1);
	}
	return normalizedWorkspacePath.replace(/^\//, "");
}

export function isChangeyardChangeMarkdownEventPath(input: string): boolean {
	const eventPath = normalizeKanbanEventPath(input);
	return (
		(eventPath.startsWith(".changeyard/changes/") || eventPath.includes("/.changeyard/changes/")) &&
		eventPath.endsWith(".md")
	);
}

export function isChangeMarkdownEventPathForChange(input: string, changeId: string): boolean {
	if (!isChangeyardChangeMarkdownEventPath(input)) {
		return false;
	}
	const fileName = normalizeKanbanEventPath(input).split("/").pop() ?? "";
	return fileName === `${changeId}.md` || fileName.startsWith(`${changeId}-`);
}

export function findAffectedWorkspaceChangeIds(
	changes: RuntimeChangeyardChangeListItem[],
	eventPaths: string[],
	repoRoot: string | null | undefined,
): string[] {
	const normalizedEventPaths = eventPaths.map(normalizeKanbanEventPath).filter(Boolean);
	const affected = new Set<string>();
	for (const change of changes) {
		const workspacePath = normalizeWorkspacePathForEvent(change.workspace?.path, repoRoot);
		if (!workspacePath) {
			continue;
		}
		if (normalizedEventPaths.some((eventPath) => eventPath === workspacePath || eventPath.startsWith(`${workspacePath}/`))) {
			affected.add(change.id);
		}
	}
	return Array.from(affected).sort();
}
