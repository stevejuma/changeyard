import type { MergeBlock, MergeBlockKind, MergeModel, MergeOptions } from "../types";
import { createBlock, recomputeModel } from "./blocks";
import { diffSequences } from "./diff";
import { linesEqual, splitLines } from "./lines";
import { normalizeOptions } from "./options";

type SideChange = {
	baseStart: number;
	baseEnd: number;
	lines: string[];
};

function diffBaseToSide(baseLines: readonly string[], sideLines: readonly string[], options: Required<MergeOptions>): SideChange[] {
	const ops = diffSequences(baseLines, sideLines, options);
	const changes: SideChange[] = [];
	let baseIndex = 0;
	let current: SideChange | null = null;
	function startChange(): SideChange {
		if (!current) {
			current = { baseStart: baseIndex, baseEnd: baseIndex, lines: [] };
		}
		return current;
	}
	function flush(): void {
		if (current) {
			changes.push(current);
			current = null;
		}
	}
	for (const op of ops) {
		if (op.kind === "same") {
			flush();
			baseIndex += 1;
		} else if (op.kind === "left") {
			const change = startChange();
			baseIndex += 1;
			change.baseEnd = baseIndex;
		} else {
			const change = startChange();
			change.lines.push(op.value);
		}
	}
	flush();
	return changes;
}

function findInsertion(changes: readonly SideChange[], baseIndex: number): SideChange | null {
	return changes.find((change) => change.baseStart === baseIndex && change.baseEnd === baseIndex) ?? null;
}

function findCoveringChange(changes: readonly SideChange[], baseIndex: number): SideChange | null {
	return changes.find((change) => change.baseStart <= baseIndex && baseIndex < change.baseEnd) ?? null;
}

function sideLinesForRange(change: SideChange | null, baseLines: readonly string[], start: number, end: number): string[] {
	if (!change) {
		return [...baseLines.slice(start, end)];
	}
	return [...change.lines];
}

function createThreeWayChangeBlock(
	blocks: MergeBlock[],
	baseLines: readonly string[],
	leftChange: SideChange | null,
	rightChange: SideChange | null,
	start: number,
	end: number,
	options: Required<MergeOptions>,
): void {
	const originalBaseLines = [...baseLines.slice(start, end)];
	const leftResolvedLines = sideLinesForRange(leftChange, baseLines, start, end);
	const rightResolvedLines = sideLinesForRange(rightChange, baseLines, start, end);
	const leftChanged = Boolean(leftChange) && !linesEqual(leftResolvedLines, originalBaseLines, options);
	const rightChanged = Boolean(rightChange) && !linesEqual(rightResolvedLines, originalBaseLines, options);
	let centerLines = originalBaseLines;
	let kind: MergeBlockKind = "modified";
	let resolved = true;
	if (leftChanged && !rightChanged) {
		centerLines = leftResolvedLines;
	} else if (rightChanged && !leftChanged) {
		centerLines = rightResolvedLines;
	} else if (leftChanged && rightChanged && linesEqual(leftResolvedLines, rightResolvedLines, options)) {
		centerLines = leftResolvedLines;
	} else if (leftChanged || rightChanged) {
		kind = "conflict";
		resolved = false;
	} else {
		kind = "unchanged";
	}
	blocks.push(
		createBlock(
			blocks.length,
			kind,
			resolved,
			{ left: leftResolvedLines, base: centerLines, right: rightResolvedLines },
			{ left: null, base: start, right: null },
			options,
		),
	);
}

export function assembleThreeWayMerge(left: string, base: string, right: string, options?: MergeOptions): MergeModel {
	const normalizedOptions = normalizeOptions(options);
	const leftLines = splitLines(left);
	const baseLines = splitLines(base);
	const rightLines = splitLines(right);
	const leftChanges = diffBaseToSide(baseLines, leftLines, normalizedOptions);
	const rightChanges = diffBaseToSide(baseLines, rightLines, normalizedOptions);
	const blocks: MergeBlock[] = [];
	let baseIndex = 0;

	while (baseIndex <= baseLines.length) {
		const leftInsertion = findInsertion(leftChanges, baseIndex);
		const rightInsertion = findInsertion(rightChanges, baseIndex);
		if (leftInsertion || rightInsertion) {
			createThreeWayChangeBlock(blocks, baseLines, leftInsertion, rightInsertion, baseIndex, baseIndex, normalizedOptions);
		}
		if (baseIndex === baseLines.length) {
			break;
		}
		const leftChange = findCoveringChange(leftChanges, baseIndex);
		const rightChange = findCoveringChange(rightChanges, baseIndex);
		if (!leftChange && !rightChange) {
			const start = baseIndex;
			baseIndex += 1;
			while (
				baseIndex < baseLines.length &&
				!findCoveringChange(leftChanges, baseIndex) &&
				!findCoveringChange(rightChanges, baseIndex) &&
				!findInsertion(leftChanges, baseIndex) &&
				!findInsertion(rightChanges, baseIndex)
			) {
				baseIndex += 1;
			}
			const lines = [...baseLines.slice(start, baseIndex)];
			blocks.push(
				createBlock(
					blocks.length,
					"unchanged",
					true,
					{ left: lines, base: lines, right: lines },
					{ left: start, base: start, right: start },
					normalizedOptions,
				),
			);
			continue;
		}
		const end = Math.max(leftChange?.baseEnd ?? baseIndex + 1, rightChange?.baseEnd ?? baseIndex + 1);
		createThreeWayChangeBlock(blocks, baseLines, leftChange, rightChange, baseIndex, end, normalizedOptions);
		baseIndex = end;
	}

	return recomputeModel(
		{
			mode: "three-way",
			left,
			base,
			right,
			sourceBase: base,
			blocks,
			options: normalizedOptions,
			conflictCount: 0,
			unresolvedConflictCount: 0,
		},
		blocks,
	);
}
