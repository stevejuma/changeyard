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

export type ViewMode = "home" | "chat";
export type UiMode = "plan" | "act";
export type StatusControl = "plan" | "act" | "profile";

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

export type ChatEntry =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "status"; text: string }
  | { kind: "error"; text: string };

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
  chatEntries: ChatEntry[];
  sessionSummary: TaskSessionSummary | null;
  sessionMessages: TaskChatMessage[];
};
