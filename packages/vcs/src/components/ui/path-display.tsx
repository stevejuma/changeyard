import type { ReactElement } from "react";

import { Tooltip } from "@/components/ui/tooltip";

function normalizePath(value: string): string {
	return value.replace(/\\/g, "/").replace(/\/+$/g, "");
}

export function getRepoRelativePath(path: string, repoRoot?: string | null): string {
	const normalizedPath = normalizePath(path.trim());
	const normalizedRepoRoot = repoRoot ? normalizePath(repoRoot.trim()) : "";
	if (!normalizedPath) {
		return "";
	}
	if (!normalizedRepoRoot || !normalizedPath.startsWith("/")) {
		return normalizedPath;
	}
	if (normalizedPath === normalizedRepoRoot) {
		return ".";
	}
	const prefix = `${normalizedRepoRoot}/`;
	if (normalizedPath.startsWith(prefix)) {
		return normalizedPath.slice(prefix.length);
	}
	return normalizedPath;
}

export function PathDisplay({
	path,
	repoRoot,
	className = "break-all font-mono text-xs",
}: {
	path: string;
	repoRoot?: string | null;
	className?: string;
}): ReactElement {
	const displayPath = getRepoRelativePath(path, repoRoot);
	return (
		<Tooltip content={path !== displayPath ? path : null} side="top">
			<span className={className}>{displayPath}</span>
		</Tooltip>
	);
}
