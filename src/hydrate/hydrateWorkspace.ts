import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import type { ChangeyardConfig, WorkspaceMetadata } from "../types.js";
import { isDenied, pathInside } from "../workspace/patterns.js";

export type HydrateResult = {
  copied: string[];
  skipped: string[];
  metadataPath: string;
  warmup: {
    command: string | null;
    status: "skipped" | "passed" | "failed";
    exitCode: number | null;
    logPath: string | null;
  };
};

export function hydrateWorkspace(config: ChangeyardConfig, metadata: WorkspaceMetadata, options: { warmup?: boolean } = {}): HydrateResult {
  const copied: string[] = [];
  const skipped: string[] = [];
  for (const entry of config.workspace.hydrate.copy) {
    const source = path.resolve(metadata.repoRoot, entry);
    const relative = path.relative(metadata.repoRoot, source);
    if (!pathInside(source, metadata.repoRoot) || isDenied(relative, config.workspace.hydrate.neverCopy)) {
      skipped.push(entry);
      continue;
    }
    if (!existsSync(source)) {
      skipped.push(entry);
      continue;
    }
    const target = path.resolve(metadata.path, entry);
    if (!pathInside(target, metadata.path)) {
      skipped.push(entry);
      continue;
    }
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(source, target);
    copied.push(entry);
  }

  const metadataPath = path.resolve(metadata.path, ".changeyard-hydrate.json");
  const warmupCommand = config.workspace.hydrate.warmupCommand || config.workspace.hydrate.installCommand || "";
  const warmup: HydrateResult["warmup"] = {
    command: warmupCommand || null,
    status: "skipped",
    exitCode: null,
    logPath: null,
  };
  if (options.warmup && warmupCommand) {
    const logPath = path.resolve(metadata.repoRoot, config.storage.root, config.storage.workspacesDir, metadata.changeId, "logs", "hydrate.log");
    mkdirSync(path.dirname(logPath), { recursive: true });
    const result = spawnSync(warmupCommand, { cwd: metadata.path, shell: true, encoding: "utf8" });
    const logs = [
      `$ ${warmupCommand}`,
      result.stdout ?? "",
      result.stderr ?? "",
      `status: ${result.status === 0 ? "passed" : "failed"}${result.status === null ? "" : ` (${result.status})`}`,
    ].filter(Boolean);
    writeFileSync(logPath, `${logs.join("\n")}\n`);
    warmup.status = result.status === 0 ? "passed" : "failed";
    warmup.exitCode = result.status;
    warmup.logPath = logPath;
    if (warmup.status === "failed") {
      throw new Error(`Workspace warmup failed: ${warmupCommand}. Inspect ${logPath}.`);
    }
  }
  writeFileSync(metadataPath, `${JSON.stringify({ changeId: metadata.changeId, copied, skipped, warmup, hydratedAt: new Date().toISOString() }, null, 2)}\n`);
  return { copied, skipped, metadataPath, warmup };
}
