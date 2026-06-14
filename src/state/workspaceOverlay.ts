import { existsSync, readFileSync } from "node:fs";
import { parseFrontmatter } from "../documents/frontmatter.js";
import type { ParsedMarkdown, WorkspaceMetadata } from "../types.js";
import { resolveWorkspaceChangePath } from "../workspace/marker.js";

export type OverlayChangeDocument = ParsedMarkdown & {
  path: string;
  rootPath: string;
  source: "root" | "workspace";
  workspaceMetadata: WorkspaceMetadata | null;
};

export function readOverlayChangeDocument(rootPath: string, metadata: WorkspaceMetadata | null): OverlayChangeDocument {
  const workspacePath = metadata?.engine === "jj" ? resolveWorkspaceChangePath(metadata) : null;
  const activePath = workspacePath && existsSync(workspacePath) ? workspacePath : rootPath;
  const parsed = parseFrontmatter(readFileSync(activePath, "utf8"));
  return {
    ...parsed,
    path: activePath,
    rootPath,
    source: activePath === rootPath ? "root" : "workspace",
    workspaceMetadata: metadata,
  };
}
