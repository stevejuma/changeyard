import { createHash } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";

const APP_NAME = "Changeyard";
const APP_DIR_NAME = "changeyard";

export function changeyardAppStateRoot(): string {
	const override = process.env.CHANGEYARD_HOME?.trim();
	if (override) {
		return path.resolve(override);
	}
	if (process.platform === "darwin") {
		return path.join(homedir(), "Library", "Application Support", APP_NAME);
	}
	if (process.platform === "win32") {
		return path.join(process.env.LOCALAPPDATA || path.join(homedir(), "AppData", "Local"), APP_NAME);
	}
	return path.join(process.env.XDG_STATE_HOME || path.join(homedir(), ".local", "state"), APP_DIR_NAME);
}

export function repoAppStateRoot(repoRoot: string): string {
	const normalized = path.resolve(repoRoot);
	const slug = path.basename(normalized).replace(/[^A-Za-z0-9._-]+/g, "-") || "repo";
	const hash = createHash("sha256").update(normalized).digest("hex").slice(0, 12);
	return path.join(changeyardAppStateRoot(), "repos", `${slug}-${hash}`);
}

export function repoAppStatePath(repoRoot: string, ...segments: string[]): string {
	return path.join(repoAppStateRoot(repoRoot), ...segments);
}

export function changeyardAppStatePath(...segments: string[]): string {
	return path.join(changeyardAppStateRoot(), ...segments);
}
