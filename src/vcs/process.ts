import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
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
	try {
		const { stdout, stderr } = await execFileAsync(input.command, input.args, {
			cwd: input.cwd,
			encoding: "utf8",
			maxBuffer: MAX_BUFFER_BYTES,
			env: process.env,
		});
		return {
			ok: true,
			stdout: redactSecrets(String(stdout ?? "").trim()),
			stderr: redactSecrets(String(stderr ?? "").trim()),
			exitCode: 0,
		};
	} catch (error) {
		const candidate = error as {
			code?: string | number | null;
			stdout?: unknown;
			stderr?: unknown;
		};
		return {
			ok: false,
			stdout: redactSecrets(String(candidate.stdout ?? "").trim()),
			stderr: redactSecrets(String(candidate.stderr ?? "").trim()),
			exitCode: normalizeExitCode(candidate.code),
		};
	}
}
