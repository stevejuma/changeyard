import { detectVcsState, type VcsCommandRunner } from "../detect.js";
import type {
	VcsDiagnostic,
	VcsJjInventoryItem,
	VcsJjInventoryItemGroup,
	VcsJjInventoryItemType,
	VcsJjInventoryResult,
} from "../types.js";

const FIELD_SEPARATOR = "\t";

function createDiagnostic(level: VcsDiagnostic["level"], code: string, message: string): VcsDiagnostic {
	return { level, code, message };
}

function parseBooleanFlag(value: string | undefined): boolean {
	return value?.trim() === "1";
}

function normalizeCommitId(value: string | undefined): string | null {
	const trimmed = value?.trim();
	return trimmed ? trimmed : null;
}

function makeItem(input: {
	id: string;
	name: string;
	type: VcsJjInventoryItemType;
	group: VcsJjInventoryItemGroup;
	changeId?: string | null;
	commitId?: string | null;
	target?: string | null;
	remoteName?: string | null;
	synced?: boolean;
	tracked?: boolean;
	isCurrent?: boolean;
}): VcsJjInventoryItem {
	return {
		id: input.id,
		name: input.name,
		type: input.type,
		group: input.group,
		changeId: input.changeId ?? null,
		commitId: input.commitId ?? null,
		target: input.target ?? null,
		remoteName: input.remoteName ?? null,
		synced: input.synced ?? false,
		tracked: input.tracked ?? false,
		isCurrent: input.isCurrent ?? false,
		pr: null,
	};
}

async function readCurrentTarget(cwd: string, runner: VcsCommandRunner): Promise<VcsJjInventoryItem | null> {
	const result = await runner({
		command: "jj",
		args: [
			"log",
			"--ignore-working-copy",
			"--at-op=@",
			"-r",
			"@",
			"--no-graph",
			"-T",
			'change_id.short() ++ "\\t" ++ commit_id.short() ++ "\\t" ++ description.first_line().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ local_bookmarks.map(|b| b.name()).join("|") ++ "\\n"',
		],
		cwd,
	});
	if (!result.ok) {
		return null;
	}
	const [changeId, commitId, description, bookmarks] = result.stdout.trim().split(FIELD_SEPARATOR);
	const label = bookmarks?.split("|").find(Boolean) ?? description?.trim() ?? changeId ?? "Current workspace";
	if (!changeId && !commitId) {
		return null;
	}
	return makeItem({
		id: "current:@",
		name: label,
		type: "current",
		group: "current",
		changeId: changeId ?? null,
		commitId: normalizeCommitId(commitId),
		target: "@",
		isCurrent: true,
	});
}

async function readBookmarkInventory(cwd: string, currentCommitId: string | null, runner: VcsCommandRunner): Promise<VcsJjInventoryItem[]> {
	const result = await runner({
		command: "jj",
		args: [
			"bookmark",
			"list",
			"--ignore-working-copy",
			"--at-op=@",
			"--template",
			'name ++ "\\t" ++ self.normal_target().change_id().short() ++ "\\t" ++ self.normal_target().commit_id().short() ++ "\\t" ++ if(self.synced(), "1", "0") ++ "\\t" ++ if(self.tracked(), "1", "0") ++ "\\n"',
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
			const [name = "", changeId = "", commitId = "", syncedFlag, trackedFlag] = line.split(FIELD_SEPARATOR);
			const remoteMatch = /^(.+)@([^@]+)$/.exec(name);
			const isRemote = Boolean(remoteMatch);
			const normalizedCommitId = normalizeCommitId(commitId);
			return makeItem({
				id: `${isRemote ? "remote" : "bookmark"}:${name}`,
				name,
				type: isRemote ? "remote" : "bookmark",
				group: isRemote ? "remote" : normalizedCommitId && normalizedCommitId === currentCommitId ? "applied" : "older",
				changeId: changeId || null,
				commitId: normalizedCommitId,
				target: name,
				remoteName: remoteMatch?.[2] ?? null,
				synced: parseBooleanFlag(syncedFlag),
				tracked: parseBooleanFlag(trackedFlag),
				isCurrent: Boolean(normalizedCommitId && normalizedCommitId === currentCommitId),
			});
		})
		.filter((item) => item.name.length > 0);
}

async function readGitRefInventory(cwd: string, knownNames: Set<string>, currentCommitId: string | null, runner: VcsCommandRunner): Promise<VcsJjInventoryItem[]> {
	const result = await runner({
		command: "git",
		args: [
			"for-each-ref",
			"--format=%(refname)\t%(refname:short)\t%(objectname:short)\t%(upstream:short)",
			"refs/heads",
			"refs/remotes",
			"refs/tags",
		],
		cwd,
	});
	if (!result.ok) {
		return [];
	}
	const items: VcsJjInventoryItem[] = [];
	for (const line of result.stdout.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) {
			continue;
		}
		const [fullName = "", shortName = "", commitId = "", upstreamName = ""] = trimmed.split(FIELD_SEPARATOR);
		if (!fullName || !shortName || !commitId || fullName.endsWith("/HEAD")) {
			continue;
		}
		if (knownNames.has(shortName)) {
			continue;
		}
		const type: VcsJjInventoryItemType = fullName.startsWith("refs/remotes/")
			? "remote"
			: fullName.startsWith("refs/tags/")
				? "tag"
				: "branch";
		const group: VcsJjInventoryItemGroup =
			type === "remote" ? "remote" : type === "tag" ? "tags" : commitId === currentCommitId ? "applied" : "local";
		const remoteName = type === "remote" ? shortName.split("/")[0] ?? null : null;
		items.push(
			makeItem({
				id: `${type}:${shortName}`,
				name: shortName,
				type,
				group,
				commitId,
				target: shortName,
				remoteName,
				tracked: upstreamName.length > 0,
				isCurrent: commitId === currentCommitId,
			}),
		);
	}
	return items;
}

export async function loadJjInventory(cwd: string, runner: VcsCommandRunner): Promise<VcsJjInventoryResult> {
	const detect = await detectVcsState(cwd, runner);
	if (detect.repository.kind !== "jj") {
		return {
			...detect,
			workspaceTarget: null,
			items: [],
			diagnostics: [
				...detect.diagnostics,
				createDiagnostic("warning", "jj_repo_required", "JJ branch inventory is only available inside a JJ repository."),
			],
		};
	}

	const repoCwd = detect.repository.root ?? cwd;
	const workspaceTarget = await readCurrentTarget(repoCwd, runner);
	const currentCommitId = workspaceTarget?.commitId ?? null;
	const bookmarkItems = await readBookmarkInventory(repoCwd, currentCommitId, runner);
	const knownNames = new Set(bookmarkItems.map((item) => item.name));
	const gitRefItems = await readGitRefInventory(repoCwd, knownNames, currentCommitId, runner);
	const items = [...(workspaceTarget ? [workspaceTarget] : []), ...bookmarkItems, ...gitRefItems];
	const diagnostics = [...detect.diagnostics];

	if (items.length === 0) {
		diagnostics.push(createDiagnostic("info", "jj_inventory_empty", "No JJ bookmarks or Git refs were detected."));
	}
	if (gitRefItems.length === 0) {
		diagnostics.push(createDiagnostic("info", "git_refs_missing", "No Git branch, remote, or tag refs were available for this JJ repository."));
	}

	return {
		...detect,
		workspaceTarget,
		items,
		diagnostics,
	};
}
