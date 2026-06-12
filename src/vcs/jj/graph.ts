import type { VcsDiagnostic, VcsJjBookmark, VcsJjChange, VcsJjStack, VcsJjStackChange, VcsJjStackHead } from "../types.js";

const INTERNAL_BOOKMARK_PREFIXES = ["changeyard/", "_changeyard/"];

interface BuildJjStacksOptions {
	base: string;
}

function createDiagnostic(code: string, message: string): VcsDiagnostic {
	return {
		level: "warning",
		code,
		message,
	};
}

function isInternalBookmark(name: string): boolean {
	return INTERNAL_BOOKMARK_PREFIXES.some((prefix) => name.startsWith(prefix));
}

function isBaseBookmark(name: string, base: string): boolean {
	return name === base || name === "trunk" || name === "trunk()";
}

function findPrimaryPath(
	startChangeId: string,
	changesById: ReadonlyMap<string, VcsJjChange>,
	bookmarkName: string,
	diagnostics: VcsDiagnostic[],
): VcsJjChange[] {
	const path: VcsJjChange[] = [];
	const seen = new Set<string>();
	let current = changesById.get(startChangeId) ?? null;

	while (current) {
		if (seen.has(current.changeId)) {
			diagnostics.push(
				createDiagnostic("jj_cycle_detected", `JJ stack traversal found a cycle while walking bookmark ${bookmarkName}.`),
			);
			break;
		}
		seen.add(current.changeId);
		path.push(current);

		if (current.parentChangeIds.length > 1) {
			diagnostics.push(
				createDiagnostic(
					"jj_merge_omitted",
					`Bookmark ${bookmarkName} crosses a merge commit; only the primary parent path is shown.`,
				),
			);
		}

		const nextParentId = current.parentChangeIds[0] ?? null;
		current = nextParentId ? (changesById.get(nextParentId) ?? null) : null;
	}

	return path.reverse();
}

function hasAncestor(
	changeId: string,
	ancestorChangeId: string,
	changesById: ReadonlyMap<string, VcsJjChange>,
): boolean {
	const queue = [changeId];
	const seen = new Set<string>();
	while (queue.length > 0) {
		const currentId = queue.shift();
		if (!currentId || seen.has(currentId)) {
			continue;
		}
		seen.add(currentId);
		const current = changesById.get(currentId);
		if (!current) {
			continue;
		}
		for (const parentId of current.parentChangeIds) {
			if (parentId === ancestorChangeId) {
				return true;
			}
			queue.push(parentId);
		}
	}
	return false;
}

function findNearestAncestorBookmark(
	changeId: string,
	candidateBookmarks: readonly VcsJjBookmark[],
	changesById: ReadonlyMap<string, VcsJjChange>,
	excludedBookmarkNames: ReadonlySet<string>,
): VcsJjBookmark | null {
	const candidatesByChange = new Map<string, VcsJjBookmark[]>();
	for (const bookmark of candidateBookmarks) {
		if (excludedBookmarkNames.has(bookmark.name)) {
			continue;
		}
		const current = candidatesByChange.get(bookmark.changeId) ?? [];
		current.push(bookmark);
		candidatesByChange.set(bookmark.changeId, current);
	}
	for (const list of candidatesByChange.values()) {
		list.sort((a, b) => a.name.localeCompare(b.name));
	}

	const start = changesById.get(changeId);
	if (!start) {
		return null;
	}
	const queue = start.parentChangeIds.map((parentId) => ({ changeId: parentId, depth: 1 }));
	const seen = new Set<string>();
	let best: { bookmark: VcsJjBookmark; depth: number } | null = null;

	while (queue.length > 0) {
		const current = queue.shift();
		if (!current || seen.has(current.changeId)) {
			continue;
		}
		if (best && current.depth > best.depth) {
			break;
		}
		seen.add(current.changeId);

		const bookmarks = candidatesByChange.get(current.changeId);
		if (bookmarks?.[0]) {
			const bookmark = bookmarks[0];
			if (!best || current.depth < best.depth || bookmark.name.localeCompare(best.bookmark.name) < 0) {
				best = { bookmark, depth: current.depth };
			}
			continue;
		}

		const change = changesById.get(current.changeId);
		if (!change) {
			continue;
		}
		for (const parentId of change.parentChangeIds) {
			queue.push({ changeId: parentId, depth: current.depth + 1 });
		}
	}

	return best?.bookmark ?? null;
}

function createStackHead(bookmark: VcsJjBookmark, changesById: ReadonlyMap<string, VcsJjChange>): VcsJjStackHead {
	const change = changesById.get(bookmark.changeId);
	return {
		id: bookmark.name,
		bookmarkName: bookmark.name,
		changeId: bookmark.changeId,
		commitId: bookmark.commitId,
		title: change?.description || "(empty description)",
		isCheckedOut: change?.isCurrent ?? false,
	};
}

function createStackChange(change: VcsJjChange, headChangeIds: ReadonlySet<string>): VcsJjStackChange {
	return {
		id: change.changeId,
		changeId: change.changeId,
		commitId: change.commitId,
		title: change.description || "(empty description)",
		bookmarks: change.bookmarks,
		remoteBookmarks: change.remoteBookmarks,
		isCurrent: change.isCurrent,
		isHead: headChangeIds.has(change.changeId),
	};
}

export function buildJjStacks(
	bookmarks: readonly VcsJjBookmark[],
	changes: readonly VcsJjChange[],
	options: BuildJjStacksOptions,
): { stacks: VcsJjStack[]; diagnostics: VcsDiagnostic[] } {
	const changesById = new Map(changes.map((change) => [change.changeId, change]));
	const diagnostics: VcsDiagnostic[] = [];
	const candidateBookmarks = bookmarks
		.filter((bookmark) => !isBaseBookmark(bookmark.name, options.base))
		.filter((bookmark) => !isInternalBookmark(bookmark.name))
		.filter((bookmark) => changesById.has(bookmark.changeId))
		.sort((a, b) => a.name.localeCompare(b.name));

	const topBookmarks = candidateBookmarks.filter(
		(bookmark) =>
			!candidateBookmarks.some(
				(other) =>
					other.name !== bookmark.name &&
					other.changeId !== bookmark.changeId &&
					hasAncestor(other.changeId, bookmark.changeId, changesById),
			),
	);

	const stacks = topBookmarks.map((bookmark) => {
		const heads: VcsJjStackHead[] = [];
		const visitedBookmarkNames = new Set<string>();
		let current: VcsJjBookmark | null = bookmark;
		while (current && !visitedBookmarkNames.has(current.name)) {
			visitedBookmarkNames.add(current.name);
			heads.push(createStackHead(current, changesById));
			current = findNearestAncestorBookmark(current.changeId, candidateBookmarks, changesById, visitedBookmarkNames);
		}

		if (current) {
			diagnostics.push(
				createDiagnostic("jj_bookmark_cycle_detected", `JJ stack traversal found a bookmark cycle while walking ${bookmark.name}.`),
			);
		}

		const headChangeIds = new Set(heads.map((head) => head.changeId));
		const path = findPrimaryPath(bookmark.changeId, changesById, bookmark.name, diagnostics);
		const changesForStack = path.map((change) => createStackChange(change, headChangeIds));
		return {
			id: bookmark.name,
			tip: bookmark.commitId,
			base: options.base,
			order: 0,
			isCheckedOut: heads.some((head) => head.isCheckedOut),
			heads,
			changes: changesForStack,
		};
	});

	return {
		stacks: stacks
			.sort((a, b) => {
				const byLength = b.changes.length - a.changes.length;
				return byLength || a.id.localeCompare(b.id);
			})
			.map((stack, order) => ({ ...stack, order })),
		diagnostics,
	};
}
