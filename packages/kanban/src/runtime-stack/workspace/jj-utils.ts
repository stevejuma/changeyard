import { execFile } from "node:child_process";
import { appendFileSync } from "node:fs";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const JJ_MAX_BUFFER_BYTES = 10 * 1024 * 1024;

interface JjCommandResult {
	ok: boolean;
	stdout: string;
	stderr: string;
	output: string;
	error: string | null;
	exitCode: number;
}

export interface RunJjOptions {
	trimStdout?: boolean;
}

export function normalizeJjArgs(args: readonly string[]): string[] {
	const next: string[] = [];
	for (let index = 0; index < args.length; index++) {
		const arg = args[index];
		if (!arg) {
			continue;
		}
		if (arg === "--color") {
			index++;
			continue;
		}
		if (arg?.startsWith("--color=")) {
			continue;
		}
		next.push(arg);
	}
	return ["--color=never", ...next];
}

function jjNoColorEnv(): NodeJS.ProcessEnv {
	return {
		...process.env,
		NO_COLOR: "1",
		CLICOLOR: "0",
		CLICOLOR_FORCE: "0",
		FORCE_COLOR: "0",
	};
}

function normalizeProcessExitCode(code: unknown): number {
	if (typeof code === "number" && Number.isFinite(code)) {
		return code;
	}
	if (typeof code === "string") {
		const parsed = Number(code);
		if (Number.isInteger(parsed)) {
			return parsed;
		}
	}
	return -1;
}

export async function runJj(cwd: string, args: string[], options: RunJjOptions = {}): Promise<JjCommandResult> {
	const startedAt = Date.now();
	const normalizedArgs = normalizeJjArgs(args);
	try {
		const { stdout, stderr } = await execFileAsync("jj", normalizedArgs, {
			cwd,
			encoding: "utf8",
			maxBuffer: JJ_MAX_BUFFER_BYTES,
			env: jjNoColorEnv(),
		});
		logJjTiming(normalizedArgs, startedAt);
		const rawStdout = String(stdout ?? "");
		const normalizedStdout = rawStdout.trim();
		const normalizedStderr = String(stderr ?? "").trim();
		return {
			ok: true,
			stdout: options.trimStdout === false ? rawStdout : normalizedStdout,
			stderr: normalizedStderr,
			output: [normalizedStdout, normalizedStderr].filter(Boolean).join("\n"),
			error: null,
			exitCode: 0,
		};
	} catch (error) {
		logJjTiming(normalizedArgs, startedAt);
		const candidate = error as {
			code?: string | number | null;
			stdout?: unknown;
			stderr?: unknown;
			message?: unknown;
		};
		const rawStdout = String(candidate.stdout ?? "");
		const stdout = options.trimStdout === false ? rawStdout : rawStdout.trim();
		const stderr = String(candidate.stderr ?? "").trim();
		const message = String(candidate.message ?? "").trim();
		const command = `jj ${normalizedArgs.join(" ")} failed`;
		const errorMessage = `Failed to run Jujutsu Command: \n Command: \n ${command} \n ${stderr || message}`;
		const exitCode = normalizeProcessExitCode(candidate.code);
		return {
			ok: false,
			stdout,
			stderr,
			output: [stdout, stderr].filter(Boolean).join("\n"),
			error: errorMessage,
			exitCode,
		};
	}
}

function logJjTiming(args: string[], startedAt: number): void {
	if (process.env.NODE_ENV === "production") {
		return;
	}
	const logPath = process.env.CHANGEYARD_VCS_TIMING_LOG;
	if (!logPath) {
		return;
	}
	try {
		appendFileSync(logPath, `[vcs timing] jj ${args.join(" ")} ${Date.now() - startedAt}ms\n`, "utf8");
	} catch {
		// Timing diagnostics must never interfere with user-facing TUI rendering.
	}
}

export async function getJjStdout(args: string[], cwd: string): Promise<string> {
	const result = await runJj(cwd, args);
	if (!result.ok) {
		throw new Error(result.error || result.stdout);
	}
	return result.stdout;
}

function parseBookmarkName(line: string): string | null {
	const trimmed = line.trim();
	if (!trimmed) {
		return null;
	}
	const match = /^([^\s:][^:]*)\s*:/.exec(trimmed);
	return match?.[1]?.trim() || null;
}

export async function getJjCurrentBookmark(cwd: string): Promise<string | null> {
	const output = await getJjStdout(["bookmark", "list", "--ignore-working-copy", "--at-op=@", "-r", "@"], cwd).catch(() => "");
	for (const line of output.split("\n")) {
		const name = parseBookmarkName(line);
		if (name) {
			return name;
		}
	}
	return null;
}

export async function getJjCurrentChangeId(cwd: string): Promise<string | null> {
	return await getJjStdout(["log", "--ignore-working-copy", "--at-op=@", "-r", "@", "--no-graph", "-T", "change_id.short()"], cwd).catch(() => null);
}

export interface JjHeadInfo {
	branch: string | null;
	jjChangeId: string | null;
	headCommit: string | null;
	isDetached: boolean;
}

export async function readJjHeadInfo(cwd: string): Promise<JjHeadInfo> {
	const [headCommit, branch, jjChangeId] = await Promise.all([
		getJjStdout(["log", "--ignore-working-copy", "--at-op=@", "-r", "@", "--no-graph", "-T", "commit_id"], cwd).catch(() => null),
		getJjCurrentBookmark(cwd),
		getJjCurrentChangeId(cwd),
	]);
	return {
		branch,
		jjChangeId,
		headCommit,
		isDetached: false,
	};
}
