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

function stripAnsi(input: string): string {
	return input.replace(/\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001b\\))/g, "");
}

function normalizeBranchRef(value: string | null): string | null {
	const normalized = value ? stripAnsi(value).trim() : "";
	return normalized || null;
}

export function buildTaskBranchOptions(workspaceGit: RuntimeGitRepositoryInfo | null): TaskBranchOption[] {
	if (!workspaceGit) {
		return [];
	}

	const options: TaskBranchOption[] = [];
	const seen = new Set<string>();
	const append = (value: string | null, labelSuffix?: string) => {
		const normalizedValue = normalizeBranchRef(value);
		if (!normalizedValue || seen.has(normalizedValue)) {
			return;
		}
		seen.add(normalizedValue);
		options.push({
			value: normalizedValue,
			label: labelSuffix ? `${normalizedValue} ${labelSuffix}` : normalizedValue,
		});
	};

	append(workspaceGit.currentBranch, "(current)");
	const currentBranch = normalizeBranchRef(workspaceGit.currentBranch);
	const jjChangeId = normalizeBranchRef(workspaceGit.jjChangeId);
	if (workspaceGit.engine === "jj" && jjChangeId && jjChangeId !== currentBranch) {
		append(workspaceGit.jjChangeId, "(current change)");
	}
	const branches = workspaceGit.branches.map((branch) => normalizeBranchRef(branch)).filter((branch): branch is string =>
		Boolean(branch),
	);
	const defaultBranch = normalizeBranchRef(workspaceGit.defaultBranch);
	const mainCandidate = branches.includes("main") ? "main" : defaultBranch;
	append(mainCandidate, mainCandidate && mainCandidate !== currentBranch ? "(default)" : undefined);
	for (const branch of workspaceGit.branches) {
		append(branch);
	}
	append(defaultBranch, defaultBranch ? "(default)" : undefined);

	return options;
}

export function resolveDefaultTaskBranchRef(
	workspaceGit: RuntimeGitRepositoryInfo | null,
	createTaskBranchOptions: TaskBranchOption[],
): string {
	if (!workspaceGit) {
		return "";
	}
	return (
		normalizeBranchRef(workspaceGit.currentBranch) ??
		normalizeBranchRef(workspaceGit.jjChangeId) ??
		normalizeBranchRef(workspaceGit.defaultBranch) ??
		createTaskBranchOptions[0]?.value ??
		""
	);
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
