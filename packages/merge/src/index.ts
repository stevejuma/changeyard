export type MergeSide = "left" | "base" | "right";
export type MergeMode = "one-way" | "three-way";
export type MergeBlockKind = "unchanged" | "added" | "removed" | "modified" | "conflict";
export type LineDiffAlgorithm = "characters" | "words" | "words_with_space";

export interface MergeOptions {
	ignoreWhitespace?: boolean;
	ignoreCase?: boolean;
	lineDiffAlgorithm?: LineDiffAlgorithm;
}

export interface MergeLinePart {
	text: string;
	changed: boolean;
}

export interface MergeLine {
	id: string;
	text: string;
	lineNumber: number | null;
	parts: MergeLinePart[];
}

export interface MergeBlock {
	id: string;
	kind: MergeBlockKind;
	resolved: boolean;
	sides: Partial<Record<MergeSide, MergeLine[]>>;
}

export interface MergeModel {
	mode: MergeMode;
	left: string;
	base: string;
	right: string;
	sourceBase: string;
	blocks: MergeBlock[];
	options: Required<MergeOptions>;
	conflictCount: number;
	unresolvedConflictCount: number;
}

export type MergeAction =
	| { type: "accept-left"; blockId?: string }
	| { type: "accept-right"; blockId?: string }
	| { type: "accept-side"; side: MergeSide; blockId?: string }
	| { type: "accept-all"; side: MergeSide }
	| { type: "delete-merged-content"; blockId?: string }
	| { type: "mark-resolved"; blockId: string; resolved?: boolean }
	| { type: "edit-center"; content: string };

type DiffOp = { kind: "same"; left: string; right: string } | { kind: "left"; value: string } | { kind: "right"; value: string };
type SideChange = {
	baseStart: number;
	baseEnd: number;
	lines: string[];
};

const DEFAULT_OPTIONS: Required<MergeOptions> = {
	ignoreWhitespace: false,
	ignoreCase: false,
	lineDiffAlgorithm: "words_with_space",
};

function normalizeOptions(options?: MergeOptions): Required<MergeOptions> {
	return { ...DEFAULT_OPTIONS, ...options };
}

function normalizeComparableLine(line: string, options: Required<MergeOptions>): string {
	let normalized = options.ignoreWhitespace ? line.replace(/\s+/g, "") : line;
	if (options.ignoreCase) {
		normalized = normalized.toLocaleLowerCase();
	}
	return normalized;
}

function splitLines(text: string): string[] {
	if (text.length === 0) {
		return [];
	}
	const lines = text.split("\n");
	if (lines.at(-1) === "") {
		lines.pop();
	}
	return lines;
}

function joinLines(lines: readonly string[], trailingNewline: boolean): string {
	const body = lines.join("\n");
	return trailingNewline && lines.length > 0 ? `${body}\n` : body;
}

function hasTrailingNewline(text: string): boolean {
	return text.endsWith("\n");
}

function linesEqual(left: readonly string[], right: readonly string[], options: Required<MergeOptions>): boolean {
	if (left.length !== right.length) {
		return false;
	}
	for (let index = 0; index < left.length; index += 1) {
		if (normalizeComparableLine(left[index] ?? "", options) !== normalizeComparableLine(right[index] ?? "", options)) {
			return false;
		}
	}
	return true;
}

function diffSequences(left: readonly string[], right: readonly string[], options: Required<MergeOptions>): DiffOp[] {
	const leftComparable = left.map((line) => normalizeComparableLine(line, options));
	const rightComparable = right.map((line) => normalizeComparableLine(line, options));
	const rows = left.length + 1;
	const columns = right.length + 1;
	const table = Array.from({ length: rows }, () => new Array<number>(columns).fill(0));
	for (let leftIndex = left.length - 1; leftIndex >= 0; leftIndex -= 1) {
		for (let rightIndex = right.length - 1; rightIndex >= 0; rightIndex -= 1) {
			table[leftIndex]![rightIndex] =
				leftComparable[leftIndex] === rightComparable[rightIndex]
					? table[leftIndex + 1]![rightIndex + 1]! + 1
					: Math.max(table[leftIndex + 1]![rightIndex]!, table[leftIndex]![rightIndex + 1]!);
		}
	}
	const ops: DiffOp[] = [];
	let leftIndex = 0;
	let rightIndex = 0;
	while (leftIndex < left.length && rightIndex < right.length) {
		if (leftComparable[leftIndex] === rightComparable[rightIndex]) {
			ops.push({ kind: "same", left: left[leftIndex] ?? "", right: right[rightIndex] ?? "" });
			leftIndex += 1;
			rightIndex += 1;
		} else if (table[leftIndex + 1]![rightIndex]! >= table[leftIndex]![rightIndex + 1]!) {
			ops.push({ kind: "left", value: left[leftIndex] ?? "" });
			leftIndex += 1;
		} else {
			ops.push({ kind: "right", value: right[rightIndex] ?? "" });
			rightIndex += 1;
		}
	}
	while (leftIndex < left.length) {
		ops.push({ kind: "left", value: left[leftIndex] ?? "" });
		leftIndex += 1;
	}
	while (rightIndex < right.length) {
		ops.push({ kind: "right", value: right[rightIndex] ?? "" });
		rightIndex += 1;
	}
	return ops;
}

function tokenizeInline(text: string, algorithm: LineDiffAlgorithm): string[] {
	if (algorithm === "characters") {
		return [...text];
	}
	if (algorithm === "words") {
		return text.match(/\S+|\s+/g) ?? [];
	}
	return text.match(/\w+|\s+|[^\w\s]+/g) ?? [];
}

function diffInlineParts(text: string, against: string, algorithm: LineDiffAlgorithm): MergeLinePart[] {
	if (text === against) {
		return text ? [{ text, changed: false }] : [];
	}
	const tokens = tokenizeInline(text, algorithm);
	const againstTokens = tokenizeInline(against, algorithm);
	const ops = diffSequences(tokens, againstTokens, DEFAULT_OPTIONS);
	const parts: MergeLinePart[] = [];
	for (const op of ops) {
		if (op.kind === "same") {
			parts.push({ text: op.left, changed: false });
		} else if (op.kind === "left") {
			parts.push({ text: op.value, changed: true });
		}
	}
	return parts.length > 0 ? parts : [{ text, changed: true }];
}

function createLines(
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

function createBlock(
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
	return { id, kind, resolved, sides };
}

function linesFromBlock(block: MergeBlock, side: MergeSide): string[] {
	return (block.sides[side] ?? []).map((line) => line.text);
}

function recomputeModel(model: MergeModel, blocks: MergeBlock[]): MergeModel {
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

export function assembleOneWayMerge(left: string, right: string, options?: MergeOptions): MergeModel {
	const normalizedOptions = normalizeOptions(options);
	const leftLines = splitLines(left);
	const rightLines = splitLines(right);
	const ops = diffSequences(leftLines, rightLines, normalizedOptions);
	const blocks: MergeBlock[] = [];
	let leftLine = 0;
	let rightLine = 0;
	let pendingLeft: string[] = [];
	let pendingRight: string[] = [];
	let pendingLeftStart = 0;
	let pendingRightStart = 0;

	function flushPending(): void {
		if (pendingLeft.length === 0 && pendingRight.length === 0) {
			return;
		}
		const kind: MergeBlockKind =
			pendingLeft.length > 0 && pendingRight.length > 0
				? "modified"
				: pendingLeft.length > 0
					? "removed"
					: "added";
		blocks.push(
			createBlock(
				blocks.length,
				kind,
				true,
				{ left: pendingLeft, right: pendingRight, base: pendingRight },
				{ left: pendingLeftStart, right: pendingRightStart, base: pendingRightStart },
				normalizedOptions,
			),
		);
		pendingLeft = [];
		pendingRight = [];
	}

	for (const op of ops) {
		if (op.kind === "same") {
			flushPending();
			blocks.push(
				createBlock(
					blocks.length,
					"unchanged",
					true,
					{ left: [op.left], right: [op.right], base: [op.right] },
					{ left: leftLine, right: rightLine, base: rightLine },
					normalizedOptions,
				),
			);
			leftLine += 1;
			rightLine += 1;
			continue;
		}
		if (pendingLeft.length === 0 && pendingRight.length === 0) {
			pendingLeftStart = leftLine;
			pendingRightStart = rightLine;
		}
		if (op.kind === "left") {
			pendingLeft.push(op.value);
			leftLine += 1;
		} else {
			pendingRight.push(op.value);
			rightLine += 1;
		}
	}
	flushPending();
	return recomputeModel(
		{
			mode: "one-way",
			left,
			base: right,
			right,
			sourceBase: right,
			blocks,
			options: normalizedOptions,
			conflictCount: 0,
			unresolvedConflictCount: 0,
		},
		blocks,
	);
}

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
			while (
				baseIndex < baseLines.length &&
				!findCoveringChange(leftChanges, baseIndex) &&
				!findCoveringChange(rightChanges, baseIndex) &&
				!findInsertion(leftChanges, baseIndex + 1) &&
				!findInsertion(rightChanges, baseIndex + 1)
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

function cloneBlockWithBaseLines(block: MergeBlock, lines: string[], resolved: boolean, options: Required<MergeOptions>): MergeBlock {
	const lineStart = block.sides.base?.[0]?.lineNumber ? block.sides.base[0].lineNumber - 1 : null;
	return createBlock(
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
}

export function applyMergeAction(model: MergeModel, action: MergeAction): MergeModel {
	if (action.type === "edit-center") {
		return model.mode === "three-way"
			? assembleThreeWayMerge(model.left, action.content, model.right, model.options)
			: assembleOneWayMerge(model.left, action.content, model.options);
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
