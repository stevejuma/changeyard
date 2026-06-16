import type { MergeAction, MergeModel } from "../types";
import { cloneBlockWithBaseLines, createBlock, linesFromBlock, recomputeModel } from "./blocks";
import { diffSequences } from "./diff";
import { splitLines } from "./lines";
import { assembleOneWayMerge } from "./one-way";
import { assembleThreeWayMerge } from "./three-way";

type BlockRange = {
	blockIndex: number;
	start: number;
	end: number;
};

function blockRangeForIndex(ranges: readonly BlockRange[], index: number): BlockRange | undefined {
	const containing = ranges.find((range) => range.start <= index && index < range.end);
	if (containing) {
		return containing;
	}
	const atBoundary = ranges.find((range) => range.start === index);
	if (atBoundary) {
		return atBoundary;
	}
	for (let rangeIndex = ranges.length - 1; rangeIndex >= 0; rangeIndex -= 1) {
		const range = ranges[rangeIndex];
		if (range.end <= index) {
			return range;
		}
	}
	return ranges[0];
}

function replaceCenterContent(model: MergeModel, content: string): MergeModel {
	const currentLines = splitLines(model.base);
	const nextLines = splitLines(content);
	if (model.blocks.length === 0) {
		const blocks = [
			createBlock(0, "unchanged", true, { left: [], base: nextLines, right: [] }, { left: null, base: 0, right: null }, model.options),
		];
		return recomputeModel({ ...model, base: content }, blocks);
	}
	const ranges: BlockRange[] = [];
	let lineIndex = 0;
	for (let blockIndex = 0; blockIndex < model.blocks.length; blockIndex += 1) {
		const block = model.blocks[blockIndex];
		const start = lineIndex;
		lineIndex += linesFromBlock(block, "base").length;
		ranges.push({ blockIndex, start, end: lineIndex });
	}
	const linesByBlock = model.blocks.map((): string[] => []);
	let currentIndex = 0;
	for (const op of diffSequences(currentLines, nextLines, model.options)) {
		if (op.kind === "same") {
			const range = blockRangeForIndex(ranges, currentIndex);
			if (range) {
				linesByBlock[range.blockIndex].push(op.right);
			}
			currentIndex += 1;
		} else if (op.kind === "left") {
			currentIndex += 1;
		} else {
			const range = blockRangeForIndex(ranges, currentIndex);
			if (range) {
				linesByBlock[range.blockIndex].push(op.value);
			}
		}
	}
	const blocks = model.blocks.map((block, index) => cloneBlockWithBaseLines(block, linesByBlock[index] ?? [], block.resolved, model.options));
	return recomputeModel({ ...model, base: content }, blocks);
}

export function applyMergeAction(model: MergeModel, action: MergeAction): MergeModel {
	if (action.type === "edit-center") {
		return model.mode === "three-way" ? replaceCenterContent(model, action.content) : assembleOneWayMerge(model.left, action.content, model.options);
	}
	const targetSide =
		action.type === "accept-left"
			? "left"
			: action.type === "accept-right"
				? "right"
				: action.type === "accept-side" || action.type === "accept-all"
					? action.side
					: null;
	const applyToAll = action.type === "accept-all" || (targetSide !== null && !("blockId" in action));
	const blocks = model.blocks.map((block) => {
		const isTarget = applyToAll || ("blockId" in action && action.blockId === block.id);
		if (!isTarget) {
			return block;
		}
		if (targetSide) {
			return cloneBlockWithBaseLines(block, linesFromBlock(block, targetSide), true, model.options);
		}
		if (action.type === "delete-merged-content") {
			return cloneBlockWithBaseLines(block, [], true, model.options);
		}
		if (action.type === "mark-resolved") {
			return { ...block, resolved: action.resolved ?? true };
		}
		return block;
	});
	return recomputeModel(model, blocks);
}

export function serializeMergeCenter(model: MergeModel): string {
	return model.base;
}
