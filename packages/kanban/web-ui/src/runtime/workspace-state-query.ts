import { kanbanApi } from "@/runtime/kanban-api";
import { kanbanStore } from "@/runtime/kanban-store";
import { readTrpcConflictRevision } from "@/runtime/trpc-client";
import type { RuntimeWorkspaceStateResponse, RuntimeWorkspaceStateSaveRequest } from "@/runtime/types";

export class WorkspaceStateConflictError extends Error {
	readonly currentRevision: number;

	constructor(currentRevision: number, message = "Workspace state revision conflict.") {
		super(message);
		this.name = "WorkspaceStateConflictError";
		this.currentRevision = currentRevision;
	}
}

export async function fetchWorkspaceState(workspaceId: string): Promise<RuntimeWorkspaceStateResponse> {
	return await kanbanStore.dispatch(
		kanbanApi.endpoints.getWorkspaceState.initiate({ workspaceId }, { forceRefetch: true }),
	).unwrap();
}

export async function saveWorkspaceState(
	workspaceId: string,
	payload: RuntimeWorkspaceStateSaveRequest,
): Promise<RuntimeWorkspaceStateResponse> {
	try {
		return await kanbanStore.dispatch(
			kanbanApi.endpoints.saveWorkspaceState.initiate({ workspaceId, input: payload }),
		).unwrap();
	} catch (error) {
		const conflictRevision = readTrpcConflictRevision(error);
		if (typeof conflictRevision === "number") {
			throw new WorkspaceStateConflictError(
				conflictRevision,
				error instanceof Error ? error.message : "Workspace state revision conflict.",
			);
		}
		throw error;
	}
}
