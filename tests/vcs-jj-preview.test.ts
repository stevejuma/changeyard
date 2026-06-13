import assert from "node:assert/strict";
import test from "node:test";
import { previewJjOperation } from "../src/vcs/jj/preview.js";
import type { VcsPreviewOperationInput } from "../src/vcs/types.js";

const reorderAfter: VcsPreviewOperationInput = {
	kind: "reorder_change",
	sourceChangeId: "source123",
	targetChangeId: "target456",
	placement: "after",
};

const createBookmark: VcsPreviewOperationInput = {
	kind: "create_bookmark",
	changeId: "source123",
	bookmarkName: "feature/new-api",
};

const editMessage: VcsPreviewOperationInput = {
	kind: "edit_message",
	changeId: "source123",
	message: "Refine API layer",
};

const createChangeAfter: VcsPreviewOperationInput = {
	kind: "create_change",
	anchorChangeId: "target456",
	placement: "after",
	message: "Follow-up change",
};

const moveBookmark: VcsPreviewOperationInput = {
	kind: "move_bookmark",
	bookmarkName: "feature/api",
	targetChangeId: "target456",
};

const squashChange: VcsPreviewOperationInput = {
	kind: "squash_change",
	sourceChangeId: "source123",
	targetChangeId: "target456",
};

const absorbFile: VcsPreviewOperationInput = {
	kind: "absorb_file",
	targetChangeId: "root000",
	paths: ["src/app.ts"],
};

const restoreFile: VcsPreviewOperationInput = {
	kind: "restore_file",
	paths: ["src/app.ts"],
};

const undoLast: VcsPreviewOperationInput = {
	kind: "undo_last",
};

const redoLast: VcsPreviewOperationInput = {
	kind: "redo_last",
};

const abandonChange: VcsPreviewOperationInput = {
	kind: "abandon_change",
	changeId: "source123",
};

test("previewJjOperation returns a reorder command preview", async () => {
	const result = await previewJjOperation("/repo", reorderAfter, async ({ command, args }) => {
		const joined = `${command} ${args.join(" ")}`;
		switch (joined) {
			case "jj --version":
				return { ok: true, stdout: "jj 0.27.0", stderr: "", exitCode: 0 };
			case "jj workspace root":
				return { ok: true, stdout: "/repo", stderr: "", exitCode: 0 };
			case "git rev-parse --show-toplevel":
				return { ok: true, stdout: "/repo", stderr: "", exitCode: 0 };
			case "jj bookmark list -r @":
				return { ok: true, stdout: "feature/api: source123 12345678", stderr: "", exitCode: 0 };
			case "jj log -r @ --no-graph -T change_id.short()":
				return { ok: true, stdout: "source123", stderr: "", exitCode: 0 };
			case "git remote":
				return { ok: true, stdout: "origin", stderr: "", exitCode: 0 };
			case "git remote get-url origin":
				return { ok: true, stdout: "https://github.com/acme/repo.git", stderr: "", exitCode: 0 };
			case "git symbolic-ref --quiet --short refs/remotes/origin/HEAD":
				return { ok: true, stdout: "origin/main", stderr: "", exitCode: 0 };
			case "gh auth status --hostname github.com":
				return { ok: true, stdout: "Logged in", stderr: "", exitCode: 0 };
			case 'jj bookmark list --revisions all() ~ ::trunk() --template name ++ "\\t" ++ self.normal_target().change_id().shortest(12) ++ "\\t" ++ self.normal_target().commit_id().shortest(12) ++ "\\t" ++ if(self.synced(), "1", "0") ++ "\\t" ++ if(self.tracked(), "1", "0") ++ "\\n"':
				return {
					ok: true,
					stdout: "feature/api\tsource123\t12345678\t1\t1",
					stderr: "",
					exitCode: 0,
				};
			case 'jj log --revisions (::"feature/api") ~ ::trunk() --no-graph --template change_id.shortest(12) ++ "\\t" ++ commit_id.shortest(12) ++ "\\t" ++ description.first_line().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.name().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.email() ++ "\\t" ++ parents.map(|p| p.change_id().shortest(12)).join("|") ++ "\\t" ++ local_bookmarks.map(|b| b.name()).join("|") ++ "\\t" ++ remote_bookmarks.map(|b| separate("@", b.name(), b.remote())).join("|") ++ "\\t" ++ if(current_working_copy, "1", "0") ++ "\\n"':
				return {
					ok: true,
					stdout: [
						"root000\t11111111\troot\t\tmain\tmain@origin\t0",
						"source123\t22222222\tSource change\troot000\tfeature/api\tfeature/api@origin\t1",
						"target456\t33333333\tTarget change\troot000\t\t\t0",
					].join("\n"),
					stderr: "",
					exitCode: 0,
				};
			default:
				return { ok: false, stdout: "", stderr: `${joined} not mocked`, exitCode: 1 };
		}
	});

	assert.equal(result.valid, true);
	assert.equal(result.commands.length, 1);
	assert.deepEqual(result.commands[0], {
		command: "jj",
		args: ["rebase", "-s", "source123", "-d", "target456"],
	});
	assert.deepEqual(result.affectedBookmarks, ["feature/api"]);
	assert.equal(result.risk, "medium");
});

test("previewJjOperation rejects source and target equality", async () => {
	const result = await previewJjOperation(
		"/repo",
		{
			...reorderAfter,
			targetChangeId: "source123",
		},
		async ({ command, args }) => {
			const joined = `${command} ${args.join(" ")}`;
			switch (joined) {
				case "jj --version":
					return { ok: true, stdout: "jj 0.27.0", stderr: "", exitCode: 0 };
				case "jj workspace root":
					return { ok: true, stdout: "/repo", stderr: "", exitCode: 0 };
				case "git rev-parse --show-toplevel":
					return { ok: true, stdout: "/repo", stderr: "", exitCode: 0 };
				case "jj bookmark list -r @":
					return { ok: true, stdout: "feature/api: source123 12345678", stderr: "", exitCode: 0 };
				case "jj log -r @ --no-graph -T change_id.short()":
					return { ok: true, stdout: "source123", stderr: "", exitCode: 0 };
				case "git remote":
					return { ok: true, stdout: "origin", stderr: "", exitCode: 0 };
				case "git remote get-url origin":
					return { ok: true, stdout: "https://github.com/acme/repo.git", stderr: "", exitCode: 0 };
				case "git symbolic-ref --quiet --short refs/remotes/origin/HEAD":
					return { ok: true, stdout: "origin/main", stderr: "", exitCode: 0 };
				case "gh auth status --hostname github.com":
					return { ok: true, stdout: "Logged in", stderr: "", exitCode: 0 };
				case 'jj bookmark list --revisions all() ~ ::trunk() --template name ++ "\\t" ++ self.normal_target().change_id().shortest(12) ++ "\\t" ++ self.normal_target().commit_id().shortest(12) ++ "\\t" ++ if(self.synced(), "1", "0") ++ "\\t" ++ if(self.tracked(), "1", "0") ++ "\\n"':
					return {
						ok: true,
						stdout: "feature/api\tsource123\t12345678\t1\t1",
						stderr: "",
						exitCode: 0,
					};
				case 'jj log --revisions (::"feature/api") ~ ::trunk() --no-graph --template change_id.shortest(12) ++ "\\t" ++ commit_id.shortest(12) ++ "\\t" ++ description.first_line().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.name().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.email() ++ "\\t" ++ parents.map(|p| p.change_id().shortest(12)).join("|") ++ "\\t" ++ local_bookmarks.map(|b| b.name()).join("|") ++ "\\t" ++ remote_bookmarks.map(|b| separate("@", b.name(), b.remote())).join("|") ++ "\\t" ++ if(current_working_copy, "1", "0") ++ "\\n"':
					return {
						ok: true,
						stdout: "source123\t22222222\tSource change\troot000\tfeature/api\tfeature/api@origin\t1",
						stderr: "",
						exitCode: 0,
					};
				default:
					return { ok: false, stdout: "", stderr: `${joined} not mocked`, exitCode: 1 };
			}
		},
	);

	assert.equal(result.valid, false);
	assert.equal(result.commands.length, 0);
	assert.match(result.description, /different/i);
});

test("previewJjOperation rejects descendant targets", async () => {
	const result = await previewJjOperation("/repo", reorderAfter, async ({ command, args }) => {
		const joined = `${command} ${args.join(" ")}`;
		switch (joined) {
			case "jj --version":
				return { ok: true, stdout: "jj 0.27.0", stderr: "", exitCode: 0 };
			case "jj workspace root":
				return { ok: true, stdout: "/repo", stderr: "", exitCode: 0 };
			case "git rev-parse --show-toplevel":
				return { ok: true, stdout: "/repo", stderr: "", exitCode: 0 };
			case "jj bookmark list -r @":
				return { ok: true, stdout: "feature/api: source123 12345678", stderr: "", exitCode: 0 };
			case "jj log -r @ --no-graph -T change_id.short()":
				return { ok: true, stdout: "source123", stderr: "", exitCode: 0 };
			case "git remote":
				return { ok: true, stdout: "origin", stderr: "", exitCode: 0 };
			case "git remote get-url origin":
				return { ok: true, stdout: "https://github.com/acme/repo.git", stderr: "", exitCode: 0 };
			case "git symbolic-ref --quiet --short refs/remotes/origin/HEAD":
				return { ok: true, stdout: "origin/main", stderr: "", exitCode: 0 };
			case "gh auth status --hostname github.com":
				return { ok: true, stdout: "Logged in", stderr: "", exitCode: 0 };
			case 'jj bookmark list --revisions all() ~ ::trunk() --template name ++ "\\t" ++ self.normal_target().change_id().shortest(12) ++ "\\t" ++ self.normal_target().commit_id().shortest(12) ++ "\\t" ++ if(self.synced(), "1", "0") ++ "\\t" ++ if(self.tracked(), "1", "0") ++ "\\n"':
				return {
					ok: true,
					stdout: "feature/api\tsource123\t12345678\t1\t1",
					stderr: "",
					exitCode: 0,
				};
			case 'jj log --revisions (::"feature/api") ~ ::trunk() --no-graph --template change_id.shortest(12) ++ "\\t" ++ commit_id.shortest(12) ++ "\\t" ++ description.first_line().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.name().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.email() ++ "\\t" ++ parents.map(|p| p.change_id().shortest(12)).join("|") ++ "\\t" ++ local_bookmarks.map(|b| b.name()).join("|") ++ "\\t" ++ remote_bookmarks.map(|b| separate("@", b.name(), b.remote())).join("|") ++ "\\t" ++ if(current_working_copy, "1", "0") ++ "\\n"':
				return {
					ok: true,
					stdout: [
						"root000\t11111111\troot\t\tmain\tmain@origin\t0",
						"source123\t22222222\tSource change\troot000\tfeature/api\tfeature/api@origin\t1",
						"target456\t33333333\tTarget child\tsource123\t\t\t0",
					].join("\n"),
					stderr: "",
					exitCode: 0,
				};
			default:
				return { ok: false, stdout: "", stderr: `${joined} not mocked`, exitCode: 1 };
		}
	});

	assert.equal(result.valid, false);
	assert.equal(result.commands.length, 0);
	assert.match(result.description, /descendant/i);
});

test("previewJjOperation returns a create bookmark command preview", async () => {
	const result = await previewJjOperation("/repo", createBookmark, async ({ command, args }) => {
		const joined = `${command} ${args.join(" ")}`;
		switch (joined) {
			case "jj --version":
				return { ok: true, stdout: "jj 0.27.0", stderr: "", exitCode: 0 };
			case "jj workspace root":
				return { ok: true, stdout: "/repo", stderr: "", exitCode: 0 };
			case "git rev-parse --show-toplevel":
				return { ok: true, stdout: "/repo", stderr: "", exitCode: 0 };
			case "jj bookmark list -r @":
				return { ok: true, stdout: "feature/api: source123 12345678", stderr: "", exitCode: 0 };
			case "jj log -r @ --no-graph -T change_id.short()":
				return { ok: true, stdout: "source123", stderr: "", exitCode: 0 };
			case "git remote":
				return { ok: true, stdout: "origin", stderr: "", exitCode: 0 };
			case "git remote get-url origin":
				return { ok: true, stdout: "https://github.com/acme/repo.git", stderr: "", exitCode: 0 };
			case "git symbolic-ref --quiet --short refs/remotes/origin/HEAD":
				return { ok: true, stdout: "origin/main", stderr: "", exitCode: 0 };
			case "gh auth status --hostname github.com":
				return { ok: true, stdout: "Logged in", stderr: "", exitCode: 0 };
			case 'jj bookmark list --revisions all() ~ ::trunk() --template name ++ "\\t" ++ self.normal_target().change_id().shortest(12) ++ "\\t" ++ self.normal_target().commit_id().shortest(12) ++ "\\t" ++ if(self.synced(), "1", "0") ++ "\\t" ++ if(self.tracked(), "1", "0") ++ "\\n"':
				return {
					ok: true,
					stdout: "feature/api\tsource123\t12345678\t1\t1",
					stderr: "",
					exitCode: 0,
				};
			case 'jj log --revisions (::"feature/api") ~ ::trunk() --no-graph --template change_id.shortest(12) ++ "\\t" ++ commit_id.shortest(12) ++ "\\t" ++ description.first_line().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.name().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.email() ++ "\\t" ++ parents.map(|p| p.change_id().shortest(12)).join("|") ++ "\\t" ++ local_bookmarks.map(|b| b.name()).join("|") ++ "\\t" ++ remote_bookmarks.map(|b| separate("@", b.name(), b.remote())).join("|") ++ "\\t" ++ if(current_working_copy, "1", "0") ++ "\\n"':
				return {
					ok: true,
					stdout: "source123\t22222222\tSource change\troot000\tfeature/api\tfeature/api@origin\t1",
					stderr: "",
					exitCode: 0,
				};
			default:
				return { ok: false, stdout: "", stderr: `${joined} not mocked`, exitCode: 1 };
		}
	});

	assert.equal(result.valid, true);
	assert.deepEqual(result.commands[0], {
		command: "jj",
		args: ["bookmark", "create", "feature/new-api", "-r", "source123"],
	});
	assert.deepEqual(result.affectedBookmarks, ["feature/new-api", "feature/api"]);
});

test("previewJjOperation rejects duplicate bookmark names", async () => {
	const result = await previewJjOperation(
		"/repo",
		{
			...createBookmark,
			bookmarkName: "feature/api",
		},
		async ({ command, args }) => {
			const joined = `${command} ${args.join(" ")}`;
			switch (joined) {
				case "jj --version":
					return { ok: true, stdout: "jj 0.27.0", stderr: "", exitCode: 0 };
				case "jj workspace root":
					return { ok: true, stdout: "/repo", stderr: "", exitCode: 0 };
				case "git rev-parse --show-toplevel":
					return { ok: true, stdout: "/repo", stderr: "", exitCode: 0 };
				case "jj bookmark list -r @":
					return { ok: true, stdout: "feature/api: source123 12345678", stderr: "", exitCode: 0 };
				case "jj log -r @ --no-graph -T change_id.short()":
					return { ok: true, stdout: "source123", stderr: "", exitCode: 0 };
				case "git remote":
					return { ok: true, stdout: "origin", stderr: "", exitCode: 0 };
				case "git remote get-url origin":
					return { ok: true, stdout: "https://github.com/acme/repo.git", stderr: "", exitCode: 0 };
				case "git symbolic-ref --quiet --short refs/remotes/origin/HEAD":
					return { ok: true, stdout: "origin/main", stderr: "", exitCode: 0 };
				case "gh auth status --hostname github.com":
					return { ok: true, stdout: "Logged in", stderr: "", exitCode: 0 };
				case 'jj bookmark list --revisions all() ~ ::trunk() --template name ++ "\\t" ++ self.normal_target().change_id().shortest(12) ++ "\\t" ++ self.normal_target().commit_id().shortest(12) ++ "\\t" ++ if(self.synced(), "1", "0") ++ "\\t" ++ if(self.tracked(), "1", "0") ++ "\\n"':
					return {
						ok: true,
						stdout: "feature/api\tsource123\t12345678\t1\t1",
						stderr: "",
						exitCode: 0,
					};
				case 'jj log --revisions (::"feature/api") ~ ::trunk() --no-graph --template change_id.shortest(12) ++ "\\t" ++ commit_id.shortest(12) ++ "\\t" ++ description.first_line().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.name().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.email() ++ "\\t" ++ parents.map(|p| p.change_id().shortest(12)).join("|") ++ "\\t" ++ local_bookmarks.map(|b| b.name()).join("|") ++ "\\t" ++ remote_bookmarks.map(|b| separate("@", b.name(), b.remote())).join("|") ++ "\\t" ++ if(current_working_copy, "1", "0") ++ "\\n"':
					return {
						ok: true,
						stdout: "source123\t22222222\tSource change\troot000\tfeature/api\tfeature/api@origin\t1",
						stderr: "",
						exitCode: 0,
					};
				default:
					return { ok: false, stdout: "", stderr: `${joined} not mocked`, exitCode: 1 };
			}
		},
	);

	assert.equal(result.valid, false);
	assert.equal(result.commands.length, 0);
	assert.match(result.description, /already exists/i);
});

test("previewJjOperation returns a create change command preview", async () => {
	const result = await previewJjOperation("/repo", createChangeAfter, async ({ command, args }) => {
		const joined = `${command} ${args.join(" ")}`;
		switch (joined) {
			case "jj --version":
				return { ok: true, stdout: "jj 0.27.0", stderr: "", exitCode: 0 };
			case "jj workspace root":
				return { ok: true, stdout: "/repo", stderr: "", exitCode: 0 };
			case "git rev-parse --show-toplevel":
				return { ok: true, stdout: "/repo", stderr: "", exitCode: 0 };
			case "jj bookmark list -r @":
				return { ok: true, stdout: "feature/api: source123 12345678", stderr: "", exitCode: 0 };
			case "jj log -r @ --no-graph -T change_id.short()":
				return { ok: true, stdout: "source123", stderr: "", exitCode: 0 };
			case "git remote":
				return { ok: true, stdout: "origin", stderr: "", exitCode: 0 };
			case "git remote get-url origin":
				return { ok: true, stdout: "https://github.com/acme/repo.git", stderr: "", exitCode: 0 };
			case "git symbolic-ref --quiet --short refs/remotes/origin/HEAD":
				return { ok: true, stdout: "origin/main", stderr: "", exitCode: 0 };
			case "gh auth status --hostname github.com":
				return { ok: true, stdout: "Logged in", stderr: "", exitCode: 0 };
			case 'jj bookmark list --revisions all() ~ ::trunk() --template name ++ "\\t" ++ self.normal_target().change_id().shortest(12) ++ "\\t" ++ self.normal_target().commit_id().shortest(12) ++ "\\t" ++ if(self.synced(), "1", "0") ++ "\\t" ++ if(self.tracked(), "1", "0") ++ "\\n"':
				return {
					ok: true,
					stdout: "feature/api\tsource123\t12345678\t1\t1",
					stderr: "",
					exitCode: 0,
				};
			case 'jj log --revisions (::"feature/api") ~ ::trunk() --no-graph --template change_id.shortest(12) ++ "\\t" ++ commit_id.shortest(12) ++ "\\t" ++ description.first_line().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.name().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.email() ++ "\\t" ++ parents.map(|p| p.change_id().shortest(12)).join("|") ++ "\\t" ++ local_bookmarks.map(|b| b.name()).join("|") ++ "\\t" ++ remote_bookmarks.map(|b| separate("@", b.name(), b.remote())).join("|") ++ "\\t" ++ if(current_working_copy, "1", "0") ++ "\\n"':
				return {
					ok: true,
					stdout: [
						"root000\t11111111\troot\t\tmain\tmain@origin\t0",
						"source123\t22222222\tSource change\troot000\tfeature/api\tfeature/api@origin\t1",
						"target456\t33333333\tTarget change\troot000\t\t\t0",
					].join("\n"),
					stderr: "",
					exitCode: 0,
				};
			default:
				return { ok: false, stdout: "", stderr: `${joined} not mocked`, exitCode: 1 };
		}
	});

	assert.equal(result.valid, true);
	assert.deepEqual(result.commands[0], {
		command: "jj",
		args: ["new", "--insert-after", "target456", "--no-edit", "-m", "Follow-up change"],
	});
	assert.equal(result.risk, "medium");
});

test("previewJjOperation rejects empty create change previews", async () => {
	const result = await previewJjOperation(
		"/repo",
		{
			...createChangeAfter,
			message: "   ",
		},
		async ({ command, args }) => {
			const joined = `${command} ${args.join(" ")}`;
			switch (joined) {
				case "jj --version":
					return { ok: true, stdout: "jj 0.27.0", stderr: "", exitCode: 0 };
				case "jj workspace root":
					return { ok: true, stdout: "/repo", stderr: "", exitCode: 0 };
				case "git rev-parse --show-toplevel":
					return { ok: true, stdout: "/repo", stderr: "", exitCode: 0 };
				case "jj bookmark list -r @":
					return { ok: true, stdout: "feature/api: source123 12345678", stderr: "", exitCode: 0 };
				case "jj log -r @ --no-graph -T change_id.short()":
					return { ok: true, stdout: "source123", stderr: "", exitCode: 0 };
				case "git remote":
					return { ok: true, stdout: "origin", stderr: "", exitCode: 0 };
				case "git remote get-url origin":
					return { ok: true, stdout: "https://github.com/acme/repo.git", stderr: "", exitCode: 0 };
				case "git symbolic-ref --quiet --short refs/remotes/origin/HEAD":
					return { ok: true, stdout: "origin/main", stderr: "", exitCode: 0 };
				case "gh auth status --hostname github.com":
					return { ok: true, stdout: "Logged in", stderr: "", exitCode: 0 };
				case 'jj bookmark list --revisions all() ~ ::trunk() --template name ++ "\\t" ++ self.normal_target().change_id().shortest(12) ++ "\\t" ++ self.normal_target().commit_id().shortest(12) ++ "\\t" ++ if(self.synced(), "1", "0") ++ "\\t" ++ if(self.tracked(), "1", "0") ++ "\\n"':
					return {
						ok: true,
						stdout: "feature/api\tsource123\t12345678\t1\t1",
						stderr: "",
						exitCode: 0,
					};
				case 'jj log --revisions (::"feature/api") ~ ::trunk() --no-graph --template change_id.shortest(12) ++ "\\t" ++ commit_id.shortest(12) ++ "\\t" ++ description.first_line().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.name().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.email() ++ "\\t" ++ parents.map(|p| p.change_id().shortest(12)).join("|") ++ "\\t" ++ local_bookmarks.map(|b| b.name()).join("|") ++ "\\t" ++ remote_bookmarks.map(|b| separate("@", b.name(), b.remote())).join("|") ++ "\\t" ++ if(current_working_copy, "1", "0") ++ "\\n"':
					return {
						ok: true,
						stdout: "target456\t33333333\tTarget change\troot000\t\t\t0",
						stderr: "",
						exitCode: 0,
					};
				default:
					return { ok: false, stdout: "", stderr: `${joined} not mocked`, exitCode: 1 };
			}
		},
	);

	assert.equal(result.valid, false);
	assert.equal(result.commands.length, 0);
	assert.match(result.description, /non-empty/i);
});

test("previewJjOperation returns a move bookmark command preview", async () => {
	const result = await previewJjOperation("/repo", moveBookmark, async ({ command, args }) => {
		const joined = `${command} ${args.join(" ")}`;
		switch (joined) {
			case "jj --version":
				return { ok: true, stdout: "jj 0.27.0", stderr: "", exitCode: 0 };
			case "jj workspace root":
				return { ok: true, stdout: "/repo", stderr: "", exitCode: 0 };
			case "git rev-parse --show-toplevel":
				return { ok: true, stdout: "/repo", stderr: "", exitCode: 0 };
			case "jj bookmark list -r @":
				return { ok: true, stdout: "feature/api: source123 12345678", stderr: "", exitCode: 0 };
			case "jj log -r @ --no-graph -T change_id.short()":
				return { ok: true, stdout: "source123", stderr: "", exitCode: 0 };
			case "git remote":
				return { ok: true, stdout: "origin", stderr: "", exitCode: 0 };
			case "git remote get-url origin":
				return { ok: true, stdout: "https://github.com/acme/repo.git", stderr: "", exitCode: 0 };
			case "git symbolic-ref --quiet --short refs/remotes/origin/HEAD":
				return { ok: true, stdout: "origin/main", stderr: "", exitCode: 0 };
			case "gh auth status --hostname github.com":
				return { ok: true, stdout: "Logged in", stderr: "", exitCode: 0 };
			case 'jj bookmark list --revisions all() ~ ::trunk() --template name ++ "\\t" ++ self.normal_target().change_id().shortest(12) ++ "\\t" ++ self.normal_target().commit_id().shortest(12) ++ "\\t" ++ if(self.synced(), "1", "0") ++ "\\t" ++ if(self.tracked(), "1", "0") ++ "\\n"':
				return {
					ok: true,
					stdout: "feature/api\tsource123\t12345678\t1\t1",
					stderr: "",
					exitCode: 0,
				};
			case 'jj log --revisions (::"feature/api") ~ ::trunk() --no-graph --template change_id.shortest(12) ++ "\\t" ++ commit_id.shortest(12) ++ "\\t" ++ description.first_line().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.name().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.email() ++ "\\t" ++ parents.map(|p| p.change_id().shortest(12)).join("|") ++ "\\t" ++ local_bookmarks.map(|b| b.name()).join("|") ++ "\\t" ++ remote_bookmarks.map(|b| separate("@", b.name(), b.remote())).join("|") ++ "\\t" ++ if(current_working_copy, "1", "0") ++ "\\n"':
				return {
					ok: true,
					stdout: [
						"root000\t11111111\troot\t\tmain\tmain@origin\t0",
						"source123\t22222222\tSource change\troot000\tfeature/api\tfeature/api@origin\t1",
						"target456\t33333333\tTarget change\troot000\t\t\t0",
					].join("\n"),
					stderr: "",
					exitCode: 0,
				};
			default:
				return { ok: false, stdout: "", stderr: `${joined} not mocked`, exitCode: 1 };
		}
	});

	assert.equal(result.valid, true);
	assert.deepEqual(result.commands[0], {
		command: "jj",
		args: ["bookmark", "move", "feature/api", "--to", "target456", "--allow-backwards"],
	});
	assert.equal(result.risk, "medium");
});

test("previewJjOperation rejects no-op move bookmark previews", async () => {
	const result = await previewJjOperation(
		"/repo",
		{
			...moveBookmark,
			targetChangeId: "source123",
		},
		async ({ command, args }) => {
			const joined = `${command} ${args.join(" ")}`;
			switch (joined) {
				case "jj --version":
					return { ok: true, stdout: "jj 0.27.0", stderr: "", exitCode: 0 };
				case "jj workspace root":
					return { ok: true, stdout: "/repo", stderr: "", exitCode: 0 };
				case "git rev-parse --show-toplevel":
					return { ok: true, stdout: "/repo", stderr: "", exitCode: 0 };
				case "jj bookmark list -r @":
					return { ok: true, stdout: "feature/api: source123 12345678", stderr: "", exitCode: 0 };
				case "jj log -r @ --no-graph -T change_id.short()":
					return { ok: true, stdout: "source123", stderr: "", exitCode: 0 };
				case "git remote":
					return { ok: true, stdout: "origin", stderr: "", exitCode: 0 };
				case "git remote get-url origin":
					return { ok: true, stdout: "https://github.com/acme/repo.git", stderr: "", exitCode: 0 };
				case "git symbolic-ref --quiet --short refs/remotes/origin/HEAD":
					return { ok: true, stdout: "origin/main", stderr: "", exitCode: 0 };
				case "gh auth status --hostname github.com":
					return { ok: true, stdout: "Logged in", stderr: "", exitCode: 0 };
				case 'jj bookmark list --revisions all() ~ ::trunk() --template name ++ "\\t" ++ self.normal_target().change_id().shortest(12) ++ "\\t" ++ self.normal_target().commit_id().shortest(12) ++ "\\t" ++ if(self.synced(), "1", "0") ++ "\\t" ++ if(self.tracked(), "1", "0") ++ "\\n"':
					return {
						ok: true,
						stdout: "feature/api\tsource123\t12345678\t1\t1",
						stderr: "",
						exitCode: 0,
					};
				case 'jj log --revisions (::"feature/api") ~ ::trunk() --no-graph --template change_id.shortest(12) ++ "\\t" ++ commit_id.shortest(12) ++ "\\t" ++ description.first_line().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.name().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.email() ++ "\\t" ++ parents.map(|p| p.change_id().shortest(12)).join("|") ++ "\\t" ++ local_bookmarks.map(|b| b.name()).join("|") ++ "\\t" ++ remote_bookmarks.map(|b| separate("@", b.name(), b.remote())).join("|") ++ "\\t" ++ if(current_working_copy, "1", "0") ++ "\\n"':
					return {
						ok: true,
						stdout: "source123\t22222222\tSource change\troot000\tfeature/api\tfeature/api@origin\t1",
						stderr: "",
						exitCode: 0,
					};
				default:
					return { ok: false, stdout: "", stderr: `${joined} not mocked`, exitCode: 1 };
			}
		},
	);

	assert.equal(result.valid, false);
	assert.equal(result.commands.length, 0);
	assert.match(result.description, /already points/i);
});

test("previewJjOperation returns an abandon change command preview", async () => {
	const result = await previewJjOperation("/repo", abandonChange, async ({ command, args }) => {
		const joined = `${command} ${args.join(" ")}`;
		switch (joined) {
			case "jj --version":
				return { ok: true, stdout: "jj 0.27.0", stderr: "", exitCode: 0 };
			case "jj workspace root":
				return { ok: true, stdout: "/repo", stderr: "", exitCode: 0 };
			case "git rev-parse --show-toplevel":
				return { ok: true, stdout: "/repo", stderr: "", exitCode: 0 };
			case "jj bookmark list -r @":
				return { ok: true, stdout: "feature/api: source123 12345678", stderr: "", exitCode: 0 };
			case "jj log -r @ --no-graph -T change_id.short()":
				return { ok: true, stdout: "source123", stderr: "", exitCode: 0 };
			case "git remote":
				return { ok: true, stdout: "origin", stderr: "", exitCode: 0 };
			case "git remote get-url origin":
				return { ok: true, stdout: "https://github.com/acme/repo.git", stderr: "", exitCode: 0 };
			case "git symbolic-ref --quiet --short refs/remotes/origin/HEAD":
				return { ok: true, stdout: "origin/main", stderr: "", exitCode: 0 };
			case "gh auth status --hostname github.com":
				return { ok: true, stdout: "Logged in", stderr: "", exitCode: 0 };
			case 'jj bookmark list --revisions all() ~ ::trunk() --template name ++ "\\t" ++ self.normal_target().change_id().shortest(12) ++ "\\t" ++ self.normal_target().commit_id().shortest(12) ++ "\\t" ++ if(self.synced(), "1", "0") ++ "\\t" ++ if(self.tracked(), "1", "0") ++ "\\n"':
				return {
					ok: true,
					stdout: "feature/api\tsource123\t12345678\t1\t1",
					stderr: "",
					exitCode: 0,
				};
			case 'jj log --revisions (::"feature/api") ~ ::trunk() --no-graph --template change_id.shortest(12) ++ "\\t" ++ commit_id.shortest(12) ++ "\\t" ++ description.first_line().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.name().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.email() ++ "\\t" ++ parents.map(|p| p.change_id().shortest(12)).join("|") ++ "\\t" ++ local_bookmarks.map(|b| b.name()).join("|") ++ "\\t" ++ remote_bookmarks.map(|b| separate("@", b.name(), b.remote())).join("|") ++ "\\t" ++ if(current_working_copy, "1", "0") ++ "\\n"':
				return {
					ok: true,
					stdout: [
						"root000\t11111111\troot\t\tmain\tmain@origin\t0",
						"source123\t22222222\tSource change\troot000\tfeature/api\tfeature/api@origin\t1",
					].join("\n"),
					stderr: "",
					exitCode: 0,
				};
			default:
				return { ok: false, stdout: "", stderr: `${joined} not mocked`, exitCode: 1 };
		}
	});

	assert.equal(result.valid, true);
	assert.deepEqual(result.commands[0], {
		command: "jj",
		args: ["abandon", "source123"],
	});
	assert.equal(result.risk, "high");
	assert.equal(result.diagnostics.length, 2);
	assert.match(result.diagnostics[0]?.message ?? "", /current working-copy/i);
});

test("previewJjOperation rejects unknown abandon change previews", async () => {
	const result = await previewJjOperation(
		"/repo",
		{
			...abandonChange,
			changeId: "missing999",
		},
		async ({ command, args }) => {
			const joined = `${command} ${args.join(" ")}`;
			switch (joined) {
				case "jj --version":
					return { ok: true, stdout: "jj 0.27.0", stderr: "", exitCode: 0 };
				case "jj workspace root":
					return { ok: true, stdout: "/repo", stderr: "", exitCode: 0 };
				case "git rev-parse --show-toplevel":
					return { ok: true, stdout: "/repo", stderr: "", exitCode: 0 };
				case "jj bookmark list -r @":
					return { ok: true, stdout: "feature/api: source123 12345678", stderr: "", exitCode: 0 };
				case "jj log -r @ --no-graph -T change_id.short()":
					return { ok: true, stdout: "source123", stderr: "", exitCode: 0 };
				case "git remote":
					return { ok: true, stdout: "origin", stderr: "", exitCode: 0 };
				case "git remote get-url origin":
					return { ok: true, stdout: "https://github.com/acme/repo.git", stderr: "", exitCode: 0 };
				case "git symbolic-ref --quiet --short refs/remotes/origin/HEAD":
					return { ok: true, stdout: "origin/main", stderr: "", exitCode: 0 };
				case "gh auth status --hostname github.com":
					return { ok: true, stdout: "Logged in", stderr: "", exitCode: 0 };
				case 'jj bookmark list --revisions all() ~ ::trunk() --template name ++ "\\t" ++ self.normal_target().change_id().shortest(12) ++ "\\t" ++ self.normal_target().commit_id().shortest(12) ++ "\\t" ++ if(self.synced(), "1", "0") ++ "\\t" ++ if(self.tracked(), "1", "0") ++ "\\n"':
					return {
						ok: true,
						stdout: "feature/api\tsource123\t12345678\t1\t1",
						stderr: "",
						exitCode: 0,
					};
				case 'jj log --revisions (::"feature/api") ~ ::trunk() --no-graph --template change_id.shortest(12) ++ "\\t" ++ commit_id.shortest(12) ++ "\\t" ++ description.first_line().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.name().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.email() ++ "\\t" ++ parents.map(|p| p.change_id().shortest(12)).join("|") ++ "\\t" ++ local_bookmarks.map(|b| b.name()).join("|") ++ "\\t" ++ remote_bookmarks.map(|b| separate("@", b.name(), b.remote())).join("|") ++ "\\t" ++ if(current_working_copy, "1", "0") ++ "\\n"':
					return {
						ok: true,
						stdout: "source123\t22222222\tSource change\troot000\tfeature/api\tfeature/api@origin\t1",
						stderr: "",
						exitCode: 0,
					};
				default:
					return { ok: false, stdout: "", stderr: `${joined} not mocked`, exitCode: 1 };
			}
		},
	);

	assert.equal(result.valid, false);
	assert.equal(result.commands.length, 0);
	assert.match(result.description, /not available/i);
});

test("previewJjOperation returns a squash change command preview", async () => {
	const result = await previewJjOperation("/repo", squashChange, async ({ command, args }) => {
		const joined = `${command} ${args.join(" ")}`;
		switch (joined) {
			case "jj --version":
				return { ok: true, stdout: "jj 0.27.0", stderr: "", exitCode: 0 };
			case "jj workspace root":
				return { ok: true, stdout: "/repo", stderr: "", exitCode: 0 };
			case "git rev-parse --show-toplevel":
				return { ok: true, stdout: "/repo", stderr: "", exitCode: 0 };
			case "jj bookmark list -r @":
				return { ok: true, stdout: "feature/api: source123 12345678", stderr: "", exitCode: 0 };
			case "jj log -r @ --no-graph -T change_id.short()":
				return { ok: true, stdout: "source123", stderr: "", exitCode: 0 };
			case "git remote":
				return { ok: true, stdout: "origin", stderr: "", exitCode: 0 };
			case "git remote get-url origin":
				return { ok: true, stdout: "https://github.com/acme/repo.git", stderr: "", exitCode: 0 };
			case "git symbolic-ref --quiet --short refs/remotes/origin/HEAD":
				return { ok: true, stdout: "origin/main", stderr: "", exitCode: 0 };
			case "gh auth status --hostname github.com":
				return { ok: true, stdout: "Logged in", stderr: "", exitCode: 0 };
			case 'jj bookmark list --revisions all() ~ ::trunk() --template name ++ "\\t" ++ self.normal_target().change_id().shortest(12) ++ "\\t" ++ self.normal_target().commit_id().shortest(12) ++ "\\t" ++ if(self.synced(), "1", "0") ++ "\\t" ++ if(self.tracked(), "1", "0") ++ "\\n"':
				return {
					ok: true,
					stdout: "feature/api\tsource123\t12345678\t1\t1",
					stderr: "",
					exitCode: 0,
				};
			case 'jj log --revisions (::"feature/api") ~ ::trunk() --no-graph --template change_id.shortest(12) ++ "\\t" ++ commit_id.shortest(12) ++ "\\t" ++ description.first_line().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.name().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.email() ++ "\\t" ++ parents.map(|p| p.change_id().shortest(12)).join("|") ++ "\\t" ++ local_bookmarks.map(|b| b.name()).join("|") ++ "\\t" ++ remote_bookmarks.map(|b| separate("@", b.name(), b.remote())).join("|") ++ "\\t" ++ if(current_working_copy, "1", "0") ++ "\\n"':
				return {
					ok: true,
					stdout: [
						"root000\t11111111\troot\t\tmain\tmain@origin\t0",
						"source123\t22222222\tSource change\troot000\tfeature/api\tfeature/api@origin\t1",
						"target456\t33333333\tTarget change\troot000\ttarget/bookmark\t\t0",
					].join("\n"),
					stderr: "",
					exitCode: 0,
				};
			default:
				return { ok: false, stdout: "", stderr: `${joined} not mocked`, exitCode: 1 };
		}
	});

	assert.equal(result.valid, true);
	assert.deepEqual(result.commands[0], {
		command: "jj",
		args: ["squash", "--from", "source123", "--into", "target456"],
	});
	assert.deepEqual(result.affectedBookmarks, ["feature/api", "target/bookmark"]);
	assert.equal(result.risk, "high");
	assert.equal(result.diagnostics.length, 2);
});

test("previewJjOperation rejects descendant squash targets", async () => {
	const result = await previewJjOperation("/repo", squashChange, async ({ command, args }) => {
		const joined = `${command} ${args.join(" ")}`;
		switch (joined) {
			case "jj --version":
				return { ok: true, stdout: "jj 0.27.0", stderr: "", exitCode: 0 };
			case "jj workspace root":
				return { ok: true, stdout: "/repo", stderr: "", exitCode: 0 };
			case "git rev-parse --show-toplevel":
				return { ok: true, stdout: "/repo", stderr: "", exitCode: 0 };
			case "jj bookmark list -r @":
				return { ok: true, stdout: "feature/api: source123 12345678", stderr: "", exitCode: 0 };
			case "jj log -r @ --no-graph -T change_id.short()":
				return { ok: true, stdout: "source123", stderr: "", exitCode: 0 };
			case "git remote":
				return { ok: true, stdout: "origin", stderr: "", exitCode: 0 };
			case "git remote get-url origin":
				return { ok: true, stdout: "https://github.com/acme/repo.git", stderr: "", exitCode: 0 };
			case "git symbolic-ref --quiet --short refs/remotes/origin/HEAD":
				return { ok: true, stdout: "origin/main", stderr: "", exitCode: 0 };
			case "gh auth status --hostname github.com":
				return { ok: true, stdout: "Logged in", stderr: "", exitCode: 0 };
			case 'jj bookmark list --revisions all() ~ ::trunk() --template name ++ "\\t" ++ self.normal_target().change_id().shortest(12) ++ "\\t" ++ self.normal_target().commit_id().shortest(12) ++ "\\t" ++ if(self.synced(), "1", "0") ++ "\\t" ++ if(self.tracked(), "1", "0") ++ "\\n"':
				return {
					ok: true,
					stdout: "feature/api\tsource123\t12345678\t1\t1",
					stderr: "",
					exitCode: 0,
				};
			case 'jj log --revisions (::"feature/api") ~ ::trunk() --no-graph --template change_id.shortest(12) ++ "\\t" ++ commit_id.shortest(12) ++ "\\t" ++ description.first_line().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.name().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.email() ++ "\\t" ++ parents.map(|p| p.change_id().shortest(12)).join("|") ++ "\\t" ++ local_bookmarks.map(|b| b.name()).join("|") ++ "\\t" ++ remote_bookmarks.map(|b| separate("@", b.name(), b.remote())).join("|") ++ "\\t" ++ if(current_working_copy, "1", "0") ++ "\\n"':
				return {
					ok: true,
					stdout: [
						"root000\t11111111\troot\t\tmain\tmain@origin\t0",
						"source123\t22222222\tSource change\troot000\tfeature/api\tfeature/api@origin\t1",
						"target456\t33333333\tTarget child\tsource123\t\t\t0",
					].join("\n"),
					stderr: "",
					exitCode: 0,
				};
			default:
				return { ok: false, stdout: "", stderr: `${joined} not mocked`, exitCode: 1 };
		}
	});

	assert.equal(result.valid, false);
	assert.equal(result.commands.length, 0);
	assert.match(result.description, /descendants/i);
});

test("previewJjOperation returns an absorb file command preview", async () => {
	const result = await previewJjOperation("/repo", absorbFile, async ({ command, args }) => {
		const joined = `${command} ${args.join(" ")}`;
		switch (joined) {
			case "jj --version":
				return { ok: true, stdout: "jj 0.27.0", stderr: "", exitCode: 0 };
			case "jj workspace root":
				return { ok: true, stdout: "/repo", stderr: "", exitCode: 0 };
			case "git rev-parse --show-toplevel":
				return { ok: true, stdout: "/repo", stderr: "", exitCode: 0 };
			case "jj bookmark list -r @":
				return { ok: true, stdout: "feature/api: source123 12345678", stderr: "", exitCode: 0 };
			case "jj log -r @ --no-graph -T change_id.short()":
				return { ok: true, stdout: "source123", stderr: "", exitCode: 0 };
			case "git remote":
				return { ok: true, stdout: "origin", stderr: "", exitCode: 0 };
			case "git remote get-url origin":
				return { ok: true, stdout: "https://github.com/acme/repo.git", stderr: "", exitCode: 0 };
			case "git symbolic-ref --quiet --short refs/remotes/origin/HEAD":
				return { ok: true, stdout: "origin/main", stderr: "", exitCode: 0 };
			case "gh auth status --hostname github.com":
				return { ok: true, stdout: "Logged in", stderr: "", exitCode: 0 };
			case 'jj bookmark list --revisions all() ~ ::trunk() --template name ++ "\\t" ++ self.normal_target().change_id().shortest(12) ++ "\\t" ++ self.normal_target().commit_id().shortest(12) ++ "\\t" ++ if(self.synced(), "1", "0") ++ "\\t" ++ if(self.tracked(), "1", "0") ++ "\\n"':
				return {
					ok: true,
					stdout: "feature/api\tsource123\t12345678\t1\t1",
					stderr: "",
					exitCode: 0,
				};
			case 'jj log --revisions (::"feature/api") ~ ::trunk() --no-graph --template change_id.shortest(12) ++ "\\t" ++ commit_id.shortest(12) ++ "\\t" ++ description.first_line().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.name().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.email() ++ "\\t" ++ parents.map(|p| p.change_id().shortest(12)).join("|") ++ "\\t" ++ local_bookmarks.map(|b| b.name()).join("|") ++ "\\t" ++ remote_bookmarks.map(|b| separate("@", b.name(), b.remote())).join("|") ++ "\\t" ++ if(current_working_copy, "1", "0") ++ "\\n"':
				return {
					ok: true,
					stdout: [
						"root000\t11111111\troot\t\tmain\tmain@origin\t0",
						"source123\t22222222\tSource change\troot000\tfeature/api\tfeature/api@origin\t1",
					].join("\n"),
					stderr: "",
					exitCode: 0,
				};
			case "jj diff --summary -r @":
				return { ok: true, stdout: "M src/app.ts", stderr: "", exitCode: 0 };
			default:
				return { ok: false, stdout: "", stderr: `${joined} not mocked`, exitCode: 1 };
		}
	});

	assert.equal(result.valid, true);
	assert.deepEqual(result.commands[0], {
		command: "jj",
		args: ["absorb", "--from", "@", "--into", "root000", "--", "src/app.ts"],
	});
	assert.equal(result.risk, "medium");
	assert.equal(result.affectedChangeIds[0], "source123");
});

test("previewJjOperation rejects absorb file previews for missing working-copy paths", async () => {
	const result = await previewJjOperation(
		"/repo",
		{
			...absorbFile,
			paths: ["missing.ts"],
		},
		async ({ command, args }) => {
			const joined = `${command} ${args.join(" ")}`;
			switch (joined) {
				case "jj --version":
					return { ok: true, stdout: "jj 0.27.0", stderr: "", exitCode: 0 };
				case "jj workspace root":
					return { ok: true, stdout: "/repo", stderr: "", exitCode: 0 };
				case "git rev-parse --show-toplevel":
					return { ok: true, stdout: "/repo", stderr: "", exitCode: 0 };
				case "jj bookmark list -r @":
					return { ok: true, stdout: "feature/api: source123 12345678", stderr: "", exitCode: 0 };
				case "jj log -r @ --no-graph -T change_id.short()":
					return { ok: true, stdout: "source123", stderr: "", exitCode: 0 };
				case "git remote":
					return { ok: true, stdout: "origin", stderr: "", exitCode: 0 };
				case "git remote get-url origin":
					return { ok: true, stdout: "https://github.com/acme/repo.git", stderr: "", exitCode: 0 };
				case "git symbolic-ref --quiet --short refs/remotes/origin/HEAD":
					return { ok: true, stdout: "origin/main", stderr: "", exitCode: 0 };
				case "gh auth status --hostname github.com":
					return { ok: true, stdout: "Logged in", stderr: "", exitCode: 0 };
				case 'jj bookmark list --revisions all() ~ ::trunk() --template name ++ "\\t" ++ self.normal_target().change_id().shortest(12) ++ "\\t" ++ self.normal_target().commit_id().shortest(12) ++ "\\t" ++ if(self.synced(), "1", "0") ++ "\\t" ++ if(self.tracked(), "1", "0") ++ "\\n"':
					return {
						ok: true,
						stdout: "feature/api\tsource123\t12345678\t1\t1",
						stderr: "",
						exitCode: 0,
					};
				case 'jj log --revisions (::"feature/api") ~ ::trunk() --no-graph --template change_id.shortest(12) ++ "\\t" ++ commit_id.shortest(12) ++ "\\t" ++ description.first_line().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.name().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.email() ++ "\\t" ++ parents.map(|p| p.change_id().shortest(12)).join("|") ++ "\\t" ++ local_bookmarks.map(|b| b.name()).join("|") ++ "\\t" ++ remote_bookmarks.map(|b| separate("@", b.name(), b.remote())).join("|") ++ "\\t" ++ if(current_working_copy, "1", "0") ++ "\\n"':
					return {
						ok: true,
						stdout: [
							"root000\t11111111\troot\t\tmain\tmain@origin\t0",
							"source123\t22222222\tSource change\troot000\tfeature/api\tfeature/api@origin\t1",
						].join("\n"),
						stderr: "",
						exitCode: 0,
					};
				case "jj diff --summary -r @":
					return { ok: true, stdout: "M src/app.ts", stderr: "", exitCode: 0 };
				default:
					return { ok: false, stdout: "", stderr: `${joined} not mocked`, exitCode: 1 };
			}
		},
	);

	assert.equal(result.valid, false);
	assert.equal(result.commands.length, 0);
	assert.match(result.description, /no longer available/i);
});

test("previewJjOperation returns a restore file command preview", async () => {
	const result = await previewJjOperation("/repo", restoreFile, async ({ command, args }) => {
		const joined = `${command} ${args.join(" ")}`;
		switch (joined) {
			case "jj --version":
				return { ok: true, stdout: "jj 0.27.0", stderr: "", exitCode: 0 };
			case "jj workspace root":
				return { ok: true, stdout: "/repo", stderr: "", exitCode: 0 };
			case "git rev-parse --show-toplevel":
				return { ok: true, stdout: "/repo", stderr: "", exitCode: 0 };
			case "jj bookmark list -r @":
				return { ok: true, stdout: "feature/api: source123 12345678", stderr: "", exitCode: 0 };
			case "jj log -r @ --no-graph -T change_id.short()":
				return { ok: true, stdout: "source123", stderr: "", exitCode: 0 };
			case "git remote":
				return { ok: true, stdout: "origin", stderr: "", exitCode: 0 };
			case "git remote get-url origin":
				return { ok: true, stdout: "https://github.com/acme/repo.git", stderr: "", exitCode: 0 };
			case "git symbolic-ref --quiet --short refs/remotes/origin/HEAD":
				return { ok: true, stdout: "origin/main", stderr: "", exitCode: 0 };
			case "gh auth status --hostname github.com":
				return { ok: true, stdout: "Logged in", stderr: "", exitCode: 0 };
			case 'jj bookmark list --revisions all() ~ ::trunk() --template name ++ "\\t" ++ self.normal_target().change_id().shortest(12) ++ "\\t" ++ self.normal_target().commit_id().shortest(12) ++ "\\t" ++ if(self.synced(), "1", "0") ++ "\\t" ++ if(self.tracked(), "1", "0") ++ "\\n"':
				return {
					ok: true,
					stdout: "feature/api\tsource123\t12345678\t1\t1",
					stderr: "",
					exitCode: 0,
				};
			case 'jj log --revisions (::"feature/api") ~ ::trunk() --no-graph --template change_id.shortest(12) ++ "\\t" ++ commit_id.shortest(12) ++ "\\t" ++ description.first_line().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.name().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.email() ++ "\\t" ++ parents.map(|p| p.change_id().shortest(12)).join("|") ++ "\\t" ++ local_bookmarks.map(|b| b.name()).join("|") ++ "\\t" ++ remote_bookmarks.map(|b| separate("@", b.name(), b.remote())).join("|") ++ "\\t" ++ if(current_working_copy, "1", "0") ++ "\\n"':
				return {
					ok: true,
					stdout: [
						"root000\t11111111\troot\t\tmain\tmain@origin\t0",
						"source123\t22222222\tSource change\troot000\tfeature/api\tfeature/api@origin\t1",
					].join("\n"),
					stderr: "",
					exitCode: 0,
				};
			case "jj diff --summary -r @":
				return { ok: true, stdout: "M src/app.ts", stderr: "", exitCode: 0 };
			default:
				return { ok: false, stdout: "", stderr: `${joined} not mocked`, exitCode: 1 };
		}
	});

	assert.equal(result.valid, true);
	assert.deepEqual(result.commands[0], {
		command: "jj",
		args: ["restore", "--", "src/app.ts"],
	});
	assert.equal(result.risk, "medium");
	assert.deepEqual(result.affectedChangeIds, ["source123"]);
});

test("previewJjOperation rejects restore file previews for missing working-copy paths", async () => {
	const result = await previewJjOperation(
		"/repo",
		{
			...restoreFile,
			paths: ["missing.ts"],
		},
		async ({ command, args }) => {
			const joined = `${command} ${args.join(" ")}`;
			switch (joined) {
				case "jj --version":
					return { ok: true, stdout: "jj 0.27.0", stderr: "", exitCode: 0 };
				case "jj workspace root":
					return { ok: true, stdout: "/repo", stderr: "", exitCode: 0 };
				case "git rev-parse --show-toplevel":
					return { ok: true, stdout: "/repo", stderr: "", exitCode: 0 };
				case "jj bookmark list -r @":
					return { ok: true, stdout: "feature/api: source123 12345678", stderr: "", exitCode: 0 };
				case "jj log -r @ --no-graph -T change_id.short()":
					return { ok: true, stdout: "source123", stderr: "", exitCode: 0 };
				case "git remote":
					return { ok: true, stdout: "origin", stderr: "", exitCode: 0 };
				case "git remote get-url origin":
					return { ok: true, stdout: "https://github.com/acme/repo.git", stderr: "", exitCode: 0 };
				case "git symbolic-ref --quiet --short refs/remotes/origin/HEAD":
					return { ok: true, stdout: "origin/main", stderr: "", exitCode: 0 };
				case "gh auth status --hostname github.com":
					return { ok: true, stdout: "Logged in", stderr: "", exitCode: 0 };
				case 'jj bookmark list --revisions all() ~ ::trunk() --template name ++ "\\t" ++ self.normal_target().change_id().shortest(12) ++ "\\t" ++ self.normal_target().commit_id().shortest(12) ++ "\\t" ++ if(self.synced(), "1", "0") ++ "\\t" ++ if(self.tracked(), "1", "0") ++ "\\n"':
					return {
						ok: true,
						stdout: "feature/api\tsource123\t12345678\t1\t1",
						stderr: "",
						exitCode: 0,
					};
				case 'jj log --revisions (::"feature/api") ~ ::trunk() --no-graph --template change_id.shortest(12) ++ "\\t" ++ commit_id.shortest(12) ++ "\\t" ++ description.first_line().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.name().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.email() ++ "\\t" ++ parents.map(|p| p.change_id().shortest(12)).join("|") ++ "\\t" ++ local_bookmarks.map(|b| b.name()).join("|") ++ "\\t" ++ remote_bookmarks.map(|b| separate("@", b.name(), b.remote())).join("|") ++ "\\t" ++ if(current_working_copy, "1", "0") ++ "\\n"':
					return {
						ok: true,
						stdout: [
							"root000\t11111111\troot\t\tmain\tmain@origin\t0",
							"source123\t22222222\tSource change\troot000\tfeature/api\tfeature/api@origin\t1",
						].join("\n"),
						stderr: "",
						exitCode: 0,
					};
				case "jj diff --summary -r @":
					return { ok: true, stdout: "M src/app.ts", stderr: "", exitCode: 0 };
				default:
					return { ok: false, stdout: "", stderr: `${joined} not mocked`, exitCode: 1 };
			}
		},
	);

	assert.equal(result.valid, false);
	assert.equal(result.commands.length, 0);
	assert.match(result.description, /no longer available/i);
});

test("previewJjOperation returns an undo command preview", async () => {
	const result = await previewJjOperation("/repo", undoLast, async ({ command, args }) => {
		const joined = `${command} ${args.join(" ")}`;
		switch (joined) {
			case "jj --version":
				return { ok: true, stdout: "jj 0.27.0", stderr: "", exitCode: 0 };
			case "jj workspace root":
				return { ok: true, stdout: "/repo", stderr: "", exitCode: 0 };
			case "git rev-parse --show-toplevel":
				return { ok: true, stdout: "/repo", stderr: "", exitCode: 0 };
			case "jj bookmark list -r @":
				return { ok: true, stdout: "feature/api: source123 12345678", stderr: "", exitCode: 0 };
			case "jj log -r @ --no-graph -T change_id.short()":
				return { ok: true, stdout: "source123", stderr: "", exitCode: 0 };
			case "git remote":
				return { ok: true, stdout: "origin", stderr: "", exitCode: 0 };
			case "git remote get-url origin":
				return { ok: true, stdout: "https://github.com/acme/repo.git", stderr: "", exitCode: 0 };
			case "git symbolic-ref --quiet --short refs/remotes/origin/HEAD":
				return { ok: true, stdout: "origin/main", stderr: "", exitCode: 0 };
			case "gh auth status --hostname github.com":
				return { ok: true, stdout: "Logged in", stderr: "", exitCode: 0 };
			case 'jj bookmark list --revisions all() ~ ::trunk() --template name ++ "\\t" ++ self.normal_target().change_id().shortest(12) ++ "\\t" ++ self.normal_target().commit_id().shortest(12) ++ "\\t" ++ if(self.synced(), "1", "0") ++ "\\t" ++ if(self.tracked(), "1", "0") ++ "\\n"':
				return {
					ok: true,
					stdout: "feature/api\tsource123\t12345678\t1\t1",
					stderr: "",
					exitCode: 0,
				};
			case 'jj log --revisions (::"feature/api") ~ ::trunk() --no-graph --template change_id.shortest(12) ++ "\\t" ++ commit_id.shortest(12) ++ "\\t" ++ description.first_line().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.name().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.email() ++ "\\t" ++ parents.map(|p| p.change_id().shortest(12)).join("|") ++ "\\t" ++ local_bookmarks.map(|b| b.name()).join("|") ++ "\\t" ++ remote_bookmarks.map(|b| separate("@", b.name(), b.remote())).join("|") ++ "\\t" ++ if(current_working_copy, "1", "0") ++ "\\n"':
				return {
					ok: true,
					stdout: "source123\t22222222\tSource change\troot000\tfeature/api\tfeature/api@origin\t1",
					stderr: "",
					exitCode: 0,
				};
			default:
				return { ok: false, stdout: "", stderr: `${joined} not mocked`, exitCode: 1 };
		}
	});

	assert.equal(result.valid, true);
	assert.deepEqual(result.commands[0], {
		command: "jj",
		args: ["undo"],
	});
	assert.equal(result.risk, "high");
	assert.match(result.description, /most recent JJ operation/i);
});

test("previewJjOperation returns a redo command preview", async () => {
	const result = await previewJjOperation("/repo", redoLast, async ({ command, args }) => {
		const joined = `${command} ${args.join(" ")}`;
		switch (joined) {
			case "jj --version":
				return { ok: true, stdout: "jj 0.27.0", stderr: "", exitCode: 0 };
			case "jj workspace root":
				return { ok: true, stdout: "/repo", stderr: "", exitCode: 0 };
			case "git rev-parse --show-toplevel":
				return { ok: true, stdout: "/repo", stderr: "", exitCode: 0 };
			case "jj bookmark list -r @":
				return { ok: true, stdout: "feature/api: source123 12345678", stderr: "", exitCode: 0 };
			case "jj log -r @ --no-graph -T change_id.short()":
				return { ok: true, stdout: "source123", stderr: "", exitCode: 0 };
			case "git remote":
				return { ok: true, stdout: "origin", stderr: "", exitCode: 0 };
			case "git remote get-url origin":
				return { ok: true, stdout: "https://github.com/acme/repo.git", stderr: "", exitCode: 0 };
			case "git symbolic-ref --quiet --short refs/remotes/origin/HEAD":
				return { ok: true, stdout: "origin/main", stderr: "", exitCode: 0 };
			case "gh auth status --hostname github.com":
				return { ok: true, stdout: "Logged in", stderr: "", exitCode: 0 };
			case 'jj bookmark list --revisions all() ~ ::trunk() --template name ++ "\\t" ++ self.normal_target().change_id().shortest(12) ++ "\\t" ++ self.normal_target().commit_id().shortest(12) ++ "\\t" ++ if(self.synced(), "1", "0") ++ "\\t" ++ if(self.tracked(), "1", "0") ++ "\\n"':
				return {
					ok: true,
					stdout: "feature/api\tsource123\t12345678\t1\t1",
					stderr: "",
					exitCode: 0,
				};
			case 'jj log --revisions (::"feature/api") ~ ::trunk() --no-graph --template change_id.shortest(12) ++ "\\t" ++ commit_id.shortest(12) ++ "\\t" ++ description.first_line().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.name().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.email() ++ "\\t" ++ parents.map(|p| p.change_id().shortest(12)).join("|") ++ "\\t" ++ local_bookmarks.map(|b| b.name()).join("|") ++ "\\t" ++ remote_bookmarks.map(|b| separate("@", b.name(), b.remote())).join("|") ++ "\\t" ++ if(current_working_copy, "1", "0") ++ "\\n"':
				return {
					ok: true,
					stdout: "source123\t22222222\tSource change\troot000\tfeature/api\tfeature/api@origin\t1",
					stderr: "",
					exitCode: 0,
				};
			default:
				return { ok: false, stdout: "", stderr: `${joined} not mocked`, exitCode: 1 };
		}
	});

	assert.equal(result.valid, true);
	assert.deepEqual(result.commands[0], {
		command: "jj",
		args: ["redo"],
	});
	assert.equal(result.risk, "medium");
	assert.match(result.description, /most recently undone/i);
});

test("previewJjOperation returns an edit message command preview", async () => {
	const result = await previewJjOperation("/repo", editMessage, async ({ command, args }) => {
		const joined = `${command} ${args.join(" ")}`;
		switch (joined) {
			case "jj --version":
				return { ok: true, stdout: "jj 0.27.0", stderr: "", exitCode: 0 };
			case "jj workspace root":
				return { ok: true, stdout: "/repo", stderr: "", exitCode: 0 };
			case "git rev-parse --show-toplevel":
				return { ok: true, stdout: "/repo", stderr: "", exitCode: 0 };
			case "jj bookmark list -r @":
				return { ok: true, stdout: "feature/api: source123 12345678", stderr: "", exitCode: 0 };
			case "jj log -r @ --no-graph -T change_id.short()":
				return { ok: true, stdout: "source123", stderr: "", exitCode: 0 };
			case "git remote":
				return { ok: true, stdout: "origin", stderr: "", exitCode: 0 };
			case "git remote get-url origin":
				return { ok: true, stdout: "https://github.com/acme/repo.git", stderr: "", exitCode: 0 };
			case "git symbolic-ref --quiet --short refs/remotes/origin/HEAD":
				return { ok: true, stdout: "origin/main", stderr: "", exitCode: 0 };
			case "gh auth status --hostname github.com":
				return { ok: true, stdout: "Logged in", stderr: "", exitCode: 0 };
			case 'jj bookmark list --revisions all() ~ ::trunk() --template name ++ "\\t" ++ self.normal_target().change_id().shortest(12) ++ "\\t" ++ self.normal_target().commit_id().shortest(12) ++ "\\t" ++ if(self.synced(), "1", "0") ++ "\\t" ++ if(self.tracked(), "1", "0") ++ "\\n"':
				return {
					ok: true,
					stdout: "feature/api\tsource123\t12345678\t1\t1",
					stderr: "",
					exitCode: 0,
				};
			case 'jj log --revisions (::"feature/api") ~ ::trunk() --no-graph --template change_id.shortest(12) ++ "\\t" ++ commit_id.shortest(12) ++ "\\t" ++ description.first_line().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.name().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.email() ++ "\\t" ++ parents.map(|p| p.change_id().shortest(12)).join("|") ++ "\\t" ++ local_bookmarks.map(|b| b.name()).join("|") ++ "\\t" ++ remote_bookmarks.map(|b| separate("@", b.name(), b.remote())).join("|") ++ "\\t" ++ if(current_working_copy, "1", "0") ++ "\\n"':
				return {
					ok: true,
					stdout: "source123\t22222222\tSource change\troot000\tfeature/api\tfeature/api@origin\t1",
					stderr: "",
					exitCode: 0,
				};
			default:
				return { ok: false, stdout: "", stderr: `${joined} not mocked`, exitCode: 1 };
		}
	});

	assert.equal(result.valid, true);
	assert.deepEqual(result.commands[0], {
		command: "jj",
		args: ["describe", "-r", "source123", "-m", "Refine API layer"],
	});
	assert.equal(result.affectedChangeIds[0], "source123");
});

test("previewJjOperation rejects empty edit message previews", async () => {
	const result = await previewJjOperation(
		"/repo",
		{
			...editMessage,
			message: "   ",
		},
		async ({ command, args }) => {
			const joined = `${command} ${args.join(" ")}`;
			switch (joined) {
				case "jj --version":
					return { ok: true, stdout: "jj 0.27.0", stderr: "", exitCode: 0 };
				case "jj workspace root":
					return { ok: true, stdout: "/repo", stderr: "", exitCode: 0 };
				case "git rev-parse --show-toplevel":
					return { ok: true, stdout: "/repo", stderr: "", exitCode: 0 };
				case "jj bookmark list -r @":
					return { ok: true, stdout: "feature/api: source123 12345678", stderr: "", exitCode: 0 };
				case "jj log -r @ --no-graph -T change_id.short()":
					return { ok: true, stdout: "source123", stderr: "", exitCode: 0 };
				case "git remote":
					return { ok: true, stdout: "origin", stderr: "", exitCode: 0 };
				case "git remote get-url origin":
					return { ok: true, stdout: "https://github.com/acme/repo.git", stderr: "", exitCode: 0 };
				case "git symbolic-ref --quiet --short refs/remotes/origin/HEAD":
					return { ok: true, stdout: "origin/main", stderr: "", exitCode: 0 };
				case "gh auth status --hostname github.com":
					return { ok: true, stdout: "Logged in", stderr: "", exitCode: 0 };
				case 'jj bookmark list --revisions all() ~ ::trunk() --template name ++ "\\t" ++ self.normal_target().change_id().shortest(12) ++ "\\t" ++ self.normal_target().commit_id().shortest(12) ++ "\\t" ++ if(self.synced(), "1", "0") ++ "\\t" ++ if(self.tracked(), "1", "0") ++ "\\n"':
					return {
						ok: true,
						stdout: "feature/api\tsource123\t12345678\t1\t1",
						stderr: "",
						exitCode: 0,
					};
				case 'jj log --revisions (::"feature/api") ~ ::trunk() --no-graph --template change_id.shortest(12) ++ "\\t" ++ commit_id.shortest(12) ++ "\\t" ++ description.first_line().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.name().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.email() ++ "\\t" ++ parents.map(|p| p.change_id().shortest(12)).join("|") ++ "\\t" ++ local_bookmarks.map(|b| b.name()).join("|") ++ "\\t" ++ remote_bookmarks.map(|b| separate("@", b.name(), b.remote())).join("|") ++ "\\t" ++ if(current_working_copy, "1", "0") ++ "\\n"':
					return {
						ok: true,
						stdout: "source123\t22222222\tSource change\troot000\tfeature/api\tfeature/api@origin\t1",
						stderr: "",
						exitCode: 0,
					};
				default:
					return { ok: false, stdout: "", stderr: `${joined} not mocked`, exitCode: 1 };
			}
		},
	);

	assert.equal(result.valid, false);
	assert.equal(result.commands.length, 0);
	assert.match(result.description, /non-empty/i);
});
