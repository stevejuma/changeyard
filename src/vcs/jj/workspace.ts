import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectVcsState, type VcsCommandRunner } from "../detect.js";
import type {
	VcsApplyOperationResult,
	VcsDiagnostic,
	VcsJjDiffResult,
	VcsJjStateResult,
	VcsPreviewOperationInput,
	VcsPreviewOperationResult,
} from "../types.js";
import { applyJjOperation } from "./apply.js";
import { loadJjDiff } from "./diff.js";
import { previewJjOperation } from "./preview.js";
import { loadJjState, type LoadJjStateOptions } from "./state.js";
import type { NeutralFileStatus, NeutralOperation, NeutralOperationRequest, NeutralSelection } from "../workspace-types.js";

type JjHunkSelection = NonNullable<NeutralSelection["hunks"]>[number];
type JjRestoreDiscardOperation = Extract<NeutralOperation, { kind: "restore_changes" | "discard_changes" }>;
type JjWorkingCopyHunkRestoreDiscardOperation = JjRestoreDiscardOperation & {
	selection: NeutralSelection & { source: "working_copy"; hunks: JjHunkSelection[] };
};
type JjCommittedHunkDiscardOperation = JjRestoreDiscardOperation & {
	selection: NeutralSelection & { source: "commit"; hunks: JjHunkSelection[] };
};

type JjPatchFile = {
	path: string;
	headerLines: string[];
	hunks: JjPatchHunk[];
};

type JjPatchHunk = {
	id: string;
	oldStart: number;
	oldLines: number;
	newStart: number;
	newLines: number;
	lines: string[];
};

function createDiagnostic(level: VcsDiagnostic["level"], code: string, message: string): VcsDiagnostic {
	return { level, code, message };
}

function workspaceCapabilities() {
	return {
		supportsMultiAppliedWorkspace: true,
		supportsHunkSelection: false,
		supportsHunkRestoreDiscard: true,
		supportsCommittedHunkSelection: true,
		supportsCommitRewrite: true,
		supportsMoveCommitAcrossStacks: true,
		supportsMoveChangesAcrossCommits: true,
		supportsUndoRedo: true,
		supportsSyntheticWorkspaceMerge: false,
		supportsCreateStack: false,
		supportsWorkingCopyCommit: false,
	};
}

function workingCopySummary(files: Array<{ status: NeutralFileStatus }>) {
	const summary = {
		modified: 0,
		added: 0,
		deleted: 0,
		renamed: 0,
		copied: 0,
		unknown: 0,
	};
	for (const file of files) {
		summary[file.status] += 1;
	}
	return summary;
}

function normalizeDescription(description: string): { title: string; body: string } {
	const trimmed = description.trim();
	if (!trimmed) {
		return { title: "(no description)", body: "" };
	}
	const [title = trimmed, ...body] = trimmed.split("\n");
	return { title, body: body.join("\n").trim() };
}

function toWorkspaceFile(path: string, status: NeutralFileStatus) {
	return {
		path,
		status,
	};
}

async function readJjWorkspaceConflicts(cwd: string, runner: VcsCommandRunner) {
	const result = await runner({
		command: "jj",
		args: [
			"log",
			"--ignore-working-copy",
			"--at-op=@",
			"--revisions",
			"conflicts()",
			"--no-graph",
			"--template",
			'change_id.shortest(12) ++ "\\t" ++ commit_id.shortest(12) ++ "\\t" ++ description.first_line().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\n"',
		],
		cwd,
	});
	if (!result.ok) {
		return [];
	}
	return result.stdout
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => {
			const [changeId, commitId, title] = line.split("\t");
			return changeId && commitId
				? {
						changeId,
						commitId,
						title: title?.trim() || null,
					}
				: null;
		})
		.filter((entry): entry is { changeId: string; commitId: string; title: string | null } => Boolean(entry));
}

export async function loadJjWorkspaceState(
	cwd: string,
	runner: VcsCommandRunner,
	options: LoadJjStateOptions & { appliedStackIds?: string[] } = {},
) {
	const state = await loadJjState(cwd, runner, options);
	const repoCwd = state.repository.root ?? cwd;
	const conflictChanges = await readJjWorkspaceConflicts(repoCwd, runner);
	const appliedStackIds = options.appliedStackIds ?? [];
	const changesById = new Map(state.changes.map((change) => [change.changeId, change]));
	const stacks = state.stacks.map((stack) => ({
		stackId: stack.id,
		name: stack.id,
		targetRef: stack.tip,
		baseRef: stack.base,
		headCommitId: stack.heads[0]?.changeId ?? stack.changes.at(-1)?.changeId ?? null,
		isApplied: appliedStackIds.includes(stack.id),
		isCurrent: stack.isCheckedOut,
		commits: stack.changes.map((change) => {
			const description = normalizeDescription(change.title);
			return {
				commitId: change.changeId,
				displayId: change.commitId,
				title: description.title,
				description: description.body,
				authorName: change.authorName,
				authorEmail: change.authorEmail,
				authorAvatarUrl: change.authorAvatarUrl,
				timestamp: null,
				parentCommitIds: changesById.get(change.changeId)?.parentChangeIds ?? [],
				stackIds: [stack.id],
				isHead: change.isHead,
				isCurrent: change.isCurrent,
				metadata: {
					changeId: change.changeId,
					commitHash: change.commitId,
					bookmarks: change.bookmarks,
					remoteBookmarks: change.remoteBookmarks,
				},
			};
		}),
		metadata: {
			tip: stack.tip,
			base: stack.base,
			headChangeIds: stack.heads.map((head) => head.changeId),
			headCommitHashes: stack.heads.map((head) => head.commitId),
		},
	}));
	const stackIdsByCommitId = new Map<string, string[]>();
	for (const stack of stacks) {
		for (const commit of stack.commits) {
			stackIdsByCommitId.set(commit.commitId, [
				...(stackIdsByCommitId.get(commit.commitId) ?? []),
				stack.stackId,
			]);
		}
	}
	const conflicts = conflictChanges.map((conflict) => ({
		id: `jj-conflict-${conflict.changeId}`,
		path: null,
		message: conflict.title
			? `JJ conflict in ${conflict.title}.`
			: `JJ conflict in change ${conflict.changeId}.`,
		commitIds: [conflict.changeId],
		stackIds: stackIdsByCommitId.get(conflict.changeId) ?? [],
	}));
	const workingCopyFiles = state.unassignedChanges.map((change) => toWorkspaceFile(change.path, change.status));
	return {
		projectId: cwd,
		provider: "jj" as const,
		targetRef: options.targetBranch ?? state.jj.defaultBase ?? state.git.defaultBranch ?? "",
		headId: state.jj.currentChangeId,
		mode: conflicts.length > 0 ? "conflicted" as const : "normal" as const,
		capabilities: workspaceCapabilities(),
		stacks,
		appliedStackIds,
		workingCopy: {
			files: workingCopyFiles,
			hasConflicts: conflicts.length > 0,
			summary: workingCopySummary(workingCopyFiles),
		},
		conflicts,
	};
}

export async function loadJjWorkspaceStacks(
	cwd: string,
	runner: VcsCommandRunner,
	options: LoadJjStateOptions & { appliedStackIds?: string[] } = {},
) {
	const state = await loadJjWorkspaceState(cwd, runner, options);
	return { stacks: state.stacks };
}

export async function loadJjWorkspaceDiff(cwd: string, runner: VcsCommandRunner) {
	const diff = await loadJjDiff(cwd, runner);
	return toNeutralDiff(diff);
}

export async function previewJjWorkspaceOperation(
	cwd: string,
	input: NeutralOperationRequest,
	runner: VcsCommandRunner,
) {
	if (input.operation.kind === "apply_stack" || input.operation.kind === "unapply_stack") {
		return await workspaceMembershipPreview(cwd, runner, input.operation);
	}
	if (isJjCommittedHunkDiscardOperation(input.operation)) {
		const validation = await validateJjCommittedHunkDiscardOperation(cwd, runner, input.operation);
		if (validation) {
			return unsupportedPreview(input.operation, validation);
		}
		const sourceCommitId = input.operation.selection.commitId ?? null;
		return {
			valid: true,
			operation: input.operation,
			title: "Discard selected hunks",
			summary: `Remove ${input.operation.selection.hunks?.length ?? 0} selected hunk(s) from ${sourceCommitId ?? "the source commit"}.`,
			risk: "high" as const,
			disabledReason: null,
			warnings: [
				{
					code: "jj_committed_hunk_discard",
					message: "This rewrites the source change by moving selected hunks into a temporary change and abandoning it.",
				},
			],
			conflicts: [],
			affectedStackIds: [],
			affectedCommitIds: commitIdsFromOperation(input.operation),
			affectedPaths: pathsFromOperation(input.operation),
			diagnostics: [],
		};
	}
	if (isJjCommittedHunkRewriteOperation(input.operation)) {
		const validation = await validateJjCommittedHunkOperation(cwd, runner, input.operation);
		if (validation) {
			return unsupportedPreview(input.operation, validation);
		}
		const sourceCommitId = sourceCommitIdForCommittedHunkOperation(input.operation);
		return {
			valid: true,
			operation: input.operation,
			title: titleForCommittedHunkOperation(input.operation),
			summary: summaryForCommittedHunkOperation(input.operation, sourceCommitId),
			risk: "high" as const,
			disabledReason: null,
			warnings: [
				{
					code: "jj_committed_hunk_rewrite",
					message: "This uses JJ's diff editor flow to rewrite only the selected committed hunks.",
				},
			],
			conflicts: [],
			affectedStackIds: [],
			affectedCommitIds: commitIdsFromOperation(input.operation),
			affectedPaths: pathsFromOperation(input.operation),
			diagnostics: [],
		};
	}
	if (isJjHunkRestoreDiscardOperation(input.operation)) {
		const validation = await validateJjWorkingCopyHunkOperation(cwd, runner, input.operation);
		if (validation) {
			return unsupportedPreview(input.operation, validation);
		}
		const action = input.operation.kind === "restore_changes" ? "Restore changes" : "Discard changes";
		return {
			valid: true,
			operation: input.operation,
			title: action,
			summary: `${action} for ${input.operation.selection.hunks?.length ?? 0} selected working-copy hunk(s).`,
			risk: "high" as const,
			disabledReason: null,
			warnings: [
				{
					code: "jj_hunk_restore",
					message: "This applies the selected reverse patch to the working tree.",
				},
			],
			conflicts: [],
			affectedStackIds: [],
			affectedCommitIds: [],
			affectedPaths: pathsFromOperation(input.operation),
			diagnostics: [],
		};
	}
	const translated = await translateOperation(cwd, runner, input.operation);
	if (!translated.operation) {
		return unsupportedPreview(input.operation, translated.reason);
	}
	const preview = await previewJjOperation(cwd, translated.operation, runner);
	return toNeutralPreview(input.operation, preview);
}

export async function applyJjWorkspaceOperation(
	cwd: string,
	input: NeutralOperationRequest,
	runner: VcsCommandRunner,
) {
	if (input.operation.kind === "apply_stack" || input.operation.kind === "unapply_stack") {
		return await workspaceMembershipApply(cwd, runner, input.operation);
	}
	if (isJjCommittedHunkDiscardOperation(input.operation)) {
		const validation = await validateJjCommittedHunkDiscardOperation(cwd, runner, input.operation);
		if (validation) {
			return unsupportedApply(input.operation, validation);
		}
		const patch = await buildSelectedJjCommittedHunkPatch(cwd, runner, input.operation);
		if (!patch.ok) {
			return unsupportedApply(input.operation, patch.reason);
		}
		const applyResult = await discardJjCommittedHunksWithTemporaryChange(patch.repoCwd, runner, input.operation, patch);
		if (!applyResult.ok) {
			return failedApply(
				input.operation,
				applyResult.stderr.trim() || applyResult.stdout.trim() || "Could not discard selected JJ committed hunks.",
			);
		}
		return {
			ok: true,
			operation: input.operation,
			title: "Discarded selected hunks",
			summary: `Removed ${input.operation.selection.hunks?.length ?? 0} selected hunk(s) from ${input.operation.selection.commitId ?? "the source commit"}.`,
			affectedStackIds: [],
			affectedCommitIds: commitIdsFromOperation(input.operation),
			affectedPaths: pathsFromOperation(input.operation),
			recovery: null,
			diagnostics: [],
		};
	}
	if (isJjCommittedHunkRewriteOperation(input.operation)) {
		const validation = await validateJjCommittedHunkOperation(cwd, runner, input.operation);
		if (validation) {
			return unsupportedApply(input.operation, validation);
		}
		const patch = await buildSelectedJjCommittedHunkPatch(cwd, runner, input.operation);
		if (!patch.ok) {
			return unsupportedApply(input.operation, patch.reason);
		}
		const applyResult = await applyJjCommittedHunkOperationWithEditor(patch.repoCwd, runner, input.operation, patch);
		if (!applyResult.ok) {
			return failedApply(
				input.operation,
				applyResult.stderr.trim() || applyResult.stdout.trim() || "Could not rewrite selected JJ committed hunks.",
			);
		}
		return {
			ok: true,
			operation: input.operation,
			title: appliedTitleForCommittedHunkOperation(input.operation),
			summary: summaryForCommittedHunkOperation(input.operation, sourceCommitIdForCommittedHunkOperation(input.operation)),
			affectedStackIds: [],
			affectedCommitIds: commitIdsFromOperation(input.operation),
			affectedPaths: pathsFromOperation(input.operation),
			recovery: null,
			diagnostics: [],
		};
	}
	if (isJjHunkRestoreDiscardOperation(input.operation)) {
		const validation = await validateJjWorkingCopyHunkOperation(cwd, runner, input.operation);
		if (validation) {
			return unsupportedApply(input.operation, validation);
		}
		const patch = await buildSelectedJjWorkingCopyHunkPatch(cwd, runner, input.operation.selection.hunks ?? []);
		if (!patch.ok) {
			return unsupportedApply(input.operation, patch.reason);
		}
		const applyResult = await runner({
			command: "git",
			args: ["apply", "--reverse", "--whitespace=nowarn", "-"],
			cwd: patch.repoCwd,
			stdin: patch.patch,
		});
		if (!applyResult.ok) {
			return unsupportedApply(input.operation, applyResult.stderr.trim() || "Could not restore selected JJ working-copy hunks.");
		}
		const action = input.operation.kind === "restore_changes" ? "Restored changes" : "Discarded changes";
		return {
			ok: true,
			operation: input.operation,
			title: action,
			summary: `${action} for ${input.operation.selection.hunks?.length ?? 0} selected working-copy hunk(s).`,
			affectedStackIds: [],
			affectedCommitIds: [],
			affectedPaths: pathsFromOperation(input.operation),
			recovery: null,
			diagnostics: [],
		};
	}
	const translated = await translateOperation(cwd, runner, input.operation);
	if (!translated.operation) {
		return unsupportedApply(input.operation, translated.reason);
	}
	const result = await applyJjOperation(cwd, translated.operation, runner);
	return toNeutralApply(input.operation, result);
}

function toNeutralDiff(diff: VcsJjDiffResult) {
	return {
		ok: diff.diagnostics.every((diagnostic) => diagnostic.level !== "error"),
		summary: diff.summary,
		patch: diff.patch,
		files: [],
		diagnostics: diff.diagnostics,
	};
}

async function translateOperation(
	cwd: string,
	runner: VcsCommandRunner,
	operation: NeutralOperation,
): Promise<{ operation: VcsPreviewOperationInput | null; reason: string }> {
	if (operation.kind !== "undo" && operation.kind !== "redo" && "selection" in operation && operation.selection?.hunks?.length) {
		return {
			operation: null,
			reason: "JJ hunk-level workspace operations are not implemented yet.",
		};
	}

	switch (operation.kind) {
		case "reword_commit":
			return {
				operation: { kind: "edit_message", changeId: operation.commitId, message: operation.message },
				reason: "",
			};
		case "amend_commit": {
			const paths = operation.selection.paths ?? [];
			if (operation.selection.source !== "working_copy" || paths.length === 0) {
				return {
					operation: null,
					reason: "JJ amend currently supports selected working-copy files only.",
				};
			}
			return {
				operation: { kind: "absorb_file", targetChangeId: operation.commitId, paths },
				reason: "",
			};
		}
		case "squash_commits":
			return {
				operation: {
					kind: "squash_change",
					sourceChangeId: operation.sourceCommitId,
					targetChangeId: operation.targetCommitId,
				},
				reason: "",
			};
		case "split_commit": {
			const paths = operation.selection.paths ?? [];
			if (operation.selection.source !== "commit" || operation.selection.commitId !== operation.commitId || paths.length === 0) {
				return {
					operation: null,
					reason: "JJ split currently supports selected files from the source commit only.",
				};
			}
			return {
				operation: {
					kind: "split_change",
					changeId: operation.commitId,
					message: operation.message,
					paths,
				},
				reason: "",
			};
		}
		case "move_commit": {
			const targetChangeId = await resolveMoveCommitTargetChangeId(cwd, runner, operation);
			if (!targetChangeId) {
				return {
					operation: null,
					reason: `JJ move commit could not resolve target stack ${operation.targetStackId}.`,
				};
			}
			return {
				operation: {
					kind: "reorder_change",
					sourceChangeId: operation.commitId,
					targetChangeId,
					placement: operation.position?.placement ?? "after",
				},
				reason: "",
			};
		}
		case "move_changes": {
			const paths = operation.selection.paths ?? [];
			if (operation.selection.source !== "commit" || !operation.selection.commitId || paths.length === 0) {
				return {
					operation: null,
					reason: "JJ move changes currently supports selected committed files only.",
				};
			}
			return {
				operation: {
					kind: "squash_change",
					sourceChangeId: operation.selection.commitId,
					targetChangeId: operation.targetCommitId,
					paths,
				},
				reason: "",
			};
		}
		case "restore_changes": {
			const paths = operation.selection.paths ?? [];
			if (operation.selection.source !== "working_copy" || paths.length === 0) {
				return {
					operation: null,
					reason: "JJ restore currently supports selected working-copy files only.",
				};
			}
			return { operation: { kind: "restore_file", paths }, reason: "" };
		}
		case "discard_changes": {
			const paths = operation.selection.paths ?? [];
			if (operation.selection.source !== "working_copy" || paths.length === 0) {
				return {
					operation: null,
					reason: "JJ discard currently supports selected working-copy files only.",
				};
			}
			return { operation: { kind: "restore_file", paths }, reason: "" };
		}
		case "uncommit_changes": {
			const paths = operation.selection.paths ?? [];
			if (operation.selection.source !== "commit" || !operation.selection.commitId || paths.length === 0) {
				return {
					operation: null,
					reason: "JJ uncommit currently supports selected committed files only.",
				};
			}
			return {
				operation: {
					kind: "squash_change",
					sourceChangeId: operation.selection.commitId,
					targetChangeId: "@",
					paths,
					allowDescendantTarget: true,
				},
				reason: "",
			};
		}
		case "undo":
			return { operation: { kind: "undo_last" }, reason: "" };
		case "redo":
			return { operation: { kind: "redo_last" }, reason: "" };
		case "apply_stack":
		case "unapply_stack":
		case "create_stack":
		case "create_commit":
			return {
				operation: null,
				reason: `JJ ${operation.kind.replaceAll("_", " ")} is not implemented in the neutral workspace engine yet.`,
			};
	}
}

async function resolveMoveCommitTargetChangeId(
	cwd: string,
	runner: VcsCommandRunner,
	operation: Extract<NeutralOperation, { kind: "move_commit" }>,
): Promise<string | null> {
	const explicitTarget = operation.position?.relativeToCommitId?.trim();
	if (explicitTarget) {
		return explicitTarget;
	}
	const state = await loadJjWorkspaceState(cwd, runner);
	const stack = state.stacks.find((candidate) => candidate.stackId === operation.targetStackId);
	return stack?.headCommitId ?? stack?.commits.at(-1)?.commitId ?? null;
}

function isJjHunkRestoreDiscardOperation(
	operation: NeutralOperation,
): operation is JjWorkingCopyHunkRestoreDiscardOperation {
	return (
		(operation.kind === "restore_changes" || operation.kind === "discard_changes") &&
		operation.selection.source === "working_copy" &&
		Boolean(operation.selection.hunks?.length)
	);
}

function isJjCommittedHunkRewriteOperation(
	operation: NeutralOperation,
): operation is Extract<NeutralOperation, { kind: "split_commit" | "move_changes" | "uncommit_changes" }> {
	return (
		(operation.kind === "split_commit" || operation.kind === "move_changes" || operation.kind === "uncommit_changes") &&
		operation.selection.source === "commit" &&
		Boolean(operation.selection.hunks?.length)
	);
}

function isJjCommittedHunkDiscardOperation(
	operation: NeutralOperation,
): operation is JjCommittedHunkDiscardOperation {
	return (
		(operation.kind === "restore_changes" || operation.kind === "discard_changes") &&
		operation.selection.source === "commit" &&
		Boolean(operation.selection.hunks?.length)
	);
}

function sourceCommitIdForCommittedHunkOperation(
	operation: Extract<NeutralOperation, { kind: "split_commit" | "move_changes" | "uncommit_changes" }>,
): string | null {
	if (operation.kind === "split_commit") {
		return operation.commitId;
	}
	return operation.selection.commitId ?? null;
}

function titleForCommittedHunkOperation(
	operation: Extract<NeutralOperation, { kind: "split_commit" | "move_changes" | "uncommit_changes" }>,
): string {
	switch (operation.kind) {
		case "split_commit":
			return "Split selected hunks";
		case "move_changes":
			return "Move selected hunks";
		case "uncommit_changes":
			return "Uncommit selected hunks";
	}
}

function appliedTitleForCommittedHunkOperation(
	operation: Extract<NeutralOperation, { kind: "split_commit" | "move_changes" | "uncommit_changes" }>,
): string {
	switch (operation.kind) {
		case "split_commit":
			return "Split selected hunks";
		case "move_changes":
			return "Moved selected hunks";
		case "uncommit_changes":
			return "Uncommitted selected hunks";
	}
}

function summaryForCommittedHunkOperation(
	operation: Extract<NeutralOperation, { kind: "split_commit" | "move_changes" | "uncommit_changes" }>,
	sourceCommitId: string | null,
): string {
	const count = operation.selection.hunks?.length ?? 0;
	switch (operation.kind) {
		case "split_commit":
			return `Split ${count} selected hunk(s) out of ${sourceCommitId ?? operation.commitId}.`;
		case "move_changes":
			return `Move ${count} selected hunk(s) from ${sourceCommitId ?? "the source commit"} into ${operation.targetCommitId}.`;
		case "uncommit_changes":
			return `Move ${count} selected hunk(s) from ${sourceCommitId ?? "the source commit"} into the working copy.`;
	}
}

async function validateJjCommittedHunkOperation(
	cwd: string,
	runner: VcsCommandRunner,
	operation: Extract<NeutralOperation, { kind: "split_commit" | "move_changes" | "uncommit_changes" }>,
): Promise<string | null> {
	const hunks = operation.selection.hunks ?? [];
	const paths = operation.selection.paths ?? [];
	const sourceCommitId = sourceCommitIdForCommittedHunkOperation(operation);
	if (operation.selection.source !== "commit") {
		return "JJ committed hunk operations require a committed source selection.";
	}
	if (!sourceCommitId) {
		return "JJ committed hunk operations require a source commit.";
	}
	if (operation.kind === "split_commit" && operation.selection.commitId && operation.selection.commitId !== operation.commitId) {
		return "JJ split hunk selection must come from the commit being split.";
	}
	if (operation.kind === "move_changes" && operation.targetCommitId === sourceCommitId) {
		return "Source and target changes must be different.";
	}
	if (hunks.length === 0) {
		return "Choose one or more committed hunks.";
	}
	const overlappingPath = paths.find((path) => hunks.some((hunk) => hunk.path === path));
	if (overlappingPath) {
		return `Choose either the whole file or individual hunks for ${overlappingPath}, not both.`;
	}
	const pathOperation = toJjPathOperationForCommittedHunks(operation, sourceCommitId, [...new Set(hunks.map((hunk) => hunk.path))]);
	const pathPreview = await previewJjOperation(cwd, pathOperation, runner);
	if (!pathPreview.valid) {
		return pathPreview.description;
	}
	const patch = await buildSelectedJjCommittedHunkPatch(cwd, runner, operation);
	return patch.ok ? null : patch.reason;
}

async function validateJjCommittedHunkDiscardOperation(
	cwd: string,
	runner: VcsCommandRunner,
	operation: JjCommittedHunkDiscardOperation,
): Promise<string | null> {
	const sourceCommitId = operation.selection.commitId;
	const hunks = operation.selection.hunks ?? [];
	const paths = operation.selection.paths ?? [];
	if (operation.selection.source !== "commit") {
		return "JJ committed hunk discard requires a committed source selection.";
	}
	if (!sourceCommitId) {
		return "JJ committed hunk discard requires a source commit.";
	}
	if (hunks.length === 0) {
		return "Choose one or more committed hunks to discard.";
	}
	const overlappingPath = paths.find((path) => hunks.some((hunk) => hunk.path === path));
	if (overlappingPath) {
		return `Choose either the whole file or individual hunks for ${overlappingPath}, not both.`;
	}
	const parent = await readSingleJjParentChange(cwd, runner, sourceCommitId);
	if (!parent.ok) {
		return parent.reason;
	}
	const patch = await buildSelectedJjCommittedHunkPatch(cwd, runner, operation);
	return patch.ok ? null : patch.reason;
}

function toJjPathOperationForCommittedHunks(
	operation: Extract<NeutralOperation, { kind: "split_commit" | "move_changes" | "uncommit_changes" }>,
	sourceCommitId: string,
	paths: string[],
): VcsPreviewOperationInput {
	switch (operation.kind) {
		case "split_commit":
			return {
				kind: "split_change",
				changeId: operation.commitId,
				message: operation.message,
				paths,
			};
		case "move_changes":
			return {
				kind: "squash_change",
				sourceChangeId: sourceCommitId,
				targetChangeId: operation.targetCommitId,
				paths,
			};
		case "uncommit_changes":
			return {
				kind: "squash_change",
				sourceChangeId: sourceCommitId,
				targetChangeId: "@",
				paths,
				allowDescendantTarget: true,
			};
	}
}

async function validateJjWorkingCopyHunkOperation(
	cwd: string,
	runner: VcsCommandRunner,
	operation: Extract<NeutralOperation, { kind: "restore_changes" | "discard_changes" }>,
): Promise<string | null> {
	const hunks = operation.selection.hunks ?? [];
	const paths = operation.selection.paths ?? [];
	if (operation.selection.source !== "working_copy") {
		return "JJ hunk-level restore currently supports selected working-copy hunks only.";
	}
	if (hunks.length === 0) {
		return "Choose one or more hunks to restore.";
	}
	const overlappingPath = paths.find((path) => hunks.some((hunk) => hunk.path === path));
	if (overlappingPath) {
		return `Choose either the whole file or individual hunks for ${overlappingPath}, not both.`;
	}
	const patch = await buildSelectedJjWorkingCopyHunkPatch(cwd, runner, hunks);
	return patch.ok ? null : patch.reason;
}

async function buildSelectedJjCommittedHunkPatch(
	cwd: string,
	runner: VcsCommandRunner,
	operation:
		| Extract<NeutralOperation, { kind: "split_commit" | "move_changes" | "uncommit_changes" }>
		| JjCommittedHunkDiscardOperation,
): Promise<{ ok: true; patch: string; repoCwd: string; paths: string[] } | { ok: false; reason: string }> {
	const sourceCommitId =
		operation.kind === "restore_changes" || operation.kind === "discard_changes"
			? operation.selection.commitId
			: sourceCommitIdForCommittedHunkOperation(operation);
	if (!sourceCommitId) {
		return { ok: false, reason: "JJ committed hunk operations require a source commit." };
	}
	const detect = await detectVcsState(cwd, runner);
	const repoCwd = detect.repository.root ?? cwd;
	if (detect.repository.kind !== "jj") {
		return { ok: false, reason: "JJ committed hunk operations are only available inside a JJ repository." };
	}
	const hunks = operation.selection.hunks ?? [];
	const paths = [...new Set(hunks.map((hunk) => hunk.path))];
	const diffResult = await runner({
		command: "jj",
		args: ["diff", "--git", "--color=never", "-r", sourceCommitId, "--", ...paths],
		cwd: repoCwd,
	});
	if (!diffResult.ok) {
		return {
			ok: false,
			reason: diffResult.stderr.trim() || "Could not read JJ committed hunks.",
		};
	}
	const patchFiles = parseJjPatchFiles(diffResult.stdout);
	const patchLines: string[] = [];
	for (const file of patchFiles) {
		const selectedHunks = hunks.filter((hunk) => hunk.path === file.path);
		if (selectedHunks.length === 0) {
			continue;
		}
		const matchedHunks: JjPatchHunk[] = [];
		for (const selection of selectedHunks) {
			const match = file.hunks.find((hunk) => hunkMatchesSelection(file.path, hunk, selection));
			if (!match) {
				return {
					ok: false,
					reason: `Could not match selected JJ hunk ${selection.hunkId} in ${selection.path}. Refresh the workspace and retry.`,
				};
			}
			matchedHunks.push(match);
		}
		patchLines.push(...file.headerLines);
		for (const hunk of matchedHunks) {
			patchLines.push(...hunk.lines);
		}
	}
	if (patchLines.length === 0) {
		return { ok: false, reason: "Could not build a JJ patch for the selected committed hunks." };
	}
	return { ok: true, patch: `${patchLines.join("\n")}\n`, repoCwd, paths };
}

async function readSingleJjParentChange(
	cwd: string,
	runner: VcsCommandRunner,
	sourceCommitId: string,
): Promise<{ ok: true; parentChangeId: string } | { ok: false; reason: string }> {
	const result = await runner({
		command: "jj",
		args: ["log", "--no-graph", "-r", `${sourceCommitId}-`, "-T", "change_id.short()"],
		cwd,
	});
	if (!result.ok) {
		return {
			ok: false,
			reason: result.stderr.trim() || `Could not resolve the parent of ${sourceCommitId}.`,
		};
	}
	const parents = result.stdout
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
	if (parents.length !== 1 || !parents[0]) {
		return {
			ok: false,
			reason: `JJ committed hunk discard requires ${sourceCommitId} to have exactly one parent.`,
		};
	}
	return { ok: true, parentChangeId: parents[0] };
}

async function discardJjCommittedHunksWithTemporaryChange(
	repoCwd: string,
	runner: VcsCommandRunner,
	operation: JjCommittedHunkDiscardOperation,
	patch: { patch: string; paths: string[] },
) {
	const sourceCommitId = operation.selection.commitId ?? "";
	const parent = await readSingleJjParentChange(repoCwd, runner, sourceCommitId);
	if (!parent.ok) {
		return { ok: false, stdout: "", stderr: parent.reason, exitCode: 1 };
	}
	const tempDir = await mkdtemp(join(tmpdir(), "changeyard-jj-discard-"));
	const patchPath = join(tempDir, "selected.patch");
	const editorPath = join(tempDir, "select-hunks-editor.sh");
	await writeFile(patchPath, patch.patch, "utf8");
	await writeFile(editorPath, createJjSelectedPatchEditorScript(patchPath), "utf8");
	await chmod(editorPath, 0o700);
	let temporaryChangeId: string | null = null;
	let abandonedTemporaryChange = false;
	try {
		const createResult = await runner({
			command: "jj",
			args: ["new", "--no-edit", parent.parentChangeId, "-m", "changeyard discard selected hunks"],
			cwd: repoCwd,
		});
		if (!createResult.ok) {
			return createResult;
		}
		temporaryChangeId = parseCreatedJjChangeId(createResult.stdout) ?? parseCreatedJjChangeId(createResult.stderr);
		if (!temporaryChangeId) {
			return {
				ok: false,
				stdout: createResult.stdout,
				stderr: createResult.stderr.trim() || "Could not determine the temporary JJ change id.",
				exitCode: 1,
			};
		}
		const squashResult = await runner({
			command: "jj",
			args: [
				"squash",
				"--from",
				sourceCommitId,
				"--into",
				temporaryChangeId,
				"--interactive",
				"--tool",
				editorPath,
				...patch.paths,
			],
			cwd: repoCwd,
		});
		if (!squashResult.ok) {
			return squashResult;
		}
		const abandonResult = await runner({
			command: "jj",
			args: ["abandon", temporaryChangeId],
			cwd: repoCwd,
		});
		if (abandonResult.ok) {
			abandonedTemporaryChange = true;
		}
		return abandonResult;
	} finally {
		if (temporaryChangeId && !abandonedTemporaryChange) {
			await runner({
				command: "jj",
				args: ["abandon", temporaryChangeId],
				cwd: repoCwd,
			});
		}
		await rm(tempDir, { recursive: true, force: true });
	}
}

function parseCreatedJjChangeId(output: string): string | null {
	const match = /^Created new commit\s+([A-Za-z0-9._/-]+)/m.exec(output);
	return match?.[1] ?? null;
}

async function applyJjCommittedHunkOperationWithEditor(
	repoCwd: string,
	runner: VcsCommandRunner,
	operation: Extract<NeutralOperation, { kind: "split_commit" | "move_changes" | "uncommit_changes" }>,
	patch: { patch: string; paths: string[] },
) {
	const sourceCommitId = sourceCommitIdForCommittedHunkOperation(operation);
	const tempDir = await mkdtemp(join(tmpdir(), "changeyard-jj-hunks-"));
	const patchPath = join(tempDir, "selected.patch");
	const editorPath = join(tempDir, "select-hunks-editor.sh");
	await writeFile(patchPath, patch.patch, "utf8");
	await writeFile(editorPath, createJjSelectedPatchEditorScript(patchPath), "utf8");
	await chmod(editorPath, 0o700);
	try {
		if (operation.kind === "split_commit") {
			return await runner({
				command: "jj",
				args: ["split", "-r", operation.commitId, "-m", operation.message.trim(), "--tool", editorPath, ...patch.paths],
				cwd: repoCwd,
			});
		}
		return await runner({
			command: "jj",
			args: [
				"squash",
				"--from",
				sourceCommitId ?? "",
				"--into",
				operation.kind === "move_changes" ? operation.targetCommitId : "@",
				"--interactive",
				"--tool",
				editorPath,
				...patch.paths,
			],
			cwd: repoCwd,
		});
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
}

function createJjSelectedPatchEditorScript(patchPath: string): string {
	return [
		"#!/bin/sh",
		"set -eu",
		'left="$1"',
		'right="$2"',
		'find "$right" -mindepth 1 -maxdepth 1 -exec rm -rf {} +',
		'cp -R "$left"/. "$right"/',
		`git -C "$right" apply --whitespace=nowarn ${shellSingleQuote(patchPath)}`,
		"",
	].join("\n");
}

function shellSingleQuote(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}

async function buildSelectedJjWorkingCopyHunkPatch(
	cwd: string,
	runner: VcsCommandRunner,
	hunks: JjHunkSelection[],
): Promise<{ ok: true; patch: string; repoCwd: string } | { ok: false; reason: string }> {
	const detect = await detectVcsState(cwd, runner);
	const repoCwd = detect.repository.root ?? cwd;
	if (detect.repository.kind !== "jj") {
		return { ok: false, reason: "JJ hunk restore is only available inside a JJ repository." };
	}
	const paths = [...new Set(hunks.map((hunk) => hunk.path))];
	const diffResult = await runner({
		command: "jj",
		args: ["diff", "--git", "--color=never", "--", ...paths],
		cwd: repoCwd,
	});
	if (!diffResult.ok) {
		return {
			ok: false,
			reason: diffResult.stderr.trim() || "Could not read JJ working-copy hunks.",
		};
	}
	const patchFiles = parseJjPatchFiles(diffResult.stdout);
	const patchLines: string[] = [];
	for (const file of patchFiles) {
		const selectedHunks = hunks.filter((hunk) => hunk.path === file.path);
		if (selectedHunks.length === 0) {
			continue;
		}
		const matchedHunks: JjPatchHunk[] = [];
		for (const selection of selectedHunks) {
			const match = file.hunks.find((hunk) => hunkMatchesSelection(file.path, hunk, selection));
			if (!match) {
				return {
					ok: false,
					reason: `Could not match selected JJ hunk ${selection.hunkId} in ${selection.path}. Refresh the workspace and retry.`,
				};
			}
			matchedHunks.push(match);
		}
		patchLines.push(...file.headerLines);
		for (const hunk of matchedHunks) {
			patchLines.push(...hunk.lines);
		}
	}
	if (patchLines.length === 0) {
		return { ok: false, reason: "Could not build a JJ patch for the selected hunks." };
	}
	return { ok: true, patch: `${patchLines.join("\n")}\n`, repoCwd };
}

function parseJjPatchFiles(patch: string): JjPatchFile[] {
	const files: JjPatchFile[] = [];
	let currentFile: JjPatchFile | null = null;
	let currentHunk: JjPatchHunk | null = null;
	let sawHunk = false;

	function pushCurrentHunk(): void {
		if (currentFile && currentHunk) {
			currentFile.hunks.push(currentHunk);
		}
		currentHunk = null;
	}

	function pushCurrentFile(): void {
		pushCurrentHunk();
		if (currentFile) {
			files.push(currentFile);
		}
		currentFile = null;
		sawHunk = false;
	}

	for (const line of patch.split("\n")) {
		if (line.startsWith("diff --git ")) {
			pushCurrentFile();
			currentFile = {
				path: parseDiffGitPath(line),
				headerLines: [line],
				hunks: [],
			};
			continue;
		}
		if (!currentFile) {
			continue;
		}
		if (line.startsWith("@@")) {
			pushCurrentHunk();
			sawHunk = true;
			const parsed = parseJjHunkHeader(line);
			currentHunk = {
				id: `${parsed.oldStart}:${parsed.oldLines}:${parsed.newStart}:${parsed.newLines}`,
				...parsed,
				lines: [line],
			};
			continue;
		}
		if (currentHunk) {
			currentHunk.lines.push(line);
			continue;
		}
		if (!sawHunk) {
			currentFile.headerLines.push(line);
			if (line.startsWith("+++ b/")) {
				currentFile.path = line.slice("+++ b/".length);
			}
		}
	}
	pushCurrentFile();
	return files;
}

function parseDiffGitPath(line: string): string {
	const match = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
	return match?.[2] ?? "";
}

function parseJjHunkHeader(header: string): Omit<JjPatchHunk, "id" | "lines"> {
	const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(header);
	if (!match) {
		return { oldStart: 0, oldLines: 0, newStart: 0, newLines: 0 };
	}
	return {
		oldStart: Number.parseInt(match[1] ?? "0", 10),
		oldLines: Number.parseInt(match[2] ?? "1", 10),
		newStart: Number.parseInt(match[3] ?? "0", 10),
		newLines: Number.parseInt(match[4] ?? "1", 10),
	};
}

function hunkMatchesSelection(path: string, hunk: JjPatchHunk, selection: JjHunkSelection): boolean {
	if (selection.hunkId === hunk.id || selection.hunkId === `${path}:${hunk.id}`) {
		return true;
	}
	return (
		selection.oldStart === hunk.oldStart &&
		selection.oldLines === hunk.oldLines &&
		selection.newStart === hunk.newStart &&
		selection.newLines === hunk.newLines
	);
}

function toNeutralPreview(operation: NeutralOperation, preview: VcsPreviewOperationResult) {
	return {
		valid: preview.valid,
		operation,
		title: preview.title,
		summary: preview.description,
		risk: preview.risk,
		disabledReason: preview.valid ? null : preview.description,
		warnings: preview.diagnostics
			.filter((diagnostic) => diagnostic.level === "warning")
			.map((diagnostic) => ({ code: diagnostic.code, message: diagnostic.message })),
		conflicts: [],
		affectedStackIds: preview.affectedBookmarks,
		affectedCommitIds: preview.affectedChangeIds,
		affectedPaths: pathsFromOperation(operation),
		diagnostics: preview.diagnostics,
	};
}

function toNeutralApply(operation: NeutralOperation, result: VcsApplyOperationResult) {
	return {
		ok: result.ok,
		operation,
		title: result.title,
		summary: result.description,
		affectedStackIds: result.affectedBookmarks,
		affectedCommitIds: result.affectedChangeIds,
		affectedPaths: pathsFromOperation(operation),
		recovery: result.ok
			? null
			: {
					instructions: [
						"Review the JJ operation output and run `jj op log` or `jj op undo` if repository state needs recovery.",
					],
				},
		diagnostics: result.diagnostics,
	};
}

function unsupportedPreview(operation: NeutralOperation, reason: string) {
	return {
		valid: false,
		operation,
		title: "Preview unavailable",
		summary: reason,
		risk: "high" as const,
		disabledReason: reason,
		warnings: [],
		conflicts: [],
		affectedStackIds: stackIdsFromOperation(operation),
		affectedCommitIds: commitIdsFromOperation(operation),
		affectedPaths: pathsFromOperation(operation),
		diagnostics: [createDiagnostic("warning", "jj_workspace_operation_unsupported", reason)],
	};
}

async function workspaceMembershipPreview(
	cwd: string,
	runner: VcsCommandRunner,
	operation: Extract<NeutralOperation, { kind: "apply_stack" | "unapply_stack" }>,
) {
	const action = operation.kind === "apply_stack" ? "Apply stack" : "Unapply stack";
	const membership = await resolveJjWorkspaceMembership(cwd, runner, operation);
	if (!membership.ok) {
		return unsupportedPreview(operation, membership.reason);
	}
	return {
		valid: true,
		operation,
		title: action,
		summary: membership.noop
			? `${operation.stackId} is already ${operation.kind === "apply_stack" ? "applied to" : "removed from"} the JJ workspace merge.`
			: `${action} ${operation.stackId} by rebasing the working-copy change onto ${membership.nextParentChangeIds.join(", ")}.`,
		risk: "medium" as const,
		disabledReason: null,
		warnings: [
			{
				code: "jj_workspace_merge_rebase",
				message: "This rewrites the working-copy change parents to update the JJ workspace merge.",
			},
		],
		conflicts: [],
		affectedStackIds: [operation.stackId],
		affectedCommitIds: [membership.targetChangeId],
		affectedPaths: [],
		diagnostics: [],
	};
}

async function workspaceMembershipApply(
	cwd: string,
	runner: VcsCommandRunner,
	operation: Extract<NeutralOperation, { kind: "apply_stack" | "unapply_stack" }>,
) {
	const action = operation.kind === "apply_stack" ? "Applied stack" : "Unapplied stack";
	const membership = await resolveJjWorkspaceMembership(cwd, runner, operation);
	if (!membership.ok) {
		return unsupportedApply(operation, membership.reason);
	}
	if (!membership.noop) {
		const applyResult = await runner({
			command: "jj",
			args: ["rebase", "-r", "@", ...membership.nextParentChangeIds.flatMap((changeId) => ["-o", changeId])],
			cwd: membership.repoCwd,
		});
		if (!applyResult.ok) {
			return failedApply(
				operation,
				applyResult.stderr.trim() || applyResult.stdout.trim() || `Could not ${operation.kind.replace("_", " ")}.`,
			);
		}
	}
	return {
		ok: true,
		operation,
		title: action,
		summary: membership.noop
			? `${operation.stackId} was already ${operation.kind === "apply_stack" ? "applied to" : "removed from"} the JJ workspace merge.`
			: `${action} ${operation.stackId} in the JJ workspace merge.`,
		affectedStackIds: [operation.stackId],
		affectedCommitIds: [membership.targetChangeId],
		affectedPaths: [],
		recovery: null,
		diagnostics: [],
	};
}

async function resolveJjWorkspaceMembership(
	cwd: string,
	runner: VcsCommandRunner,
	operation: Extract<NeutralOperation, { kind: "apply_stack" | "unapply_stack" }>,
): Promise<
	| { ok: true; repoCwd: string; targetChangeId: string; nextParentChangeIds: string[]; noop: boolean }
	| { ok: false; reason: string }
> {
	const state = await loadJjWorkspaceState(cwd, runner);
	if (state.provider !== "jj") {
		return { ok: false, reason: "JJ workspace stack membership is only available inside a JJ repository." };
	}
	const stack = state.stacks.find((candidate) => candidate.stackId === operation.stackId);
	const targetChangeId = stack?.headCommitId ?? stack?.commits.at(-1)?.commitId ?? null;
	if (!targetChangeId) {
		return { ok: false, reason: `Could not resolve stack ${operation.stackId} to a JJ change.` };
	}
	if (operation.kind === "apply_stack" && state.headId === targetChangeId) {
		return {
			ok: true,
			repoCwd: state.projectId,
			targetChangeId,
			nextParentChangeIds: [],
			noop: true,
		};
	}
	const parents = await readCurrentJjParentChanges(state.projectId, runner);
	if (!parents.ok) {
		return parents;
	}
	if (operation.kind === "apply_stack") {
		const nextParentChangeIds = [...new Set([...parents.parentChangeIds, targetChangeId])];
		return {
			ok: true,
			repoCwd: state.projectId,
			targetChangeId,
			nextParentChangeIds,
			noop: nextParentChangeIds.length === parents.parentChangeIds.length,
		};
	}
	const nextParentChangeIds = parents.parentChangeIds.filter((parentChangeId) => parentChangeId !== targetChangeId);
	if (nextParentChangeIds.length === parents.parentChangeIds.length) {
		return {
			ok: true,
			repoCwd: state.projectId,
			targetChangeId,
			nextParentChangeIds,
			noop: true,
		};
	}
	if (nextParentChangeIds.length === 0) {
		return { ok: false, reason: `Cannot unapply ${operation.stackId} because it is the only JJ workspace parent.` };
	}
	return {
		ok: true,
		repoCwd: state.projectId,
		targetChangeId,
		nextParentChangeIds,
		noop: false,
	};
}

async function readCurrentJjParentChanges(
	cwd: string,
	runner: VcsCommandRunner,
): Promise<{ ok: true; parentChangeIds: string[] } | { ok: false; reason: string }> {
	const result = await runner({
		command: "jj",
		args: ["log", "--no-graph", "-r", "@-", "-T", 'change_id.short() ++ "\\n"'],
		cwd,
	});
	if (!result.ok) {
		return {
			ok: false,
			reason: result.stderr.trim() || "Could not resolve the current JJ workspace parents.",
		};
	}
	const parentChangeIds = result.stdout
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
	if (parentChangeIds.length === 0) {
		return { ok: false, reason: "The current JJ workspace change has no parent to rebase." };
	}
	return { ok: true, parentChangeIds };
}

function unsupportedApply(operation: NeutralOperation, reason: string) {
	return {
		ok: false,
		operation,
		title: "Operation unavailable",
		summary: reason,
		affectedStackIds: stackIdsFromOperation(operation),
		affectedCommitIds: commitIdsFromOperation(operation),
		affectedPaths: pathsFromOperation(operation),
		recovery: {
			instructions: ["No repository changes were attempted."],
		},
		diagnostics: [createDiagnostic("warning", "jj_workspace_operation_unsupported", reason)],
	};
}

function failedApply(operation: NeutralOperation, reason: string) {
	return {
		ok: false,
		operation,
		title: "Operation failed",
		summary: reason,
		affectedStackIds: stackIdsFromOperation(operation),
		affectedCommitIds: commitIdsFromOperation(operation),
		affectedPaths: pathsFromOperation(operation),
		recovery: {
			instructions: [
				"Review the JJ operation output and run `jj op log` or `jj op undo` if repository state needs recovery.",
			],
		},
		diagnostics: [createDiagnostic("error", "jj_workspace_operation_failed", reason)],
	};
}

function stackIdsFromOperation(operation: NeutralOperation): string[] {
	switch (operation.kind) {
		case "apply_stack":
		case "unapply_stack":
			return [operation.stackId];
		case "create_commit":
			return [operation.stackId];
		case "move_commit":
			return [operation.targetStackId];
		case "uncommit_changes":
			return operation.targetStackId ? [operation.targetStackId] : [];
		case "create_stack":
		case "reword_commit":
		case "amend_commit":
		case "split_commit":
		case "squash_commits":
		case "move_changes":
		case "restore_changes":
		case "discard_changes":
		case "undo":
		case "redo":
			return [];
	}
}

function commitIdsFromOperation(operation: NeutralOperation): string[] {
	switch (operation.kind) {
		case "reword_commit":
		case "amend_commit":
		case "split_commit":
			return [operation.commitId];
		case "squash_commits":
			return [operation.sourceCommitId, operation.targetCommitId];
		case "move_commit":
			return [operation.commitId];
		case "move_changes":
			return [
				...(operation.selection.commitId ? [operation.selection.commitId] : []),
				operation.targetCommitId,
			];
		case "uncommit_changes":
			return operation.selection.commitId ? [operation.selection.commitId] : [];
		case "restore_changes":
		case "discard_changes":
			return operation.selection.source === "commit" && operation.selection.commitId ? [operation.selection.commitId] : [];
		case "apply_stack":
		case "unapply_stack":
		case "create_stack":
		case "create_commit":
		case "undo":
		case "redo":
			return [];
	}
}

function pathsFromOperation(operation: NeutralOperation): string[] {
	if ("selection" in operation && operation.selection) {
		return [
			...(operation.selection.paths ?? []),
			...(operation.selection.hunks ?? []).map((hunk) => hunk.path),
		];
	}
	return [];
}
