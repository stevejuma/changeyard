import type { MergeOptions } from "../types";
import { normalizeComparableLine } from "./options";

export type DiffOp =
	| { kind: "same"; left: string; right: string }
	| { kind: "left"; value: string }
	| { kind: "right"; value: string };

export function diffSequences(left: readonly string[], right: readonly string[], options: Required<MergeOptions>): DiffOp[] {
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
