import assert from "node:assert/strict";
import test from "node:test";
import { loadJjState } from "../src/vcs/jj/state.js";

test("loadJjState returns grouped stacks from one bounded graph read and working-copy summaries", async () => {
	const calls: string[] = [];
	const result = await loadJjState("/repo", async ({ command, args }) => {
		const joined = `${command} ${args.join(" ")}`;
		calls.push(joined);
		switch (joined) {
			case "jj --version":
				return { ok: true, stdout: "jj 0.27.0", stderr: "", exitCode: 0 };
			case "jj workspace root":
				return { ok: true, stdout: "/repo", stderr: "", exitCode: 0 };
			case "git rev-parse --show-toplevel":
				return { ok: true, stdout: "/repo", stderr: "", exitCode: 0 };
			case "jj bookmark list -r @":
				return { ok: true, stdout: "feature/api: qpvuntsm 12345678", stderr: "", exitCode: 0 };
			case "jj log -r @ --no-graph -T change_id.short()":
				return { ok: true, stdout: "qpvuntsm", stderr: "", exitCode: 0 };
			case "git remote":
				return { ok: true, stdout: "origin", stderr: "", exitCode: 0 };
			case "git remote get-url origin":
				return { ok: true, stdout: "https://github.com/acme/repo.git", stderr: "", exitCode: 0 };
			case "git symbolic-ref --quiet --short refs/remotes/origin/HEAD":
				return { ok: true, stdout: "origin/main", stderr: "", exitCode: 0 };
			case "gh auth status --hostname github.com":
				return { ok: true, stdout: "Logged in", stderr: "", exitCode: 0 };
			case 'jj bookmark list --revisions all() ~ ::main@origin --template name ++ "\\t" ++ self.normal_target().change_id().shortest(12) ++ "\\t" ++ self.normal_target().commit_id().shortest(12) ++ "\\t" ++ if(self.synced(), "1", "0") ++ "\\t" ++ if(self.tracked(), "1", "0") ++ "\\n"':
				return {
					ok: true,
					stdout: ["feature/api\tqpvuntsm\t12345678\t1\t1", "feature/ui\tzzzzyyyy\t87654321\t0\t0"].join("\n"),
					stderr: "",
					exitCode: 0,
				};
			case 'jj log --revisions (::("feature/api" | "feature/ui")) ~ ::main@origin --no-graph --template change_id.shortest(12) ++ "\\t" ++ commit_id.shortest(12) ++ "\\t" ++ description.first_line().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.name().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.email() ++ "\\t" ++ parents.map(|p| p.change_id().shortest(12)).join("|") ++ "\\t" ++ local_bookmarks.map(|b| b.name()).join("|") ++ "\\t" ++ remote_bookmarks.map(|b| separate("@", b.name(), b.remote())).join("|") ++ "\\t" ++ if(current_working_copy, "1", "0") ++ "\\n"':
				return {
					ok: true,
					stdout: [
						"trunk\t00000000\tmain\t\tmain\tmain@origin\t0",
						"qpvuntsm\t12345678\tAPI change\ttrunk\tfeature/api\tfeature/api@origin\t1",
						"zzzzyyyy\t87654321\tUI change\tqpvuntsm\tfeature/ui\t\t0",
					].join("\n"),
					stderr: "",
					exitCode: 0,
				};
			case "jj diff --summary -r @":
				return { ok: true, stdout: "M src/vcs/jj/state.ts", stderr: "", exitCode: 0 };
			default:
				return { ok: false, stdout: "", stderr: `${joined} not mocked`, exitCode: 1 };
		}
	});

	assert.equal(result.repository.kind, "jj");
	assert.equal(result.bookmarks.length, 2);
	assert.equal(result.stacks.length, 1);
	assert.deepEqual(result.stacks[0]?.heads.map((head) => head.bookmarkName), ["feature/ui", "feature/api"]);
	assert.deepEqual(result.stacks[0]?.changes.map((change) => change.changeId), ["trunk", "qpvuntsm", "zzzzyyyy"]);
	assert.equal(result.stacks[0]?.isCheckedOut, true);
	assert.equal(result.unassignedChanges[0]?.path, "src/vcs/jj/state.ts");
	assert.equal(result.unassignedChanges[0]?.status, "modified");
	assert.ok(calls.includes("jj diff --summary -r @"));
	assert.equal(calls.filter((call) => call.startsWith("jj log --revisions (::")).length, 1);
});

test("loadJjState uses configured remote target as the base boundary", async () => {
	const calls: string[] = [];
	const result = await loadJjState(
		"/repo",
		async ({ command, args }) => {
			const joined = `${command} ${args.join(" ")}`;
			calls.push(joined);
			switch (joined) {
				case "jj --version":
					return { ok: true, stdout: "jj 0.39.0", stderr: "", exitCode: 0 };
				case "jj workspace root":
					return { ok: true, stdout: "/repo", stderr: "", exitCode: 0 };
				case "git rev-parse --show-toplevel":
					return { ok: true, stdout: "/repo", stderr: "", exitCode: 0 };
				case "jj bookmark list -r @":
					return { ok: true, stdout: "", stderr: "", exitCode: 0 };
				case "jj log -r @ --no-graph -T change_id.short()":
					return { ok: true, stdout: "featuretop", stderr: "", exitCode: 0 };
				case "git remote":
					return { ok: true, stdout: "origin", stderr: "", exitCode: 0 };
				case "git remote get-url origin":
					return { ok: true, stdout: "https://github.com/acme/repo.git", stderr: "", exitCode: 0 };
				case "git symbolic-ref --quiet --short refs/remotes/origin/HEAD":
					return { ok: true, stdout: "origin/main", stderr: "", exitCode: 0 };
				case "gh auth status --hostname github.com":
					return { ok: true, stdout: "Logged in", stderr: "", exitCode: 0 };
				case 'jj bookmark list --revisions all() ~ ::trunk@origin --template name ++ "\\t" ++ self.normal_target().change_id().shortest(12) ++ "\\t" ++ self.normal_target().commit_id().shortest(12) ++ "\\t" ++ if(self.synced(), "1", "0") ++ "\\t" ++ if(self.tracked(), "1", "0") ++ "\\n"':
					return {
						ok: true,
						stdout: ["feature/top\tfeaturetop\t11111111\t0\t0", "workspace/default\tworkspace01\t22222222\t0\t0"].join("\n"),
						stderr: "",
						exitCode: 0,
					};
				case 'jj log --revisions (::"feature/top") ~ ::trunk@origin --no-graph --template change_id.shortest(12) ++ "\\t" ++ commit_id.shortest(12) ++ "\\t" ++ description.first_line().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.name().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.email() ++ "\\t" ++ parents.map(|p| p.change_id().shortest(12)).join("|") ++ "\\t" ++ local_bookmarks.map(|b| b.name()).join("|") ++ "\\t" ++ remote_bookmarks.map(|b| separate("@", b.name(), b.remote())).join("|") ++ "\\t" ++ if(current_working_copy, "1", "0") ++ "\\n"':
					return {
						ok: true,
						stdout: ["trunkbase\t00000000\ttrunk\t\ttrunk\ttrunk@origin\t0", "featuretop\t11111111\tFeature\ttrunkbase\tfeature/top\t\t1"].join("\n"),
						stderr: "",
						exitCode: 0,
					};
				case "jj diff --summary -r @":
					return { ok: true, stdout: "", stderr: "", exitCode: 0 };
				default:
					return { ok: false, stdout: "", stderr: `${joined} not mocked`, exitCode: 1 };
			}
		},
		{ targetBranch: "origin/trunk" },
	);

	assert.equal(result.stacks.length, 1);
	assert.equal(result.stacks[0]?.base, "trunk");
	assert.deepEqual(result.bookmarks.map((bookmark) => bookmark.name), ["feature/top"]);
	assert.ok(calls.includes('jj bookmark list --revisions all() ~ ::trunk@origin --template name ++ "\\t" ++ self.normal_target().change_id().shortest(12) ++ "\\t" ++ self.normal_target().commit_id().shortest(12) ++ "\\t" ++ if(self.synced(), "1", "0") ++ "\\t" ++ if(self.tracked(), "1", "0") ++ "\\n"'));
});
