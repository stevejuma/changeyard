import * as RadixDropdownMenu from "@radix-ui/react-dropdown-menu";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement, type ReactNode, type RefObject } from "react";

import {
	applyMergeAction,
	assembleOneWayMerge,
	assembleThreeWayMerge,
	serializeMergeCenter,
	type LineDiffAlgorithm,
	type MergeLine,
	type MergeModel,
	type MergeOptions,
	type MergeSide,
} from "../index";
import {
	createMergeRenderModel,
	deleteMergedRenderComponentFromCenter,
	mergeRenderComponentIntoCenter,
	type MergeRenderModel,
	type RenderComponent,
	type RenderConnection,
	type RenderVisualKind,
} from "./render-model";

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

export type MergeEditorOptionPatch = Partial<{
	ignoreWhitespace: boolean;
	ignoreCase: boolean;
	lineDiffAlgorithm: LineDiffAlgorithm;
	syncHorizontalScroll: boolean;
	editableSideControls: boolean;
}>;

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
	editableSides?: readonly MergeSide[];
	syncHorizontalScroll?: boolean;
	onLeftChange?: (content: string) => void;
	onBaseChange?: (content: string) => void;
	onRightChange?: (content: string) => void;
	onResolvedChange?: (state: MergeResolvedChange) => void;
	onOptionsChange?: (patch: MergeEditorOptionPatch) => void;
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
	editableSideControls?: boolean;
	syncHorizontalScroll?: boolean;
	onLeftChange?: (content: string) => void;
	onRightChange?: (content: string) => void;
	onOptionsChange?: (patch: MergeEditorOptionPatch) => void;
}

function optionsFromProps(props: MergeOptions): MergeOptions {
	return {
		ignoreCase: props.ignoreCase,
		ignoreWhitespace: props.ignoreWhitespace,
		lineDiffAlgorithm: props.lineDiffAlgorithm,
	};
}

type EffectiveMergeEditorOptions = {
	ignoreWhitespace: boolean;
	ignoreCase: boolean;
	lineDiffAlgorithm: LineDiffAlgorithm;
	syncHorizontalScroll: boolean;
	editableSideControls: boolean;
};

const DEFAULT_REACT_MERGE_OPTIONS: EffectiveMergeEditorOptions = {
	ignoreWhitespace: true,
	ignoreCase: false,
	lineDiffAlgorithm: "words_with_space",
	syncHorizontalScroll: true,
	editableSideControls: true,
};

function lineDiffAlgorithmLabel(algorithm: LineDiffAlgorithm): string {
	if (algorithm === "characters") {
		return "Characters";
	}
	if (algorithm === "words") {
		return "Words";
	}
	return "Words with spaces";
}

function emitResolvedChange(model: MergeModel, onResolvedChange?: (state: MergeResolvedChange) => void): void {
	onResolvedChange?.({
		resolved: model.unresolvedConflictCount === 0,
		conflictCount: model.conflictCount,
		unresolvedConflictCount: model.unresolvedConflictCount,
		content: serializeMergeCenter(model),
	});
}

type SyntaxTokenKind = "plain" | "comment" | "string" | "keyword" | "number" | "operator" | "punctuation" | "constant";
type SyntaxToken = { text: string; kind: SyntaxTokenKind };

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
	c: "c",
	cc: "cpp",
	cjs: "javascript",
	cpp: "cpp",
	cs: "csharp",
	css: "css",
	go: "go",
	h: "c",
	hpp: "cpp",
	html: "html",
	java: "java",
	js: "javascript",
	jsx: "javascript",
	json: "json",
	kt: "kotlin",
	kts: "kotlin",
	md: "markdown",
	mjs: "javascript",
	py: "python",
	rs: "rust",
	sh: "shell",
	svelte: "html",
	ts: "typescript",
	tsx: "typescript",
};

const KEYWORDS: Record<string, Set<string>> = {
	c: new Set(["auto", "break", "case", "char", "const", "continue", "default", "do", "double", "else", "enum", "extern", "float", "for", "goto", "if", "inline", "int", "long", "register", "return", "short", "signed", "sizeof", "static", "struct", "switch", "typedef", "union", "unsigned", "void", "volatile", "while"]),
	cpp: new Set(["alignas", "alignof", "auto", "bool", "break", "case", "catch", "class", "const", "constexpr", "continue", "decltype", "default", "delete", "do", "double", "else", "enum", "explicit", "export", "extern", "false", "float", "for", "friend", "if", "inline", "int", "long", "mutable", "namespace", "new", "noexcept", "nullptr", "operator", "private", "protected", "public", "return", "short", "signed", "sizeof", "static", "struct", "switch", "template", "this", "throw", "true", "try", "typedef", "typename", "union", "unsigned", "using", "virtual", "void", "volatile", "while"]),
	csharp: new Set(["abstract", "as", "base", "bool", "break", "case", "catch", "class", "const", "continue", "default", "delegate", "do", "else", "enum", "event", "false", "finally", "fixed", "for", "foreach", "if", "in", "int", "interface", "internal", "is", "lock", "namespace", "new", "null", "object", "out", "override", "private", "protected", "public", "readonly", "ref", "return", "sealed", "static", "string", "struct", "switch", "this", "throw", "true", "try", "typeof", "using", "var", "virtual", "void", "while"]),
	css: new Set(["and", "important", "media", "not", "only", "or", "supports"]),
	go: new Set(["break", "case", "chan", "const", "continue", "default", "defer", "else", "fallthrough", "for", "func", "go", "goto", "if", "import", "interface", "map", "package", "range", "return", "select", "struct", "switch", "type", "var"]),
	html: new Set(["doctype"]),
	java: new Set(["abstract", "assert", "boolean", "break", "byte", "case", "catch", "char", "class", "const", "continue", "default", "do", "double", "else", "enum", "extends", "final", "finally", "float", "for", "if", "implements", "import", "instanceof", "int", "interface", "long", "native", "new", "package", "private", "protected", "public", "return", "short", "static", "strictfp", "super", "switch", "synchronized", "this", "throw", "throws", "transient", "try", "void", "volatile", "while"]),
	javascript: new Set(["async", "await", "break", "case", "catch", "class", "const", "continue", "debugger", "default", "delete", "do", "else", "export", "extends", "finally", "for", "from", "function", "get", "if", "import", "in", "instanceof", "let", "new", "of", "return", "set", "static", "super", "switch", "this", "throw", "try", "typeof", "var", "void", "while", "with", "yield"]),
	json: new Set(),
	kotlin: new Set(["as", "break", "class", "continue", "data", "do", "else", "false", "for", "fun", "if", "in", "interface", "is", "null", "object", "package", "return", "super", "this", "throw", "true", "try", "typealias", "val", "var", "when", "while"]),
	markdown: new Set(),
	python: new Set(["and", "as", "assert", "async", "await", "break", "class", "continue", "def", "del", "elif", "else", "except", "False", "finally", "for", "from", "global", "if", "import", "in", "is", "lambda", "None", "nonlocal", "not", "or", "pass", "raise", "return", "True", "try", "while", "with", "yield"]),
	rust: new Set(["as", "async", "await", "break", "const", "continue", "crate", "dyn", "else", "enum", "extern", "false", "fn", "for", "if", "impl", "in", "let", "loop", "match", "mod", "move", "mut", "pub", "ref", "return", "self", "Self", "static", "struct", "super", "trait", "true", "type", "unsafe", "use", "where", "while"]),
	shell: new Set(["case", "do", "done", "elif", "else", "esac", "export", "fi", "for", "function", "if", "in", "local", "readonly", "return", "set", "then", "unset", "while"]),
	typescript: new Set(["abstract", "any", "as", "async", "await", "boolean", "break", "case", "catch", "class", "const", "continue", "declare", "default", "delete", "do", "else", "enum", "export", "extends", "false", "finally", "for", "from", "function", "get", "if", "implements", "import", "in", "infer", "instanceof", "interface", "keyof", "let", "module", "namespace", "never", "new", "null", "number", "object", "of", "private", "protected", "public", "readonly", "return", "set", "static", "string", "super", "switch", "this", "throw", "true", "try", "type", "typeof", "undefined", "unknown", "var", "void", "while", "with", "yield"]),
};

const CONSTANTS = new Set(["false", "null", "None", "nil", "true", "undefined"]);
const C_LIKE_TOKEN_PATTERN = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(\/\/.*|\/\*.*?\*\/)|(\b[A-Za-z_]\w*\b)|(\b\d+(?:\.\d+)?\b)|(->|=>|::|[{}()[\];,.<>+\-*/%=&|!?:]+)/g;
const HASH_TOKEN_PATTERN = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(#.*)|(\b[A-Za-z_]\w*\b)|(\b\d+(?:\.\d+)?\b)|(->|=>|::|[{}()[\];,.<>+\-*/%=&|!?:]+)/g;
const HTML_TOKEN_PATTERN = /(<!--.*?-->)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(<\/?[A-Za-z][A-Za-z0-9:-]*|\/?>)|(\b[A-Za-z_][\w:-]*\b)|(\b\d+(?:\.\d+)?\b)|(=|[{}()[\];,.<>+\-*/%&|!?:]+)/g;

function normalizeLanguage(language?: string, path?: string): string | undefined {
	const explicit = language?.trim().toLowerCase();
	if (explicit) {
		return explicit === "tsx" || explicit === "jsx" ? "typescript" : (LANGUAGE_BY_EXTENSION[explicit] ?? explicit);
	}
	const extension = path?.split(".").pop()?.toLowerCase();
	return extension ? LANGUAGE_BY_EXTENSION[extension] : undefined;
}

function syntaxPatternFor(language: string | undefined): RegExp | null {
	if (!language) {
		return null;
	}
	if (language === "python" || language === "shell") {
		return new RegExp(HASH_TOKEN_PATTERN);
	}
	if (language === "html" || language === "markdown") {
		return new RegExp(HTML_TOKEN_PATTERN);
	}
	return new RegExp(C_LIKE_TOKEN_PATTERN);
}

function tokenizeSyntax(text: string, language: string | undefined): SyntaxToken[] {
	const pattern = syntaxPatternFor(language);
	if (!pattern) {
		return [{ text, kind: "plain" }];
	}
	const keywords = KEYWORDS[language ?? ""] ?? new Set<string>();
	const tokens: SyntaxToken[] = [];
	let cursor = 0;
	for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
		if (match.index > cursor) {
			tokens.push({ text: text.slice(cursor, match.index), kind: "plain" });
		}
		const matched = match[0];
		let kind: SyntaxTokenKind = "operator";
		if (language === "html" || language === "markdown") {
			if (match[1]) {
				kind = "comment";
			} else if (match[2]) {
				kind = "string";
			} else if (match[3]) {
				kind = "keyword";
			} else if (match[4]) {
				kind = keywords.has(matched) ? "keyword" : "plain";
			} else if (match[5]) {
				kind = "number";
			} else {
				kind = /^[{}()[\];,.<>]$/.test(matched) ? "punctuation" : "operator";
			}
		} else if (match[1]) {
			kind = "string";
		} else if (match[2]) {
			kind = "comment";
		} else if (match[3]) {
			kind = CONSTANTS.has(matched) ? "constant" : keywords.has(matched) ? "keyword" : "plain";
		} else if (match[4]) {
			kind = "number";
		} else {
			kind = /^[{}()[\];,.]$/.test(matched) ? "punctuation" : "operator";
		}
		tokens.push({ text: matched, kind });
		cursor = match.index + matched.length;
	}
	if (cursor < text.length) {
		tokens.push({ text: text.slice(cursor), kind: "plain" });
	}
	return tokens.length > 0 ? tokens : [{ text, kind: "plain" }];
}

function renderSyntax(text: string, language: string | undefined, keyPrefix: string): ReactNode[] {
	return tokenizeSyntax(text, language).map((token, index) =>
		token.kind === "plain" ? (
			token.text
		) : (
			<span key={`${keyPrefix}:token:${index}`} className={`cy-merge-token cy-merge-token-${token.kind}`}>
				{token.text}
			</span>
		),
	);
}

function countWords(text: string): number {
	return text.trim().length === 0 ? 0 : (text.trim().match(/\S+/g) ?? []).length;
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
	return `${count} ${count === 1 ? singular : plural}`;
}

function joinEditorLines(lines: readonly string[], trailingNewline: boolean): string {
	const body = lines.join("\n");
	return trailingNewline && lines.length > 0 ? `${body}\n` : body;
}

function renderComponentLineTexts(component: RenderComponent): string[] {
	return component.lines.map((line) => line.text);
}

function modelSideContentWithReplacement(
	model: MergeModel,
	side: "left" | "right",
	replacement: { blockId: string; lines: readonly string[] },
): string {
	const lines = model.blocks.flatMap((block) =>
		block.id === replacement.blockId ? [...replacement.lines] : (block.sides[side] ?? []).map((line) => line.text),
	);
	return joinEditorLines(lines, model[side].endsWith("\n"));
}

function usePaneScrollSync(containerRef: RefObject<HTMLElement>, syncHorizontalScroll: boolean): void {
	useEffect(() => {
		const container = containerRef.current;
		if (!container) {
			return;
		}
		const scrollTargets = Array.from(container.querySelectorAll<HTMLElement>(".cy-merge-pane-scroll"));
		if (scrollTargets.length === 0) {
			return;
		}
		let syncing = false;
		const cleanups = scrollTargets.map((target) => {
			const listener = () => {
				if (syncing) {
					return;
				}
				syncing = true;
				const side = target.dataset.mergeSide;
				const nextScrollLeft = target.scrollLeft;
				for (const candidate of scrollTargets) {
					if (candidate === target) {
						continue;
					}
					if (!syncHorizontalScroll && candidate.dataset.mergeSide !== side) {
						continue;
					}
					if (candidate.scrollLeft !== nextScrollLeft) {
						candidate.scrollLeft = nextScrollLeft;
					}
				}
				syncing = false;
			};
			target.addEventListener("scroll", listener, { passive: true });
			return () => target.removeEventListener("scroll", listener);
		});
		return () => {
			for (const cleanup of cleanups) {
				cleanup();
			}
		};
	});
}

function useEditablePaneScrollSync(
	contentRef: RefObject<HTMLDivElement>,
	textareaRef: RefObject<HTMLTextAreaElement>,
	editable: boolean,
): void {
	useEffect(() => {
		const content = contentRef.current;
		const textarea = textareaRef.current;
		if (!editable || !content || !textarea) {
			return;
		}
		let syncing = false;
		const syncFromContent = () => {
			if (syncing) {
				return;
			}
			syncing = true;
			textarea.scrollLeft = content.scrollLeft;
			syncing = false;
		};
		const syncFromTextarea = () => {
			if (syncing) {
				return;
			}
			syncing = true;
			content.scrollLeft = textarea.scrollLeft;
			syncing = false;
		};
		content.addEventListener("scroll", syncFromContent, { passive: true });
		textarea.addEventListener("scroll", syncFromTextarea, { passive: true });
		return () => {
			content.removeEventListener("scroll", syncFromContent);
			textarea.removeEventListener("scroll", syncFromTextarea);
		};
	}, [contentRef, editable, textareaRef]);
}

type ConnectorLaneName = "left" | "right";
type ConnectorPathGeometry = { id: string; path: string; visualKind: RenderVisualKind };
type ConnectorLaneGeometry = { width: number; height: number; paths: ConnectorPathGeometry[] };
type ConnectorGeometry = Record<ConnectorLaneName, ConnectorLaneGeometry>;
type NavigationTarget = { blockId: string; label: "change" | "conflict" };

const EMPTY_CONNECTOR_GEOMETRY: ConnectorGeometry = {
	left: { width: 40, height: 0, paths: [] },
	right: { width: 40, height: 0, paths: [] },
};

function renderLine(line: MergeLine, language: string | undefined): ReactElement {
	const parts = line.parts.length > 0 ? line.parts : [{ text: line.text, changed: false }];
	return (
		<div key={line.id} className="cy-merge-line">
			<span className="cy-merge-line-code">
				{parts.length > 0
					? parts.map((part, index) => (
							<span key={`${line.id}:part:${index}`} className={part.changed ? "cy-merge-line-part-changed" : undefined}>
								{renderSyntax(part.text.length > 0 ? part.text : " ", language, `${line.id}:part:${index}`)}
							</span>
						))
					: " "}
			</span>
		</div>
	);
}

function connectorPath(width: number, fromTop: number, fromBottom: number, toTop: number, toBottom: number): string {
	const bend = Math.min(8, Math.max(4, width / 4));
	return [
		`M 0 ${fromTop}`,
		`C ${bend} ${fromTop}, ${width - bend} ${toTop}, ${width} ${toTop}`,
		`L ${width} ${toBottom}`,
		`C ${width - bend} ${toBottom}, ${bend} ${fromBottom}, 0 ${fromBottom}`,
		"Z",
	].join(" ");
}

function measureConnectorLane(container: HTMLElement, laneName: ConnectorLaneName, connections: readonly RenderConnection[]): ConnectorLaneGeometry {
	const lane = container.querySelector<HTMLElement>(`[data-connector-lane="${laneName}"]`);
	if (!lane) {
		return EMPTY_CONNECTOR_GEOMETRY[laneName];
	}
	const laneRect = lane.getBoundingClientRect();
	const width = lane.clientWidth || 40;
	const height = lane.clientHeight;
	const paths = connections.flatMap((connection): ConnectorPathGeometry[] => {
		const from = container.querySelector<HTMLElement>(`[data-render-component-id="${connection.fromComponentId}"]`);
		const to = container.querySelector<HTMLElement>(`[data-render-component-id="${connection.toComponentId}"]`);
		if (!from || !to) {
			return [];
		}
		const fromRect = from.getBoundingClientRect();
		const toRect = to.getBoundingClientRect();
		const fromTop = fromRect.top - laneRect.top;
		const fromBottom = fromRect.bottom - laneRect.top;
		const toTop = toRect.top - laneRect.top;
		const toBottom = toRect.bottom - laneRect.top;
		return [
			{
				id: connection.id,
				visualKind: connection.visualKind,
				path: connectorPath(width, fromTop, fromBottom, toTop, toBottom),
			},
		];
	});
	return { width, height, paths };
}

function useConnectorGeometry(containerRef: RefObject<HTMLElement>, renderModel: MergeRenderModel): ConnectorGeometry {
	const [geometry, setGeometry] = useState<ConnectorGeometry>(EMPTY_CONNECTOR_GEOMETRY);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) {
			return;
		}
		let frame = 0;
		const measure = () => {
			frame = 0;
			setGeometry({
				left: measureConnectorLane(container, "left", renderModel.leftConnections),
				right: measureConnectorLane(container, "right", renderModel.rightConnections),
			});
		};
		const schedule = () => {
			if (frame !== 0) {
				return;
			}
			frame = window.requestAnimationFrame(measure);
		};
		const resizeObserver = new ResizeObserver(schedule);
		resizeObserver.observe(container);
		for (const target of Array.from(container.querySelectorAll<HTMLElement>(".cy-merge-view, .cy-merge-view-content, .cy-merge-component"))) {
			resizeObserver.observe(target);
		}
		for (const scrollTarget of Array.from(container.querySelectorAll<HTMLElement>(".cy-merge-main, .cy-merge-view-content, .cy-merge-edit-textarea"))) {
			scrollTarget.addEventListener("scroll", schedule, { passive: true });
		}
		window.addEventListener("resize", schedule);
		schedule();
		return () => {
			if (frame !== 0) {
				window.cancelAnimationFrame(frame);
			}
			resizeObserver.disconnect();
			for (const scrollTarget of Array.from(container.querySelectorAll<HTMLElement>(".cy-merge-main, .cy-merge-view-content, .cy-merge-edit-textarea"))) {
				scrollTarget.removeEventListener("scroll", schedule);
			}
			window.removeEventListener("resize", schedule);
		};
	}, [containerRef, renderModel]);

	return geometry;
}

function useActiveNavigationHighlight(containerRef: RefObject<HTMLElement>, activeBlockId: string | undefined): void {
	useEffect(() => {
		const container = containerRef.current;
		if (!container || !activeBlockId) {
			return;
		}
		const elements = Array.from(
			container.querySelectorAll<HTMLElement>(
				`.cy-merge-component[data-block-id="${activeBlockId}"], .cy-merge-line-number[data-block-id="${activeBlockId}"], .cy-merge-line-placeholder[data-block-id="${activeBlockId}"]`,
			),
		);
		for (const element of elements) {
			element.classList.add("cy-merge-active-diff");
		}
		return () => {
			for (const element of elements) {
				element.classList.remove("cy-merge-active-diff");
			}
		};
	}, [activeBlockId, containerRef]);
}

function ActionIcon({ kind }: { kind: "accept-all" | "merge" | "delete" | "resolve" | "previous" | "next" }): ReactElement {
	if (kind === "accept-all") {
		return (
			<svg aria-hidden="true" viewBox="0 0 24 24">
				<path d="M18 6 7 17l-5-5" />
				<path d="m22 10-7.5 7.5L13 16" />
			</svg>
		);
	}
	if (kind === "delete") {
		return (
			<svg aria-hidden="true" viewBox="0 0 24 24">
				<path d="M16.066 8.995a.75.75 0 1 0-1.06-1.061L12 10.939L8.995 7.934a.75.75 0 1 0-1.06 1.06L10.938 12l-3.005 3.005a.75.75 0 0 0 1.06 1.06L12 13.06l3.005 3.006a.75.75 0 0 0 1.06-1.06L13.062 12z" />
			</svg>
		);
	}
	if (kind === "resolve") {
		return (
			<svg aria-hidden="true" viewBox="0 0 24 24">
				<path d="M20.71 7.04c.39-.39.39-1.04 0-1.41l-2.34-2.34c-.37-.39-1.02-.39-1.41 0l-1.84 1.83l3.75 3.75M3 17.25V21h3.75L17.81 9.93l-3.75-3.75L3 17.25Z" />
			</svg>
		);
	}
	if (kind === "previous") {
		return (
			<svg aria-hidden="true" viewBox="0 0 24 24">
				<path d="M7.41 15.41 12 10.83l4.59 4.58L18 14l-6-6-6 6z" />
			</svg>
		);
	}
	if (kind === "next") {
		return (
			<svg aria-hidden="true" viewBox="0 0 24 24">
				<path d="M7.41 8.58 12 13.17l4.59-4.59L18 10l-6 6-6-6z" />
			</svg>
		);
	}
	return (
		<svg aria-hidden="true" viewBox="0 0 24 24">
			<path d="M8 5v14l11-7z" />
		</svg>
	);
}

function ComponentActionButton({
	component,
	readOnly,
	onAction,
}: {
	component: RenderComponent;
	readOnly: boolean;
	onAction: (component: RenderComponent) => void;
}): ReactElement | null {
	if (readOnly || !component.action) {
		return null;
	}
	const label =
		component.action.kind === "resolve"
			? component.resolved
				? "Mark Unresolved"
				: "Mark Resolved"
			: component.action.kind === "delete"
				? "Delete merged content"
				: `Merge ${component.side === "left" ? "Left" : "Right"}`;
	return (
		<button
			type="button"
			className={`cy-merge-icon-button cy-merge-action-button cy-merge-action-${component.action.kind}`}
			aria-label={label}
			title={label}
			onClick={() => onAction(component)}
		>
			<ActionIcon kind={component.action.kind} />
		</button>
	);
}

function RenderSidePanel({
	component,
	readOnly,
	onAction,
}: {
	component: RenderComponent;
	readOnly: boolean;
	onAction: (component: RenderComponent) => void;
}): ReactElement {
	if (component.placeholder || component.lines.length === 0) {
		return (
			<div
				className={`cy-merge-line-placeholder cy-merge-line-placeholder-${component.visualKind}`}
				data-render-side-panel-id={component.id}
				data-block-id={component.blockId}
				data-visual-kind={component.visualKind}
			/>
		);
	}
	return (
		<>
			{component.lines.map((line, index) => (
				<div
					key={`${component.id}:number:${line.id}`}
					className={`cy-merge-line-number cy-merge-line-number-${component.visualKind}`}
					data-render-side-panel-id={index === 0 ? component.id : undefined}
					data-block-id={component.blockId}
					data-visual-kind={component.visualKind}
				>
					{index === 0 ? <ComponentActionButton component={component} readOnly={readOnly} onAction={onAction} /> : null}
					<pre>{component.lineStart + index}</pre>
				</div>
			))}
		</>
	);
}

function RenderComponentBlock({
	component,
	language,
}: {
	component: RenderComponent;
	language?: string;
}): ReactElement {
	return (
		<div
			className={[
				"cy-merge-component",
				`cy-merge-component-${component.visualKind}`,
				component.placeholder ? "cy-merge-component-placeholder" : "",
				component.acceptedInCenter ? "cy-merge-component-accepted" : "",
			]
				.filter(Boolean)
				.join(" ")}
			data-render-component-id={component.id}
			data-component-id={component.id}
			data-block-id={component.blockId}
			data-visual-kind={component.visualKind}
			data-placeholder={component.placeholder}
		>
			{component.lines.length > 0 ? component.lines.map((line) => renderLine(line, language)) : null}
		</div>
	);
}

function RenderView({
	side,
	components,
	label,
	language,
	readOnly,
	editable,
	value,
	lineNumbersSide = "left",
	onChange,
	onAction,
}: {
	side: MergeSide;
	components: RenderComponent[];
	label: string;
	language?: string;
	readOnly: boolean;
	editable: boolean;
	value: string;
	lineNumbersSide?: "left" | "right";
	onChange: (content: string) => void;
	onAction: (component: RenderComponent) => void;
}): ReactElement {
	const contentRef = useRef<HTMLDivElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const lineCount = Math.max(1, value.length === 0 ? 1 : value.split("\n").length);
	const style = { "--cy-merge-edit-min-height": `${lineCount * 20}px` } as CSSProperties;
	useEditablePaneScrollSync(contentRef, textareaRef, editable);
	const sidePanel = (
		<div className={`cy-merge-side-panel cy-merge-side-panel-${lineNumbersSide}`}>
			{components.map((component) => (
				<RenderSidePanel key={`${component.id}:panel`} component={component} readOnly={readOnly} onAction={onAction} />
			))}
		</div>
	);
	return (
		<section className={`cy-merge-view cy-merge-view-${side}`} data-merge-side={side} data-editable={editable}>
			{lineNumbersSide === "left" ? sidePanel : null}
			<div className="cy-merge-view-inner">
				<div ref={contentRef} className={`cy-merge-view-content cy-merge-pane-scroll cy-merge-pane-scroll-${side}`} data-merge-side={side} style={style}>
					<div className="cy-merge-component-stack" aria-hidden={editable}>
						{components.map((component) => (
							<RenderComponentBlock key={component.id} component={component} language={language} />
						))}
					</div>
					{editable ? (
						<textarea
							ref={textareaRef}
							aria-label={`Edit ${label}`}
							className={`cy-merge-edit-textarea cy-merge-edit-textarea-${side}`}
							data-merge-side={side}
							spellCheck={false}
							value={value}
							onChange={(event) => onChange(event.currentTarget.value)}
						/>
					) : null}
				</div>
			</div>
			{lineNumbersSide === "right" ? sidePanel : null}
		</section>
	);
}

function ConnectorLane({ name, geometry }: { name: ConnectorLaneName; geometry: ConnectorLaneGeometry }): ReactElement {
	return (
		<div className={`cy-merge-connector-lane cy-merge-connector-lane-${name}`} data-connector-lane={name} aria-hidden="true">
			<svg width={geometry.width} height={geometry.height} viewBox={`0 0 ${geometry.width} ${geometry.height}`} preserveAspectRatio="none" focusable="false">
				{geometry.paths.map((path) => (
					<path key={path.id} className={`cy-merge-connector-path cy-merge-connector-path-${path.visualKind}`} d={path.path} />
				))}
			</svg>
		</div>
	);
}

function HeaderIconButton({
	label,
	kind,
	className,
	disabled = false,
	onClick,
}: {
	label: string;
	kind: "accept-all" | "previous" | "next";
	className?: string;
	disabled?: boolean;
	onClick: () => void;
}): ReactElement {
	return (
		<button
			type="button"
			className={["cy-merge-header-button", className].filter(Boolean).join(" ")}
			aria-label={label}
			title={label}
			disabled={disabled}
			onClick={onClick}
		>
			<ActionIcon kind={kind} />
		</button>
	);
}

function PaneLabel({
	label,
	side,
	showAcceptAll,
	onAcceptAll,
}: {
	label: string;
	side?: "left" | "right";
	showAcceptAll?: boolean;
	onAcceptAll?: () => void;
}): ReactElement {
	const acceptLabel = side === "left" ? "Accept All Incoming Changes from Left" : "Accept All Incoming Changes from Right";
	return (
		<div className={`cy-merge-pane-label cy-merge-pane-label-${side ?? "base"}`}>
			{showAcceptAll && side && onAcceptAll ? (
				<HeaderIconButton
					label={acceptLabel}
					kind="accept-all"
					className={`cy-merge-accept-all-button cy-merge-accept-all-${side}`}
					onClick={onAcceptAll}
				/>
			) : null}
			<span>{label}</span>
		</div>
	);
}

function MergeNavigation({
	target,
	targetCount,
	activeIndex,
	onPrevious,
	onNext,
}: {
	target: NavigationTarget | undefined;
	targetCount: number;
	activeIndex: number;
	onPrevious: () => void;
	onNext: () => void;
}): ReactElement {
	const label = target?.label ?? "change";
	const disabled = targetCount === 0;
	const counter = targetCount > 0 ? `${activeIndex < 0 ? "-" : activeIndex + 1} / ${targetCount} ${label}${targetCount === 1 ? "" : "s"}` : `No ${label}s`;
	return (
		<div className="cy-merge-navigation">
			<HeaderIconButton label={`Previous ${label}`} kind="previous" disabled={disabled} onClick={onPrevious} />
			<span className="cy-merge-navigation-counter">{counter}</span>
			<HeaderIconButton label={`Next ${label}`} kind="next" disabled={disabled} onClick={onNext} />
		</div>
	);
}

function MergeOptionsMenu({
	values,
	onOptionsChange,
	onResetToOriginal,
}: {
	values: EffectiveMergeEditorOptions;
	onOptionsChange: (patch: MergeEditorOptionPatch) => void;
	onResetToOriginal: () => void;
}): ReactElement {
	const algorithms: readonly LineDiffAlgorithm[] = ["words_with_space", "words", "characters"];
	return (
		<RadixDropdownMenu.Root>
			<RadixDropdownMenu.Trigger asChild>
				<button
					type="button"
					className="cy-merge-options-button"
					aria-label="Merge editor options"
					title="Merge editor options"
				>
					<span />
					<span />
					<span />
				</button>
			</RadixDropdownMenu.Trigger>
			<RadixDropdownMenu.Portal>
				<RadixDropdownMenu.Content className="cy-merge-options-menu" align="end" sideOffset={6}>
					<RadixDropdownMenu.CheckboxItem
						className="cy-merge-options-row"
						checked={values.ignoreWhitespace}
						onCheckedChange={(checked) => onOptionsChange({ ignoreWhitespace: checked === true })}
					>
						<span className="cy-merge-options-check" aria-hidden="true" />
						<span>Ignore whitespace</span>
					</RadixDropdownMenu.CheckboxItem>
					<RadixDropdownMenu.CheckboxItem
						className="cy-merge-options-row"
						checked={values.ignoreCase}
						onCheckedChange={(checked) => onOptionsChange({ ignoreCase: checked === true })}
					>
						<span className="cy-merge-options-check" aria-hidden="true" />
						<span>Ignore case</span>
					</RadixDropdownMenu.CheckboxItem>
					<RadixDropdownMenu.CheckboxItem
						className="cy-merge-options-row"
						checked={values.syncHorizontalScroll}
						onCheckedChange={(checked) => onOptionsChange({ syncHorizontalScroll: checked === true })}
					>
						<span className="cy-merge-options-check" aria-hidden="true" />
						<span>Synchronized horizontal scroll</span>
					</RadixDropdownMenu.CheckboxItem>
					<RadixDropdownMenu.CheckboxItem
						className="cy-merge-options-row"
						checked={values.editableSideControls}
						onCheckedChange={(checked) => onOptionsChange({ editableSideControls: checked === true })}
					>
						<span className="cy-merge-options-check" aria-hidden="true" />
						<span>Actions in gutters</span>
					</RadixDropdownMenu.CheckboxItem>
					<RadixDropdownMenu.Separator className="cy-merge-options-separator" />
					<RadixDropdownMenu.Label className="cy-merge-options-label">Line diff</RadixDropdownMenu.Label>
					<RadixDropdownMenu.RadioGroup
						value={values.lineDiffAlgorithm}
						onValueChange={(value) => onOptionsChange({ lineDiffAlgorithm: value as LineDiffAlgorithm })}
					>
						{algorithms.map((algorithm) => (
							<RadixDropdownMenu.RadioItem key={algorithm} value={algorithm} className="cy-merge-options-row">
								<span className="cy-merge-options-radio" aria-hidden="true" />
								<span>{lineDiffAlgorithmLabel(algorithm)}</span>
							</RadixDropdownMenu.RadioItem>
						))}
					</RadixDropdownMenu.RadioGroup>
					<RadixDropdownMenu.Separator className="cy-merge-options-separator" />
					<RadixDropdownMenu.Item className="cy-merge-options-reset" onSelect={onResetToOriginal}>
						Reset to original
					</RadixDropdownMenu.Item>
				</RadixDropdownMenu.Content>
			</RadixDropdownMenu.Portal>
		</RadixDropdownMenu.Root>
	);
}

function MergeFooter({ model, sides }: { model: MergeModel; sides: MergeSide[] }): ReactElement {
	const words = sides.map((side) => countWords(model[side])).join("/");
	const chars = sides.map((side) => model[side].length).join("/");
	const added = model.blocks.filter((block) => block.kind === "added").length;
	const removed = model.blocks.filter((block) => block.kind === "removed").length;
	const modified = model.blocks.filter((block) => block.kind === "modified").length;
	const conflicts = model.blocks.filter((block) => block.kind === "conflict" && !block.resolved).length;
	const resolved = model.blocks.filter((block) => block.kind === "conflict" && block.resolved).length;
	const counters = [
		{ kind: "added", count: added, label: pluralize(added, "added", "added") },
		{ kind: "removed", count: removed, label: pluralize(removed, "removed", "removed") },
		{ kind: "modified", count: modified, label: pluralize(modified, "modified", "modified") },
		{ kind: "conflict", count: conflicts, label: pluralize(conflicts, "conflict") },
		{ kind: "resolved", count: resolved, label: pluralize(resolved, "resolved", "resolved") },
	];
	return (
		<footer className="cy-merge-footer">
			<div className="cy-merge-footer-stats">
				<span>Words: {words}</span>
				<span>Chars: {chars}</span>
			</div>
			<div className="cy-merge-footer-legend">
				{counters.some((counter) => counter.count > 0) ? (
					counters
						.filter((counter) => counter.count > 0)
						.map((counter) => (
							<span key={counter.kind} className={`cy-merge-footer-counter cy-merge-footer-counter-${counter.kind}`}>
								<span aria-hidden="true" />
								{counter.label}
							</span>
						))
				) : (
					<span className="cy-merge-footer-empty">No changes</span>
				)}
			</div>
		</footer>
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
	language,
	readOnly = false,
	className,
	editableSideControls: editableSideControlsProp = DEFAULT_REACT_MERGE_OPTIONS.editableSideControls,
	editableSides,
	syncHorizontalScroll: syncHorizontalScrollProp = DEFAULT_REACT_MERGE_OPTIONS.syncHorizontalScroll,
	onLeftChange,
	onBaseChange,
	onRightChange,
	onResolvedChange,
	onOptionsChange,
	...options
}: ThreePaneMergeEditorProps): ReactElement {
	const editorRef = useRef<HTMLDivElement>(null);
	const [localOptionOverrides, setLocalOptionOverrides] = useState<MergeEditorOptionPatch>({});
	const effectiveOptions = useMemo<EffectiveMergeEditorOptions>(
		() => ({
			ignoreWhitespace: (onOptionsChange ? options.ignoreWhitespace : localOptionOverrides.ignoreWhitespace ?? options.ignoreWhitespace) ?? DEFAULT_REACT_MERGE_OPTIONS.ignoreWhitespace,
			ignoreCase: (onOptionsChange ? options.ignoreCase : localOptionOverrides.ignoreCase ?? options.ignoreCase) ?? DEFAULT_REACT_MERGE_OPTIONS.ignoreCase,
			lineDiffAlgorithm: (onOptionsChange ? options.lineDiffAlgorithm : localOptionOverrides.lineDiffAlgorithm ?? options.lineDiffAlgorithm) ?? DEFAULT_REACT_MERGE_OPTIONS.lineDiffAlgorithm,
			syncHorizontalScroll: (onOptionsChange ? syncHorizontalScrollProp : localOptionOverrides.syncHorizontalScroll ?? syncHorizontalScrollProp) ?? DEFAULT_REACT_MERGE_OPTIONS.syncHorizontalScroll,
			editableSideControls: (onOptionsChange ? editableSideControlsProp : localOptionOverrides.editableSideControls ?? editableSideControlsProp) ?? DEFAULT_REACT_MERGE_OPTIONS.editableSideControls,
		}),
		[
			editableSideControlsProp,
			localOptionOverrides.editableSideControls,
			localOptionOverrides.ignoreCase,
			localOptionOverrides.ignoreWhitespace,
			localOptionOverrides.lineDiffAlgorithm,
			localOptionOverrides.syncHorizontalScroll,
			onOptionsChange,
			options.ignoreCase,
			options.ignoreWhitespace,
			options.lineDiffAlgorithm,
			syncHorizontalScrollProp,
		],
	);
	const normalizedOptions = useMemo(() => optionsFromProps(effectiveOptions), [effectiveOptions]);
	const syntaxLanguage = useMemo(() => normalizeLanguage(language, path), [language, path]);
	const [source, setSource] = useState(() => ({ left, base, right }));
	const [model, setModel] = useState(() => assembleThreeWayMerge(left, base, right, normalizedOptions));
	const [activeNavigationIndex, setActiveNavigationIndex] = useState(-1);
	const editableSideSet = useMemo(() => new Set<MergeSide>(readOnly ? [] : (editableSides ?? ["base"])), [editableSides, readOnly]);
	const renderModel = useMemo(() => createMergeRenderModel(model), [model]);
	const navigationTargets = useMemo((): NavigationTarget[] => {
		const conflicts = model.blocks
			.filter((block) => block.kind === "conflict" && !block.resolved)
			.map((block) => ({ blockId: block.id, label: "conflict" as const }));
		if (conflicts.length > 0) {
			return conflicts;
		}
		return model.blocks
			.filter((block) => block.kind !== "unchanged")
			.map((block) => ({ blockId: block.id, label: "change" as const }));
	}, [model.blocks]);
	const activeNavigationTarget = activeNavigationIndex >= 0 ? navigationTargets[activeNavigationIndex] : undefined;
	const connectorGeometry = useConnectorGeometry(editorRef, renderModel);
	usePaneScrollSync(editorRef, effectiveOptions.syncHorizontalScroll);
	useActiveNavigationHighlight(editorRef, activeNavigationTarget?.blockId);

	useEffect(() => {
		const nextModel = assembleThreeWayMerge(left, base, right, normalizedOptions);
		setSource({ left, base, right });
		setModel(nextModel);
		emitResolvedChange(nextModel, onResolvedChange);
	}, [base, left, normalizedOptions, onResolvedChange, right]);

	useEffect(() => {
		setActiveNavigationIndex((currentIndex) => {
			if (navigationTargets.length === 0) {
				return -1;
			}
			return currentIndex >= navigationTargets.length ? navigationTargets.length - 1 : currentIndex;
		});
	}, [navigationTargets.length]);

	function scrollToNavigationTarget(target: NavigationTarget): void {
		window.requestAnimationFrame(() => {
			const container = editorRef.current;
			if (!container) {
				return;
			}
			const element = container.querySelector<HTMLElement>(`.cy-merge-component[data-block-id="${target.blockId}"][data-placeholder="false"]`);
			element?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
		});
	}

	function navigateTo(index: number): void {
		if (navigationTargets.length === 0) {
			return;
		}
		const nextIndex = ((index % navigationTargets.length) + navigationTargets.length) % navigationTargets.length;
		setActiveNavigationIndex(nextIndex);
		scrollToNavigationTarget(navigationTargets[nextIndex]);
	}

	function navigatePrevious(): void {
		navigateTo(activeNavigationIndex <= 0 ? navigationTargets.length - 1 : activeNavigationIndex - 1);
	}

	function navigateNext(): void {
		navigateTo(activeNavigationIndex + 1);
	}

	function applyAction(blockId: string | undefined, side: MergeSide): void {
		const nextModel = applyMergeAction(model, blockId ? { type: "accept-side", side, blockId } : { type: "accept-all", side });
		const nextBase = serializeMergeCenter(nextModel);
		setSource((current) => ({ ...current, base: nextBase }));
		setModel(nextModel);
		onBaseChange?.(nextBase);
		emitResolvedChange(nextModel, onResolvedChange);
	}

	function applyEditorAction(nextModel: MergeModel): void {
		const nextBase = serializeMergeCenter(nextModel);
		setSource((current) => ({ ...current, base: nextBase }));
		setModel(nextModel);
		onBaseChange?.(nextBase);
		emitResolvedChange(nextModel, onResolvedChange);
	}

	function updateEditorOptions(patch: MergeEditorOptionPatch): void {
		if (onOptionsChange) {
			onOptionsChange(patch);
			return;
		}
		setLocalOptionOverrides((current) => ({ ...current, ...patch }));
	}

	function resetToOriginal(): void {
		const nextSource = { left, base, right };
		const nextModel = assembleThreeWayMerge(left, base, right, normalizedOptions);
		setSource(nextSource);
		setModel(nextModel);
		onLeftChange?.(left);
		onBaseChange?.(base);
		onRightChange?.(right);
		emitResolvedChange(nextModel, onResolvedChange);
	}

	function applyComponentAction(component: RenderComponent): void {
		if (!component.action) {
			return;
		}
		if (component.action.kind === "merge") {
			applyEditorAction(mergeRenderComponentIntoCenter(model, component));
		} else if (component.action.kind === "delete") {
			applyEditorAction(deleteMergedRenderComponentFromCenter(model, component));
		} else {
			applyEditorAction(applyMergeAction(model, { type: "mark-resolved", blockId: component.blockId, resolved: !component.resolved }));
		}
	}

	function editSide(side: MergeSide, content: string): void {
		const nextSource = { ...source, [side]: content };
		const nextModel =
			side === "base"
				? applyMergeAction(model, { type: "edit-center", content })
				: assembleThreeWayMerge(nextSource.left, nextSource.base, nextSource.right, normalizedOptions);
		setSource(nextSource);
		setModel(nextModel);
		if (side === "left") {
			onLeftChange?.(content);
		} else if (side === "base") {
			onBaseChange?.(content);
		} else {
			onRightChange?.(content);
		}
		emitResolvedChange(nextModel, onResolvedChange);
	}

	return (
		<div ref={editorRef} className={["cy-merge-editor", className].filter(Boolean).join(" ")} data-testid="cy-merge-editor" data-path={path}>
			<div className="cy-merge-toolbar">
				<div className="cy-merge-title">
					<span>{path ?? "Merge"}</span>
				</div>
				<div className="cy-merge-toolbar-actions">
					<MergeNavigation
						target={navigationTargets[0]}
						targetCount={navigationTargets.length}
						activeIndex={activeNavigationIndex}
						onPrevious={navigatePrevious}
						onNext={navigateNext}
					/>
					<MergeOptionsMenu values={effectiveOptions} onOptionsChange={updateEditorOptions} onResetToOriginal={resetToOriginal} />
				</div>
			</div>
			<div className="cy-merge-pane-labels cy-merge-pane-labels-three">
				<PaneLabel label={leftLabel} side="left" showAcceptAll={effectiveOptions.editableSideControls && !readOnly} onAcceptAll={() => applyAction(undefined, "left")} />
				<div aria-hidden="true" />
				<PaneLabel label={baseLabel} />
				<div aria-hidden="true" />
				<PaneLabel label={rightLabel} side="right" showAcceptAll={effectiveOptions.editableSideControls && !readOnly} onAcceptAll={() => applyAction(undefined, "right")} />
			</div>
			<div className="cy-merge-main cy-merge-main-three">
				<div className="cy-merge-views cy-merge-views-three">
					<RenderView
						side="left"
						components={renderModel.sides.left}
						label={leftLabel}
						language={syntaxLanguage}
						readOnly={readOnly}
						editable={editableSideSet.has("left")}
						value={source.left}
						lineNumbersSide="right"
						onChange={(content) => editSide("left", content)}
						onAction={applyComponentAction}
					/>
					<ConnectorLane name="left" geometry={connectorGeometry.left} />
					<RenderView
						side="base"
						components={renderModel.sides.base}
						label={baseLabel}
						language={syntaxLanguage}
						readOnly={readOnly}
						editable={editableSideSet.has("base")}
						value={source.base}
						onChange={(content) => editSide("base", content)}
						onAction={applyComponentAction}
					/>
					<ConnectorLane name="right" geometry={connectorGeometry.right} />
					<RenderView
						side="right"
						components={renderModel.sides.right}
						label={rightLabel}
						language={syntaxLanguage}
						readOnly={readOnly}
						editable={editableSideSet.has("right")}
						value={source.right}
						onChange={(content) => editSide("right", content)}
						onAction={applyComponentAction}
					/>
				</div>
			</div>
			<MergeFooter model={model} sides={["left", "base", "right"]} />
		</div>
	);
}

export function TwoPaneDiffEditor({
	left,
	right,
	leftLabel = "Left",
	rightLabel = "Right",
	path,
	language,
	readOnly = false,
	className,
	editableSideControls: editableSideControlsProp = DEFAULT_REACT_MERGE_OPTIONS.editableSideControls,
	syncHorizontalScroll: syncHorizontalScrollProp = DEFAULT_REACT_MERGE_OPTIONS.syncHorizontalScroll,
	onLeftChange,
	onRightChange,
	onOptionsChange,
	...options
}: TwoPaneDiffEditorProps): ReactElement {
	const editorRef = useRef<HTMLDivElement>(null);
	const [localOptionOverrides, setLocalOptionOverrides] = useState<MergeEditorOptionPatch>({});
	const effectiveOptions = useMemo<EffectiveMergeEditorOptions>(
		() => ({
			ignoreWhitespace: (onOptionsChange ? options.ignoreWhitespace : localOptionOverrides.ignoreWhitespace ?? options.ignoreWhitespace) ?? DEFAULT_REACT_MERGE_OPTIONS.ignoreWhitespace,
			ignoreCase: (onOptionsChange ? options.ignoreCase : localOptionOverrides.ignoreCase ?? options.ignoreCase) ?? DEFAULT_REACT_MERGE_OPTIONS.ignoreCase,
			lineDiffAlgorithm: (onOptionsChange ? options.lineDiffAlgorithm : localOptionOverrides.lineDiffAlgorithm ?? options.lineDiffAlgorithm) ?? DEFAULT_REACT_MERGE_OPTIONS.lineDiffAlgorithm,
			syncHorizontalScroll: (onOptionsChange ? syncHorizontalScrollProp : localOptionOverrides.syncHorizontalScroll ?? syncHorizontalScrollProp) ?? DEFAULT_REACT_MERGE_OPTIONS.syncHorizontalScroll,
			editableSideControls: (onOptionsChange ? editableSideControlsProp : localOptionOverrides.editableSideControls ?? editableSideControlsProp) ?? DEFAULT_REACT_MERGE_OPTIONS.editableSideControls,
		}),
		[
			editableSideControlsProp,
			localOptionOverrides.editableSideControls,
			localOptionOverrides.ignoreCase,
			localOptionOverrides.ignoreWhitespace,
			localOptionOverrides.lineDiffAlgorithm,
			localOptionOverrides.syncHorizontalScroll,
			onOptionsChange,
			options.ignoreCase,
			options.ignoreWhitespace,
			options.lineDiffAlgorithm,
			syncHorizontalScrollProp,
		],
	);
	const normalizedOptions = useMemo(() => optionsFromProps(effectiveOptions), [effectiveOptions]);
	const syntaxLanguage = useMemo(() => normalizeLanguage(language, path), [language, path]);
	const [source, setSource] = useState(() => ({ left, right }));
	const [model, setModel] = useState(() => assembleOneWayMerge(left, right, normalizedOptions));
	const [activeNavigationIndex, setActiveNavigationIndex] = useState(-1);
	const renderModel = useMemo(() => createMergeRenderModel(model, ["left", "right"]), [model]);
	const navigationTargets = useMemo(
		(): NavigationTarget[] => model.blocks.filter((block) => block.kind !== "unchanged").map((block) => ({ blockId: block.id, label: "change" as const })),
		[model.blocks],
	);
	const activeNavigationTarget = activeNavigationIndex >= 0 ? navigationTargets[activeNavigationIndex] : undefined;
	const connectorGeometry = useConnectorGeometry(editorRef, renderModel);
	usePaneScrollSync(editorRef, effectiveOptions.syncHorizontalScroll);
	useActiveNavigationHighlight(editorRef, activeNavigationTarget?.blockId);

	useEffect(() => {
		const nextModel = assembleOneWayMerge(left, right, normalizedOptions);
		setSource({ left, right });
		setModel(nextModel);
	}, [left, normalizedOptions, right]);

	useEffect(() => {
		setActiveNavigationIndex((currentIndex) => {
			if (navigationTargets.length === 0) {
				return -1;
			}
			return currentIndex >= navigationTargets.length ? navigationTargets.length - 1 : currentIndex;
		});
	}, [navigationTargets.length]);

	function scrollToNavigationTarget(target: NavigationTarget): void {
		window.requestAnimationFrame(() => {
			const container = editorRef.current;
			if (!container) {
				return;
			}
			const element = container.querySelector<HTMLElement>(`.cy-merge-component[data-block-id="${target.blockId}"][data-placeholder="false"]`);
			element?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
		});
	}

	function navigateTo(index: number): void {
		if (navigationTargets.length === 0) {
			return;
		}
		const nextIndex = ((index % navigationTargets.length) + navigationTargets.length) % navigationTargets.length;
		setActiveNavigationIndex(nextIndex);
		scrollToNavigationTarget(navigationTargets[nextIndex]);
	}

	function navigatePrevious(): void {
		navigateTo(activeNavigationIndex <= 0 ? navigationTargets.length - 1 : activeNavigationIndex - 1);
	}

	function navigateNext(): void {
		navigateTo(activeNavigationIndex + 1);
	}

	function updateTwoPaneSource(nextSource: { left: string; right: string }): void {
		const nextModel = assembleOneWayMerge(nextSource.left, nextSource.right, normalizedOptions);
		setSource(nextSource);
		setModel(nextModel);
	}

	function applyTwoPaneAction(component: RenderComponent): void {
		if (!component.action) {
			return;
		}
		const sourceLines = renderComponentLineTexts(component);
		if (component.side === "left") {
			const nextRight = modelSideContentWithReplacement(model, "right", { blockId: component.blockId, lines: sourceLines });
			updateTwoPaneSource({ left: source.left, right: nextRight });
			onRightChange?.(nextRight);
		} else if (component.side === "right") {
			const nextLeft = modelSideContentWithReplacement(model, "left", { blockId: component.blockId, lines: sourceLines });
			updateTwoPaneSource({ left: nextLeft, right: source.right });
			onLeftChange?.(nextLeft);
		}
	}

	function acceptAllTwoPane(side: "left" | "right"): void {
		if (side === "left") {
			const nextSource = { left: source.left, right: source.left };
			updateTwoPaneSource(nextSource);
			onRightChange?.(nextSource.right);
		} else {
			const nextSource = { left: source.right, right: source.right };
			updateTwoPaneSource(nextSource);
			onLeftChange?.(nextSource.left);
		}
	}

	function updateEditorOptions(patch: MergeEditorOptionPatch): void {
		if (onOptionsChange) {
			onOptionsChange(patch);
			return;
		}
		setLocalOptionOverrides((current) => ({ ...current, ...patch }));
	}

	function resetToOriginal(): void {
		const nextSource = { left, right };
		const nextModel = assembleOneWayMerge(left, right, normalizedOptions);
		setSource(nextSource);
		setModel(nextModel);
		onLeftChange?.(left);
		onRightChange?.(right);
	}

	return (
		<div ref={editorRef} className={["cy-merge-editor", "cy-merge-editor-two-pane", className].filter(Boolean).join(" ")} data-testid="cy-diff-editor" data-path={path}>
			<div className="cy-merge-toolbar">
				<div className="cy-merge-title">
					<span>{path ?? "Diff"}</span>
				</div>
				<div className="cy-merge-toolbar-actions">
					<MergeNavigation
						target={navigationTargets[0]}
						targetCount={navigationTargets.length}
						activeIndex={activeNavigationIndex}
						onPrevious={navigatePrevious}
						onNext={navigateNext}
					/>
					<MergeOptionsMenu values={effectiveOptions} onOptionsChange={updateEditorOptions} onResetToOriginal={resetToOriginal} />
				</div>
			</div>
			<div className="cy-merge-pane-labels cy-merge-pane-labels-two">
				<PaneLabel label={leftLabel} side="left" showAcceptAll={effectiveOptions.editableSideControls && !readOnly} onAcceptAll={() => acceptAllTwoPane("left")} />
				<div aria-hidden="true" />
				<PaneLabel label={rightLabel} side="right" showAcceptAll={effectiveOptions.editableSideControls && !readOnly} onAcceptAll={() => acceptAllTwoPane("right")} />
			</div>
			<div className="cy-merge-main cy-merge-main-two">
				<div className="cy-merge-views cy-merge-views-two">
					<RenderView
						side="left"
						components={renderModel.sides.left}
						label={leftLabel}
						language={syntaxLanguage}
						readOnly={readOnly}
						editable={false}
						value={source.left}
						onChange={() => undefined}
						onAction={applyTwoPaneAction}
					/>
					<ConnectorLane name="left" geometry={connectorGeometry.left} />
					<RenderView
						side="right"
						components={renderModel.sides.right}
						label={rightLabel}
						language={syntaxLanguage}
						readOnly={readOnly}
						editable={false}
						value={source.right}
						onChange={() => undefined}
						onAction={applyTwoPaneAction}
					/>
				</div>
			</div>
			<MergeFooter model={model} sides={["left", "right"]} />
		</div>
	);
}
