import type { VcsCommandRunner } from "../detect.js";
import type { VcsCommandResult } from "../process.js";
import type { VcsApplyOperationInput, VcsApplyOperationResult } from "../types.js";
import { previewJjOperation } from "./preview.js";

function mapResult(
	preview: Awaited<ReturnType<typeof previewJjOperation>>,
	result: VcsCommandResult,
): VcsApplyOperationResult {
	return {
		ok: result.ok,
		operation: preview.operation,
		title: result.ok ? "Operation applied" : "Operation failed",
		description: result.ok
			? preview.description
			: result.stderr.trim() || result.stdout.trim() || "The JJ operation did not complete successfully.",
		risk: preview.risk,
		command: preview.commands[0] ?? null,
		stdout: result.stdout,
		stderr: result.stderr,
		exitCode: result.exitCode,
		affectedChangeIds: preview.affectedChangeIds,
		affectedBookmarks: preview.affectedBookmarks,
		diagnostics: preview.diagnostics,
	};
}

export async function applyJjOperation(
	cwd: string,
	operation: VcsApplyOperationInput,
	runner: VcsCommandRunner,
): Promise<VcsApplyOperationResult> {
	const preview = await previewJjOperation(cwd, operation, runner);
	if (!preview.valid || preview.commands.length === 0) {
		return {
			ok: false,
			operation,
			title: "Operation unavailable",
			description: preview.description,
			risk: preview.risk,
			command: null,
			stdout: "",
			stderr: "",
			exitCode: null,
			affectedChangeIds: preview.affectedChangeIds,
			affectedBookmarks: preview.affectedBookmarks,
			diagnostics: preview.diagnostics,
		};
	}

	const command = preview.commands[0];
	const result = await runner({
		command: command.command,
		args: command.args,
		cwd,
	});
	return mapResult(preview, result);
}
