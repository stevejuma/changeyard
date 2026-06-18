#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(__dirname, "..");
const repoRoot = resolve(desktopRoot, "..", "..");
const webUiDir = resolve(repoRoot, "packages/kanban/web-ui");

const useVite = process.argv.includes("--vite");
const extraArgs = process.argv.filter((arg) => arg !== "--vite");

const runtimeHost = process.env.KANBAN_RUNTIME_HOST?.trim() || "127.0.0.1";
const runtimePort = process.env.KANBAN_RUNTIME_PORT?.trim() || "3484";
const webUiPort = process.env.KANBAN_WEB_UI_PORT?.trim() || "4173";
const viteUrl = `http://${runtimeHost}:${webUiPort}`;
const frontendUrl = useVite
	? (process.env.CHANGEYARD_DESKTOP_WEB_UI_URL?.trim() || viteUrl)
	: null;
const pnpmBinary = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const primaryMainPath = resolve(desktopRoot, "dist", "main.js");
const fallbackMainPath = resolve(desktopRoot, "dist", "src", "main.js");

const managedChildren = new Set();
let isShuttingDown = false;

function registerChild(child) {
	managedChildren.add(child);
	const prune = () => managedChildren.delete(child);
	child.once("exit", prune);
	child.once("close", prune);
	return child;
}

function isAlive(child) {
	return child.exitCode === null && !child.killed;
}

function terminateChildren(signal = "SIGTERM") {
	for (const child of [...managedChildren]) {
		if (!isAlive(child)) continue;
		try {
			child.kill(signal);
		} catch {
			/* ignore */
		}
	}
}

async function waitForVite() {
	const deadline = Date.now() + 30_000;
	let viteProcess;
	for (const child of managedChildren) {
		if (child.spawnfile === pnpmBinary && child.spawnargs.includes("dev")) {
			viteProcess = child;
			break;
		}
	}
	if (!viteProcess) {
		throw new Error("Vite process missing while waiting for startup.");
	}

	while (Date.now() < deadline) {
		if (!isAlive(viteProcess)) {
			throw new Error(
				`Vite exited before becoming ready (code=${viteProcess.exitCode ?? "unknown"}).`,
			);
		}

		try {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), 1_000);
			const response = await fetch(viteUrl, { signal: controller.signal });
			clearTimeout(timeout);
			response.body?.cancel();
			if (response.ok || response.status === 404) {
				return;
			}
		} catch {
			/* ignored while Vite starts */
		}

		await delay(250);
	}

	throw new Error(`Timed out waiting for Vite at ${viteUrl} to become reachable.`);
}

function launchVite() {
	const viteEnv = {
		...process.env,
		KANBAN_RUNTIME_HOST: runtimeHost,
		KANBAN_RUNTIME_PORT: runtimePort,
		KANBAN_WEB_UI_PORT: webUiPort,
	};

	return registerChild(
		spawn(pnpmBinary, ["--dir", webUiDir, "run", "dev"], {
			cwd: webUiDir,
			env: viteEnv,
			stdio: "inherit",
		}),
	);
}

function resolveMainPath() {
	if (existsSync(primaryMainPath)) return primaryMainPath;
	if (existsSync(fallbackMainPath)) return fallbackMainPath;

	throw new Error("Unable to locate Electron main bundle. Expected dist/main.js or dist/src/main.js.");
}

function launchElectron(extraEnv = {}) {
	// Resolve the Electron binary from the local node_modules.
	const require = createRequire(import.meta.url);
	const electronPath = require("electron");

	// Build a sanitised environment — delete the flag that would force
	// Electron into "run-as-node" mode.
	const env = { ...process.env, ...extraEnv };
	delete env.ELECTRON_RUN_AS_NODE;

	const child = registerChild(
		spawn(electronPath, [resolveMainPath(), ...extraArgs], {
			stdio: "inherit",
			env,
			cwd: desktopRoot,
		}),
	);

	child.on("error", (err) => {
		console.error(
			`Failed to launch Electron at ${electronPath}:`,
			err instanceof Error ? err.message : err,
		);
		process.exit(1);
	});

	child.on("close", (code, signal) => {
		if (isShuttingDown) return;
		isShuttingDown = true;
		terminateChildren("SIGTERM");
		if (code !== null) {
			process.exit(code);
			return;
		}
		if (signal) {
			process.removeAllListeners("SIGINT");
			process.removeAllListeners("SIGTERM");
			process.kill(process.pid, signal);
			return;
		}
		process.exit(1);
	});
}

async function run() {
	for (const sig of ["SIGINT", "SIGTERM"]) {
		process.on(sig, () => {
			if (isShuttingDown) return;
			isShuttingDown = true;
			terminateChildren(sig);
			process.exit(sig === "SIGINT" ? 130 : 143);
		});
	}

	if (useVite) {
		launchVite();
		await waitForVite();
	}

	launchElectron({
		...(useVite && frontendUrl
			? { CHANGEYARD_DESKTOP_WEB_UI_URL: frontendUrl }
			: {}),
	});
}

void run();
