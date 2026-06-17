import { createHash } from "node:crypto";

import type { VcsCommandRunner } from "../detect.js";
import type { VcsDiagnostic, VcsJjBookmark, VcsJjChange, VcsJjUnassignedChange } from "../types.js";

const BOOKMARK_LINE_SEPARATOR = "\t";
const LIST_SEPARATOR = "|";
const SAFE_SYMBOL_PATTERN = /^[A-Za-z0-9._/-]+$/;
const GRAPH_BOOKMARK_BATCH_SIZE = 60;

export interface VcsJjBookmarksReadResult {
	bookmarks: VcsJjBookmark[];
	ok: boolean;
}

export interface VcsJjChangesReadResult {
	changes: VcsJjChange[];
	diagnostics: VcsDiagnostic[];
	ok: boolean;
}

type ParsedJjBookmarkRow = VcsJjBookmark & { remoteName: string | null };

function parseBooleanFlag(value: string): boolean {
	return value.trim() === "1";
}

function parseList(value: string): string[] {
	return value
		.split(LIST_SEPARATOR)
		.map((entry) => entry.trim())
		.filter(Boolean);
}

function parseJsonTemplateString(value: string | undefined): string {
	if (!value) {
		return "";
	}
	try {
		const parsed = JSON.parse(value);
		return typeof parsed === "string" ? parsed : value;
	} catch {
		return value;
	}
}

function gravatarUrlForEmail(email: string | null | undefined): string | null {
	const normalized = email?.trim().toLowerCase();
	if (!normalized) {
		return null;
	}
	const hash = createHash("md5").update(normalized).digest("hex");
	return `https://www.gravatar.com/avatar/${hash}?s=80&d=identicon`;
}

function assertSafeBookmarkName(name: string): void {
	if (!SAFE_SYMBOL_PATTERN.test(name)) {
		throw new Error(`Unsupported JJ bookmark name: ${name}`);
	}
}

function createDiagnostic(level: VcsDiagnostic["level"], code: string, message: string): VcsDiagnostic {
	return { level, code, message };
}

export function createJjSymbolRevset(symbol: string | null | undefined): string {
	const value = symbol?.trim();
	if (!value || value === "trunk()") {
		return "trunk()";
	}
	assertSafeBookmarkName(value);
	return `"${value}"`;
}

export function createJjRemoteBookmarkRevset(bookmarkName: string, remoteName: string): string {
	assertSafeBookmarkName(bookmarkName);
	assertSafeBookmarkName(remoteName);
	return `${bookmarkName}@${remoteName}`;
}

function createBookmarkUnionRevset(names: readonly string[]): string {
	return names
		.map((name) => {
			assertSafeBookmarkName(name);
			return `"${name}"`;
		})
		.join(" | ");
}

function createBookmarksRevset(baseRevset: string): string {
	return `all() ~ ::${baseRevset}`;
}

function createGraphRevset(baseRevset: string, bookmarkNames: readonly string[]): string {
	if (bookmarkNames.length === 1) {
		return `(::${createBookmarkUnionRevset(bookmarkNames)}) ~ ::${baseRevset}`;
	}
	return `(::(${createBookmarkUnionRevset(bookmarkNames)})) ~ ::${baseRevset}`;
}

function mergeChanges(current: VcsJjChange | undefined, next: VcsJjChange): VcsJjChange {
	return {
		...next,
		authorName: next.authorName ?? current?.authorName ?? null,
		authorEmail: next.authorEmail ?? current?.authorEmail ?? null,
		authorAvatarUrl: next.authorAvatarUrl ?? current?.authorAvatarUrl ?? null,
		timestamp: next.timestamp ?? current?.timestamp ?? null,
		bookmarks: mergeLists(current?.bookmarks, next.bookmarks),
		remoteBookmarks: mergeLists(current?.remoteBookmarks, next.remoteBookmarks),
		isCurrent: current?.isCurrent || next.isCurrent || false,
	};
}

export async function readJjBookmarksWithBase(
	cwd: string,
	baseRevset: string,
	runner: VcsCommandRunner,
): Promise<VcsJjBookmarksReadResult> {
	let result = await runner({
		command: "jj",
		args: [
			"bookmark",
			"list",
			"--all-remotes",
			"--ignore-working-copy",
			"--at-op=@",
			"--revisions",
			createBookmarksRevset(baseRevset),
			"--template",
			'name ++ "\\t" ++ if(self.remote(), self.remote(), "") ++ "\\t" ++ self.normal_target().change_id().shortest(12) ++ "\\t" ++ self.normal_target().commit_id().shortest(12) ++ "\\t" ++ if(self.synced(), "1", "0") ++ "\\t" ++ if(self.tracked(), "1", "0") ++ "\\n"',
		],
		cwd,
	});
	if (!result.ok) {
		result = await runner({
			command: "jj",
			args: [
				"bookmark",
				"list",
				"--ignore-working-copy",
				"--at-op=@",
				"--revisions",
				createBookmarksRevset(baseRevset),
				"--template",
				'name ++ "\\t" ++ self.normal_target().change_id().shortest(12) ++ "\\t" ++ self.normal_target().commit_id().shortest(12) ++ "\\t" ++ if(self.synced(), "1", "0") ++ "\\t" ++ if(self.tracked(), "1", "0") ++ "\\n"',
			],
			cwd,
		});
	}
	if (!result.ok) {
		return { bookmarks: [], ok: false };
	}
	const groups = new Map<
		string,
		{
			local: ParsedJjBookmarkRow | null;
			synced: boolean;
			trackedRemoteNames: Set<string>;
		}
	>();
	for (const line of result.stdout.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) {
			continue;
		}
		const fields = trimmed.split(BOOKMARK_LINE_SEPARATOR);
		const [name, remoteName, changeId, commitId, syncedFlag, trackedFlag] = fields.length >= 6
			? fields
			: [fields[0], "", fields[1], fields[2], fields[3], fields[4]];
		if (!name || !changeId || !commitId) {
			continue;
		}
		const row: ParsedJjBookmarkRow = {
			name,
			remoteName: remoteName.trim() || null,
			changeId,
			commitId,
			synced: parseBooleanFlag(syncedFlag ?? "0"),
			tracked: parseBooleanFlag(trackedFlag ?? "0"),
		};
		const group = groups.get(name) ?? { local: null, synced: false, trackedRemoteNames: new Set<string>() };
		group.synced ||= row.synced;
		if (!row.remoteName) {
			group.local = row;
		} else if (row.remoteName !== "git" && row.tracked) {
			group.trackedRemoteNames.add(row.remoteName);
		}
		groups.set(name, group);
	}
	return {
		ok: true,
		bookmarks: [...groups.values()]
			.filter((group) => group.local)
			.map((group) => {
				const local = group.local as ParsedJjBookmarkRow;
				const trackedRemoteNames = [...group.trackedRemoteNames].sort((left, right) => left.localeCompare(right));
				return {
					name: local.name,
					changeId: local.changeId,
					commitId: local.commitId,
					synced: group.synced,
					tracked: trackedRemoteNames.length > 0 || local.tracked,
					trackedRemoteNames,
				};
			}),
	};
}

export async function readJjBookmarks(cwd: string, runner: VcsCommandRunner): Promise<VcsJjBookmark[]> {
	const result = await readJjBookmarksWithBase(cwd, "trunk()", runner);
	return result.bookmarks;
}

function parseChangeRow(line: string): VcsJjChange | null {
	const fields = line.split(BOOKMARK_LINE_SEPARATOR);
	const [changeId, commitId, description] = fields;
	let authorName: string | undefined;
	let authorEmail: string | undefined;
	let timestamp: string | undefined;
	let parents: string | undefined;
	let bookmarks: string | undefined;
	let remoteBookmarks: string | undefined;
	let currentFlag: string | undefined;
	if (fields.length >= 10) {
		[, , , authorName, authorEmail, timestamp, parents, bookmarks, remoteBookmarks, currentFlag] = fields;
	} else if (fields.length >= 9) {
		[, , , authorName, authorEmail, parents, bookmarks, remoteBookmarks, currentFlag] = fields;
	} else {
		[, , , parents, bookmarks, remoteBookmarks, currentFlag] = fields;
	}
	if (!changeId || !commitId || currentFlag === undefined) {
		return null;
	}
	const normalizedAuthorName = authorName?.trim() || null;
	const normalizedAuthorEmail = authorEmail?.trim() || null;
	const normalizedDescription = parseJsonTemplateString(description);
	return {
		changeId,
		commitId,
		description: normalizedDescription || "(empty description)",
		authorName: normalizedAuthorName,
		authorEmail: normalizedAuthorEmail,
		authorAvatarUrl: gravatarUrlForEmail(normalizedAuthorEmail),
		timestamp: timestamp?.trim() || null,
		parentChangeIds: parseList(parents ?? ""),
		bookmarks: parseList(bookmarks ?? ""),
		remoteBookmarks: parseList(remoteBookmarks ?? ""),
		isCurrent: parseBooleanFlag(currentFlag),
	};
}

export async function readJjChangesForBookmarks(
	cwd: string,
	bookmarkNames: readonly string[],
	baseRevset: string,
	runner: VcsCommandRunner,
): Promise<VcsJjChangesReadResult> {
	const diagnostics: VcsDiagnostic[] = [];
	const changesById = new Map<string, VcsJjChange>();
	if (bookmarkNames.length === 0) {
		return { changes: [], diagnostics, ok: true };
	}

	for (let start = 0; start < bookmarkNames.length; start += GRAPH_BOOKMARK_BATCH_SIZE) {
		const batch = bookmarkNames.slice(start, start + GRAPH_BOOKMARK_BATCH_SIZE);
		let result = await runner({
			command: "jj",
			args: [
				"log",
				"--ignore-working-copy",
				"--at-op=@",
				"--revisions",
				createGraphRevset(baseRevset, batch),
				"--no-graph",
				"--template",
				'change_id.shortest(12) ++ "\\t" ++ commit_id.shortest(12) ++ "\\t" ++ description.escape_json() ++ "\\t" ++ author.name().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.email() ++ "\\t" ++ author.timestamp().format("%Y-%m-%dT%H:%M:%SZ") ++ "\\t" ++ parents.map(|p| p.change_id().shortest(12)).join("|") ++ "\\t" ++ local_bookmarks.map(|b| b.name()).join("|") ++ "\\t" ++ remote_bookmarks.map(|b| separate("@", b.name(), b.remote())).join("|") ++ "\\t" ++ if(current_working_copy, "1", "0") ++ "\\n"',
			],
			cwd,
		});
		if (!result.ok) {
			result = await runner({
				command: "jj",
				args: [
					"log",
					"--ignore-working-copy",
					"--at-op=@",
					"--revisions",
					createGraphRevset(baseRevset, batch),
					"--no-graph",
					"--template",
					'change_id.shortest(12) ++ "\\t" ++ commit_id.shortest(12) ++ "\\t" ++ description.first_line().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.name().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.email() ++ "\\t" ++ parents.map(|p| p.change_id().shortest(12)).join("|") ++ "\\t" ++ local_bookmarks.map(|b| b.name()).join("|") ++ "\\t" ++ remote_bookmarks.map(|b| separate("@", b.name(), b.remote())).join("|") ++ "\\t" ++ if(current_working_copy, "1", "0") ++ "\\n"',
				],
				cwd,
			});
		}
		if (!result.ok) {
			return { changes: [...changesById.values()], diagnostics, ok: false };
		}
		for (const rawLine of result.stdout.split("\n")) {
			const line = rawLine.trim();
			if (!line) {
				continue;
			}
			const change = parseChangeRow(line);
			if (!change) {
				diagnostics.push(createDiagnostic("warning", "jj_log_row_skipped", "Skipped malformed JJ log template row."));
				continue;
			}
			changesById.set(change.changeId, mergeChanges(changesById.get(change.changeId), change));
		}
	}

	return { changes: [...changesById.values()], diagnostics, ok: true };
}

export async function readJjChangesForBookmark(
	cwd: string,
	bookmarkName: string,
	runner: VcsCommandRunner,
): Promise<VcsJjChange[]> {
	const result = await readJjChangesForBookmarks(cwd, [bookmarkName], "trunk()", runner);
	return result.changes;
}

function normalizeStatus(code: string): VcsJjUnassignedChange["status"] {
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

export async function readJjUnassignedChanges(cwd: string, runner: VcsCommandRunner): Promise<VcsJjUnassignedChange[]> {
	const result = await runner({
		command: "jj",
		args: ["diff", "--ignore-working-copy", "--summary", "-r", "@"],
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
			const match = /^([A-Z])\s+(.*)$/.exec(line);
			if (!match) {
				return null;
			}
			return {
				status: normalizeStatus(match[1] ?? ""),
				path: match[2] ?? "",
			};
		})
		.filter((entry): entry is VcsJjUnassignedChange => Boolean(entry?.path));
}

function mergeLists(current: readonly string[] | undefined, next: readonly string[]): string[] {
	return [...new Set([...(current ?? []), ...next])];
}
