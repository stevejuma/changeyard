import { detectVcsState, type VcsCommandRunner } from "../detect.js";
import type { VcsDiagnostic, VcsJjDiffResult } from "../types.js";

const SAFE_CHANGE_ID_PATTERN = /^[A-Za-z0-9._/-]+$/;

function createDiagnostic(level: VcsDiagnostic["level"], code: string, message: string): VcsDiagnostic {
	return { level, code, message };
}

function assertSafeChangeId(changeId: string): void {
	if (!SAFE_CHANGE_ID_PATTERN.test(changeId)) {
		throw new Error(`Unsupported JJ change id: ${changeId}`);
	}
}

export async function loadJjDiff(cwd: string, runner: VcsCommandRunner): Promise<VcsJjDiffResult> {
	const detect = await detectVcsState(cwd, runner);
	if (detect.repository.kind !== "jj") {
		return {
			changeId: null,
			summary: "",
			patch: "",
			diagnostics: [
				createDiagnostic("warning", "jj_repo_required", "JJ diff is only available inside a JJ repository."),
			],
		};
	}

	const changeId = detect.jj.currentChangeId;
	if (!changeId) {
		return {
			changeId: null,
			summary: "",
			patch: "",
			diagnostics: [
				createDiagnostic("info", "jj_change_missing", "The current JJ working copy has no readable change id."),
			],
		};
	}
	assertSafeChangeId(changeId);

	const repoCwd = detect.repository.root ?? cwd;
	const [summaryResult, patchResult] = await Promise.all([
		runner({
			command: "jj",
			args: ["--color=never", "show", "--ignore-working-copy", "-r", changeId, "--summary"],
			cwd: repoCwd,
		}),
		runner({
			command: "jj",
			args: ["--color=never", "show", "--ignore-working-copy", "-r", changeId, "--git"],
			cwd: repoCwd,
		}),
	]);

	return {
		changeId,
		summary: summaryResult.ok ? summaryResult.stdout : "",
		patch: patchResult.ok ? patchResult.stdout : "",
		diagnostics: [
			...(summaryResult.ok ? [] : [createDiagnostic("warning", "jj_diff_summary_failed", "Could not load JJ diff summary.")]),
			...(patchResult.ok ? [] : [createDiagnostic("warning", "jj_diff_patch_failed", "Could not load JJ patch output.")]),
		],
	};
}
