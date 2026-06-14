import assert from "node:assert/strict";
import test from "node:test";
import { loadJjDiff } from "../src/vcs/jj/diff.js";

test("loadJjDiff returns the current change summary and patch", async () => {
	const result = await loadJjDiff("/repo", async ({ command, args }) => {
		const joined = `${command} ${args.join(" ")}`;
		switch (joined) {
			case "jj --version":
				return { ok: true, stdout: "jj 0.27.0", stderr: "", exitCode: 0 };
			case "jj workspace root":
				return { ok: true, stdout: "/repo", stderr: "", exitCode: 0 };
			case "git rev-parse --show-toplevel":
				return { ok: true, stdout: "/repo", stderr: "", exitCode: 0 };
			case "jj bookmark list --ignore-working-copy --at-op=@ -r @":
				return { ok: true, stdout: "feature/api: qpvuntsm 12345678", stderr: "", exitCode: 0 };
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
			case "jj show --ignore-working-copy -r qpvuntsm --summary --color=never":
				return { ok: true, stdout: "M src/example.ts", stderr: "", exitCode: 0 };
			case "jj show --ignore-working-copy -r qpvuntsm --git --color=never":
				return { ok: true, stdout: "diff --git a/src/example.ts b/src/example.ts", stderr: "", exitCode: 0 };
			default:
				return { ok: false, stdout: "", stderr: `${joined} not mocked`, exitCode: 1 };
		}
	});

	assert.equal(result.changeId, "qpvuntsm");
	assert.match(result.summary, /src\/example\.ts/);
	assert.match(result.patch, /diff --git/);
	assert.equal(result.diagnostics.length, 0);
});
