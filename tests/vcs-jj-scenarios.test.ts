import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

type ScenarioManifest = {
	rootPath: string;
	repoPath: string;
	remotePath: string;
	targetBranch: string;
	scenarios: Array<{
		name: string;
		workspacePath: string;
		workspaceName: string;
		suggestedAppliedStacks: string[];
		expectedConflictPaths: string[];
	}>;
};

const repoRoot = process.cwd();
const scenarioScript = path.join(repoRoot, "scripts", "create-vcs-jj-scenarios.ts");

function hasCommand(command: string): boolean {
	return spawnSync(command, ["--version"], { encoding: "utf8" }).status === 0;
}

function runCommand(command: string, args: string[], cwd: string): string {
	const result = spawnSync(command, args, {
		cwd,
		encoding: "utf8",
		maxBuffer: 20 * 1024 * 1024,
	});
	if (result.status !== 0) {
		throw new Error(`${command} ${args.join(" ")} failed: ${(result.stderr || result.stdout || "command failed").trim()}`);
	}
	return (result.stdout || "").trim();
}

function createScenarioFixture(rootPath: string): ScenarioManifest {
	const result = spawnSync("node", ["--import", "tsx", scenarioScript, rootPath, "--all", "--reset", "--json"], {
		cwd: repoRoot,
		encoding: "utf8",
		maxBuffer: 30 * 1024 * 1024,
	});
	if (result.status !== 0) {
		throw new Error(`create-vcs-jj-scenarios failed: ${(result.stderr || result.stdout || "command failed").trim()}`);
	}
	return JSON.parse(result.stdout) as ScenarioManifest;
}

function scenario(manifest: ScenarioManifest, name: string) {
	const entry = manifest.scenarios.find((candidate) => candidate.name === name);
	assert.ok(entry, `Expected scenario ${name}`);
	return entry;
}

test("JJ scenario fixture script creates deterministic workspaces and conflicts", { skip: !hasCommand("jj") }, () => {
	const tempDir = mkdtempSync(path.join(os.tmpdir(), "changeyard-vcs-jj-scenarios-"));
	try {
		const rootPath = path.join(tempDir, "vcs-jj-scenarios");
		const manifest = createScenarioFixture(rootPath);
		assert.equal(manifest.targetBranch, "origin/main");
		assert.equal(manifest.scenarios.length, 6);
		assert.ok(existsSync(path.join(rootPath, "manifest.json")));
		const readmeFromMain = runCommand("jj", ["file", "show", "README.md", "-r", "main"], manifest.repoPath);
		assert.match(readmeFromMain, /## Scenario guide/);
		assert.match(readmeFromMain, /feature\/commit-conflict/);
		assert.match(readmeFromMain, /pnpm run vcs:jj-scenarios -- --all --reset/);

		const workspaceList = runCommand("jj", ["workspace", "list"], manifest.repoPath);
		for (const entry of manifest.scenarios) {
			assert.match(workspaceList, new RegExp(entry.workspaceName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
			assert.ok(existsSync(entry.workspacePath), `Expected workspace path for ${entry.name}`);
			runCommand("jj", ["status"], entry.workspacePath);
		}

		const baselineConflicts = runCommand(
			"jj",
			["log", "-r", "conflicts() & ::@", "--no-graph", "-T", 'description.first_line() ++ "\\n"'],
			scenario(manifest, "baseline-stacks").workspacePath,
		);
		assert.equal(baselineConflicts, "");

		const dirtyWorkspace = scenario(manifest, "dirty-workspace");
		assert.match(readFileSync(path.join(dirtyWorkspace.workspacePath, "README.md"), "utf8"), /## Scenario guide/);
		assert.match(readFileSync(path.join(dirtyWorkspace.workspacePath, "notes", "dirty-workspace.md"), "utf8"), /normal working-copy edit/);

		const workspaceConflict = scenario(manifest, "workspace-conflict");
		const workspaceConflictLog = runCommand(
			"jj",
			["log", "-r", "conflicts() & ::@", "--no-graph", "-T", 'description.first_line() ++ "\\n"'],
			workspaceConflict.workspacePath,
		);
		assert.match(workspaceConflictLog, /workspace conflict merge/);
		assert.match(runCommand("jj", ["resolve", "--list"], workspaceConflict.workspacePath), /src\/conflict\.rs/);

		const commitConflictLog = runCommand(
			"jj",
			["log", "-r", 'conflicts() & ::"feature/commit-conflict"', "--no-graph", "-T", 'description.first_line() ++ "\\n"'],
			scenario(manifest, "commit-conflict").workspacePath,
		);
		assert.match(commitConflictLog, /commit conflict merge/);

		const applyConflict = scenario(manifest, "apply-stack-conflict");
		assert.equal(
			runCommand("jj", ["log", "-r", "conflicts() & ::@", "--no-graph", "-T", 'description.first_line() ++ "\\n"'], applyConflict.workspacePath),
			"",
		);
		runCommand("jj", ["rebase", "-r", "@", "-o", "feature/apply-conflict"], applyConflict.workspacePath);
		assert.match(runCommand("jj", ["resolve", "--list"], applyConflict.workspacePath), /src\/apply\.rs/);

		const taskConflict = scenario(manifest, "task-workspace-conflict");
		runCommand("jj", ["rebase", "-r", "@", "-o", "feature/task-conflict-stack"], taskConflict.workspacePath);
		assert.match(runCommand("jj", ["resolve", "--list"], taskConflict.workspacePath), /src\/task_flow\.rs/);

		const listResult = spawnSync("node", ["--import", "tsx", scenarioScript, "--list", "--json"], {
			cwd: repoRoot,
			encoding: "utf8",
		});
		assert.equal(listResult.status, 0);
		assert.match(listResult.stdout, /workspace-conflict/);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});
