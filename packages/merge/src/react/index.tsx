import { useEffect, useMemo, useState, type ReactElement } from "react";

import {
	applyMergeAction,
	assembleOneWayMerge,
	assembleThreeWayMerge,
	serializeMergeCenter,
	type LineDiffAlgorithm,
	type MergeBlock,
	type MergeLine,
	type MergeModel,
	type MergeOptions,
	type MergeSide,
} from "../index";

export type {
	LineDiffAlgorithm,
	MergeAction,
	MergeBlock,
	MergeLine,
	MergeLinePart,
	MergeModel,
	MergeOptions,
	MergeSide,
} from "../index";

export interface MergeResolvedChange {
	resolved: boolean;
	conflictCount: number;
	unresolvedConflictCount: number;
	content: string;
}

export interface ThreePaneMergeEditorProps extends MergeOptions {
	left: string;
	base: string;
	right: string;
	leftLabel?: string;
	baseLabel?: string;
	rightLabel?: string;
	path?: string;
	language?: string;
	readOnly?: boolean;
	className?: string;
	editableSideControls?: boolean;
	onBaseChange?: (content: string) => void;
	onResolvedChange?: (state: MergeResolvedChange) => void;
}

export interface TwoPaneDiffEditorProps extends MergeOptions {
	left: string;
	right: string;
	leftLabel?: string;
	rightLabel?: string;
	path?: string;
	language?: string;
	readOnly?: boolean;
	className?: string;
}

function optionsFromProps(props: MergeOptions): MergeOptions {
	return {
		ignoreCase: props.ignoreCase,
		ignoreWhitespace: props.ignoreWhitespace,
		lineDiffAlgorithm: props.lineDiffAlgorithm,
	};
}

function emitResolvedChange(model: MergeModel, onResolvedChange?: (state: MergeResolvedChange) => void): void {
	onResolvedChange?.({
		resolved: model.unresolvedConflictCount === 0,
		conflictCount: model.conflictCount,
		unresolvedConflictCount: model.unresolvedConflictCount,
		content: serializeMergeCenter(model),
	});
}

function renderLine(line: MergeLine): ReactElement {
	return (
		<div key={line.id} className="cy-merge-line">
			<span className="cy-merge-line-number">{line.lineNumber ?? ""}</span>
			<span className="cy-merge-line-code">
				{line.parts.length > 0
					? line.parts.map((part, index) => (
							<span key={`${line.id}:part:${index}`} className={part.changed ? "cy-merge-line-part-changed" : undefined}>
								{part.text.length > 0 ? part.text : " "}
							</span>
						))
					: " "}
			</span>
		</div>
	);
}

function BlockCell({
	block,
	side,
	readOnly,
	onAcceptSide,
	onDelete,
	onMarkResolved,
}: {
	block: MergeBlock;
	side: MergeSide;
	readOnly: boolean;
	onAcceptSide?: (side: MergeSide) => void;
	onDelete?: () => void;
	onMarkResolved?: () => void;
}): ReactElement {
	const lines = block.sides[side] ?? [];
	const showControls = side === "base" && block.kind === "conflict" && !readOnly;
	return (
		<div className={`cy-merge-block-cell cy-merge-block-cell-${side}`}>
			{showControls ? (
				<div className="cy-merge-block-actions">
					<button type="button" className="cy-merge-button" onClick={() => onAcceptSide?.("left")}>
						Accept Left
					</button>
					<button type="button" className="cy-merge-button" onClick={() => onAcceptSide?.("right")}>
						Accept Right
					</button>
					<button type="button" className="cy-merge-button cy-merge-button-danger" onClick={onDelete}>
						Delete
					</button>
					<button type="button" className="cy-merge-button" onClick={onMarkResolved}>
						Mark Resolved
					</button>
				</div>
			) : null}
			{lines.length > 0 ? lines.map(renderLine) : <div className="cy-merge-line cy-merge-line-empty"> </div>}
		</div>
	);
}

function MergeSummary({ model, readOnly }: { model: MergeModel; readOnly: boolean }): ReactElement {
	const unresolved = model.unresolvedConflictCount;
	return (
		<div className="cy-merge-summary">
			<span>{model.conflictCount === 1 ? "1 conflict" : `${model.conflictCount} conflicts`}</span>
			<span>{unresolved === 0 ? "All blocks resolved" : `${unresolved} unresolved`}</span>
			{readOnly ? <span>Read only</span> : null}
		</div>
	);
}

export function ThreePaneMergeEditor({
	left,
	base,
	right,
	leftLabel = "Left",
	baseLabel = "Resolved",
	rightLabel = "Right",
	path,
	readOnly = false,
	className,
	editableSideControls = true,
	onBaseChange,
	onResolvedChange,
	...options
}: ThreePaneMergeEditorProps): ReactElement {
	const normalizedOptions = useMemo(() => optionsFromProps(options), [options.ignoreCase, options.ignoreWhitespace, options.lineDiffAlgorithm]);
	const [model, setModel] = useState(() => assembleThreeWayMerge(left, base, right, normalizedOptions));

	useEffect(() => {
		const nextModel = assembleThreeWayMerge(left, base, right, normalizedOptions);
		setModel(nextModel);
		emitResolvedChange(nextModel, onResolvedChange);
	}, [base, left, normalizedOptions, onResolvedChange, right]);

	function applyAction(blockId: string | undefined, side: MergeSide): void {
		const nextModel = applyMergeAction(model, { type: "accept-side", side, blockId });
		setModel(nextModel);
		onBaseChange?.(serializeMergeCenter(nextModel));
		emitResolvedChange(nextModel, onResolvedChange);
	}

	function applyEditorAction(nextModel: MergeModel): void {
		setModel(nextModel);
		onBaseChange?.(serializeMergeCenter(nextModel));
		emitResolvedChange(nextModel, onResolvedChange);
	}

	return (
		<div className={["cy-merge-editor", className].filter(Boolean).join(" ")} data-testid="cy-merge-editor" data-path={path}>
			<div className="cy-merge-toolbar">
				<div className="cy-merge-title">
					<span>{path ?? "Merge"}</span>
				</div>
				<MergeSummary model={model} readOnly={readOnly} />
				{editableSideControls && !readOnly ? (
					<div className="cy-merge-toolbar-actions">
						<button type="button" className="cy-merge-button" onClick={() => applyAction(undefined, "left")}>
							Accept All Left
						</button>
						<button type="button" className="cy-merge-button" onClick={() => applyAction(undefined, "right")}>
							Accept All Right
						</button>
					</div>
				) : null}
			</div>
			<div className="cy-merge-pane-labels cy-merge-pane-labels-three">
				<div>{leftLabel}</div>
				<div>{baseLabel}</div>
				<div>{rightLabel}</div>
			</div>
			<div className="cy-merge-blocks">
				{model.blocks.map((block) => (
					<div
						key={block.id}
						className={`cy-merge-block cy-merge-block-${block.kind}`}
						data-testid={block.kind === "conflict" ? "cy-merge-conflict-block" : undefined}
						data-resolved={block.resolved}
					>
						<BlockCell block={block} side="left" readOnly={readOnly} />
						<BlockCell
							block={block}
							side="base"
							readOnly={readOnly}
							onAcceptSide={(side) => applyAction(block.id, side)}
							onDelete={() => applyEditorAction(applyMergeAction(model, { type: "delete-merged-content", blockId: block.id }))}
							onMarkResolved={() => applyEditorAction(applyMergeAction(model, { type: "mark-resolved", blockId: block.id }))}
						/>
						<BlockCell block={block} side="right" readOnly={readOnly} />
					</div>
				))}
			</div>
		</div>
	);
}

export function TwoPaneDiffEditor({
	left,
	right,
	leftLabel = "Left",
	rightLabel = "Right",
	path,
	className,
	...options
}: TwoPaneDiffEditorProps): ReactElement {
	const normalizedOptions = useMemo(() => optionsFromProps(options), [options.ignoreCase, options.ignoreWhitespace, options.lineDiffAlgorithm]);
	const model = useMemo(() => assembleOneWayMerge(left, right, normalizedOptions), [left, normalizedOptions, right]);
	return (
		<div className={["cy-merge-editor", "cy-merge-editor-two-pane", className].filter(Boolean).join(" ")} data-testid="cy-diff-editor" data-path={path}>
			<div className="cy-merge-toolbar">
				<div className="cy-merge-title">
					<span>{path ?? "Diff"}</span>
				</div>
			</div>
			<div className="cy-merge-pane-labels cy-merge-pane-labels-two">
				<div>{leftLabel}</div>
				<div>{rightLabel}</div>
			</div>
			<div className="cy-merge-blocks">
				{model.blocks.map((block) => (
					<div key={block.id} className={`cy-merge-block cy-merge-block-${block.kind} cy-merge-block-two-pane`}>
						<BlockCell block={block} side="left" readOnly />
						<BlockCell block={block} side="right" readOnly />
					</div>
				))}
			</div>
		</div>
	);
}
