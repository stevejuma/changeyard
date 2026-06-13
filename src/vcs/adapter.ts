import { detectVcsState } from "./detect.js";
import { loadConfig } from "../config/loadConfig.js";
import { applyJjOperation } from "./jj/apply.js";
import { loadJjDiff } from "./jj/diff.js";
import { loadJjInventory, loadJjInventoryFromDetect } from "./jj/inventory.js";
import { loadJjOperationDiff, loadJjOperations } from "./jj/operations.js";
import { previewJjOperation } from "./jj/preview.js";
import { previewJjStackSubmit, submitJjStack } from "./jj/stack-submit.js";
import { loadJjState, loadJjStateFromDetect } from "./jj/state.js";
import { runVcsCommand } from "./process.js";
import type { VcsApplyOperationInput, VcsPreviewOperationInput, VcsSubmitStackPreviewInput } from "./types.js";

export async function detectVcs(repoRoot: string) {
	return await detectVcsState(repoRoot);
}

export async function getJjState(repoRoot: string) {
	const config = loadConfig(repoRoot);
	return await loadJjState(repoRoot, runVcsCommand, { targetBranch: config.vcs.targetBranch ?? null });
}

export async function getJjDiff(repoRoot: string) {
	return await loadJjDiff(repoRoot, runVcsCommand);
}

export async function getJjInventory(repoRoot: string) {
	const config = loadConfig(repoRoot);
	return await loadJjInventory(repoRoot, runVcsCommand, { targetBranch: config.vcs.targetBranch ?? null });
}

export async function getJjBranchesData(repoRoot: string) {
	const config = loadConfig(repoRoot);
	const detect = await detectVcsState(repoRoot, runVcsCommand);
	const options = { targetBranch: config.vcs.targetBranch ?? null };
	const [inventory, state] = await Promise.all([
		loadJjInventoryFromDetect(repoRoot, runVcsCommand, detect, options),
		loadJjStateFromDetect(repoRoot, runVcsCommand, detect, options),
	]);
	return { inventory, state };
}

export async function getJjOperations(repoRoot: string, input?: { limit?: number | null; cursor?: string | null; pageSize?: number | null }) {
	return await loadJjOperations(repoRoot, runVcsCommand, {
		limit: input?.limit,
		cursor: input?.cursor,
		pageSize: input?.pageSize,
	});
}

export async function getJjOperationDiff(
	repoRoot: string,
	input: { operationId: string; commitSkip?: number | null; commitLimit?: number | null; cursor?: string | null; pageSize?: number | null },
) {
	return await loadJjOperationDiff(repoRoot, runVcsCommand, input.operationId, {
		commitSkip: input.commitSkip,
		commitLimit: input.commitLimit,
		cursor: input.cursor,
		pageSize: input.pageSize,
	});
}

export async function previewVcsOperation(repoRoot: string, input: VcsPreviewOperationInput) {
	return await previewJjOperation(repoRoot, input, runVcsCommand);
}

export async function applyVcsOperation(repoRoot: string, input: VcsApplyOperationInput) {
	return await applyJjOperation(repoRoot, input, runVcsCommand);
}

export async function submitVcsStackPreview(repoRoot: string, input: VcsSubmitStackPreviewInput) {
	return await previewJjStackSubmit(repoRoot, input, runVcsCommand);
}

export async function submitVcsStack(repoRoot: string, input: VcsSubmitStackPreviewInput) {
	return await submitJjStack(repoRoot, input, runVcsCommand);
}
