import type {
	RuntimeChangeyardChangeDetail,
	RuntimeChangeyardChangeActionResponse,
	RuntimeChangeyardCompleteRequest,
	RuntimeChangeyardChangeCreateRequest,
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
} from "../core/api-contract.js";

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
	updateChangeBody: (
		workspacePath: string,
		input: RuntimeChangeyardChangeUpdateBodyRequest,
	) => Promise<RuntimeChangeyardChangeDetail>;
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
		updateChangeBody: async (workspacePath, input) => {
			if (!deps.changeyardApi) {
				throw new Error("Changeyard change updates are not available in this runtime.");
			}
			return await deps.changeyardApi.updateChangeBody(workspacePath, input);
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
