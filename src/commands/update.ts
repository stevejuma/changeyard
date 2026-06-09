import { scaffoldChangeyard } from "../scaffold/projectScaffold.js";

export type UpdateOptions = {
  dryRun?: boolean;
  tools?: string;
};

export function runUpdate(repoRoot = process.cwd(), options: UpdateOptions = {}): string {
  return scaffoldChangeyard(repoRoot, {
    mode: "update",
    dryRun: options.dryRun,
    tools: options.tools,
  }).message;
}
