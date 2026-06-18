import { access } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

import { describe, expect, it } from "vitest";

const DESKTOP_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const LAUNCHER_PATH = path.join(DESKTOP_ROOT, "scripts", "launch-electron.mjs");
const ENTRY_EXISTS_TIMEOUT_MS = 12_000;
const LAUNCH_STABILITY_MS = 8_000;
const SHUTDOWN_TIMEOUT_MS = 8_000;
const DESKTOP_ENTRY_PATHS = [
	path.join(DESKTOP_ROOT, "dist", "main.js"),
	path.join(DESKTOP_ROOT, "dist", "src", "main.js"),
];
const PNPM_BIN = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function runBuildStep(): void {
	const result = spawnSync(PNPM_BIN, ["run", "build:ts"], {
		cwd: DESKTOP_ROOT,
		encoding: "utf-8",
		stdio: "pipe",
	});

	if (result.status !== 0) {
		throw new Error(
			`pnpm run build:ts failed with exit code ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
		);
	}
}

async function ensureArtifact(): Promise<void> {
	for (const entry of DESKTOP_ENTRY_PATHS) {
		try {
			await access(entry, constants.F_OK);
			return;
		} catch {
			// continue;
		}
	}

	runBuildStep();

	for (const entry of DESKTOP_ENTRY_PATHS) {
		try {
			await access(entry, constants.F_OK);
			return;
		} catch {
			// continue;
		}
	}

	throw new Error(
		`Expected a built Electron entrypoint at one of: ${DESKTOP_ENTRY_PATHS.join(", ")}`,
	);
}

function waitForExit(proc: ReturnType<typeof spawn>): Promise<{
	code: number | null;
	signal: string | null;
}> {
	return new Promise((resolve, reject) => {
		const onExit = (code: number | null, signal: string | null) => {
			proc.removeAllListeners("error");
			resolve({ code, signal });
		};
		const onError = (error: Error) => {
			proc.removeAllListeners("exit");
			reject(error);
		};
		proc.once("exit", onExit);
		proc.once("error", onError);
	});
}

async function waitWithTimeout(
	proc: ReturnType<typeof spawn>,
	timeoutMs: number,
): Promise<
	{ kind: "timeout" } | { kind: "exit"; state: { code: number | null; signal: string | null } }
> {
	const exitState = waitForExit(proc);
	const outcome = await Promise.race([
		exitState.then((state) => ({ kind: "exit", state } as const)),
		(async () => {
			await delay(timeoutMs);
			return { kind: "timeout" } as const;
		})(),
	]);

	return outcome;
}

async function cleanupProcess(proc: ReturnType<typeof spawn>): Promise<{
	code: number | null;
	signal: string | null;
}> {
	proc.kill("SIGINT");

	const exitResult = await Promise.race([
		waitForExit(proc),
		(async () => {
			await delay(SHUTDOWN_TIMEOUT_MS);
			if (proc.exitCode === null && !proc.killed) {
				proc.kill("SIGKILL");
			}
			return waitForExit(proc);
		})(),
	]);

	return exitResult;
}

describe("desktop launch smoke", () => {
	it(
		"starts launch-electron and stays alive long enough to be considered booted",
		async () => {
			await ensureArtifact();
			const userDataDir = await mkdtemp(path.join(tmpdir(), "changeyard-desktop-e2e-"));

			const logs = {
				stdout: "",
				stderr: "",
			};

			const proc = spawn(process.execPath, [LAUNCHER_PATH, "--no-sandbox", "--disable-gpu"], {
				cwd: DESKTOP_ROOT,
				env: {
					...process.env,
					KANBAN_DESKTOP_USER_DATA: userDataDir,
					CHANGEYARD_DESKTOP_WEB_UI_URL: "http://127.0.0.1:4173",
				},
				stdio: ["ignore", "pipe", "pipe"],
			});

			proc.stdout?.on("data", (chunk) => {
				logs.stdout += String(chunk);
			});
			proc.stderr?.on("data", (chunk) => {
				logs.stderr += String(chunk);
			});

			const didTimeout = await waitWithTimeout(proc, LAUNCH_STABILITY_MS);
			if (didTimeout.kind === "exit") {
				const state = didTimeout.state;
				await rm(userDataDir, { recursive: true, force: true });
				throw new Error(
					`desktop launcher exited too early before stability window (code=${state.code}, signal=${state.signal}).\nSTDOUT:\n${logs.stdout}\nSTDERR:\n${logs.stderr}`,
				);
			}

			const shutdown = await cleanupProcess(proc);

			await rm(userDataDir, { recursive: true, force: true });

			expect(shutdown.code).toBe(130);
			expect(shutdown.signal).toBeNull();
			expect(logs.stderr).not.toContain("Cannot find module");
		},
		ENTRY_EXISTS_TIMEOUT_MS + LAUNCH_STABILITY_MS + SHUTDOWN_TIMEOUT_MS,
	);
});
