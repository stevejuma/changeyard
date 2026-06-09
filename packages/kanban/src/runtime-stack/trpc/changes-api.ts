import type {
	RuntimeChangeyardChangeDetail,
	RuntimeChangeyardChangeCreateRequest,
	RuntimeChangeyardChangeGetRequest,
	RuntimeChangeyardChangeUpdatePlanningSectionRequest,
	RuntimeChangeyardChangesListResponse,
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
	updatePlanningSection: (
		repoRoot: string,
		input: RuntimeChangeyardChangeUpdatePlanningSectionRequest,
	) => Promise<RuntimeChangeyardChangeDetail> | RuntimeChangeyardChangeDetail;
}

export interface RuntimeTrpcChangesApi {
	listChanges: (workspacePath: string) => Promise<RuntimeChangeyardChangesListResponse>;
	createChange: (workspacePath: string, input: RuntimeChangeyardChangeCreateRequest) => Promise<RuntimeChangeyardChangeDetail>;
	getChange: (workspacePath: string, input: RuntimeChangeyardChangeGetRequest) => Promise<RuntimeChangeyardChangeDetail | null>;
	validateChange: (workspacePath: string, input: RuntimeChangeyardChangeGetRequest) => Promise<RuntimeChangeyardChangeDetail>;
	syncChange: (workspacePath: string, input: RuntimeChangeyardChangeGetRequest) => Promise<RuntimeChangeyardChangeDetail>;
	startChange: (workspacePath: string, input: RuntimeChangeyardChangeGetRequest) => Promise<RuntimeChangeyardChangeDetail>;
	updatePlanningSection: (
		workspacePath: string,
		input: RuntimeChangeyardChangeUpdatePlanningSectionRequest,
	) => Promise<RuntimeChangeyardChangeDetail>;
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
		updatePlanningSection: async (workspacePath, input) => {
			if (!deps.changeyardApi) {
				throw new Error("Changeyard planning updates are not available in this runtime.");
			}
			return await deps.changeyardApi.updatePlanningSection(workspacePath, input);
		},
	};
}
