export function withWorkspaceParam(path: string, workspaceId: string | null): string {
	const normalizedPath = path === "/vcs" ? "/vcs/" : path;
	if (!workspaceId) {
		return normalizedPath;
	}
	const params = new URLSearchParams();
	params.set("workspaceId", workspaceId);
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
	if (itemPath === "/vcs") {
		return path === "/vcs";
	}
	return path === itemPath;
}
