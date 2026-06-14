import { spawn } from "node:child_process";
import { appendFileSync } from "node:fs";
import { normalizeVcsCommandArgs, vcsNoColorEnv } from "./argv.js";
const MAX_BUFFER_BYTES = 10 * 1024 * 1024;
const ALLOWED_COMMANDS = new Set(["git", "gh", "jj"]);

export interface VcsCommandResult {
	ok: boolean;
	stdout: string;
	stderr: string;
	exitCode: number;
}

export interface RunVcsCommandInput {
	command: "git" | "gh" | "jj";
	args: string[];
	cwd: string;
	stdin?: string;
}

function normalizeExitCode(code: unknown): number {
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

function validateArgv(input: RunVcsCommandInput): void {
	if (!ALLOWED_COMMANDS.has(input.command)) {
		throw new Error(`Unsupported VCS command: ${input.command}`);
	}
	for (const arg of input.args) {
		if (typeof arg !== "string" || arg.length === 0) {
			throw new Error("VCS command arguments must be non-empty strings.");
		}
		if (arg.includes("\u0000")) {
			throw new Error("VCS command arguments cannot contain null bytes.");
		}
	}
}

export function redactSecrets(text: string): string {
	if (!text) {
		return text;
	}
	return text
		.replace(/(https?:\/\/)([^@\s/]+)@/gi, "$1[redacted]@")
		.replace(/([?&](?:token|access_token|auth)=)[^&\s]+/gi, "$1[redacted]");
}

export async function runVcsCommand(input: RunVcsCommandInput): Promise<VcsCommandResult> {
	validateArgv(input);
	const startedAt = Date.now();
	const args = normalizeVcsCommandArgs(input.command, input.args);
	return new Promise((resolve) => {
		const child = spawn(input.command, args, {
			cwd: input.cwd,
			env: vcsNoColorEnv(),
			stdio: ["pipe", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		let settled = false;

		function settle(result: VcsCommandResult): void {
			if (settled) {
				return;
			}
			settled = true;
			logVcsTiming({ ...input, args }, startedAt);
			resolve(result);
		}

		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (chunk) => {
			stdout += String(chunk);
			if (stdout.length > MAX_BUFFER_BYTES) {
				child.kill("SIGTERM");
			}
		});
		child.stderr.on("data", (chunk) => {
			stderr += String(chunk);
			if (stderr.length > MAX_BUFFER_BYTES) {
				child.kill("SIGTERM");
			}
		});
		child.on("error", (error) => {
			settle({
				ok: false,
				stdout: redactSecrets(stdout.trim()),
				stderr: redactSecrets(error.message || stderr.trim()),
				exitCode: -1,
			});
		});
		child.on("close", (code) => {
			const exitCode = normalizeExitCode(code);
			settle({
				ok: exitCode === 0,
				stdout: redactSecrets(stdout.trim()),
				stderr: redactSecrets(stderr.trim()),
				exitCode,
			});
		});
		child.stdin.end(input.stdin ?? "");
	});
}

function logVcsTiming(input: RunVcsCommandInput, startedAt: number): void {
	if (process.env.NODE_ENV === "production" || input.command !== "jj") {
		return;
	}
	writeVcsTiming(`[vcs timing] jj ${input.args.join(" ")} ${Date.now() - startedAt}ms`);
}

function writeVcsTiming(message: string): void {
	const logPath = process.env.CHANGEYARD_VCS_TIMING_LOG;
	if (!logPath) {
		return;
	}
	try {
		appendFileSync(logPath, `${message}\n`, "utf8");
	} catch {
		// Timing diagnostics must never interfere with user-facing TUI rendering.
	}
}
