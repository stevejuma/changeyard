export type PreviewPlacement = "before" | "after";

export interface PreviewableChange {
	changeId: string;
	parentChangeIds: string[];
}

export interface ReorderPreviewRequest {
	kind: "reorder_change";
	sourceChangeId: string;
	targetChangeId: string;
	placement: PreviewPlacement;
}

export interface CreateBookmarkPreviewRequest {
	kind: "create_bookmark";
	changeId: string;
	bookmarkName: string;
}

export interface EditMessagePreviewRequest {
	kind: "edit_message";
	changeId: string;
	message: string;
}

export interface CreateChangePreviewRequest {
	kind: "create_change";
	anchorChangeId: string;
	placement: PreviewPlacement;
	message: string;
}

export interface MoveBookmarkPreviewRequest {
	kind: "move_bookmark";
	bookmarkName: string;
	targetChangeId: string;
}

export interface SquashChangePreviewRequest {
	kind: "squash_change";
	sourceChangeId: string;
	targetChangeId: string;
	paths?: string[];
}

export interface AbsorbFilePreviewRequest {
	kind: "absorb_file";
	targetChangeId: string;
	paths: string[];
}

export interface RestoreFilePreviewRequest {
	kind: "restore_file";
	paths: string[];
}

export interface UndoLastPreviewRequest {
	kind: "undo_last";
}

export interface RedoLastPreviewRequest {
	kind: "redo_last";
}

export interface AbandonChangePreviewRequest {
	kind: "abandon_change";
	changeId: string;
}

export type PreviewRequest =
	| ReorderPreviewRequest
	| CreateBookmarkPreviewRequest
	| EditMessagePreviewRequest
	| CreateChangePreviewRequest
	| MoveBookmarkPreviewRequest
	| SquashChangePreviewRequest
	| AbsorbFilePreviewRequest
	| RestoreFilePreviewRequest
	| UndoLastPreviewRequest
	| RedoLastPreviewRequest
	| AbandonChangePreviewRequest;

export interface PreviewUiState {
	armedSourceId: string | null;
	dragSourceId: string | null;
	pendingRequest: PreviewRequest | null;
}

export type PreviewUiAction =
	| { type: "arm-source"; sourceChangeId: string }
	| { type: "clear-arm" }
	| { type: "start-drag"; sourceChangeId: string }
	| { type: "end-drag" }
	| { type: "preview"; request: PreviewRequest }
	| { type: "close-preview" };

export const initialPreviewUiState: PreviewUiState = {
	armedSourceId: null,
	dragSourceId: null,
	pendingRequest: null,
};

export function previewUiReducer(state: PreviewUiState, action: PreviewUiAction): PreviewUiState {
	switch (action.type) {
		case "arm-source":
			return {
				...state,
				armedSourceId: state.armedSourceId === action.sourceChangeId ? null : action.sourceChangeId,
			};
		case "clear-arm":
			return {
				...state,
				armedSourceId: null,
			};
		case "start-drag":
			return {
				...state,
				dragSourceId: action.sourceChangeId,
			};
		case "end-drag":
			return {
				...state,
				dragSourceId: null,
			};
		case "preview":
			return {
				...state,
				armedSourceId: null,
				dragSourceId: null,
				pendingRequest: action.request,
			};
		case "close-preview":
			return {
				...state,
				pendingRequest: null,
			};
		default:
			return state;
	}
}

export function createReorderPreviewRequest(
	sourceChangeId: string,
	targetChangeId: string,
	placement: PreviewPlacement,
): ReorderPreviewRequest {
	return {
		kind: "reorder_change",
		sourceChangeId,
		targetChangeId,
		placement,
	};
}

export function validateReorderPreviewRequest(
	changes: readonly PreviewableChange[],
	sourceChangeId: string,
	targetChangeId: string,
	placement: PreviewPlacement,
): { valid: boolean; reason: string | null } {
	if (sourceChangeId === targetChangeId) {
		return {
			valid: false,
			reason: "Choose a different target change.",
		};
	}

	const changesById = new Map(changes.map((change) => [change.changeId, change]));
	const source = changesById.get(sourceChangeId);
	const target = changesById.get(targetChangeId);
	if (!source || !target) {
		return {
			valid: false,
			reason: "The selected change is no longer available.",
		};
	}

	if (placement === "before" && target.parentChangeIds.length === 0) {
		return {
			valid: false,
			reason: "Cannot move a change before the root commit.",
		};
	}

	if (isDescendantChange(changesById, sourceChangeId, targetChangeId)) {
		return {
			valid: false,
			reason: "Cannot move a change onto one of its descendants.",
		};
	}

	return {
		valid: true,
		reason: null,
	};
}

function isDescendantChange(
	changesById: ReadonlyMap<string, PreviewableChange>,
	sourceChangeId: string,
	targetChangeId: string,
): boolean {
	let current = changesById.get(targetChangeId) ?? null;
	const seen = new Set<string>();
	while (current) {
		if (seen.has(current.changeId)) {
			return false;
		}
		seen.add(current.changeId);
		if (current.parentChangeIds.includes(sourceChangeId)) {
			return true;
		}
		const nextParentId = current.parentChangeIds[0] ?? null;
		current = nextParentId ? (changesById.get(nextParentId) ?? null) : null;
	}
	return false;
}
