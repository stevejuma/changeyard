import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";

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

type OperationListCursor =
	| {
			kind: "operations";
			atOp: string;
			lastOperationId: string;
	  }
	| {
			kind: "operations-limit";
			atOp: string;
			limit: number;
	  };

type OperationCommitCursor = {
	kind: "operation-commits";
	atOp: string;
	scopeKey: string;
	frontierCommitIds: string[];
	totalCount?: number;
};

type ParsedOperation = VcsJjOperationEntry & {
	parentOperationIds: string[];
};

const OPERATION_LIST_TEMPLATE =
	'self.id() ++ "\\t" ++ description ++ "\\t" ++ user ++ "\\t" ++ time.start() ++ "\\t" ++ parents.map(|op| op.id()).join("|") ++ "\\n"';
const OPERATION_COMMIT_TEMPLATE =
	'change_id.short() ++ "\\t" ++ change_id.shortest() ++ "\\t" ++ commit_id.short() ++ "\\t" ++ commit_id ++ "\\t" ++ description.first_line().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.name().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.email() ++ "\\t" ++ author.timestamp() ++ "\\t" ++ parents.map(|c| c.commit_id()).join("|") ++ "\\t" ++ local_bookmarks.map(|b| b.name()).join("|") ++ "\\t" ++ remote_bookmarks.map(|b| separate("@", b.name(), b.remote())).join("|") ++ "\\t" ++ if(conflict, "conflict", "") ++ "\\t" ++ if(divergent, "divergent", "") ++ "\\t" ++ if(empty, "empty", "") ++ "\\t" ++ if(hidden, "hidden", "") ++ "\\n"';

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

function encodeCursor(value: OperationListCursor | OperationCommitCursor): string {
	return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeCursor<T>(cursor: string | null | undefined): T | null {
	if (!cursor) {
		return null;
	}
	try {
		return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as T;
	} catch {
		return null;
	}
}

function isHexId(value: string): boolean {
	return /^[0-9a-f]+$/i.test(value);
}

function commitIdRevset(commitIds: string[]): string {
	const safeIds = [...new Set(commitIds.map((id) => id.trim()).filter(isHexId))];
	if (safeIds.length === 0) {
		return "none()";
	}
	return safeIds.map((id) => `commit_id(${id})`).join(" | ");
}

export function advanceCommitCursorFrontier(currentFrontier: string[], emittedCommits: Array<{ hash: string; parentHashes: string[] }>): string[] {
	const emitted = new Set(emittedCommits.map((commit) => commit.hash));
	const next = new Set<string>();
	for (const commitId of currentFrontier) {
		if (!emitted.has(commitId)) {
			next.add(commitId);
		}
	}
	for (const commit of emittedCommits) {
		for (const parentHash of commit.parentHashes) {
			if (parentHash && !emitted.has(parentHash)) {
				next.add(parentHash);
			}
		}
	}
	return Array.from(next);
}

function frontierRevset(scopeRevset: string, frontierCommitIds: string[]): string {
	return `(${scopeRevset}) & ::(${commitIdRevset(frontierCommitIds)})`;
}

async function resolveOperationId(cwd: string, operationId: string, runner: VcsCommandRunner): Promise<string> {
	const result = await runner({
		command: "jj",
		args: ["op", "log", "--ignore-working-copy", `--at-op=${operationId}`, "--no-graph", "-n", "1", "-T", 'self.id() ++ "\\n"'],
		cwd,
	});
	const resolved = result.ok ? result.stdout.trim() : "";
	return resolved || operationId;
}

async function resolveCurrentOperationId(cwd: string, runner: VcsCommandRunner): Promise<string | null> {
	const result = await runner({
		command: "jj",
		args: ["op", "log", "--ignore-working-copy", "--at-op=@", "--no-graph", "-n", "1", "-T", 'self.id() ++ "\\n"'],
		cwd,
	});
	const resolved = result.ok ? result.stdout.trim() : "";
	return resolved || null;
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

function parseOperationLines(output: string): ParsedOperation[] {
	const operations: ParsedOperation[] = [];
	for (const line of output.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) {
			continue;
		}
		const [id = "", description = "", user = "", timestamp = "", parentOperationIds = ""] = trimmed.split(FIELD_SEPARATOR);
		const normalizedId = normalizeOperationId(id);
		if (!normalizedId) {
			continue;
		}
		operations.push({
			id: normalizedId,
			shortId: normalizedId.slice(0, 12),
			description: normalizeOperationDescription(description),
			user: user.trim() || null,
			userAvatarUrl: gravatarUrlForEmail(user),
			timestamp: timestamp.trim() || null,
			files: [],
			restoreEligible: true,
			parentOperationIds: parseList(parentOperationIds),
		});
	}
	return operations;
}

function toPublicOperation(operation: ParsedOperation): VcsJjOperationEntry {
	return {
		id: operation.id,
		shortId: operation.shortId,
		description: operation.description,
		user: operation.user,
		userAvatarUrl: operation.userAvatarUrl,
		timestamp: operation.timestamp,
		files: operation.files,
		restoreEligible: operation.restoreEligible,
	};
}

function parseOperationCommitLines(output: string): VcsJjOperationCommit[] {
	const commits: VcsJjOperationCommit[] = [];
	for (const line of output.split("\n")) {
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
	return commits;
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
	options: { skip?: number; limit?: number; cursor?: string | null; pageSize?: number | null } = {},
): Promise<{
	commits: VcsJjOperationCommit[];
	totalCommitCount: number;
	hasMoreCommits: boolean;
	nextCursor: string | null;
	diagnostic: VcsDiagnostic | null;
}> {
	if (options.cursor || options.pageSize) {
		return await readOperationCommitsByCursor(cwd, operationId, runner, options);
	}

	const normalizedSkip = Math.max(0, options.skip ?? 0);
	const normalizedLimit = Math.max(1, Math.min(options.limit ?? 50, 500));
	const jjLimit = normalizedSkip + normalizedLimit;
	const [countResult, result] = await Promise.all([
		runner({
			command: "jj",
			args: ["log", "--ignore-working-copy", `--at-op=${operationId}`, "-r", "all()", "--count"],
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
				OPERATION_COMMIT_TEMPLATE,
			],
			cwd,
		}),
	]);
	if (!result.ok) {
		return {
			commits: [],
			totalCommitCount: 0,
			hasMoreCommits: false,
			nextCursor: null,
			diagnostic: createDiagnostic(
				"warning",
				"jj_operation_commits_failed",
				result.stderr || result.stdout || "JJ could not provide commit graph data for this operation.",
			),
		};
	}

	const commits = parseOperationCommitLines(result.stdout);

	const totalCommitCount = countResult.ok ? Math.max(0, Number.parseInt(countResult.stdout.trim(), 10) || 0) : commits.length;
	const paginatedCommits = commits.slice(normalizedSkip, normalizedSkip + normalizedLimit);
	return {
		commits: paginatedCommits,
		totalCommitCount,
		hasMoreCommits: normalizedSkip + paginatedCommits.length < totalCommitCount,
		nextCursor: null,
		diagnostic: countResult.ok
			? null
			: createDiagnostic(
					"warning",
					"jj_operation_commit_count_failed",
					countResult.stderr || countResult.stdout || "JJ could not count commits for this operation.",
				),
	};
}

async function readInitialCommitFrontier(cwd: string, atOp: string, scopeRevset: string, runner: VcsCommandRunner): Promise<string[]> {
	const result = await runner({
		command: "jj",
		args: [
			"log",
			"--ignore-working-copy",
			`--at-op=${atOp}`,
			"-r",
			`heads(${scopeRevset})`,
			"--no-graph",
			"-T",
			'commit_id ++ "\\n"',
		],
		cwd,
	});
	if (!result.ok) {
		return [];
	}
	return result.stdout.split("\n").map((line) => line.trim()).filter(isHexId);
}

async function readOperationCommitsByCursor(
	cwd: string,
	operationId: string,
	runner: VcsCommandRunner,
	options: { cursor?: string | null; pageSize?: number | null },
): Promise<{
	commits: VcsJjOperationCommit[];
	totalCommitCount: number;
	hasMoreCommits: boolean;
	nextCursor: string | null;
	diagnostic: VcsDiagnostic | null;
}> {
	const normalizedLimit = Math.max(1, Math.min(options.pageSize ?? 50, 500));
	const scopeRevset = "all()";
	const resolvedOperationId = await resolveOperationId(cwd, operationId, runner);
	const scopeKey = `operation:${resolvedOperationId}:all`;
	const decoded = decodeCursor<OperationCommitCursor>(options.cursor);
	const validCursor =
		decoded?.kind === "operation-commits" &&
		decoded.scopeKey === scopeKey &&
		decoded.atOp === resolvedOperationId &&
		Array.isArray(decoded.frontierCommitIds);
	const atOp = validCursor ? decoded.atOp : resolvedOperationId;
	const initialFrontier = validCursor
		? decoded.frontierCommitIds.filter(isHexId)
		: await readInitialCommitFrontier(cwd, atOp, scopeRevset, runner);

	if (initialFrontier.length === 0) {
		return {
			commits: [],
			totalCommitCount: validCursor ? Math.max(0, decoded.totalCount ?? 0) : 0,
			hasMoreCommits: false,
			nextCursor: null,
			diagnostic: options.cursor && !validCursor ? createDiagnostic("warning", "jj_cursor_invalid", "The operation commit cursor was invalid and was restarted.") : null,
		};
	}

	const [countResult, result] = await Promise.all([
		validCursor
			? Promise.resolve(null)
			: runner({
					command: "jj",
					args: ["log", "--ignore-working-copy", `--at-op=${atOp}`, "-r", scopeRevset, "--count"],
					cwd,
				}),
		runner({
			command: "jj",
			args: [
				"log",
				"--ignore-working-copy",
				`--at-op=${atOp}`,
				"-r",
				frontierRevset(scopeRevset, initialFrontier),
				"--no-graph",
				"-n",
				String(normalizedLimit + 1),
				"-T",
				OPERATION_COMMIT_TEMPLATE,
			],
			cwd,
		}),
	]);

	if (!result.ok) {
		return {
			commits: [],
			totalCommitCount: validCursor ? Math.max(0, decoded.totalCount ?? 0) : 0,
			hasMoreCommits: false,
			nextCursor: null,
			diagnostic: createDiagnostic(
				"warning",
				"jj_operation_commits_failed",
				result.stderr || result.stdout || "JJ could not provide commit graph data for this operation.",
			),
		};
	}

	const fetchedCommits = parseOperationCommitLines(result.stdout);
	const commits = fetchedCommits.slice(0, normalizedLimit);
	const hasMoreCommits = fetchedCommits.length > normalizedLimit;
	const totalCommitCount =
		validCursor
			? Math.max(0, decoded.totalCount ?? commits.length + (hasMoreCommits ? 1 : 0))
			: countResult?.ok
				? Math.max(0, Number.parseInt(countResult.stdout.trim(), 10) || 0)
				: commits.length + (hasMoreCommits ? 1 : 0);
	const nextFrontier = advanceCommitCursorFrontier(initialFrontier, commits);
	return {
		commits,
		totalCommitCount,
		hasMoreCommits,
		nextCursor: hasMoreCommits
			? encodeCursor({
					kind: "operation-commits",
					atOp,
					scopeKey,
					frontierCommitIds: nextFrontier,
					totalCount: totalCommitCount,
				})
			: null,
		diagnostic: options.cursor && !validCursor ? createDiagnostic("warning", "jj_cursor_invalid", "The operation commit cursor was invalid and was restarted.") : null,
	};
}

export async function loadJjOperations(
	cwd: string,
	runner: VcsCommandRunner,
	optionsOrLimit: number | { limit?: number | null; cursor?: string | null; pageSize?: number | null } = 30,
): Promise<VcsJjOperationsResult> {
	const detect = await detectVcsState(cwd, runner);
	const options = typeof optionsOrLimit === "number" ? { limit: optionsOrLimit } : optionsOrLimit;
	const normalizedLimit = Math.max(1, Math.min(options.pageSize ?? options.limit ?? 30, 1000));
	if (detect.repository.kind !== "jj") {
		return {
			operations: [],
			requestedLimit: normalizedLimit,
			nextCursor: null,
			hasMore: false,
			diagnostics: [
				...detect.diagnostics,
				createDiagnostic("warning", "jj_repo_required", "JJ operation history is only available inside a JJ repository."),
			],
		};
	}
	const repoCwd = detect.repository.root ?? cwd;
	const decoded = decodeCursor<OperationListCursor>(options.cursor);
	if (decoded?.kind === "operations-limit" && decoded.atOp) {
		const nextLimit = Math.max(1, Math.min(decoded.limit + normalizedLimit, 1000));
		return await loadJjOperationsByLimit(repoCwd, runner, nextLimit, decoded.atOp, [
			...detect.diagnostics,
			createDiagnostic(
				"warning",
				"jj_operation_cursor_fallback",
				"Operation history has merge ancestry, so cursor pagination is using the legacy growing-limit fallback.",
			),
		]);
	}

	const atOp = decoded?.kind === "operations" ? decoded.lastOperationId : await resolveCurrentOperationId(repoCwd, runner);
	if (!atOp) {
		return {
			operations: [],
			requestedLimit: normalizedLimit,
			nextCursor: null,
			hasMore: false,
			diagnostics: [...detect.diagnostics, createDiagnostic("error", "jj_operations_failed", "Failed to resolve current JJ operation.")],
		};
	}

	const rawLimit = decoded?.kind === "operations" ? normalizedLimit + 2 : normalizedLimit + 1;
	const result = await runner({
		command: "jj",
		args: [
			"op",
			"log",
			"--ignore-working-copy",
			`--at-op=${atOp}`,
			"--no-graph",
			"-n",
			String(rawLimit),
			"-T",
			OPERATION_LIST_TEMPLATE,
		],
		cwd: repoCwd,
	});
	if (!result.ok) {
		return {
			operations: [],
			requestedLimit: normalizedLimit,
			nextCursor: null,
			hasMore: false,
			diagnostics: [
				...detect.diagnostics,
				createDiagnostic("error", "jj_operations_failed", result.stderr || result.stdout || "Failed to read JJ operation history."),
			],
		};
	}
	const rawOperations = parseOperationLines(result.stdout);
	const operationsAfterCursor =
		decoded?.kind === "operations" && rawOperations[0]?.id === decoded.lastOperationId
			? rawOperations.slice(1)
			: rawOperations;
	const operations = operationsAfterCursor.slice(0, normalizedLimit);
	const hasMore = operationsAfterCursor.length > normalizedLimit;
	const hasMergeOperation = rawOperations.some((operation) => operation.parentOperationIds.length > 1);
	if (hasMergeOperation) {
		return await loadJjOperationsByLimit(repoCwd, runner, normalizedLimit, decoded?.kind === "operations" ? decoded.atOp : atOp, [
			...detect.diagnostics,
			createDiagnostic(
				"warning",
				"jj_operation_cursor_fallback",
				"Operation history has merge ancestry, so cursor pagination is using the legacy growing-limit fallback.",
			),
		]);
	}

	const operationsWithFiles = await Promise.all(
		operations.map(async (operation) => ({
			...toPublicOperation(operation),
			files: await readOperationFiles(repoCwd, operation.id, runner),
		})),
	);

	return {
		operations: operationsWithFiles,
		requestedLimit: normalizedLimit,
		nextCursor: hasMore && operationsWithFiles.length > 0
			? encodeCursor({
					kind: "operations",
					atOp: decoded?.kind === "operations" ? decoded.atOp : atOp,
					lastOperationId: operationsWithFiles[operationsWithFiles.length - 1]!.id,
				})
			: null,
		hasMore,
		diagnostics: detect.diagnostics,
	};
}

async function loadJjOperationsByLimit(
	repoCwd: string,
	runner: VcsCommandRunner,
	limit: number,
	atOp: string,
	diagnostics: VcsDiagnostic[],
): Promise<VcsJjOperationsResult> {
	const normalizedLimit = Math.max(1, Math.min(limit, 1000));
	const result = await runner({
		command: "jj",
		args: [
			"op",
			"log",
			"--ignore-working-copy",
			`--at-op=${atOp}`,
			"--no-graph",
			"-n",
			String(normalizedLimit),
			"-T",
			OPERATION_LIST_TEMPLATE,
		],
		cwd: repoCwd,
	});
	if (!result.ok) {
		return {
			operations: [],
			requestedLimit: normalizedLimit,
			nextCursor: null,
			hasMore: false,
			diagnostics: [
				...diagnostics,
				createDiagnostic("error", "jj_operations_failed", result.stderr || result.stdout || "Failed to read JJ operation history."),
			],
		};
	}
	const operations = parseOperationLines(result.stdout).slice(0, normalizedLimit);
	const operationsWithFiles = await Promise.all(
		operations.map(async (operation) => ({
			...toPublicOperation(operation),
			files: await readOperationFiles(repoCwd, operation.id, runner),
		})),
	);
	const hasMore = operationsWithFiles.length >= normalizedLimit;
	return {
		operations: operationsWithFiles,
		requestedLimit: normalizedLimit,
		nextCursor: hasMore ? encodeCursor({ kind: "operations-limit", atOp, limit: normalizedLimit }) : null,
		hasMore,
		diagnostics,
	};
}

export async function loadJjOperationDiff(
	cwd: string,
	runner: VcsCommandRunner,
	operationId: string,
	options: { commitSkip?: number | null; commitLimit?: number | null; cursor?: string | null; pageSize?: number | null } = {},
): Promise<VcsJjOperationDiffResult> {
	const detect = await detectVcsState(cwd, runner);
	const normalizedOperationId = operationId.trim();
	const commitSkip = Math.max(0, options.commitSkip ?? 0);
	const commitLimit = Math.max(1, Math.min(options.pageSize ?? options.commitLimit ?? 50, 500));
	if (!normalizedOperationId) {
		return {
			operationId,
			summary: "",
			patch: "",
			files: [],
			commits: [],
			commitSkip,
			commitLimit,
			nextCursor: null,
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
			nextCursor: null,
			totalCommitCount: 0,
			hasMoreCommits: false,
			diagnostics: [
				...detect.diagnostics,
				createDiagnostic("warning", "jj_repo_required", "JJ operation details are only available inside a JJ repository."),
			],
		};
	}
	const repoCwd = detect.repository.root ?? cwd;
	const shouldLoadOperationMetadata = !options.cursor;
	const [summaryResult, patchResult] = await Promise.all([
		shouldLoadOperationMetadata
			? runner({
					command: "jj",
					args: ["op", "show", "--ignore-working-copy", "--at-op=@", normalizedOperationId, "--summary", "--no-graph"],
					cwd: repoCwd,
				})
			: Promise.resolve({ ok: true, stdout: "", stderr: "", exitCode: 0 }),
		shouldLoadOperationMetadata
			? runner({
					command: "jj",
					args: ["op", "show", "--ignore-working-copy", "--at-op=@", normalizedOperationId, "--patch", "--no-graph"],
					cwd: repoCwd,
				})
			: Promise.resolve({ ok: true, stdout: "", stderr: "", exitCode: 0 }),
	]);
	const operationCommits = await readOperationCommits(repoCwd, normalizedOperationId, runner, {
		skip: commitSkip,
		limit: commitLimit,
		cursor: options.cursor,
		pageSize: options.pageSize,
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
		nextCursor: operationCommits.nextCursor,
		totalCommitCount: operationCommits.totalCommitCount,
		hasMoreCommits: operationCommits.hasMoreCommits,
		diagnostics,
	};
}
