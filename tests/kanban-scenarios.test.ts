import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

type ScenarioManifest = {
	rootPath: string;
	repoPath: string;
	scenarios: Array<{
		name: string;
		workspacePath: string;
		workspaceName: string;
		changeIds: string[];
		reviewIds: string[];
		appUrl: string;
	}>;
};

const repoRoot = process.cwd();
const scenarioScript = path.join(repoRoot, "scripts", "create-kanban-scenarios.ts");

function hasCommand(command: string): boolean {
	return spawnSync(command, command === "jj" ? ["--color=never", "--version"] : ["--version"], {
		encoding: "utf8",
	}).status === 0;
}

function runCommand(command: string, args: string[], cwd: string): string {
	const normalizedArgs = command === "jj" ? ["--color=never", ...args] : args;
	const result = spawnSync(command, normalizedArgs, {
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
		throw new Error(`create-kanban-scenarios failed: ${(result.stderr || result.stdout || "command failed").trim()}`);
	}
	return JSON.parse(result.stdout) as ScenarioManifest;
}

function scenario(manifest: ScenarioManifest, name: string) {
	const entry = manifest.scenarios.find((candidate) => candidate.name === name);
	assert.ok(entry, `Expected scenario ${name}`);
	return entry;
}

test("Kanban scenario fixture script creates deterministic workspaces and review data", { skip: !hasCommand("jj") }, () => {
	const tempDir = mkdtempSync(path.join(os.tmpdir(), "changeyard-kanban-scenarios-"));
	try {
		const rootPath = path.join(tempDir, "kanban-jj-scenarios");
		const manifest = createScenarioFixture(rootPath);
		assert.equal(manifest.scenarios.length, 3);
		assert.ok(existsSync(path.join(rootPath, "manifest.json")));
		assert.ok(existsSync(manifest.repoPath));
		assert.match(readFileSync(path.join(manifest.repoPath, "README.md"), "utf8"), /Kanban JJ scenarios/);

		const workspaceList = runCommand("jj", ["workspace", "list"], manifest.repoPath);
		for (const entry of manifest.scenarios) {
			assert.match(workspaceList, new RegExp(entry.workspaceName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
			assert.ok(existsSync(entry.workspacePath), `Expected workspace path for ${entry.name}`);
			runCommand("jj", ["status"], entry.workspacePath);
			assert.equal(entry.appUrl, "http://127.0.0.1:4173/kanban");
		}

		const staleAlpha = readFileSync(
			path.join(manifest.repoPath, ".changeyard", "changes", "CY-9001-kanban-stale-detail-alpha.md"),
			"utf8",
		);
		const staleBeta = readFileSync(
			path.join(manifest.repoPath, ".changeyard", "changes", "CY-9002-kanban-stale-detail-beta.md"),
			"utf8",
		);
		assert.match(staleAlpha, /Alpha detail body/);
		assert.match(staleBeta, /Beta detail body/);
		assert.ok(scenario(manifest, "stale-detail").changeIds.includes("CY-9001"));
		assert.ok(scenario(manifest, "stale-detail").changeIds.includes("CY-9002"));

		const reviewAlpha = readFileSync(
			path.join(manifest.repoPath, ".changeyard", "reviews", "CY-9003", "review-001.md"),
			"utf8",
		);
		const reviewBeta = readFileSync(
			path.join(manifest.repoPath, ".changeyard", "reviews", "CY-9004", "review-001.md"),
			"utf8",
		);
		assert.match(reviewAlpha, /Alpha review summary unique to CY-9003/);
		assert.match(reviewAlpha, /Alpha required change should not appear for beta/);
		assert.match(reviewBeta, /Beta review summary unique to CY-9004/);
		assert.match(reviewBeta, /Beta required change should not appear for alpha/);
		assert.deepEqual(scenario(manifest, "review-switching").reviewIds, ["CY-9003#1", "CY-9004#1"]);

		const dirty = scenario(manifest, "dirty-workspace");
		assert.match(readFileSync(path.join(dirty.workspacePath, "src", "dirty.ts"), "utf8"), /uncommitted edit/);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});
