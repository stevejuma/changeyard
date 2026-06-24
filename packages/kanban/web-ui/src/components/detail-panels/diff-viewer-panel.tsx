import {
	DiffViewerPanel as SharedDiffViewerPanel,
	type DiffLineComment,
	type DiffLineScrollTarget,
	type DiffViewMode,
	type ReviewDiffFileChange,
} from "@changeyard/web-ui";
import type { ReactElement } from "react";

import type { RuntimeWorkspaceFileChange } from "@/runtime/types";

export type { DiffLineComment, DiffLineScrollTarget, DiffViewMode };

export function DiffViewerPanel({
	workspaceFiles,
	selectedPath,
	onSelectedPathChange,
	onAddToTerminal,
	onSendToTerminal,
	comments,
	onCommentsChange,
	onInsertRequiredChange,
	scrollTarget,
	viewMode = "unified",
}: {
	workspaceFiles: RuntimeWorkspaceFileChange[] | null;
	selectedPath: string | null;
	onSelectedPathChange: (path: string) => void;
	onAddToTerminal?: (formatted: string) => void;
	onSendToTerminal?: (formatted: string) => void;
	comments: Map<string, DiffLineComment>;
	onCommentsChange: (comments: Map<string, DiffLineComment>) => void;
	onInsertRequiredChange?: (comment: DiffLineComment) => void;
	scrollTarget?: DiffLineScrollTarget | null;
	viewMode?: DiffViewMode;
}): ReactElement {
	return (
		<SharedDiffViewerPanel
			workspaceFiles={workspaceFiles as ReviewDiffFileChange[] | null}
			selectedPath={selectedPath}
			onSelectedPathChange={onSelectedPathChange}
			onAddToTerminal={onAddToTerminal}
			onSendToTerminal={onSendToTerminal}
			comments={comments}
			onCommentsChange={onCommentsChange}
			onInsertRequiredChange={onInsertRequiredChange}
			scrollTarget={scrollTarget}
			viewMode={viewMode}
		/>
	);
}
