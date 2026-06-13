import assert from "node:assert/strict";
import test from "node:test";
import { applyJjOperation } from "../src/vcs/jj/apply.js";
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

const splitChange: VcsPreviewOperationInput = {
	kind: "split_change",
	changeId: "source123",
	message: "Extract app",
	paths: ["src/app.ts"],
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

function createPreviewRunner(commandLog: string[]) {
	return async ({ command, args }: { command: string; args: string[]; cwd: string }) => {
		const joined = `${command} ${args.join(" ")}`;
		commandLog.push(joined);
		switch (joined) {
			case "jj --version":
				return { ok: true, stdout: "jj 0.27.0", stderr: "", exitCode: 0 };
			case "jj workspace root":
				return { ok: true, stdout: "/repo", stderr: "", exitCode: 0 };
			case "git rev-parse --show-toplevel":
				return { ok: true, stdout: "/repo", stderr: "", exitCode: 0 };
			case "jj bookmark list --ignore-working-copy --at-op=@ -r @":
				return { ok: true, stdout: "feature/api: source123 12345678", stderr: "", exitCode: 0 };
			case "jj log --ignore-working-copy --at-op=@ -r @ --no-graph -T change_id.short()":
				return { ok: true, stdout: "source123", stderr: "", exitCode: 0 };
			case "git remote":
				return { ok: true, stdout: "origin", stderr: "", exitCode: 0 };
			case "git remote get-url origin":
				return { ok: true, stdout: "https://github.com/acme/repo.git", stderr: "", exitCode: 0 };
			case "git symbolic-ref --quiet --short refs/remotes/origin/HEAD":
				return { ok: true, stdout: "origin/main", stderr: "", exitCode: 0 };
			case "gh auth status --hostname github.com":
				return { ok: true, stdout: "Logged in", stderr: "", exitCode: 0 };
			case 'jj bookmark list --ignore-working-copy --at-op=@ --revisions all() ~ ::trunk() --template name ++ "\\t" ++ self.normal_target().change_id().shortest(12) ++ "\\t" ++ self.normal_target().commit_id().shortest(12) ++ "\\t" ++ if(self.synced(), "1", "0") ++ "\\t" ++ if(self.tracked(), "1", "0") ++ "\\n"':
				return {
					ok: true,
					stdout: "feature/api\tsource123\t12345678\t1\t1",
					stderr: "",
					exitCode: 0,
				};
			case 'jj log --ignore-working-copy --at-op=@ --revisions (::"feature/api") ~ ::trunk() --no-graph --template change_id.shortest(12) ++ "\\t" ++ commit_id.shortest(12) ++ "\\t" ++ description.first_line().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.name().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.email() ++ "\\t" ++ parents.map(|p| p.change_id().shortest(12)).join("|") ++ "\\t" ++ local_bookmarks.map(|b| b.name()).join("|") ++ "\\t" ++ remote_bookmarks.map(|b| separate("@", b.name(), b.remote())).join("|") ++ "\\t" ++ if(current_working_copy, "1", "0") ++ "\\n"':
				return {
					ok: true,
					stdout: [
						"root000\t11111111\troot\tSteve Juma\tsteve@example.com\t\tmain\tmain@origin\t0",
						"source123\t22222222\tSource change\tSteve Juma\tsteve@example.com\troot000\tfeature/api\tfeature/api@origin\t1",
						"target456\t33333333\tTarget change\tSteve Juma\tsteve@example.com\troot000\t\t\t0",
					].join("\n"),
					stderr: "",
					exitCode: 0,
				};
			case "jj diff --summary -r @":
				return {
					ok: true,
					stdout: "M src/app.ts",
					stderr: "",
					exitCode: 0,
				};
			case "jj rebase -s source123 -d target456":
				return {
					ok: true,
					stdout: "Rebased 1 commit onto target456",
					stderr: "",
					exitCode: 0,
				};
			case "jj bookmark create feature/new-api -r source123":
				return {
					ok: true,
					stdout: "Created 1 bookmarks pointing to source123",
					stderr: "",
					exitCode: 0,
				};
			case "jj describe -r source123 -m Refine API layer":
				return {
					ok: true,
					stdout: "Updated description for source123",
					stderr: "",
					exitCode: 0,
				};
			case "jj new --insert-after target456 --no-edit -m Follow-up change":
				return {
					ok: true,
					stdout: "Created new change after target456",
					stderr: "",
					exitCode: 0,
				};
			case "jj bookmark move feature/api --to target456 --allow-backwards":
				return {
					ok: true,
					stdout: "Moved bookmark feature/api to target456",
					stderr: "",
					exitCode: 0,
				};
			case "jj squash --from source123 --into target456":
				return {
					ok: true,
					stdout: "Squashed source123 into target456",
					stderr: "",
					exitCode: 0,
				};
			case "jj split -r source123 -m Extract app -- src/app.ts":
				return {
					ok: true,
					stdout: "Split source123",
					stderr: "",
					exitCode: 0,
				};
			case "jj absorb --from @ --into root000 -- src/app.ts":
				return {
					ok: true,
					stdout: "Absorbed src/app.ts into root000",
					stderr: "",
					exitCode: 0,
				};
			case "jj restore -- src/app.ts":
				return {
					ok: true,
					stdout: "Restored src/app.ts from the parent revision",
					stderr: "",
					exitCode: 0,
				};
			case "jj undo":
				return {
					ok: true,
					stdout: "Undid the most recent JJ operation",
					stderr: "",
					exitCode: 0,
				};
			case "jj redo":
				return {
					ok: true,
					stdout: "Redid the most recently undone JJ operation",
					stderr: "",
					exitCode: 0,
				};
			case "jj abandon source123":
				return {
					ok: true,
					stdout: "Abandoned source123",
					stderr: "",
					exitCode: 0,
				};
			default:
				return { ok: false, stdout: "", stderr: `${joined} not mocked`, exitCode: 1 };
		}
	};
}

test("applyJjOperation executes the previewed reorder command", async () => {
	const commandLog: string[] = [];
	const result = await applyJjOperation("/repo", reorderAfter, createPreviewRunner(commandLog));

	assert.equal(result.ok, true);
	assert.deepEqual(result.command, {
		command: "jj",
		args: ["rebase", "-s", "source123", "-d", "target456"],
	});
	assert.match(result.stdout, /Rebased 1 commit/);
	assert.equal(commandLog.at(-1), "jj rebase -s source123 -d target456");
});

test("applyJjOperation does not execute a mutation when preview validation fails", async () => {
	const commandLog: string[] = [];
	const result = await applyJjOperation(
		"/repo",
		{
			...reorderAfter,
			targetChangeId: "source123",
		},
		createPreviewRunner(commandLog),
	);

	assert.equal(result.ok, false);
	assert.equal(result.command, null);
	assert.ok(!commandLog.includes("jj rebase -s source123 -d source123"));
	assert.match(result.description, /different/i);
});

test("applyJjOperation executes the previewed create bookmark command", async () => {
	const commandLog: string[] = [];
	const result = await applyJjOperation("/repo", createBookmark, createPreviewRunner(commandLog));

	assert.equal(result.ok, true);
	assert.deepEqual(result.command, {
		command: "jj",
		args: ["bookmark", "create", "feature/new-api", "-r", "source123"],
	});
	assert.match(result.stdout, /Created 1 bookmarks/);
	assert.equal(commandLog.at(-1), "jj bookmark create feature/new-api -r source123");
});

test("applyJjOperation executes the previewed edit message command", async () => {
	const commandLog: string[] = [];
	const result = await applyJjOperation("/repo", editMessage, createPreviewRunner(commandLog));

	assert.equal(result.ok, true);
	assert.deepEqual(result.command, {
		command: "jj",
		args: ["describe", "-r", "source123", "-m", "Refine API layer"],
	});
	assert.match(result.stdout, /Updated description/);
	assert.equal(commandLog.at(-1), "jj describe -r source123 -m Refine API layer");
});

test("applyJjOperation executes the previewed create change command", async () => {
	const commandLog: string[] = [];
	const result = await applyJjOperation("/repo", createChangeAfter, createPreviewRunner(commandLog));

	assert.equal(result.ok, true);
	assert.deepEqual(result.command, {
		command: "jj",
		args: ["new", "--insert-after", "target456", "--no-edit", "-m", "Follow-up change"],
	});
	assert.match(result.stdout, /Created new change/);
	assert.equal(commandLog.at(-1), "jj new --insert-after target456 --no-edit -m Follow-up change");
});

test("applyJjOperation executes the previewed move bookmark command", async () => {
	const commandLog: string[] = [];
	const result = await applyJjOperation("/repo", moveBookmark, createPreviewRunner(commandLog));

	assert.equal(result.ok, true);
	assert.deepEqual(result.command, {
		command: "jj",
		args: ["bookmark", "move", "feature/api", "--to", "target456", "--allow-backwards"],
	});
	assert.match(result.stdout, /Moved bookmark/);
	assert.equal(commandLog.at(-1), "jj bookmark move feature/api --to target456 --allow-backwards");
});

test("applyJjOperation executes the previewed squash change command", async () => {
	const commandLog: string[] = [];
	const result = await applyJjOperation("/repo", squashChange, createPreviewRunner(commandLog));

	assert.equal(result.ok, true);
	assert.deepEqual(result.command, {
		command: "jj",
		args: ["squash", "--from", "source123", "--into", "target456"],
	});
	assert.match(result.stdout, /Squashed source123 into target456/);
	assert.equal(commandLog.at(-1), "jj squash --from source123 --into target456");
});

test("applyJjOperation executes the previewed split change command", async () => {
	const commandLog: string[] = [];
	const result = await applyJjOperation("/repo", splitChange, createPreviewRunner(commandLog));

	assert.equal(result.ok, true);
	assert.deepEqual(result.command, {
		command: "jj",
		args: ["split", "-r", "source123", "-m", "Extract app", "--", "src/app.ts"],
	});
	assert.match(result.stdout, /Split source123/);
	assert.equal(commandLog.at(-1), "jj split -r source123 -m Extract app -- src/app.ts");
});

test("applyJjOperation executes the previewed absorb file command", async () => {
	const commandLog: string[] = [];
	const result = await applyJjOperation("/repo", absorbFile, createPreviewRunner(commandLog));

	assert.equal(result.ok, true);
	assert.deepEqual(result.command, {
		command: "jj",
		args: ["absorb", "--from", "@", "--into", "root000", "--", "src/app.ts"],
	});
	assert.match(result.stdout, /Absorbed src\/app.ts into root000/);
	assert.equal(commandLog.at(-1), "jj absorb --from @ --into root000 -- src/app.ts");
});

test("applyJjOperation executes the previewed restore file command", async () => {
	const commandLog: string[] = [];
	const result = await applyJjOperation("/repo", restoreFile, createPreviewRunner(commandLog));

	assert.equal(result.ok, true);
	assert.deepEqual(result.command, {
		command: "jj",
		args: ["restore", "--", "src/app.ts"],
	});
	assert.match(result.stdout, /Restored src\/app.ts/);
	assert.equal(commandLog.at(-1), "jj restore -- src/app.ts");
});

test("applyJjOperation executes the previewed undo command", async () => {
	const commandLog: string[] = [];
	const result = await applyJjOperation("/repo", undoLast, createPreviewRunner(commandLog));

	assert.equal(result.ok, true);
	assert.deepEqual(result.command, {
		command: "jj",
		args: ["undo"],
	});
	assert.match(result.stdout, /Undid the most recent JJ operation/);
	assert.equal(commandLog.at(-1), "jj undo");
});

test("applyJjOperation executes the previewed redo command", async () => {
	const commandLog: string[] = [];
	const result = await applyJjOperation("/repo", redoLast, createPreviewRunner(commandLog));

	assert.equal(result.ok, true);
	assert.deepEqual(result.command, {
		command: "jj",
		args: ["redo"],
	});
	assert.match(result.stdout, /Redid the most recently undone JJ operation/);
	assert.equal(commandLog.at(-1), "jj redo");
});

test("applyJjOperation executes the previewed abandon change command", async () => {
	const commandLog: string[] = [];
	const result = await applyJjOperation("/repo", abandonChange, createPreviewRunner(commandLog));

	assert.equal(result.ok, true);
	assert.deepEqual(result.command, {
		command: "jj",
		args: ["abandon", "source123"],
	});
	assert.match(result.stdout, /Abandoned source123/);
	assert.equal(commandLog.at(-1), "jj abandon source123");
});
