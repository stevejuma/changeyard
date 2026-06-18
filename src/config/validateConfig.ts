import { ChangeyardError } from "../errors.js";
import type { ChangeyardConfig } from "../types.js";
import { configSchema } from "./schema.js";
import { validateJsonSchema } from "./schemaValidator.js";

export function validateConfig(config: ChangeyardConfig): void {
  const errors: string[] = validateJsonSchema(configSchema, config);
  if (!config.project.idPrefix) errors.push("project.idPrefix is required");
  if (!config.storage.root) errors.push("storage.root is required");
  if (!config.provider.type) errors.push("provider.type is required");
  if (!config.vcs.engine) errors.push("vcs.engine is required");
  if (!config.workspace.pathPattern.includes("{id}")) errors.push("workspace.pathPattern must include {id}");
  if (!Array.isArray(config.workspace.hydrate.copy)) errors.push("workspace.hydrate.copy must be an array");
  if (!Array.isArray(config.workspace.hydrate.neverCopy)) errors.push("workspace.hydrate.neverCopy must be an array");
  if (config.ui?.port !== undefined && config.ui.port !== "auto" && (!Number.isInteger(config.ui.port) || config.ui.port < 0)) {
    errors.push("ui.port must be a non-negative integer or \"auto\"");
  }
  if (config.doctor?.staleCompletedDays !== undefined && (!Number.isInteger(config.doctor.staleCompletedDays) || config.doctor.staleCompletedDays < 0)) {
    errors.push("doctor.staleCompletedDays must be a non-negative integer");
  }
  for (const [profile, commands] of Object.entries(config.checks)) {
    if (!Array.isArray(commands) || commands.some((command) => typeof command !== "string")) errors.push(`checks.${profile} must be an array of strings`);
  }
  if (["forgejo", "github", "gitlab"].includes(config.provider.type) && (!config.provider.owner || !config.provider.repo)) {
    errors.push(`${config.provider.type} provider requires provider.owner and provider.repo`);
  }
  if (config.provider.type === "forgejo" && !config.provider.baseUrl) {
    errors.push("Forgejo provider requires provider.baseUrl");
  }
  if (errors.length) throw new ChangeyardError("CONFIG_INVALID", errors.join("\n"));
}
