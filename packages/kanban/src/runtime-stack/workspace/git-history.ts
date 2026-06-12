import type {
	RuntimeChangeyardBoardFileSummary,
	RuntimeGitCommit,
	RuntimeGitCommitDiffResponse,
	RuntimeGitLogResponse,
	RuntimeGitRef,
	RuntimeGitRefsResponse,
} from "../core/api-contract.js";
import { runGit } from "./git-utils.js";
import { detectWorkspaceEngine } from "./git-sync.js";
import { parseGitStylePatchEntries } from "./git-style-patch.js";
import { getJjCurrentChangeId, getJjStdout, runJj } from "./jj-utils.js";

const LOG_FIELD_SEPARATOR = "\x1f";
const LOG_RECORD_SEPARATOR = "\x1e";

const LOG_FORMAT = ["%H", "%h", "%an", "%ae", "%aI", "%s", "%P"].join(LOG_FIELD_SEPARATOR);
const JJ_LOG_TEMPLATE = [
	"change_id.short()",
	"commit_id",
	"author.name()",
	"author.email()",
	'author.timestamp().format("%Y-%m-%dT%H:%M:%SZ")',
	"description.first_line()",
	'parents.map(|c| c.commit_id()).join(" ")',
].join(` ++ "${LOG_FIELD_SEPARATOR}" ++ `) + ` ++ "${LOG_RECORD_SEPARATOR}"`;

type CommitRelation = NonNullable<RuntimeGitCommit["relation"]>;

function parseCommitRecord(record: string): RuntimeGitCommit | null {
	const fields = record.split(LOG_FIELD_SEPARATOR);
	if (fields.length < 7) {
		return null;
	}
	const [hash, shortHash, authorName, authorEmail, dateIso, subject, parentHashes] = fields;
	if (!hash || !shortHash || !authorName || !dateIso || !subject) {
		return null;
	}
	return {
		hash,
		shortHash,
		authorName,
		authorEmail: authorEmail ?? "",
		date: dateIso,
		message: subject,
		parentHashes: (parentHashes ?? "").split(" ").filter(Boolean),
	};
}

export async function getGitLog(options: {
	cwd: string;
	ref?: string | null;
	refs?: string[] | null;
	maxCount?: number;
	skip?: number;
}): Promise<RuntimeGitLogResponse> {
	const engine = await detectWorkspaceEngine(options.cwd);
	if (engine === "jj") {
		return await getJjLog(options);
	}
	const { cwd, ref, refs, maxCount = 200, skip = 0 } = options;

	const repoRootResult = await runGit(cwd, ["rev-parse", "--show-toplevel"]);
	if (!repoRootResult.ok || !repoRootResult.stdout) {
		return { ok: false, commits: [], totalCount: 0, error: "No git repository detected." };
	}
	const repoRoot = repoRootResult.stdout;
	const requestedRefs = normalizeRequestedRefs(refs, ref);

	const logArgs = [
		"log",
		"--topo-order",
		"--date-order",
		`--format=${LOG_RECORD_SEPARATOR}${LOG_FORMAT}`,
		`--max-count=${maxCount}`,
		`--skip=${skip}`,
	];

	if (requestedRefs.length > 0) {
		logArgs.push(...requestedRefs);
	}

	const logResult = await runGit(repoRoot, logArgs);
	if (!logResult.ok) {
		return { ok: false, commits: [], totalCount: 0, error: logResult.error ?? "Failed to read git log." };
	}

	const commits: RuntimeGitCommit[] = [];
	const records = logResult.stdout.split(LOG_RECORD_SEPARATOR).filter(Boolean);
	for (const record of records) {
		const commit = parseCommitRecord(record.trim());
		if (commit) {
			commits.push(commit);
		}
	}

	const relationMap = await buildCommitRelationMap(repoRoot, requestedRefs);
	if (relationMap) {
		for (let index = 0; index < commits.length; index += 1) {
			const commit = commits[index];
			if (!commit) {
				continue;
			}
			commits[index] = {
				...commit,
				relation: relationMap.get(commit.hash) ?? "shared",
			};
		}
	}

	const countResult = await runGit(repoRoot, [
		"rev-list",
		"--count",
		...(requestedRefs.length > 0 ? requestedRefs : ["HEAD"]),
	]);
	const totalCount = countResult.ok ? Number.parseInt(countResult.stdout, 10) || commits.length : commits.length;

	return { ok: true, commits, totalCount };
}

export async function getGitLogRange(options: {
	cwd: string;
	baseRef?: string | null;
	headRef?: string | null;
	maxCount?: number;
}): Promise<RuntimeGitLogResponse> {
	const engine = await detectWorkspaceEngine(options.cwd);
	if (engine === "jj") {
		return await getJjLogRange(options);
	}
	const { cwd, baseRef, headRef = "HEAD", maxCount = 80 } = options;

	const repoRootResult = await runGit(cwd, ["rev-parse", "--show-toplevel"]);
	if (!repoRootResult.ok || !repoRootResult.stdout) {
		return { ok: false, commits: [], totalCount: 0, error: "No git repository detected." };
	}
	const repoRoot = repoRootResult.stdout;
	const trimmedBase = baseRef?.trim();
	const trimmedHead = headRef?.trim() || "HEAD";
	const rangeRef = trimmedBase ? `${trimmedBase}..${trimmedHead}` : trimmedHead;
	const logArgs = [
		"log",
		"--topo-order",
		"--date-order",
		"--reverse",
		`--format=${LOG_RECORD_SEPARATOR}${LOG_FORMAT}`,
		`--max-count=${maxCount}`,
		rangeRef,
	];

	const logResult = await runGit(repoRoot, logArgs);
	if (!logResult.ok) {
		return { ok: false, commits: [], totalCount: 0, error: logResult.error ?? "Failed to read git log." };
	}

	const commits: RuntimeGitCommit[] = [];
	const records = logResult.stdout.split(LOG_RECORD_SEPARATOR).filter(Boolean);
	for (const record of records) {
		const commit = parseCommitRecord(record.trim());
		if (commit) {
			commits.push(commit);
		}
	}

	const countResult = await runGit(repoRoot, ["rev-list", "--count", rangeRef]);
	const totalCount = countResult.ok ? Number.parseInt(countResult.stdout, 10) || commits.length : commits.length;
	return { ok: true, commits, totalCount };
}

function parseTrackCounts(trackDescriptor: string | null): { ahead?: number; behind?: number } {
	if (!trackDescriptor) {
		return {};
	}
	const aheadMatch = trackDescriptor.match(/ahead (\d+)/);
	const behindMatch = trackDescriptor.match(/behind (\d+)/);
	const ahead = aheadMatch ? Number.parseInt(aheadMatch[1] ?? "", 10) : Number.NaN;
	const behind = behindMatch ? Number.parseInt(behindMatch[1] ?? "", 10) : Number.NaN;
	return {
		ahead: Number.isFinite(ahead) ? ahead : undefined,
		behind: Number.isFinite(behind) ? behind : undefined,
	};
}

export async function getGitRefs(cwd: string): Promise<RuntimeGitRefsResponse> {
	const engine = await detectWorkspaceEngine(cwd);
	if (engine === "jj") {
		return await getJjRefs(cwd);
	}
	const repoRootResult = await runGit(cwd, ["rev-parse", "--show-toplevel"]);
	if (!repoRootResult.ok || !repoRootResult.stdout) {
		return { ok: false, refs: [], error: "No git repository detected." };
	}
	const repoRoot = repoRootResult.stdout;

	const [headResult, branchResult, headRefResult] = await Promise.all([
		runGit(repoRoot, ["rev-parse", "HEAD"]),
		runGit(repoRoot, [
			"for-each-ref",
			"--format=%(refname)\x1f%(refname:short)\x1f%(objectname)\x1f%(upstream:short)\x1f%(upstream:track)",
			"refs/heads/",
			"refs/remotes/",
		]),
		runGit(repoRoot, ["symbolic-ref", "--quiet", "--short", "HEAD"]),
	]);

	const headCommit = headResult.ok ? headResult.stdout : null;
	const currentBranch = headRefResult.ok ? headRefResult.stdout : null;
	const isDetached = !headRefResult.ok;
	if (!headResult.ok) {
		return { ok: false, refs: [], error: headResult.error ?? "Failed to resolve HEAD." };
	}
	if (!branchResult.ok) {
		return { ok: false, refs: [], error: branchResult.error ?? "Failed to read git refs." };
	}

	const refs: RuntimeGitRef[] = [];

	if (isDetached && headCommit) {
		refs.push({
			name: headCommit.slice(0, 7),
			type: "detached",
			hash: headCommit,
			isHead: true,
		});
	}

	interface BranchEntry {
		fullName: string;
		name: string;
		type: "branch" | "remote";
		hash: string;
		upstream: string | null;
		ahead?: number;
		behind?: number;
	}

	const branches: BranchEntry[] = [];
	if (branchResult.ok && branchResult.stdout) {
		for (const line of branchResult.stdout.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed) {
				continue;
			}
			const parts = trimmed.split("\x1f");
			const fullName = parts[0];
			const name = parts[1];
			const hash = parts[2];
			const upstream = parts[3] || null;
			const trackDescriptor = parts[4] || null;
			if (!fullName || !name || !hash) {
				continue;
			}
			if (fullName.endsWith("/HEAD")) {
				continue;
			}
			const type = fullName.startsWith("refs/remotes/") ? "remote" : "branch";
			branches.push({
				fullName,
				name,
				type,
				hash,
				upstream,
				...parseTrackCounts(type === "branch" ? trackDescriptor : null),
			});
		}
	}

	for (let i = 0; i < branches.length; i++) {
		const branch = branches[i];
		if (!branch) {
			continue;
		}
		refs.push({
			name: branch.name,
			type: branch.type,
			hash: branch.hash,
			isHead: branch.type === "branch" && branch.name === currentBranch,
			upstreamName: branch.type === "branch" ? (branch.upstream ?? undefined) : undefined,
			ahead: branch.ahead,
			behind: branch.behind,
		});
	}

	return { ok: true, refs };
}

function normalizeRequestedRefs(refs: string[] | null | undefined, fallbackRef?: string | null): string[] {
	const candidates = refs && refs.length > 0 ? refs : fallbackRef ? [fallbackRef] : [];
	return Array.from(new Set(candidates.map((candidate) => candidate.trim()).filter(Boolean)));
}

function excludeJjRoot(revset: string): string {
	return `(${revset}) ~ root()`;
}

async function buildCommitRelationMap(repoRoot: string, refs: string[]): Promise<Map<string, CommitRelation> | null> {
	if (refs.length !== 2) {
		return null;
	}

	const [selectedRef, upstreamRef] = refs;
	if (!selectedRef || !upstreamRef) {
		return null;
	}

	const [selectedOnlyResult, upstreamOnlyResult] = await Promise.all([
		runGit(repoRoot, ["rev-list", selectedRef, "--not", upstreamRef]),
		runGit(repoRoot, ["rev-list", upstreamRef, "--not", selectedRef]),
	]);

	if (!selectedOnlyResult.ok || !upstreamOnlyResult.ok) {
		return null;
	}

	const relationMap = new Map<string, CommitRelation>();
	for (const hash of selectedOnlyResult.stdout.split("\n")) {
		const trimmedHash = hash.trim();
		if (trimmedHash) {
			relationMap.set(trimmedHash, "selected");
		}
	}
	for (const hash of upstreamOnlyResult.stdout.split("\n")) {
		const trimmedHash = hash.trim();
		if (trimmedHash) {
			relationMap.set(trimmedHash, "upstream");
		}
	}
	return relationMap;
}

export interface CommitDiffFile {
	path: string;
	previousPath?: string;
	status: "modified" | "added" | "deleted" | "renamed";
	additions: number;
	deletions: number;
	patch: string;
}

interface CommitDiffStatEntry {
	path: string;
	previousPath?: string;
	additions: number;
	deletions: number;
}

function parseCommitNameStatusEntries(output: string): Array<{
	path: string;
	previousPath?: string;
	status: "modified" | "added" | "deleted" | "renamed";
}> {
	const tokens = output.split("\0").filter(Boolean);
	const entries: Array<{
		path: string;
		previousPath?: string;
		status: "modified" | "added" | "deleted" | "renamed";
	}> = [];

	for (let index = 0; index < tokens.length; index += 1) {
		const statusCode = tokens[index];
		if (!statusCode) {
			continue;
		}
		const kind = statusCode.charAt(0);
		if (kind === "R") {
			const previousPath = tokens[index + 1];
			const path = tokens[index + 2];
			if (previousPath && path) {
				entries.push({
					path,
					previousPath,
					status: "renamed",
				});
			}
			index += 2;
			continue;
		}
		const path = tokens[index + 1];
		if (!path) {
			continue;
		}
		entries.push({
			path,
			status: kind === "A" ? "added" : kind === "D" ? "deleted" : "modified",
		});
		index += 1;
	}

	return entries;
}

function parseCommitNumstatEntries(output: string): CommitDiffStatEntry[] {
	const tokens = output.split("\0").filter(Boolean);
	const entries: CommitDiffStatEntry[] = [];

	for (let index = 0; index < tokens.length; index += 1) {
		const token = tokens[index];
		if (!token) {
			continue;
		}
		const simpleMatch = token.match(/^([-\d]+)\t([-\d]+)\t(.+)$/);
		if (simpleMatch) {
			const additions = simpleMatch[1] === "-" ? 0 : Number.parseInt(simpleMatch[1] ?? "", 10);
			const deletions = simpleMatch[2] === "-" ? 0 : Number.parseInt(simpleMatch[2] ?? "", 10);
			const path = simpleMatch[3];
			if (path) {
				entries.push({
					path,
					additions: Number.isFinite(additions) ? additions : 0,
					deletions: Number.isFinite(deletions) ? deletions : 0,
				});
			}
			continue;
		}

		const renameMatch = token.match(/^([-\d]+)\t([-\d]+)\t$/);
		if (!renameMatch) {
			continue;
		}
		const previousPath = tokens[index + 1];
		const path = tokens[index + 2];
		const additions = renameMatch[1] === "-" ? 0 : Number.parseInt(renameMatch[1] ?? "", 10);
		const deletions = renameMatch[2] === "-" ? 0 : Number.parseInt(renameMatch[2] ?? "", 10);
		if (previousPath && path) {
			entries.push({
				path,
				previousPath,
				additions: Number.isFinite(additions) ? additions : 0,
				deletions: Number.isFinite(deletions) ? deletions : 0,
			});
		}
		index += 2;
	}

	return entries;
}

export async function getCommitDiff(options: {
	cwd: string;
	commitHash: string;
}): Promise<RuntimeGitCommitDiffResponse> {
	const engine = await detectWorkspaceEngine(options.cwd);
	if (engine === "jj") {
		return await getJjCommitDiff(options);
	}
	const { cwd, commitHash } = options;

	const repoRootResult = await runGit(cwd, ["rev-parse", "--show-toplevel"]);
	if (!repoRootResult.ok || !repoRootResult.stdout) {
		return { ok: false, commitHash, files: [], error: "No git repository detected." };
	}
	const repoRoot = repoRootResult.stdout;

	const [nameStatusResult, numstatResult, diffResult] = await Promise.all([
		runGit(repoRoot, ["diff-tree", "--root", "--no-commit-id", "-r", "-M", "--name-status", "-z", commitHash]),
		runGit(repoRoot, ["diff-tree", "--root", "--no-commit-id", "-r", "-M", "--numstat", "-z", commitHash]),
		runGit(repoRoot, ["show", "--format=", "--find-renames", "--patch", "--diff-algorithm=histogram", commitHash], {
			trimStdout: false,
		}),
	]);

	const filesByKey = new Map<string, RuntimeGitCommitDiffResponse["files"][number]>();
	const getEntryKey = (path: string, previousPath?: string): string =>
		previousPath ? `${previousPath}\0${path}` : path;

	const nameStatusEntries = nameStatusResult.ok ? parseCommitNameStatusEntries(nameStatusResult.stdout) : [];
	for (const entry of nameStatusEntries) {
		filesByKey.set(getEntryKey(entry.path, entry.previousPath), {
			path: entry.path,
			previousPath: entry.previousPath,
			status: entry.status,
			additions: 0,
			deletions: 0,
			patch: "",
		});
	}

	const numstatEntries = numstatResult.ok ? parseCommitNumstatEntries(numstatResult.stdout) : [];
	for (const entry of numstatEntries) {
		const key = getEntryKey(entry.path, entry.previousPath);
		const existing = filesByKey.get(key);
		if (existing) {
			existing.additions = entry.additions;
			existing.deletions = entry.deletions;
			continue;
		}
		filesByKey.set(key, {
			path: entry.path,
			previousPath: entry.previousPath,
			status: entry.previousPath ? "renamed" : "modified",
			additions: entry.additions,
			deletions: entry.deletions,
			patch: "",
		});
	}

	const patchEntries = diffResult.ok ? parseGitStylePatchEntries(diffResult.stdout) : [];
	for (const entry of patchEntries) {
		const key = getEntryKey(entry.path, entry.previousPath);
		const existing = filesByKey.get(key);
		if (existing) {
			existing.patch = entry.patch;
			continue;
		}
		filesByKey.set(key, {
			path: entry.path,
			previousPath: entry.previousPath,
			status: entry.previousPath ? "renamed" : "modified",
			additions: 0,
			deletions: 0,
			patch: entry.patch,
		});
	}

	const files: RuntimeGitCommitDiffResponse["files"] = [];
	for (const file of filesByKey.values()) {
		files.push(file);
	}

	files.sort((a, b) => a.path.localeCompare(b.path));

	return { ok: true, commitHash, files };
}

export async function getCommitDiffSummary(options: {
	cwd: string;
	commitHash: string;
}): Promise<{ ok: boolean; commitHash: string; files: RuntimeChangeyardBoardFileSummary[]; error?: string }> {
	const engine = await detectWorkspaceEngine(options.cwd);
	if (engine === "jj") {
		return await getJjCommitDiffSummary(options);
	}
	const { cwd, commitHash } = options;
	const repoRootResult = await runGit(cwd, ["rev-parse", "--show-toplevel"]);
	if (!repoRootResult.ok || !repoRootResult.stdout) {
		return { ok: false, commitHash, files: [], error: "No git repository detected." };
	}
	const repoRoot = repoRootResult.stdout;

	const [nameStatusResult, numstatResult] = await Promise.all([
		runGit(repoRoot, ["diff-tree", "--root", "--no-commit-id", "-r", "-M", "--name-status", "-z", commitHash]),
		runGit(repoRoot, ["diff-tree", "--root", "--no-commit-id", "-r", "-M", "--numstat", "-z", commitHash]),
	]);

	if (!nameStatusResult.ok && !numstatResult.ok) {
		return {
			ok: false,
			commitHash,
			files: [],
			error: nameStatusResult.error ?? numstatResult.error ?? "Failed to read commit file summary.",
		};
	}

	const filesByKey = new Map<string, RuntimeChangeyardBoardFileSummary>();
	const getEntryKey = (path: string, previousPath?: string): string =>
		previousPath ? `${previousPath}\0${path}` : path;

	const nameStatusEntries = nameStatusResult.ok ? parseCommitNameStatusEntries(nameStatusResult.stdout) : [];
	for (const entry of nameStatusEntries) {
		filesByKey.set(getEntryKey(entry.path, entry.previousPath), {
			path: entry.path,
			previousPath: entry.previousPath,
			status: entry.status,
			additions: 0,
			deletions: 0,
		});
	}

	const numstatEntries = numstatResult.ok ? parseCommitNumstatEntries(numstatResult.stdout) : [];
	for (const entry of numstatEntries) {
		const key = getEntryKey(entry.path, entry.previousPath);
		const existing = filesByKey.get(key);
		if (existing) {
			existing.additions = entry.additions;
			existing.deletions = entry.deletions;
			continue;
		}
		filesByKey.set(key, {
			path: entry.path,
			previousPath: entry.previousPath,
			status: entry.previousPath ? "renamed" : "modified",
			additions: entry.additions,
			deletions: entry.deletions,
		});
	}

	return {
		ok: true,
		commitHash,
		files: Array.from(filesByKey.values()).sort((left, right) => left.path.localeCompare(right.path)),
	};
}

async function getJjLog(options: {
	cwd: string;
	ref?: string | null;
	refs?: string[] | null;
	maxCount?: number;
	skip?: number;
}): Promise<RuntimeGitLogResponse> {
	const { cwd, ref, refs, maxCount = 200, skip = 0 } = options;
	const repoRoot = await getJjStdout(["workspace", "root"], cwd).catch(() => null);
	if (!repoRoot) {
		return { ok: false, commits: [], totalCount: 0, error: "No jj repository detected." };
	}
	const requestedRefs = normalizeRequestedRefs(refs, ref);
	const revset = excludeJjRoot(
		requestedRefs.length > 0 ? requestedRefs.map((candidate) => `::${candidate}`).join("|") : "::@",
	);
	const logArgs = ["log", "-r", revset, "--no-graph", "-T", JJ_LOG_TEMPLATE];
	if (Number.isFinite(maxCount) && maxCount > 0) {
		logArgs.push("--limit", String(skip + maxCount));
	}

	const [logResult, countResult] = await Promise.all([
		runJj(repoRoot, logArgs, { trimStdout: false }),
		runJj(repoRoot, ["log", "-r", revset, "--count"]),
	]);
	if (!logResult.ok) {
		return { ok: false, commits: [], totalCount: 0, error: logResult.error ?? "Failed to read jj log." };
	}

	const commits: RuntimeGitCommit[] = [];
	for (const record of logResult.stdout.split(LOG_RECORD_SEPARATOR)) {
		const trimmedRecord = record.trim();
		if (!trimmedRecord) {
			continue;
		}
		const fields = trimmedRecord.split(LOG_FIELD_SEPARATOR);
		if (fields.length < 7) {
			continue;
		}
		const [changeId, hash, authorName, authorEmail, dateIso, subject, parentHashes] = fields;
		if (!changeId || !hash || !authorName || !dateIso) {
			continue;
		}
		commits.push({
			hash,
			shortHash: hash.slice(0, 8),
			changeId,
			authorName,
			authorEmail: authorEmail ?? "",
			date: dateIso,
			message: subject?.trim() || "(no description)",
			parentHashes: (parentHashes ?? "").split(" ").filter(Boolean),
			relation: "shared",
		});
	}

	const totalCount = countResult.ok ? Number.parseInt(countResult.stdout, 10) || commits.length : commits.length;
	return {
		ok: true,
		commits: commits.slice(skip, skip + maxCount),
		totalCount,
	};
}

async function getJjLogRange(options: {
	cwd: string;
	baseRef?: string | null;
	headRef?: string | null;
	maxCount?: number;
}): Promise<RuntimeGitLogResponse> {
	const { cwd, baseRef, headRef = "@", maxCount = 80 } = options;
	const repoRoot = await getJjStdout(["workspace", "root"], cwd).catch(() => null);
	if (!repoRoot) {
		return { ok: false, commits: [], totalCount: 0, error: "No jj repository detected." };
	}
	const trimmedBase = baseRef?.trim();
	const trimmedHead = headRef?.trim() || "@";
	const revset = excludeJjRoot(trimmedBase ? `${trimmedBase}..${trimmedHead}` : `::${trimmedHead}`);
	const [logResult, countResult] = await Promise.all([
		runJj(repoRoot, ["log", "-r", revset, "--no-graph", "-T", JJ_LOG_TEMPLATE], { trimStdout: false }),
		runJj(repoRoot, ["log", "-r", revset, "--count"]),
	]);
	if (!logResult.ok) {
		return { ok: false, commits: [], totalCount: 0, error: logResult.error ?? "Failed to read jj log." };
	}

	const commits: RuntimeGitCommit[] = [];
	for (const record of logResult.stdout.split(LOG_RECORD_SEPARATOR)) {
		const trimmedRecord = record.trim();
		if (!trimmedRecord) {
			continue;
		}
		const fields = trimmedRecord.split(LOG_FIELD_SEPARATOR);
		if (fields.length < 7) {
			continue;
		}
		const [changeId, hash, authorName, authorEmail, dateIso, subject, parentHashes] = fields;
		if (!changeId || !hash || !authorName || !dateIso) {
			continue;
		}
		commits.push({
			hash,
			shortHash: hash.slice(0, 8),
			changeId,
			authorName,
			authorEmail: authorEmail ?? "",
			date: dateIso,
			message: subject?.trim() || "(no description)",
			parentHashes: (parentHashes ?? "").split(" ").filter(Boolean),
			relation: "shared",
		});
	}

	const totalCount = countResult.ok ? Number.parseInt(countResult.stdout, 10) || commits.length : commits.length;
	return {
		ok: true,
		commits: commits.reverse().slice(0, maxCount),
		totalCount,
	};
}

async function getJjRefs(cwd: string): Promise<RuntimeGitRefsResponse> {
	const repoRoot = await getJjStdout(["workspace", "root"], cwd).catch(() => null);
	if (!repoRoot) {
		return { ok: false, refs: [], error: "No jj repository detected." };
	}

	const [headCommit, headChangeId, bookmarkListResult] = await Promise.all([
		getJjStdout(["log", "-r", "@", "--no-graph", "-T", "commit_id"], repoRoot).catch(() => null),
		getJjCurrentChangeId(repoRoot),
		runJj(repoRoot, ["bookmark", "list"]),
	]);
	const refs: RuntimeGitRef[] = [];

	// Always surface the current working-copy change in JJ so unbookmarked
	// intermediary changes remain visible in the history UI.
	if (headCommit) {
		refs.push({
			name: headChangeId ?? headCommit.slice(0, 8),
			type: "detached",
			hash: headCommit,
			changeId: headChangeId ?? undefined,
			isHead: true,
		});
	}

	const bookmarkNames = (bookmarkListResult.ok ? bookmarkListResult.stdout : "")
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => line.split(":", 1)[0]?.trim() ?? "")
		.filter(Boolean);

	const bookmarkEntries = await Promise.all(
		bookmarkNames.map(async (name) => {
			const hash = await getJjStdout(["log", "-r", name, "--no-graph", "-T", "commit_id"], repoRoot).catch(() => null);
			return hash
				? ({
						name,
						type: "branch" as const,
						hash,
						isHead: false,
					} satisfies RuntimeGitRef)
				: null;
		}),
	);
	for (const entry of bookmarkEntries) {
		if (entry) {
			refs.push(entry);
		}
	}

	return { ok: true, refs };
}

async function getJjCommitDiff(options: {
	cwd: string;
	commitHash: string;
}): Promise<RuntimeGitCommitDiffResponse> {
	const repoRoot = await getJjStdout(["workspace", "root"], options.cwd).catch(() => null);
	if (!repoRoot) {
		return { ok: false, commitHash: options.commitHash, files: [], error: "No jj repository detected." };
	}

	const diffResult = await runJj(repoRoot, ["diff", "-r", options.commitHash, "--git"], { trimStdout: false });
	if (!diffResult.ok) {
		return {
			ok: false,
			commitHash: options.commitHash,
			files: [],
			error: diffResult.error ?? "Failed to read jj commit diff.",
		};
	}

	const files = parseGitStylePatchEntries(diffResult.stdout)
		.map((entry) => ({
			path: entry.path,
			previousPath: entry.previousPath,
			status: entry.status,
			additions: entry.additions,
			deletions: entry.deletions,
			patch: entry.patch,
		}))
		.sort((left, right) => left.path.localeCompare(right.path));

	return { ok: true, commitHash: options.commitHash, files };
}

async function getJjCommitDiffSummary(options: {
	cwd: string;
	commitHash: string;
}): Promise<{ ok: boolean; commitHash: string; files: RuntimeChangeyardBoardFileSummary[]; error?: string }> {
	const repoRoot = await getJjStdout(["workspace", "root"], options.cwd).catch(() => null);
	if (!repoRoot) {
		return { ok: false, commitHash: options.commitHash, files: [], error: "No jj repository detected." };
	}

	const diffResult = await runJj(repoRoot, ["diff", "-r", options.commitHash, "--git"], { trimStdout: false });
	if (!diffResult.ok) {
		return {
			ok: false,
			commitHash: options.commitHash,
			files: [],
			error: diffResult.error ?? "Failed to read jj commit file summary.",
		};
	}

	const files = parseGitStylePatchEntries(diffResult.stdout)
		.map((entry) => ({
			path: entry.path,
			previousPath: entry.previousPath,
			status: entry.status,
			additions: entry.additions,
			deletions: entry.deletions,
		}))
		.sort((left, right) => left.path.localeCompare(right.path));

	return { ok: true, commitHash: options.commitHash, files };
}
