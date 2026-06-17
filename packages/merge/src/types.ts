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
	originalBaseLines?: string[];
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
