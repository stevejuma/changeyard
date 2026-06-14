import { spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import open from "open";
import path from "node:path";
import { repoAppStatePath } from "../app-state.js";
import { loadConfig } from "../config/loadConfig.js";
import { storageRoot } from "../paths.js";
import { findRepoRoot } from "../config/loadConfig.js";
import { installCliShutdownHandlers } from "./gracefulShutdown.js";
import { startUiRuntime } from "./ui.js";

const MANAGED_HUB_ENV = "CHANGEYARD_MANAGED_HUB";
const WAIT_FOR_PID_ENV = "CHANGEYARD_HUB_WAIT_FOR_PID";

export type HubCommandOptions = {
	host?: string;
	port?: number | "auto";
	open?: boolean;
	project?: string;
};

export type HubServerRecord = {
	pid: number;
	url: string;
	repoRoot: string;
	startedAt: string;
	logPath: string;
	host?: string;
	port?: number | "auto";
};

export type HubServerStatus = {
	running: boolean;
	stale: boolean;
	pid: number | null;
	url: string | null;
	repoRoot: string;
	startedAt: string | null;
	logPath: string;
	statePath: string;
};

type RecordSource = "hub" | "dashboard";

type ReadHubRecord = {
	record: HubServerRecord;
	source: RecordSource;
};

function hubStatePath(repoRoot: string): string {
	return repoAppStatePath(repoRoot, "hub", "hub-server.json");
}

function hubLogPath(repoRoot: string): string {
	return repoAppStatePath(repoRoot, "hub", "hub-server.log");
}

function legacyDashboardStatePath(repoRoot: string): string {
	return path.join(storageRoot(repoRoot, loadConfig(repoRoot)), "dashboard-server.json");
}

function legacyDashboardLogPath(repoRoot: string): string {
	return path.join(storageRoot(repoRoot, loadConfig(repoRoot)), "dashboard-server.log");
}

function ensureStorageDir(repoRoot: string): void {
	mkdirSync(path.dirname(hubStatePath(repoRoot)), { recursive: true });
}

function readRecordAt(repoRoot: string, statePath: string, defaultLogPath: string): HubServerRecord | null {
	if (!existsSync(statePath)) {
		return null;
	}
	try {
		const parsed = JSON.parse(readFileSync(statePath, "utf8")) as Partial<HubServerRecord>;
		if (typeof parsed.pid !== "number" || typeof parsed.url !== "string" || typeof parsed.startedAt !== "string") {
			return null;
		}
		return {
			pid: parsed.pid,
			url: parsed.url,
			startedAt: parsed.startedAt,
			repoRoot: typeof parsed.repoRoot === "string" ? parsed.repoRoot : repoRoot,
			logPath: typeof parsed.logPath === "string" ? parsed.logPath : defaultLogPath,
			host: parsed.host,
			port: parsed.port,
		};
	} catch {
		return null;
	}
}

function readRecord(repoRoot: string): ReadHubRecord | null {
	const record = readRecordAt(repoRoot, hubStatePath(repoRoot), hubLogPath(repoRoot));
	if (record) {
		return { record, source: "hub" };
	}
	const legacyRecord = readRecordAt(repoRoot, legacyDashboardStatePath(repoRoot), legacyDashboardLogPath(repoRoot));
	if (legacyRecord) {
		return { record: legacyRecord, source: "dashboard" };
	}
	return null;
}

function writeRecord(repoRoot: string, record: HubServerRecord): void {
	ensureStorageDir(repoRoot);
	writeFileSync(hubStatePath(repoRoot), `${JSON.stringify(record, null, 2)}\n`);
}

function removeRecord(repoRoot: string, source?: RecordSource): void {
	if (!source || source === "hub") {
		rmSync(hubStatePath(repoRoot), { force: true });
	}
	if (!source || source === "dashboard") {
		rmSync(legacyDashboardStatePath(repoRoot), { force: true });
	}
}

function isProcessRunning(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
		return code === "EPERM";
	}
}

function statusFromRecord(repoRoot: string, read: ReadHubRecord | null): HubServerStatus {
	const record = read?.record ?? null;
	const logPath = record?.logPath ?? hubLogPath(repoRoot);
	const running = record !== null ? isProcessRunning(record.pid) : false;
	return {
		running,
		stale: Boolean(record && !running),
		pid: record?.pid ?? null,
		url: record?.url ?? null,
		repoRoot,
		startedAt: record?.startedAt ?? null,
		logPath,
		statePath: hubStatePath(repoRoot),
	};
}

function formatStatus(status: HubServerStatus): string {
	if (status.running) {
		return [
			"hub: running",
			`pid: ${status.pid}`,
			`url: ${status.url}`,
			`repoRoot: ${status.repoRoot}`,
			`startedAt: ${status.startedAt}`,
			`log: ${status.logPath}`,
		].join("\n");
	}
	if (status.stale) {
		return [
			"hub: stopped (stale pid file)",
			`pid: ${status.pid}`,
			`lastUrl: ${status.url}`,
			`repoRoot: ${status.repoRoot}`,
			`state: ${status.statePath}`,
		].join("\n");
	}
	return ["hub: stopped", `repoRoot: ${status.repoRoot}`, `state: ${status.statePath}`].join("\n");
}

function currentCliArgs(): string[] {
	const cliPath = process.argv[1];
	if (!cliPath) {
		throw new Error("Could not determine current CLI entrypoint.");
	}
	return [...process.execArgv, cliPath];
}

function hubRunArgs(options: HubCommandOptions): string[] {
	const args = ["hub", "run", "--project", options.project ?? process.cwd()];
	if (options.host) {
		args.push("--host", options.host);
	}
	if (options.port !== undefined) {
		args.push("--port", String(options.port));
	}
	if (options.open === false) {
		args.push("--no-open");
	} else if (options.open === true) {
		args.push("--open");
	}
	return args;
}

function routeUrl(baseUrl: string, openPath: "/" | "/kanban" | "/vcs"): string {
	return new URL(openPath, baseUrl).toString();
}

async function openBrowser(url: string): Promise<void> {
	await open(url, { wait: false });
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function readStartedUrl(logPath: string): string | null {
	if (!existsSync(logPath)) {
		return null;
	}
	const log = readFileSync(logPath, "utf8");
	return /Changeyard UI running at (https?:\/\/\S+)/.exec(log)?.[1] ?? null;
}

async function waitForStartedUrl(logPath: string, timeoutMs = 8000): Promise<string | null> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const url = readStartedUrl(logPath);
		if (url) {
			return url;
		}
		await sleep(100);
	}
	return null;
}

async function waitForPidToExit(pid: number, timeoutMs = 25_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (!isProcessRunning(pid)) {
			return;
		}
		await sleep(100);
	}
}

async function waitForRestartParentIfNeeded(): Promise<void> {
	const rawPid = process.env[WAIT_FOR_PID_ENV]?.trim();
	if (!rawPid) {
		return;
	}
	const pid = Number(rawPid);
	if (!Number.isInteger(pid) || pid <= 0) {
		return;
	}
	await waitForPidToExit(pid);
}

export function getHubStatus(repoRoot: string): HubServerStatus {
	return statusFromRecord(repoRoot, readRecord(repoRoot));
}

export function runHubStatus(repoRoot: string): string {
	return formatStatus(getHubStatus(repoRoot));
}

export async function runHubStart(repoRoot: string, options: HubCommandOptions = {}): Promise<string> {
	const existing = statusFromRecord(repoRoot, readRecord(repoRoot));
	if (existing.running) {
		return `hub already running at ${existing.url}`;
	}
	if (existing.stale) {
		removeRecord(repoRoot);
	}

	ensureStorageDir(repoRoot);
	const logPath = hubLogPath(repoRoot);
	writeFileSync(logPath, "");
	mkdirSync(path.dirname(logPath), { recursive: true });
	const logFd = openSync(logPath, "a");
	const child = spawn(process.execPath, [...currentCliArgs(), ...hubRunArgs({ ...options, project: repoRoot })], {
		cwd: repoRoot,
		detached: true,
		stdio: ["ignore", logFd, logFd],
		env: { ...process.env, [MANAGED_HUB_ENV]: "1" },
	});
	closeSync(logFd);
	child.unref();

	const url = await waitForStartedUrl(logPath);
	if (!url) {
		throw new Error(`Hub did not report a startup URL. See log: ${logPath}`);
	}

	const record: HubServerRecord = {
		pid: child.pid ?? 0,
		url,
		repoRoot,
		startedAt: new Date().toISOString(),
		logPath,
		host: options.host,
		port: options.port,
	};
	writeRecord(repoRoot, record);
	return `hub started at ${url}`;
}

export async function runHubStop(repoRoot: string): Promise<string> {
	const read = readRecord(repoRoot);
	const status = statusFromRecord(repoRoot, read);
	if (!read) {
		return "hub already stopped";
	}
	if (!status.running) {
		removeRecord(repoRoot, read.source);
		return "hub stopped (removed stale pid file)";
	}

	process.kill(read.record.pid, "SIGTERM");
	const deadline = Date.now() + 16_000;
	while (Date.now() < deadline) {
		if (!isProcessRunning(read.record.pid)) {
			removeRecord(repoRoot, read.source);
			return "hub stopped";
		}
		await sleep(100);
	}
	await sleep(1000);
	if (!isProcessRunning(read.record.pid)) {
		removeRecord(repoRoot, read.source);
		return "hub stopped";
	}
	return `hub stop requested, but pid ${read.record.pid} is still running`;
}

export async function runHubRestart(repoRoot: string, options: HubCommandOptions = {}): Promise<string> {
	await runHubStop(repoRoot);
	const started = await runHubStart(repoRoot, options);
	return started.replace(/^hub started/, "hub restarted");
}

export async function ensureHubServer(repoRoot: string, options: HubCommandOptions = {}): Promise<HubServerStatus> {
	const status = getHubStatus(repoRoot);
	if (status.running) {
		return status;
	}
	await runHubStart(repoRoot, { ...options, open: false });
	return getHubStatus(repoRoot);
}

export async function runHubOpen(
	repoRoot: string,
	options: HubCommandOptions = {},
	openPath: "/" | "/kanban" | "/vcs" = "/",
): Promise<string> {
	const status = await ensureHubServer(repoRoot, options);
	if (!status.url) {
		throw new Error("Hub did not report a URL.");
	}
	const url = routeUrl(status.url, openPath);
	if (options.open !== false) {
		await openBrowser(url);
	}
	return `hub running at ${url}`;
}

async function requestManagedHubRestart(repoRoot: string, options: HubCommandOptions): Promise<{
	ok: boolean;
	message: string;
}> {
	if (process.env[MANAGED_HUB_ENV] !== "1") {
		return {
			ok: false,
			message: "Hub restart is only available for managed hub processes. Start this runtime with `cy hub start`.",
		};
	}
	const logPath = hubLogPath(repoRoot);
	mkdirSync(path.dirname(logPath), { recursive: true });
	const logFd = openSync(logPath, "a");
	const child = spawn(process.execPath, [...currentCliArgs(), ...hubRunArgs({ ...options, project: repoRoot, open: false })], {
		cwd: repoRoot,
		detached: true,
		stdio: ["ignore", logFd, logFd],
		env: {
			...process.env,
			[MANAGED_HUB_ENV]: "1",
			[WAIT_FOR_PID_ENV]: String(process.pid),
		},
	});
	closeSync(logFd);
	child.unref();
	setTimeout(() => {
		process.kill(process.pid, "SIGTERM");
	}, 100).unref();
	return { ok: true, message: "Restarting Changeyard hub." };
}

export async function runHubForeground(repoRoot: string, options: HubCommandOptions = {}): Promise<string> {
	await waitForRestartParentIfNeeded();
	const started = await startUiRuntime({
		...options,
		project: repoRoot,
		openPath: "/",
		restartHub: () => requestManagedHubRestart(repoRoot, options),
	}, process.cwd());
	if (process.env[MANAGED_HUB_ENV] === "1") {
		writeRecord(repoRoot, {
			pid: process.pid,
			url: routeUrl(started.server.url, "/"),
			repoRoot,
			startedAt: new Date().toISOString(),
			logPath: hubLogPath(repoRoot),
			host: options.host,
			port: options.port,
		});
	}

	installCliShutdownHandlers({
		close: () => started.server.close(),
		onError: (signal, error) => {
			const message = error instanceof Error ? error.message : String(error);
			process.stderr.write(`Failed to shut down Changeyard hub cleanly after ${signal}: ${message}\n`);
		},
		onTimeout: (signal) => {
			process.stderr.write(`Timed out shutting down Changeyard hub after ${signal ?? "shutdown"}.\n`);
		},
	});

	return `Changeyard UI running at ${routeUrl(started.server.url, "/")}`;
}

export function resolveHubRepoRoot(options: HubCommandOptions, cwd = process.cwd()): string {
	return findRepoRoot(options.project ?? cwd);
}
