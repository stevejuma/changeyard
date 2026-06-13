import assert from "node:assert/strict";
import test from "node:test";
import { detectVcsState } from "../src/vcs/detect.js";
import { redactSecrets, runVcsCommand } from "../src/vcs/process.js";

test("redactSecrets removes basic credential material from URLs", () => {
	assert.equal(
		redactSecrets("https://token123@example.com/repo.git?access_token=abc"),
		"https://[redacted]@example.com/repo.git?access_token=[redacted]",
	);
});

test("runVcsCommand rejects invalid argv segments before execution", async () => {
	await assert.rejects(
		() =>
			runVcsCommand({
				command: "git",
				args: [""],
				cwd: process.cwd(),
			}),
		/non-empty strings/i,
	);
});

test("detectVcsState reports jj repositories from the injected runner", async () => {
	const calls: Array<string> = [];
	const result = await detectVcsState(
		"/repo",
		async ({ command, args }) => {
			calls.push(`${command} ${args.join(" ")}`);
			const joined = `${command} ${args.join(" ")}`;
			switch (joined) {
				case "jj --version":
					return { ok: true, stdout: "jj 0.27.0", stderr: "", exitCode: 0 };
				case "jj workspace root":
					return { ok: true, stdout: "/repo", stderr: "", exitCode: 0 };
				case "git rev-parse --show-toplevel":
					return { ok: true, stdout: "/repo", stderr: "", exitCode: 0 };
				case "jj bookmark list --ignore-working-copy --at-op=@ -r @":
					return { ok: true, stdout: "feature/demo: qpvuntsm 12345678", stderr: "", exitCode: 0 };
				case "jj log --ignore-working-copy --at-op=@ -r @ --no-graph -T change_id.short()":
					return { ok: true, stdout: "qpvuntsm", stderr: "", exitCode: 0 };
				case "git remote":
					return { ok: true, stdout: "origin", stderr: "", exitCode: 0 };
				case "git remote get-url origin":
					return { ok: true, stdout: "https://github.com/acme/repo.git", stderr: "", exitCode: 0 };
				case "git symbolic-ref --quiet --short refs/remotes/origin/HEAD":
					return { ok: true, stdout: "origin/main", stderr: "", exitCode: 0 };
				case "gh auth status --hostname github.com":
					return { ok: true, stdout: "Logged in", stderr: "", exitCode: 0 };
				default:
					return { ok: false, stdout: "", stderr: `${joined} not mocked`, exitCode: 1 };
			}
		},
	);

	assert.equal(result.repository.kind, "jj");
	assert.equal(result.repository.root, "/repo");
	assert.equal(result.jj.version, "0.27.0");
	assert.equal(result.jj.currentBookmark, "feature/demo");
	assert.equal(result.jj.currentChangeId, "qpvuntsm");
	assert.equal(result.git.remoteName, "origin");
	assert.equal(result.git.provider, "github");
	assert.equal(result.git.defaultBranch, "main");
	assert.equal(result.publishing.available, true);
	assert.equal(result.publishing.authenticated, true);
	assert.deepEqual(
		calls.slice(0, 3),
		["jj --version", "jj workspace root", "git rev-parse --show-toplevel"],
	);
});
