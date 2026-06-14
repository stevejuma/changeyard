import { createHash } from "node:crypto";

import { detectVcsState, type VcsCommandRunner } from "../detect.js";
import type {
	VcsDiagnostic,
	VcsJjInventoryItem,
	VcsJjInventoryItemGroup,
	VcsJjInventoryItemType,
	VcsJjInventoryResult,
} from "../types.js";
import { isInternalJjBookmark, normalizeRemoteTargetToLocalBookmark, remoteNameFromTarget } from "./bookmark-utils.js";
import { createJjRemoteBookmarkRevset, createJjSymbolRevset } from "./read.js";

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

function gravatarUrlForEmail(email: string | null | undefined): string | null {
	const normalized = email?.trim().toLowerCase();
	if (!normalized) {
		return null;
	}
	const hash = createHash("md5").update(normalized).digest("hex");
	return `https://www.gravatar.com/avatar/${hash}?s=80&d=identicon`;
}

function makeItem(input: {
	id: string;
	name: string;
	type: VcsJjInventoryItemType;
	group: VcsJjInventoryItemGroup;
	changeId?: string | null;
	commitId?: string | null;
	title?: string | null;
	authorName?: string | null;
	authorEmail?: string | null;
	timestamp?: string | null;
	target?: string | null;
	remoteName?: string | null;
	hasLocal?: boolean;
	remotes?: string[];
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
		title: input.title ?? null,
		authorName: input.authorName ?? null,
		authorEmail: input.authorEmail ?? null,
		authorAvatarUrl: gravatarUrlForEmail(input.authorEmail),
		timestamp: input.timestamp ?? null,
		target: input.target ?? null,
		remoteName: input.remoteName ?? null,
		hasLocal: input.hasLocal ?? input.type !== "remote",
		remotes: input.remotes ?? [],
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
			'change_id.short() ++ "\\t" ++ commit_id.short() ++ "\\t" ++ description.first_line().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.name().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.email() ++ "\\t" ++ author.timestamp().format("%Y-%m-%dT%H:%M:%SZ") ++ "\\t" ++ local_bookmarks.map(|b| b.name()).join("|") ++ "\\n"',
		],
		cwd,
	});
	if (!result.ok) {
		return null;
	}
	const [changeId, commitId, description, authorName, authorEmail, timestamp, bookmarks] = result.stdout.trim().split(FIELD_SEPARATOR);
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
		title: description?.trim() || null,
		authorName: authorName?.trim() || null,
		authorEmail: authorEmail?.trim() || null,
		timestamp: timestamp?.trim() || null,
		target: "@",
		isCurrent: true,
	});
}

function defaultConfiguredTarget(detect: Awaited<ReturnType<typeof detectVcsState>>): string | null {
	const base = detect.jj.defaultBase ?? detect.git.defaultBranch;
	if (!base) {
		return null;
	}
	return detect.git.remoteName ? `${detect.git.remoteName}/${base}` : base;
}

function createWorkspaceTargetItem(input: {
	configuredTarget: string | null;
	detect: Awaited<ReturnType<typeof detectVcsState>>;
	bookmarkItems: readonly VcsJjInventoryItem[];
	targetChangeId?: string | null;
	targetCommitId?: string | null;
	targetTitle?: string | null;
	targetAuthorName?: string | null;
	targetAuthorEmail?: string | null;
	targetTimestamp?: string | null;
}): VcsJjInventoryItem | null {
	const configuredTarget = input.configuredTarget ?? defaultConfiguredTarget(input.detect);
	const localName = normalizeRemoteTargetToLocalBookmark(configuredTarget, input.detect.git.remoteName);
	if (!configuredTarget || !localName) {
		return null;
	}
	const item = input.bookmarkItems.find((bookmark) => bookmark.name === localName) ?? null;
	const remoteName = remoteNameFromTarget(configuredTarget, input.detect.git.remoteName);
	return makeItem({
		id: `workspace-target:${configuredTarget}`,
		name: configuredTarget,
		type: "workspace",
		group: "current",
		changeId: input.targetChangeId ?? item?.changeId ?? null,
		commitId: input.targetCommitId ?? item?.commitId ?? null,
		title: input.targetTitle ?? item?.title ?? null,
		authorName: input.targetAuthorName ?? item?.authorName ?? null,
		authorEmail: input.targetAuthorEmail ?? item?.authorEmail ?? null,
		timestamp: input.targetTimestamp ?? item?.timestamp ?? null,
		target: localName,
		remoteName,
		hasLocal: item?.hasLocal ?? false,
		remotes: item?.remotes ?? (remoteName ? [remoteName] : []),
		synced: item?.synced ?? false,
		tracked: item?.tracked ?? false,
		isCurrent: item?.isCurrent ?? false,
	});
}

async function readWorkspaceTargetRevision(input: {
	cwd: string;
	configuredTarget: string | null;
	detect: Awaited<ReturnType<typeof detectVcsState>>;
	runner: VcsCommandRunner;
}): Promise<{
	changeId: string | null;
	commitId: string | null;
	title: string | null;
	authorName: string | null;
	authorEmail: string | null;
	timestamp: string | null;
}> {
	const configuredTarget = input.configuredTarget ?? defaultConfiguredTarget(input.detect);
	const localName = normalizeRemoteTargetToLocalBookmark(configuredTarget, input.detect.git.remoteName);
	if (!localName) {
		return { changeId: null, commitId: null, title: null, authorName: null, authorEmail: null, timestamp: null };
	}
	const remoteName = remoteNameFromTarget(configuredTarget, input.detect.git.remoteName);
	const revset = remoteName ? createJjRemoteBookmarkRevset(localName, remoteName) : createJjSymbolRevset(localName);
	const result = await input.runner({
		command: "jj",
		args: [
			"log",
			"--ignore-working-copy",
			"--at-op=@",
			"-r",
			revset,
			"--no-graph",
			"-T",
			'change_id.short() ++ "\\t" ++ commit_id.short() ++ "\\t" ++ description.first_line().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.name().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.email() ++ "\\t" ++ author.timestamp().format("%Y-%m-%dT%H:%M:%SZ") ++ "\\n"',
		],
		cwd: input.cwd,
	});
	if (!result.ok) {
		return { changeId: null, commitId: null, title: null, authorName: null, authorEmail: null, timestamp: null };
	}
	const [changeId, commitId, title, authorName, authorEmail, timestamp] = result.stdout.trim().split(FIELD_SEPARATOR);
	return {
		changeId: changeId || null,
		commitId: normalizeCommitId(commitId),
		title: title?.trim() || null,
		authorName: authorName?.trim() || null,
		authorEmail: authorEmail?.trim() || null,
		timestamp: timestamp?.trim() || null,
	};
}

type BookmarkInventoryGroup = {
	name: string;
	local: {
		changeId: string | null;
		commitId: string | null;
		title: string | null;
		authorName: string | null;
		authorEmail: string | null;
		timestamp: string | null;
		synced: boolean;
		tracked: boolean;
	} | null;
	remoteTargets: Map<string, {
		changeId: string | null;
		commitId: string | null;
		title: string | null;
		authorName: string | null;
		authorEmail: string | null;
		timestamp: string | null;
		synced: boolean;
		tracked: boolean;
	}>;
	tracked: boolean;
	synced: boolean;
};

export type JjRemoteBookmarkDiscoveryMode = "local" | "tracked" | "all";

export interface JjRemoteBookmarkDiscoveryOptions {
	mode?: JjRemoteBookmarkDiscoveryMode;
	prefixes?: readonly string[];
	remotes?: readonly string[];
}

function sortInventoryItems(left: VcsJjInventoryItem, right: VcsJjInventoryItem): number {
	const byGroup = GROUP_ORDER[left.group] - GROUP_ORDER[right.group];
	return byGroup || left.name.localeCompare(right.name);
}

const GROUP_ORDER: Record<VcsJjInventoryItemGroup, number> = {
	current: 0,
	today: 1,
	applied: 2,
	local: 3,
	older: 4,
	remote: 5,
	tags: 6,
};

function isTodayTimestamp(timestamp: string | null | undefined): boolean {
	if (!timestamp) {
		return false;
	}
	const date = new Date(timestamp);
	if (Number.isNaN(date.getTime())) {
		return false;
	}
	const now = new Date();
	return (
		date.getFullYear() === now.getFullYear() &&
		date.getMonth() === now.getMonth() &&
		date.getDate() === now.getDate()
	);
}

function normalizeFilterValues(values: readonly string[] | undefined): string[] {
	return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function prefixToBookmarkPattern(prefix: string): string {
	return prefix.endsWith("*") ? prefix : `${prefix}*`;
}

function resolveRemoteBookmarkDiscoveryMode(options: JjRemoteBookmarkDiscoveryOptions | undefined): JjRemoteBookmarkDiscoveryMode {
	if (options?.mode) {
		return options.mode;
	}
	return options?.prefixes?.some((prefix) => prefix.trim()) || options?.remotes?.some((remote) => remote.trim())
		? "all"
		: "local";
}

function buildBookmarkInventoryArgs(options: JjRemoteBookmarkDiscoveryOptions | undefined): string[] {
	const mode = resolveRemoteBookmarkDiscoveryMode(options);
	const prefixes = normalizeFilterValues(options?.prefixes).map(prefixToBookmarkPattern);
	const remotes = normalizeFilterValues(options?.remotes);
	const args = ["bookmark", "list"];
	if (mode === "all") {
		args.push("--all-remotes");
	}
	if (mode === "tracked") {
		args.push("--tracked");
	}
	if (mode !== "local") {
		for (const remote of remotes) {
			args.push("--remote", remote);
		}
	}
	args.push(
		"--ignore-working-copy",
		"--at-op=@",
		"--template",
		'name ++ "\\t" ++ if(self.remote(), self.remote(), "") ++ "\\t" ++ self.normal_target().change_id().short() ++ "\\t" ++ self.normal_target().commit_id().short() ++ "\\t" ++ self.normal_target().description().first_line().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ self.normal_target().author().name().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ self.normal_target().author().email() ++ "\\t" ++ self.normal_target().author().timestamp().format("%Y-%m-%dT%H:%M:%SZ") ++ "\\t" ++ if(self.synced(), "1", "0") ++ "\\t" ++ if(self.tracked(), "1", "0") ++ "\\n"',
	);
	args.push(...prefixes);
	return args;
}

async function readBookmarkInventory(
	cwd: string,
	currentCommitId: string | null,
	runner: VcsCommandRunner,
	options: JjRemoteBookmarkDiscoveryOptions | undefined,
): Promise<VcsJjInventoryItem[]> {
	const result = await runner({
		command: "jj",
		args: buildBookmarkInventoryArgs(options),
		cwd,
	});
	if (!result.ok) {
		return [];
	}
	const groups = new Map<string, BookmarkInventoryGroup>();
	for (const line of result.stdout.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) {
			continue;
		}
		const [name = "", remote = "", changeId = "", commitId = "", title = "", authorName = "", authorEmail = "", timestamp = "", syncedFlag, trackedFlag] = trimmed.split(FIELD_SEPARATOR);
		if (!name || isInternalJjBookmark(name)) {
			continue;
		}
		const group = groups.get(name) ?? {
			name,
			local: null,
			remoteTargets: new Map(),
			tracked: false,
			synced: false,
		};
		const entry = {
			changeId: changeId || null,
			commitId: normalizeCommitId(commitId),
			title: title.trim() || null,
			authorName: authorName.trim() || null,
			authorEmail: authorEmail.trim() || null,
			timestamp: timestamp.trim() || null,
			synced: parseBooleanFlag(syncedFlag),
			tracked: parseBooleanFlag(trackedFlag),
		};
		if (!remote) {
			group.local = entry;
		} else if (remote === "git") {
			group.tracked ||= entry.tracked;
			group.synced ||= entry.synced;
		} else {
			group.remoteTargets.set(remote, entry);
		}
		group.tracked ||= entry.tracked;
		group.synced ||= entry.synced;
		groups.set(name, group);
	}

	return [...groups.values()]
		.map((group) => {
			const remoteNames = [...group.remoteTargets.keys()].sort((a, b) => a.localeCompare(b));
			const firstRemote = remoteNames[0] ? group.remoteTargets.get(remoteNames[0]) : null;
			const target = group.local ?? firstRemote;
			const hasLocal = Boolean(group.local);
			const normalizedCommitId = target?.commitId ?? null;
			const groupName = isTodayTimestamp(target?.timestamp)
				? "today"
				: hasLocal
					? (normalizedCommitId && normalizedCommitId === currentCommitId ? "applied" : "older")
					: "remote";
			return makeItem({
				id: `${hasLocal ? "bookmark" : "remote"}:${group.name}`,
				name: group.name,
				type: hasLocal ? "bookmark" : "remote",
				group: groupName,
				changeId: target?.changeId ?? null,
				commitId: normalizedCommitId,
				title: target?.title ?? null,
				authorName: target?.authorName ?? null,
				authorEmail: target?.authorEmail ?? null,
				timestamp: target?.timestamp ?? null,
				target: group.name,
				remoteName: remoteNames[0] ?? null,
				hasLocal,
				remotes: remoteNames,
				synced: group.synced,
				tracked: group.tracked,
				isCurrent: Boolean(normalizedCommitId && normalizedCommitId === currentCommitId),
			});
		})
		.sort(sortInventoryItems);
}

export interface LoadJjInventoryOptions {
	targetBranch?: string | null;
	remoteBookmarks?: JjRemoteBookmarkDiscoveryOptions;
}

export async function loadJjInventory(
	cwd: string,
	runner: VcsCommandRunner,
	options: LoadJjInventoryOptions = {},
): Promise<VcsJjInventoryResult> {
	const detect = await detectVcsState(cwd, runner);
	return await loadJjInventoryFromDetect(cwd, runner, detect, options);
}

export async function loadJjInventoryFromDetect(
	cwd: string,
	runner: VcsCommandRunner,
	detect: Awaited<ReturnType<typeof detectVcsState>>,
	options: LoadJjInventoryOptions = {},
): Promise<VcsJjInventoryResult> {
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
	const currentTarget = await readCurrentTarget(repoCwd, runner);
	const currentCommitId = currentTarget?.commitId ?? null;
	const bookmarkItems = await readBookmarkInventory(repoCwd, currentCommitId, runner, options.remoteBookmarks);
	const targetRevision = await readWorkspaceTargetRevision({
		cwd: repoCwd,
		configuredTarget: options.targetBranch ?? null,
		detect,
		runner,
	});
	const workspaceTarget = createWorkspaceTargetItem({
		configuredTarget: options.targetBranch ?? null,
		detect,
		bookmarkItems,
		targetChangeId: targetRevision.changeId,
		targetCommitId: targetRevision.commitId,
		targetTitle: targetRevision.title,
		targetAuthorName: targetRevision.authorName,
		targetAuthorEmail: targetRevision.authorEmail,
		targetTimestamp: targetRevision.timestamp,
	});
	const items = bookmarkItems;
	const diagnostics = [...detect.diagnostics];

	if (items.length === 0) {
		diagnostics.push(createDiagnostic("info", "jj_inventory_empty", "No JJ bookmarks were detected."));
	}

	return {
		...detect,
		workspaceTarget,
		items,
		diagnostics,
	};
}
