import { spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadConfig } from "../config/loadConfig.js";
import { storageRoot } from "../paths.js";

export type DashboardCommandOptions = {
	host?: string;
	port?: number | "auto";
	open?: boolean;
	project?: string;
};

export type DashboardServerRecord = {
	pid: number;
	url: string;
	repoRoot: string;
	startedAt: string;
	logPath: string;
	host?: string;
	port?: number | "auto";
};

export type DashboardServerStatus = {
	running: boolean;
	stale: boolean;
	pid: number | null;
	url: string | null;
	repoRoot: string;
	startedAt: string | null;
	logPath: string;
	statePath: string;
};

function dashboardStatePath(repoRoot: string): string {
	return path.join(storageRoot(repoRoot, loadConfig(repoRoot)), "dashboard-server.json");
}

function dashboardLogPath(repoRoot: string): string {
	return path.join(storageRoot(repoRoot, loadConfig(repoRoot)), "dashboard-server.log");
}

function ensureStorageDir(repoRoot: string): void {
	mkdirSync(storageRoot(repoRoot, loadConfig(repoRoot)), { recursive: true });
}

function readRecord(repoRoot: string): DashboardServerRecord | null {
	const statePath = dashboardStatePath(repoRoot);
	if (!existsSync(statePath)) {
		return null;
	}
	try {
		const parsed = JSON.parse(readFileSync(statePath, "utf8")) as Partial<DashboardServerRecord>;
		if (typeof parsed.pid !== "number" || typeof parsed.url !== "string" || typeof parsed.startedAt !== "string") {
			return null;
		}
		return {
			pid: parsed.pid,
			url: parsed.url,
			startedAt: parsed.startedAt,
			repoRoot: typeof parsed.repoRoot === "string" ? parsed.repoRoot : repoRoot,
			logPath: typeof parsed.logPath === "string" ? parsed.logPath : dashboardLogPath(repoRoot),
			host: parsed.host,
			port: parsed.port,
		};
	} catch {
		return null;
	}
}

function writeRecord(repoRoot: string, record: DashboardServerRecord): void {
	ensureStorageDir(repoRoot);
	writeFileSync(dashboardStatePath(repoRoot), `${JSON.stringify(record, null, 2)}\n`);
}

function removeRecord(repoRoot: string): void {
	rmSync(dashboardStatePath(repoRoot), { force: true });
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

function statusFromRecord(repoRoot: string, record: DashboardServerRecord | null): DashboardServerStatus {
	const logPath = record?.logPath ?? dashboardLogPath(repoRoot);
	const running = record ? isProcessRunning(record.pid) : false;
	return {
		running,
		stale: Boolean(record && !running),
		pid: record?.pid ?? null,
		url: record?.url ?? null,
		repoRoot,
		startedAt: record?.startedAt ?? null,
		logPath,
		statePath: dashboardStatePath(repoRoot),
	};
}

function formatStatus(status: DashboardServerStatus): string {
	if (status.running) {
		return [
			"dashboard: running",
			`pid: ${status.pid}`,
			`url: ${status.url}`,
			`repoRoot: ${status.repoRoot}`,
			`startedAt: ${status.startedAt}`,
			`log: ${status.logPath}`,
		].join("\n");
	}
	if (status.stale) {
		return [
			"dashboard: stopped (stale pid file)",
			`pid: ${status.pid}`,
			`lastUrl: ${status.url}`,
			`repoRoot: ${status.repoRoot}`,
			`state: ${status.statePath}`,
		].join("\n");
	}
	return ["dashboard: stopped", `repoRoot: ${status.repoRoot}`, `state: ${status.statePath}`].join("\n");
}

function currentCliArgs(): string[] {
	const cliPath = process.argv[1];
	if (!cliPath) {
		throw new Error("Could not determine current CLI entrypoint.");
	}
	return [...process.execArgv, cliPath];
}

function dashboardArgs(options: DashboardCommandOptions): string[] {
	const args = ["dashboard", "--project", options.project ?? process.cwd()];
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

export function getDashboardStatus(repoRoot: string): DashboardServerStatus {
	return statusFromRecord(repoRoot, readRecord(repoRoot));
}

export function runDashboardStatus(repoRoot: string): string {
	return formatStatus(getDashboardStatus(repoRoot));
}

export async function runDashboardStart(repoRoot: string, options: DashboardCommandOptions = {}): Promise<string> {
	const existing = statusFromRecord(repoRoot, readRecord(repoRoot));
	if (existing.running) {
		return `dashboard already running at ${existing.url}`;
	}
	if (existing.stale) {
		removeRecord(repoRoot);
	}

	ensureStorageDir(repoRoot);
	const logPath = dashboardLogPath(repoRoot);
	writeFileSync(logPath, "");
	mkdirSync(path.dirname(logPath), { recursive: true });
	const logFd = openSync(logPath, "a");
	const child = spawn(process.execPath, [...currentCliArgs(), ...dashboardArgs({ ...options, project: repoRoot })], {
		cwd: repoRoot,
		detached: true,
		stdio: ["ignore", logFd, logFd],
		env: process.env,
	});
	closeSync(logFd);
	child.unref();

	const url = await waitForStartedUrl(logPath);
	if (!url) {
		throw new Error(`Dashboard did not report a startup URL. See log: ${logPath}`);
	}

	const record: DashboardServerRecord = {
		pid: child.pid ?? 0,
		url,
		repoRoot,
		startedAt: new Date().toISOString(),
		logPath,
		host: options.host,
		port: options.port,
	};
	writeRecord(repoRoot, record);
	return `dashboard started at ${url}`;
}

export async function runDashboardStop(repoRoot: string): Promise<string> {
	const record = readRecord(repoRoot);
	const status = statusFromRecord(repoRoot, record);
	if (!record) {
		return "dashboard already stopped";
	}
	if (!status.running) {
		removeRecord(repoRoot);
		return "dashboard stopped (removed stale pid file)";
	}

	process.kill(record.pid, "SIGTERM");
	const deadline = Date.now() + 16_000;
	while (Date.now() < deadline) {
		if (!isProcessRunning(record.pid)) {
			removeRecord(repoRoot);
			return "dashboard stopped";
		}
		await sleep(100);
	}
	await sleep(1000);
	if (!isProcessRunning(record.pid)) {
		removeRecord(repoRoot);
		return "dashboard stopped";
	}
	return `dashboard stop requested, but pid ${record.pid} is still running`;
}
