export function withWorkspaceParam(path: string, workspaceId: string | null, workspacePath?: string | null): string {
	const normalizedPath = path === "/vcs" ? "/vcs/" : path;
	if (!workspaceId && !workspacePath) {
		return normalizedPath;
	}
	const params = new URLSearchParams();
	if (workspaceId) {
		params.set("workspaceId", workspaceId);
	}
	if (workspacePath) {
		params.set("workspacePath", workspacePath);
	}
	return `${normalizedPath}?${params.toString()}`;
}

function normalizeVcsPath(path: string): string {
	if (path === "/vcs/") {
		return "/vcs";
	}
	return path.endsWith("/") && path.length > 1 ? path.slice(0, -1) : path;
}

export function isVcsNavItemActive(itemHref: string, currentPath: string): boolean {
	const itemPath = normalizeVcsPath(itemHref);
	const path = normalizeVcsPath(currentPath);
	if (itemPath === "/vcs/jj") {
		return path === "/vcs" || path === "/vcs/jj";
	}
	return path === itemPath;
}
