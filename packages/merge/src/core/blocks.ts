import type { MergeBlock, MergeBlockKind, MergeLine, MergeModel, MergeOptions, MergeSide } from "../types";
import { diffInlineParts } from "./inline-diff";
import { hasTrailingNewline, joinLines } from "./lines";

export function createLines(
	blockId: string,
	side: MergeSide,
	lines: readonly string[],
	lineStart: number | null,
	compareLines: readonly string[],
	options: Required<MergeOptions>,
): MergeLine[] {
	return lines.map((text, index) => ({
		id: `${blockId}:${side}:${index}`,
		text,
		lineNumber: lineStart === null ? null : lineStart + index + 1,
		parts: diffInlineParts(text, compareLines[index] ?? "", options.lineDiffAlgorithm),
	}));
}

export function createBlock(
	index: number,
	kind: MergeBlockKind,
	resolved: boolean,
	linesBySide: Partial<Record<MergeSide, string[]>>,
	lineStarts: Partial<Record<MergeSide, number | null>>,
	options: Required<MergeOptions>,
): MergeBlock {
	const id = `block-${index}`;
	const baseCompare = linesBySide.base ?? [];
	const sides: Partial<Record<MergeSide, MergeLine[]>> = {};
	for (const side of ["left", "base", "right"] as const) {
		const sideLines = linesBySide[side];
		if (!sideLines) {
			continue;
		}
		const compareLines = side === "base" ? sideLines : baseCompare;
		sides[side] = createLines(id, side, sideLines, lineStarts[side] ?? null, compareLines, options);
	}
	return { id, kind, resolved, sides, originalBaseLines: [...baseCompare] };
}

export function linesFromBlock(block: MergeBlock, side: MergeSide): string[] {
	return (block.sides[side] ?? []).map((line) => line.text);
}

export function recomputeModel(model: MergeModel, blocks: MergeBlock[]): MergeModel {
	const baseLines = blocks.flatMap((block) => linesFromBlock(block, "base"));
	const conflictCount = blocks.filter((block) => block.kind === "conflict").length;
	const unresolvedConflictCount = blocks.filter((block) => block.kind === "conflict" && !block.resolved).length;
	return {
		...model,
		base: joinLines(baseLines, hasTrailingNewline(model.base)),
		blocks,
		conflictCount,
		unresolvedConflictCount,
	};
}

export function cloneBlockWithBaseLines(
	block: MergeBlock,
	lines: string[],
	resolved: boolean,
	options: Required<MergeOptions>,
): MergeBlock {
	const lineStart = block.sides.base?.[0]?.lineNumber ? block.sides.base[0].lineNumber - 1 : null;
	const nextBlock = createBlock(
		Number(block.id.replace("block-", "")) || 0,
		block.kind,
		resolved,
		{
			left: linesFromBlock(block, "left"),
			base: lines,
			right: linesFromBlock(block, "right"),
		},
		{
			left: block.sides.left?.[0]?.lineNumber ? block.sides.left[0].lineNumber - 1 : null,
			base: lineStart,
			right: block.sides.right?.[0]?.lineNumber ? block.sides.right[0].lineNumber - 1 : null,
		},
		options,
	);
	return {
		...nextBlock,
		originalBaseLines: [...(block.originalBaseLines ?? linesFromBlock(block, "base"))],
	};
}
