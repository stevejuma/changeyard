import type { WorkspaceMetadata } from "../types.js";

export type CreateWorkspaceInput = {
  repoRoot: string;
  workspacePath: string;
  metadata: WorkspaceMetadata;
  neverCopy: string[];
};

export type VerifyWorkspaceInput = {
  cwd: string;
  metadata: WorkspaceMetadata;
};

export type VerifyWorkspaceResult = {
  valid: boolean;
  errors: string[];
};

export type PublishWorkspaceInput = {
  cwd: string;
  metadata: WorkspaceMetadata;
  branch: string;
};

export type PublishWorkspaceResult = {
  branch: string;
  remote: string | null;
};

export interface WorkspaceEngine {
  name: string;
  create(input: CreateWorkspaceInput): WorkspaceMetadata;
  verify(input: VerifyWorkspaceInput): VerifyWorkspaceResult;
  publish(input: PublishWorkspaceInput): PublishWorkspaceResult;
}
