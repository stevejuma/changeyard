import assert from "node:assert/strict";
import test from "node:test";
import { loadJjInventory } from "../src/vcs/jj/inventory.js";

function ok(stdout = "") {
	return { ok: true, stdout, stderr: "", exitCode: 0 };
}

test("loadJjInventory groups local and remote bookmarks under the local branch identity", async () => {
	const calls: string[] = [];
	const result = await loadJjInventory(
		"/repo",
		async ({ command, args }) => {
			const joined = `${command} ${args.join(" ")}`;
			calls.push(joined);
			switch (joined) {
				case "jj --version":
					return ok("jj 0.39.0");
				case "jj workspace root":
					return ok("/repo");
				case "git rev-parse --show-toplevel":
					return ok("/repo");
				case "jj bookmark list --ignore-working-copy --at-op=@ -r @":
					return ok("feature/one: abcdefgh 12345678");
				case "jj log --ignore-working-copy --at-op=@ -r @ --no-graph -T change_id.short()":
					return ok("abcdefgh");
				case "git remote":
					return ok("origin\nupstream\n");
				case "git remote get-url origin":
					return ok("https://github.com/acme/repo.git");
				case "git symbolic-ref --quiet --short refs/remotes/origin/HEAD":
					return ok("origin/main");
				case "gh auth status --hostname github.com":
					return ok("Logged in");
				case 'jj log --ignore-working-copy --at-op=@ -r @ --no-graph -T change_id.short() ++ "\\t" ++ commit_id.short() ++ "\\t" ++ description.first_line().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.name().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.email() ++ "\\t" ++ author.timestamp().format("%Y-%m-%dT%H:%M:%SZ") ++ "\\t" ++ local_bookmarks.map(|b| b.name()).join("|") ++ "\\n"':
					return ok("abcdefgh\t12345678\tFeature one\tSteve Juma\tsteve@example.com\t2026-04-04T12:00:00Z\tfeature/one\n");
				case 'jj bookmark list --all-remotes --ignore-working-copy --at-op=@ --template name ++ "\\t" ++ if(self.remote(), self.remote(), "") ++ "\\t" ++ self.normal_target().change_id().short() ++ "\\t" ++ self.normal_target().commit_id().short() ++ "\\t" ++ self.normal_target().description().first_line().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ self.normal_target().author().name().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ self.normal_target().author().email() ++ "\\t" ++ self.normal_target().author().timestamp().format("%Y-%m-%dT%H:%M:%SZ") ++ "\\t" ++ if(self.synced(), "1", "0") ++ "\\t" ++ if(self.tracked(), "1", "0") ++ "\\n"':
					return ok(
						[
							"feature/one\t\tabcdefgh\t12345678\tFeature one\tSteve Juma\tsteve@example.com\t2026-04-04T12:00:00Z\t1\t0",
							"feature/one\tgit\tabcdefgh\t12345678\tFeature one\tSteve Juma\tsteve@example.com\t2026-04-04T12:00:00Z\t1\t1",
							"feature/one\torigin\tabcdefgh\t12345678\tFeature one\tSteve Juma\tsteve@example.com\t2026-04-04T12:00:00Z\t0\t0",
							"feature/one\tupstream\tabcdefgh\t12345678\tFeature one\tSteve Juma\tsteve@example.com\t2026-04-04T12:00:00Z\t0\t0",
							"feature/remote-only\torigin\tzzzzzzzz\t87654321\tRemote feature\tRemote User\tremote@example.com\t2026-04-03T12:00:00Z\t0\t0",
							"workspace/default\t\tworkspace01\t99999999\tWorkspace\tWorkspace User\tworkspace@example.com\t2026-04-02T12:00:00Z\t1\t0",
						].join("\n"),
					);
				case 'jj log --ignore-working-copy --at-op=@ -r main@origin --no-graph -T change_id.short() ++ "\\t" ++ commit_id.short() ++ "\\t" ++ description.first_line().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.name().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.email() ++ "\\t" ++ author.timestamp().format("%Y-%m-%dT%H:%M:%SZ") ++ "\\n"':
					return ok("mainchange\t00000000\tMain target\tMain User\tmain@example.com\t2026-04-01T12:00:00Z\n");
				default:
					return { ok: false, stdout: "", stderr: `${joined} not mocked`, exitCode: 1 };
			}
		},
		{ targetBranch: "origin/main" },
	);

	assert.deepEqual(
		result.items.map((item) => ({
			name: item.name,
			type: item.type,
			hasLocal: item.hasLocal,
			remotes: item.remotes,
				remoteName: item.remoteName,
				title: item.title,
				authorName: item.authorName,
				authorEmail: item.authorEmail,
				authorAvatarUrl: item.authorAvatarUrl,
			})),
		[
			{
				name: "feature/one",
				type: "bookmark",
				hasLocal: true,
				remotes: ["origin", "upstream"],
				remoteName: "origin",
				title: "Feature one",
				authorName: "Steve Juma",
				authorEmail: "steve@example.com",
				authorAvatarUrl: "https://www.gravatar.com/avatar/3c98114d8e479f5da382f3401a832375?s=80&d=identicon",
			},
			{
				name: "feature/remote-only",
				type: "remote",
				hasLocal: false,
				remotes: ["origin"],
				remoteName: "origin",
				title: "Remote feature",
				authorName: "Remote User",
				authorEmail: "remote@example.com",
				authorAvatarUrl: "https://www.gravatar.com/avatar/9c4c9b603d6102bfc8e76ee94d907013?s=80&d=identicon",
			},
		],
	);
	assert.equal(result.workspaceTarget?.name, "origin/main");
	assert.equal(result.workspaceTarget?.target, "main");
	assert.equal(result.workspaceTarget?.changeId, "mainchange");
	assert.equal(result.workspaceTarget?.title, "Main target");
	assert.equal(calls.some((call) => call.startsWith("git for-each-ref")), false);
});
