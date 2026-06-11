import { detectVcsState, type VcsCommandRunner } from "../detect.js";
import type { VcsDiagnostic, VcsJjChange, VcsJjStateResult } from "../types.js";
import { buildJjStackLanes } from "./graph.js";
import { readJjBookmarks, readJjChangesForBookmark, readJjUnassignedChanges } from "./read.js";

function createDiagnostic(level: VcsDiagnostic["level"], code: string, message: string): VcsDiagnostic {
	return { level, code, message };
}

export async function loadJjState(cwd: string, runner: VcsCommandRunner): Promise<VcsJjStateResult> {
	const detect = await detectVcsState(cwd, runner);
	if (detect.repository.kind !== "jj") {
		return {
			...detect,
			bookmarks: [],
			changes: [],
			lanes: [],
			unassignedChanges: [],
			diagnostics: [
				...detect.diagnostics,
				createDiagnostic("warning", "jj_repo_required", "JJ stack state is only available inside a JJ repository."),
			],
		};
	}

	const repoCwd = detect.repository.root ?? cwd;
	const bookmarks = await readJjBookmarks(repoCwd, runner);
	const collectedChanges = new Map<string, VcsJjChange>();
	const diagnostics = [...detect.diagnostics];

	for (const bookmark of bookmarks) {
		try {
			const bookmarkChanges = await readJjChangesForBookmark(repoCwd, bookmark.name, runner);
			for (const change of bookmarkChanges) {
				const existing = collectedChanges.get(change.changeId);
				collectedChanges.set(change.changeId, {
					...change,
					bookmarks: mergeLists(existing?.bookmarks, change.bookmarks),
					remoteBookmarks: mergeLists(existing?.remoteBookmarks, change.remoteBookmarks),
					isCurrent: existing?.isCurrent || change.isCurrent || false,
				});
			}
		} catch (error) {
			diagnostics.push(
				createDiagnostic(
					"warning",
					"jj_bookmark_skipped",
					error instanceof Error
						? `Skipped bookmark ${bookmark.name}: ${error.message}`
						: `Skipped bookmark ${bookmark.name}.`,
				),
			);
		}
	}

	const changes = [...collectedChanges.values()];
	const { lanes, diagnostics: laneDiagnostics } = buildJjStackLanes(bookmarks, changes);
	const unassignedChanges = await readJjUnassignedChanges(repoCwd, runner);

	if (bookmarks.length === 0) {
		diagnostics.push(
			createDiagnostic("info", "jj_bookmarks_missing", "No local JJ bookmarks were found under mine() ~ trunk()."),
		);
	}
	if (lanes.length === 0 && bookmarks.length > 0) {
		diagnostics.push(
			createDiagnostic("warning", "jj_stack_empty", "Bookmarks were detected, but no stack lanes could be constructed."),
		);
	}

	return {
		...detect,
		bookmarks,
		changes,
		lanes,
		unassignedChanges,
		diagnostics: [...diagnostics, ...laneDiagnostics],
	};
}

function mergeLists(current: readonly string[] | undefined, next: readonly string[]): string[] {
	return [...new Set([...(current ?? []), ...next])];
}
