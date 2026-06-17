import MarkdownEditor from "@uiw/react-markdown-editor";
import type { ReactElement } from "react";

import { cn } from "@/components/ui/cn";
import "@uiw/react-markdown-editor/markdown-editor.css";
import "@uiw/react-markdown-preview/markdown.css";

export function MarkdownDocumentEditor({
	value,
	onChange,
	disabled = false,
	height = "100%",
	className,
}: {
	value: string;
	onChange: (value: string) => void;
	disabled?: boolean;
	height?: string;
	className?: string;
}): ReactElement {
	return (
		<div data-color-mode="dark" className={cn("cy-markdown-editor min-h-0", className)}>
			<MarkdownEditor
				value={value}
				height={height}
				visible
				visibleEditor
				enablePreview
				showToolbar={!disabled}
				editable={!disabled}
				readOnly={disabled}
				onChange={(nextValue) => onChange(nextValue ?? "")}
			/>
		</div>
	);
}

export function MarkdownDocumentPreview({
	source,
	className,
	emptyLabel = "No markdown content.",
}: {
	source: string;
	className?: string;
	emptyLabel?: string;
}): ReactElement {
	if (!source.trim()) {
		return <p className={cn("text-sm text-text-secondary", className)}>{emptyLabel}</p>;
	}
	return (
		<div data-color-mode="dark" className={cn("cy-markdown-preview", className)}>
			<MarkdownEditor.Markdown source={source} />
		</div>
	);
}
