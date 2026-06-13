import type {
	AbandonChangePreviewRequest,
	AbsorbFilePreviewRequest,
	CreateBookmarkPreviewRequest,
	CreateChangePreviewRequest,
	EditMessagePreviewRequest,
	MoveBookmarkPreviewRequest,
	PreviewPlacement,
	RedoLastPreviewRequest,
	RestoreFilePreviewRequest,
	SquashChangePreviewRequest,
	UndoLastPreviewRequest,
} from "@/preview-state";
import type { VcsOperationRequest } from "@/runtime/types";

export function createBookmarkPreviewRequest(changeId: string, bookmarkName: string): CreateBookmarkPreviewRequest {
	return { kind: "create_bookmark", changeId, bookmarkName };
}

export function createEditMessagePreviewRequest(changeId: string, message: string): EditMessagePreviewRequest {
	return { kind: "edit_message", changeId, message };
}

export function createChangePreviewRequest(
	anchorChangeId: string,
	placement: PreviewPlacement,
	message: string,
): CreateChangePreviewRequest {
	return { kind: "create_change", anchorChangeId, placement, message };
}

export function createMoveBookmarkPreviewRequest(bookmarkName: string, targetChangeId: string): MoveBookmarkPreviewRequest {
	return { kind: "move_bookmark", bookmarkName, targetChangeId };
}

export function createAbandonChangePreviewRequest(changeId: string): AbandonChangePreviewRequest {
	return { kind: "abandon_change", changeId };
}

export function createSquashChangePreviewRequest(
	sourceChangeId: string,
	targetChangeId: string,
	paths?: string[],
): SquashChangePreviewRequest {
	return paths && paths.length > 0
		? { kind: "squash_change", sourceChangeId, targetChangeId, paths }
		: { kind: "squash_change", sourceChangeId, targetChangeId };
}

export function createAbsorbFilePreviewRequest(targetChangeId: string, paths: string[]): AbsorbFilePreviewRequest {
	return { kind: "absorb_file", targetChangeId, paths };
}

export function createRestoreFilePreviewRequest(paths: string[]): RestoreFilePreviewRequest {
	return { kind: "restore_file", paths };
}

export function createUndoLastPreviewRequest(): UndoLastPreviewRequest {
	return { kind: "undo_last" };
}

export function createRedoLastPreviewRequest(): RedoLastPreviewRequest {
	return { kind: "redo_last" };
}

export function summarizeOperationRequest(request: VcsOperationRequest): string {
	switch (request.kind) {
		case "reorder_change":
			return `${request.sourceChangeId} ${request.placement} ${request.targetChangeId}`;
		case "create_bookmark":
			return `${request.bookmarkName} -> ${request.changeId}`;
		case "edit_message":
			return `${request.changeId} message update`;
		case "create_change":
			return `new change ${request.placement} ${request.anchorChangeId}`;
		case "move_bookmark":
			return `${request.bookmarkName} -> ${request.targetChangeId}`;
		case "squash_change":
			return request.paths && request.paths.length > 0
				? `move ${request.paths.join(", ")} ${request.sourceChangeId} -> ${request.targetChangeId}`
				: `squash ${request.sourceChangeId} -> ${request.targetChangeId}`;
		case "absorb_file":
			return `absorb ${request.paths.join(", ")} -> ${request.targetChangeId}`;
		case "restore_file":
			return `restore ${request.paths.join(", ")}`;
		case "undo_last":
			return "undo last JJ operation";
		case "redo_last":
			return "redo last JJ operation";
		case "abandon_change":
			return `abandon ${request.changeId}`;
	}
}

export function commandPreview(commands: Array<{ command: string; args: string[] }>): string {
	return commands.length > 0
		? commands.map((command) => [command.command, ...command.args].join(" ")).join("\n")
		: "No commands available.";
}
