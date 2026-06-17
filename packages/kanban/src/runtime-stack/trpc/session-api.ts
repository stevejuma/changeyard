import type {
	RuntimeExternalTaskSession,
	RuntimeSessionAttachRequest,
	RuntimeSessionAttachResponse,
} from "../core/api-contract.js";
import { parseSessionAttachRequest } from "../core/api-validation.js";
import { loadWorkspaceContext, loadWorkspaceContextById } from "../state/workspace-state.js";
import type { TerminalSessionManager } from "../terminal/session-manager.js";
import type { RuntimeTrpcContext } from "./app-router.js";

export interface CreateSessionApiDependencies {
	getWorkspacePathById: (workspaceId: string) => string | null;
	ensureTerminalManagerForWorkspace: (workspaceId: string, repoPath: string) => Promise<TerminalSessionManager>;
	broadcastRuntimeWorkspaceStateUpdated: (workspaceId: string, workspacePath: string) => Promise<void> | void;
}

function normalizeExternalSession(input: RuntimeSessionAttachRequest): RuntimeExternalTaskSession {
	const sessionId = input.sessionId ?? null;
	const resumeCommand =
		input.resumeCommand && input.resumeCommand.length > 0
			? input.resumeCommand
			: input.provider === "codex" && sessionId ? ["codex", "resume", sessionId] : [];
	return {
		provider: input.provider,
		sessionId,
		transcriptPath: input.transcriptPath ?? null,
		resumeCommand,
		source: input.source ?? null,
	};
}

export function createSessionApi(deps: CreateSessionApiDependencies): RuntimeTrpcContext["sessionApi"] {
	return {
		attach: async (input) => {
			try {
				const body = parseSessionAttachRequest(input);
				let workspaceId = body.workspaceId ?? null;
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
							: "Workspace path could not be resolved for session attach",
					} satisfies RuntimeSessionAttachResponse;
				}
				if (!workspaceId) {
					return {
						ok: false,
						error: "Workspace ID could not be resolved for session attach",
					} satisfies RuntimeSessionAttachResponse;
				}

				const manager = await deps.ensureTerminalManagerForWorkspace(workspaceId, workspacePath);
				const externalSession = normalizeExternalSession(body);
				const summary = manager.upsertExternalTaskSession({
					taskId: body.taskId,
					agentId: externalSession.provider === "codex" ? "codex" : null,
					workspacePath,
					externalSession,
					state: "running",
				});
				await deps.broadcastRuntimeWorkspaceStateUpdated(workspaceId, workspacePath);
				return {
					ok: true,
					summary,
					workspaceId,
					workspacePath,
				} satisfies RuntimeSessionAttachResponse;
			} catch (error) {
				return {
					ok: false,
					error: error instanceof Error ? error.message : String(error),
				} satisfies RuntimeSessionAttachResponse;
			}
		},
	};
}
