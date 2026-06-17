import { lazy, Suspense, useEffect, useRef, useState, type ReactElement } from "react";
import {
	AtSign,
	Bold,
	CheckSquare,
	Code2,
	Heading,
	Image,
	Italic,
	Link,
	List,
	ListOrdered,
	Paperclip,
	Quote,
	Reply,
	SquarePen,
	Users,
	type LucideIcon,
} from "lucide-react";

import { cn } from "@/components/ui/cn";
import { useTheme } from "@/hooks/use-theme";

const MarkdownPreview = lazy(() => import("@uiw/react-markdown-preview"));

export type MarkdownMessageEditorMode = "source" | "preview";

const LIGHT_THEME_IDS = new Set(["light", "overcast", "solarized-light", "latte", "high-contrast-light"]);

type MarkdownToolItem = {
	label: string;
	icon: LucideIcon;
	insert: string;
	suffix?: string;
	wrapSelection?: boolean;
};

const MARKDOWN_TOOL_GROUPS: ReadonlyArray<ReadonlyArray<MarkdownToolItem>> = [
	[
		{ label: "Mention collaborator", icon: Users, insert: "@", wrapSelection: false },
	],
	[
		{ label: "Heading", icon: Heading, insert: "## ", wrapSelection: false },
		{ label: "Bold", icon: Bold, insert: "**", suffix: "**" },
		{ label: "Italic", icon: Italic, insert: "_", suffix: "_" },
		{ label: "Quote", icon: Quote, insert: "> ", wrapSelection: false },
		{ label: "Code", icon: Code2, insert: "`", suffix: "`" },
		{ label: "Link", icon: Link, insert: "[", suffix: "](url)" },
	],
	[
		{ label: "Numbered list", icon: ListOrdered, insert: "1. ", wrapSelection: false },
		{ label: "Bulleted list", icon: List, insert: "- ", wrapSelection: false },
		{ label: "Task list", icon: CheckSquare, insert: "- [ ] ", wrapSelection: false },
	],
	[
		{ label: "Attach file", icon: Paperclip, insert: "" },
		{ label: "Mention", icon: AtSign, insert: "@" },
		{ label: "Reference", icon: Image, insert: "![", suffix: "](url)" },
		{ label: "Undo", icon: Reply, insert: "" },
		{ label: "Open markdown help", icon: SquarePen, insert: "" },
	],
] as const;

function useMarkdownColorMode(): "dark" | "light" {
	const { themeId } = useTheme();
	return LIGHT_THEME_IDS.has(themeId) ? "light" : "dark";
}

export function MarkdownMessagePreview({
	value,
	className,
	wrapText = true,
	emptyLabel = "_No commit description._",
	height,
}: {
	value: string;
	className?: string;
	wrapText?: boolean;
	emptyLabel?: string;
	height?: string;
}): ReactElement {
	const colorMode = useMarkdownColorMode();
	return (
		<div
			data-color-mode={colorMode}
			className={cn("cy-markdown-preview overflow-auto", wrapText ? "whitespace-normal" : "whitespace-pre", className)}
			style={height ? { height } : undefined}
		>
			<Suspense fallback={<div className="kb-skeleton h-16 rounded" />}>
				<MarkdownPreview source={value.trim() || emptyLabel} />
			</Suspense>
		</div>
	);
}

export function MarkdownMessageEditor({
	value,
	onChange,
	className,
	height = "220px",
	mode,
	onModeChange,
	wrapText = true,
	placeholder,
	disabled = false,
	autoFocus = false,
	onEscape,
}: {
	value: string;
	onChange: (value: string) => void;
	className?: string;
	height?: string;
	mode?: MarkdownMessageEditorMode;
	onModeChange?: (mode: MarkdownMessageEditorMode) => void;
	wrapText?: boolean;
	placeholder?: string;
	disabled?: boolean;
	autoFocus?: boolean;
	onEscape?: () => void;
}): ReactElement {
	const [internalMode, setInternalMode] = useState<MarkdownMessageEditorMode>(mode ?? "source");
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);
	const activeMode = mode ?? internalMode;
	const colorMode = useMarkdownColorMode();

	useEffect(() => {
		if (mode) {
			setInternalMode(mode);
		}
	}, [mode]);

	useEffect(() => {
		if (autoFocus && activeMode === "source") {
			textareaRef.current?.focus();
		}
	}, [activeMode, autoFocus]);

	function changeMode(nextMode: MarkdownMessageEditorMode): void {
		setInternalMode(nextMode);
		onModeChange?.(nextMode);
	}

	function insertMarkdown(insert: string, suffix = "", wrapSelection = true): void {
		if (disabled || (!insert && !suffix)) {
			return;
		}
		const textarea = textareaRef.current;
		const start = textarea?.selectionStart ?? value.length;
		const end = textarea?.selectionEnd ?? value.length;
		const selectedText = value.slice(start, end);
		const replacement = wrapSelection ? `${insert}${selectedText}${suffix}` : `${insert}${selectedText}`;
		const nextValue = `${value.slice(0, start)}${replacement}${value.slice(end)}`;
		onChange(nextValue);
		requestAnimationFrame(() => {
			textarea?.focus();
			const cursor = start + insert.length + selectedText.length;
			textarea?.setSelectionRange(cursor, cursor);
		});
	}

	return (
		<div
			data-color-mode={colorMode}
			className={cn(
				"cy-markdown-editor min-h-0 overflow-hidden rounded-lg border border-border bg-surface-0 shadow-sm",
				className,
			)}
		>
			<div className="flex min-h-12 items-stretch border-b border-divider bg-surface-1">
				<div className="flex shrink-0 items-stretch">
					<button
						type="button"
						className={cn(
							"border-r border-divider px-5 text-sm font-medium transition-colors hover:text-text-primary",
							activeMode === "source"
								? "border-b-2 border-b-surface-0 bg-surface-0 text-text-primary"
								: "text-text-secondary",
						)}
						onClick={() => changeMode("source")}
						disabled={disabled}
					>
						Write
					</button>
					<button
						type="button"
						className={cn(
							"border-r border-divider px-5 text-sm font-medium transition-colors hover:text-text-primary",
							activeMode === "preview"
								? "border-b-2 border-b-surface-0 bg-surface-0 text-text-primary"
								: "text-text-secondary",
						)}
						onClick={() => changeMode("preview")}
						disabled={disabled}
					>
						Preview
					</button>
				</div>
				{activeMode === "source" ? (
					<div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-3">
						{MARKDOWN_TOOL_GROUPS.map((group, groupIndex) => (
							<div key={groupIndex} className="flex items-center gap-1 border-l border-divider pl-2 first:border-l-0 first:pl-0">
								{group.map((item) => {
									const Icon = item.icon;
									return (
										<button
											key={item.label}
											type="button"
											className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-3 hover:text-text-primary focus-visible:outline-2 focus-visible:outline-accent"
											title={item.label}
											aria-label={item.label}
											onClick={() => insertMarkdown(item.insert, item.suffix ?? "", item.wrapSelection ?? true)}
											disabled={disabled}
										>
											<Icon size={17} />
										</button>
									);
								})}
							</div>
						))}
					</div>
				) : (
					<div className="min-w-0 flex-1" />
				)}
				<span className="flex shrink-0 items-center px-3 text-[11px] text-text-tertiary">{value.length}</span>
			</div>
			{activeMode === "source" ? (
				<textarea
					ref={textareaRef}
					className={cn(
						"block w-full resize-y border-0 bg-surface-0 px-4 py-3 text-sm leading-relaxed text-text-primary outline-none focus:ring-2 focus:ring-inset focus:ring-accent disabled:opacity-60",
						wrapText ? "whitespace-pre-wrap" : "whitespace-pre",
					)}
					style={{ height }}
					value={value}
					placeholder={placeholder}
					wrap={wrapText ? "soft" : "off"}
					disabled={disabled}
					onChange={(event) => onChange(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Escape" && onEscape) {
							event.preventDefault();
							event.stopPropagation();
							onEscape();
						}
					}}
				/>
			) : (
				<MarkdownMessagePreview
					value={value}
					wrapText={wrapText}
					emptyLabel="_No commit message._"
					height={height}
					className="px-3 py-2"
				/>
			)}
		</div>
	);
}
