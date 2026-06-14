import path from "node:path";
import { findRepoRoot, loadConfig } from "../config/loadConfig.js";
import { defaultConfig } from "../config/defaults.js";
import { isChangeyardInitialized } from "../config/localConfig.js";
import { listGlobalTemplateProfiles } from "../config/templateProfiles.js";
import { runTui } from "./tui.js";

export type ConfigOptions = {
  json?: boolean;
  project?: string;
  host?: string;
  port?: number | "auto";
  connect?: string;
  debug?: boolean;
};

export type ConfigJsonOutput = {
  project: {
    initialized: boolean;
    providerType: string;
    vcsEngine: string;
    vcsFallback: string;
    vcsTargetBranch: string | null;
    vcsAppliedStacks: string[];
    projectDefaultBase: string;
    planningDefaultProfile?: string;
    planningDefaultStrictness?: string;
    planningAllowQuickChanges?: boolean;
    planningQuickChangeCheckProfile?: string;
    checkProfiles: string[];
    templateProfiles: string[];
  };
  paths: {
    base: string;
    local: string;
    schema: string;
  };
};

function toConfigJson(repoRoot: string): ConfigJsonOutput {
  const storageRoot = defaultConfig.storage.root;
  const config = loadConfig(repoRoot);
  return {
    project: {
      initialized: isChangeyardInitialized(repoRoot),
      providerType: config.provider.type,
      vcsEngine: config.vcs.engine,
      vcsFallback: config.vcs.fallback,
      vcsTargetBranch: config.vcs.targetBranch ?? null,
      vcsAppliedStacks: config.vcs.appliedStacks ?? [],
      projectDefaultBase: config.project.defaultBase,
      planningDefaultProfile: config.planning?.defaultProfile,
      planningDefaultStrictness: config.planning?.defaultStrictness,
      planningAllowQuickChanges: config.planning?.allowQuickChanges,
      planningQuickChangeCheckProfile: config.planning?.quickChangeCheckProfile,
      checkProfiles: Object.keys(config.checks),
      templateProfiles: listGlobalTemplateProfiles(),
    },
    paths: {
      base: path.join(repoRoot, storageRoot, "config.jsonc"),
      local: path.join(repoRoot, storageRoot, "config.local.jsonc"),
      schema: path.join(repoRoot, storageRoot, "schema.json"),
    },
  };
}

export function getConfigJson(repoRoot: string): ConfigJsonOutput {
  if (!isChangeyardInitialized(repoRoot)) {
    throw new Error("Changeyard is not initialized. Run `cy init` first.");
  }
  return toConfigJson(repoRoot);
}

export async function runConfig(options: ConfigOptions = {}, cwd = process.cwd()): Promise<string | ConfigJsonOutput> {
  const repoRoot = findRepoRoot(options.project ?? cwd);
  if (!isChangeyardInitialized(repoRoot)) {
    throw new Error("Changeyard is not initialized. Run `cy init` first.");
  }

  if (options.json) {
    return getConfigJson(repoRoot);
  }

  return await runTui({
    mode: "config",
    connect: options.connect,
    debug: options.debug,
    host: options.host,
    port: options.port,
    project: options.project,
  }, cwd);
}
