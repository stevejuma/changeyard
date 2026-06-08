import { existsSync } from "node:fs";
import path from "node:path";
import { pathInside } from "./patterns.js";
import { shellCommandRunner, type CommandRunner } from "./commandRunner.js";
import type { CreateWorkspaceInput, VerifyWorkspaceInput, PublishWorkspaceInput, PublishWorkspaceResult, VerifyWorkspaceResult, WorkspaceEngine } from "./WorkspaceEngine.js";

export class JjWorkspaceEngine implements WorkspaceEngine {
  name = "jj";

  constructor(private run: CommandRunner = shellCommandRunner) {}

  create(input: CreateWorkspaceInput) {
    this.run("jj", ["workspace", "add", "--name", input.metadata.name, input.workspacePath], input.repoRoot);
    return input.metadata;
  }

  verify(input: VerifyWorkspaceInput): VerifyWorkspaceResult {
    const errors: string[] = [];
    const expectedPath = path.resolve(input.metadata.path);
    const cwd = path.resolve(input.cwd);
    if (!existsSync(expectedPath)) errors.push(`Workspace path does not exist: ${expectedPath}`);
    if (!pathInside(cwd, expectedPath)) errors.push(`Current directory is not inside expected workspace: ${expectedPath}`);
    try {
      const root = this.run("jj", ["workspace", "root"], cwd);
      if (path.resolve(root) !== expectedPath) errors.push(`jj workspace root mismatch: expected ${expectedPath}, got ${root}`);
      const list = this.run("jj", ["workspace", "list"], cwd);
      if (!list.includes(input.metadata.name)) errors.push(`jj workspace list does not include ${input.metadata.name}`);
      const status = this.run("jj", ["status"], cwd);
      if (/conflict/i.test(status)) errors.push("jj workspace reports conflicts");
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
