import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Resolve the changeyard repo root from a module under src/ or dist/src/. */
export function repoRootFromModule(fromModuleUrl: URL | string): string {
  const file = fileURLToPath(fromModuleUrl);
  if (file.includes(`${path.sep}dist${path.sep}`)) {
    return path.resolve(path.dirname(file), "../../..");
  }
  return path.resolve(path.dirname(file), "../..");
}

export function repoFileUrl(fromModuleUrl: URL | string, ...segments: string[]): URL {
  return pathToFileURL(path.join(repoRootFromModule(fromModuleUrl), ...segments));
}
