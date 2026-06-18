import { execFile as execFileCallback } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

type ScenarioName = "stale-detail" | "review-switching" | "dirty-workspace";

type Options = {
	rootPath: string;
	scenarios: ScenarioName[];
	all: boolean;
	force: boolean;
	reset: boolean;
	json: boolean;
	list: boolean;
};

type ScenarioManifestEntry = {
	name: ScenarioName;
	description: string;
	repoPath: string;
	workspacePath: string;
	workspaceName: string;
	changeIds: string[];
	reviewIds: string[];
	appUrl: string;
};

type ScenarioManifest = {
	rootPath: string;
	repoPath: string;
	scenarios: ScenarioManifestEntry[];
};

type ScenarioDefinition = {
	name: ScenarioName;
	description: string;
	workspaceName: string;
	relativeWorkspacePath: string;
	changeIds: string[];
	reviewIds: string[];
	setup?: (input: { repoPath: string; workspacePath: string }) => Promise<void>;
};

const DEFAULT_ROOT = "kanban-jj-scenarios";
const APP_BASE_URL = "http://127.0.0.1:4173";

const SCENARIOS: ScenarioDefinition[] = [
	{
		name: "stale-detail",
		description: "Two changes with distinct long bodies for detail-dialog stale data checks.",
		workspaceName: "kanban-stale-detail",
		relativeWorkspacePath: "repo/.changeyard/workspaces/CY-9001/repo",
		changeIds: ["CY-9001", "CY-9002"],
		reviewIds: [],
		setup: async ({ workspacePath }) => {
			await writeRepoFile(workspacePath, "src/stale-detail.ts", "export const staleDetail = 'workspace alpha';\n");
			await jj(workspacePath, ["describe", "-m", "CY-9001: workspace detail alpha"]);
		},
	},
	{
		name: "review-switching",
		description: "Two in-review changes with different review summaries and required changes.",
		workspaceName: "kanban-review-switching",
		relativeWorkspacePath: "repo/.changeyard/workspaces/CY-9003/repo",
		changeIds: ["CY-9003", "CY-9004"],
		reviewIds: ["CY-9003#1", "CY-9004#1"],
		setup: async ({ workspacePath }) => {
			await writeRepoFile(workspacePath, "src/review-switching.ts", "export const reviewSwitching = 'alpha';\n");
			await jj(workspacePath, ["describe", "-m", "CY-9003: review switching alpha"]);
		},
	},
	{
		name: "dirty-workspace",
		description: "Workspace with ordinary uncommitted edits for board/detail panels.",
		workspaceName: "kanban-dirty-workspace",
		relativeWorkspacePath: "repo/.changeyard/workspaces/CY-9005/repo",
		changeIds: ["CY-9005"],
		reviewIds: [],
		setup: async ({ workspacePath }) => {
			await writeRepoFile(workspacePath, "src/dirty.ts", "export const dirtyWorkspace = 'uncommitted edit';\n");
		},
	},
];

function usage(): string {
	return [
		"Usage: node --import tsx scripts/create-kanban-scenarios.ts [root] [--scenario <name>] [--all] [--reset] [--force] [--json] [--list]",
		"",
		"Creates a persistent ignored JJ scenario fixture repo for Kanban UI testing.",
		"",
		"Options:",
		"  --scenario <name>  Create or reset one named scenario workspace. Can be repeated.",
		"  --all              Create or reset every scenario workspace.",
		"  --reset            Recreate the fixture root before creating scenarios.",
		"  --force            Rebuild the entire fixture root before creating scenarios.",
		"  --json             Print machine-readable manifest or scenario list.",
		"  --list             List available scenarios without creating the fixture.",
	].join("\n");
}

function isScenarioName(value: string): value is ScenarioName {
	return SCENARIOS.some((scenario) => scenario.name === value);
}

function parseArgs(argv: string[]): Options {
	let rootPath: string | null = null;
	let all = false;
	let force = false;
	let reset = false;
	let json = false;
	let list = false;
	const scenarios: ScenarioName[] = [];
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (!arg || arg === "--") {
			continue;
		}
		if (arg === "--all") {
			all = true;
			continue;
		}
		if (arg === "--force") {
			force = true;
			continue;
		}
		if (arg === "--reset") {
			reset = true;
			continue;
		}
		if (arg === "--json") {
			json = true;
			continue;
		}
		if (arg === "--list") {
			list = true;
			continue;
		}
		if (arg === "--scenario") {
			const value = argv[index + 1];
			if (!value || !isScenarioName(value)) {
				throw new Error(`Unknown scenario: ${value ?? ""}`);
			}
			scenarios.push(value);
			index += 1;
			continue;
		}
		if (arg.startsWith("--")) {
			throw new Error(`Unknown option: ${arg}`);
		}
		rootPath = arg;
	}
	return {
		rootPath: resolve(rootPath ?? DEFAULT_ROOT),
		scenarios,
		all,
		force,
		reset,
		json,
		list,
	};
}

async function run(command: string, args: string[], cwd = process.cwd()): Promise<string> {
	try {
		const result = await execFile(command, args, {
			cwd,
			encoding: "utf8",
			maxBuffer: 20 * 1024 * 1024,
		});
		return result.stdout.trim();
	} catch (error) {
		const failure = error as { stdout?: string; stderr?: string; message?: string };
		throw new Error(`${command} ${args.join(" ")} failed: ${(failure.stderr || failure.stdout || failure.message || "").trim()}`);
	}
}

async function jj(cwd: string, args: string[]): Promise<string> {
	return await run("jj", ["--color=never", ...args], cwd);
}

async function writeRepoFile(root: string, relativePath: string, content: string): Promise<void> {
	const filePath = join(root, relativePath);
	await mkdir(dirname(filePath), { recursive: true });
	await writeFile(filePath, content);
}

function changeMarkdown(input: {
	id: string;
	title: string;
	status: string;
	workspacePath: string;
	body: string;
}): string {
	return [
		"---",
		`id: ${input.id}`,
		`title: ${input.title}`,
		"type: agent-task",
		`status: ${input.status}`,
		"priority: medium",
		"labels:",
		"  - scenario",
		"author: kanban-scenarios",
		"createdAt: 2026-06-18T00:00:00.000Z",
		"updatedAt: 2026-06-18T00:00:00.000Z",
		"base:",
		"  vcs: jj",
		"  revision: main",
		"workspace:",
		"  engine: jj",
		`  name: cy-${input.id}`,
		`  path: ${input.workspacePath}`,
		"remote:",
		"  provider: noop",
		"checks:",
		"  profile: standard",
		"  lastRun: null",
		"  lastStatus: pending",
		"---",
		"",
		input.body.trim(),
		"",
	].join("\n");
}

function reviewMarkdown(input: {
	changeId: string;
	reviewNumber: number;
	status: string;
	summary: string;
	requiredChange: string;
	inlineComment: string;
}): string {
	return [
		"---",
		`change: ${input.changeId}`,
		`review: ${input.reviewNumber}`,
		"reviewer: kanban-scenarios",
		`status: ${input.status}`,
		"createdAt: 2026-06-18T00:10:00.000Z",
		"commitBased: true",
		"completedAt: null",
		"---",
		"",
		"# Summary",
		"",
		input.summary,
		"",
		"# Required Changes",
		"",
		`- [ ] ${input.requiredChange}`,
		"",
		"# Inline Comments",
		"",
		`- src/review-switching.ts:1: ${input.inlineComment}`,
		"",
	].join("\n");
}

async function seedChangeyardData(repoPath: string): Promise<void> {
	const changeBodies = [
		{
			id: "CY-9001",
			title: "Kanban stale detail alpha",
			status: "in_progress",
			workspacePath: ".changeyard/workspaces/CY-9001/repo",
			body: "# Summary\n\nAlpha detail body. This text should never appear for beta.\n\n# Plan\n\n- [ ] Alpha task",
		},
		{
			id: "CY-9002",
			title: "Kanban stale detail beta",
			status: "in_progress",
			workspacePath: ".changeyard/workspaces/CY-9001/repo",
			body: "# Summary\n\nBeta detail body. This text should never appear for alpha.\n\n# Plan\n\n- [ ] Beta task",
		},
		{
			id: "CY-9003",
			title: "Kanban review alpha",
			status: "in_review",
			workspacePath: ".changeyard/workspaces/CY-9003/repo",
			body: "# Summary\n\nReview alpha body.\n\n# Plan\n\n- [ ] Alpha review work",
		},
		{
			id: "CY-9004",
			title: "Kanban review beta",
			status: "in_review",
			workspacePath: ".changeyard/workspaces/CY-9003/repo",
			body: "# Summary\n\nReview beta body.\n\n# Plan\n\n- [ ] Beta review work",
		},
		{
			id: "CY-9005",
			title: "Kanban dirty workspace",
			status: "in_progress",
			workspacePath: ".changeyard/workspaces/CY-9005/repo",
			body: "# Summary\n\nDirty workspace body.\n\n# Plan\n\n- [ ] Inspect uncommitted edit",
		},
	];
	for (const change of changeBodies) {
		await writeRepoFile(
			repoPath,
			`.changeyard/changes/${change.id}-${change.title.toLowerCase().replaceAll(" ", "-")}.md`,
			changeMarkdown(change),
		);
	}
	await writeRepoFile(
		repoPath,
		".changeyard/reviews/CY-9003/review-001.md",
		reviewMarkdown({
			changeId: "CY-9003",
			reviewNumber: 1,
			status: "in_review",
			summary: "Alpha review summary unique to CY-9003.",
			requiredChange: "Alpha required change should not appear for beta.",
			inlineComment: "Alpha inline comment.",
		}),
	);
	await writeRepoFile(
		repoPath,
		".changeyard/reviews/CY-9004/review-001.md",
		reviewMarkdown({
			changeId: "CY-9004",
			reviewNumber: 1,
			status: "in_review",
			summary: "Beta review summary unique to CY-9004.",
			requiredChange: "Beta required change should not appear for alpha.",
			inlineComment: "Beta inline comment.",
		}),
	);
}

async function buildBaseRepository(rootPath: string, reset: boolean): Promise<string> {
	const repoPath = join(rootPath, "repo");
	if (reset) {
		await rm(rootPath, { recursive: true, force: true });
	}
	await mkdir(rootPath, { recursive: true });
	await jj(process.cwd(), ["git", "init", "--colocate", repoPath]);
	await writeRepoFile(repoPath, ".gitignore", [".changeyard/workspaces/", "node_modules/", "dist/", ""].join("\n"));
	await writeRepoFile(
		repoPath,
		".changeyard/config.local.jsonc",
		JSON.stringify({ provider: { type: "noop" }, vcs: { engine: "jj", fallback: "jj", targetBranch: "main" } }, null, 2),
	);
	await writeRepoFile(
		repoPath,
		"README.md",
		[
			"# Kanban JJ scenarios",
			"",
			"Generated by `pnpm run kanban:scenarios` from the ChangeYard checkout.",
			"",
			"Add this `repo` directory as a Kanban project, then expand the child workspace rows.",
			"",
		].join("\n"),
	);
	await writeRepoFile(repoPath, "src/base.ts", "export const base = 'kanban scenario base';\n");
	await seedChangeyardData(repoPath);
	await jj(repoPath, ["commit", "-m", "seed kanban scenario repository"]);
	await jj(repoPath, ["bookmark", "set", "main", "-r", "@-"]);
	return repoPath;
}

function selectedScenarios(options: Options): ScenarioDefinition[] {
	if (options.all || options.scenarios.length === 0) {
		return SCENARIOS;
	}
	return options.scenarios.map((name) => {
		const scenario = SCENARIOS.find((candidate) => candidate.name === name);
		if (!scenario) {
			throw new Error(`Unknown scenario: ${name}`);
		}
		return scenario;
	});
}

async function forgetWorkspace(repoPath: string, workspaceName: string): Promise<void> {
	await run("jj", ["--color=never", "workspace", "forget", workspaceName], repoPath).catch(() => "");
}

async function createScenarioWorkspace(
	rootPath: string,
	repoPath: string,
	scenario: ScenarioDefinition,
	reset: boolean,
): Promise<ScenarioManifestEntry> {
	const workspacePath = resolve(rootPath, scenario.relativeWorkspacePath);
	if (reset) {
		await forgetWorkspace(repoPath, scenario.workspaceName);
		await rm(workspacePath, { recursive: true, force: true });
	}
	await mkdir(dirname(workspacePath), { recursive: true });
	await jj(repoPath, ["workspace", "add", "--name", scenario.workspaceName, "-r", "main", workspacePath]);
	await scenario.setup?.({ repoPath, workspacePath });
	return {
		name: scenario.name,
		description: scenario.description,
		repoPath,
		workspacePath,
		workspaceName: scenario.workspaceName,
		changeIds: scenario.changeIds,
		reviewIds: scenario.reviewIds,
		appUrl: `${APP_BASE_URL}/kanban`,
	};
}

async function readExistingManifest(rootPath: string): Promise<ScenarioManifest | null> {
	try {
		return JSON.parse(await readFile(join(rootPath, "manifest.json"), "utf8")) as ScenarioManifest;
	} catch {
		return null;
	}
}

async function writeManifest(manifest: ScenarioManifest): Promise<void> {
	await writeFile(join(manifest.rootPath, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

async function createScenarios(options: Options): Promise<ScenarioManifest> {
	const existing = await readExistingManifest(options.rootPath);
	const shouldReset = options.force || options.reset || !existing;
	const repoPath = shouldReset ? await buildBaseRepository(options.rootPath, shouldReset) : join(options.rootPath, "repo");
	const entries = new Map<ScenarioName, ScenarioManifestEntry>(
		(shouldReset ? [] : (existing?.scenarios ?? [])).map((scenario) => [scenario.name, scenario]),
	);
	for (const scenario of selectedScenarios(options)) {
		if (!shouldReset && entries.has(scenario.name)) {
			continue;
		}
		entries.set(scenario.name, await createScenarioWorkspace(options.rootPath, repoPath, scenario, shouldReset));
	}
	const manifest: ScenarioManifest = {
		rootPath: options.rootPath,
		repoPath,
		scenarios: SCENARIOS.map((scenario) => entries.get(scenario.name)).filter((entry): entry is ScenarioManifestEntry => Boolean(entry)),
	};
	await writeManifest(manifest);
	return manifest;
}

function listScenarios(json: boolean): void {
	const scenarios = SCENARIOS.map(({ name, description, changeIds, reviewIds }) => ({
		name,
		description,
		changeIds,
		reviewIds,
	}));
	if (json) {
		process.stdout.write(`${JSON.stringify({ scenarios }, null, 2)}\n`);
		return;
	}
	for (const scenario of scenarios) {
		process.stdout.write(`${scenario.name}\n  ${scenario.description}\n`);
	}
}

try {
	const options = parseArgs(process.argv.slice(2));
	if (options.list) {
		listScenarios(options.json);
		process.exit(0);
	}
	const manifest = await createScenarios(options);
	if (options.json) {
		process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
	} else {
		process.stdout.write(`Created Kanban JJ scenario fixture at ${manifest.rootPath}\n`);
		process.stdout.write(`Project repo: ${manifest.repoPath}\n`);
		process.stdout.write(`Manifest: ${join(manifest.rootPath, "manifest.json")}\n`);
		for (const scenario of manifest.scenarios) {
			process.stdout.write(`- ${scenario.name}: ${scenario.workspacePath}\n`);
		}
	}
} catch (error) {
	const message = error instanceof Error ? error.message : String(error);
	process.stderr.write(`${message}\n\n${usage()}\n`);
	process.exit(1);
}
