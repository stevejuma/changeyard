import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { prepareAgentLaunch } from "../../../src/runtime-stack/terminal/agent-session-adapters.js";

describe("cursor agent session adapter", () => {
	let tempDir: string;

	afterEach(async () => {
		if (tempDir) {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("prepares autonomous launch args with workspace and hooks", async () => {
		tempDir = await mkdtemp(join(tmpdir(), "cursor-agent-launch-"));
		const launch = await prepareAgentLaunch({
			taskId: "task-1",
			agentId: "cursor",
			args: [],
			autonomousModeEnabled: true,
			cwd: tempDir,
			prompt: "implement feature",
			workspaceId: "workspace-1",
		});

		expect(launch.args).toEqual(
			expect.arrayContaining(["--force", "--approve-mcps", "--workspace", tempDir, "implement feature"]),
		);
		expect(launch.env.KANBAN_HOOK_TASK_ID).toBe("task-1");
		expect(launch.env.KANBAN_HOOK_WORKSPACE_ID).toBe("workspace-1");

		const hooksConfig = JSON.parse(await readFile(join(tempDir, ".cursor", "hooks.json"), "utf8")) as {
			hooks: Record<string, Array<{ command: string }>>;
		};
		expect(hooksConfig.hooks.stop?.[0]?.command).toBe(".cursor/hooks/kanban-stop");
		expect(hooksConfig.hooks.beforeSubmitPrompt?.[0]?.command).toBe(".cursor/hooks/kanban-before-submit-prompt");

		await launch.cleanup?.();
		await expect(readFile(join(tempDir, ".cursor", "hooks.json"), "utf8")).rejects.toThrow();
	});

	it("prepares plan mode and resume launch args", async () => {
		tempDir = await mkdtemp(join(tmpdir(), "cursor-agent-launch-"));
		const launch = await prepareAgentLaunch({
			taskId: "task-2",
			agentId: "cursor",
			args: [],
			autonomousModeEnabled: false,
			cwd: tempDir,
			prompt: "plan the refactor",
			startInPlanMode: true,
			resumeFromTrash: true,
		});

		expect(launch.args).toEqual(
			expect.arrayContaining(["--continue", "--plan", "--workspace", tempDir, "plan the refactor"]),
		);
		expect(launch.args).not.toContain("--force");
	});
});
