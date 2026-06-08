import { existsSync, realpathSync } from "node:fs";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { pathInside } from "./patterns.js";
import { shellCommandRunner, type CommandRunner } from "./commandRunner.js";
import type { CreateWorkspaceInput, VerifyWorkspaceInput, PublishWorkspaceInput, PublishWorkspaceResult, VerifyWorkspaceResult, WorkspaceEngine } from "./WorkspaceEngine.js";

export class GitWorktreeEngine implements WorkspaceEngine {
  name = "git-worktree";

  constructor(private run: CommandRunner = shellCommandRunner) {}

  create(input: CreateWorkspaceInput) {
    const branch = input.metadata.branch ?? `cy/${input.metadata.changeId}`;
    mkdirSync(path.dirname(input.workspacePath), { recursive: true });
    this.run("git", ["worktree", "add", "-b", branch, input.workspacePath], input.repoRoot);
    return { ...input.metadata, branch };
  }

  verify(input: VerifyWorkspaceInput): VerifyWorkspaceResult {
    const errors: string[] = [];
    const expectedPath = path.resolve(input.metadata.path);
    const cwd = path.resolve(input.cwd);
    if (!existsSync(expectedPath)) errors.push(`Workspace path does not exist: ${expectedPath}`);
    if (!pathInside(cwd, expectedPath)) errors.push(`Current directory is not inside expected workspace: ${expectedPath}`);
    try {
      const root = this.run("git", ["rev-parse", "--show-toplevel"], cwd);
      const resolvedExpected = existsSync(expectedPath) ? realpathSync(expectedPath) : expectedPath;
      const resolvedRoot = existsSync(root) ? realpathSync(root) : path.resolve(root);
      if (resolvedRoot !== resolvedExpected) errors.push(`Git root mismatch: expected ${expectedPath}, got ${root}`);
      const status = this.run("git", ["status", "--porcelain"], expectedPath);
      if (status.includes("UU ")) errors.push("Git workspace has unresolved conflicts");
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
    return { valid: errors.length === 0, errors };
  }

  publish(input: PublishWorkspaceInput): PublishWorkspaceResult {
    this.run("git", ["push", "-u", "origin", input.branch], input.cwd);
    return { branch: input.branch, remote: "origin" };
  }
}
