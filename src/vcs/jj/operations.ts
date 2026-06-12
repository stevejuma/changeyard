import { detectVcsState, type VcsCommandRunner } from "../detect.js";
import type {
	VcsDiagnostic,
	VcsJjOperationDiffResult,
	VcsJjOperationEntry,
	VcsJjOperationFile,
	VcsJjOperationsResult,
} from "../types.js";

const FIELD_SEPARATOR = "\t";

function createDiagnostic(level: VcsDiagnostic["level"], code: string, message: string): VcsDiagnostic {
	return { level, code, message };
}

function normalizeOperationDescription(description: string): string {
	const trimmed = description.trim();
	return trimmed.length > 0 ? trimmed : "Operation";
}

function normalizeOperationId(id: string): string {
	return id.trim();
}

export function parseJjOperationFiles(output: string): VcsJjOperationFile[] {
	const files: VcsJjOperationFile[] = [];
	for (const line of output.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) {
			continue;
		}
		const simpleMatch = /^([A-Z])\s+(.+)$/.exec(trimmed);
		if (simpleMatch?.[1] && simpleMatch[2]) {
			files.push({
				status: normalizeStatus(simpleMatch[1]),
				path: simpleMatch[2],
			});
			continue;
		}
		const verboseMatch = /^(Added|Modified|Deleted|Renamed|Copied)\s+(?:regular\s+)?file\s+(.+):?$/i.exec(trimmed);
		if (verboseMatch?.[1] && verboseMatch[2]) {
			files.push({
				status: normalizeVerboseStatus(verboseMatch[1]),
				path: verboseMatch[2].replace(/:$/, ""),
			});
		}
	}
	const seen = new Set<string>();
	return files.filter((file) => {
		const key = `${file.status}:${file.path}`;
		if (seen.has(key)) {
			return false;
		}
		seen.add(key);
		return true;
	});
}

function normalizeStatus(code: string): VcsJjOperationFile["status"] {
	switch (code) {
		case "M":
			return "modified";
		case "A":
			return "added";
		case "D":
			return "deleted";
		case "R":
			return "renamed";
		case "C":
			return "copied";
		default:
			return "unknown";
	}
}

function normalizeVerboseStatus(label: string): VcsJjOperationFile["status"] {
	switch (label.toLowerCase()) {
		case "modified":
			return "modified";
		case "added":
			return "added";
		case "deleted":
			return "deleted";
		case "renamed":
			return "renamed";
		case "copied":
			return "copied";
		default:
			return "unknown";
	}
}

async function readOperationFiles(cwd: string, operationId: string, runner: VcsCommandRunner): Promise<VcsJjOperationFile[]> {
	const result = await runner({
		command: "jj",
		args: ["op", "show", "--ignore-working-copy", "--at-op=@", operationId, "--summary", "--no-graph"],
		cwd,
	});
	return result.ok ? parseJjOperationFiles(result.stdout) : [];
}

export async function loadJjOperations(
	cwd: string,
	runner: VcsCommandRunner,
	limit = 30,
): Promise<VcsJjOperationsResult> {
	const detect = await detectVcsState(cwd, runner);
	if (detect.repository.kind !== "jj") {
		return {
			operations: [],
			diagnostics: [
				...detect.diagnostics,
				createDiagnostic("warning", "jj_repo_required", "JJ operation history is only available inside a JJ repository."),
			],
		};
	}
	const repoCwd = detect.repository.root ?? cwd;
	const normalizedLimit = Math.max(1, Math.min(limit, 100));
	const result = await runner({
		command: "jj",
		args: [
			"op",
			"log",
			"--ignore-working-copy",
			"--at-op=@",
			"--no-graph",
			"-n",
			String(normalizedLimit),
			"-T",
			'id.short() ++ "\\t" ++ description ++ "\\t" ++ user ++ "\\t" ++ time.start() ++ "\\n"',
		],
		cwd: repoCwd,
	});
	if (!result.ok) {
		return {
			operations: [],
			diagnostics: [
				...detect.diagnostics,
				createDiagnostic("error", "jj_operations_failed", result.stderr || result.stdout || "Failed to read JJ operation history."),
			],
		};
	}
	const operations: VcsJjOperationEntry[] = [];
	for (const line of result.stdout.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) {
			continue;
		}
		const [id = "", description = "", user = "", timestamp = ""] = trimmed.split(FIELD_SEPARATOR);
		const normalizedId = normalizeOperationId(id);
		if (!normalizedId) {
			continue;
		}
		operations.push({
			id: normalizedId,
			shortId: normalizedId.slice(0, 12),
			description: normalizeOperationDescription(description),
			user: user.trim() || null,
			timestamp: timestamp.trim() || null,
			files: [],
			restoreEligible: true,
		});
	}

	const operationsWithFiles = await Promise.all(
		operations.map(async (operation) => ({
			...operation,
			files: await readOperationFiles(repoCwd, operation.id, runner),
		})),
	);

	return {
		operations: operationsWithFiles,
		diagnostics: detect.diagnostics,
	};
}

export async function loadJjOperationDiff(
	cwd: string,
	runner: VcsCommandRunner,
	operationId: string,
): Promise<VcsJjOperationDiffResult> {
	const detect = await detectVcsState(cwd, runner);
	const normalizedOperationId = operationId.trim();
	if (!normalizedOperationId) {
		return {
			operationId,
			summary: "",
			patch: "",
			files: [],
			diagnostics: [createDiagnostic("error", "operation_required", "Choose an operation before loading details.")],
		};
	}
	if (detect.repository.kind !== "jj") {
		return {
			operationId: normalizedOperationId,
			summary: "",
			patch: "",
			files: [],
			diagnostics: [
				...detect.diagnostics,
				createDiagnostic("warning", "jj_repo_required", "JJ operation details are only available inside a JJ repository."),
			],
		};
	}
	const repoCwd = detect.repository.root ?? cwd;
	const [summaryResult, patchResult] = await Promise.all([
		runner({
			command: "jj",
			args: ["op", "show", "--ignore-working-copy", "--at-op=@", normalizedOperationId, "--summary", "--no-graph"],
			cwd: repoCwd,
		}),
		runner({
			command: "jj",
			args: ["op", "show", "--ignore-working-copy", "--at-op=@", normalizedOperationId, "--patch", "--no-graph"],
			cwd: repoCwd,
		}),
	]);
	const diagnostics = [...detect.diagnostics];
	if (!summaryResult.ok) {
		diagnostics.push(
			createDiagnostic("error", "jj_operation_summary_failed", summaryResult.stderr || summaryResult.stdout || "Failed to read operation summary."),
		);
	}
	if (!patchResult.ok) {
		diagnostics.push(
			createDiagnostic(
				"warning",
				"jj_operation_patch_failed",
				patchResult.stderr || patchResult.stdout || "JJ could not provide patch details for this operation.",
			),
		);
	}
	const summary = summaryResult.ok ? summaryResult.stdout : "";
	const patch = patchResult.ok ? patchResult.stdout : "";
	return {
		operationId: normalizedOperationId,
		summary,
		patch,
		files: parseJjOperationFiles(`${summary}\n${patch}`),
		diagnostics,
	};
}
