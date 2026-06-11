import { useMemo } from "react";

import type { RuntimeGitRepositoryInfo } from "@/runtime/types";

interface TaskBranchOption {
	value: string;
	label: string;
}

interface UseTaskBranchOptionsInput {
	workspaceGit: RuntimeGitRepositoryInfo | null;
}

interface UseTaskBranchOptionsResult {
	createTaskBranchOptions: TaskBranchOption[];
	defaultTaskBranchRef: string;
}

export function buildTaskBranchOptions(workspaceGit: RuntimeGitRepositoryInfo | null): TaskBranchOption[] {
	if (!workspaceGit) {
		return [];
	}

	const options: TaskBranchOption[] = [];
	const seen = new Set<string>();
	const append = (value: string | null, labelSuffix?: string) => {
		if (!value || seen.has(value)) {
			return;
		}
		seen.add(value);
		options.push({
			value,
			label: labelSuffix ? `${value} ${labelSuffix}` : value,
		});
	};

	append(workspaceGit.currentBranch, "(current)");
	if (workspaceGit.engine === "jj" && workspaceGit.jjChangeId && workspaceGit.jjChangeId !== workspaceGit.currentBranch) {
		append(workspaceGit.jjChangeId, "(current change)");
	}
	const mainCandidate = workspaceGit.branches.includes("main") ? "main" : workspaceGit.defaultBranch;
	append(mainCandidate, mainCandidate && mainCandidate !== workspaceGit.currentBranch ? "(default)" : undefined);
	for (const branch of workspaceGit.branches) {
		append(branch);
	}
	append(workspaceGit.defaultBranch, workspaceGit.defaultBranch ? "(default)" : undefined);

	return options;
}

export function resolveDefaultTaskBranchRef(
	workspaceGit: RuntimeGitRepositoryInfo | null,
	createTaskBranchOptions: TaskBranchOption[],
): string {
	if (!workspaceGit) {
		return "";
	}
	return workspaceGit.currentBranch ?? workspaceGit.jjChangeId ?? workspaceGit.defaultBranch ?? createTaskBranchOptions[0]?.value ?? "";
}

export function useTaskBranchOptions({ workspaceGit }: UseTaskBranchOptionsInput): UseTaskBranchOptionsResult {
	const createTaskBranchOptions = useMemo(() => buildTaskBranchOptions(workspaceGit), [workspaceGit]);

	const defaultTaskBranchRef = useMemo(
		() => resolveDefaultTaskBranchRef(workspaceGit, createTaskBranchOptions),
		[createTaskBranchOptions, workspaceGit],
	);

	return {
		createTaskBranchOptions,
		defaultTaskBranchRef,
	};
}
