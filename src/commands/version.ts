import { readFileSync } from "node:fs";
import path from "node:path";
import { repoRootFromModule } from "../dev/paths.js";

export function getVersion(fromModuleUrl: string | URL = import.meta.url): string {
  const packagePath = path.join(repoRootFromModule(fromModuleUrl), "package.json");
  const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as { version?: unknown };
  if (typeof packageJson.version !== "string" || packageJson.version.trim() === "") {
    throw new Error(`Changeyard version is missing from ${packagePath}`);
  }
  return packageJson.version;
}

export function runVersion(): string {
  return getVersion();
}
