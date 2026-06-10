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
    this.run("jj", ["workspace", "add", "--name", input.metadata.name, input.workspacePath], input.repoRoot);
    return input.metadata;
  }

  verify(input: VerifyWorkspaceInput): VerifyWorkspaceResult {
    const errors: string[] = [];
    const expectedPath = path.resolve(input.metadata.path);
    const cwd = path.resolve(input.cwd);
    if (!existsSync(expectedPath)) errors.push(`Workspace path does not exist: ${expectedPath}`);
    if (!pathInsideComparable(cwd, expectedPath)) errors.push(`Current directory is not inside expected workspace: ${expectedPath}`);
    try {
      const root = this.run("jj", ["workspace", "root"], cwd);
      const resolvedExpected = existsSync(expectedPath) ? realpathSync(expectedPath) : expectedPath;
      const resolvedRoot = existsSync(root) ? realpathSync(root) : path.resolve(root);
      if (resolvedRoot !== resolvedExpected) errors.push(`jj workspace root mismatch: expected ${expectedPath}, got ${root}`);
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
