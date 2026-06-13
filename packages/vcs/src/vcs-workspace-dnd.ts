import {
	validateVcsWorkspaceOperation,
	type VcsChangeSelection,
	type VcsHunkSelection,
	type VcsWorkspaceCapabilities,
	type VcsWorkspaceOperation,
} from "@/vcs-workspace-contracts";

export const VCS_WORKSPACE_DRAG_MIME = "application/vnd.changeyard.vcs-workspace-drag+json";

export type VcsWorkspaceDragPayload =
	| { kind: "stack"; stackId: string }
	| { kind: "commit"; commitId: string; stackId?: string | null }
	| { kind: "file"; source: "working_copy" | "commit"; path: string; commitId?: string | null }
	| { kind: "folder"; source: "working_copy" | "commit"; path: string; paths: string[]; commitId?: string | null }
	| { kind: "hunk"; source: "working_copy" | "commit"; hunk: VcsHunkSelection; commitId?: string | null };

export type VcsWorkspaceDropTarget =
	| { kind: "workspace" }
	| { kind: "stack"; stackId: string }
	| { kind: "commit"; commitId: string }
	| { kind: "working_copy" };

export type VcsWorkspaceDropOperation =
	| { valid: true; operation: VcsWorkspaceOperation }
	| { valid: false; reason: string };

export type VcsWorkspaceDropTargetFeedback =
	| { state: "valid"; operation: VcsWorkspaceOperation }
	| { state: "invalid"; reason: string };

export function serializeVcsWorkspaceDragPayload(payload: VcsWorkspaceDragPayload): string {
	return JSON.stringify(payload);
}

export function parseVcsWorkspaceDragPayload(value: string): VcsWorkspaceDragPayload | null {
	try {
		const payload = JSON.parse(value) as unknown;
		return isVcsWorkspaceDragPayload(payload) ? payload : null;
	} catch {
		return null;
	}
}

export function createVcsWorkspaceOperationFromDrop(
	payload: VcsWorkspaceDragPayload,
	target: VcsWorkspaceDropTarget,
): VcsWorkspaceDropOperation {
	if (payload.kind === "stack" && target.kind === "workspace") {
		return { valid: true, operation: { kind: "apply_stack", stackId: payload.stackId } };
	}
	if (target.kind === "workspace" && isChangePayload(payload)) {
		const selection = selectionFromChangePayload(payload);
		if (!selection) {
			return { valid: false, reason: "Choose a valid file or hunk selection." };
		}
		return {
			valid: true,
			operation: {
				kind: "create_stack",
				name: "workspace/selection",
				selection,
			},
		};
	}
	if (payload.kind === "commit" && target.kind === "stack") {
		return {
			valid: true,
			operation: {
				kind: "move_commit",
				commitId: payload.commitId,
				targetStackId: target.stackId,
			},
		};
	}
	if (target.kind === "commit" && isChangePayload(payload)) {
		const selection = selectionFromChangePayload(payload);
		if (!selection) {
			return { valid: false, reason: "Choose a valid file or hunk selection." };
		}
		return {
			valid: true,
			operation:
				selection.source === "working_copy"
					? { kind: "amend_commit", commitId: target.commitId, selection }
					: { kind: "move_changes", selection, targetCommitId: target.commitId },
		};
	}
	if (target.kind === "working_copy" && isChangePayload(payload)) {
		const selection = selectionFromChangePayload(payload);
		if (!selection || selection.source !== "commit") {
			return { valid: false, reason: "Only committed changes can be moved back to the working copy." };
		}
		return { valid: true, operation: { kind: "uncommit_changes", selection } };
	}
	return { valid: false, reason: "This drop target does not accept the dragged item." };
}

export function createValidatedVcsWorkspaceOperationFromDrop(
	payload: VcsWorkspaceDragPayload,
	target: VcsWorkspaceDropTarget,
	capabilities: VcsWorkspaceCapabilities,
): VcsWorkspaceDropOperation {
	const result = createVcsWorkspaceOperationFromDrop(payload, target);
	if (!result.valid) {
		return result;
	}
	const validation = validateVcsWorkspaceOperation(result.operation, capabilities);
	if (!validation.valid) {
		return { valid: false, reason: validation.reason };
	}
	return result;
}

export function describeVcsWorkspaceDropTarget(
	payload: VcsWorkspaceDragPayload,
	target: VcsWorkspaceDropTarget,
	capabilities: VcsWorkspaceCapabilities,
): VcsWorkspaceDropTargetFeedback {
	const result = createValidatedVcsWorkspaceOperationFromDrop(payload, target, capabilities);
	return result.valid ? { state: "valid", operation: result.operation } : { state: "invalid", reason: result.reason };
}

function isVcsWorkspaceDragPayload(value: unknown): value is VcsWorkspaceDragPayload {
	if (!isRecord(value) || typeof value.kind !== "string") {
		return false;
	}
	switch (value.kind) {
		case "stack":
			return typeof value.stackId === "string" && value.stackId.length > 0;
		case "commit":
			return typeof value.commitId === "string" && value.commitId.length > 0;
		case "file":
			return isChangeSource(value.source) && typeof value.path === "string" && value.path.length > 0;
		case "folder":
			return (
				isChangeSource(value.source) &&
				typeof value.path === "string" &&
				value.path.length > 0 &&
				Array.isArray(value.paths) &&
				value.paths.every((path) => typeof path === "string" && path.length > 0)
			);
		case "hunk":
			return isChangeSource(value.source) && isHunkSelection(value.hunk);
		default:
			return false;
	}
}

function isChangePayload(
	payload: VcsWorkspaceDragPayload,
): payload is Extract<VcsWorkspaceDragPayload, { kind: "file" | "folder" | "hunk" }> {
	return payload.kind === "file" || payload.kind === "folder" || payload.kind === "hunk";
}

function selectionFromChangePayload(
	payload: Extract<VcsWorkspaceDragPayload, { kind: "file" | "folder" | "hunk" }>,
): VcsChangeSelection | null {
	if (payload.source === "commit" && !payload.commitId) {
		return null;
	}
	const base = payload.source === "commit" ? { source: payload.source, commitId: payload.commitId ?? undefined } : { source: payload.source };
	if (payload.kind === "file") {
		return { ...base, paths: [payload.path] };
	}
	if (payload.kind === "folder") {
		return { ...base, paths: payload.paths };
	}
	return { ...base, hunks: [payload.hunk] };
}

function isHunkSelection(value: unknown): value is VcsHunkSelection {
	return (
		isRecord(value) &&
		typeof value.path === "string" &&
		value.path.length > 0 &&
		typeof value.hunkId === "string" &&
		value.hunkId.length > 0
	);
}

function isChangeSource(value: unknown): value is "working_copy" | "commit" {
	return value === "working_copy" || value === "commit";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
