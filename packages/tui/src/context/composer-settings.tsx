import { createMemo, createSignal, onMount } from "solid-js";
import { createStore } from "solid-js/store";
import { createSimpleContext } from "./helper";
import { useKV } from "./kv";
import { useRuntime } from "./runtime";
import {
  createPresets,
  presetIndexFromArg,
  type CreatePreset,
} from "./app-state";
import type { ProjectConfigResponse, RuntimeAgentDefinition } from "../runtime-client";

function defaultPresetIndex(profile?: string): number {
  if (profile === "openspec-lite") return 1;
  return 0;
}

export const { use: useComposerSettings, provider: ComposerSettingsProvider } = createSimpleContext({
  name: "ComposerSettings",
  init: () => {
    const kv = useKV();
    const { client } = useRuntime();
    const [presetIndex, setPresetIndexSignal] = createSignal(
      typeof kv.get("create_preset") === "number" ? (kv.get("create_preset") as number) : 0,
    );
    const [runtime, setRuntime] = createStore({
      loaded: false,
      selectedAgentId: "claude" as string,
      agents: [] as RuntimeAgentDefinition[],
    });
    const [project, setProject] = createStore({
      loaded: false,
      config: null as ProjectConfigResponse | null,
    });

    async function refresh() {
      try {
        await client.selectCurrentWorkspace();
        const [runtimeConfig, projectConfig] = await Promise.all([
          client.getRuntimeConfig(),
          client.getProjectConfig(),
        ]);
        setRuntime({
          loaded: true,
          selectedAgentId: runtimeConfig.selectedAgentId,
          agents: runtimeConfig.agents,
        });
        setProject({ loaded: true, config: projectConfig });
        if (typeof kv.get("create_preset") !== "number") {
          setPresetIndexSignal(defaultPresetIndex(projectConfig.planningDefaultProfile));
        }
      } catch {
        setRuntime("loaded", true);
        setProject("loaded", true);
      }
    }

    onMount(() => {
      void refresh();
    });

    const preset = createMemo(() => createPresets[presetIndex()] ?? createPresets[0]);
    const selectedAgent = createMemo(() =>
      runtime.agents.find((agent) => agent.id === runtime.selectedAgentId) ?? null,
    );

    return {
      preset,
      presetIndex,
      cyclePreset(direction: 1 | -1) {
        const next = (presetIndex() + direction + createPresets.length) % createPresets.length;
        setPresetIndexSignal(next);
        kv.set("create_preset", next);
      },
      setPresetIndex(index: number) {
        const clamped = Math.max(0, Math.min(createPresets.length - 1, index));
        setPresetIndexSignal(clamped);
        kv.set("create_preset", clamped);
      },
      setPresetById(id: CreatePreset["id"]) {
        const index = presetIndexFromArg(id);
        setPresetIndexSignal(index);
        kv.set("create_preset", index);
      },
      runtime,
      selectedAgent,
      async setAgent(agentId: string) {
        const updated = await client.saveRuntimeConfig({ selectedAgentId: agentId });
        setRuntime({
          loaded: true,
          selectedAgentId: updated.selectedAgentId,
          agents: updated.agents,
        });
      },
      project,
      refresh,
      async refreshProjectConfig() {
        const projectConfig = await client.getProjectConfig();
        setProject({ loaded: true, config: projectConfig });
        return projectConfig;
      },
      async updateProvider(providerType: string) {
        const projectConfig = await client.updateProjectConfig({
          providerType: providerType as ProjectConfigResponse["providerType"],
        });
        setProject({ loaded: true, config: projectConfig });
        return projectConfig;
      },
      async updateVcs(
        vcsEngine: ProjectConfigResponse["vcsEngine"],
        vcsFallback?: ProjectConfigResponse["vcsFallback"],
      ) {
        const projectConfig = await client.updateProjectConfig({
          vcsEngine,
          ...(vcsFallback ? { vcsFallback } : {}),
        });
        setProject({ loaded: true, config: projectConfig });
        return projectConfig;
      },
      async updatePlanning(input: {
        defaultProfile?: "none" | "openspec-lite";
        defaultStrictness?: "normal" | "strict";
        allowQuickChanges?: boolean;
      }) {
        const projectConfig = await client.updateProjectConfig({
          planningDefaultProfile: input.defaultProfile,
          planningDefaultStrictness: input.defaultStrictness,
          planningAllowQuickChanges: input.allowQuickChanges,
        });
        setProject({ loaded: true, config: projectConfig });
        return projectConfig;
      },
      async updateDefaultBase(projectDefaultBase: string) {
        const projectConfig = await client.updateProjectConfig({ projectDefaultBase });
        setProject({ loaded: true, config: projectConfig });
        return projectConfig;
      },
      async initProject() {
        return await client.initProject();
      },
      async updateProject() {
        return await client.updateProject();
      },
      async doctorProject() {
        return await client.doctorProject();
      },
    };
  },
});
