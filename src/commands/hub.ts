import { spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import open from "open";
import path from "node:path";
import { changeyardAppStatePath, repoAppStatePath } from "../app-state.js";
import { loadConfig } from "../config/loadConfig.js";
import { storageRoot } from "../paths.js";
import { findRepoRoot } from "../config/loadConfig.js";
import { installCliShutdownHandlers } from "./gracefulShutdown.js";
import { startUiRuntime } from "./ui.js";

const MANAGED_HUB_ENV = "CHANGEYARD_MANAGED_HUB";
const HUB_STARTED_BY_ENV = "CHANGEYARD_HUB_STARTED_BY";
const HUB_LOG_PATH_ENV = "CHANGEYARD_HUB_LOG_PATH";
const WAIT_FOR_PID_ENV = "CHANGEYARD_HUB_WAIT_FOR_PID";
const DEFAULT_HUB_HOST = "127.0.0.1";
const DEFAULT_HUB_PORT = 3484;
const STARTUP_LOCK_STALE_MS = 30_000;

export type HubCommandOptions = {
	host?: string;
	port?: number | "auto";
	open?: boolean;
	project?: string;
	startedBy?: string;
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

export type HubInstanceRecord = HubServerRecord & {
	id: string;
	updatedAt: string;
	startedBy: string;
	startedFromCwd: string;
	argv: string[];
	managed: boolean;
	active: boolean;
	endpointKey: string;
};

export type HubInstanceSource = "registry" | "legacy-hub" | "legacy-dashboard";

export type HubInstanceStatus = HubInstanceRecord & {
	running: boolean;
	stale: boolean;
	current: boolean;
	source: HubInstanceSource;
	statePath: string;
};

export type HubInstancesSnapshot = {
	statePath: string;
	activeInstanceId: string | null;
	currentPid: number;
	instances: HubInstanceStatus[];
};

export type HubKillResponse = {
	ok: boolean;
	message: string;
	killed: string[];
	removed: string[];
	instances: HubInstanceStatus[];
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
	id: string | null;
	active: boolean;
	current: boolean;
	source: HubInstanceSource | null;
};

type LegacyRecordSource = "hub" | "dashboard";

type ReadLegacyHubRecord = {
	record: HubServerRecord;
	source: LegacyRecordSource;
	statePath: string;
};

type HubRegistryFile = {
	version: 1;
	activeInstanceId: string | null;
	instances: HubInstanceRecord[];
};

function globalHubDir(): string {
	return changeyardAppStatePath("hub");
}

export function hubRegistryPath(): string {
	return changeyardAppStatePath("hub", "instances.json");
}

function safeFileSegment(value: string): string {
	return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "hub";
}

function globalHubLogPath(label: string): string {
	return changeyardAppStatePath("hub", "logs", `${safeFileSegment(label)}.log`);
}

function legacyHubStatePath(repoRoot: string): string {
	return repoAppStatePath(repoRoot, "hub", "hub-server.json");
}

function legacyHubLogPath(repoRoot: string): string {
	return repoAppStatePath(repoRoot, "hub", "hub-server.log");
}

function legacyDashboardStatePath(repoRoot: string): string {
	return path.join(storageRoot(repoRoot, loadConfig(repoRoot)), "dashboard-server.json");
}

function legacyDashboardLogPath(repoRoot: string): string {
	return path.join(storageRoot(repoRoot, loadConfig(repoRoot)), "dashboard-server.log");
}

function ensureGlobalHubDir(): void {
	mkdirSync(globalHubDir(), { recursive: true });
	mkdirSync(path.dirname(globalHubLogPath("default")), { recursive: true });
}

function readLegacyRecordAt(repoRoot: string, statePath: string, defaultLogPath: string): HubServerRecord | null {
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

function readLegacyRecord(repoRoot: string): ReadLegacyHubRecord | null {
	const hubStatePath = legacyHubStatePath(repoRoot);
	const record = readLegacyRecordAt(repoRoot, hubStatePath, legacyHubLogPath(repoRoot));
	if (record) {
		return { record, source: "hub", statePath: hubStatePath };
	}
	const dashboardStatePath = legacyDashboardStatePath(repoRoot);
	const legacyRecord = readLegacyRecordAt(repoRoot, dashboardStatePath, legacyDashboardLogPath(repoRoot));
	if (legacyRecord) {
		return { record: legacyRecord, source: "dashboard", statePath: dashboardStatePath };
	}
	return null;
}

function removeLegacyRecord(repoRoot: string, source?: LegacyRecordSource): void {
	if (!source || source === "hub") {
		rmSync(legacyHubStatePath(repoRoot), { force: true });
	}
	if (!source || source === "dashboard") {
		rmSync(legacyDashboardStatePath(repoRoot), { force: true });
	}
}

function normalizePort(value: unknown): number | "auto" | undefined {
	if (value === "auto") {
		return "auto";
	}
	return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function readRegistry(): HubRegistryFile {
	const registryPath = hubRegistryPath();
	if (!existsSync(registryPath)) {
		return { version: 1, activeInstanceId: null, instances: [] };
	}
	try {
		const parsed = JSON.parse(readFileSync(registryPath, "utf8")) as Partial<HubRegistryFile>;
		const instances = Array.isArray(parsed.instances)
			? parsed.instances.flatMap((entry) => normalizeRegistryRecord(entry)).filter((entry): entry is HubInstanceRecord => entry !== null)
			: [];
		const activeInstanceId = typeof parsed.activeInstanceId === "string" ? parsed.activeInstanceId : null;
		return {
			version: 1,
			activeInstanceId,
			instances: instances.map((instance) => ({
				...instance,
				active: instance.id === activeInstanceId,
			})),
		};
	} catch {
		return { version: 1, activeInstanceId: null, instances: [] };
	}
}

function normalizeRegistryRecord(value: unknown): HubInstanceRecord | null {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return null;
	}
	const record = value as Partial<HubInstanceRecord>;
	if (
		typeof record.id !== "string" ||
		typeof record.pid !== "number" ||
		typeof record.url !== "string" ||
		typeof record.repoRoot !== "string" ||
		typeof record.startedAt !== "string" ||
		typeof record.logPath !== "string"
	) {
		return null;
	}
	const endpointKey = typeof record.endpointKey === "string" ? record.endpointKey : endpointKeyFromUrl(record.url);
	return {
		id: record.id,
		pid: record.pid,
		url: record.url,
		repoRoot: record.repoRoot,
		startedAt: record.startedAt,
		updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : record.startedAt,
		logPath: record.logPath,
		host: typeof record.host === "string" ? record.host : hostFromUrl(record.url),
		port: normalizePort(record.port) ?? portFromUrl(record.url),
		startedBy: typeof record.startedBy === "string" ? record.startedBy : "unknown",
		startedFromCwd: typeof record.startedFromCwd === "string" ? record.startedFromCwd : record.repoRoot,
		argv: Array.isArray(record.argv) ? record.argv.filter((entry): entry is string => typeof entry === "string") : [],
		managed: record.managed !== false,
		active: record.active === true,
		endpointKey,
	};
}

function writeRegistry(registry: HubRegistryFile): void {
	ensureGlobalHubDir();
	const activeInstanceId = registry.activeInstanceId;
	const instances = registry.instances.map((instance) => ({
		...instance,
		active: activeInstanceId !== null && instance.id === activeInstanceId,
		updatedAt: instance.updatedAt,
	}));
	writeFileSync(hubRegistryPath(), `${JSON.stringify({ version: 1, activeInstanceId, instances }, null, 2)}\n`);
}

function startupLockDir(): string {
	return changeyardAppStatePath("hub", "startup.lock");
}

function readLockAgeMs(lockDir: string): number | null {
	try {
		const raw = JSON.parse(readFileSync(path.join(lockDir, "owner.json"), "utf8")) as { acquiredAt?: unknown };
		if (typeof raw.acquiredAt !== "string") {
			return null;
		}
		const acquiredAt = Date.parse(raw.acquiredAt);
		return Number.isFinite(acquiredAt) ? Date.now() - acquiredAt : null;
	} catch {
		return null;
	}
}

async function withStartupLock<T>(fn: () => Promise<T>): Promise<T> {
	ensureGlobalHubDir();
	const lockDir = startupLockDir();
	const deadline = Date.now() + STARTUP_LOCK_STALE_MS;
	while (Date.now() < deadline) {
		try {
			mkdirSync(lockDir);
			writeFileSync(path.join(lockDir, "owner.json"), `${JSON.stringify({
				pid: process.pid,
				acquiredAt: new Date().toISOString(),
			}, null, 2)}\n`);
			try {
				return await fn();
			} finally {
				rmSync(lockDir, { recursive: true, force: true });
			}
		} catch (error) {
			const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
			if (code !== "EEXIST") {
				throw error;
			}
			const age = readLockAgeMs(lockDir);
			if (age === null || age > STARTUP_LOCK_STALE_MS) {
				rmSync(lockDir, { recursive: true, force: true });
				continue;
			}
			await sleep(100);
		}
	}
	throw new Error(`Timed out waiting for hub startup lock: ${startupLockDir()}`);
}

function isProcessRunning(pid: number): boolean {
	if (!Number.isInteger(pid) || pid <= 0) {
		return false;
	}
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
		return code === "EPERM";
	}
}

function statusFromRecord(
	record: HubInstanceRecord,
	source: HubInstanceSource,
	statePath: string,
	activeInstanceId: string | null,
): HubInstanceStatus {
	const running = isProcessRunning(record.pid);
	return {
		...record,
		active: record.id === activeInstanceId,
		running,
		stale: !running,
		current: record.pid === process.pid,
		source,
		statePath,
	};
}

function legacyStatusFromRecord(read: ReadLegacyHubRecord): HubInstanceStatus {
	const endpointKey = endpointKeyFromUrl(read.record.url);
	const id = `legacy-${read.source}-${read.record.pid}-${safeFileSegment(endpointKey)}`;
	const record: HubInstanceRecord = {
		...read.record,
		id,
		updatedAt: read.record.startedAt,
		startedBy: read.source === "dashboard" ? "legacy dashboard" : "legacy hub",
		startedFromCwd: read.record.repoRoot,
		argv: [],
		managed: true,
		active: false,
		endpointKey,
		host: read.record.host ?? hostFromUrl(read.record.url),
		port: normalizePort(read.record.port) ?? portFromUrl(read.record.url),
	};
	return statusFromRecord(record, read.source === "dashboard" ? "legacy-dashboard" : "legacy-hub", read.statePath, null);
}

function dedupeStatuses(statuses: HubInstanceStatus[]): HubInstanceStatus[] {
	const seen = new Set<string>();
	const deduped: HubInstanceStatus[] = [];
	for (const status of statuses) {
		const key = `${status.pid}:${status.url}`;
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		deduped.push(status);
	}
	return deduped.sort((left, right) => Number(right.active) - Number(left.active) || right.startedAt.localeCompare(left.startedAt));
}

export function getHubInstances(repoRoot: string, options: { pruneStale?: boolean } = {}): HubInstancesSnapshot {
	const registry = readRegistry();
	const registryStatuses = registry.instances.map((record) =>
		statusFromRecord(record, "registry", hubRegistryPath(), registry.activeInstanceId),
	);
	if (options.pruneStale && registryStatuses.some((status) => status.stale)) {
		const liveInstances = registry.instances.filter((record) => isProcessRunning(record.pid));
		const activeInstanceId = liveInstances.some((record) => record.id === registry.activeInstanceId)
			? registry.activeInstanceId
			: liveInstances[0]?.id ?? null;
		writeRegistry({ version: 1, activeInstanceId, instances: liveInstances });
		return getHubInstances(repoRoot, { pruneStale: false });
	}

	const legacy = readLegacyRecord(repoRoot);
	const statuses = dedupeStatuses([
		...registryStatuses,
		...(legacy ? [legacyStatusFromRecord(legacy)] : []),
	]);
	return {
		statePath: hubRegistryPath(),
		activeInstanceId: registry.activeInstanceId,
		currentPid: process.pid,
		instances: statuses,
	};
}

function instanceToServerStatus(repoRoot: string, instance: HubInstanceStatus | null): HubServerStatus {
	if (!instance) {
		return {
			running: false,
			stale: false,
			pid: null,
			url: null,
			repoRoot,
			startedAt: null,
			logPath: globalHubLogPath("default"),
			statePath: hubRegistryPath(),
			id: null,
			active: false,
			current: false,
			source: null,
		};
	}
	return {
		running: instance.running,
		stale: instance.stale,
		pid: instance.pid,
		url: instance.url,
		repoRoot: instance.repoRoot,
		startedAt: instance.startedAt,
		logPath: instance.logPath,
		statePath: instance.statePath,
		id: instance.id,
		active: instance.active,
		current: instance.current,
		source: instance.source,
	};
}

function explicitEndpointRequested(options: HubCommandOptions): boolean {
	return options.host !== undefined || options.port !== undefined;
}

function configuredHost(repoRoot: string, options: HubCommandOptions): string {
	if (options.host) {
		return options.host;
	}
	return loadConfig(repoRoot).ui?.host ?? process.env.KANBAN_RUNTIME_HOST?.trim() ?? DEFAULT_HUB_HOST;
}

function configuredPort(repoRoot: string, options: HubCommandOptions): number | "auto" {
	if (options.port !== undefined) {
		return options.port;
	}
	return loadConfig(repoRoot).ui?.port ?? "auto";
}

function hostFromUrl(url: string): string | undefined {
	try {
		return new URL(url).hostname;
	} catch {
		return undefined;
	}
}

function portFromUrl(url: string): number | undefined {
	try {
		const parsed = new URL(url);
		const port = parsed.port ? Number(parsed.port) : parsed.protocol === "https:" ? 443 : 80;
		return Number.isInteger(port) && port > 0 ? port : undefined;
	} catch {
		return undefined;
	}
}

function endpointKeyFromUrl(url: string): string {
	const host = hostFromUrl(url) ?? "unknown";
	const port = portFromUrl(url) ?? "unknown";
	return `${host}:${port}`;
}

function configuredEndpointLabel(repoRoot: string, options: HubCommandOptions): string {
	const host = configuredHost(repoRoot, options);
	const port = configuredPort(repoRoot, options);
	return `${host}:${port}`;
}

function instanceMatchesRequestedEndpoint(repoRoot: string, instance: HubInstanceStatus, options: HubCommandOptions): boolean {
	if (!explicitEndpointRequested(options)) {
		return instance.active || instance.running;
	}
	const requestedPort = configuredPort(repoRoot, options);
	if (requestedPort === "auto") {
		return false;
	}
	const requestedHost = configuredHost(repoRoot, options);
	return (instance.host ?? hostFromUrl(instance.url)) === requestedHost && instance.port === requestedPort;
}

function reusableInstance(repoRoot: string, options: HubCommandOptions = {}): HubInstanceStatus | null {
	const snapshot = getHubInstances(repoRoot, { pruneStale: true });
	const running = snapshot.instances.filter((instance) => instance.running);
	if (explicitEndpointRequested(options)) {
		return running.find((instance) => instanceMatchesRequestedEndpoint(repoRoot, instance, options)) ?? null;
	}
	return running.find((instance) => instance.active) ?? running[0] ?? null;
}

function upsertInstance(record: HubInstanceRecord, options: { active: boolean }): HubInstanceRecord {
	const registry = readRegistry();
	const now = new Date().toISOString();
	const nextRecord = {
		...record,
		updatedAt: now,
		active: options.active,
	};
	const instances = registry.instances.filter((instance) => instance.id !== nextRecord.id && instance.pid !== nextRecord.pid);
	instances.push(nextRecord);
	writeRegistry({
		version: 1,
		activeInstanceId: options.active ? nextRecord.id : registry.activeInstanceId,
		instances,
	});
	return nextRecord;
}

function removeRegistryInstances(ids: Set<string>): void {
	const registry = readRegistry();
	const instances = registry.instances.filter((instance) => !ids.has(instance.id));
	const activeInstanceId = registry.activeInstanceId && ids.has(registry.activeInstanceId)
		? instances.find((instance) => isProcessRunning(instance.pid))?.id ?? null
		: registry.activeInstanceId;
	writeRegistry({ version: 1, activeInstanceId, instances });
}

function makeInstanceRecord(input: {
	pid: number;
	url: string;
	repoRoot: string;
	logPath: string;
	options: HubCommandOptions;
	startedBy: string;
	managed: boolean;
}): HubInstanceRecord {
	const endpointKey = endpointKeyFromUrl(input.url);
	const now = new Date().toISOString();
	const id = `hub-${input.pid}-${safeFileSegment(endpointKey)}`;
	return {
		id,
		pid: input.pid,
		url: routeUrl(input.url, "/"),
		repoRoot: input.repoRoot,
		startedAt: now,
		updatedAt: now,
		logPath: input.logPath,
		host: hostFromUrl(input.url) ?? input.options.host,
		port: portFromUrl(input.url) ?? input.options.port,
		startedBy: input.startedBy,
		startedFromCwd: process.cwd(),
		argv: [...process.argv],
		managed: input.managed,
		active: true,
		endpointKey,
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
			`active: ${status.active ? "yes" : "no"}`,
			`current: ${status.current ? "yes" : "no"}`,
			`source: ${status.source}`,
			`log: ${status.logPath}`,
			`state: ${status.statePath}`,
		].join("\n");
	}
	if (status.stale) {
		return [
			"hub: stopped (stale pid file)",
			`pid: ${status.pid}`,
			`lastUrl: ${status.url}`,
			`repoRoot: ${status.repoRoot}`,
			`source: ${status.source}`,
			`state: ${status.statePath}`,
		].join("\n");
	}
	return ["hub: stopped", `repoRoot: ${status.repoRoot}`, `state: ${status.statePath}`].join("\n");
}

function formatInstanceLine(instance: HubInstanceStatus): string {
	const markers = [
		instance.running ? "running" : "stale",
		instance.active ? "active" : "",
		instance.current ? "current" : "",
	].filter(Boolean).join(", ");
	return [
		`${instance.active ? "*" : "-"} ${instance.id} (${markers})`,
		`  pid: ${instance.pid}`,
		`  url: ${instance.url}`,
		`  startedBy: ${instance.startedBy}`,
		`  repoRoot: ${instance.repoRoot}`,
		`  startedAt: ${instance.startedAt}`,
		`  log: ${instance.logPath}`,
		`  source: ${instance.source}`,
	].join("\n");
}

function formatInstances(snapshot: HubInstancesSnapshot): string {
	if (snapshot.instances.length === 0) {
		return ["hub instances: none", `state: ${snapshot.statePath}`].join("\n");
	}
	return [
		`hub instances: ${snapshot.instances.length}`,
		`active: ${snapshot.activeInstanceId ?? "none"}`,
		`state: ${snapshot.statePath}`,
		"",
		...snapshot.instances.map(formatInstanceLine),
	].join("\n");
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

function routeUrl(baseUrl: string, openPath: string): string {
	return new URL(openPath, baseUrl).toString();
}

function readTrpcPayloadResult<T>(payload: unknown): T | null {
	if (Array.isArray(payload)) {
		return (payload[0] as { result?: { data?: T } } | undefined)?.result?.data ?? null;
	}
	return (payload as { result?: { data?: T } } | null)?.result?.data ?? null;
}

async function postRuntimeTrpc<T>(baseUrl: string, pathName: string, input: unknown): Promise<T | null> {
	const response = await fetch(new URL(`/api/trpc/${pathName}`, baseUrl), {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(input),
	});
	if (!response.ok) {
		return null;
	}
	return readTrpcPayloadResult<T>(await response.json().catch(() => null));
}

async function ensureRuntimeProject(status: HubServerStatus, repoRoot: string): Promise<string | null> {
	if (!status.running || !status.url) {
		return null;
	}
	const response = await postRuntimeTrpc<{
		ok: boolean;
		project: { id: string } | null;
	}>(
		status.url,
		"projects.add",
		{ path: repoRoot },
	).catch(() => null);
	return response?.ok && response.project?.id ? response.project.id : null;
}

function routeForProject(openPath: "/" | "/kanban" | "/vcs", projectId: string | null): string {
	if (!projectId) {
		return openPath;
	}
	if (openPath === "/kanban") {
		return `/kanban/${encodeURIComponent(projectId)}`;
	}
	if (openPath === "/vcs") {
		return `/vcs?workspaceId=${encodeURIComponent(projectId)}`;
	}
	return openPath;
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

export function getHubStatus(repoRoot: string, options: HubCommandOptions = {}): HubServerStatus {
	const snapshot = getHubInstances(repoRoot);
	const selected = explicitEndpointRequested(options)
		? snapshot.instances.find((instance) => instanceMatchesRequestedEndpoint(repoRoot, instance, options)) ?? null
		: snapshot.instances.find((instance) => instance.active) ?? snapshot.instances.find((instance) => instance.running) ?? snapshot.instances[0] ?? null;
	return instanceToServerStatus(repoRoot, selected);
}

export function runHubStatus(repoRoot: string, options: HubCommandOptions = {}): string {
	return formatStatus(getHubStatus(repoRoot, options));
}

export function runHubList(repoRoot: string): string {
	return formatInstances(getHubInstances(repoRoot));
}

export async function runHubStart(repoRoot: string, options: HubCommandOptions = {}): Promise<string> {
	return await withStartupLock(async () => {
		const existing = reusableInstance(repoRoot, options);
		if (existing) {
			return `hub already running at ${existing.url}`;
		}

		ensureGlobalHubDir();
		const logLabel = explicitEndpointRequested(options) ? configuredEndpointLabel(repoRoot, options) : "default";
		const logPath = globalHubLogPath(logLabel);
		mkdirSync(path.dirname(logPath), { recursive: true });
		writeFileSync(logPath, "");
		const logFd = openSync(logPath, "a");
		const startedBy = options.startedBy ?? "hub start";
		const child = spawn(process.execPath, [...currentCliArgs(), ...hubRunArgs({ ...options, project: repoRoot })], {
			cwd: repoRoot,
			detached: true,
			stdio: ["ignore", logFd, logFd],
			env: {
				...process.env,
				[MANAGED_HUB_ENV]: "1",
				[HUB_STARTED_BY_ENV]: startedBy,
				[HUB_LOG_PATH_ENV]: logPath,
			},
		});
		closeSync(logFd);
		child.unref();

		const url = await waitForStartedUrl(logPath);
		if (!url) {
			throw new Error(`Hub did not report a startup URL. See log: ${logPath}`);
		}
		if (!child.pid) {
			throw new Error("Hub process did not report a pid.");
		}

		const record = makeInstanceRecord({
			pid: child.pid,
			url,
			repoRoot,
			logPath,
			options,
			startedBy,
			managed: true,
		});
		upsertInstance(record, { active: true });
		return `hub started at ${url}`;
	});
}

async function stopInstance(instance: HubInstanceStatus, options: { force?: boolean } = {}): Promise<{ killed: boolean; removed: boolean; message: string }> {
	if (!instance.running) {
		return { killed: false, removed: true, message: "removed stale pid file" };
	}
	const signal = options.force ? "SIGKILL" : "SIGTERM";
	if (instance.pid === process.pid) {
		setTimeout(() => {
			process.kill(process.pid, signal);
		}, 100).unref();
		return { killed: true, removed: true, message: `scheduled ${signal} for current hub` };
	}
	process.kill(instance.pid, signal);
	const deadline = Date.now() + (options.force ? 3000 : 16_000);
	while (Date.now() < deadline) {
		if (!isProcessRunning(instance.pid)) {
			return { killed: true, removed: true, message: "hub stopped" };
		}
		await sleep(100);
	}
	return { killed: true, removed: false, message: `hub stop requested, but pid ${instance.pid} is still running` };
}

export async function killHubInstance(
	repoRoot: string,
	target: string,
	options: { force?: boolean } = {},
): Promise<HubKillResponse> {
	const normalizedTarget = target.trim();
	if (!normalizedTarget) {
		throw new Error("Missing hub instance id, pid, `stale`, or `all`.");
	}
	const snapshot = getHubInstances(repoRoot);
	const matches = normalizedTarget === "all"
		? snapshot.instances
		: normalizedTarget === "stale"
			? snapshot.instances.filter((instance) => instance.stale)
			: snapshot.instances.filter((instance) => instance.id === normalizedTarget || String(instance.pid) === normalizedTarget);
	if (matches.length === 0) {
		return {
			ok: false,
			message: `No hub instances matched ${normalizedTarget}.`,
			killed: [],
			removed: [],
			instances: snapshot.instances,
		};
	}

	const killed: string[] = [];
	const removed: string[] = [];
	const registryIdsToRemove = new Set<string>();
	for (const instance of matches) {
		const result = await stopInstance(instance, options);
		if (result.killed) {
			killed.push(instance.id);
		}
		if (result.removed) {
			removed.push(instance.id);
			if (instance.source === "registry") {
				registryIdsToRemove.add(instance.id);
			} else {
				removeLegacyRecord(instance.repoRoot, instance.source === "legacy-dashboard" ? "dashboard" : "hub");
			}
		}
	}
	if (registryIdsToRemove.size > 0) {
		removeRegistryInstances(registryIdsToRemove);
	}
	const nextSnapshot = getHubInstances(repoRoot);
	return {
		ok: removed.length === matches.length,
		message: removed.length === matches.length
			? `Removed ${removed.length} hub instance${removed.length === 1 ? "" : "s"}.`
			: `Requested stop for ${matches.length} hub instance${matches.length === 1 ? "" : "s"}; ${matches.length - removed.length} still running.`,
		killed,
		removed,
		instances: nextSnapshot.instances,
	};
}

export async function runHubKill(repoRoot: string, target: string, options: { force?: boolean } = {}): Promise<string> {
	const result = await killHubInstance(repoRoot, target, options);
	return result.message;
}

export async function runHubStop(repoRoot: string, options: HubCommandOptions = {}): Promise<string> {
	const status = getHubStatus(repoRoot, options);
	if (!status.id) {
		return "hub already stopped";
	}
	const result = await killHubInstance(repoRoot, status.id);
	return status.stale ? "hub stopped (removed stale pid file)" : result.message.replace(/^Removed 1 hub instance\.$/, "hub stopped");
}

export async function runHubRestart(repoRoot: string, options: HubCommandOptions = {}): Promise<string> {
	await runHubStop(repoRoot, options);
	const started = await runHubStart(repoRoot, options);
	return started.replace(/^hub started/, "hub restarted");
}

export async function ensureHubServer(repoRoot: string, options: HubCommandOptions = {}): Promise<HubServerStatus> {
	const existing = reusableInstance(repoRoot, options);
	if (existing) {
		return instanceToServerStatus(repoRoot, existing);
	}
	await runHubStart(repoRoot, { ...options, open: false });
	return getHubStatus(repoRoot, options);
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
	const projectId = await ensureRuntimeProject(status, repoRoot);
	const url = routeUrl(status.url, routeForProject(openPath, projectId));
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
	const logPath = process.env[HUB_LOG_PATH_ENV]?.trim() || globalHubLogPath(configuredEndpointLabel(repoRoot, options));
	mkdirSync(path.dirname(logPath), { recursive: true });
	const logFd = openSync(logPath, "a");
	const startedBy = process.env[HUB_STARTED_BY_ENV]?.trim() || options.startedBy || "hub restart";
	const child = spawn(process.execPath, [...currentCliArgs(), ...hubRunArgs({ ...options, project: repoRoot, open: false })], {
		cwd: repoRoot,
		detached: true,
		stdio: ["ignore", logFd, logFd],
		env: {
			...process.env,
			[MANAGED_HUB_ENV]: "1",
			[WAIT_FOR_PID_ENV]: String(process.pid),
			[HUB_STARTED_BY_ENV]: startedBy,
			[HUB_LOG_PATH_ENV]: logPath,
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
		listHubInstances: () => getHubInstances(repoRoot),
		killHubInstance: (target, killOptions) => killHubInstance(repoRoot, target, killOptions),
	}, process.cwd());
	const url = routeUrl(started.server.url, "/");
	if (process.env[MANAGED_HUB_ENV] === "1") {
		const logPath = process.env[HUB_LOG_PATH_ENV]?.trim() || globalHubLogPath(configuredEndpointLabel(repoRoot, options));
		const record = makeInstanceRecord({
			pid: process.pid,
			url,
			repoRoot,
			logPath,
			options,
			startedBy: process.env[HUB_STARTED_BY_ENV]?.trim() || options.startedBy || "hub run",
			managed: true,
		});
		upsertInstance(record, { active: true });
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

	return `Changeyard UI running at ${url}`;
}

export function resolveHubRepoRoot(options: HubCommandOptions, cwd = process.cwd()): string {
	return findRepoRoot(options.project ?? cwd);
}
