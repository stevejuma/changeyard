import assert from "node:assert/strict";
import test from "node:test";
import { loadJjState } from "../src/vcs/jj/state.js";

test("loadJjState returns bookmark lanes and working-copy summaries", async () => {
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
			case 'jj bookmark list --revisions mine() ~ trunk() --template name ++ "\\t" ++ self.normal_target().change_id().shortest(12) ++ "\\t" ++ self.normal_target().commit_id().shortest(12) ++ "\\t" ++ if(self.synced(), "1", "0") ++ "\\t" ++ if(self.tracked(), "1", "0") ++ "\\n"':
				return {
					ok: true,
					stdout: ["feature/api\tqpvuntsm\t12345678\t1\t1", "feature/ui\tzzzzyyyy\t87654321\t0\t0"].join("\n"),
					stderr: "",
					exitCode: 0,
				};
			case 'jj log --revisions connected(trunk()::"feature/api") --no-graph --template change_id.shortest(12) ++ "\\t" ++ commit_id.shortest(12) ++ "\\t" ++ description.first_line().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ parents.map(|p| p.change_id().shortest(12)).join("|") ++ "\\t" ++ local_bookmarks.map(|b| b.name()).join("|") ++ "\\t" ++ remote_bookmarks.map(|b| separate("@", b.name(), b.remote())).join("|") ++ "\\t" ++ if(current_working_copy, "1", "0") ++ "\\n"':
				return {
					ok: true,
					stdout: [
						"trunk\t00000000\tmain\t\tmain\tmain@origin\t0",
						"qpvuntsm\t12345678\tAPI change\ttrunk\tfeature/api\tfeature/api@origin\t1",
					].join("\n"),
					stderr: "",
					exitCode: 0,
				};
			case 'jj log --revisions connected(trunk()::"feature/ui") --no-graph --template change_id.shortest(12) ++ "\\t" ++ commit_id.shortest(12) ++ "\\t" ++ description.first_line().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ parents.map(|p| p.change_id().shortest(12)).join("|") ++ "\\t" ++ local_bookmarks.map(|b| b.name()).join("|") ++ "\\t" ++ remote_bookmarks.map(|b| separate("@", b.name(), b.remote())).join("|") ++ "\\t" ++ if(current_working_copy, "1", "0") ++ "\\n"':
				return {
					ok: true,
					stdout: [
						"trunk\t00000000\tmain\t\tmain\tmain@origin\t0",
						"zzzzyyyy\t87654321\tUI change\ttrunk\tfeature/ui\t\t0",
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
	assert.equal(result.lanes.length, 2);
	assert.deepEqual(
		result.lanes.map((lane) => lane.segments.map((segment) => segment.changeId)),
		[
			["trunk", "qpvuntsm"],
			["trunk", "zzzzyyyy"],
		],
	);
	assert.equal(result.unassignedChanges[0]?.path, "src/vcs/jj/state.ts");
	assert.equal(result.unassignedChanges[0]?.status, "modified");
	assert.ok(calls.includes("jj diff --summary -r @"));
});
