import type { LineDiffAlgorithm, MergeLinePart } from "../types";
import { diffSequences } from "./diff";
import { DEFAULT_OPTIONS } from "./options";

function tokenizeInline(text: string, algorithm: LineDiffAlgorithm): string[] {
	if (algorithm === "characters") {
		return [...text];
	}
	if (algorithm === "words") {
		return text.match(/\S+|\s+/g) ?? [];
	}
	return text.match(/\w+|\s+|[^\w\s]+/g) ?? [];
}

export function diffInlineParts(text: string, against: string, algorithm: LineDiffAlgorithm): MergeLinePart[] {
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
