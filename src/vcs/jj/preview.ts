import { detectVcsState, type VcsCommandRunner } from "../detect.js";
import type {
	VcsAbandonChangeOperationInput,
	VcsAbsorbFileOperationInput,
	VcsCreateChangeOperationInput,
	VcsCreateBookmarkOperationInput,
	VcsDiagnostic,
	VcsEditMessageOperationInput,
	VcsJjChange,
	VcsMoveBookmarkOperationInput,
	VcsPreviewOperationInput,
	VcsPreviewOperationResult,
	VcsRedoLastOperationInput,
	VcsReorderOperationInput,
	VcsRestoreFileOperationInput,
	VcsSquashChangeOperationInput,
	VcsSplitChangeOperationInput,
	VcsUndoLastOperationInput,
} from "../types.js";
import { readJjBookmarks, readJjChangesForBookmark } from "./read.js";

const SAFE_CHANGE_ID_PATTERN = /^[A-Za-z0-9._/-]+$/;
const SAFE_BOOKMARK_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const SAFE_REPO_PATH_PATTERN = /^(?!-)(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\u0000).+/;

function createDiagnostic(level: VcsDiagnostic["level"], code: string, message: string): VcsDiagnostic {
	return { level, code, message };
}

function assertSafeChangeId(changeId: string): void {
	if (!SAFE_CHANGE_ID_PATTERN.test(changeId)) {
		throw new Error(`Unsupported JJ change id: ${changeId}`);
	}
}

function assertSafeRevisionId(revisionId: string): void {
	if (revisionId !== "@" && !SAFE_CHANGE_ID_PATTERN.test(revisionId)) {
		throw new Error(`Unsupported JJ revision id: ${revisionId}`);
	}
}

function isSafeBookmarkName(bookmarkName: string): boolean {
	return SAFE_BOOKMARK_NAME_PATTERN.test(bookmarkName);
}

function isSafeRepoPath(repoPath: string): boolean {
	return SAFE_REPO_PATH_PATTERN.test(repoPath);
}

function emptyPreview(operation: VcsPreviewOperationInput, diagnostic: VcsDiagnostic): VcsPreviewOperationResult {
	return {
		valid: false,
		operation,
		title: "Preview unavailable",
		description: diagnostic.message,
		risk: "high",
		commands: [],
		affectedChangeIds: [],
		affectedBookmarks: [],
		diagnostics: [diagnostic],
	};
}

export async function previewJjOperation(
	cwd: string,
	operation: VcsPreviewOperationInput,
	runner: VcsCommandRunner,
): Promise<VcsPreviewOperationResult> {
	const detect = await detectVcsState(cwd, runner);
	if (detect.repository.kind !== "jj") {
		return emptyPreview(
			operation,
			createDiagnostic("warning", "jj_repo_required", "JJ operation previews are only available inside a JJ repository."),
		);
	}

	const repoCwd = detect.repository.root ?? cwd;
	const bookmarks = await readJjBookmarks(repoCwd, runner);
	const changes = await loadAllPreviewChanges(repoCwd, runner);
	switch (operation.kind) {
		case "reorder_change":
			return previewReorderOperation(operation, changes, bookmarks);
		case "create_bookmark":
			return previewCreateBookmarkOperation(operation, changes, bookmarks);
		case "edit_message":
			return previewEditMessageOperation(operation, changes);
		case "create_change":
			return previewCreateChangeOperation(operation, changes);
		case "move_bookmark":
			return previewMoveBookmarkOperation(operation, changes, bookmarks);
		case "squash_change":
			return previewSquashChangeOperation(operation, changes, detect.jj.currentChangeId);
		case "split_change":
			return previewSplitChangeOperation(operation, changes);
		case "absorb_file":
			return previewAbsorbFileOperation(operation, detect.jj.currentChangeId, changes, unassignedPaths(changes, repoCwd, runner));
		case "restore_file":
			return previewRestoreFileOperation(operation, detect.jj.currentChangeId, unassignedPaths(changes, repoCwd, runner));
		case "undo_last":
			return previewUndoLastOperation(operation, detect.jj.currentChangeId);
		case "redo_last":
			return previewRedoLastOperation(operation, detect.jj.currentChangeId);
		case "abandon_change":
			return previewAbandonChangeOperation(operation, changes);
		default:
			return emptyPreview(
				operation,
				createDiagnostic("error", "jj_operation_unknown", "The requested JJ operation is not supported."),
			);
	}
}

async function loadAllPreviewChanges(cwd: string, runner: VcsCommandRunner): Promise<VcsJjChange[]> {
	const bookmarks = await readJjBookmarks(cwd, runner);
	const collected = new Map<string, VcsJjChange>();
	for (const bookmark of bookmarks) {
		const bookmarkChanges = await readJjChangesForBookmark(cwd, bookmark.name, runner);
		for (const change of bookmarkChanges) {
			const existing = collected.get(change.changeId);
			collected.set(change.changeId, {
				...change,
				bookmarks: [...new Set([...(existing?.bookmarks ?? []), ...change.bookmarks])],
				remoteBookmarks: [...new Set([...(existing?.remoteBookmarks ?? []), ...change.remoteBookmarks])],
				isCurrent: existing?.isCurrent || change.isCurrent || false,
			});
		}
	}
	return [...collected.values()];
}

async function unassignedPaths(
	_changes: readonly VcsJjChange[],
	cwd: string,
	runner: VcsCommandRunner,
): Promise<Set<string>> {
	const result = await runner({
		command: "jj",
		args: ["diff", "--summary", "-r", "@"],
		cwd,
	});
	if (!result.ok) {
		return new Set();
	}
	return new Set(
		result.stdout
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean)
			.map((line) => /^([A-Z])\s+(.*)$/.exec(line)?.[2]?.trim() ?? "")
			.filter(Boolean),
	);
}

function previewReorderOperation(
	operation: VcsReorderOperationInput,
	changes: readonly VcsJjChange[],
	bookmarks: Awaited<ReturnType<typeof readJjBookmarks>>,
): VcsPreviewOperationResult {
	assertSafeChangeId(operation.sourceChangeId);
	assertSafeChangeId(operation.targetChangeId);
	const changesById = new Map(changes.map((change) => [change.changeId, change]));
	const source = changesById.get(operation.sourceChangeId);
	const target = changesById.get(operation.targetChangeId);

	if (!source) {
		return emptyPreview(
			operation,
			createDiagnostic("error", "jj_source_missing", `Change ${operation.sourceChangeId} is not available for preview.`),
		);
	}
	if (!target) {
		return emptyPreview(
			operation,
			createDiagnostic("error", "jj_target_missing", `Change ${operation.targetChangeId} is not available for preview.`),
		);
	}
	if (source.changeId === target.changeId) {
		return emptyPreview(
			operation,
			createDiagnostic("error", "jj_same_target", "Source and target changes must be different."),
		);
	}
	return buildReorderPreview(operation, source, target, bookmarks, changes);
}

function previewCreateBookmarkOperation(
	operation: VcsCreateBookmarkOperationInput,
	changes: readonly VcsJjChange[],
	bookmarks: Awaited<ReturnType<typeof readJjBookmarks>>,
): VcsPreviewOperationResult {
	assertSafeChangeId(operation.changeId);
	if (!isSafeBookmarkName(operation.bookmarkName)) {
		return emptyPreview(
			operation,
			createDiagnostic(
				"error",
				"jj_bookmark_name_invalid",
				`Bookmark ${operation.bookmarkName} contains unsupported characters.`,
			),
		);
	}

	const source = changes.find((change) => change.changeId === operation.changeId);
	if (!source) {
		return emptyPreview(
			operation,
			createDiagnostic("error", "jj_source_missing", `Change ${operation.changeId} is not available for preview.`),
		);
	}
	if (bookmarks.some((bookmark) => bookmark.name === operation.bookmarkName)) {
		return emptyPreview(
			operation,
			createDiagnostic("error", "jj_bookmark_exists", `Bookmark ${operation.bookmarkName} already exists.`),
		);
	}

	const diagnostics: VcsDiagnostic[] = [];
	if (source.bookmarks.length > 0) {
		diagnostics.push(
			createDiagnostic(
				"info",
				"jj_change_has_bookmarks",
				`Change ${source.changeId} already has bookmarks: ${source.bookmarks.join(", ")}.`,
			),
		);
	}

	return {
		valid: true,
		operation,
		title: `Preview create bookmark ${operation.bookmarkName}`,
		description: `Create bookmark ${operation.bookmarkName} pointing at ${operation.changeId}.`,
		risk: "low",
		commands: [
			{
				command: "jj",
				args: ["bookmark", "create", operation.bookmarkName, "-r", operation.changeId],
			},
		],
		affectedChangeIds: [operation.changeId],
		affectedBookmarks: [operation.bookmarkName, ...source.bookmarks],
		diagnostics,
	};
}

function previewEditMessageOperation(
	operation: VcsEditMessageOperationInput,
	changes: readonly VcsJjChange[],
): VcsPreviewOperationResult {
	assertSafeChangeId(operation.changeId);
	const normalizedMessage = operation.message.trim();
	if (normalizedMessage.length === 0) {
		return emptyPreview(
			operation,
			createDiagnostic("error", "jj_message_required", "Enter a non-empty change description before previewing."),
		);
	}

	const source = changes.find((change) => change.changeId === operation.changeId);
	if (!source) {
		return emptyPreview(
			operation,
			createDiagnostic("error", "jj_source_missing", `Change ${operation.changeId} is not available for preview.`),
		);
	}

	const diagnostics: VcsDiagnostic[] = [];
	if (source.description.trim() === normalizedMessage) {
		diagnostics.push(
			createDiagnostic("info", "jj_message_unchanged", `Change ${operation.changeId} already uses this description.`),
		);
	}

	return {
		valid: true,
		operation: {
			...operation,
			message: normalizedMessage,
		},
		title: `Preview edit message for ${operation.changeId}`,
		description: `Update ${operation.changeId} description to: ${normalizedMessage}`,
		risk: "low",
		commands: [
			{
				command: "jj",
				args: ["describe", "-r", operation.changeId, "-m", normalizedMessage],
			},
		],
		affectedChangeIds: [operation.changeId],
		affectedBookmarks: source.bookmarks,
		diagnostics,
	};
}

function previewCreateChangeOperation(
	operation: VcsCreateChangeOperationInput,
	changes: readonly VcsJjChange[],
): VcsPreviewOperationResult {
	assertSafeChangeId(operation.anchorChangeId);
	const normalizedMessage = operation.message.trim();
	if (normalizedMessage.length === 0) {
		return emptyPreview(
			operation,
			createDiagnostic("error", "jj_message_required", "Enter a non-empty change description before previewing."),
		);
	}

	const anchor = changes.find((change) => change.changeId === operation.anchorChangeId);
	if (!anchor) {
		return emptyPreview(
			operation,
			createDiagnostic(
				"error",
				"jj_anchor_missing",
				`Change ${operation.anchorChangeId} is not available for preview.`,
			),
		);
	}

	const diagnostics: VcsDiagnostic[] = [];
	if (operation.placement === "before" && anchor.parentChangeIds.length === 0) {
		diagnostics.push(
			createDiagnostic(
				"warning",
				"jj_insert_before_root_child",
				`Inserting before ${anchor.changeId} will create a new root-adjacent change.`,
			),
		);
	}

	const relationFlag = operation.placement === "before" ? "--insert-before" : "--insert-after";
	return {
		valid: true,
		operation: {
			...operation,
			message: normalizedMessage,
		},
		title: `Preview create change ${operation.placement} ${operation.anchorChangeId}`,
		description: `Create a new change ${operation.placement} ${operation.anchorChangeId} with description: ${normalizedMessage}`,
		risk: "medium",
		commands: [
			{
				command: "jj",
				args: ["new", relationFlag, operation.anchorChangeId, "--no-edit", "-m", normalizedMessage],
			},
		],
		affectedChangeIds: [operation.anchorChangeId],
		affectedBookmarks: anchor.bookmarks,
		diagnostics,
	};
}

function previewMoveBookmarkOperation(
	operation: VcsMoveBookmarkOperationInput,
	changes: readonly VcsJjChange[],
	bookmarks: Awaited<ReturnType<typeof readJjBookmarks>>,
): VcsPreviewOperationResult {
	if (!isSafeBookmarkName(operation.bookmarkName)) {
		return emptyPreview(
			operation,
			createDiagnostic(
				"error",
				"jj_bookmark_name_invalid",
				`Bookmark ${operation.bookmarkName} contains unsupported characters.`,
			),
		);
	}
	assertSafeChangeId(operation.targetChangeId);

	const bookmark = bookmarks.find((entry) => entry.name === operation.bookmarkName);
	if (!bookmark) {
		return emptyPreview(
			operation,
			createDiagnostic("error", "jj_bookmark_missing", `Bookmark ${operation.bookmarkName} is not available for preview.`),
		);
	}

	const target = changes.find((change) => change.changeId === operation.targetChangeId);
	if (!target) {
		return emptyPreview(
			operation,
			createDiagnostic("error", "jj_target_missing", `Change ${operation.targetChangeId} is not available for preview.`),
		);
	}

	if (bookmark.changeId === operation.targetChangeId) {
		return emptyPreview(
			operation,
			createDiagnostic(
				"error",
				"jj_bookmark_already_targeted",
				`Bookmark ${operation.bookmarkName} already points to ${operation.targetChangeId}.`,
			),
		);
	}

	const diagnostics: VcsDiagnostic[] = [];
	if (!bookmark.synced) {
		diagnostics.push(
			createDiagnostic(
				"info",
				"jj_bookmark_unsynced",
				`Bookmark ${operation.bookmarkName} is not currently synced with its tracked remote.`,
			),
		);
	}

	return {
		valid: true,
		operation,
		title: `Preview move bookmark ${operation.bookmarkName}`,
		description: `Move bookmark ${operation.bookmarkName} to ${operation.targetChangeId}.`,
		risk: "medium",
		commands: [
			{
				command: "jj",
				args: ["bookmark", "move", operation.bookmarkName, "--to", operation.targetChangeId, "--allow-backwards"],
			},
		],
		affectedChangeIds: [bookmark.changeId, operation.targetChangeId],
		affectedBookmarks: [operation.bookmarkName],
		diagnostics,
	};
}

function previewSquashChangeOperation(
	operation: VcsSquashChangeOperationInput,
	changes: readonly VcsJjChange[],
	currentChangeId: string | null,
): VcsPreviewOperationResult {
	assertSafeChangeId(operation.sourceChangeId);
	assertSafeRevisionId(operation.targetChangeId);
	const hasPathSelection = operation.paths !== undefined;
	const normalizedPaths = hasPathSelection
		? [...new Set(operation.paths?.map((path) => path.trim()).filter(Boolean))]
		: [];
	if (hasPathSelection && normalizedPaths.length === 0) {
		return emptyPreview(
			operation,
			createDiagnostic("error", "jj_paths_required", "Choose at least one committed file before previewing."),
		);
	}
	for (const repoPath of normalizedPaths) {
		if (!isSafeRepoPath(repoPath)) {
			return emptyPreview(
				operation,
				createDiagnostic("error", "jj_path_invalid", `File path ${repoPath} contains unsupported characters.`),
			);
		}
	}

	const changesById = new Map(changes.map((change) => [change.changeId, change]));
	const source = changesById.get(operation.sourceChangeId);
	const target =
		operation.targetChangeId === "@"
			? currentChangeId
				? (changesById.get(currentChangeId) ?? {
						changeId: currentChangeId,
						commitId: currentChangeId,
						description: "current working-copy change",
						authorName: null,
						authorEmail: null,
						authorAvatarUrl: null,
						parentChangeIds: [],
						bookmarks: [],
						remoteBookmarks: [],
						isCurrent: true,
					})
				: null
			: changesById.get(operation.targetChangeId);
	if (!source) {
		return emptyPreview(
			operation,
			createDiagnostic("error", "jj_source_missing", `Change ${operation.sourceChangeId} is not available for preview.`),
		);
	}
	if (!target) {
		return emptyPreview(
			operation,
			createDiagnostic("error", "jj_target_missing", `Change ${operation.targetChangeId} is not available for preview.`),
		);
	}
	if (source.changeId === target.changeId) {
		return emptyPreview(
			operation,
			createDiagnostic("error", "jj_same_target", "Source and target changes must be different."),
		);
	}
	if (!operation.allowDescendantTarget && isDescendantChange(changes, source.changeId, target.changeId)) {
		return emptyPreview(
			operation,
			createDiagnostic(
				"error",
				"jj_squash_descendant_target",
				"Cannot squash a change into one of its descendants.",
			),
		);
	}

	const diagnostics: VcsDiagnostic[] = [];
	if (source.isCurrent) {
		diagnostics.push(
			createDiagnostic(
				"warning",
				"jj_squash_current_source",
				`Squashing ${source.changeId} will replace the current working-copy change.`,
			),
		);
	}
	if (source.bookmarks.length > 0) {
		diagnostics.push(
			createDiagnostic(
				"warning",
				"jj_squash_bookmarked_source",
				`Squashing ${source.changeId} will move or remove bookmark associations: ${source.bookmarks.join(", ")}.`,
			),
		);
	}
	if (normalizedPaths.length > 1) {
		diagnostics.push(
			createDiagnostic(
				"info",
				"jj_squash_multiple_paths",
				`Squash will move ${normalizedPaths.length} selected files into ${target.changeId}.`,
			),
		);
	}

	return {
		valid: true,
		operation: normalizedPaths.length > 0 ? { ...operation, paths: normalizedPaths } : operation,
		title:
			normalizedPaths.length > 0
				? `Preview move files from ${operation.sourceChangeId} into ${operation.targetChangeId}`
				: `Preview squash ${operation.sourceChangeId} into ${operation.targetChangeId}`,
		description:
			normalizedPaths.length > 0
				? `Move ${normalizedPaths.join(", ")} from ${operation.sourceChangeId} into ${operation.targetChangeId}. The source change will be abandoned if it becomes empty.`
				: `Squash ${operation.sourceChangeId} into ${operation.targetChangeId}. The source change will be abandoned if it becomes empty.`,
		risk: "high",
		commands: [
			{
				command: "jj",
				args: ["squash", "--from", operation.sourceChangeId, "--into", operation.targetChangeId, ...normalizedPaths],
			},
		],
		affectedChangeIds: [operation.sourceChangeId, target.changeId],
		affectedBookmarks: [...new Set([...source.bookmarks, ...target.bookmarks])],
		diagnostics,
	};
}

function previewSplitChangeOperation(
	operation: VcsSplitChangeOperationInput,
	changes: readonly VcsJjChange[],
): VcsPreviewOperationResult {
	assertSafeChangeId(operation.changeId);
	const normalizedMessage = operation.message.trim();
	if (normalizedMessage.length === 0) {
		return emptyPreview(
			operation,
			createDiagnostic("error", "jj_message_required", "Enter a non-empty change description before previewing."),
		);
	}
	const normalizedPaths = [...new Set(operation.paths.map((path) => path.trim()).filter(Boolean))];
	if (normalizedPaths.length === 0) {
		return emptyPreview(
			operation,
			createDiagnostic("error", "jj_paths_required", "Choose at least one committed file before previewing."),
		);
	}
	for (const repoPath of normalizedPaths) {
		if (!isSafeRepoPath(repoPath)) {
			return emptyPreview(
				operation,
				createDiagnostic("error", "jj_path_invalid", `File path ${repoPath} contains unsupported characters.`),
			);
		}
	}
	const source = changes.find((change) => change.changeId === operation.changeId);
	if (!source) {
		return emptyPreview(
			operation,
			createDiagnostic("error", "jj_source_missing", `Change ${operation.changeId} is not available for preview.`),
		);
	}
	const diagnostics: VcsDiagnostic[] = [];
	if (source.bookmarks.length > 0) {
		diagnostics.push(
			createDiagnostic(
				"warning",
				"jj_split_bookmarked_source",
				`Splitting ${source.changeId} may move bookmark associations: ${source.bookmarks.join(", ")}.`,
			),
		);
	}
	return {
		valid: true,
		operation: {
			...operation,
			message: normalizedMessage,
			paths: normalizedPaths,
		},
		title: `Preview split ${operation.changeId}`,
		description: `Split ${normalizedPaths.join(", ")} out of ${operation.changeId} with description: ${normalizedMessage}`,
		risk: "high",
		commands: [
			{
				command: "jj",
				args: ["split", "-r", operation.changeId, "-m", normalizedMessage, "--", ...normalizedPaths],
			},
		],
		affectedChangeIds: [operation.changeId],
		affectedBookmarks: source.bookmarks,
		diagnostics,
	};
}

async function previewAbsorbFileOperation(
	operation: VcsAbsorbFileOperationInput,
	currentChangeId: string | null,
	changes: readonly VcsJjChange[],
	unassignedPathSetPromise: Promise<Set<string>>,
): Promise<VcsPreviewOperationResult> {
	assertSafeChangeId(operation.targetChangeId);
	const normalizedPaths = [...new Set(operation.paths.map((path) => path.trim()).filter(Boolean))];
	if (normalizedPaths.length === 0) {
		return emptyPreview(
			operation,
			createDiagnostic("error", "jj_paths_required", "Choose at least one working-copy file before previewing."),
		);
	}
	for (const repoPath of normalizedPaths) {
		if (!isSafeRepoPath(repoPath)) {
			return emptyPreview(
				operation,
				createDiagnostic("error", "jj_path_invalid", `File path ${repoPath} contains unsupported characters.`),
			);
		}
	}

	const target = changes.find((change) => change.changeId === operation.targetChangeId);
	if (!target) {
		return emptyPreview(
			operation,
			createDiagnostic("error", "jj_target_missing", `Change ${operation.targetChangeId} is not available for preview.`),
		);
	}
	if (currentChangeId && target.changeId === currentChangeId) {
		return emptyPreview(
			operation,
			createDiagnostic("error", "jj_absorb_current_target", "Choose an ancestor change instead of the current working-copy change."),
		);
	}
	if (currentChangeId && !isAncestorChange(changes, currentChangeId, target.changeId)) {
		return emptyPreview(
			operation,
			createDiagnostic(
				"error",
				"jj_absorb_non_ancestor_target",
				`Change ${target.changeId} is not an ancestor of the current working-copy change.`,
			),
		);
	}

	const unassignedPathSet = await unassignedPathSetPromise;
	const missingPaths = normalizedPaths.filter((repoPath) => !unassignedPathSet.has(repoPath));
	if (missingPaths.length > 0) {
		return emptyPreview(
			operation,
			createDiagnostic(
				"error",
				"jj_absorb_paths_missing",
				`Working-copy files are no longer available: ${missingPaths.join(", ")}.`,
			),
		);
	}

	const diagnostics: VcsDiagnostic[] = [];
	if (normalizedPaths.length > 1) {
		diagnostics.push(
			createDiagnostic(
				"info",
				"jj_absorb_multiple_paths",
				`Absorb will try to move ${normalizedPaths.length} selected files into ${target.changeId}.`,
			),
		);
	}
	if (target.bookmarks.length > 0) {
		diagnostics.push(
			createDiagnostic(
				"info",
				"jj_absorb_target_bookmarks",
				`Target ${target.changeId} currently carries bookmarks: ${target.bookmarks.join(", ")}.`,
			),
		);
	}

	return {
		valid: true,
		operation: {
			...operation,
			paths: normalizedPaths,
		},
		title: `Preview absorb into ${target.changeId}`,
		description: `Absorb ${normalizedPaths.join(", ")} into ${target.changeId}. JJ will leave ambiguous hunks in the working-copy change.`,
		risk: "medium",
		commands: [
			{
				command: "jj",
				args: ["absorb", "--from", "@", "--into", target.changeId, "--", ...normalizedPaths],
			},
		],
		affectedChangeIds: currentChangeId ? [currentChangeId, target.changeId] : [target.changeId],
		affectedBookmarks: target.bookmarks,
		diagnostics,
	};
}

async function previewRestoreFileOperation(
	operation: VcsRestoreFileOperationInput,
	currentChangeId: string | null,
	unassignedPathSetPromise: Promise<Set<string>>,
): Promise<VcsPreviewOperationResult> {
	const normalizedPaths = [...new Set(operation.paths.map((path) => path.trim()).filter(Boolean))];
	if (normalizedPaths.length === 0) {
		return emptyPreview(
			operation,
			createDiagnostic("error", "jj_paths_required", "Choose at least one working-copy file before previewing."),
		);
	}
	for (const repoPath of normalizedPaths) {
		if (!isSafeRepoPath(repoPath)) {
			return emptyPreview(
				operation,
				createDiagnostic("error", "jj_path_invalid", `File path ${repoPath} contains unsupported characters.`),
			);
		}
	}

	const unassignedPathSet = await unassignedPathSetPromise;
	const missingPaths = normalizedPaths.filter((repoPath) => !unassignedPathSet.has(repoPath));
	if (missingPaths.length > 0) {
		return emptyPreview(
			operation,
			createDiagnostic(
				"error",
				"jj_restore_paths_missing",
				`Working-copy files are no longer available: ${missingPaths.join(", ")}.`,
			),
		);
	}

	const diagnostics: VcsDiagnostic[] = [];
	if (normalizedPaths.length > 1) {
		diagnostics.push(
			createDiagnostic(
				"info",
				"jj_restore_multiple_paths",
				`Restore will discard working-copy changes from ${normalizedPaths.length} selected files.`,
			),
		);
	}

	return {
		valid: true,
		operation: {
			...operation,
			paths: normalizedPaths,
		},
		title: `Preview restore ${normalizedPaths.join(", ")}`,
		description: `Restore ${normalizedPaths.join(", ")} from the parent into the current working-copy change.`,
		risk: "medium",
		commands: [
			{
				command: "jj",
				args: ["restore", "--", ...normalizedPaths],
			},
		],
		affectedChangeIds: currentChangeId ? [currentChangeId] : [],
		affectedBookmarks: [],
		diagnostics,
	};
}

function previewAbandonChangeOperation(
	operation: VcsAbandonChangeOperationInput,
	changes: readonly VcsJjChange[],
): VcsPreviewOperationResult {
	assertSafeChangeId(operation.changeId);
	const source = changes.find((change) => change.changeId === operation.changeId);
	if (!source) {
		return emptyPreview(
			operation,
			createDiagnostic("error", "jj_source_missing", `Change ${operation.changeId} is not available for preview.`),
		);
	}

	const diagnostics: VcsDiagnostic[] = [];
	if (source.isCurrent) {
		diagnostics.push(
			createDiagnostic(
				"warning",
				"jj_abandon_current",
				`Change ${operation.changeId} is the current working-copy change and will be replaced.`,
			),
		);
	}
	if (source.bookmarks.length > 0) {
		diagnostics.push(
			createDiagnostic(
				"warning",
				"jj_abandon_bookmarked",
				`Change ${operation.changeId} still has bookmarks attached: ${source.bookmarks.join(", ")}.`,
			),
		);
	}

	return {
		valid: true,
		operation,
		title: `Preview abandon ${operation.changeId}`,
		description: `Abandon change ${operation.changeId}. Descendants will be rebased by JJ as needed.`,
		risk: "high",
		commands: [
			{
				command: "jj",
				args: ["abandon", operation.changeId],
			},
		],
		affectedChangeIds: [operation.changeId],
		affectedBookmarks: source.bookmarks,
		diagnostics,
	};
}

function previewUndoLastOperation(
	operation: VcsUndoLastOperationInput,
	currentChangeId: string | null,
): VcsPreviewOperationResult {
	return {
		valid: true,
		operation,
		title: "Preview JJ undo",
		description:
			"Undo the most recent JJ operation in this repository. If another JJ command ran after the last Changeyard mutation, JJ will undo that newer operation instead.",
		risk: "high",
		commands: [
			{
				command: "jj",
				args: ["undo"],
			},
		],
		affectedChangeIds: currentChangeId ? [currentChangeId] : [],
		affectedBookmarks: [],
		diagnostics: [
			createDiagnostic(
				"warning",
				"jj_undo_repo_scope",
				"JJ undo affects the latest repository operation, not only Changeyard-initiated commands.",
			),
		],
	};
}

function previewRedoLastOperation(
	operation: VcsRedoLastOperationInput,
	currentChangeId: string | null,
): VcsPreviewOperationResult {
	return {
		valid: true,
		operation,
		title: "Preview JJ redo",
		description:
			"Redo the most recently undone JJ operation in this repository. Use this after a JJ undo if you need to restore that operation again.",
		risk: "medium",
		commands: [
			{
				command: "jj",
				args: ["redo"],
			},
		],
		affectedChangeIds: currentChangeId ? [currentChangeId] : [],
		affectedBookmarks: [],
		diagnostics: [
			createDiagnostic(
				"info",
				"jj_redo_repo_scope",
				"JJ redo reapplies the most recently undone repository operation when one is available.",
			),
		],
	};
}

function buildReorderPreview(
	operation: VcsReorderOperationInput,
	source: VcsJjChange,
	target: VcsJjChange,
	bookmarks: Awaited<ReturnType<typeof readJjBookmarks>>,
	changes: readonly VcsJjChange[],
): VcsPreviewOperationResult {
	const diagnostics: VcsDiagnostic[] = [];
	let destination = target.changeId;

	if (isDescendantChange(changes, source.changeId, target.changeId)) {
		return emptyPreview(
			operation,
			createDiagnostic(
				"error",
				"jj_descendant_target",
				`Cannot preview moving ${source.changeId} onto descendant ${target.changeId}.`,
			),
		);
	}

	if (operation.placement === "before") {
		const parentId = target.parentChangeIds[0] ?? null;
		if (!parentId) {
			return emptyPreview(
				operation,
				createDiagnostic("error", "jj_before_root", `Cannot preview moving ${source.changeId} before a root change.`),
			);
		}
		destination = parentId;
		if (target.parentChangeIds.length > 1) {
			diagnostics.push(
				createDiagnostic(
					"warning",
					"jj_multi_parent_target",
					`Target ${target.changeId} has multiple parents. Preview uses the primary parent path only.`,
				),
			);
		}
	}

	const sourceBookmarks = bookmarks.filter((bookmark) => bookmark.changeId === source.changeId).map((bookmark) => bookmark.name);
	if (sourceBookmarks.length > 0) {
		diagnostics.push(
			createDiagnostic(
				"info",
				"jj_bookmarks_move_with_change",
				`Bookmarks attached to ${source.changeId} will follow the rebased change when this mutation is later enabled.`,
			),
		);
	}
	if (source.parentChangeIds[0] !== target.parentChangeIds[0]) {
		diagnostics.push(
			createDiagnostic(
				"warning",
				"jj_cross_lane_move",
				`This preview crosses stack paths. Review the rebased descendants carefully before applying the eventual mutation.`,
			),
		);
	}

	return {
		valid: true,
		operation,
		title:
			operation.placement === "before"
				? `Preview move ${source.changeId} before ${target.changeId}`
				: `Preview move ${source.changeId} after ${target.changeId}`,
		description:
			operation.placement === "before"
				? `Rebase ${source.changeId} onto ${destination} so it appears before ${target.changeId}.`
				: `Rebase ${source.changeId} onto ${destination} so it appears after ${target.changeId}.`,
		risk: sourceBookmarks.length > 0 || diagnostics.some((entry) => entry.level === "warning") ? "medium" : "low",
		commands: [
			{
				command: "jj",
				args: ["rebase", "-s", source.changeId, "-d", destination],
			},
		],
		affectedChangeIds: [source.changeId, target.changeId],
		affectedBookmarks: sourceBookmarks,
		diagnostics,
	};
}

function isDescendantChange(changes: readonly VcsJjChange[], sourceChangeId: string, targetChangeId: string): boolean {
	const changesById = new Map(changes.map((change) => [change.changeId, change]));
	let current = changesById.get(targetChangeId) ?? null;
	const seen = new Set<string>();
	while (current) {
		if (seen.has(current.changeId)) {
			return false;
		}
		seen.add(current.changeId);
		if (current.parentChangeIds.includes(sourceChangeId)) {
			return true;
		}
		const nextParentId = current.parentChangeIds[0] ?? null;
		current = nextParentId ? (changesById.get(nextParentId) ?? null) : null;
	}
	return false;
}

function isAncestorChange(changes: readonly VcsJjChange[], sourceChangeId: string, candidateAncestorId: string): boolean {
	if (sourceChangeId === candidateAncestorId) {
		return true;
	}
	const changesById = new Map(changes.map((change) => [change.changeId, change]));
	let current = changesById.get(sourceChangeId) ?? null;
	const seen = new Set<string>();
	while (current) {
		if (seen.has(current.changeId)) {
			return false;
		}
		seen.add(current.changeId);
		if (current.parentChangeIds.includes(candidateAncestorId)) {
			return true;
		}
		const nextParentId = current.parentChangeIds[0] ?? null;
		current = nextParentId ? (changesById.get(nextParentId) ?? null) : null;
	}
	return false;
}
