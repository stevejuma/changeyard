import { scaffoldChangeyard } from "../scaffold/projectScaffold.js";

export type InitOptions = {
  dryRun?: boolean;
  tools?: string;
};

export function runInit(repoRoot = process.cwd(), options: InitOptions = {}): string {
  return scaffoldChangeyard(repoRoot, {
    mode: "init",
    dryRun: options.dryRun,
    tools: options.tools,
  }).message;
}
