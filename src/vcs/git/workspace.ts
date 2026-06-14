import { detectVcsState, type VcsCommandRunner } from "../detect.js";
import type { VcsDiagnostic } from "../types.js";
import type { NeutralOperation, NeutralOperationRequest, NeutralSelection } from "../workspace-types.js";

const FIELD_SEPARATOR = "\x1f";
const RECORD_SEPARATOR = "\x1e";
const LOG_FORMAT = ["%H", "%h", "%an", "%ae", "%aI", "%s", "%P"].join(FIELD_SEPARATOR);

type GitFileStatus = "modified" | "added" | "deleted" | "renamed" | "copied" | "unknown";
type GitHunkSelection = NonNullable<NeutralSelection["hunks"]>[number];
type GitWorkingCopyFile = {
	path: string;
	previousPath?: string | null;
	status: GitFileStatus;
	statusCode: string;
};

type GitPatchFile = {
	path: string;
	headerLines: string[];
	hunks: GitPatchHunk[];
};

type GitPatchHunk = {
	id: string;
	oldStart: number;
	oldLines: number;
	newStart: number;
	newLines: number;
	lines: string[];
};

export interface GitWorkspaceOptions {
	targetBranch?: string | null;
	appliedStackIds?: string[];
}

function createDiagnostic(level: VcsDiagnostic["level"], code: string, message: string): VcsDiagnostic {
	return { level, code, message };
}

function gitCapabilities() {
	return {
		supportsMultiAppliedWorkspace: false,
		supportsHunkSelection: false,
		supportsHunkRestoreDiscard: true,
		supportsCommittedHunkSelection: false,
		supportsCommitRewrite: true,
		supportsMoveCommitAcrossStacks: false,
		supportsMoveChangesAcrossCommits: true,
		supportsUndoRedo: false,
		supportsSyntheticWorkspaceMerge: false,
		supportsCreateStack: false,
		supportsWorkingCopyCommit: false,
	};
}

function workingCopySummary(files: Array<{ status: GitFileStatus }>) {
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

function mapGitStatus(code: string): GitFileStatus {
	const normalized = code.trim();
	if (normalized === "??") {
		return "unknown";
	}
	if (normalized.includes("R")) {
		return "renamed";
	}
	if (normalized.includes("C")) {
		return "copied";
	}
	if (normalized.includes("A")) {
		return "added";
	}
	if (normalized.includes("D")) {
		return "deleted";
	}
	if (normalized.includes("M")) {
		return "modified";
	}
	return "unknown";
}

function isGitConflictStatus(code: string): boolean {
	return ["DD", "AU", "UD", "UA", "DU", "AA", "UU"].includes(code);
}

function stripGitStatusCode(file: GitWorkingCopyFile) {
	const { statusCode: _statusCode, ...publicFile } = file;
	return publicFile;
}

function conflictFromGitStatus(file: GitWorkingCopyFile) {
	if (!isGitConflictStatus(file.statusCode)) {
		return null;
	}
	return {
		id: `git-conflict:${file.path}`,
		path: file.path,
		message: `Git reports an unresolved ${file.statusCode} conflict for ${file.path}.`,
		commitIds: [],
		stackIds: [],
	};
}

function parsePorcelainStatus(output: string): GitWorkingCopyFile[] {
	if (output.includes("\0")) {
		return parsePorcelainStatusZ(output);
	}
	return parsePorcelainStatusLines(output);
}

function parsePorcelainStatusLines(output: string): GitWorkingCopyFile[] {
	const files: GitWorkingCopyFile[] = [];
	for (const line of output.split("\n")) {
		if (!line.trim()) {
			continue;
		}
		const statusCode = line.slice(0, 2);
		const pathPart = line.slice(2).trim();
		if (!pathPart) {
			continue;
		}
		const renameParts = pathPart.split(" -> ");
		if (renameParts.length === 2 && renameParts[0] && renameParts[1]) {
			files.push({
				path: renameParts[1],
				previousPath: renameParts[0],
				status: "renamed",
				statusCode,
			});
			continue;
		}
		files.push({
			path: pathPart,
			status: mapGitStatus(statusCode),
			statusCode,
		});
	}
	return files;
}

function parsePorcelainStatusZ(output: string): GitWorkingCopyFile[] {
	const files: GitWorkingCopyFile[] = [];
	const entries = output.split("\0").filter((entry) => entry.length > 0);
	for (let index = 0; index < entries.length; index += 1) {
		const entry = entries[index] ?? "";
		if (entry.length < 4) {
			continue;
		}
		const statusCode = entry.slice(0, 2);
		const pathPart = entry.slice(3);
		if (!pathPart) {
			continue;
		}
		if (statusCode.includes("R") || statusCode.includes("C")) {
			const previousPath = entries[index + 1] ?? null;
			if (previousPath) {
				index += 1;
			}
			files.push({
				path: pathPart,
				previousPath,
				status: mapGitStatus(statusCode),
				statusCode,
			});
			continue;
		}
		files.push({
			path: pathPart,
			status: mapGitStatus(statusCode),
			statusCode,
		});
	}
	return files;
}

function parseLogRecord(record: string) {
	const fields = record.split(FIELD_SEPARATOR);
	if (fields.length < 7) {
		return null;
	}
	const [hash, shortHash, authorName, authorEmail, timestamp, subject, parentHashes] = fields;
	if (!hash || !shortHash) {
		return null;
	}
	return {
		commitId: hash,
		displayId: shortHash,
		title: subject || "(no subject)",
		description: "",
		authorName: authorName || null,
		authorEmail: authorEmail || null,
		authorAvatarUrl: null,
		timestamp: timestamp || null,
		parentCommitIds: (parentHashes ?? "").split(" ").filter(Boolean),
		stackIds: [] as string[],
		isHead: false,
		isCurrent: false,
		metadata: {
			commitHash: hash,
		},
	};
}

function parseBranchRefs(output: string) {
	return output
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => {
			const [name, hash, upstream] = line.split(FIELD_SEPARATOR);
			return name && hash ? { name, hash, upstream: upstream || null } : null;
		})
		.filter((entry): entry is { name: string; hash: string; upstream: string | null } => Boolean(entry));
}

async function readGitBranches(repoCwd: string, runner: VcsCommandRunner) {
	const result = await runner({
		command: "git",
		args: ["for-each-ref", `--format=%(refname:short)${FIELD_SEPARATOR}%(objectname)${FIELD_SEPARATOR}%(upstream:short)`, "refs/heads/"],
		cwd: repoCwd,
	});
	return result.ok ? parseBranchRefs(result.stdout) : [];
}

async function readBranchCommits(repoCwd: string, branchName: string, baseRef: string | null, runner: VcsCommandRunner) {
	const rangeRef = baseRef ? `${baseRef}..${branchName}` : branchName;
	const result = await runner({
		command: "git",
		args: ["log", "--topo-order", "--date-order", "--reverse", `--format=${RECORD_SEPARATOR}${LOG_FORMAT}`, rangeRef],
		cwd: repoCwd,
	});
	if (!result.ok) {
		return [];
	}
	return result.stdout
		.split(RECORD_SEPARATOR)
		.map((record) => parseLogRecord(record.trim()))
		.filter((commit): commit is NonNullable<ReturnType<typeof parseLogRecord>> => Boolean(commit));
}

async function readCurrentBranch(repoCwd: string, runner: VcsCommandRunner): Promise<string | null> {
	const result = await runner({
		command: "git",
		args: ["symbolic-ref", "--quiet", "--short", "HEAD"],
		cwd: repoCwd,
	});
	return result.ok ? result.stdout.trim() || null : null;
}

async function readHeadCommit(repoCwd: string, runner: VcsCommandRunner): Promise<string | null> {
	const result = await runner({
		command: "git",
		args: ["rev-parse", "--verify", "HEAD"],
		cwd: repoCwd,
	});
	return result.ok ? result.stdout.trim() || null : null;
}

async function readHeadCommitMessage(repoCwd: string, runner: VcsCommandRunner): Promise<string | null> {
	const result = await runner({
		command: "git",
		args: ["log", "-1", "--format=%B", "HEAD"],
		cwd: repoCwd,
	});
	return result.ok ? result.stdout.trim() || null : null;
}

async function readCommitMessage(repoCwd: string, runner: VcsCommandRunner, commitId: string): Promise<string | null> {
	const result = await runner({
		command: "git",
		args: ["log", "-1", "--format=%B", commitId],
		cwd: repoCwd,
	});
	return result.ok ? result.stdout.trim() || null : null;
}

async function resolveCommit(repoCwd: string, runner: VcsCommandRunner, commitId: string): Promise<string | null> {
	const result = await runner({
		command: "git",
		args: ["rev-parse", "--verify", `${commitId}^{commit}`],
		cwd: repoCwd,
	});
	return result.ok ? result.stdout.trim() || null : null;
}

async function readFirstParentCommit(repoCwd: string, runner: VcsCommandRunner, commitId: string): Promise<string | null> {
	const result = await runner({
		command: "git",
		args: ["rev-parse", "--verify", `${commitId}^`],
		cwd: repoCwd,
	});
	return result.ok ? result.stdout.trim() || null : null;
}

async function readCommitChangedPaths(repoCwd: string, runner: VcsCommandRunner, commitId: string): Promise<string[] | null> {
	const result = await runner({
		command: "git",
		args: ["diff-tree", "--no-commit-id", "--name-only", "-r", commitId],
		cwd: repoCwd,
	});
	if (!result.ok) {
		return null;
	}
	return result.stdout
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
}

async function isIndexClean(repoCwd: string, runner: VcsCommandRunner): Promise<boolean> {
	const result = await runner({
		command: "git",
		args: ["diff", "--cached", "--quiet"],
		cwd: repoCwd,
	});
	return result.ok;
}

async function readWorkingCopyFiles(repoCwd: string, runner: VcsCommandRunner) {
	const result = await runner({
		command: "git",
		args: ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
		cwd: repoCwd,
	});
	return result.ok ? parsePorcelainStatus(result.stdout) : [];
}

async function readRawStatus(repoCwd: string, runner: VcsCommandRunner): Promise<string | null> {
	const result = await runner({
		command: "git",
		args: ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
		cwd: repoCwd,
	});
	return result.ok ? result.stdout : null;
}

async function readRawStatusForPaths(repoCwd: string, runner: VcsCommandRunner, paths: string[]): Promise<string | null> {
	const result = await runner({
		command: "git",
		args: ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--", ...paths],
		cwd: repoCwd,
	});
	return result.ok ? result.stdout : null;
}

async function isWorkingTreeClean(repoCwd: string, runner: VcsCommandRunner): Promise<boolean> {
	const status = await readRawStatus(repoCwd, runner);
	return status !== null && status.trim().length === 0;
}

async function localBranchExists(repoCwd: string, runner: VcsCommandRunner, branchName: string): Promise<boolean> {
	if (!branchName.trim()) {
		return false;
	}
	const result = await runner({
		command: "git",
		args: ["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`],
		cwd: repoCwd,
	});
	return result.ok;
}

async function resolveLocalCheckoutRef(
	repoCwd: string,
	runner: VcsCommandRunner,
	targetRef: string | null,
	defaultBranch: string | null,
): Promise<string | null> {
	const candidates = [
		targetRef,
		targetRef?.includes("/") ? targetRef.split("/").slice(1).join("/") : null,
		defaultBranch,
	].filter((candidate): candidate is string => Boolean(candidate?.trim()));
	for (const candidate of [...new Set(candidates)]) {
		if (await localBranchExists(repoCwd, runner, candidate)) {
			return candidate;
		}
	}
	return null;
}

function defaultTargetRef(detect: Awaited<ReturnType<typeof detectVcsState>>, options: GitWorkspaceOptions): string {
	const configured = options.targetBranch?.trim();
	if (configured) {
		return configured;
	}
	if (detect.git.remoteName && detect.git.defaultBranch) {
		return `${detect.git.remoteName}/${detect.git.defaultBranch}`;
	}
	return detect.git.defaultBranch ?? "";
}

export async function loadGitWorkspaceState(
	cwd: string,
	runner: VcsCommandRunner,
	options: GitWorkspaceOptions = {},
) {
	const detect = await detectVcsState(cwd, runner);
	const repoCwd = detect.repository.root ?? cwd;
	if (detect.repository.kind !== "git") {
		return {
			projectId: cwd,
			provider: "git" as const,
			targetRef: defaultTargetRef(detect, options),
			headId: null,
			mode: "unsupported" as const,
			capabilities: gitCapabilities(),
			stacks: [],
			appliedStackIds: [],
			workingCopy: {
				files: [],
				hasConflicts: false,
				summary: workingCopySummary([]),
			},
			conflicts: [
				{
					id: "git-repo-required",
					path: null,
					message: "Git workspace state is only available inside a Git repository.",
					commitIds: [],
					stackIds: [],
				},
			],
		};
	}

	const targetRef = defaultTargetRef(detect, options);
	const [headId, currentBranch, branches, workingCopyFiles] = await Promise.all([
		readHeadCommit(repoCwd, runner),
		readCurrentBranch(repoCwd, runner),
		readGitBranches(repoCwd, runner),
		readWorkingCopyFiles(repoCwd, runner),
	]);
	const appliedStackIds = options.appliedStackIds?.length
		? options.appliedStackIds
		: currentBranch ? [currentBranch] : [];

	const stacks = [];
	for (const branch of branches) {
		const commits = await readBranchCommits(repoCwd, branch.name, targetRef || null, runner);
		const neutralCommits = commits.map((commit, index) => ({
			...commit,
			stackIds: [branch.name],
			isHead: commit.commitId === branch.hash || index === commits.length - 1,
			isCurrent: commit.commitId === headId,
		}));
		stacks.push({
			stackId: branch.name,
			name: branch.name,
			targetRef: branch.name,
			baseRef: branch.upstream ?? (targetRef || null),
			headCommitId: branch.hash,
			isApplied: appliedStackIds.includes(branch.name),
			isCurrent: branch.name === currentBranch,
			commits: neutralCommits,
			metadata: {
				upstream: branch.upstream,
				headCommitHash: branch.hash,
			},
		});
	}
	const conflicts = workingCopyFiles
		.map((file) => conflictFromGitStatus(file))
		.filter((conflict): conflict is NonNullable<ReturnType<typeof conflictFromGitStatus>> => Boolean(conflict));

	return {
		projectId: cwd,
		provider: "git" as const,
		targetRef,
		headId,
		mode: conflicts.length > 0 ? ("conflicted" as const) : ("normal" as const),
		capabilities: gitCapabilities(),
		stacks,
		appliedStackIds,
		workingCopy: {
			files: workingCopyFiles.map(stripGitStatusCode),
			hasConflicts: conflicts.length > 0,
			summary: workingCopySummary(workingCopyFiles),
		},
		conflicts,
	};
}

export async function previewGitWorkspaceOperation(
	cwd: string,
	input: NeutralOperationRequest,
	runner: VcsCommandRunner,
	options: GitWorkspaceOptions = {},
) {
	const operation = input.operation;
	if (operationUsesHunkSelection(operation) && !isGitHunkRestoreDiscardOperation(operation)) {
		return unsupportedGitPreview(operation, "Git hunk-level workspace operations currently support working-copy restore and discard only.");
	}
	if (!isSupportedGitOperation(operation)) {
		return unsupportedGitPreview(operation, `Git ${operation.kind.replaceAll("_", " ")} is not implemented in the neutral workspace engine yet.`);
	}

	const detect = await detectVcsState(cwd, runner);
	const repoCwd = detect.repository.root ?? cwd;
	if (detect.repository.kind !== "git") {
		return unsupportedGitPreview(operation, "Git workspace operations are only available inside a Git repository.");
	}

	if (operation.kind === "reword_commit") {
		const validation = await validateHeadCommitOperation(repoCwd, runner, operation.commitId);
		if (validation) {
			return unsupportedGitPreview(operation, validation);
		}
		return {
			valid: true,
			operation,
			title: "Edit commit message",
			summary: `Update ${operation.commitId.slice(0, 12)} commit message.`,
			risk: "medium" as const,
			disabledReason: null,
			warnings: [],
			conflicts: [],
			affectedStackIds: [],
			affectedCommitIds: [operation.commitId],
			affectedPaths: [],
			diagnostics: [],
		};
	}

	if (operation.kind === "amend_commit") {
		const commitValidation = await validateHeadCommitOperation(repoCwd, runner, operation.commitId);
		if (commitValidation) {
			return unsupportedGitPreview(operation, commitValidation);
		}
		const pathValidation = await validateWorkingCopyPathOperation(repoCwd, runner, {
			kind: "restore_changes",
			selection: operation.selection,
		});
		if (pathValidation) {
			return unsupportedGitPreview(operation, pathValidation);
		}
		return {
			valid: true,
			operation,
			title: "Amend commit",
			summary: `Amend ${operation.commitId.slice(0, 12)} with ${operation.selection.paths?.length ?? 0} selected path(s).`,
			risk: "medium" as const,
			disabledReason: null,
			warnings: [],
			conflicts: [],
			affectedStackIds: [],
			affectedCommitIds: [operation.commitId],
			affectedPaths: pathsFromOperation(operation),
			diagnostics: [],
		};
	}

	if (operation.kind === "uncommit_changes") {
		const validation = await validateGitUncommitOperation(repoCwd, runner, operation);
		if (validation) {
			return unsupportedGitPreview(operation, validation);
		}
		return {
			valid: true,
			operation,
			title: "Uncommit changes",
			summary: `Move ${operation.selection.paths?.length ?? 0} selected path(s) from ${operation.selection.commitId?.slice(0, 12) ?? "HEAD"} to the working copy.`,
			risk: "high" as const,
			disabledReason: null,
			warnings: [
				{
					code: "git_history_rewrite",
					message: "This rewrites the current Git branch HEAD commit.",
				},
			],
			conflicts: [],
			affectedStackIds: [],
			affectedCommitIds: operation.selection.commitId ? [operation.selection.commitId] : [],
			affectedPaths: pathsFromOperation(operation),
			diagnostics: [],
		};
	}

	if (operation.kind === "move_changes") {
		const validation = await validateGitMoveChangesOperation(repoCwd, runner, operation);
		if (validation) {
			return unsupportedGitPreview(operation, validation);
		}
		return {
			valid: true,
			operation,
			title: "Move changes",
			summary: `Move ${operation.selection.paths?.length ?? 0} selected path(s) from ${operation.selection.commitId?.slice(0, 12) ?? "HEAD"} into ${operation.targetCommitId.slice(0, 12)}.`,
			risk: "high" as const,
			disabledReason: null,
			warnings: [
				{
					code: "git_history_rewrite",
					message: "This rewrites the current Git branch HEAD commit and its direct parent.",
				},
			],
			conflicts: [],
			affectedStackIds: [],
			affectedCommitIds: operation.selection.commitId ? [operation.selection.commitId, operation.targetCommitId] : [operation.targetCommitId],
			affectedPaths: pathsFromOperation(operation),
			diagnostics: [],
		};
	}

	if (operation.kind === "restore_changes" || operation.kind === "discard_changes") {
		const validation = await validateWorkingCopyPathOperation(repoCwd, runner, operation);
		if (validation) {
			return unsupportedGitPreview(operation, validation);
		}
		const action = operation.kind === "restore_changes" ? "Restore changes" : "Discard changes";
		const selectionCount = selectedChangeCount(operation.selection);
		return {
			valid: true,
			operation,
			title: action,
			summary: `${action} for ${selectionCount} selected file/hunk item(s).`,
			risk: "high" as const,
			disabledReason: null,
			warnings: [
				{
					code: "git_destructive_restore",
					message: "This will discard selected tracked working-copy changes.",
				},
			],
			conflicts: [],
			affectedStackIds: [],
			affectedCommitIds: [],
			affectedPaths: pathsFromOperation(operation),
			diagnostics: [],
		};
	}

	if (!(await isWorkingTreeClean(repoCwd, runner))) {
		return unsupportedGitPreview(operation, "Commit or stash working-copy changes before switching Git workspace stacks.");
	}

	const checkoutRef =
		operation.kind === "apply_stack"
			? ((await localBranchExists(repoCwd, runner, operation.stackId)) ? operation.stackId : null)
			: await resolveLocalCheckoutRef(repoCwd, runner, defaultTargetRef(detect, options), detect.git.defaultBranch);
	if (!checkoutRef) {
		const reason =
			operation.kind === "apply_stack"
				? `Local branch ${operation.stackId} does not exist.`
				: "No local target/base branch is available for unapplying this Git stack.";
		return unsupportedGitPreview(operation, reason);
	}

	const action = operation.kind === "apply_stack" ? "Apply stack" : "Unapply stack";
	return {
		valid: true,
		operation,
		title: action,
		summary: `${action} by switching to ${checkoutRef}.`,
		risk: "medium" as const,
		disabledReason: null,
		warnings: [],
		conflicts: [],
		affectedStackIds: [operation.kind === "apply_stack" ? operation.stackId : checkoutRef],
		affectedCommitIds: [],
		affectedPaths: [],
		diagnostics: [],
	};
}

export async function applyGitWorkspaceOperation(
	cwd: string,
	input: NeutralOperationRequest,
	runner: VcsCommandRunner,
	options: GitWorkspaceOptions = {},
) {
	const operation = input.operation;
	if (operationUsesHunkSelection(operation) && !isGitHunkRestoreDiscardOperation(operation)) {
		return unsupportedGitApply(operation, "Git hunk-level workspace operations currently support working-copy restore and discard only.");
	}
	if (!isSupportedGitOperation(operation)) {
		return unsupportedGitApply(operation, `Git ${operation.kind.replaceAll("_", " ")} is not implemented in the neutral workspace engine yet.`);
	}

	const detect = await detectVcsState(cwd, runner);
	const repoCwd = detect.repository.root ?? cwd;
	if (detect.repository.kind !== "git") {
		return unsupportedGitApply(operation, "Git workspace operations are only available inside a Git repository.");
	}

	if (operation.kind === "reword_commit") {
		const validation = await validateHeadCommitOperation(repoCwd, runner, operation.commitId);
		if (validation) {
			return unsupportedGitApply(operation, validation);
		}
		const amendResult = await runner({
			command: "git",
			args: ["commit", "--amend", "-m", operation.message],
			cwd: repoCwd,
		});
		if (!amendResult.ok) {
			return unsupportedGitApply(operation, amendResult.stderr.trim() || "Could not update the Git commit message.");
		}
		const rewrittenHeadId = (await readHeadCommit(repoCwd, runner)) ?? operation.commitId;
		return {
			ok: true,
			operation,
			title: "Updated commit message",
			summary: `Updated ${operation.commitId.slice(0, 12)} commit message.`,
			affectedStackIds: [],
			affectedCommitIds: [...new Set([operation.commitId, rewrittenHeadId])],
			affectedPaths: [],
			recovery: null,
			diagnostics: [],
		};
	}

	if (operation.kind === "amend_commit") {
		const commitValidation = await validateHeadCommitOperation(repoCwd, runner, operation.commitId);
		if (commitValidation) {
			return unsupportedGitApply(operation, commitValidation);
		}
		const pathValidation = await validateWorkingCopyPathOperation(repoCwd, runner, {
			kind: "restore_changes",
			selection: operation.selection,
		});
		if (pathValidation) {
			return unsupportedGitApply(operation, pathValidation);
		}
		const paths = operation.selection.paths ?? [];
		const addResult = await runner({
			command: "git",
			args: ["add", "--", ...paths],
			cwd: repoCwd,
		});
		if (!addResult.ok) {
			return unsupportedGitApply(operation, addResult.stderr.trim() || "Could not stage selected Git paths.");
		}
		const amendResult = await runner({
			command: "git",
			args: ["commit", "--amend", "--no-edit"],
			cwd: repoCwd,
		});
		if (!amendResult.ok) {
			await runner({
				command: "git",
				args: ["restore", "--staged", "--", ...paths],
				cwd: repoCwd,
			});
			return unsupportedGitApply(operation, amendResult.stderr.trim() || "Could not amend the Git commit.");
		}
		const rewrittenHeadId = (await readHeadCommit(repoCwd, runner)) ?? operation.commitId;
		return {
			ok: true,
			operation,
			title: "Amended commit",
			summary: `Amended ${operation.commitId.slice(0, 12)} with ${paths.length} selected path(s).`,
			affectedStackIds: [],
			affectedCommitIds: [...new Set([operation.commitId, rewrittenHeadId])],
			affectedPaths: paths,
			recovery: null,
			diagnostics: [],
		};
	}

	if (operation.kind === "uncommit_changes") {
		const validation = await validateGitUncommitOperation(repoCwd, runner, operation);
		if (validation) {
			return unsupportedGitApply(operation, validation);
		}
		const paths = operation.selection.paths ?? [];
		const message = await readHeadCommitMessage(repoCwd, runner);
		if (!message) {
			return unsupportedGitApply(operation, "Could not read the Git HEAD commit message.");
		}
		const headBeforeRewrite = (await readHeadCommit(repoCwd, runner)) ?? operation.selection.commitId;
		if (!headBeforeRewrite) {
			return unsupportedGitApply(operation, "Could not read the Git HEAD commit before rewriting.");
		}
		const recoveryRef = `refs/changeyard/recovery/${headBeforeRewrite.slice(0, 12)}`;
		const recoveryResult = await runner({
			command: "git",
			args: ["update-ref", recoveryRef, headBeforeRewrite],
			cwd: repoCwd,
		});
		if (!recoveryResult.ok) {
			return unsupportedGitApply(operation, recoveryResult.stderr.trim() || "Could not create a Git recovery ref before rewriting commits.");
		}
		const resetResult = await runner({
			command: "git",
			args: ["reset", "--soft", "HEAD^"],
			cwd: repoCwd,
		});
		if (!resetResult.ok) {
			return failedGitRewriteApply(operation, resetResult.stderr.trim() || "Could not rewind the Git HEAD commit.", recoveryRef);
		}
		const unstageResult = await runner({
			command: "git",
			args: ["restore", "--staged", "--", ...paths],
			cwd: repoCwd,
		});
		if (!unstageResult.ok) {
			return failedGitRewriteApply(operation, unstageResult.stderr.trim() || "Could not unstage selected Git paths.", recoveryRef);
		}
		if (!(await isIndexClean(repoCwd, runner))) {
			const recommitResult = await runner({
				command: "git",
				args: ["commit", "-m", message],
				cwd: repoCwd,
			});
			if (!recommitResult.ok) {
				return failedGitRewriteApply(operation, recommitResult.stderr.trim() || "Could not recreate the remaining Git commit.", recoveryRef);
			}
		}
		return {
			ok: true,
			operation,
			title: "Uncommitted changes",
			summary: `Moved ${paths.length} selected path(s) from ${operation.selection.commitId?.slice(0, 12) ?? "HEAD"} to the working copy.`,
			affectedStackIds: [],
			affectedCommitIds: operation.selection.commitId ? [operation.selection.commitId] : [],
			affectedPaths: paths,
			recovery: {
				refName: recoveryRef,
				instructions: [`Run \`git reset --hard ${recoveryRef}\` to restore the branch tip from before this rewrite.`],
			},
			diagnostics: [],
		};
	}

	if (operation.kind === "move_changes") {
		const validation = await validateGitMoveChangesOperation(repoCwd, runner, operation);
		if (validation) {
			return unsupportedGitApply(operation, validation);
		}
		const sourceCommitId = operation.selection.commitId ?? "HEAD";
		const paths = operation.selection.paths ?? [];
		const sourceMessage = await readCommitMessage(repoCwd, runner, sourceCommitId);
		if (!sourceMessage) {
			return unsupportedGitApply(operation, "Could not read the Git source commit message.");
		}
		const sourceChangedPaths = await readCommitChangedPaths(repoCwd, runner, sourceCommitId);
		if (!sourceChangedPaths) {
			return unsupportedGitApply(operation, "Could not inspect the Git source commit paths.");
		}
		const remainingPaths = sourceChangedPaths.filter((path) => !paths.includes(path));
		const headBeforeRewrite = (await readHeadCommit(repoCwd, runner)) ?? sourceCommitId;
		const recoveryRef = `refs/changeyard/recovery/${headBeforeRewrite.slice(0, 12)}`;
		const recoveryResult = await runner({
			command: "git",
			args: ["update-ref", recoveryRef, headBeforeRewrite],
			cwd: repoCwd,
		});
		if (!recoveryResult.ok) {
			return unsupportedGitApply(operation, recoveryResult.stderr.trim() || "Could not create a Git recovery ref before rewriting commits.");
		}
		const resetResult = await runner({
			command: "git",
			args: ["reset", "--soft", "HEAD^"],
			cwd: repoCwd,
		});
		if (!resetResult.ok) {
			return failedGitRewriteApply(operation, resetResult.stderr.trim() || "Could not rewind the Git HEAD commit.", recoveryRef);
		}
		if (remainingPaths.length > 0) {
			const unstageRemainingResult = await runner({
				command: "git",
				args: ["restore", "--staged", "--", ...remainingPaths],
				cwd: repoCwd,
			});
			if (!unstageRemainingResult.ok) {
				return failedGitRewriteApply(
					operation,
					unstageRemainingResult.stderr.trim() || "Could not isolate selected Git paths for the target commit.",
					recoveryRef,
				);
			}
		}
		const amendTargetResult = await runner({
			command: "git",
			args: ["commit", "--amend", "--no-edit"],
			cwd: repoCwd,
		});
		if (!amendTargetResult.ok) {
			return failedGitRewriteApply(operation, amendTargetResult.stderr.trim() || "Could not amend the Git target commit.", recoveryRef);
		}
		if (remainingPaths.length > 0) {
			const stageRemainingResult = await runner({
				command: "git",
				args: ["add", "--", ...remainingPaths],
				cwd: repoCwd,
			});
			if (!stageRemainingResult.ok) {
				return failedGitRewriteApply(operation, stageRemainingResult.stderr.trim() || "Could not stage remaining Git source paths.", recoveryRef);
			}
			const recommitResult = await runner({
				command: "git",
				args: ["commit", "-m", sourceMessage],
				cwd: repoCwd,
			});
			if (!recommitResult.ok) {
				return failedGitRewriteApply(operation, recommitResult.stderr.trim() || "Could not recreate the remaining Git source commit.", recoveryRef);
			}
		}
		const rewrittenHeadId = (await readHeadCommit(repoCwd, runner)) ?? headBeforeRewrite;
		return {
			ok: true,
			operation,
			title: "Moved changes",
			summary: `Moved ${paths.length} selected path(s) from ${sourceCommitId.slice(0, 12)} into ${operation.targetCommitId.slice(0, 12)}.`,
			affectedStackIds: [],
			affectedCommitIds: [...new Set([sourceCommitId, operation.targetCommitId, rewrittenHeadId])],
			affectedPaths: paths,
			recovery: {
				refName: recoveryRef,
				instructions: [`Run \`git reset --hard ${recoveryRef}\` to restore the branch tip from before this rewrite.`],
			},
			diagnostics: [],
		};
	}

	if (operation.kind === "restore_changes" || operation.kind === "discard_changes") {
		const validation = await validateWorkingCopyPathOperation(repoCwd, runner, operation);
		if (validation) {
			return unsupportedGitApply(operation, validation);
		}
		const paths = operation.selection.paths ?? [];
		const hunks = operation.selection.hunks ?? [];
		const selectedPaths = [...new Set([...paths, ...hunks.map((hunk) => hunk.path)])];
		const files = await readWorkingCopyFilesForPaths(repoCwd, runner, selectedPaths);
		if (!files) {
			return unsupportedGitApply(operation, "Could not inspect selected Git working-copy paths.");
		}
		const untrackedPaths = operation.kind === "discard_changes"
			? files.filter((file) => file.status === "unknown").map((file) => file.path)
			: [];
		const trackedPaths = paths.filter((path) => !untrackedPaths.includes(path));
		if (hunks.length > 0) {
			const hunkResult = await applySelectedWorkingCopyHunks(repoCwd, runner, hunks);
			if (!hunkResult.ok) {
				return unsupportedGitApply(operation, hunkResult.reason);
			}
		}
		if (trackedPaths.length > 0) {
			const restoreResult = await runner({
				command: "git",
				args: ["restore", "--staged", "--worktree", "--", ...trackedPaths],
				cwd: repoCwd,
			});
			if (!restoreResult.ok) {
				return unsupportedGitApply(operation, restoreResult.stderr.trim() || "Could not restore selected Git working-copy changes.");
			}
		}
		if (untrackedPaths.length > 0) {
			const cleanResult = await runner({
				command: "git",
				args: ["clean", "-f", "--", ...untrackedPaths],
				cwd: repoCwd,
			});
			if (!cleanResult.ok) {
				return unsupportedGitApply(operation, cleanResult.stderr.trim() || "Could not remove selected Git untracked files.");
			}
		}
		const action = operation.kind === "restore_changes" ? "Restored changes" : "Discarded changes";
		const selectionCount = selectedChangeCount(operation.selection);
		return {
			ok: true,
			operation,
			title: action,
			summary: `${action} for ${selectionCount} selected file/hunk item(s).`,
			affectedStackIds: [],
			affectedCommitIds: [],
			affectedPaths: selectedPaths,
			recovery: null,
			diagnostics: [],
		};
	}

	if (!(await isWorkingTreeClean(repoCwd, runner))) {
		return unsupportedGitApply(operation, "Commit or stash working-copy changes before switching Git workspace stacks.");
	}

	const checkoutRef =
		operation.kind === "apply_stack"
			? ((await localBranchExists(repoCwd, runner, operation.stackId)) ? operation.stackId : null)
			: await resolveLocalCheckoutRef(repoCwd, runner, defaultTargetRef(detect, options), detect.git.defaultBranch);
	if (!checkoutRef) {
		const reason =
			operation.kind === "apply_stack"
				? `Local branch ${operation.stackId} does not exist.`
				: "No local target/base branch is available for unapplying this Git stack.";
		return unsupportedGitApply(operation, reason);
	}

	const switchResult = await runner({
		command: "git",
		args: ["switch", checkoutRef],
		cwd: repoCwd,
	});
	if (!switchResult.ok) {
		return unsupportedGitApply(operation, switchResult.stderr.trim() || `Could not switch to ${checkoutRef}.`);
	}

	const action = operation.kind === "apply_stack" ? "Applied stack" : "Unapplied stack";
	return {
		ok: true,
		operation,
		title: action,
		summary: `${action} by switching to ${checkoutRef}.`,
		affectedStackIds: [operation.kind === "apply_stack" ? operation.stackId : checkoutRef],
		affectedCommitIds: [],
		affectedPaths: [],
		recovery: null,
		diagnostics: [],
	};
}

function unsupportedGitPreview(operation: NeutralOperation, reason: string) {
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
		diagnostics: [createDiagnostic("warning", "git_workspace_operation_unsupported", reason)],
	};
}

function unsupportedGitApply(operation: NeutralOperation, reason: string) {
	return {
		ok: false,
		operation,
		title: "Operation unavailable",
		summary: reason,
		affectedStackIds: stackIdsFromOperation(operation),
		affectedCommitIds: commitIdsFromOperation(operation),
		affectedPaths: pathsFromOperation(operation),
		recovery: {
			instructions: [
				"No repository changes were attempted by Changeyard.",
				"Commit or stash local changes, then retry the workspace operation.",
			],
		},
		diagnostics: [createDiagnostic("warning", "git_workspace_operation_unsupported", reason)],
	};
}

function failedGitRewriteApply(operation: NeutralOperation, reason: string, recoveryRef: string) {
	return {
		ok: false,
		operation,
		title: "Operation failed",
		summary: reason,
		affectedStackIds: stackIdsFromOperation(operation),
		affectedCommitIds: commitIdsFromOperation(operation),
		affectedPaths: pathsFromOperation(operation),
		recovery: {
			refName: recoveryRef,
			instructions: [`Run \`git reset --hard ${recoveryRef}\` to restore the branch tip from before this rewrite.`],
		},
		diagnostics: [createDiagnostic("warning", "git_workspace_rewrite_failed", reason)],
	};
}

function isSupportedGitOperation(operation: NeutralOperation): boolean {
	return (
		operation.kind === "apply_stack" ||
		operation.kind === "unapply_stack" ||
		operation.kind === "reword_commit" ||
		operation.kind === "amend_commit" ||
		operation.kind === "move_changes" ||
		operation.kind === "uncommit_changes" ||
		operation.kind === "restore_changes" ||
		operation.kind === "discard_changes"
	);
}

function operationUsesHunkSelection(operation: NeutralOperation): boolean {
	return "selection" in operation && Boolean(operation.selection?.hunks?.length);
}

function isGitHunkRestoreDiscardOperation(
	operation: NeutralOperation,
): operation is Extract<NeutralOperation, { kind: "restore_changes" | "discard_changes" }> {
	return (
		(operation.kind === "restore_changes" || operation.kind === "discard_changes") &&
		Boolean(operation.selection.hunks?.length)
	);
}

async function validateHeadCommitOperation(
	repoCwd: string,
	runner: VcsCommandRunner,
	commitId: string,
): Promise<string | null> {
	const [headCommit, selectedCommit, indexClean] = await Promise.all([
		readHeadCommit(repoCwd, runner),
		resolveCommit(repoCwd, runner, commitId),
		isIndexClean(repoCwd, runner),
	]);
	if (!headCommit || !selectedCommit) {
		return "Could not resolve the selected Git commit.";
	}
	if (headCommit !== selectedCommit) {
		return "Git commit edits currently support the current branch HEAD commit only.";
	}
	if (!indexClean) {
		return "Unstage existing index changes before editing a Git commit.";
	}
	return null;
}

async function validateWorkingCopyPathOperation(
	repoCwd: string,
	runner: VcsCommandRunner,
	operation: Extract<NeutralOperation, { kind: "restore_changes" | "discard_changes" }>,
): Promise<string | null> {
	const paths = operation.selection.paths ?? [];
	const hunks = operation.selection.hunks ?? [];
	if (operation.selection.source !== "working_copy") {
		return "Git restore currently supports selected working-copy paths only.";
	}
	if (paths.length === 0 && hunks.length === 0) {
		return "Choose one or more paths or hunks to restore.";
	}
	const overlappingPath = paths.find((path) => hunks.some((hunk) => hunk.path === path));
	if (overlappingPath) {
		return `Choose either the whole file or individual hunks for ${overlappingPath}, not both.`;
	}
	const selectedPaths = [...new Set([...paths, ...hunks.map((hunk) => hunk.path)])];
	const files = await readWorkingCopyFilesForPaths(repoCwd, runner, selectedPaths);
	if (files === null) {
		return "Could not inspect selected Git working-copy paths.";
	}
	if (operation.kind === "restore_changes" && files.some((file) => file.status === "unknown")) {
		return "Git restore does not apply to untracked files. Use discard to remove selected untracked files.";
	}
	if (hunks.length > 0) {
		const hunkValidation = await validateSelectedWorkingCopyHunks(repoCwd, runner, hunks);
		if (hunkValidation) {
			return hunkValidation;
		}
	}
	return null;
}

async function validateGitUncommitOperation(
	repoCwd: string,
	runner: VcsCommandRunner,
	operation: Extract<NeutralOperation, { kind: "uncommit_changes" }>,
): Promise<string | null> {
	const paths = operation.selection.paths ?? [];
	if (operation.selection.source !== "commit" || !operation.selection.commitId) {
		return "Git uncommit currently supports selected paths from a source commit only.";
	}
	const commitValidation = await validateHeadCommitOperation(repoCwd, runner, operation.selection.commitId);
	if (commitValidation) {
		return commitValidation;
	}
	if (paths.length === 0) {
		return "Choose one or more paths to uncommit.";
	}
	if (!(await isWorkingTreeClean(repoCwd, runner))) {
		return "Commit or stash working-copy changes before uncommitting Git paths.";
	}
	return null;
}

async function validateGitMoveChangesOperation(
	repoCwd: string,
	runner: VcsCommandRunner,
	operation: Extract<NeutralOperation, { kind: "move_changes" }>,
): Promise<string | null> {
	const paths = operation.selection.paths ?? [];
	if (operation.selection.source !== "commit" || !operation.selection.commitId) {
		return "Git move changes currently supports selected paths from a source commit only.";
	}
	const [headCommit, sourceCommit, targetCommit] = await Promise.all([
		readHeadCommit(repoCwd, runner),
		resolveCommit(repoCwd, runner, operation.selection.commitId),
		resolveCommit(repoCwd, runner, operation.targetCommitId),
	]);
	if (!headCommit || !sourceCommit || !targetCommit) {
		return "Could not resolve the selected Git source or target commit.";
	}
	if (headCommit !== sourceCommit) {
		return "Git move changes currently supports moving paths from the current branch HEAD commit only.";
	}
	const parentCommit = await readFirstParentCommit(repoCwd, runner, sourceCommit);
	if (parentCommit !== targetCommit) {
		return "Git move changes currently supports moving paths from HEAD into its direct parent commit only.";
	}
	if (paths.length === 0) {
		return "Choose one or more paths to move.";
	}
	if (!(await isWorkingTreeClean(repoCwd, runner))) {
		return "Commit or stash working-copy changes before moving Git paths between commits.";
	}
	const changedPaths = await readCommitChangedPaths(repoCwd, runner, sourceCommit);
	if (!changedPaths) {
		return "Could not inspect the selected Git source commit paths.";
	}
	const missingPath = paths.find((path) => !changedPaths.includes(path));
	if (missingPath) {
		return `Selected path ${missingPath} is not changed by the Git source commit.`;
	}
	return null;
}

async function readWorkingCopyFilesForPaths(
	repoCwd: string,
	runner: VcsCommandRunner,
	paths: string[],
): Promise<Array<{ path: string; previousPath?: string | null; status: GitFileStatus }> | null> {
	const status = await readRawStatusForPaths(repoCwd, runner, paths);
	return status === null ? null : parsePorcelainStatus(status);
}

async function validateSelectedWorkingCopyHunks(
	repoCwd: string,
	runner: VcsCommandRunner,
	hunks: GitHunkSelection[],
): Promise<string | null> {
	const patch = await buildSelectedWorkingCopyHunkPatch(repoCwd, runner, hunks);
	if (!patch.ok) {
		return patch.reason;
	}
	return null;
}

async function applySelectedWorkingCopyHunks(
	repoCwd: string,
	runner: VcsCommandRunner,
	hunks: GitHunkSelection[],
): Promise<{ ok: true } | { ok: false; reason: string }> {
	const patch = await buildSelectedWorkingCopyHunkPatch(repoCwd, runner, hunks);
	if (!patch.ok) {
		return patch;
	}
	const applyResult = await runner({
		command: "git",
		args: ["apply", "--reverse", "--whitespace=nowarn", "-"],
		cwd: repoCwd,
		stdin: patch.patch,
	});
	if (!applyResult.ok) {
		return {
			ok: false,
			reason: applyResult.stderr.trim() || "Could not restore selected Git working-copy hunks.",
		};
	}
	return { ok: true };
}

async function buildSelectedWorkingCopyHunkPatch(
	repoCwd: string,
	runner: VcsCommandRunner,
	hunks: GitHunkSelection[],
): Promise<{ ok: true; patch: string } | { ok: false; reason: string }> {
	const paths = [...new Set(hunks.map((hunk) => hunk.path))];
	const diffResult = await runner({
		command: "git",
		args: ["diff", "--patch", "--find-renames", "--diff-algorithm=histogram", "--", ...paths],
		cwd: repoCwd,
	});
	if (!diffResult.ok) {
		return {
			ok: false,
			reason: diffResult.stderr.trim() || "Could not read Git working-copy hunks.",
		};
	}
	const patchFiles = parseGitPatchFiles(diffResult.stdout);
	const patchLines: string[] = [];
	for (const file of patchFiles) {
		const selectedHunks = hunks.filter((hunk) => hunk.path === file.path);
		if (selectedHunks.length === 0) {
			continue;
		}
		const matchedHunks: GitPatchHunk[] = [];
		for (const selection of selectedHunks) {
			const match = file.hunks.find((hunk) => hunkMatchesSelection(file.path, hunk, selection));
			if (!match) {
				return {
					ok: false,
					reason: `Could not match selected Git hunk ${selection.hunkId} in ${selection.path}. Refresh the workspace and retry.`,
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
		return {
			ok: false,
			reason: "Could not build a Git patch for the selected hunks.",
		};
	}
	return { ok: true, patch: `${patchLines.join("\n")}\n` };
}

function parseGitPatchFiles(patch: string): GitPatchFile[] {
	const files: GitPatchFile[] = [];
	let currentFile: GitPatchFile | null = null;
	let currentHunk: GitPatchHunk | null = null;
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
			const parsed = parseGitHunkHeader(line);
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

function parseGitHunkHeader(header: string): Omit<GitPatchHunk, "id" | "lines"> {
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

function hunkMatchesSelection(path: string, hunk: GitPatchHunk, selection: GitHunkSelection): boolean {
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

function selectedChangeCount(selection: NeutralSelection): number {
	return (selection.paths?.length ?? 0) + (selection.hunks?.length ?? 0);
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
		case "apply_stack":
		case "unapply_stack":
		case "create_stack":
		case "create_commit":
		case "restore_changes":
		case "discard_changes":
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

export async function loadGitWorkspaceStacks(
	cwd: string,
	runner: VcsCommandRunner,
	options: GitWorkspaceOptions = {},
) {
	const state = await loadGitWorkspaceState(cwd, runner, options);
	return { stacks: state.stacks };
}

export async function loadGitWorkspaceDiff(cwd: string, runner: VcsCommandRunner) {
	const detect = await detectVcsState(cwd, runner);
	const repoCwd = detect.repository.root ?? cwd;
	if (detect.repository.kind !== "git") {
		return {
			ok: false,
			summary: "",
			patch: "",
			files: [],
			diagnostics: [createDiagnostic("warning", "git_repo_required", "Git diff is only available inside a Git repository.")],
		};
	}
	const [nameStatusResult, patchResult] = await Promise.all([
		runner({ command: "git", args: ["diff", "--name-status", "--find-renames"], cwd: repoCwd }),
		runner({ command: "git", args: ["diff", "--patch", "--find-renames", "--diff-algorithm=histogram"], cwd: repoCwd }),
	]);
	const files = nameStatusResult.ok
		? nameStatusResult.stdout
				.split("\n")
				.map((line) => line.trim())
				.filter(Boolean)
				.map((line) => {
					const [statusCode = "", firstPath = "", secondPath] = line.split("\t");
					return {
						path: secondPath || firstPath,
						previousPath: secondPath ? firstPath : null,
						status: mapGitStatus(statusCode),
					};
				})
		: [];
	return {
		ok: patchResult.ok,
		summary: nameStatusResult.ok ? nameStatusResult.stdout : "",
		patch: patchResult.ok ? patchResult.stdout : "",
		files,
		diagnostics: [
			...(nameStatusResult.ok ? [] : [createDiagnostic("warning", "git_diff_summary_failed", "Could not load Git diff summary.")]),
			...(patchResult.ok ? [] : [createDiagnostic("warning", "git_diff_patch_failed", "Could not load Git patch output.")]),
		],
	};
}
