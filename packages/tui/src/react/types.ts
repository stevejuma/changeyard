import type {
  ChangeDetail,
  ChangeListItem,
  DoctorResponse,
  ProjectConfigResponse,
  RepositoryStatusResponse,
  RuntimeConfigResponse,
  TaskChatMessage,
  TaskSessionSummary,
  WorkspaceFileSearchMatch,
} from "../runtime-client";

export type ViewMode = "home" | "workspace" | "config";

export type SlashCommand = {
  name: string;
  description: string;
  run: (arg: string) => Promise<void> | void;
};

export type AutocompleteMode = "/" | "@" | null;

export type AutocompleteOption = {
  value: string;
  display: string;
  description?: string;
  file?: WorkspaceFileSearchMatch;
  command?: SlashCommand;
};

export type TuiState = {
  changes: ChangeListItem[];
  selected: ChangeListItem | null;
  detail: ChangeDetail | null;
  projectConfig: ProjectConfigResponse | null;
  runtimeConfig: RuntimeConfigResponse | null;
  repoStatus: RepositoryStatusResponse | null;
  doctor: DoctorResponse | null;
  runtimeHealthy: boolean;
  status: string;
  error: string | null;
  view: ViewMode;
  sessionSummary: TaskSessionSummary | null;
  sessionMessages: TaskChatMessage[];
};
