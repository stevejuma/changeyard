import type { VcsCommandRunner } from "../detect.js";
import type { VcsJjBookmark, VcsJjChange, VcsJjUnassignedChange } from "../types.js";

const BOOKMARK_LINE_SEPARATOR = "\t";
const LIST_SEPARATOR = "|";
const SAFE_SYMBOL_PATTERN = /^[A-Za-z0-9._/-]+$/;

function parseBooleanFlag(value: string): boolean {
	return value.trim() === "1";
}

function parseList(value: string): string[] {
	return value
		.split(LIST_SEPARATOR)
		.map((entry) => entry.trim())
		.filter(Boolean);
}

function assertSafeBookmarkName(name: string): void {
	if (!SAFE_SYMBOL_PATTERN.test(name)) {
		throw new Error(`Unsupported JJ bookmark name: ${name}`);
	}
}

function createBookmarkRevset(name: string): string {
	assertSafeBookmarkName(name);
	return `connected(trunk()::"${name}")`;
}

export async function readJjBookmarks(cwd: string, runner: VcsCommandRunner): Promise<VcsJjBookmark[]> {
	const result = await runner({
		command: "jj",
		args: [
			"bookmark",
			"list",
			"--revisions",
			"mine() ~ trunk()",
			"--template",
			'name ++ "\\t" ++ self.normal_target().change_id().shortest(12) ++ "\\t" ++ self.normal_target().commit_id().shortest(12) ++ "\\t" ++ if(self.synced(), "1", "0") ++ "\\t" ++ if(self.tracked(), "1", "0") ++ "\\n"',
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
			const [name, changeId, commitId, syncedFlag, trackedFlag] = line.split(BOOKMARK_LINE_SEPARATOR);
			return {
				name,
				changeId,
				commitId,
				synced: parseBooleanFlag(syncedFlag ?? "0"),
				tracked: parseBooleanFlag(trackedFlag ?? "0"),
			};
		})
		.filter((bookmark) => bookmark.name && bookmark.changeId && bookmark.commitId);
}

export async function readJjChangesForBookmark(
	cwd: string,
	bookmarkName: string,
	runner: VcsCommandRunner,
): Promise<VcsJjChange[]> {
	const result = await runner({
		command: "jj",
		args: [
			"log",
			"--revisions",
			createBookmarkRevset(bookmarkName),
			"--no-graph",
			"--template",
			'change_id.shortest(12) ++ "\\t" ++ commit_id.shortest(12) ++ "\\t" ++ description.first_line().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ parents.map(|p| p.change_id().shortest(12)).join("|") ++ "\\t" ++ local_bookmarks.map(|b| b.name()).join("|") ++ "\\t" ++ remote_bookmarks.map(|b| separate("@", b.name(), b.remote())).join("|") ++ "\\t" ++ if(current_working_copy, "1", "0") ++ "\\n"',
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
			const [changeId, commitId, description, parents, bookmarks, remoteBookmarks, currentFlag] =
				line.split(BOOKMARK_LINE_SEPARATOR);
			return {
				changeId,
				commitId,
				description: description || "(empty description)",
				parentChangeIds: parseList(parents ?? ""),
				bookmarks: parseList(bookmarks ?? ""),
				remoteBookmarks: parseList(remoteBookmarks ?? ""),
				isCurrent: parseBooleanFlag(currentFlag ?? "0"),
			};
		})
		.filter((change) => change.changeId && change.commitId);
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
		args: ["diff", "--summary", "-r", "@"],
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
