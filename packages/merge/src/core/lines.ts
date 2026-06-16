import type { MergeOptions } from "../types";
import { normalizeComparableLine } from "./options";

export function splitLines(text: string): string[] {
	if (text.length === 0) {
		return [];
	}
	const lines = text.split("\n");
	if (lines.at(-1) === "") {
		lines.pop();
	}
	return lines;
}

export function joinLines(lines: readonly string[], trailingNewline: boolean): string {
	const body = lines.join("\n");
	return trailingNewline && lines.length > 0 ? `${body}\n` : body;
}

export function hasTrailingNewline(text: string): boolean {
	return text.endsWith("\n");
}

export function linesEqual(left: readonly string[], right: readonly string[], options: Required<MergeOptions>): boolean {
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
