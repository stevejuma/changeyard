import { existsSync, mkdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { pathInsideComparable } from "./patterns.js";
import { shellCommandRunner, type CommandRunner } from "./commandRunner.js";
import type { CreateWorkspaceInput, VerifyWorkspaceInput, PublishWorkspaceInput, PublishWorkspaceResult, VerifyWorkspaceResult, WorkspaceEngine } from "./WorkspaceEngine.js";

export class JjWorkspaceEngine implements WorkspaceEngine {
  name = "jj";

  constructor(private run: CommandRunner = shellCommandRunner) {}

  create(input: CreateWorkspaceInput) {
    mkdirSync(path.dirname(input.workspacePath), { recursive: true });
    const targetRef = input.metadata.targetRef ?? "@";
    const seedDescription = input.metadata.seedDescription ?? `${input.metadata.changeId}: workspace`;
    this.run("jj", ["workspace", "add", "--name", input.metadata.name, "-r", targetRef, "-m", seedDescription, input.workspacePath], input.repoRoot);
    const workspaceCommitId = this.run("jj", ["log", "--ignore-working-copy", "--at-op=@", "-r", "@", "--no-graph", "-T", "commit_id"], input.workspacePath);
    const workspaceChangeId = this.run("jj", ["log", "--ignore-working-copy", "--at-op=@", "-r", "@", "--no-graph", "-T", "change_id.short()"], input.workspacePath);
    return {
      ...input.metadata,
      targetRef,
      seedDescription,
      workspaceChangeId,
      workspaceCommitId,
    };
  }

  verify(input: VerifyWorkspaceInput): VerifyWorkspaceResult {
    const errors: string[] = [];
    const expectedPath = path.resolve(input.metadata.path);
    const cwd = path.resolve(input.cwd);
    if (!existsSync(expectedPath)) errors.push(`Workspace path does not exist: ${expectedPath}`);
    if (!pathInsideComparable(cwd, expectedPath)) errors.push(`Current directory is not inside expected workspace: ${expectedPath}`);
    try {
      this.run("jj", ["workspace", "update-stale"], cwd);
      const root = this.run("jj", ["workspace", "root"], cwd);
      const resolvedExpected = existsSync(expectedPath) ? realpathSync(expectedPath) : expectedPath;
      const resolvedRoot = existsSync(root) ? realpathSync(root) : path.resolve(root);
      if (resolvedRoot !== resolvedExpected) errors.push(`jj workspace root mismatch: expected ${expectedPath}, got ${root}`);
      const list = this.run("jj", ["workspace", "list"], cwd);
      if (!list.includes(input.metadata.name)) errors.push(`jj workspace list does not include ${input.metadata.name}`);
      this.run("jj", ["status"], cwd);
      try {
        const conflicts = this.run("jj", ["resolve", "--list"], cwd);
        if (conflicts.trim()) errors.push("jj workspace reports conflicts");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes("No conflicts found")) throw error;
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
    return { valid: errors.length === 0, errors };
  }

  publish(input: PublishWorkspaceInput): PublishWorkspaceResult {
    this.run("jj", ["bookmark", "set", input.branch, "-r", "@"], input.cwd);
    this.run("jj", ["git", "push", "--bookmark", input.branch], input.cwd);
    return { branch: input.branch, remote: "origin" };
  }
}
