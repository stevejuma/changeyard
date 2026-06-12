import { detectVcsState, type VcsCommandRunner } from "../detect.js";
import type { VcsDiagnostic, VcsJjStateResult } from "../types.js";
import { isInternalJjBookmark, normalizeRemoteTargetToLocalBookmark, remoteNameFromTarget } from "./bookmark-utils.js";
import { buildJjStacks } from "./graph.js";
import {
	createJjRemoteBookmarkRevset,
	createJjSymbolRevset,
	readJjBookmarksWithBase,
	readJjChangesForBookmarks,
	readJjUnassignedChanges,
} from "./read.js";

function createDiagnostic(level: VcsDiagnostic["level"], code: string, message: string): VcsDiagnostic {
	return { level, code, message };
}

export interface LoadJjStateOptions {
	targetBranch?: string | null;
}

export async function loadJjState(
	cwd: string,
	runner: VcsCommandRunner,
	options: LoadJjStateOptions = {},
): Promise<VcsJjStateResult> {
	const detect = await detectVcsState(cwd, runner);
	if (detect.repository.kind !== "jj") {
		return {
			...detect,
			bookmarks: [],
			changes: [],
			stacks: [],
			unassignedChanges: [],
			diagnostics: [
				...detect.diagnostics,
				createDiagnostic("warning", "jj_repo_required", "JJ stack state is only available inside a JJ repository."),
			],
		};
	}

	const repoCwd = detect.repository.root ?? cwd;
	const diagnostics = [...detect.diagnostics];
	const detectedBase = detect.jj.defaultBase ?? detect.git.defaultBranch ?? null;
	const defaultTarget = detect.git.remoteName && detectedBase ? `${detect.git.remoteName}/${detectedBase}` : detectedBase;
	const configuredTarget = options.targetBranch?.trim() || defaultTarget;
	const configuredBase = normalizeRemoteTargetToLocalBookmark(configuredTarget, detect.git.remoteName);
	const configuredRemote = remoteNameFromTarget(configuredTarget, detect.git.remoteName);
	const preferredBase = configuredBase ?? detectedBase;
	let base = preferredBase ?? "trunk";
	const localBaseRevset = createJjSymbolRevset(preferredBase);
	const preferredBaseRevset = configuredBase && configuredRemote
		? createJjRemoteBookmarkRevset(configuredBase, configuredRemote)
		: localBaseRevset;
	let activeBaseRevset = preferredBaseRevset;
	let bookmarkRead = await readJjBookmarksWithBase(repoCwd, preferredBaseRevset, runner);

	if (!bookmarkRead.ok && preferredBaseRevset !== localBaseRevset) {
		diagnostics.push(
			createDiagnostic(
				"warning",
				"jj_remote_base_unavailable",
				`Could not read JJ bookmarks relative to ${configuredTarget}; falling back to ${base}.`,
			),
		);
		bookmarkRead = await readJjBookmarksWithBase(repoCwd, localBaseRevset, runner);
		activeBaseRevset = localBaseRevset;
	}

	if (!bookmarkRead.ok && activeBaseRevset !== "trunk()") {
		diagnostics.push(
			createDiagnostic(
				"warning",
				"jj_base_unavailable",
				`Could not read JJ bookmarks relative to ${base}; falling back to trunk().`,
			),
		);
		bookmarkRead = await readJjBookmarksWithBase(repoCwd, "trunk()", runner);
		activeBaseRevset = "trunk()";
		base = "trunk";
	}

	const bookmarks = bookmarkRead.bookmarks.filter((bookmark) => !isInternalJjBookmark(bookmark.name));
	const graphRead = await readJjChangesForBookmarks(
		repoCwd,
		bookmarks.map((bookmark) => bookmark.name),
		activeBaseRevset,
		runner,
	);
	if (!graphRead.ok) {
		diagnostics.push(createDiagnostic("warning", "jj_stack_graph_empty", "Could not read the bounded JJ stack graph."));
	}
	const changes = graphRead.changes;
	const { stacks, diagnostics: stackDiagnostics } = buildJjStacks(bookmarks, changes, { base });
	const unassignedChanges = await readJjUnassignedChanges(repoCwd, runner);

	if (bookmarks.length === 0) {
		diagnostics.push(
			createDiagnostic("info", "jj_bookmarks_missing", "No local JJ bookmarks were found under mine() relative to the base."),
		);
	}
	if (stacks.length === 0 && bookmarks.length > 0) {
		diagnostics.push(
			createDiagnostic("warning", "jj_stack_empty", "Bookmarks were detected, but no stacks could be constructed."),
		);
	}

	return {
		...detect,
		bookmarks,
		changes,
		stacks,
		unassignedChanges,
		diagnostics: [...diagnostics, ...graphRead.diagnostics, ...stackDiagnostics],
	};
}
