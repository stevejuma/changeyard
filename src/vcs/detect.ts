import type { VcsDetectResult, VcsDiagnostic, VcsProvider } from "./types.js";
import { redactSecrets, runVcsCommand, type RunVcsCommandInput, type VcsCommandResult } from "./process.js";

export type VcsCommandRunner = (input: RunVcsCommandInput) => Promise<VcsCommandResult>;

function createDiagnostic(level: VcsDiagnostic["level"], code: string, message: string): VcsDiagnostic {
	return { level, code, message };
}

function parseJjVersion(stdout: string): string | null {
	const match = /jj\s+([^\s]+)/i.exec(stdout);
	return match?.[1] ?? null;
}

function parseBookmark(stdout: string): string | null {
	for (const line of stdout.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) {
			continue;
		}
		const match = /^([^\s:][^:]*)\s*:/.exec(trimmed);
		if (match?.[1]) {
			return match[1].trim();
		}
	}
	return null;
}

function parseDefaultBranch(stdout: string, remoteName: string): string | null {
	const trimmed = stdout.trim();
	if (!trimmed) {
		return null;
	}
	const prefix = `${remoteName}/`;
	return trimmed.startsWith(prefix) ? trimmed.slice(prefix.length) : trimmed;
}

function detectProvider(remoteUrl: string | null): VcsProvider {
	if (!remoteUrl) {
		return "none";
	}
	const normalized = remoteUrl.toLowerCase();
	if (normalized.includes("github.com")) {
		return "github";
	}
	if (normalized.includes("gitlab")) {
		return "gitlab";
	}
	if (normalized.includes("forgejo") || normalized.includes("codeberg.org")) {
		return "forgejo";
	}
	return "unknown";
}

function redactRemoteUrl(remoteUrl: string | null): string | null {
	if (!remoteUrl) {
		return null;
	}
	return redactSecrets(remoteUrl);
}

async function readGitRemoteName(cwd: string, runner: VcsCommandRunner): Promise<string | null> {
	const remotesResult = await runner({
		command: "git",
		args: ["remote"],
		cwd,
	});
	if (!remotesResult.ok) {
		return null;
	}
	const remotes = remotesResult.stdout
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
	if (remotes.includes("origin")) {
		return "origin";
	}
	return remotes[0] ?? null;
}

async function readGitDefaultBranch(cwd: string, remoteName: string, runner: VcsCommandRunner): Promise<string | null> {
	const symbolicRef = await runner({
		command: "git",
		args: ["symbolic-ref", "--quiet", "--short", `refs/remotes/${remoteName}/HEAD`],
		cwd,
	});
	if (symbolicRef.ok) {
		return parseDefaultBranch(symbolicRef.stdout, remoteName);
	}
	return null;
}

async function readGithubAuth(provider: VcsProvider, cwd: string, runner: VcsCommandRunner): Promise<{
	available: boolean;
	authenticated: boolean;
	reason: string | null;
}> {
	if (provider !== "github") {
		return {
			available: false,
			authenticated: false,
			reason: "GitHub publishing is only configured for GitHub remotes.",
		};
	}
	const authResult = await runner({
		command: "gh",
		args: ["auth", "status", "--hostname", "github.com"],
		cwd,
	});
	if (authResult.ok) {
		return {
			available: true,
			authenticated: true,
			reason: null,
		};
	}
	if (authResult.exitCode === -1) {
		return {
			available: false,
			authenticated: false,
			reason: "GitHub CLI auth is not available.",
		};
	}
	return {
		available: true,
		authenticated: false,
		reason: "GitHub CLI is not authenticated for this repository.",
	};
}

export async function detectVcsState(
	cwd: string,
	runner: VcsCommandRunner = runVcsCommand,
): Promise<VcsDetectResult> {
	const diagnostics: VcsDiagnostic[] = [];

	const jjVersionResult = await runner({
		command: "jj",
		args: ["--version"],
		cwd,
	});
	const jjInstalled = jjVersionResult.ok;
	const jjVersion = jjInstalled ? parseJjVersion(jjVersionResult.stdout) : null;
	if (!jjInstalled) {
		diagnostics.push(createDiagnostic("warning", "jj_unavailable", "Jujutsu is not installed or not available in PATH."));
	}

	const jjRootResult = jjInstalled
		? await runner({
				command: "jj",
				args: ["workspace", "root"],
				cwd,
			})
		: null;

	const gitRootResult = await runner({
		command: "git",
		args: ["rev-parse", "--show-toplevel"],
		cwd,
	});

	const repository =
		jjRootResult?.ok
			? { kind: "jj" as const, root: jjRootResult.stdout || null }
			: gitRootResult.ok
				? { kind: "git" as const, root: gitRootResult.stdout || null }
				: { kind: "none" as const, root: null };

	if (repository.kind === "none") {
		diagnostics.push(createDiagnostic("warning", "repo_missing", "No Git or JJ repository was detected for this workspace."));
	}

	const repoCwd = repository.root ?? cwd;
	const currentBookmarkResult =
		repository.kind === "jj"
			? await runner({
					command: "jj",
					args: ["bookmark", "list", "-r", "@"],
					cwd: repoCwd,
				})
			: null;
	const currentChangeIdResult =
		repository.kind === "jj"
			? await runner({
					command: "jj",
					args: ["log", "-r", "@", "--no-graph", "-T", "change_id.short()"],
					cwd: repoCwd,
				})
			: null;

	const remoteName = repository.kind === "none" ? null : await readGitRemoteName(repoCwd, runner);
	const remoteUrlResult =
		remoteName
			? await runner({
					command: "git",
					args: ["remote", "get-url", remoteName],
					cwd: repoCwd,
				})
			: null;
	const remoteUrl = remoteUrlResult?.ok ? redactRemoteUrl(remoteUrlResult.stdout) : null;
	const provider = detectProvider(remoteUrl);
	const defaultBranch =
		remoteName && repository.kind !== "none"
			? await readGitDefaultBranch(repoCwd, remoteName, runner)
			: null;
	const publishingAuth = await readGithubAuth(provider, repoCwd, runner);

	if (!remoteName) {
		diagnostics.push(createDiagnostic("info", "remote_missing", "No Git remote is configured yet."));
	}
	if (remoteName && !defaultBranch) {
		diagnostics.push(createDiagnostic("info", "default_branch_unknown", "Could not determine the remote default branch yet."));
	}
	if (provider === "unknown" && remoteUrl) {
		diagnostics.push(createDiagnostic("info", "provider_unknown", "Remote provider is not recognized for stacked PR publishing."));
	}
	if (repository.kind === "jj" && !currentBookmarkResult?.ok) {
		diagnostics.push(createDiagnostic("info", "bookmark_missing", "No current JJ bookmark is associated with @."));
	}

	return {
		cwd,
		repository,
		jj: {
			installed: jjInstalled,
			version: jjVersion,
			repoRoot: repository.kind === "jj" ? repository.root : jjRootResult?.stdout || null,
			currentBookmark: currentBookmarkResult?.ok ? parseBookmark(currentBookmarkResult.stdout) : null,
			currentChangeId: currentChangeIdResult?.ok ? currentChangeIdResult.stdout.trim() || null : null,
			defaultBase: defaultBranch,
		},
		git: {
			remoteName,
			remoteUrl,
			provider,
			defaultBranch,
		},
		publishing: {
			provider,
			remoteName,
			available: publishingAuth.available,
			authenticated: publishingAuth.authenticated,
			reason: publishingAuth.reason,
		},
		diagnostics,
	};
}
