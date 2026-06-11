import { detectVcsState } from "./detect.js";
import { applyJjOperation } from "./jj/apply.js";
import { loadJjDiff } from "./jj/diff.js";
import { previewJjOperation } from "./jj/preview.js";
import { previewJjStackSubmit, submitJjStack } from "./jj/stack-submit.js";
import { loadJjState } from "./jj/state.js";
import { runVcsCommand } from "./process.js";
import type { VcsApplyOperationInput, VcsPreviewOperationInput, VcsSubmitStackPreviewInput } from "./types.js";

export async function detectVcs(repoRoot: string) {
	return await detectVcsState(repoRoot);
}

export async function getJjState(repoRoot: string) {
	return await loadJjState(repoRoot, runVcsCommand);
}

export async function getJjDiff(repoRoot: string) {
	return await loadJjDiff(repoRoot, runVcsCommand);
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
