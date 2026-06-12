import { createHash } from "node:crypto";

import { detectVcsState, type VcsCommandRunner } from "../detect.js";
import { isInternalJjBookmark } from "./bookmark-utils.js";
import type {
	VcsDiagnostic,
	VcsJjOperationCommit,
	VcsJjOperationDiffResult,
	VcsJjOperationEntry,
	VcsJjOperationFile,
	VcsJjOperationsResult,
} from "../types.js";

const FIELD_SEPARATOR = "\t";

function createDiagnostic(level: VcsDiagnostic["level"], code: string, message: string): VcsDiagnostic {
	return { level, code, message };
}

function normalizeOperationDescription(description: string): string {
	const trimmed = description.trim();
	return trimmed.length > 0 ? trimmed : "Operation";
}

function normalizeOperationId(id: string): string {
	return id.trim();
}

function gravatarUrlForEmail(email: string | null | undefined): string | null {
	const normalized = email?.trim().toLowerCase();
	if (!normalized) {
		return null;
	}
	const hash = createHash("md5").update(normalized).digest("hex");
	return `https://www.gravatar.com/avatar/${hash}?s=80&d=identicon`;
}

function parseList(value: string | undefined): string[] {
	return value?.split("|").map((entry) => entry.trim()).filter(Boolean) ?? [];
}

function parseUserFacingBookmarks(...values: Array<string | undefined>): string[] {
	const bookmarks = values.flatMap((value) => parseList(value));
	return [...new Set(bookmarks.filter((bookmark) => !isInternalJjBookmark(bookmark)))];
}

function parseLabels(...values: Array<string | undefined>): string[] {
	return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

export function parseJjOperationFiles(output: string): VcsJjOperationFile[] {
	const files: VcsJjOperationFile[] = [];
	for (const line of output.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) {
			continue;
		}
		const simpleMatch = /^([A-Z])\s+(.+)$/.exec(trimmed);
		if (simpleMatch?.[1] && simpleMatch[2]) {
			files.push({
				status: normalizeStatus(simpleMatch[1]),
				path: simpleMatch[2],
			});
			continue;
		}
		const verboseMatch = /^(Added|Modified|Deleted|Renamed|Copied)\s+(?:regular\s+)?file\s+(.+):?$/i.exec(trimmed);
		if (verboseMatch?.[1] && verboseMatch[2]) {
			files.push({
				status: normalizeVerboseStatus(verboseMatch[1]),
				path: verboseMatch[2].replace(/:$/, ""),
			});
		}
	}
	const seen = new Set<string>();
	return files.filter((file) => {
		const key = `${file.status}:${file.path}`;
		if (seen.has(key)) {
			return false;
		}
		seen.add(key);
		return true;
	});
}

function normalizeStatus(code: string): VcsJjOperationFile["status"] {
	switch (code) {
		case "M":
			return "modified";
		case "A":
			return "added";
		case "D":
			return "deleted";
		case "R":
			return "renamed";
		case "C":
			return "copied";
		default:
			return "unknown";
	}
}

function normalizeVerboseStatus(label: string): VcsJjOperationFile["status"] {
	switch (label.toLowerCase()) {
		case "modified":
			return "modified";
		case "added":
			return "added";
		case "deleted":
			return "deleted";
		case "renamed":
			return "renamed";
		case "copied":
			return "copied";
		default:
			return "unknown";
	}
}

async function readOperationFiles(cwd: string, operationId: string, runner: VcsCommandRunner): Promise<VcsJjOperationFile[]> {
	const result = await runner({
		command: "jj",
		args: ["op", "show", "--ignore-working-copy", "--at-op=@", operationId, "--summary", "--no-graph"],
		cwd,
	});
	return result.ok ? parseJjOperationFiles(result.stdout) : [];
}

async function readOperationCommits(
	cwd: string,
	operationId: string,
	runner: VcsCommandRunner,
	options: { skip?: number; limit?: number } = {},
): Promise<{
	commits: VcsJjOperationCommit[];
	totalCommitCount: number;
	hasMoreCommits: boolean;
	diagnostic: VcsDiagnostic | null;
}> {
	const normalizedSkip = Math.max(0, options.skip ?? 0);
	const normalizedLimit = Math.max(1, Math.min(options.limit ?? 50, 500));
	const jjLimit = normalizedSkip + normalizedLimit;
	const [countResult, result] = await Promise.all([
		runner({
			command: "jj",
			args: ["log", "--ignore-working-copy", `--at-op=${operationId}`, "-r", "all()", "--no-graph", "--count"],
			cwd,
		}),
		runner({
			command: "jj",
			args: [
				"log",
				"--ignore-working-copy",
				`--at-op=${operationId}`,
				"-r",
				"all()",
				"--no-graph",
				"-n",
				String(jjLimit),
				"-T",
				'change_id.short() ++ "\\t" ++ change_id.shortest() ++ "\\t" ++ commit_id.short() ++ "\\t" ++ commit_id ++ "\\t" ++ description.first_line().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.name().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.email() ++ "\\t" ++ author.timestamp() ++ "\\t" ++ parents.map(|c| c.commit_id()).join("|") ++ "\\t" ++ local_bookmarks.map(|b| b.name()).join("|") ++ "\\t" ++ remote_bookmarks.map(|b| separate("@", b.name(), b.remote())).join("|") ++ "\\t" ++ if(conflict, "conflict", "") ++ "\\t" ++ if(divergent, "divergent", "") ++ "\\t" ++ if(empty, "empty", "") ++ "\\t" ++ if(hidden, "hidden", "") ++ "\\n"',
			],
			cwd,
		}),
	]);
	if (!result.ok) {
		return {
			commits: [],
			totalCommitCount: 0,
			hasMoreCommits: false,
			diagnostic: createDiagnostic(
				"warning",
				"jj_operation_commits_failed",
				result.stderr || result.stdout || "JJ could not provide commit graph data for this operation.",
			),
		};
	}

	const commits: VcsJjOperationCommit[] = [];
	for (const line of result.stdout.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) {
			continue;
		}
		const [
			changeId = "",
			changeIdUniquePrefix = "",
			shortHash = "",
			hash = "",
			message = "",
			authorName = "",
			authorEmail = "",
			date = "",
			parentHashes = "",
			localBookmarks = "",
			remoteBookmarks = "",
			conflictLabel = "",
			divergentLabel = "",
			emptyLabel = "",
			hiddenLabel = "",
		] = trimmed.split(FIELD_SEPARATOR);
		const normalizedHash = hash.trim();
		if (!normalizedHash) {
			continue;
		}
		const normalizedAuthorEmail = authorEmail.trim();
		commits.push({
			hash: normalizedHash,
			shortHash: shortHash.trim() || normalizedHash.slice(0, 12),
			changeId: changeId.trim() || undefined,
			changeIdUniquePrefix: changeIdUniquePrefix.trim() || undefined,
			authorName: authorName.trim() || "Unknown",
			authorEmail: normalizedAuthorEmail,
			authorAvatarUrl: gravatarUrlForEmail(normalizedAuthorEmail),
			date: date.trim(),
			message: message.trim() || "(no description)",
			parentHashes: parseList(parentHashes),
			bookmarks: parseUserFacingBookmarks(localBookmarks, remoteBookmarks),
			labels: parseLabels(conflictLabel, divergentLabel, emptyLabel, hiddenLabel),
			relation: "selected",
		});
	}

	const totalCommitCount = countResult.ok ? Math.max(0, Number.parseInt(countResult.stdout.trim(), 10) || 0) : commits.length;
	const paginatedCommits = commits.slice(normalizedSkip, normalizedSkip + normalizedLimit);
	return {
		commits: paginatedCommits,
		totalCommitCount,
		hasMoreCommits: normalizedSkip + paginatedCommits.length < totalCommitCount,
		diagnostic: countResult.ok
			? null
			: createDiagnostic(
					"warning",
					"jj_operation_commit_count_failed",
					countResult.stderr || countResult.stdout || "JJ could not count commits for this operation.",
				),
	};
}

export async function loadJjOperations(
	cwd: string,
	runner: VcsCommandRunner,
	limit = 30,
): Promise<VcsJjOperationsResult> {
	const detect = await detectVcsState(cwd, runner);
	const normalizedLimit = Math.max(1, Math.min(limit, 1000));
	if (detect.repository.kind !== "jj") {
		return {
			operations: [],
			requestedLimit: normalizedLimit,
			hasMore: false,
			diagnostics: [
				...detect.diagnostics,
				createDiagnostic("warning", "jj_repo_required", "JJ operation history is only available inside a JJ repository."),
			],
		};
	}
	const repoCwd = detect.repository.root ?? cwd;
	const result = await runner({
		command: "jj",
		args: [
			"op",
			"log",
			"--ignore-working-copy",
			"--at-op=@",
			"--no-graph",
			"-n",
			String(normalizedLimit),
			"-T",
			'id.short() ++ "\\t" ++ description ++ "\\t" ++ user ++ "\\t" ++ time.start() ++ "\\n"',
		],
		cwd: repoCwd,
	});
	if (!result.ok) {
		return {
			operations: [],
			requestedLimit: normalizedLimit,
			hasMore: false,
			diagnostics: [
				...detect.diagnostics,
				createDiagnostic("error", "jj_operations_failed", result.stderr || result.stdout || "Failed to read JJ operation history."),
			],
		};
	}
	const operations: VcsJjOperationEntry[] = [];
	for (const line of result.stdout.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) {
			continue;
		}
		const [id = "", description = "", user = "", timestamp = ""] = trimmed.split(FIELD_SEPARATOR);
		const normalizedId = normalizeOperationId(id);
		if (!normalizedId) {
			continue;
		}
		operations.push({
			id: normalizedId,
			shortId: normalizedId.slice(0, 12),
			description: normalizeOperationDescription(description),
			user: user.trim() || null,
			timestamp: timestamp.trim() || null,
			files: [],
			restoreEligible: true,
		});
	}

	const operationsWithFiles = await Promise.all(
		operations.map(async (operation) => ({
			...operation,
			files: await readOperationFiles(repoCwd, operation.id, runner),
		})),
	);

	return {
		operations: operationsWithFiles,
		requestedLimit: normalizedLimit,
		hasMore: operationsWithFiles.length >= normalizedLimit,
		diagnostics: detect.diagnostics,
	};
}

export async function loadJjOperationDiff(
	cwd: string,
	runner: VcsCommandRunner,
	operationId: string,
	options: { commitSkip?: number | null; commitLimit?: number | null } = {},
): Promise<VcsJjOperationDiffResult> {
	const detect = await detectVcsState(cwd, runner);
	const normalizedOperationId = operationId.trim();
	const commitSkip = Math.max(0, options.commitSkip ?? 0);
	const commitLimit = Math.max(1, Math.min(options.commitLimit ?? 50, 500));
	if (!normalizedOperationId) {
		return {
			operationId,
			summary: "",
			patch: "",
			files: [],
			commits: [],
			commitSkip,
			commitLimit,
			totalCommitCount: 0,
			hasMoreCommits: false,
			diagnostics: [createDiagnostic("error", "operation_required", "Choose an operation before loading details.")],
		};
	}
	if (detect.repository.kind !== "jj") {
		return {
			operationId: normalizedOperationId,
			summary: "",
			patch: "",
			files: [],
			commits: [],
			commitSkip,
			commitLimit,
			totalCommitCount: 0,
			hasMoreCommits: false,
			diagnostics: [
				...detect.diagnostics,
				createDiagnostic("warning", "jj_repo_required", "JJ operation details are only available inside a JJ repository."),
			],
		};
	}
	const repoCwd = detect.repository.root ?? cwd;
	const [summaryResult, patchResult] = await Promise.all([
		runner({
			command: "jj",
			args: ["op", "show", "--ignore-working-copy", "--at-op=@", normalizedOperationId, "--summary", "--no-graph"],
			cwd: repoCwd,
		}),
		runner({
			command: "jj",
			args: ["op", "show", "--ignore-working-copy", "--at-op=@", normalizedOperationId, "--patch", "--no-graph"],
			cwd: repoCwd,
		}),
	]);
	const operationCommits = await readOperationCommits(repoCwd, normalizedOperationId, runner, {
		skip: commitSkip,
		limit: commitLimit,
	});
	const diagnostics = [...detect.diagnostics];
	if (operationCommits.diagnostic) {
		diagnostics.push(operationCommits.diagnostic);
	}
	if (!summaryResult.ok) {
		diagnostics.push(
			createDiagnostic("error", "jj_operation_summary_failed", summaryResult.stderr || summaryResult.stdout || "Failed to read operation summary."),
		);
	}
	if (!patchResult.ok) {
		diagnostics.push(
			createDiagnostic(
				"warning",
				"jj_operation_patch_failed",
				patchResult.stderr || patchResult.stdout || "JJ could not provide patch details for this operation.",
			),
		);
	}
	const summary = summaryResult.ok ? summaryResult.stdout : "";
	const patch = patchResult.ok ? patchResult.stdout : "";
	return {
		operationId: normalizedOperationId,
		summary,
		patch,
		files: parseJjOperationFiles(`${summary}\n${patch}`),
		commits: operationCommits.commits,
		commitSkip,
		commitLimit,
		totalCommitCount: operationCommits.totalCommitCount,
		hasMoreCommits: operationCommits.hasMoreCommits,
		diagnostics,
	};
}
