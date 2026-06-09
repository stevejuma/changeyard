import type { WorkspaceEngine } from "./WorkspaceEngine.js";
import { GitWorktreeEngine } from "./GitWorktreeEngine.js";
import { JjWorkspaceEngine } from "./JjWorkspaceEngine.js";
import { PlainCopyWorkspaceEngine } from "./PlainCopyWorkspaceEngine.js";

export {
  detectWorkspaceEngineName,
  detectWorkspaceRepositoryKind,
  hasWorkspaceRepository,
  resolveWorkspaceEngineNameFromRepositoryKind,
  createTaskWorkspace,
  deleteTaskWorkspace,
  readTaskWorkspaceHead,
  verifyTaskWorkspace,
  publishTaskWorkspace,
} from "./runtimeBridge.js";

export function createWorkspaceEngine(name: string): WorkspaceEngine {
  switch (name) {
    case "jj":
      return new JjWorkspaceEngine();
    case "git-worktree":
      return new GitWorktreeEngine();
    case "plain-copy":
      return new PlainCopyWorkspaceEngine();
    default:
      throw new Error(`Unsupported workspace engine: ${name}`);
  }
}
