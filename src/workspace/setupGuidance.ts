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

function packageJsonUsesElectron(workspacePath: string): boolean {
  try {
    const parsed = JSON.parse(readFileSync(path.join(workspacePath, "package.json"), "utf8")) as {
      dependencies?: Record<string, unknown>;
      devDependencies?: Record<string, unknown>;
      optionalDependencies?: Record<string, unknown>;
    };
    return Boolean(parsed.dependencies?.electron || parsed.devDependencies?.electron || parsed.optionalDependencies?.electron);
  } catch {
    return false;
  }
}

function electronBinaryExists(workspacePath: string): boolean {
  const candidates = [
    path.join(workspacePath, "node_modules", "electron", "dist", "electron"),
    path.join(workspacePath, "node_modules", "electron", "dist", "Electron.app"),
    path.join(workspacePath, "node_modules", "electron", "dist", "electron.exe"),
  ];
  return candidates.some((candidate) => existsSync(candidate));
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

export function electronSetupWarning(workspacePath: string): string | null {
  if (!packageJsonUsesElectron(workspacePath)) return null;
  if (!existsSync(path.join(workspacePath, "node_modules", "electron"))) return null;
  if (electronBinaryExists(workspacePath)) return null;
  return [
    "Electron binary missing: electron is installed but its runtime binary was not found.",
    `Setup: cd ${workspacePath} && ${suggestedInstallCommand(workspacePath)}`,
    "If the package manager cache already has Electron, configure workspace.hydrate.warmupCommand to run the project-specific binary repair.",
  ].join("\n");
}

export function workspaceSetupWarnings(workspacePath: string): string[] {
  return [dependencySetupWarning(workspacePath), electronSetupWarning(workspacePath)].filter((entry): entry is string => Boolean(entry));
}
