import type { MergeBlock, MergeLine, MergeModel, MergeSide } from "../types";
import { cloneBlockWithBaseLines, recomputeModel } from "../core/blocks";

export type RenderVisualKind = "unchanged" | "added" | "removed" | "modified" | "conflict" | "resolved";
export type RenderActionKind = "merge" | "delete" | "resolve";

export interface RenderAction {
	kind: RenderActionKind;
	side: MergeSide;
	blockId: string;
}

export interface RenderComponent {
	id: string;
	blockId: string;
	side: MergeSide;
	blockKind: MergeBlock["kind"];
	visualKind: RenderVisualKind;
	lines: MergeLine[];
	lineStart: number;
	placeholder: boolean;
	resolved: boolean;
	acceptedInCenter: boolean;
	action?: RenderAction;
}

export interface RenderConnection {
	id: string;
	fromComponentId: string;
	toComponentId: string;
	fromSide: MergeSide;
	toSide: MergeSide;
	visualKind: RenderVisualKind;
}

export interface MergeRenderModel {
	sides: Record<MergeSide, RenderComponent[]>;
	components: RenderComponent[];
	leftConnections: RenderConnection[];
	rightConnections: RenderConnection[];
}

const EMPTY_SIDES: Record<MergeSide, RenderComponent[]> = {
	left: [],
	base: [],
	right: [],
};

function lineTexts(block: MergeBlock, side: MergeSide): string[] {
	return (block.sides[side] ?? []).map((line) => line.text);
}

function startsWithSequence(lines: readonly string[], sequence: readonly string[]): boolean {
	if (sequence.length > lines.length) {
		return false;
	}
	return sequence.every((line, index) => lines[index] === line);
}

function endsWithSequence(lines: readonly string[], sequence: readonly string[]): boolean {
	if (sequence.length > lines.length) {
		return false;
	}
	const offset = lines.length - sequence.length;
	return sequence.every((line, index) => lines[offset + index] === line);
}

function hasMergedIntoCenter(block: MergeBlock, side: MergeSide): boolean {
	if (side === "base") {
		return false;
	}
	const sourceLines = lineTexts(block, side);
	const centerLines = lineTexts(block, "base");
	if (sourceLines.length === 0 || centerLines.length === 0) {
		return false;
	}
	return side === "left" ? startsWithSequence(centerLines, sourceLines) : endsWithSequence(centerLines, sourceLines);
}

function centerIncludesMergedChange(block: MergeBlock): boolean {
	return hasMergedIntoCenter(block, "left") || hasMergedIntoCenter(block, "right");
}

function oppositeSide(side: MergeSide): "left" | "right" | null {
	if (side === "left") {
		return "right";
	}
	if (side === "right") {
		return "left";
	}
	return null;
}

function visualKindFor(block: MergeBlock, side: MergeSide, placeholder: boolean): RenderVisualKind {
	if (block.kind === "unchanged") {
		return "unchanged";
	}
	if (block.kind === "conflict") {
		if (block.resolved) {
			return "resolved";
		}
		if (side !== "base" && hasMergedIntoCenter(block, side)) {
			return "added";
		}
		return "conflict";
	}
	if (block.kind === "modified") {
		if (side === "base") {
			return centerIncludesMergedChange(block) ? "added" : "modified";
		}
		if (hasMergedIntoCenter(block, side)) {
			return "added";
		}
		if (centerIncludesMergedChange(block)) {
			return "removed";
		}
		return "modified";
	}
	if (placeholder) {
		return block.kind;
	}
	return block.kind;
}

function linesForComponent(component: RenderComponent): string[] {
	return component.lines.map((line) => line.text);
}

function originalCenterLines(block: MergeBlock): string[] {
	return [...(block.originalBaseLines ?? lineTexts(block, "base"))];
}

function sideMatchesOriginalCenter(block: MergeBlock, side: "left" | "right", sourceLines: readonly string[]): boolean {
	const originalLines = originalCenterLines(block);
	return side === "left" ? startsWithSequence(originalLines, sourceLines) : endsWithSequence(originalLines, sourceLines);
}

function updateBlockCenterLines(model: MergeModel, blockId: string, lines: string[], resolved?: boolean): MergeModel {
	const blocks = model.blocks.map((block) =>
		block.id === blockId ? cloneBlockWithBaseLines(block, lines, resolved ?? block.resolved, model.options) : block,
	);
	return recomputeModel(model, blocks);
}

export function mergeRenderComponentIntoCenter(model: MergeModel, component: RenderComponent): MergeModel {
	const block = model.blocks.find((candidate) => candidate.id === component.blockId);
	if (!block || component.side === "base") {
		return model;
	}
	const sourceLines = linesForComponent(component);
	const centerLines = lineTexts(block, "base");
	if (sourceLines.length === 0) {
		return model;
	}
	if (block.kind !== "modified" && block.kind !== "conflict") {
		return updateBlockCenterLines(model, block.id, sourceLines, true);
	}
	if (hasMergedIntoCenter(block, component.side)) {
		return model;
	}
	const otherSide = oppositeSide(component.side);
	const otherSideIsMerged = otherSide ? hasMergedIntoCenter(block, otherSide) : false;
	if (!otherSideIsMerged) {
		return updateBlockCenterLines(model, block.id, sourceLines);
	}
	if (component.side === "left") {
		return updateBlockCenterLines(model, block.id, [...sourceLines, ...centerLines]);
	}
	return updateBlockCenterLines(model, block.id, [...centerLines, ...sourceLines]);
}

export function deleteMergedRenderComponentFromCenter(model: MergeModel, component: RenderComponent): MergeModel {
	const block = model.blocks.find((candidate) => candidate.id === component.blockId);
	if (!block || component.side === "base") {
		return model;
	}
	const sourceLines = linesForComponent(component);
	const centerLines = lineTexts(block, "base");
	if (sourceLines.length === 0) {
		return model;
	}
	const otherSide = oppositeSide(component.side);
	const otherSideIsMerged = otherSide ? hasMergedIntoCenter(block, otherSide) : false;
	if (component.side === "left" && startsWithSequence(centerLines, sourceLines)) {
		if (!otherSideIsMerged && !sideMatchesOriginalCenter(block, "left", sourceLines)) {
			return updateBlockCenterLines(model, block.id, originalCenterLines(block));
		}
		return updateBlockCenterLines(model, block.id, centerLines.slice(sourceLines.length));
	}
	if (component.side === "right" && endsWithSequence(centerLines, sourceLines)) {
		if (!otherSideIsMerged && !sideMatchesOriginalCenter(block, "right", sourceLines)) {
			return updateBlockCenterLines(model, block.id, originalCenterLines(block));
		}
		return updateBlockCenterLines(model, block.id, centerLines.slice(0, centerLines.length - sourceLines.length));
	}
	return model;
}

function actionFor(block: MergeBlock, side: MergeSide, visualKind: RenderVisualKind, mode: MergeModel["mode"]): RenderAction | undefined {
	if (block.kind === "unchanged") {
		return undefined;
	}
	if (mode === "one-way") {
		if (side === "base" || visualKind === "unchanged" || lineTexts(block, side).length === 0) {
			return undefined;
		}
		return { kind: "merge", side, blockId: block.id };
	}
	if (side === "base") {
		return block.kind === "conflict" ? { kind: "resolve", side, blockId: block.id } : undefined;
	}
	if (block.kind !== "modified" && block.kind !== "conflict") {
		return undefined;
	}
	if (visualKind === "unchanged") {
		return undefined;
	}
	return {
		kind: hasMergedIntoCenter(block, side) ? "delete" : "merge",
		side,
		blockId: block.id,
	};
}

function connectionVisualKind(from: RenderComponent, to: RenderComponent): RenderVisualKind {
	if (from.visualKind === "resolved" || to.visualKind === "resolved") {
		return "resolved";
	}
	if (from.visualKind === "conflict" || to.visualKind === "conflict") {
		return "conflict";
	}
	if (from.visualKind === "added" || to.visualKind === "added") {
		return "added";
	}
	if (from.visualKind === "removed" || to.visualKind === "removed") {
		return "removed";
	}
	if (from.visualKind === "modified" || to.visualKind === "modified") {
		return "modified";
	}
	return "unchanged";
}

function shouldConnect(from: RenderComponent, to: RenderComponent): boolean {
	if (from.blockKind === "unchanged" && to.blockKind === "unchanged") {
		return false;
	}
	if (from.visualKind === "unchanged" && to.visualKind === "unchanged") {
		return false;
	}
	return true;
}

export function createMergeRenderModel(model: MergeModel, sides: readonly MergeSide[] = ["left", "base", "right"]): MergeRenderModel {
	const renderSides: Record<MergeSide, RenderComponent[]> = {
		left: [],
		base: [],
		right: [],
	};
	const lineStarts: Record<MergeSide, number> = { left: 1, base: 1, right: 1 };
	const leftConnections: RenderConnection[] = [];
	const rightConnections: RenderConnection[] = [];

	for (const block of model.blocks) {
		const blockComponents = new Map<MergeSide, RenderComponent>();
		for (const side of sides) {
			const lines = block.sides[side] ?? [];
			const placeholder = lines.length === 0 && block.kind !== "unchanged";
			const visualKind = visualKindFor(block, side, placeholder);
			const component: RenderComponent = {
				id: `${block.id}:${side}`,
				blockId: block.id,
				side,
				blockKind: block.kind,
				visualKind,
				lines,
				lineStart: lineStarts[side],
				placeholder,
				resolved: block.resolved,
				acceptedInCenter: side === "base" && block.kind === "modified" && centerIncludesMergedChange(block),
				action: actionFor(block, side, visualKind, model.mode),
			};
			renderSides[side].push(component);
			blockComponents.set(side, component);
			lineStarts[side] += Math.max(lines.length, 0);
		}

		const left = blockComponents.get("left");
		const base = blockComponents.get("base");
		const right = blockComponents.get("right");
		if (left && base && shouldConnect(left, base)) {
			leftConnections.push({
				id: `${block.id}:left-base`,
				fromComponentId: left.id,
				toComponentId: base.id,
				fromSide: "left",
				toSide: "base",
				visualKind: connectionVisualKind(left, base),
			});
		}
		if (base && right && shouldConnect(base, right)) {
			rightConnections.push({
				id: `${block.id}:base-right`,
				fromComponentId: base.id,
				toComponentId: right.id,
				fromSide: "base",
				toSide: "right",
				visualKind: connectionVisualKind(base, right),
			});
		}
		if (!base && left && right && shouldConnect(left, right)) {
			leftConnections.push({
				id: `${block.id}:left-right`,
				fromComponentId: left.id,
				toComponentId: right.id,
				fromSide: "left",
				toSide: "right",
				visualKind: connectionVisualKind(left, right),
			});
		}
	}

	return {
		sides: { ...EMPTY_SIDES, ...renderSides },
		components: sides.flatMap((side) => renderSides[side]),
		leftConnections,
		rightConnections,
	};
}
