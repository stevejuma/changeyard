import path from "node:path";

import type {
	RuntimeChangeyardBoardFileStats,
	RuntimeChangeyardBoardFileSummary,
	RuntimeChangeyardBoardFileDiffRequest,
	RuntimeChangeyardBoardFileDiffResponse,
	RuntimeChangeyardBoardFilesRequest,
	RuntimeChangeyardBoardFilesResponse,
	RuntimeChangeyardBoardSummaryResponse,
	RuntimeChangeyardChangeDetail,
	RuntimeChangeyardChangeActionResponse,
	RuntimeChangeyardCompleteRequest,
	RuntimeChangeyardChangeCreateRequest,
	RuntimeChangeyardChangeDependencyRequest,
	RuntimeChangeyardChangeGetRequest,
	RuntimeChangeyardChangeUpdateStatusRequest,
	RuntimeChangeyardChangeUpdateBodyRequest,
	RuntimeChangeyardPlanningPromptRequest,
	RuntimeChangeyardPlanningPromptResponse,
	RuntimeChangeyardReviewCompleteRequest,
	RuntimeChangeyardChangeUpdatePlanningSectionRequest,
	RuntimeChangeyardChangesListResponse,
	RuntimeChangeyardDoctorResponse,
	RuntimeChangeyardInitResponse,
	RuntimeChangeyardUpdateResponse,
	RuntimeChangeyardProjectConfig,
	RuntimeChangeyardUpdateProjectConfigRequest,
	RuntimeVcsDetectResponse,
	RuntimeVcsApplyOperationRequest,
	RuntimeVcsApplyOperationResponse,
	RuntimeVcsJjDiffResponse,
	RuntimeVcsPreviewOperationRequest,
	RuntimeVcsPreviewOperationResponse,
	RuntimeVcsJjStateResponse,
	RuntimeVcsSubmitStackPreviewRequest,
	RuntimeVcsSubmitStackPreviewResponse,
	RuntimeVcsSubmitStackResponse,
	RuntimeWorkspaceFileChange,
	RuntimeWorkspaceChangesResponse,
} from "../core/api-contract.js";
import { getCommitDiff, getCommitDiffSummary, getGitLogRange } from "../workspace/git-history.js";
import { readGitHeadInfo } from "../workspace/git-utils.js";
import { detectWorkspaceEngine } from "../workspace/git-sync.js";
import {
	createEmptyWorkspaceChangesResponse,
	getWorkspaceChanges,
} from "../workspace/get-workspace-changes.js";
import { readJjHeadInfo } from "../workspace/jj-utils.js";

export interface RuntimeChangeyardApiAdapter {
	listChanges: (repoRoot: string) => Promise<RuntimeChangeyardChangesListResponse["changes"]> | RuntimeChangeyardChangesListResponse["changes"];
	createChange: (
		repoRoot: string,
		input: RuntimeChangeyardChangeCreateRequest,
	) => Promise<RuntimeChangeyardChangeDetail> | RuntimeChangeyardChangeDetail;
	getChange: (
		repoRoot: string,
		input: RuntimeChangeyardChangeGetRequest,
	) => Promise<RuntimeChangeyardChangeDetail | null> | RuntimeChangeyardChangeDetail | null;
	validateChange: (
		repoRoot: string,
		input: RuntimeChangeyardChangeGetRequest,
	) => Promise<RuntimeChangeyardChangeDetail> | RuntimeChangeyardChangeDetail;
	syncChange: (
		repoRoot: string,
		input: RuntimeChangeyardChangeGetRequest,
	) => Promise<RuntimeChangeyardChangeDetail> | RuntimeChangeyardChangeDetail;
	startChange: (
		repoRoot: string,
		input: RuntimeChangeyardChangeGetRequest,
	) => Promise<RuntimeChangeyardChangeDetail> | RuntimeChangeyardChangeDetail;
	verifyChange: (
		repoRoot: string,
		input: RuntimeChangeyardChangeGetRequest,
	) => Promise<RuntimeChangeyardChangeActionResponse> | RuntimeChangeyardChangeActionResponse;
	completeChange: (
		repoRoot: string,
		input: RuntimeChangeyardCompleteRequest,
	) => Promise<RuntimeChangeyardChangeActionResponse> | RuntimeChangeyardChangeActionResponse;
	reviewStart: (
		repoRoot: string,
		input: RuntimeChangeyardChangeGetRequest,
	) => Promise<RuntimeChangeyardChangeActionResponse> | RuntimeChangeyardChangeActionResponse;
	reviewComplete: (
		repoRoot: string,
		input: RuntimeChangeyardReviewCompleteRequest,
	) => Promise<RuntimeChangeyardChangeActionResponse> | RuntimeChangeyardChangeActionResponse;
	planningPrompt: (
		repoRoot: string,
		input: RuntimeChangeyardPlanningPromptRequest,
	) => Promise<RuntimeChangeyardPlanningPromptResponse> | RuntimeChangeyardPlanningPromptResponse;
	updatePlanningSection: (
		repoRoot: string,
		input: RuntimeChangeyardChangeUpdatePlanningSectionRequest,
	) => Promise<RuntimeChangeyardChangeDetail> | RuntimeChangeyardChangeDetail;
	updateChangeStatus: (
		repoRoot: string,
		input: RuntimeChangeyardChangeUpdateStatusRequest,
	) => Promise<RuntimeChangeyardChangeDetail> | RuntimeChangeyardChangeDetail;
	linkChange: (
		repoRoot: string,
		input: RuntimeChangeyardChangeDependencyRequest,
	) => Promise<RuntimeChangeyardChangeDetail> | RuntimeChangeyardChangeDetail;
	unlinkChange: (
		repoRoot: string,
		input: RuntimeChangeyardChangeDependencyRequest,
	) => Promise<RuntimeChangeyardChangeDetail> | RuntimeChangeyardChangeDetail;
	updateChangeBody: (
		repoRoot: string,
		input: RuntimeChangeyardChangeUpdateBodyRequest,
	) => Promise<RuntimeChangeyardChangeDetail> | RuntimeChangeyardChangeDetail;
	initProject: (repoRoot: string) => Promise<RuntimeChangeyardInitResponse> | RuntimeChangeyardInitResponse;
	updateProject: (repoRoot: string) => Promise<RuntimeChangeyardUpdateResponse> | RuntimeChangeyardUpdateResponse;
	getProjectConfig: (repoRoot: string) => Promise<RuntimeChangeyardProjectConfig> | RuntimeChangeyardProjectConfig;
	updateProjectConfig: (
		repoRoot: string,
		input: RuntimeChangeyardUpdateProjectConfigRequest,
	) => Promise<RuntimeChangeyardProjectConfig> | RuntimeChangeyardProjectConfig;
	doctorProject: (repoRoot: string) => Promise<RuntimeChangeyardDoctorResponse> | RuntimeChangeyardDoctorResponse;
	detectVcs?: (repoRoot: string) => Promise<RuntimeVcsDetectResponse> | RuntimeVcsDetectResponse;
	getJjDiff?: (repoRoot: string) => Promise<RuntimeVcsJjDiffResponse> | RuntimeVcsJjDiffResponse;
	getJjState?: (repoRoot: string) => Promise<RuntimeVcsJjStateResponse> | RuntimeVcsJjStateResponse;
	previewVcsOperation?: (
		repoRoot: string,
		input: RuntimeVcsPreviewOperationRequest,
	) => Promise<RuntimeVcsPreviewOperationResponse> | RuntimeVcsPreviewOperationResponse;
	applyVcsOperation?: (
		repoRoot: string,
		input: RuntimeVcsApplyOperationRequest,
	) => Promise<RuntimeVcsApplyOperationResponse> | RuntimeVcsApplyOperationResponse;
	submitVcsStackPreview?: (
		repoRoot: string,
		input: RuntimeVcsSubmitStackPreviewRequest,
	) => Promise<RuntimeVcsSubmitStackPreviewResponse> | RuntimeVcsSubmitStackPreviewResponse;
	submitVcsStack?: (
		repoRoot: string,
		input: RuntimeVcsSubmitStackPreviewRequest,
	) => Promise<RuntimeVcsSubmitStackResponse> | RuntimeVcsSubmitStackResponse;
}

export interface RuntimeTrpcChangesApi {
	listChanges: (workspacePath: string) => Promise<RuntimeChangeyardChangesListResponse>;
	createChange: (workspacePath: string, input: RuntimeChangeyardChangeCreateRequest) => Promise<RuntimeChangeyardChangeDetail>;
	getChange: (workspacePath: string, input: RuntimeChangeyardChangeGetRequest) => Promise<RuntimeChangeyardChangeDetail | null>;
	validateChange: (workspacePath: string, input: RuntimeChangeyardChangeGetRequest) => Promise<RuntimeChangeyardChangeDetail>;
	syncChange: (workspacePath: string, input: RuntimeChangeyardChangeGetRequest) => Promise<RuntimeChangeyardChangeDetail>;
	startChange: (workspacePath: string, input: RuntimeChangeyardChangeGetRequest) => Promise<RuntimeChangeyardChangeDetail>;
	verifyChange: (workspacePath: string, input: RuntimeChangeyardChangeGetRequest) => Promise<RuntimeChangeyardChangeActionResponse>;
	completeChange: (workspacePath: string, input: RuntimeChangeyardCompleteRequest) => Promise<RuntimeChangeyardChangeActionResponse>;
	reviewStart: (workspacePath: string, input: RuntimeChangeyardChangeGetRequest) => Promise<RuntimeChangeyardChangeActionResponse>;
	reviewComplete: (
		workspacePath: string,
		input: RuntimeChangeyardReviewCompleteRequest,
	) => Promise<RuntimeChangeyardChangeActionResponse>;
	planningPrompt: (
		workspacePath: string,
		input: RuntimeChangeyardPlanningPromptRequest,
	) => Promise<RuntimeChangeyardPlanningPromptResponse>;
	updatePlanningSection: (
		workspacePath: string,
		input: RuntimeChangeyardChangeUpdatePlanningSectionRequest,
	) => Promise<RuntimeChangeyardChangeDetail>;
	updateChangeStatus: (
		workspacePath: string,
		input: RuntimeChangeyardChangeUpdateStatusRequest,
	) => Promise<RuntimeChangeyardChangeDetail>;
	linkChange: (
		workspacePath: string,
		input: RuntimeChangeyardChangeDependencyRequest,
	) => Promise<RuntimeChangeyardChangeDetail>;
	unlinkChange: (
		workspacePath: string,
		input: RuntimeChangeyardChangeDependencyRequest,
	) => Promise<RuntimeChangeyardChangeDetail>;
	updateChangeBody: (
		workspacePath: string,
		input: RuntimeChangeyardChangeUpdateBodyRequest,
	) => Promise<RuntimeChangeyardChangeDetail>;
	loadChangeWorkspaceChanges: (
		workspacePath: string,
		input: RuntimeChangeyardChangeGetRequest,
	) => Promise<RuntimeWorkspaceChangesResponse>;
	loadChangeBoardSummary: (
		workspacePath: string,
		input: RuntimeChangeyardChangeGetRequest,
	) => Promise<RuntimeChangeyardBoardSummaryResponse>;
	loadChangeBoardFiles: (
		workspacePath: string,
		input: RuntimeChangeyardBoardFilesRequest,
	) => Promise<RuntimeChangeyardBoardFilesResponse>;
	loadChangeBoardFileDiff: (
		workspacePath: string,
		input: RuntimeChangeyardBoardFileDiffRequest,
	) => Promise<RuntimeChangeyardBoardFileDiffResponse>;
	initProject: (workspacePath: string) => Promise<RuntimeChangeyardInitResponse>;
	updateProject: (workspacePath: string) => Promise<RuntimeChangeyardUpdateResponse>;
	getProjectConfig: (workspacePath: string) => Promise<RuntimeChangeyardProjectConfig>;
	updateProjectConfig: (
		workspacePath: string,
		input: RuntimeChangeyardUpdateProjectConfigRequest,
	) => Promise<RuntimeChangeyardProjectConfig>;
	doctorProject: (workspacePath: string) => Promise<RuntimeChangeyardDoctorResponse>;
}

export function createChangesApi(deps: {
	changeyardApi?: RuntimeChangeyardApiAdapter | null;
}): RuntimeTrpcChangesApi {
	const makeVersion = (change: RuntimeChangeyardChangeDetail | null, workspaceHead: string | null, rawWorkspacePath?: string | null): string =>
		[
			change?.id ?? "unknown",
			change?.updatedAt ?? "unversioned",
			change?.base?.revision ?? "no-base",
			rawWorkspacePath ?? "no-workspace",
			workspaceHead ?? "no-head",
		].join(":");

	const emptyStats = (): RuntimeChangeyardBoardFileStats => ({
		count: 0,
		additions: 0,
		deletions: 0,
	});

	const summarizeFiles = (files: RuntimeChangeyardBoardFileSummary[]): RuntimeChangeyardBoardFileStats =>
		files.reduce(
			(total, file) => ({
				count: total.count + 1,
				additions: total.additions + file.additions,
				deletions: total.deletions + file.deletions,
			}),
			emptyStats(),
		);

	const resolveChangeWorkspace = async (
		workspacePath: string,
		input: RuntimeChangeyardChangeGetRequest,
	): Promise<{ change: RuntimeChangeyardChangeDetail | null; cwd: string | null; rawWorkspacePath: string | null }> => {
		if (!deps.changeyardApi) {
			return { change: null, cwd: null, rawWorkspacePath: null };
		}
		const change = await deps.changeyardApi.getChange(workspacePath, input);
		const rawWorkspacePath = change?.workspace?.path?.trim() || null;
		if (!change || !rawWorkspacePath) {
			return { change, cwd: null, rawWorkspacePath };
		}
		const cwd = path.isAbsolute(rawWorkspacePath) ? rawWorkspacePath : path.resolve(workspacePath, rawWorkspacePath);
		return { change, cwd, rawWorkspacePath };
	};

	const readWorkspaceHead = async (cwd: string): Promise<string | null> => {
		const engine = await detectWorkspaceEngine(cwd);
		if (engine === "jj") {
			const head = await readJjHeadInfo(cwd);
			return head.jjChangeId ?? head.headCommit;
		}
		const head = await readGitHeadInfo(cwd);
		return head.headCommit;
	};

	const compactWorkspaceFiles = async (cwd: string): Promise<RuntimeChangeyardBoardFileSummary[]> => {
		const changes = await getWorkspaceChanges(cwd);
		return changes.files.map((file) => ({
			path: file.path,
			previousPath: file.previousPath,
			status: file.status,
			additions: file.additions,
			deletions: file.deletions,
		}));
	};

	return {
		listChanges: async (workspacePath) => {
			if (!deps.changeyardApi) {
				return { changes: [] };
			}
			return {
				changes: await deps.changeyardApi.listChanges(workspacePath),
			};
		},
		createChange: async (workspacePath, input) => {
			if (!deps.changeyardApi) {
				throw new Error("Changeyard change creation is not available in this runtime.");
			}
			return await deps.changeyardApi.createChange(workspacePath, input);
		},
		getChange: async (workspacePath, input) => {
			if (!deps.changeyardApi) {
				return null;
			}
			return await deps.changeyardApi.getChange(workspacePath, input);
		},
		validateChange: async (workspacePath, input) => {
			if (!deps.changeyardApi) {
				throw new Error("Changeyard validation is not available in this runtime.");
			}
			return await deps.changeyardApi.validateChange(workspacePath, input);
		},
		syncChange: async (workspacePath, input) => {
			if (!deps.changeyardApi) {
				throw new Error("Changeyard sync is not available in this runtime.");
			}
			return await deps.changeyardApi.syncChange(workspacePath, input);
		},
		startChange: async (workspacePath, input) => {
			if (!deps.changeyardApi) {
				throw new Error("Changeyard start is not available in this runtime.");
			}
			return await deps.changeyardApi.startChange(workspacePath, input);
		},
		verifyChange: async (workspacePath, input) => {
			if (!deps.changeyardApi) {
				throw new Error("Changeyard verify is not available in this runtime.");
			}
			return await deps.changeyardApi.verifyChange(workspacePath, input);
		},
		completeChange: async (workspacePath, input) => {
			if (!deps.changeyardApi) {
				throw new Error("Changeyard completion is not available in this runtime.");
			}
			return await deps.changeyardApi.completeChange(workspacePath, input);
		},
		reviewStart: async (workspacePath, input) => {
			if (!deps.changeyardApi) {
				throw new Error("Changeyard review is not available in this runtime.");
			}
			return await deps.changeyardApi.reviewStart(workspacePath, input);
		},
		reviewComplete: async (workspacePath, input) => {
			if (!deps.changeyardApi) {
				throw new Error("Changeyard review completion is not available in this runtime.");
			}
			return await deps.changeyardApi.reviewComplete(workspacePath, input);
		},
		planningPrompt: async (workspacePath, input) => {
			if (!deps.changeyardApi) {
				throw new Error("Changeyard planning prompts are not available in this runtime.");
			}
			return await deps.changeyardApi.planningPrompt(workspacePath, input);
		},
		updatePlanningSection: async (workspacePath, input) => {
			if (!deps.changeyardApi) {
				throw new Error("Changeyard planning updates are not available in this runtime.");
			}
			return await deps.changeyardApi.updatePlanningSection(workspacePath, input);
		},
		updateChangeStatus: async (workspacePath, input) => {
			if (!deps.changeyardApi) {
				throw new Error("Changeyard status updates are not available in this runtime.");
			}
			return await deps.changeyardApi.updateChangeStatus(workspacePath, input);
		},
		linkChange: async (workspacePath, input) => {
			if (!deps.changeyardApi) {
				throw new Error("Changeyard dependency linking is not available in this runtime.");
			}
			return await deps.changeyardApi.linkChange(workspacePath, input);
		},
		unlinkChange: async (workspacePath, input) => {
			if (!deps.changeyardApi) {
				throw new Error("Changeyard dependency unlinking is not available in this runtime.");
			}
			return await deps.changeyardApi.unlinkChange(workspacePath, input);
		},
		updateChangeBody: async (workspacePath, input) => {
			if (!deps.changeyardApi) {
				throw new Error("Changeyard change updates are not available in this runtime.");
			}
			return await deps.changeyardApi.updateChangeBody(workspacePath, input);
		},
		loadChangeWorkspaceChanges: async (workspacePath, input) => {
			const { cwd } = await resolveChangeWorkspace(workspacePath, input);
			if (!cwd) {
				return await createEmptyWorkspaceChangesResponse(workspacePath);
			}
			return await getWorkspaceChanges(cwd);
		},
		loadChangeBoardSummary: async (workspacePath, input) => {
			const { change, cwd, rawWorkspacePath } = await resolveChangeWorkspace(workspacePath, input);
			if (!change) {
				return {
					ok: false,
					changeId: input.id,
					version: makeVersion(null, null, rawWorkspacePath),
					workspaceHead: null,
					baseRevision: null,
					commits: [],
					files: emptyStats(),
					error: `Change not found: ${input.id}`,
				};
			}
			if (!cwd) {
				return {
					ok: true,
					changeId: change.id,
					version: makeVersion(change, null, rawWorkspacePath),
					workspaceHead: null,
					baseRevision: change.base?.revision ?? null,
					commits: [],
					files: emptyStats(),
					error: "Change workspace has not been started.",
				};
			}

			const workspaceHead = await readWorkspaceHead(cwd).catch(() => null);
			const baseRevision = change.base?.revision?.trim() || null;
			const [log, files] = await Promise.all([
				getGitLogRange({ cwd, baseRef: baseRevision, headRef: undefined, maxCount: 80 }),
				compactWorkspaceFiles(cwd).catch(() => []),
			]);

			return {
				ok: log.ok,
				changeId: change.id,
				version: makeVersion(change, workspaceHead, rawWorkspacePath),
				workspaceHead,
				baseRevision,
				commits: log.commits,
				files: summarizeFiles(files),
				error: log.error,
			};
		},
		loadChangeBoardFiles: async (workspacePath, input) => {
			const { change, cwd, rawWorkspacePath } = await resolveChangeWorkspace(workspacePath, input);
			if (!change) {
				return {
					ok: false,
					changeId: input.id,
					version: makeVersion(null, null, rawWorkspacePath),
					scope: input.scope,
					files: [],
					error: `Change not found: ${input.id}`,
				};
			}
			if (!cwd) {
				return {
					ok: true,
					changeId: change.id,
					version: makeVersion(change, null, rawWorkspacePath),
					scope: input.scope,
					files: [],
					error: "Change workspace has not been started.",
				};
			}

			const workspaceHead = await readWorkspaceHead(cwd).catch(() => null);
			if (input.scope === "all") {
				const files = await compactWorkspaceFiles(cwd).catch(() => []);
				return {
					ok: true,
					changeId: change.id,
					version: makeVersion(change, workspaceHead, rawWorkspacePath),
					scope: input.scope,
					files,
				};
			}

			const response = await getCommitDiffSummary({ cwd, commitHash: input.scope.commitHash });
			return {
				ok: response.ok,
				changeId: change.id,
				version: makeVersion(change, workspaceHead, rawWorkspacePath),
				scope: input.scope,
				files: response.files,
				error: response.error,
			};
		},
		loadChangeBoardFileDiff: async (workspacePath, input) => {
			const { change, cwd, rawWorkspacePath } = await resolveChangeWorkspace(workspacePath, input);
			if (!change) {
				return {
					ok: false,
					changeId: input.id,
					version: makeVersion(null, null, rawWorkspacePath),
					scope: input.scope,
					path: input.path,
					file: null,
					error: `Change not found: ${input.id}`,
				};
			}
			if (!cwd) {
				return {
					ok: true,
					changeId: change.id,
					version: makeVersion(change, null, rawWorkspacePath),
					scope: input.scope,
					path: input.path,
					file: null,
					error: "Change workspace has not been started.",
				};
			}

			const workspaceHead = await readWorkspaceHead(cwd).catch(() => null);
			if (input.scope === "all") {
				const changes = await getWorkspaceChanges(cwd);
				const file = changes.files.find((candidate) => candidate.path === input.path) ?? null;
				return {
					ok: file !== null,
					changeId: change.id,
					version: makeVersion(change, workspaceHead, rawWorkspacePath),
					scope: input.scope,
					path: input.path,
					file,
					error: file ? undefined : `File not found: ${input.path}`,
				};
			}

			const response = await getCommitDiff({ cwd, commitHash: input.scope.commitHash });
			const file = response.files.find((candidate) => candidate.path === input.path) ?? null;
			const workspaceFile = file
				? ({
						path: file.path,
						previousPath: file.previousPath,
						status: file.status,
						additions: file.additions,
						deletions: file.deletions,
						oldText: null,
						newText: null,
					} satisfies RuntimeWorkspaceFileChange)
				: null;
			return {
				ok: response.ok && file !== null,
				changeId: change.id,
				version: makeVersion(change, workspaceHead, rawWorkspacePath),
				scope: input.scope,
				path: input.path,
				file: workspaceFile,
				patch: file?.patch,
				error: file ? response.error : (response.error ?? `File not found: ${input.path}`),
			};
		},
		initProject: async (workspacePath) => {
			if (!deps.changeyardApi) {
				throw new Error("Changeyard init is not available in this runtime.");
			}
			return await deps.changeyardApi.initProject(workspacePath);
		},
		updateProject: async (workspacePath) => {
			if (!deps.changeyardApi) {
				throw new Error("Changeyard update is not available in this runtime.");
			}
			return await deps.changeyardApi.updateProject(workspacePath);
		},
		getProjectConfig: async (workspacePath) => {
			if (!deps.changeyardApi) {
				throw new Error("Changeyard project config is not available in this runtime.");
			}
			return await deps.changeyardApi.getProjectConfig(workspacePath);
		},
		updateProjectConfig: async (workspacePath, input) => {
			if (!deps.changeyardApi) {
				throw new Error("Changeyard project config updates are not available in this runtime.");
			}
			return await deps.changeyardApi.updateProjectConfig(workspacePath, input);
		},
		doctorProject: async (workspacePath) => {
			if (!deps.changeyardApi) {
				throw new Error("Changeyard doctor is not available in this runtime.");
			}
			return await deps.changeyardApi.doctorProject(workspacePath);
		},
	};
}
