import { execFile as execFileCallback } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

type CommandOptions = {
	cwd?: string;
};

type FixtureOptions = {
	repoPath: string;
	force: boolean;
	json: boolean;
	dirty: boolean;
};

type CommitSpec = {
	parent: string;
	message: string;
	files: Record<string, string>;
	bookmark?: string;
};

const USER_NAME = "VCS Fixture";
const USER_EMAIL = "vcs-fixture@example.com";

function usage(): string {
	return [
		"Usage: node --import tsx scripts/create-vcs-jj-fixture.ts <path> [--force] [--clean] [--json]",
		"",
		"Creates a deterministic JJ/Git fixture repository for VCS UI testing.",
		"",
		"Options:",
		"  --force  Remove the destination before creating the fixture.",
		"  --clean  Do not leave an uncommitted working-copy README change.",
		"  --json   Print machine-readable fixture metadata.",
	].join("\n");
}

function parseArgs(argv: string[]): FixtureOptions {
	let repoPath: string | null = null;
	let force = false;
	let json = false;
	let dirty = true;
	for (const arg of argv) {
		if (arg === "--") {
			continue;
		}
		if (arg === "--force") {
			force = true;
			continue;
		}
		if (arg === "--json") {
			json = true;
			continue;
		}
		if (arg === "--clean") {
			dirty = false;
			continue;
		}
		if (arg === "-h" || arg === "--help") {
			process.stdout.write(`${usage()}\n`);
			process.exit(0);
		}
		if (arg.startsWith("-")) {
			throw new Error(`Unknown option: ${arg}`);
		}
		if (repoPath) {
			throw new Error(`Unexpected extra path: ${arg}`);
		}
		repoPath = arg;
	}
	if (!repoPath) {
		throw new Error("Missing fixture path.");
	}
	return {
		repoPath: resolve(repoPath),
		force,
		json,
		dirty,
	};
}

async function run(command: string, args: string[], options: CommandOptions = {}): Promise<string> {
	try {
		const result = await execFile(command, args, {
			cwd: options.cwd,
			encoding: "utf8",
			maxBuffer: 10 * 1024 * 1024,
			env: {
				...process.env,
				GIT_AUTHOR_NAME: USER_NAME,
				GIT_AUTHOR_EMAIL: USER_EMAIL,
				GIT_COMMITTER_NAME: USER_NAME,
				GIT_COMMITTER_EMAIL: USER_EMAIL,
			},
		});
		return result.stdout.trim();
	} catch (error) {
		const failure = error as Error & { stdout?: string; stderr?: string };
		const details = [failure.message, failure.stdout, failure.stderr].filter(Boolean).join("\n");
		throw new Error(`${command} ${args.join(" ")} failed\n${details}`);
	}
}

async function jj(cwd: string, args: string[]): Promise<string> {
	return await run(
		"jj",
		[
			"--no-pager",
			"--config",
			`user.name=${JSON.stringify(USER_NAME)}`,
			"--config",
			`user.email=${JSON.stringify(USER_EMAIL)}`,
			"--config",
			"signing.behavior='drop'",
			...args,
		],
		{ cwd },
	);
}

async function writeRepoFile(repoPath: string, relativePath: string, content: string): Promise<void> {
	const path = resolve(repoPath, relativePath);
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, content);
}

async function applyFiles(repoPath: string, files: Record<string, string>): Promise<void> {
	for (const [relativePath, content] of Object.entries(files)) {
		await writeRepoFile(repoPath, relativePath, content);
	}
}

async function createCommit(repoPath: string, spec: CommitSpec): Promise<void> {
	await jj(repoPath, ["new", spec.parent, "-m", spec.message]);
	await applyFiles(repoPath, spec.files);
	await jj(repoPath, ["commit", "-m", spec.message]);
	if (spec.bookmark) {
		await jj(repoPath, ["bookmark", "set", spec.bookmark, "-r", "@-"]);
	}
}

async function createFixture(options: FixtureOptions) {
	const remotePath = `${options.repoPath}.git`;
	if (options.force) {
		await rm(options.repoPath, { recursive: true, force: true });
		await rm(remotePath, { recursive: true, force: true });
	}
	await mkdir(dirname(options.repoPath), { recursive: true });
	await run("git", ["init", "--bare", remotePath]);
	await jj(process.cwd(), ["git", "init", "--colocate", options.repoPath]);
	await jj(options.repoPath, ["git", "remote", "add", "origin", remotePath]);

	await applyFiles(options.repoPath, {
		".gitignore": ["target/", "node_modules/", ".DS_Store", "*.log", ""].join("\n"),
		".changeyard/config.local.jsonc": JSON.stringify(
			{
				provider: { type: "noop" },
				vcs: { engine: "jj", fallback: "jj", targetBranch: "origin/main" },
				project: { defaultBase: "main" },
			},
			null,
			2,
		),
		"README.md": "# VCS JJ fixture\n\nA deterministic repository for VCS UI tests.\n",
		"src/tasks.rs": [
			"pub struct Task {",
			"    pub id: u64,",
			"    pub title: String,",
			"}",
			"",
		].join("\n"),
	});
	await jj(options.repoPath, ["commit", "-m", "initial task tracker cli"]);
	await jj(options.repoPath, ["bookmark", "set", "main", "-r", "@-"]);

	await createCommit(options.repoPath, {
		parent: "main",
		message: "document sample scenarios",
		files: {
			"README.md": [
				"# VCS JJ fixture",
				"",
				"A deterministic repository for VCS UI tests.",
				"",
				"## Scenarios",
				"",
				"- independent stack",
				"- dependent stack",
				"- remote-only branch",
				"",
			].join("\n"),
		},
		bookmark: "main",
	});

	await createCommit(options.repoPath, {
		parent: "main",
		message: "tighten startup validation",
		files: {
			"src/main.rs": [
				"mod tasks;",
				"",
				"fn main() {",
				"    println!(\"fixture ready\");",
				"}",
				"",
			].join("\n"),
		},
		bookmark: "main",
	});

	await createCommit(options.repoPath, {
		parent: "main",
		message: "add json report mode",
		files: {
			"src/main.rs": [
				"mod output;",
				"mod tasks;",
				"",
				"fn main() {",
				"    println!(\"{}\", output::render_json(&[]));",
				"}",
				"",
			].join("\n"),
			"src/output.rs": [
				"use crate::tasks::Task;",
				"",
				"pub fn render_json(tasks: &[Task]) -> String {",
				"    format!(\"{} tasks\", tasks.len())",
				"}",
				"",
			].join("\n"),
		},
	});
	await createCommit(options.repoPath, {
		parent: "@-",
		message: "add serde task serialization",
		files: {
			"Cargo.toml": [
				"[package]",
				"name = \"vcs-jj-fixture\"",
				"version = \"0.1.0\"",
				"edition = \"2021\"",
				"",
				"[dependencies]",
				"serde = { version = \"1\", features = [\"derive\"] }",
				"",
			].join("\n"),
			"src/tasks.rs": [
				"use serde::{Deserialize, Serialize};",
				"",
				"#[derive(Clone, Debug, Deserialize, Serialize)]",
				"pub struct Task {",
				"    pub id: u64,",
				"    pub title: String,",
				"    pub completed: bool,",
				"}",
				"",
			].join("\n"),
		},
		bookmark: "feature/export-json",
	});

	await createCommit(options.repoPath, {
		parent: "main",
		message: "prepare cloud deployment config",
		files: {
			"deploy/cloud.toml": [
				"[service]",
				"name = \"task-tracker\"",
				"region = \"test\"",
				"",
			].join("\n"),
		},
	});
	await createCommit(options.repoPath, {
		parent: "@-",
		message: "add deployment preview command",
		files: {
			"src/cloud.rs": [
				"pub fn preview_deployment() -> &'static str {",
				"    \"deployment preview\"",
				"}",
				"",
			].join("\n"),
		},
		bookmark: "feature/cloud-runner",
	});
	await createCommit(options.repoPath, {
		parent: "feature/cloud-runner",
		message: "add deployment health summary",
		files: {
			"src/cloud.rs": [
				"pub fn preview_deployment() -> &'static str {",
				"    \"deployment preview\"",
				"}",
				"",
				"pub fn health_summary() -> &'static str {",
				"    \"healthy\"",
				"}",
				"",
			].join("\n"),
		},
		bookmark: "feature/cloud-observability",
	});

	await createCommit(options.repoPath, {
		parent: "main",
		message: "add query parser for task filtering",
		files: {
			"src/query.rs": [
				"pub fn parse_query(input: &str) -> Vec<&str> {",
				"    input.split_whitespace().collect()",
				"}",
				"",
			].join("\n"),
		},
	});
	await createCommit(options.repoPath, {
		parent: "@-",
		message: "allow due date range queries",
		files: {
			"src/query.rs": [
				"pub fn parse_query(input: &str) -> Vec<&str> {",
				"    input.split_whitespace().collect()",
				"}",
				"",
				"pub fn supports_due_ranges() -> bool {",
				"    true",
				"}",
				"",
			].join("\n"),
		},
		bookmark: "feature/query-filtering",
	});

	await createCommit(options.repoPath, {
		parent: "main",
		message: "polish readme usage notes",
		files: {
			"README.md": [
				"# VCS JJ fixture",
				"",
				"A deterministic repository for VCS UI tests.",
				"",
				"## Usage",
				"",
				"Use this repository from automated UI tests.",
				"",
			].join("\n"),
		},
		bookmark: "feature/readme-polish",
	});

	await jj(options.repoPath, ["git", "push", "--remote", "origin", "--all"]);
	await jj(options.repoPath, ["bookmark", "forget", "feature/readme-polish"]);
	await jj(options.repoPath, ["git", "fetch", "--remote", "origin"]);

	if (options.dirty) {
		await jj(options.repoPath, ["new", "main", "-m", "workspace working copy"]);
		await writeRepoFile(
			options.repoPath,
			"README.md",
			[
				"# VCS JJ fixture",
				"",
				"A deterministic repository for VCS UI tests.",
				"",
				"Working copy edit for E2E coverage.",
				"",
			].join("\n"),
		);
	}

	const log = await jj(options.repoPath, ["log", "--ignore-working-copy", "--at-op=@", "-n", "24"]);
	return {
		repoPath: options.repoPath,
		remotePath,
		workspaceId: options.repoPath.split(/[\\/]/).filter(Boolean).at(-1) ?? "vcs-jj-fixture",
		targetBranch: "origin/main",
		expectedStacks: [
			{
				id: "feature/cloud-observability",
				heads: ["feature/cloud-observability", "feature/cloud-runner"],
				changes: [
					"add deployment health summary",
					"add deployment preview command",
					"prepare cloud deployment config",
				],
			},
			{
				id: "feature/export-json",
				heads: ["feature/export-json"],
				changes: ["add serde task serialization", "add json report mode"],
			},
			{
				id: "feature/query-filtering",
				heads: ["feature/query-filtering"],
				changes: ["allow due date range queries", "add query parser for task filtering"],
			},
		],
		remoteOnlyBranches: ["feature/readme-polish"],
		workingCopyFiles: options.dirty ? ["README.md"] : [],
		log,
	};
}

try {
	const options = parseArgs(process.argv.slice(2));
	const fixture = await createFixture(options);
	if (options.json) {
		process.stdout.write(`${JSON.stringify(fixture, null, 2)}\n`);
	} else {
		process.stdout.write(`Created VCS JJ fixture at ${fixture.repoPath}\n`);
		process.stdout.write(`Remote: ${fixture.remotePath}\n`);
		process.stdout.write(`Workspace ID: ${fixture.workspaceId}\n`);
		process.stdout.write(`Target branch: ${fixture.targetBranch}\n`);
	}
} catch (error) {
	const message = error instanceof Error ? error.message : String(error);
	process.stderr.write(`${message}\n\n${usage()}\n`);
	process.exit(1);
}
