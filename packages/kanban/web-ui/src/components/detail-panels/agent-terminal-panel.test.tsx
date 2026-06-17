import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AgentTerminalPanel } from "@/components/detail-panels/agent-terminal-panel";
import type { RuntimeTaskSessionSummary } from "@/runtime/types";

vi.mock("@/terminal/use-persistent-terminal-session", () => ({
	usePersistentTerminalSession: () => ({
		clearTerminal: vi.fn(),
		containerRef: { current: null },
		isStopping: false,
		lastError: null,
		stopTerminal: vi.fn(),
	}),
}));

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function createExternalSummary(overrides: Partial<RuntimeTaskSessionSummary> = {}): RuntimeTaskSessionSummary {
	return {
		taskId: "CY-0022",
		state: "running",
		mode: null,
		agentId: "codex",
		workspacePath: "/repo",
		pid: null,
		startedAt: 1,
		updatedAt: 2,
		lastOutputAt: null,
		reviewReason: null,
		exitCode: null,
		lastHookAt: null,
		latestHookActivity: null,
		externalSession: {
			provider: "codex",
			sessionId: "thread-123",
			transcriptPath: null,
			resumeCommand: ["codex", "resume", "thread-123"],
			source: "cli",
		},
		...overrides,
	};
}

function render(element: ReactElement): void {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	act(() => {
		root?.render(element);
	});
}

afterEach(() => {
	root?.unmount();
	root = null;
	container?.remove();
	container = null;
	document.body.innerHTML = "";
});

describe("AgentTerminalPanel", () => {
	it("renders a concise resume action for external sessions", () => {
		const onResumeExternalSession = vi.fn();

		render(
			<AgentTerminalPanel
				taskId="CY-0022"
				workspaceId="changeyard"
				summary={createExternalSummary()}
				onResumeExternalSession={onResumeExternalSession}
			/>,
		);

		expect(document.body.textContent).toContain("External Codex Session");
		expect(document.body.textContent).toContain("Session thread-123");
		expect(document.body.textContent).toContain("Resume");
		expect(document.body.textContent).not.toContain("Resume in UI");

		const button = Array.from(document.body.querySelectorAll("button")).find((candidate) =>
			candidate.textContent?.includes("Resume"),
		);
		expect(button).toBeInstanceOf(HTMLButtonElement);
		act(() => {
			button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(onResumeExternalSession).toHaveBeenCalledWith("thread-123");
	});
});
