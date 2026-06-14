import type { ProjectConfigResponse, RuntimeAgentDefinition, RuntimeConfigResponse } from "../runtime-client";

export type SetupChecklistItem = {
  id: string;
  title: string;
  detail: string;
  status: "done" | "todo" | "optional";
  command: string;
};

export function buildSetupChecklist(input: {
  projectConfig: ProjectConfigResponse | null;
  runtimeConfig: Pick<RuntimeConfigResponse, "selectedAgentId" | "agents"> | null;
  selectedAgent: RuntimeAgentDefinition | null;
}): SetupChecklistItem[] {
  const project = input.projectConfig;
  const selectedAgent = input.selectedAgent;
  return [
    {
      id: "init",
      title: "Initialize project",
      detail: project?.initialized ? ".changeyard is available" : "scaffold .changeyard for this repository",
      status: project?.initialized ? "done" : "todo",
      command: "/init",
    },
    {
      id: "provider",
      title: "Choose provider",
      detail: project ? `current provider: ${project.providerType}` : "load provider configuration",
      status: project && project.providerType !== "noop" ? "done" : "optional",
      command: "/provider",
    },
    {
      id: "vcs",
      title: "Choose workspace engine",
      detail: project ? `engine ${project.vcsEngine}, fallback ${project.vcsFallback}` : "load VCS configuration",
      status: project ? "done" : "todo",
      command: "/vcs",
    },
    {
      id: "base",
      title: "Set default base",
      detail: project?.projectDefaultBase ? `base ${project.projectDefaultBase}` : "choose the branch/bookmark new work starts from",
      status: project?.projectDefaultBase ? "done" : "todo",
      command: "/config project",
    },
    {
      id: "planning",
      title: "Set planning defaults",
      detail: project
        ? `profile ${project.planningDefaultProfile ?? "none"}, strictness ${project.planningDefaultStrictness ?? "normal"}`
        : "load planning defaults",
      status: project ? "done" : "optional",
      command: "/config planning",
    },
    {
      id: "agent",
      title: "Configure agent",
      detail: selectedAgent
        ? `${selectedAgent.label}: ${selectedAgent.installed ? "installed" : "missing"}, ${selectedAgent.configured ? "configured" : "not configured"}`
        : `selected agent ${input.runtimeConfig?.selectedAgentId ?? "unknown"}`,
      status: selectedAgent?.installed && selectedAgent.configured ? "done" : "todo",
      command: "/agents",
    },
    {
      id: "doctor",
      title: "Run doctor",
      detail: "check local Changeyard health after setup changes",
      status: "optional",
      command: "/doctor",
    },
  ];
}
