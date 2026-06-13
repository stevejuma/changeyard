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

const USER_NAME = "VCS Fixture";
const USER_EMAIL = "vcs-fixture@example.com";

function usage(): string {
	return [
		"Usage: node --import tsx scripts/create-vcs-git-fixture.ts <path> [--force] [--clean] [--json]",
		"",
		"Creates a deterministic normal Git fixture repository for VCS UI testing.",
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

async function git(cwd: string, args: string[]): Promise<string> {
	return await run("git", args, { cwd });
}

async function writeRepoFile(repoPath: string, relativePath: string, content: string): Promise<void> {
	const path = resolve(repoPath, relativePath);
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, content);
}

async function commitFiles(repoPath: string, message: string, files: Record<string, string>): Promise<void> {
	for (const [relativePath, content] of Object.entries(files)) {
		await writeRepoFile(repoPath, relativePath, content);
	}
	await git(repoPath, ["add", "--", ...Object.keys(files)]);
	await git(repoPath, ["commit", "-m", message]);
}

async function createFixture(options: FixtureOptions) {
	const remotePath = `${options.repoPath}.git`;
	if (options.force) {
		await rm(options.repoPath, { recursive: true, force: true });
		await rm(remotePath, { recursive: true, force: true });
	}
	await mkdir(dirname(options.repoPath), { recursive: true });
	await run("git", ["init", "--bare", remotePath]);
	await run("git", ["init", "--initial-branch=main", options.repoPath]);
	await git(options.repoPath, ["config", "user.name", USER_NAME]);
	await git(options.repoPath, ["config", "user.email", USER_EMAIL]);
	await git(options.repoPath, ["config", "commit.gpgsign", "false"]);
	await git(options.repoPath, ["config", "tag.gpgSign", "false"]);
	await git(options.repoPath, ["remote", "add", "origin", remotePath]);

	await commitFiles(options.repoPath, "initial task tracker cli", {
		".gitignore": ["target/", "node_modules/", ".DS_Store", "*.log", ""].join("\n"),
		".changeyard/config.local.jsonc": JSON.stringify(
			{
				provider: { type: "noop" },
				vcs: { engine: "git-worktree", fallback: "git-worktree", targetBranch: "origin/main" },
				project: { defaultBase: "main" },
			},
			null,
			2,
		),
		"README.md": "# VCS Git fixture\n\nA deterministic repository for normal Git VCS tests.\n",
		"src/tasks.ts": ["export type Task = {", "\tid: number;", "\ttitle: string;", "};", ""].join("\n"),
	});
	await commitFiles(options.repoPath, "document sample scenarios", {
		"README.md": [
			"# VCS Git fixture",
			"",
			"A deterministic repository for normal Git VCS tests.",
			"",
			"## Scenarios",
			"",
			"- local branch stack",
			"- working-copy changes",
			"",
		].join("\n"),
	});
	await git(options.repoPath, ["push", "-u", "origin", "main"]);

	await git(options.repoPath, ["switch", "-c", "feature/export-json"]);
	await commitFiles(options.repoPath, "add json report mode", {
		"src/output.ts": [
			"import type { Task } from './tasks';",
			"",
			"export function renderJson(tasks: Task[]): string {",
			"\treturn JSON.stringify({ count: tasks.length });",
			"}",
			"",
		].join("\n"),
	});
	await commitFiles(options.repoPath, "add serde task serialization", {
		"package.json": JSON.stringify(
			{
				name: "vcs-git-fixture",
				version: "0.1.0",
				type: "module",
			},
			null,
			2,
		),
	});
	await git(options.repoPath, ["push", "-u", "origin", "feature/export-json"]);

	await git(options.repoPath, ["switch", "main"]);
	await git(options.repoPath, ["switch", "-c", "feature/query-filtering"]);
	await commitFiles(options.repoPath, "add query parser for task filtering", {
		"src/query.ts": [
			"export function parseQuery(input: string): string[] {",
			"\treturn input.trim().split(/\\s+/).filter(Boolean);",
			"}",
			"",
		].join("\n"),
	});
	await commitFiles(options.repoPath, "allow due date range queries", {
		"src/query.ts": [
			"export function parseQuery(input: string): string[] {",
			"\treturn input.trim().split(/\\s+/).filter(Boolean);",
			"}",
			"",
			"export function supportsDueRanges(): boolean {",
			"\treturn true;",
			"}",
			"",
		].join("\n"),
	});
	await git(options.repoPath, ["push", "-u", "origin", "feature/query-filtering"]);

	await git(options.repoPath, ["switch", "main"]);
	if (options.dirty) {
		await writeRepoFile(
			options.repoPath,
			"README.md",
			[
				"# VCS Git fixture",
				"",
				"A deterministic repository for normal Git VCS tests.",
				"",
				"Working copy edit for Git provider coverage.",
				"",
			].join("\n"),
		);
	}

	const log = await git(options.repoPath, ["log", "--oneline", "--decorate", "--all", "-n", "24"]);
	return {
		repoPath: options.repoPath,
		remotePath,
		workspaceId: options.repoPath.split(/[\\/]/).filter(Boolean).at(-1) ?? "vcs-git-fixture",
		targetBranch: "origin/main",
		expectedStacks: [
			{
				id: "feature/export-json",
				changes: ["add json report mode", "add serde task serialization"],
			},
			{
				id: "feature/query-filtering",
				changes: ["add query parser for task filtering", "allow due date range queries"],
			},
		],
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
		process.stdout.write(`Created VCS Git fixture at ${fixture.repoPath}\n`);
		process.stdout.write(`Remote: ${fixture.remotePath}\n`);
		process.stdout.write(`Workspace ID: ${fixture.workspaceId}\n`);
		process.stdout.write(`Target branch: ${fixture.targetBranch}\n`);
	}
} catch (error) {
	const message = error instanceof Error ? error.message : String(error);
	process.stderr.write(`${message}\n\n${usage()}\n`);
	process.exit(1);
}
