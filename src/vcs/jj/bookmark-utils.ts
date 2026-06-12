const INTERNAL_BOOKMARK_PREFIXES = ["changeyard/", "_changeyard/", "workspace/", "workspace-wip/"];

export function isInternalJjBookmark(name: string): boolean {
	return INTERNAL_BOOKMARK_PREFIXES.some((prefix) => name.startsWith(prefix));
}

export function normalizeRemoteTargetToLocalBookmark(target: string | null | undefined, remoteName?: string | null): string | null {
	const trimmed = target?.trim();
	if (!trimmed) {
		return null;
	}

	const withoutRefs = trimmed
		.replace(/^refs\/heads\//, "")
		.replace(/^refs\/remotes\//, "");

	const bookmarkAtRemote = /^(.+)@([^@]+)$/.exec(withoutRefs);
	if (bookmarkAtRemote?.[1]) {
		return bookmarkAtRemote[1];
	}

	if (remoteName && withoutRefs.startsWith(`${remoteName}/`)) {
		return withoutRefs.slice(remoteName.length + 1) || null;
	}

	for (const commonRemote of ["origin", "upstream", "fork"]) {
		if (withoutRefs.startsWith(`${commonRemote}/`)) {
			return withoutRefs.slice(commonRemote.length + 1) || null;
		}
	}

	return withoutRefs;
}

export function remoteNameFromTarget(target: string | null | undefined, detectRemoteName?: string | null): string | null {
	const trimmed = target?.trim();
	if (!trimmed) {
		return null;
	}
	const refMatch = /^refs\/remotes\/([^/]+)\//.exec(trimmed);
	if (refMatch?.[1]) {
		return refMatch[1];
	}
	const atRemoteMatch = /^.+@([^@]+)$/.exec(trimmed);
	if (atRemoteMatch?.[1]) {
		return atRemoteMatch[1];
	}
	if (detectRemoteName && trimmed.startsWith(`${detectRemoteName}/`)) {
		return detectRemoteName;
	}
	for (const commonRemote of ["origin", "upstream", "fork"]) {
		if (trimmed.startsWith(`${commonRemote}/`)) {
			return commonRemote;
		}
	}
	return null;
}
