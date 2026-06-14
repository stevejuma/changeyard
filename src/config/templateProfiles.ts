import { readdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export function globalTemplateProfilesRoot(): string {
  return path.join(homedir(), ".changeyard", "templates");
}

export function listGlobalTemplateProfiles(root = globalTemplateProfilesRoot()): string[] {
  try {
    const profiles = readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
      if (entry.name.startsWith(".")) return [];
      if (entry.isDirectory()) return [entry.name];
      if (entry.isFile() && entry.name.endsWith(".md")) return [entry.name.slice(0, -3)];
      return [];
    });
    return [...new Set(profiles.map((profile) => profile.trim()).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}
