import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { isDenied, pathInside, pathInsideComparable } from "./patterns.js";
import type { CreateWorkspaceInput, VerifyWorkspaceInput, PublishWorkspaceInput, PublishWorkspaceResult, VerifyWorkspaceResult, WorkspaceEngine } from "./WorkspaceEngine.js";

function copyDirectory(sourceRoot: string, targetRoot: string, shouldCopy: (source: string) => boolean): void {
  mkdirSync(targetRoot, { recursive: true });
  for (const entry of readdirSync(sourceRoot)) {
    const source = path.join(sourceRoot, entry);
    if (!shouldCopy(source)) continue;
    const target = path.join(targetRoot, entry);
    const stats = statSync(source);
    if (stats.isDirectory()) {
      copyDirectory(source, target, shouldCopy);
    } else if (stats.isFile()) {
      mkdirSync(path.dirname(target), { recursive: true });
      copyFileSync(source, target);
    }
  }
}

export class PlainCopyWorkspaceEngine implements WorkspaceEngine {
  name = "plain-copy";

  create(input: CreateWorkspaceInput) {
    mkdirSync(input.workspacePath, { recursive: true });
    const excludedRoots = [
      path.join(input.repoRoot, ".git"),
      path.join(input.repoRoot, ".jj"),
      path.join(input.repoRoot, ".changeyard", "workspaces"),
      path.join(input.repoRoot, ".changeyard", "cache"),
      input.workspacePath,
    ].map((entry) => path.resolve(entry));

    copyDirectory(input.repoRoot, input.workspacePath, (source) => {
      const resolved = path.resolve(source);
      const relative = path.relative(input.repoRoot, resolved);
      return !excludedRoots.some((excludedRoot) => resolved === excludedRoot || pathInside(resolved, excludedRoot)) && !isDenied(relative, input.neverCopy);
    });

    return input.metadata;
  }

  verify(input: VerifyWorkspaceInput): VerifyWorkspaceResult {
    const errors: string[] = [];
    const expectedPath = path.resolve(input.metadata.path);
    const cwd = path.resolve(input.cwd);
    if (!existsSync(expectedPath)) errors.push(`Workspace path does not exist: ${expectedPath}`);
    if (!pathInsideComparable(cwd, expectedPath)) errors.push(`Current directory is not inside expected workspace: ${expectedPath}`);
    return { valid: errors.length === 0, errors };
  }

  publish(input: PublishWorkspaceInput): PublishWorkspaceResult {
    return { branch: input.branch, remote: null };
  }
}
