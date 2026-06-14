import type {
	RuntimeExternalTaskSession,
	RuntimeHookEvent,
	RuntimeHookIngestRequest,
	RuntimeHookIngestResponse,
	RuntimeTaskSessionSummary,
	RuntimeTaskTurnCheckpoint,
} from "../core/api-contract.js";
import { parseHookIngestRequest } from "../core/api-validation.js";
import { loadWorkspaceContext, loadWorkspaceContextById } from "../state/workspace-state.js";
import type { TerminalSessionManager } from "../terminal/session-manager.js";
import { captureTaskTurnCheckpoint, deleteTaskTurnCheckpointRef } from "../workspace/turn-checkpoints.js";
import type { RuntimeTrpcContext } from "./app-router.js";

export interface CreateHooksApiDependencies {
	getWorkspacePathById: (workspaceId: string) => string | null;
	ensureTerminalManagerForWorkspace: (workspaceId: string, repoPath: string) => Promise<TerminalSessionManager>;
	broadcastRuntimeWorkspaceStateUpdated: (workspaceId: string, workspacePath: string) => Promise<void> | void;
	broadcastTaskReadyForReview: (workspaceId: string, taskId: string) => void;
	captureTaskTurnCheckpoint?: (input: {
		cwd: string;
		taskId: string;
		turn: number;
	}) => Promise<RuntimeTaskTurnCheckpoint>;
	deleteTaskTurnCheckpointRef?: (input: { cwd: string; ref: string }) => Promise<void>;
}

function canTransitionTaskForHookEvent(summary: RuntimeTaskSessionSummary, event: RuntimeHookEvent): boolean {
	if (event === "activity") {
		return false;
	}
	if (event === "to_review") {
		return summary.state === "running";
	}
	return (
		summary.state === "awaiting_review" &&
		(summary.reviewReason === "attention" || summary.reviewReason === "hook" || summary.reviewReason === "error")
	);
}

function normalizeExternalSession(
	externalSession: RuntimeHookIngestRequest["externalSession"],
): RuntimeExternalTaskSession | null {
	if (!externalSession?.provider) {
		return null;
	}
	const sessionId = externalSession.sessionId ?? null;
	const resumeCommand =
		externalSession.resumeCommand && externalSession.resumeCommand.length > 0
			? externalSession.resumeCommand
			: sessionId && externalSession.provider === "codex" ? ["codex", "resume", sessionId] : [];
	return {
		provider: externalSession.provider,
		sessionId,
		transcriptPath: externalSession.transcriptPath ?? null,
		resumeCommand,
		source: externalSession.source ?? null,
	};
}

export function createHooksApi(deps: CreateHooksApiDependencies): RuntimeTrpcContext["hooksApi"] {
	const checkpointCapture = deps.captureTaskTurnCheckpoint ?? captureTaskTurnCheckpoint;
	const checkpointRefDelete = deps.deleteTaskTurnCheckpointRef ?? deleteTaskTurnCheckpointRef;

	return {
		ingest: async (input) => {
			try {
					const body = parseHookIngestRequest(input);
					const taskId = body.taskId ?? "";
					let workspaceId = body.workspaceId ?? null;
					const event = body.event;
					const externalSession = normalizeExternalSession(body.externalSession);
					const knownWorkspacePath = workspaceId ? deps.getWorkspacePathById(workspaceId) : null;
					const workspaceContext = knownWorkspacePath
						? null
						: workspaceId
							? await loadWorkspaceContextById(workspaceId)
							: body.workspacePath
								? await loadWorkspaceContext(body.workspacePath, { autoCreateIfMissing: true })
								: null;
					if (!workspaceId && workspaceContext) {
						workspaceId = workspaceContext.workspaceId;
					}
					const workspacePath = knownWorkspacePath ?? workspaceContext?.repoPath ?? null;
					if (!workspacePath) {
						return {
							ok: false,
							error: workspaceId
								? `Workspace "${workspaceId}" not found`
								: "Workspace path could not be resolved for hook ingest",
						} satisfies RuntimeHookIngestResponse;
					}
					if (!workspaceId) {
						return {
							ok: false,
							error: "Workspace ID could not be resolved for hook ingest",
						} satisfies RuntimeHookIngestResponse;
					}
					const resolvedWorkspaceId = workspaceId;
					const resolvedWorkspacePath = workspacePath;

					const manager = await deps.ensureTerminalManagerForWorkspace(resolvedWorkspaceId, resolvedWorkspacePath);
					let summary = manager.getSummary(taskId);
					if (externalSession) {
						summary = manager.upsertExternalTaskSession({
							taskId,
							agentId: externalSession.provider === "codex" ? "codex" : null,
							workspacePath: resolvedWorkspacePath,
							externalSession,
							state: "running",
						});
					}
					if (!summary) {
						return {
							ok: false,
							error: `Task "${taskId}" not found in workspace "${resolvedWorkspaceId}"`,
					} satisfies RuntimeHookIngestResponse;
				}

				if (!canTransitionTaskForHookEvent(summary, event)) {
					if (body.metadata) {
						manager.applyHookActivity(taskId, body.metadata);
					}
					return {
						ok: true,
					} satisfies RuntimeHookIngestResponse;
				}

				const transitionedSummary =
					event === "to_review" ? manager.transitionToReview(taskId, "hook") : manager.transitionToRunning(taskId);
				if (!transitionedSummary) {
					return {
						ok: false,
						error: `Task "${taskId}" transition failed`,
					} satisfies RuntimeHookIngestResponse;
				}

				if (event === "to_review") {
					const nextTurn = (transitionedSummary.latestTurnCheckpoint?.turn ?? 0) + 1;
						const checkpointCwd = transitionedSummary.workspacePath ?? resolvedWorkspacePath;
					const staleRef = transitionedSummary.previousTurnCheckpoint?.ref ?? null;
					try {
						const checkpoint = await checkpointCapture({
							cwd: checkpointCwd,
							taskId,
							turn: nextTurn,
						});
						manager.applyTurnCheckpoint(taskId, checkpoint);
						if (staleRef) {
							void checkpointRefDelete({
								cwd: checkpointCwd,
								ref: staleRef,
							}).catch(() => {
								// Best effort cleanup only.
							});
						}
					} catch {
						// Best effort checkpointing only.
					}
				}

				if (body.metadata) {
					manager.applyHookActivity(taskId, body.metadata);
				}

					void deps.broadcastRuntimeWorkspaceStateUpdated(resolvedWorkspaceId, resolvedWorkspacePath);
					if (event === "to_review") {
						deps.broadcastTaskReadyForReview(resolvedWorkspaceId, taskId);
					}

				return { ok: true } satisfies RuntimeHookIngestResponse;
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return { ok: false, error: message } satisfies RuntimeHookIngestResponse;
			}
		},
	};
}
