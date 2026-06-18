// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import type { RuntimeTaskSessionSummary } from "../../../src/runtime-stack/core/api-contract.js";
import { buildChangeyardCodingAgentPrompt } from "../../../src/runtime-stack/prompts/changeyard-workflow-prompt.js";
import { renderAppendSystemPrompt } from "../../../src/runtime-stack/prompts/append-system-prompt.js";
import { TerminalSessionManager } from "../../../src/runtime-stack/terminal/session-manager.js";
import type { UpsertExternalTaskSessionRequest } from "../../../src/runtime-stack/terminal/session-manager.js";
import { createSessionApi } from "../../../src/runtime-stack/trpc/session-api.js";

function summaryFromRequest(request: UpsertExternalTaskSessionRequest): RuntimeTaskSessionSummary {
	return {
		taskId: request.taskId,
		state: request.state ?? "running",
		agentId: request.agentId,
		workspacePath: request.workspacePath,
		pid: null,
		startedAt: 1,
		updatedAt: 1,
		lastOutputAt: 1,
		reviewReason: null,
		exitCode: null,
		lastHookAt: null,
		latestHookActivity: null,
		warningMessage: null,
		latestTurnCheckpoint: null,
		previousTurnCheckpoint: null,
		externalSession: request.externalSession,
	};
}

describe("session api", () => {
	it("attaches a Codex external session directly with a default resume command", async () => {
		const upsertExternalTaskSession = vi.fn((request: UpsertExternalTaskSessionRequest) => summaryFromRequest(request));
		const broadcastRuntimeWorkspaceStateUpdated = vi.fn();
		const api = createSessionApi({
			getWorkspacePathById: (workspaceId) => workspaceId === "workspace-1" ? "/repo" : null,
			ensureTerminalManagerForWorkspace: async () => ({
				upsertExternalTaskSession,
			}) as unknown as TerminalSessionManager,
			broadcastRuntimeWorkspaceStateUpdated,
		});

		const response = await api.attach({
			taskId: "task-1",
			provider: "codex",
			sessionId: "session-1",
			workspaceId: "workspace-1",
			source: "cli",
		});

		expect(response.ok).toBe(true);
		expect(response.summary?.externalSession).toEqual({
			provider: "codex",
			sessionId: "session-1",
			transcriptPath: null,
			resumeCommand: ["codex", "resume", "session-1"],
			source: "cli",
		});
		expect(upsertExternalTaskSession).toHaveBeenCalledWith(
			expect.objectContaining({
				taskId: "task-1",
				agentId: "codex",
				workspacePath: "/repo",
				state: "running",
			}),
		);
		expect(broadcastRuntimeWorkspaceStateUpdated).toHaveBeenCalledWith("workspace-1", "/repo");
	});

	it("allows provider metadata without a session id", async () => {
		const upsertExternalTaskSession = vi.fn((request: UpsertExternalTaskSessionRequest) => summaryFromRequest(request));
		const api = createSessionApi({
			getWorkspacePathById: () => "/repo",
			ensureTerminalManagerForWorkspace: async () => ({
				upsertExternalTaskSession,
			}) as unknown as TerminalSessionManager,
			broadcastRuntimeWorkspaceStateUpdated: vi.fn(),
		});

		const response = await api.attach({
			taskId: "task-1",
			provider: "other-agent",
			workspaceId: "workspace-1",
			source: "cli",
		});

		expect(response.ok).toBe(true);
		expect(response.summary?.agentId).toBeNull();
		expect(response.summary?.externalSession).toEqual({
			provider: "other-agent",
			sessionId: null,
			transcriptPath: null,
			resumeCommand: [],
			source: "cli",
		});
	});
});

describe("external task session upsert", () => {
	it("merges missing external session fields with the existing summary", () => {
		const manager = new TerminalSessionManager();
		manager.upsertExternalTaskSession({
			taskId: "task-1",
			agentId: "codex",
			workspacePath: "/repo",
			state: "running",
			externalSession: {
				provider: "codex",
				sessionId: "session-1",
				transcriptPath: null,
				resumeCommand: ["codex", "resume", "session-1"],
				source: "cli",
			},
		});

		const summary = manager.upsertExternalTaskSession({
			taskId: "task-1",
			agentId: "codex",
			workspacePath: "/repo",
			state: "running",
			externalSession: {
				provider: "codex",
				sessionId: null,
				transcriptPath: null,
				resumeCommand: [],
				source: null,
			},
		});

		expect(summary.externalSession).toEqual({
			provider: "codex",
			sessionId: "session-1",
			transcriptPath: null,
			resumeCommand: ["codex", "resume", "session-1"],
			source: "cli",
		});
	});
});

describe("agent prompt session registration", () => {
	it("renders Changeyard sidebar guidance instead of generic task workflow guidance", () => {
		const prompt = renderAppendSystemPrompt("cy", {
			agentId: "codex",
			projectRoot: "/repo",
			vcsEngine: "jj",
		});

		expect(prompt).toContain("# Changeyard Sidebar");
		expect(prompt).toContain("Canonical change state lives in `.changeyard/changes/*.md`.");
		expect(prompt).toContain("Project root: /repo");
		expect(prompt).toContain("Detected VCS: jj.");
		expect(prompt).toContain("Do not create JJ workspaces or bookmarks directly.");
		expect(prompt).toContain('cy create --template agent-task --planning openspec-lite --strict --title "<title>"');
		expect(prompt).toContain("cy audit <id>");
		expect(prompt).not.toContain("task create");
		expect(prompt).not.toContain("task start");
		expect(prompt).not.toContain("Kanban task worktree");
	});

	it("renders Changeyard coding-agent bootstrap guidance", () => {
		const prompt = buildChangeyardCodingAgentPrompt("Add parser validation", {
			commandPrefix: "cy",
			projectRoot: "/repo",
			vcsEngine: "git",
		});

		expect(prompt).toContain("The prompt that follows is a request for a Changeyard change.");
		expect(prompt).toContain("Start in the project root: /repo");
		expect(prompt).toContain("Detected VCS: git.");
		expect(prompt).toContain("Do not create git worktrees or branches directly");
		expect(prompt).toContain('cy create --template agent-task --planning openspec-lite --strict --title "<title>"');
		expect(prompt).toContain("cy validate <id>");
		expect(prompt).toContain("cy start <id>");
		expect(prompt).toContain("cy verify <id>");
		expect(prompt).toContain("cy complete <id> --no-pr");
		expect(prompt).toContain("User request:\nAdd parser validation");
	});
});
