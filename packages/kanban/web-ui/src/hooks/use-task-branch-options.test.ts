import { describe, expect, it } from "vitest";

import {
	buildTaskBranchOptions,
	resolveDefaultTaskBranchRef,
} from "@/hooks/use-task-branch-options";
import type { RuntimeGitRepositoryInfo } from "@/runtime/types";

describe("useTaskBranchOptions helpers", () => {
	it("keeps git branch options unchanged", () => {
		const workspaceGit: RuntimeGitRepositoryInfo = {
			engine: "git",
			currentBranch: "feature/test",
			jjChangeId: null,
			defaultBranch: "main",
			branches: ["feature/test", "main"],
		};

		expect(buildTaskBranchOptions(workspaceGit)).toEqual([
			{ value: "feature/test", label: "feature/test (current)" },
			{ value: "main", label: "main (default)" },
		]);
		expect(resolveDefaultTaskBranchRef(workspaceGit, buildTaskBranchOptions(workspaceGit))).toBe("feature/test");
	});

	it("includes the current jj change id when no bookmark is active", () => {
		const workspaceGit: RuntimeGitRepositoryInfo = {
			engine: "jj",
			currentBranch: null,
			jjChangeId: "sqxqrtuorxzn",
			defaultBranch: "main",
			branches: ["main"],
		};

		expect(buildTaskBranchOptions(workspaceGit)).toEqual([
			{ value: "sqxqrtuorxzn", label: "sqxqrtuorxzn (current change)" },
			{ value: "main", label: "main (default)" },
		]);
		expect(resolveDefaultTaskBranchRef(workspaceGit, buildTaskBranchOptions(workspaceGit))).toBe("sqxqrtuorxzn");
	});

	it("does not duplicate the jj change id when it matches the current bookmark", () => {
		const workspaceGit: RuntimeGitRepositoryInfo = {
			engine: "jj",
			currentBranch: "qpvuntsm",
			jjChangeId: "qpvuntsm",
			defaultBranch: "main",
			branches: ["qpvuntsm", "main"],
		};

		expect(buildTaskBranchOptions(workspaceGit)).toEqual([
			{ value: "qpvuntsm", label: "qpvuntsm (current)" },
			{ value: "main", label: "main (default)" },
		]);
	});
});
