import type { WorkspaceMetadata } from "../types.js";
import { shellCommandRunner } from "./commandRunner.js";

export type JjLandingCommit = {
  changeId: string;
  commitId: string;
  firstLine: string;
};

export type JjLandingDescriptionValidation = {
  revset: string;
  commits: JjLandingCommit[];
  errors: string[];
};

const logTemplate = 'change_id.short() ++ "\\t" ++ commit_id.short() ++ "\\t" ++ description.first_line().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\tEND\\n"';

export function jjLandingRevset(baseCommitId: string | null | undefined, workspaceChangeId: string): string {
  return baseCommitId ? `(${baseCommitId}::${workspaceChangeId}) ~ ${baseCommitId}` : workspaceChangeId;
}

export function listJjLandingCommits(cwd: string, baseCommitId: string | null | undefined, workspaceChangeId: string): JjLandingCommit[] {
  const output = shellCommandRunner("jj", ["log", "--ignore-working-copy", "--at-op=@", "-r", jjLandingRevset(baseCommitId, workspaceChangeId), "--no-graph", "-T", logTemplate], cwd);
  if (!output.trim()) return [];

  return output.split(/\r?\n/).filter(Boolean).map((line) => {
    const parts = line.split("\t");
    if (parts[parts.length - 1] === "END") parts.pop();
    return {
      changeId: parts[0] ?? "unknown",
      commitId: parts[1] ?? "unknown",
      firstLine: parts.slice(2).join("\t"),
    };
  });
}

export function describeJjWorkspaceCommit(cwd: string, revision: string, description: string): void {
  shellCommandRunner("jj", ["describe", "-r", revision, "-m", description], cwd);
}

export function validateJjLandingDescriptions(changeId: string, metadata: WorkspaceMetadata, workspaceChangeId: string): JjLandingDescriptionValidation {
  const revset = jjLandingRevset(metadata.baseCommitId, workspaceChangeId);
  const commits = listJjLandingCommits(metadata.path, metadata.baseCommitId, workspaceChangeId);
  const prefix = `${changeId}:`;
  const errors = commits.flatMap((commit) => {
    const firstLine = commit.firstLine.trim();
    if (!firstLine || firstLine === "(no description set)") {
      return [`${commit.changeId} ${commit.commitId}: empty description; run cd ${metadata.path} && jj describe -r ${commit.changeId} -m "${prefix} <summary>"`];
    }
    if (!firstLine.startsWith(prefix)) {
      return [`${commit.changeId} ${commit.commitId}: description must start with "${prefix}"; current first line: "${firstLine}"; run cd ${metadata.path} && jj describe -r ${commit.changeId} -m "${prefix} <summary>"`];
    }
    return [];
  });

  return { revset, commits, errors };
}
