import type { MergeBlock, MergeBlockKind, MergeModel, MergeOptions } from "../types";
import { createBlock, recomputeModel } from "./blocks";
import { diffSequences } from "./diff";
import { splitLines } from "./lines";
import { normalizeOptions } from "./options";

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
