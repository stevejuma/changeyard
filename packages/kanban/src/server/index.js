import { spawn, spawnSync } from "node:child_process";
import { stat } from "node:fs/promises";
import { createServer as createNetServer } from "node:net";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

import packageJson from "../../package.json" with { type: "json" };
import { loadGlobalRuntimeConfig, loadRuntimeConfig } from "../runtime-stack/config/runtime-config.js";
import { createGitProcessEnv } from "../runtime-stack/core/git-process-env.js";
import {
	DEFAULT_KANBAN_RUNTIME_HOST,
	DEFAULT_KANBAN_RUNTIME_PORT,
	isKanbanRemoteHost,
	setKanbanRuntimeHost,
	setKanbanRuntimePort,
} from "../runtime-stack/core/runtime-endpoint.js";
import { disablePasscode, generateInternalToken, generatePasscode } from "../runtime-stack/security/passcode-manager.js";
import { openInBrowser } from "../runtime-stack/server/browser.js";
import { pickDirectoryPathFromSystemDialog } from "../runtime-stack/server/directory-picker.js";
import { terminateProcessForTimeout } from "../runtime-stack/server/process-termination.js";
import { createRuntimeServer } from "../runtime-stack/server/runtime-server.js";
import { createRuntimeStateHub } from "../runtime-stack/server/runtime-state-hub.js";
import { resolveInteractiveShellCommand } from "../runtime-stack/server/shell.js";
import { shutdownRuntimeServer } from "../runtime-stack/server/shutdown-coordinator.js";
import {
	collectProjectWorktreeTaskIdsForRemoval,
	createWorkspaceRegistry,
} from "../runtime-stack/server/workspace-registry.js";
import { resolveProjectInputPath } from "../projects/project-path.js";

function resolveWorkspaceBridgeModuleUrl() {
	const fromEnv = process.env.CHANGEYARD_WORKSPACE_BRIDGE;
	if (fromEnv) {
		return fromEnv.startsWith("file:") ? fromEnv : pathToFileURL(fromEnv).href;
	}
	const candidates = [
		new URL("../../../../src/workspace/runtimeBridge.ts", import.meta.url),
		new URL("../../../../dist/src/workspace/runtimeBridge.js", import.meta.url),
	];
	for (const url of candidates) {
		if (existsSync(fileURLToPath(url))) {
			return url.href;
		}
	}
	return candidates[1].href;
}

const WORKSPACE_RUNTIME_BRIDGE_MODULE_URL = resolveWorkspaceBridgeModuleUrl();

async function assertPathIsDirectory(targetPath) {
	const info = await stat(targetPath);
	if (!info.isDirectory()) {
		throw new Error(`Project path is not a directory: ${targetPath}`);
	}
}

async function pathIsDirectory(targetPath) {
	try {
		const info = await stat(targetPath);
		return info.isDirectory();
	} catch {
		return false;
	}
}

function detectWorkspaceRepositoryKindFallback(targetPath) {
	const jjResult = spawnSync("jj", ["workspace", "root"], {
		cwd: targetPath,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "ignore"],
		env: process.env,
	});
	if (jjResult.status === 0) {
		return "jj";
	}

	const result = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
		cwd: targetPath,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "ignore"],
		env: createGitProcessEnv(),
	});
	if (result.status === 0 && result.stdout.trim() === "true") {
		return "git";
	}

	return null;
}

function hasWorkspaceRepositoryFallback(targetPath) {
	return detectWorkspaceRepositoryKindFallback(targetPath) !== null;
}

async function loadWorkspaceRuntimeBridge() {
	try {
		return await import(WORKSPACE_RUNTIME_BRIDGE_MODULE_URL.href);
	} catch {
		return {
			detectWorkspaceRepositoryKind: detectWorkspaceRepositoryKindFallback,
			hasWorkspaceRepository: hasWorkspaceRepositoryFallback,
		};
	}
}

async function isPortAvailable(port, host) {
	return await new Promise((resolve) => {
		const probe = createNetServer();
		probe.once("error", () => {
			resolve(false);
		});
		probe.listen(port, host, () => {
			probe.close(() => {
				resolve(true);
			});
		});
	});
}

async function findAvailableRuntimePort(startPort, host) {
	for (let candidate = startPort; candidate <= 65535; candidate += 1) {
		if (await isPortAvailable(candidate, host)) {
			return candidate;
		}
	}
	throw new Error("No available runtime port found.");
}

async function runScopedCommand(command, cwd) {
	const startedAt = Date.now();
	const outputLimitBytes = 64 * 1024;

	return await new Promise((resolve, reject) => {
		const child = spawn(command, {
			cwd,
			shell: true,
			env: process.env,
			stdio: ["ignore", "pipe", "pipe"],
		});

		if (!child.stdout || !child.stderr) {
			reject(new Error("Shortcut process did not expose stdout/stderr."));
			return;
		}

		let stdout = "";
		let stderr = "";

		const appendOutput = (current, chunk) => {
			const next = current + chunk;
			if (next.length <= outputLimitBytes) {
				return next;
			}
			return next.slice(0, outputLimitBytes);
		};

		child.stdout.on("data", (chunk) => {
			stdout = appendOutput(stdout, String(chunk));
		});

		child.stderr.on("data", (chunk) => {
			stderr = appendOutput(stderr, String(chunk));
		});

		child.on("error", (error) => {
			reject(error);
		});

		const timeout = setTimeout(() => {
			terminateProcessForTimeout(child);
		}, 60_000);

		child.on("close", (code) => {
			clearTimeout(timeout);
			const exitCode = typeof code === "number" ? code : 1;
			const trimmedStdout = stdout.trim();
			const trimmedStderr = stderr.trim();
			resolve({
				exitCode,
				stdout: trimmedStdout,
				stderr: trimmedStderr,
				combinedOutput: [trimmedStdout, trimmedStderr].filter(Boolean).join("\n"),
				durationMs: Date.now() - startedAt,
			});
		});
	});
}

function warn(message) {
	console.warn(`[changeyard] ${message}`);
}

export async function startChangeyardRuntime(options) {
	const host = options.host ?? DEFAULT_KANBAN_RUNTIME_HOST;
	const port =
		options.port === undefined || options.port === "auto"
			? await findAvailableRuntimePort(DEFAULT_KANBAN_RUNTIME_PORT, host)
			: options.port;

	setKanbanRuntimeHost(host);
	setKanbanRuntimePort(port);

	if (isKanbanRemoteHost()) {
		const passcode = generatePasscode();
		generateInternalToken();
		console.log(`\nRemote access passcode: ${passcode}\n`);
	} else {
		disablePasscode();
	}

	const { detectWorkspaceRepositoryKind, hasWorkspaceRepository } = await loadWorkspaceRuntimeBridge();

	let runtimeStateHub;
	const workspaceRegistry = await createWorkspaceRegistry({
		cwd: options.repoRoot,
		loadGlobalRuntimeConfig,
		loadRuntimeConfig,
		hasWorkspaceRepository,
		pathIsDirectory,
		onTerminalManagerReady: (workspaceId, manager) => {
			runtimeStateHub?.trackTerminalManager(workspaceId, manager);
		},
	});

	runtimeStateHub = createRuntimeStateHub({
		workspaceRegistry,
	});

	for (const { workspaceId, terminalManager } of workspaceRegistry.listManagedWorkspaces()) {
		runtimeStateHub.trackTerminalManager(workspaceId, terminalManager);
	}

	const disposeTrackedWorkspace = (workspaceId, disposeOptions) => {
		const disposed = workspaceRegistry.disposeWorkspace(workspaceId, {
			stopTerminalSessions: disposeOptions?.stopTerminalSessions,
		});
		runtimeStateHub.disposeWorkspace(workspaceId);
		return disposed;
	};

	const currentVersion = packageJson.version;
	const runtimeServer = await createRuntimeServer({
		workspaceRegistry,
		runtimeStateHub,
		changeyardApi: options.changeyardApi ?? null,
		fallbackWorkspacePath: options.repoRoot,
		serveWebAssets: options.serveWebAssets ?? options.mode === "web",
		warn,
		ensureTerminalManagerForWorkspace: workspaceRegistry.ensureTerminalManagerForWorkspace,
		resolveInteractiveShellCommand,
		runCommand: runScopedCommand,
		resolveProjectInputPath,
		assertPathIsDirectory,
		hasWorkspaceRepository,
		detectWorkspaceRepositoryKind,
		disposeWorkspace: disposeTrackedWorkspace,
		collectProjectWorktreeTaskIdsForRemoval,
		pickDirectoryPathFromSystemDialog,
		getUpdateStatus: () => ({
			currentVersion,
			latestVersion: null,
			updateAvailable: false,
			updateTiming: null,
			installCommand: null,
		}),
		runUpdateNow: async () => ({
			status: "unsupported_installation",
			currentVersion,
			latestVersion: null,
			message: `Runtime update is not configured for ${packageJson.name}.`,
		}),
		requestRestart: options.requestRestart,
	});

	let shutdownPromise = null;
	const close = async () => {
		shutdownPromise ??= (async () => {
			await shutdownRuntimeServer({
				workspaceRegistry,
				warn,
				closeRuntimeServer: () => runtimeServer.close(),
			});
		})();
		return await shutdownPromise;
	};

	if (options.openBrowser) {
		const openUrl = options.openPath ? new URL(options.openPath, runtimeServer.url).toString() : runtimeServer.url;
		openInBrowser(openUrl, { warn });
	}

	return {
		url: runtimeServer.url,
		close,
	};
}

export async function startChangeyardKanban(options) {
	return await startChangeyardRuntime({
		...options,
		mode: "web",
		serveWebAssets: true,
		openBrowser: options.open ?? true,
		openPath: options.openPath,
	});
}
