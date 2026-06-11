import type { VcsDiagnostic, VcsJjBookmark, VcsJjBranchSegment, VcsJjChange, VcsJjStackLane } from "../types.js";

function createDiagnostic(code: string, message: string): VcsDiagnostic {
	return {
		level: "warning",
		code,
		message,
	};
}

export function buildJjStackLanes(
	bookmarks: readonly VcsJjBookmark[],
	changes: readonly VcsJjChange[],
): { lanes: VcsJjStackLane[]; diagnostics: VcsDiagnostic[] } {
	const changesById = new Map(changes.map((change) => [change.changeId, change]));
	const diagnostics: VcsDiagnostic[] = [];
	const lanes: VcsJjStackLane[] = [];

	for (const bookmark of [...bookmarks].sort((a, b) => a.name.localeCompare(b.name))) {
		const path: VcsJjBranchSegment[] = [];
		const seen = new Set<string>();
		let current = changesById.get(bookmark.changeId) ?? null;

		while (current) {
			if (seen.has(current.changeId)) {
				diagnostics.push(
					createDiagnostic(
						"jj_cycle_detected",
						`JJ stack traversal found a cycle while walking bookmark ${bookmark.name}.`,
					),
				);
				break;
			}
			seen.add(current.changeId);

			path.push({
				id: current.changeId,
				changeId: current.changeId,
				commitId: current.commitId,
				title: current.description || "(empty description)",
				bookmarks: current.bookmarks,
				remoteBookmarks: current.remoteBookmarks,
				isCurrent: current.isCurrent,
				isHead: current.changeId === bookmark.changeId,
			});

			if (current.parentChangeIds.length > 1) {
				diagnostics.push(
					createDiagnostic(
						"jj_merge_omitted",
						`Bookmark ${bookmark.name} crosses a merge commit; only the primary parent path is shown.`,
					),
				);
			}

			const nextParentId = current.parentChangeIds[0] ?? null;
			current = nextParentId ? (changesById.get(nextParentId) ?? null) : null;
		}

		const segments = path.reverse();
		if (segments.length === 0) {
			continue;
		}
		lanes.push({
			id: bookmark.name,
			headBookmark: bookmark.name,
			segments,
		});
	}

	return {
		lanes: lanes.sort((a, b) => {
			const byLength = b.segments.length - a.segments.length;
			return byLength || a.headBookmark.localeCompare(b.headBookmark);
		}),
		diagnostics,
	};
}
