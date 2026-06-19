import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function packageManagerFromPackageJson(workspacePath: string): string | null {
  try {
    const parsed = JSON.parse(readFileSync(path.join(workspacePath, "package.json"), "utf8")) as { packageManager?: unknown };
    return typeof parsed.packageManager === "string" ? parsed.packageManager : null;
  } catch {
    return null;
  }
}

export function suggestedInstallCommand(workspacePath: string): string {
  const packageManager = packageManagerFromPackageJson(workspacePath);
  if (packageManager?.startsWith("pnpm@") || existsSync(path.join(workspacePath, "pnpm-lock.yaml"))) return "pnpm install --offline";
  if (packageManager?.startsWith("yarn@") || existsSync(path.join(workspacePath, "yarn.lock"))) return "yarn install --immutable";
  if (packageManager?.startsWith("bun@") || existsSync(path.join(workspacePath, "bun.lockb")) || existsSync(path.join(workspacePath, "bun.lock"))) return "bun install";
  return "pnpm install --offline";
}

export function dependencySetupWarning(workspacePath: string): string | null {
  if (!existsSync(path.join(workspacePath, "package.json"))) return null;
  if (existsSync(path.join(workspacePath, "node_modules"))) return null;
  return [
    "Workspace dependencies missing: package.json exists but node_modules is absent.",
    `Setup: cd ${workspacePath} && ${suggestedInstallCommand(workspacePath)}`,
    "Or configure workspace.hydrate.warmupCommand and run with --warmup.",
  ].join("\n");
}
