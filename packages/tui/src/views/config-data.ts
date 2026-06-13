import type { ProjectConfigResponse } from "../runtime-client";
import { createPresets } from "../context/app-state";

export type ConfigTabId = "project" | "planning" | "agent" | "appearance" | "about";

export const CONFIG_TABS: Array<{ id: ConfigTabId; label: string }> = [
  { id: "project", label: "Project" },
  { id: "planning", label: "Planning" },
  { id: "agent", label: "Agent" },
  { id: "appearance", label: "Appearance" },
  { id: "about", label: "About" },
];

export const PROVIDER_OPTIONS = [
  { title: "noop", value: "noop", description: "Local-only, no remote sync" },
  { title: "local-folder", value: "local-folder", description: "Mirror issues in a local folder" },
  { title: "github", value: "github", description: "GitHub issues and pull requests" },
  { title: "gitlab", value: "gitlab", description: "GitLab issues and merge requests" },
  { title: "forgejo", value: "forgejo", description: "Forgejo / Gitea compatible host" },
] as const;

export const VCS_OPTIONS = [
  { title: "plain-copy", value: "plain-copy", description: "Copy workspace files without git metadata" },
  { title: "git-worktree", value: "git-worktree", description: "Isolated git worktree per change" },
  { title: "jj", value: "jj", description: "Jujutsu-based workspace isolation" },
] as const;

export const PLANNING_PROFILE_OPTIONS = [
  { title: "none", value: "none", description: "No planning gates" },
  { title: "openspec-lite", value: "openspec-lite", description: "OpenSpec-lite planning sections" },
] as const;

export const PLANNING_STRICTNESS_OPTIONS = [
  { title: "normal", value: "normal", description: "Standard planning gates" },
  { title: "strict", value: "strict", description: "Require clarifications, checklist, and analysis" },
] as const;

export type ConfigRowKind = "select" | "toggle" | "text" | "action" | "readonly";

export type ConfigRow = {
  id: string;
  label: string;
  value: string;
  description?: string;
  kind: ConfigRowKind;
  editable?: boolean;
};

export function resolveConfigTabId(value?: string): ConfigTabId {
  const normalized = value?.trim().toLowerCase();
  const match = CONFIG_TABS.find((tab) => tab.id === normalized);
  return match?.id ?? "project";
}

export function projectRows(config: ProjectConfigResponse | null): ConfigRow[] {
  return [
    {
      id: "provider",
      label: "Provider",
      value: config?.providerType ?? "noop",
      description: "Remote sync provider for issues and pull requests",
      kind: "select",
      editable: true,
    },
    {
      id: "vcs",
      label: "VCS engine",
      value: config?.vcsEngine ?? "plain-copy",
      description: "Workspace isolation strategy",
      kind: "select",
      editable: true,
    },
    {
      id: "default-base",
      label: "Default base",
      value: config?.projectDefaultBase ?? "main",
      description: "Default base branch for new changes",
      kind: "text",
      editable: true,
    },
  ];
}

export function planningRows(config: ProjectConfigResponse | null): ConfigRow[] {
  return [
    {
      id: "planning-profile",
      label: "Default profile",
      value: config?.planningDefaultProfile ?? "none",
      description: "Planning model applied to new changes",
      kind: "select",
      editable: true,
    },
    {
      id: "planning-strictness",
      label: "Default strictness",
      value: config?.planningDefaultStrictness ?? "normal",
      description: "Planning gate strictness for new changes",
      kind: "select",
      editable: true,
    },
    {
      id: "allow-quick-changes",
      label: "Allow quick changes",
      value: config?.planningAllowQuickChanges === false ? "off" : "on",
      description: "Permit low-risk quick change lane",
      kind: "toggle",
      editable: true,
    },
  ];
}

export function agentRows(selectedAgentId: string, agentLabel?: string): ConfigRow[] {
  return [
    {
      id: "selected-agent",
      label: "Launch agent",
      value: agentLabel ?? selectedAgentId,
      description: "Default agent for task launches",
      kind: "select",
      editable: true,
    },
  ];
}

export function appearanceRows(themeName: string, presetLabel: string): ConfigRow[] {
  return [
    {
      id: "theme",
      label: "Theme",
      value: themeName,
      description: "Terminal color theme",
      kind: "select",
      editable: true,
    },
    {
      id: "create-preset",
      label: "Create preset",
      value: presetLabel,
      description: "Default template when creating changes",
      kind: "select",
      editable: true,
    },
  ];
}

export function aboutRows(paths: { base: string; local: string; schema: string }): ConfigRow[] {
  return [
    {
      id: "path-base",
      label: "config.jsonc",
      value: paths.base,
      kind: "readonly",
      editable: false,
    },
    {
      id: "path-local",
      label: "config.local.jsonc",
      value: paths.local,
      kind: "readonly",
      editable: false,
    },
    {
      id: "path-schema",
      label: "schema.json",
      value: paths.schema,
      kind: "readonly",
      editable: false,
    },
    {
      id: "action-init",
      label: "Initialize Changeyard",
      value: "run cy init",
      description: "Scaffold .changeyard for this repository",
      kind: "action",
      editable: true,
    },
    {
      id: "action-update",
      label: "Update scaffold",
      value: "run cy update",
      description: "Refresh templates, skills, and slash commands",
      kind: "action",
      editable: true,
    },
    {
      id: "action-doctor",
      label: "Run doctor",
      value: "run cy doctor",
      description: "Inspect local Changeyard health",
      kind: "action",
      editable: true,
    },
  ];
}

export function rowsForTab(
  tab: ConfigTabId,
  input: {
    projectConfig: ProjectConfigResponse | null;
    selectedAgentId: string;
    selectedAgentLabel?: string;
    themeName: string;
    presetLabel: string;
    paths: { base: string; local: string; schema: string };
  },
): ConfigRow[] {
  switch (tab) {
    case "project":
      return projectRows(input.projectConfig);
    case "planning":
      return planningRows(input.projectConfig);
    case "agent":
      return agentRows(input.selectedAgentId, input.selectedAgentLabel);
    case "appearance":
      return appearanceRows(input.themeName, input.presetLabel);
    case "about":
      return aboutRows(input.paths);
  }
}

export function presetLabelFromIndex(index: number): string {
  return createPresets[index]?.label ?? createPresets[0].label;
}
