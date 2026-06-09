export interface GitStylePatchEntry {
	path: string;
	previousPath?: string;
	status: "modified" | "added" | "deleted" | "renamed";
	additions: number;
	deletions: number;
	patch: string;
}

function countPatchLineChanges(patch: string): { additions: number; deletions: number } {
	let additions = 0;
	let deletions = 0;
	let inHunk = false;

	for (const line of patch.split("\n")) {
		if (line.startsWith("@@")) {
			inHunk = true;
			continue;
		}
		if (!inHunk) {
			continue;
		}
		if (line.startsWith("diff --git ")) {
			inHunk = false;
			continue;
		}
		if (line.startsWith("+++") || line.startsWith("---")) {
			continue;
		}
		if (line.startsWith("+")) {
			additions += 1;
			continue;
		}
		if (line.startsWith("-")) {
			deletions += 1;
		}
	}

	return { additions, deletions };
}

export function parseGitStylePatchEntries(output: string): GitStylePatchEntry[] {
	const patchSegments = output.split(/^diff --git /m);
	const entries: GitStylePatchEntry[] = [];

	for (const segment of patchSegments) {
		if (!segment.trim()) {
			continue;
		}

		const fullPatch = `diff --git ${segment}`;
		const headerMatch = fullPatch.match(/^diff --git a\/(.+) b\/(.+)$/m);
		if (!headerMatch?.[1] || !headerMatch[2]) {
			continue;
		}

		let previousPath: string | undefined = headerMatch[1] !== headerMatch[2] ? headerMatch[1] : undefined;
		let path = headerMatch[2];
		let status: GitStylePatchEntry["status"] = "modified";

		const renameFromMatch = fullPatch.match(/^rename from (.+)$/m);
		const renameToMatch = fullPatch.match(/^rename to (.+)$/m);
		if (renameFromMatch?.[1] && renameToMatch?.[1]) {
			status = "renamed";
			previousPath = renameFromMatch[1];
			path = renameToMatch[1];
		} else if (/^new file mode /m.test(fullPatch)) {
			status = "added";
		} else if (/^deleted file mode /m.test(fullPatch)) {
			status = "deleted";
		}

		const { additions, deletions } = countPatchLineChanges(fullPatch);
		entries.push({
			path,
			previousPath,
			status,
			additions,
			deletions,
			patch: fullPatch,
		});
	}

	return entries;
}
