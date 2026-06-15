import type { VcsJjInventoryItem, VcsJjStateResponse } from "./runtime/types";

export type BranchesStack = VcsJjStateResponse["stacks"][number];
export type BranchesStackChange = BranchesStack["changes"][number];
export type BranchesStackHead = BranchesStack["heads"][number];

export type StackChangeGroup = {
	head: BranchesStackHead;
	changes: BranchesStackChange[];
};

export type StackSelection = {
	refName: string | null;
	item?: VcsJjInventoryItem | null;
};

function normalized(value: string | null | undefined): string | null {
	const trimmed = value?.trim();
	return trimmed && trimmed !== "@" ? trimmed : null;
}

function matchesShortId(left: string | null | undefined, right: string | null | undefined): boolean {
	const a = normalized(left);
	const b = normalized(right);
	if (!a || !b) {
		return false;
	}
	if (a === b) {
		return true;
	}
	if (Math.min(a.length, b.length) < 6) {
		return false;
	}
	return a.startsWith(b) || b.startsWith(a);
}

function selectionNames(selection: StackSelection): Set<string> {
	return new Set(
		[selection.refName, selection.item?.name, selection.item?.target]
			.map(normalized)
			.filter((value): value is string => Boolean(value)),
	);
}

function stackHasName(stack: BranchesStack, names: ReadonlySet<string>): boolean {
	return names.has(stack.id);
}

function stackContainsName(stack: BranchesStack, names: ReadonlySet<string>): boolean {
	return (
		stack.heads.some((head) => names.has(head.bookmarkName)) ||
		stack.changes.some((change) => change.bookmarks.some((bookmark) => names.has(bookmark)))
	);
}

function stackHasChangeTarget(stack: BranchesStack, selection: StackSelection): boolean {
	const changeId = selection.item?.changeId ?? null;
	const commitId = selection.item?.commitId ?? null;
	if (!changeId && !commitId) {
		return false;
	}
	return (
		stack.heads.some((head) => matchesShortId(head.changeId, changeId) || matchesShortId(head.commitId, commitId)) ||
		stack.changes.some((change) => matchesShortId(change.changeId, changeId) || matchesShortId(change.commitId, commitId))
	);
}

export function findStackForBranchSelection(
	stacks: readonly BranchesStack[],
	selection: StackSelection,
): BranchesStack | null {
	if (selection.item?.type === "workspace") {
		return null;
	}
	const names = selectionNames(selection);
	return stacks.find((stack) => stackHasName(stack, names)) ?? null;
}

export function findContainingStackForBranchSelection(
	stacks: readonly BranchesStack[],
	selection: StackSelection,
): BranchesStack | null {
	if (selection.item?.type === "workspace") {
		return null;
	}
	const owningStack = findStackForBranchSelection(stacks, selection);
	if (owningStack) {
		return owningStack;
	}
	const names = selectionNames(selection);
	return stacks.find((stack) => stackContainsName(stack, names) || stackHasChangeTarget(stack, selection)) ?? null;
}

export function findApplicableStackForBranchSelection(
	stacks: readonly BranchesStack[],
	selection: StackSelection,
): BranchesStack | null {
	return findStackForBranchSelection(stacks, selection) ?? findContainingStackForBranchSelection(stacks, selection);
}

export function normalizeAppliedStackIds(values: readonly string[] | null | undefined): string[] {
	return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

export function applyWorkspaceStackId(values: readonly string[] | null | undefined, stackId: string): string[] {
	const normalizedStackId = normalized(stackId);
	if (!normalizedStackId) {
		return normalizeAppliedStackIds(values);
	}
	const current = normalizeAppliedStackIds(values);
	return current.includes(normalizedStackId) ? current : [...current, normalizedStackId];
}

export function unapplyWorkspaceStackId(values: readonly string[] | null | undefined, stackId: string): string[] {
	const normalizedStackId = normalized(stackId);
	if (!normalizedStackId) {
		return normalizeAppliedStackIds(values);
	}
	return normalizeAppliedStackIds(values).filter((value) => value !== normalizedStackId);
}

export function selectAppliedWorkspaceStacks(
	stacks: readonly BranchesStack[],
	appliedStackIds: readonly string[] | null | undefined,
): BranchesStack[] {
	const stacksById = new Map(stacks.map((stack) => [stack.id, stack]));
	return normalizeAppliedStackIds(appliedStackIds)
		.map((stackId) => stacksById.get(stackId) ?? null)
		.filter((stack): stack is BranchesStack => Boolean(stack));
}

export function selectActiveAppliedStackIds(
	configuredStackIds: readonly string[] | null | undefined,
	providerStackIds: readonly string[] | null | undefined,
	editModeStackIds: readonly string[] | null | undefined,
): string[] {
	const editMode = normalizeAppliedStackIds(editModeStackIds);
	if (editMode.length > 0) {
		return editMode;
	}
	const configured = normalizeAppliedStackIds(configuredStackIds);
	if (configured.length > 0) {
		return configured;
	}
	return normalizeAppliedStackIds(providerStackIds);
}

export function stackChangeMatchesSelection(change: BranchesStackChange, selectionId: string | null | undefined): boolean {
	return matchesShortId(change.changeId, selectionId) || matchesShortId(change.commitId, selectionId);
}

export function createBranchSelectionFallbackStack(selection: StackSelection): BranchesStack | null {
	const item = selection.item ?? null;
	if (!item || !["current", "bookmark", "branch", "workspace"].includes(item.type) || !item.commitId) {
		return null;
	}
	const changeId = item.changeId ?? item.commitId;
	const title = item.name || changeId;
	const isCheckedOut = item.type === "current" || item.isCurrent;
	const bookmarks = item.type === "bookmark" || item.type === "branch" ? [item.name] : [];
	return {
		id: title,
		tip: item.commitId,
		base: item.type === "current" ? "workspace" : "repository",
		order: 0,
		isCheckedOut,
		heads: [
			{
				id: item.id,
				bookmarkName: title,
				changeId,
				commitId: item.commitId,
				title,
				isCheckedOut,
			},
		],
		changes: [
			{
			id: changeId,
			changeId,
			commitId: item.commitId,
			title,
			description: title,
			authorName: item.authorName ?? null,
			authorEmail: item.authorEmail ?? null,
			authorAvatarUrl: item.authorAvatarUrl ?? null,
			timestamp: item.timestamp ?? null,
			bookmarks,
			remoteBookmarks: item.type === "workspace" && item.remoteName ? [`${item.target ?? item.name}@${item.remoteName}`] : [],
			isCurrent: isCheckedOut,
			isHead: true,
		},
		],
	};
}

function findChangeIndexForHead(stack: BranchesStack, head: BranchesStackHead): number {
	return stack.changes.findIndex(
		(change) => change.changeId === head.changeId || change.commitId === head.commitId,
	);
}

export function groupStackChangesByHead(stack: BranchesStack): StackChangeGroup[] {
	return stack.heads.map((head, index) => {
		const headIndex = findChangeIndexForHead(stack, head);
		if (headIndex < 0) {
			return { head, changes: [] };
		}

		const lowerHead = stack.heads[index + 1] ?? null;
		const lowerHeadIndex = lowerHead ? findChangeIndexForHead(stack, lowerHead) : -1;
		const startIndex = lowerHeadIndex >= 0 && lowerHeadIndex < headIndex ? lowerHeadIndex + 1 : 0;
		return {
			head,
			changes: stack.changes.slice(startIndex, headIndex + 1).reverse(),
		};
	});
}

function groupMatchesSelection(group: StackChangeGroup, selection: StackSelection): boolean {
	const names = selectionNames(selection);
	if (names.has(group.head.bookmarkName)) {
		return true;
	}
	const changeId = selection.item?.changeId ?? null;
	const commitId = selection.item?.commitId ?? null;
	return matchesShortId(group.head.changeId, changeId) || matchesShortId(group.head.commitId, commitId);
}

export function selectStackChangeGroupsForSelection(
	stack: BranchesStack,
	selection: StackSelection,
): StackChangeGroup[] {
	const groups = groupStackChangesByHead(stack);
	const selectedGroups = groups.filter((group) => groupMatchesSelection(group, selection));
	return selectedGroups.length > 0 ? selectedGroups : groups;
}

export function selectStackChangeGroupsForBranchDetail(
	stack: BranchesStack,
	selection: StackSelection,
): StackChangeGroup[] {
	const groups = groupStackChangesByHead(stack);
	const selectedIndex = groups.findIndex((group) => groupMatchesSelection(group, selection));
	if (selectedIndex <= 0) {
		return groups;
	}
	const selectedGroup = groups[selectedIndex];
	if (!selectedGroup) {
		return groups;
	}
	const selectedHeadChanges = selectedGroup.changes.filter(
		(change) => change.changeId === selectedGroup.head.changeId || change.commitId === selectedGroup.head.commitId,
	);
	return [
		...groups.slice(0, selectedIndex),
		{
			...selectedGroup,
			changes: selectedHeadChanges.length > 0 ? selectedHeadChanges : selectedGroup.changes.slice(0, 1),
		},
	];
}
