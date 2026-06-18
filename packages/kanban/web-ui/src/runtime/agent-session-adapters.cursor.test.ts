import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { prepareAgentLaunch } from "../../../src/runtime-stack/terminal/agent-session-adapters.js";

function commandAvailable(command: string): boolean {
	return spawnSync(command, ["--version"], { encoding: "utf8" }).status === 0;
}

function run(command: string, args: string[], cwd: string): string {
	const result = spawnSync(command, args, { cwd, encoding: "utf8" });
	if (result.status !== 0) {
		throw new Error(result.stderr || result.stdout || `${command} ${args.join(" ")} failed`);
	}
	return result.stdout;
}

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

	it("adds generated Cursor hook scripts to the local VCS exclude", async () => {
		tempDir = await mkdtemp(join(tmpdir(), "cursor-agent-launch-"));
		run("git", ["init"], tempDir);

		await prepareAgentLaunch({
			taskId: "task-3",
			agentId: "cursor",
			args: [],
			autonomousModeEnabled: true,
			cwd: tempDir,
			prompt: "implement feature",
			workspaceId: "workspace-3",
		});

		const exclude = await readFile(join(tempDir, ".git", "info", "exclude"), "utf8");
		expect(exclude).toContain(".cursor/hooks/kanban-*");
	});

	it("adds generated Copilot hook config to the local VCS exclude", async () => {
		tempDir = await mkdtemp(join(tmpdir(), "copilot-agent-launch-"));
		run("git", ["init"], tempDir);
		const previousCopilotHome = process.env.COPILOT_HOME;
		process.env.COPILOT_HOME = join(tempDir, ".copilot-home");
		try {
			await prepareAgentLaunch({
				taskId: "task-4",
				agentId: "copilot",
				args: [],
				autonomousModeEnabled: true,
				cwd: tempDir,
				prompt: "implement feature",
				workspaceId: "workspace-4",
			});

			const exclude = await readFile(join(tempDir, ".git", "info", "exclude"), "utf8");
			expect(exclude).toContain(".github/hooks/kanban.json");
		} finally {
			if (previousCopilotHome === undefined) delete process.env.COPILOT_HOME;
			else process.env.COPILOT_HOME = previousCopilotHome;
		}
	});

	it("keeps generated Cursor hook scripts out of colocated jj status", async () => {
		if (!commandAvailable("jj")) return;
		tempDir = await mkdtemp(join(tmpdir(), "cursor-agent-launch-jj-"));
		run("jj", ["git", "init", "--colocate", "."], tempDir);

		await prepareAgentLaunch({
			taskId: "task-5",
			agentId: "cursor",
			args: [],
			autonomousModeEnabled: true,
			cwd: tempDir,
			prompt: "implement feature",
			workspaceId: "workspace-5",
		});

		const status = run("jj", ["status", "--no-pager", "--color=never"], tempDir);
		expect(status).not.toContain(".cursor/hooks/kanban-");
	});
});
